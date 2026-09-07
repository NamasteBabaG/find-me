import { describe, it, expect } from 'vitest';
import { ARMS, usageCost, validateRequest, responseAnomalies } from '../../../scripts/compare-vision-judges';
const cell = { id: 'patch-01-sol-high', arm: 'sol-high' as const, suite: 'patches', requestFile: 'fixture.json', requestSha256: 'fixture', maxInputTokens: 12000 };
const request = () => ({ model: String(ARMS['sol-high'].model), reasoning: { effort: 'high' }, max_output_tokens: 8000,
  input: [{ role: 'user', content: [{ type: 'input_image', image_url: 'data:image/png;base64,AA==', detail: 'high' }] }],
  text: { format: { type: 'json_schema', strict: true } },
});
describe('offline comparison safeguards and accounting', () => {
  it('uses identical token prices at HIGH and MEDIUM, counting reasoning in output once', () => {
    const u = { input_tokens: 8428, output_tokens: 12583, output_tokens_details: { reasoning_tokens: 11280 } };
    expect(usageCost('sol-high', u)).toEqual(usageCost('sol-medium', u));
    expect(usageCost('sol-high', u).usageBasedUsd).toBeCloseTo(.285372, 9);
    expect(usageCost('sol-high', u).upperBoundUsd).toBeCloseTo(.2938, 9);
  });
  it('separates cache reads, writes and regular input instead of assuming a discount', () => {
    const u = { input_tokens: 1000, output_tokens: 500, input_tokens_details: { cached_tokens: 200, cache_write_tokens: 300 } };
    expect(usageCost('sol-medium', u).usageBasedUsd).toBeCloseTo(.01358, 9);
    expect(usageCost('sol-medium', u).noCacheUsd).toBe(.014);
    expect(usageCost('55-medium', { input_tokens: 1000, output_tokens: 500 }).usageBasedUsd).toBe(.02);
  });
  it('rejects missing, negative, noninteger or inconsistent usage', () => {
    for (const u of [undefined, {}, { input_tokens: -1, output_tokens: 1 }, { input_tokens: 1.1, output_tokens: 1 }, { input_tokens: 10, output_tokens: 1, input_tokens_details: { cached_tokens: 11 } }]) expect(() => usageCost('sol-high', u)).toThrow();
  });
  it('reserves maximum input and output costs before a request', () => {
    expect(validateRequest(cell, request())).toBeCloseTo(.22, 9);
  });
  it('prevents a substituted model, changed effort, external images or priority pricing', () => {
    const r = request(); r.model = 'gpt-6-astra'; expect(() => validateRequest(cell, r)).toThrow('Pinned');
    const effort = request(); effort.reasoning.effort = 'medium'; expect(() => validateRequest(cell, effort)).toThrow('Pinned');
    const remote = request(); remote.input[0]!.content[0]!.image_url = 'https://example.com/mutable.png'; expect(() => validateRequest(cell, remote)).toThrow('Frozen');
    expect(() => validateRequest(cell, { ...request(), service_tier: 'priority' })).toThrow('Standard');
    expect(() => validateRequest(cell, { ...request(), tools: [{ type: 'web_search' }] })).toThrow('No tools');
  });
  it('flags the observed 5.5 usage/cap anomaly instead of silently treating it as normal', () => {
    const r = { usage: { output_tokens: 19410, output_tokens_details: { reasoning_tokens: 19410 } }, output: [{ content: [{ type: 'output_text', text: 'visible answer' }] }] };
    expect(responseAnomalies({ max_output_tokens: 16000 }, r)).toEqual(['reported_output_exceeds_requested_cap', 'visible_text_but_all_output_reported_as_reasoning']);
    expect(responseAnomalies({ max_output_tokens: 16000 }, { ...r, usage: { output_tokens: 5000, output_tokens_details: { reasoning_tokens: 4000 } } })).toEqual([]);
  });
});
