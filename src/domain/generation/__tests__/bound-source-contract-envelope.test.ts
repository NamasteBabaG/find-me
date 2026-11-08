import { describe, expect, it } from 'vitest';
import { readQuestionBoundSourceContractEnvelope } from '../bound-source-contract-envelope';
import { readQuestionBoundSourceNeighborEnvelope } from '../bound-source-neighbor-envelope';
import { readSourceNeighborQualityBundle } from '../source-neighbor-quality-bundle';
import { prepareSourceNeighborContract } from '../../scene/local-patch-source-neighbors';

const contract = { version: 'source-neighbor-contract/v1', boardId: 'synthetic', hideId: 'synthetic-hide',
  source: { art: 'public/scenes/synthetic/base.webp', sha256: 'a'.repeat(64), width: 1000, height: 1000 },
  crop: { left: 100, top: 100, width: 512, height: 768 }, returnRect: { left: 30, top: 30, width: 430, height: 650 },
  neighbors: [{ sourceId: 'source-person', head: { left: 160, top: 160, width: 70, height: 90 } }] };
const { version: _version, neighbors: _neighbors, ...context } = contract;
const prepared = prepareSourceNeighborContract(contract, context);
if (!prepared.ok) throw Error('Synthetic contract must validate');
const expected = { contract, binding: { version: 'quality-source-neighbor-answer/v1', policy: 'local-patch-source-neighbor/v1',
  reader: 'source-neighbor-read/v1', contractSha256: prepared.contractSha256, candidateSha256: 'b'.repeat(64) } };
function document(echo = 'c'.repeat(66)) { return { version: 'quality-source-neighbor-answer/v1',
  assessment: { hides: [{ hideId: 'synthetic-hide', evidenceIds: ['synthetic-before', 'synthetic-after'],
    verdict: { childComplete: 'fail', verdict: 'fail', faults: [{ check: 'childComplete', where: 'A real arm remains visibly disconnected.' }] } }] },
  sourceNeighbors: { version: 'source-neighbor-answer/v1', contractSha256: echo, candidateSha256: 'b'.repeat(64),
    neighbors: [{ sourceId: 'source-person', outcome: 'preserved', status: 'pass', remnants: 'none', occluder: null,
      after: [{ ref: 'person-after', rect: { left: 160, top: 160, width: 70, height: 90 } }],
      observation: 'One complete source person remains at the same position.' }] } }; }
const read = (value: unknown) => readQuestionBoundSourceContractEnvelope(JSON.stringify(value), expected);

describe('separately named question-bound malformed contract echo', () => {
  it.each([1, 55, 65, 66, 128])('reads only the %i-character malformed echo while preserving the exact assessment and provider bytes', length => {
    const value = document('c'.repeat(length)), raw = JSON.stringify(value), frozen = structuredClone(value);
    expect(readSourceNeighborQualityBundle(raw, expected).ok).toBe(false);
    expect(readQuestionBoundSourceNeighborEnvelope(raw, expected)).toBeNull();
    const result = readQuestionBoundSourceContractEnvelope(raw, expected);
    expect(result?.ok).toBe(true);
    if (!result?.ok) throw Error('Expected versioned reading');
    expect(JSON.parse(result.assessment.raw)).toEqual(value.assessment);
    expect(result.sourceNeighbors.answer.contractSha256).toBe(expected.binding.contractSha256);
    expect(value).toEqual(frozen); expect(raw).toBe(JSON.stringify(frozen));
    expect(readSourceNeighborQualityBundle(raw, expected).ok).toBe(false);
  });
  it.each(['f'.repeat(64), prepared.contractSha256, '', 'G'.repeat(66), 'not-a-digest', 'a'.repeat(129)])('does not reinterpret a valid or non-hex echo: %s', echo => {
    expect(read(document(echo))).toBeNull();
  });
  it.each(['missing-contract', 'candidate-conflict', 'candidate-malformed', 'foreign-source', 'missing-source', 'outside-geometry', 'extra-field'] as const)(
    'preserves strict refusal for %s', problem => {
      const value = document(), n: Record<string, unknown> = value.sourceNeighbors;
      if (problem === 'missing-contract') delete n.contractSha256;
      if (problem === 'candidate-conflict') n.candidateSha256 = 'f'.repeat(64);
      if (problem === 'candidate-malformed') n.candidateSha256 = 'b'.repeat(65);
      if (problem === 'foreign-source') value.sourceNeighbors.neighbors[0]!.sourceId = 'foreign-person';
      if (problem === 'missing-source') value.sourceNeighbors.neighbors = [];
      if (problem === 'outside-geometry') value.sourceNeighbors.neighbors[0]!.after[0]!.rect.left = 990;
      if (problem === 'extra-field') n.extra = true;
      expect(read(value)).toBeNull();
    });
  it.each(['duplicate', 'fragment', 'remnants', 'unsure'] as const)('retains the semantic %s refusal independently of the contract echo', problem => {
    const value = document(), n = value.sourceNeighbors.neighbors[0]!;
    if (problem === 'duplicate') n.after.push({ ref: 'duplicate', rect: { left: 260, top: 160, width: 70, height: 90 } });
    if (problem === 'fragment') n.outcome = 'fragmented';
    if (problem === 'remnants') n.remnants = 'present';
    if (problem === 'unsure') n.status = 'unsure';
    const result = read(value);
    expect(result?.ok && result.sourceNeighbors.disposition).toBe(problem === 'unsure' ? 'unresolved' : 'repair');
  });
  it('requires the actual complete contract and a valid independently supplied binding', () => {
    const raw = JSON.stringify(document());
    expect(readQuestionBoundSourceContractEnvelope(raw, { ...expected, contract: { ...contract, hideId: 'foreign-hide' } })).toBeNull();
    expect(readQuestionBoundSourceContractEnvelope(raw, { ...expected, binding: { ...expected.binding, contractSha256: 'e'.repeat(64) } })).toBeNull();
    expect(readQuestionBoundSourceContractEnvelope(raw, { ...expected, binding: { ...expected.binding, candidateSha256: 'x'.repeat(64) } })).toBeNull();
  });
  it('refuses malformed or multiple documents, and keeps the candidate-only reader unchanged', () => {
    const raw = JSON.stringify(document());
    for (const value of [null, '', raw + raw, 'prefix ' + raw, raw + ' trailing', '```json\n' + raw])
      expect(readQuestionBoundSourceContractEnvelope(value, expected)).toBeNull();
    expect(readQuestionBoundSourceContractEnvelope('```json\n' + raw + '\n```', expected)?.ok).toBe(true);
    const candidateOnly = document(prepared.contractSha256); candidateOnly.sourceNeighbors.candidateSha256 = 'b'.repeat(65);
    expect(readQuestionBoundSourceContractEnvelope(JSON.stringify(candidateOnly), expected)).toBeNull();
    expect(readQuestionBoundSourceNeighborEnvelope(JSON.stringify(candidateOnly), expected)?.ok).toBe(true);
  });
});
