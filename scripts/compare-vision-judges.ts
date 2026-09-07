/** Offline, bounded model comparison. No image generation, catalog or live-model writes.
 * Prepare a frozen plan first. --run is explicit; --resume retrieves saved response IDs,
 * never repeats a POST. Missing usage/transport ambiguity retains the full reservation.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { envKey } from './slot-patch';

export const ARMS = {
  'sol-high': { model: 'gpt-5.6-sol', effort: 'high', input: 4, cached: .4, write: 5, output: 20 },
  'sol-medium': { model: 'gpt-5.6-sol', effort: 'medium', input: 4, cached: .4, write: 5, output: 20 },
  '55-high': { model: 'gpt-5.5-2026-04-23', effort: 'high', input: 5, cached: .5, write: 5, output: 30 },
  '55-medium': { model: 'gpt-5.5-2026-04-23', effort: 'medium', input: 5, cached: .5, write: 5, output: 30 },
} as const;
type Arm = keyof typeof ARMS;
export const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
const save = (file: string, data: unknown) => writeFileSync(file, JSON.stringify(data, null, 2), { flag: 'wx' });
type Cell = { id: string; arm: Arm; suite: string; requestFile: string; requestSha256: string; maxInputTokens: number };

export function usageCost(arm: Arm, usage: any) {
  const r = ARMS[arm];
  const input = usage?.input_tokens, output = usage?.output_tokens;
  const cached = usage?.input_tokens_details?.cached_tokens ?? 0;
  const writes = usage?.input_tokens_details?.cache_write_tokens ?? 0;
  if (![input, output, cached, writes].every(x => Number.isSafeInteger(x) && x >= 0) || cached + writes > input) {
    throw Error('Invalid or missing usage; retain reservation');
  }
  return {
    usageBasedUsd: ((input - cached - writes) * r.input + cached * r.cached + writes * r.write + output * r.output) / 1e6,
    noCacheUsd: (input * r.input + output * r.output) / 1e6,
    upperBoundUsd: (input * Math.max(r.input, r.write) + output * r.output) / 1e6,
  };
}
export function validateRequest(cell: Cell, request: any) {
  if (!(cell.arm in ARMS) || !/^[a-z0-9-]+$/.test(cell.id)) throw Error('Invalid arm/id');
  const arm = ARMS[cell.arm];
  if (request.model !== arm.model || request.reasoning?.effort !== arm.effort) throw Error('Pinned model/effort mismatch');
  if (request.tools?.length || request.previous_response_id || request.conversation) throw Error('No tools or conversation carryover');
  if (request.service_tier && request.service_tier !== 'default') throw Error('Standard pricing only');
  if (!Number.isSafeInteger(request.max_output_tokens) || request.max_output_tokens <= 0 || request.max_output_tokens > 16000) throw Error('Output cap required');
  if (!Number.isSafeInteger(cell.maxInputTokens) || cell.maxInputTokens <= 0 || cell.maxInputTokens > 40000) throw Error('Input allowance required');
  const images = request.input?.flatMap((m: any) => m.content ?? []).filter((p: any) => p.type === 'input_image') ?? [];
  if (!images.length || images.some((p: any) => !/^data:image\/(png|jpeg);base64,/.test(p.image_url) || p.detail !== 'high')) throw Error('Frozen high-detail inline evidence required');
  if (!request.text?.format?.strict || request.text.format.type !== 'json_schema') throw Error('Strict structured output required');
  return (cell.maxInputTokens * Math.max(arm.input, arm.write) + request.max_output_tokens * arm.output) / 1e6;
}

export function responseAnomalies(request: any, response: any): string[] {
  const anomalies: string[] = [];
  if (response.usage?.output_tokens > request.max_output_tokens) anomalies.push('reported_output_exceeds_requested_cap');
  const text = response.output?.some((o: any) => o.content?.some((c: any) => c.type === 'output_text' && c.text?.length));
  if (text && response.usage?.output_tokens_details?.reasoning_tokens >= response.usage?.output_tokens) anomalies.push('visible_text_but_all_output_reported_as_reasoning');
  if (response.service_tier && response.service_tier !== 'default') anomalies.push('unexpected_service_tier');
  return anomalies;
}

async function main() {
  const arg = (key: string) => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3);
  const root = path.resolve(arg('root') ?? 'output/model-comparison-20260907');
  const planFile = path.join(root, 'plan.json');
  const planBytes = readFileSync(planFile), plan = JSON.parse(planBytes.toString());
  if (plan.capUsd !== 5 || plan.version !== 1) throw Error('This approved round is capped at $5');
  const calls = path.join(root, 'calls'); mkdirSync(calls, { recursive: true });
  const lock = path.join(root, 'run.lock');
  // Exclusive run lock; deliberately retained after crashes for explicit recovery.
  if (existsSync(lock)) throw Error('Existing runner lock: inspect process before recovering');
  save(lock, { pid: process.pid, createdAt: new Date().toISOString(), planSha256: sha(planBytes) });
  const accounted = () => readdirSync(calls).reduce((sum, name) => {
    const dir = path.join(calls, name);
    if (existsSync(path.join(dir, 'cost.json'))) return sum + read(path.join(dir, 'cost.json')).upperBoundUsd;
    if (existsSync(path.join(dir, 'reservation.json'))) return sum + read(path.join(dir, 'reservation.json')).reserveUsd;
    return sum;
  }, 0);
  const key = envKey('OPENAI_API_KEY'); if (!key) throw Error('Existing authorized key missing');
  let halted = false;
  async function execute(cell: Cell) {
    const requestBytes = readFileSync(path.resolve(root, cell.requestFile));
    if (sha(requestBytes) !== cell.requestSha256) throw Error('Frozen request drift');
    const request = JSON.parse(requestBytes.toString());
    const reserveUsd = validateRequest(cell, request);
    const dir = path.join(calls, cell.id);
    if (existsSync(path.join(dir, 'result.json'))) return;
    let response: any;
    const started = Date.now();
    if (existsSync(dir)) {
      if (!process.argv.includes('--resume')) throw Error('Existing cell: explicit --resume required; never repeat POST');
      const reservation = read(path.join(dir, 'reservation.json'));
      if (reservation.requestSha256 !== sha(requestBytes) || reservation.planSha256 !== sha(planBytes)) throw Error('Resume evidence drift');
      const startFile = path.join(dir, 'start-response.json');
      if (!existsSync(startFile)) throw Error('Ambiguous POST without response ID: charge retained, no retry');
      response = read(startFile);
    } else {
      if (!process.argv.includes('--run')) throw Error('Use --run for a paid comparison');
      if (accounted() + reserveUsd > plan.capUsd + 1e-10) throw Error('Budget guard stopped before POST');
      mkdirSync(dir);
      save(path.join(dir, 'reservation.json'), {
        reserveUsd, capUsd: plan.capUsd, accountedBeforeUsd: accounted(), model: request.model,
        effort: request.reasoning.effort, requestSha256: sha(requestBytes), planSha256: sha(planBytes),
        scriptSha256: sha(readFileSync(__filename)), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
        startedAt: new Date().toISOString(), maxInputTokens: cell.maxInputTokens, maxOutputTokens: request.max_output_tokens,
      });
      const http = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: requestBytes, signal: AbortSignal.timeout(60000),
      });
      const raw = await http.text();
      writeFileSync(path.join(dir, 'start-response.raw.json'), raw, { flag: 'wx' });
      save(path.join(dir, 'start-http.json'), { status: http.status, requestId: http.headers.get('x-request-id'), elapsedMs: Date.now() - started });
      response = JSON.parse(raw); save(path.join(dir, 'start-response.json'), response);
      if (!http.ok) throw Error(`HTTP ${http.status}; no automatic retry, reservation retained`);
    }
    let n = readdirSync(dir).filter(f => /^poll-\d+.json$/.test(f)).length;
    while (['queued', 'in_progress'].includes(response.status)) {
      if (!/^resp_[a-zA-Z0-9]+$/.test(response.id) || n >= 100) throw Error('Retrieve saved response ID later; never repurchase');
      await new Promise(resolve => setTimeout(resolve, 15000));
      const http = await fetch(`https://api.openai.com/v1/responses/${response.id}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60000) });
      const raw = await http.text();
      writeFileSync(path.join(dir, `poll-${String(++n).padStart(3, '0')}.json`), raw, { flag: 'wx' });
      save(path.join(dir, `poll-${n}-http.json`), { status: http.status, requestId: http.headers.get('x-request-id'), observedAt: new Date().toISOString() });
      if (!http.ok) throw Error(`GET ${http.status}; saved POST remains retrievable`);
      response = JSON.parse(raw);
    }
    save(path.join(dir, 'response.json'), response);
    const costs = usageCost(cell.arm, response.usage);
    const anomalies = responseAnomalies(request, response);
    save(path.join(dir, 'cost.json'), { ...costs, usage: response.usage, model: response.model, costUnknown: false, usageAnomalies: anomalies, exactInvoiceCostKnown: false, elapsedMs: Date.now() - started });
    if (response.model !== request.model || costs.upperBoundUsd > reserveUsd || response.usage.input_tokens > cell.maxInputTokens || response.usage.output_tokens > request.max_output_tokens || anomalies.includes('unexpected_service_tier') || response.status !== 'completed') throw Error('Model/budget/token/completion mismatch; stop round');
    const text = response.output.flatMap((o: any) => o.content ?? []).filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('');
    const result = JSON.parse(text);
    if (cell.suite === 'slots') {
      const expected = ['paris/1', 'paris/2', 'paris/3', 'greatwall/1', 'greatwall/2', 'greatwall/3'];
      if (result.results?.length !== 6 || new Set(result.results.map((r: any) => r.id)).size !== 6 || result.results.some((r: any) => !expected.includes(r.id))) throw Error('Invalid slot result IDs');
    }
    save(path.join(dir, 'result.json'), result);
    console.log(JSON.stringify({ id: cell.id, usageBasedUsd: costs.usageBasedUsd, upperBoundUsd: costs.upperBoundUsd, accountedUsd: accounted(), elapsedMs: Date.now() - started }));
  }
  try {
    const excluded = (arg('exclude-arm') ?? '').split(',').filter(Boolean);
    if (excluded.some(a => !(a in ARMS))) throw Error('Unknown excluded arm');
    const cells: Cell[] = plan.cells.filter((c: Cell) => (!arg('suite') || c.suite === arg('suite')) && !excluded.includes(c.arm));
    let cursor = 0;
    await Promise.all([0, 1].map(async () => {
      while (!halted && cursor < cells.length) {
        const cell = cells[cursor++]!;
        try { await execute(cell); } catch (e) { halted = true; console.error(`${cell.id}: ${(e as Error).message}`); process.exitCode = 1; }
      }
    }));
    console.log(JSON.stringify({ completeSelectedCells: !halted, excludedArms: excluded, accountedUsd: accounted(), capUsd: plan.capUsd }));
  } finally {
    // Only our small explicit lock file; no recursive cleanup or evidence deletion.
    const { unlinkSync } = await import('node:fs'); unlinkSync(lock);
  }
}
if (/compare-vision-judges\.(ts|js)$/.test(path.basename(process.argv[1] ?? ''))) main().catch(e => { console.error(e.message); process.exitCode = 1; });
