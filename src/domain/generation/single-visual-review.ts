import { z } from 'zod';
/** One paid answer containing every required inspection. No automatic second question. */
export const SINGLE_VISUAL_REVIEW_VERSION = 'single-sol-low/v1' as const;
/** Explicit prospective MEDIUM request; historical LOW documents keep their version. */
export const SINGLE_MEDIUM_VISUAL_REVIEW_VERSION = 'single-sol-medium/v1' as const;
export type SingleVisualReviewVersion = typeof SINGLE_VISUAL_REVIEW_VERSION | typeof SINGLE_MEDIUM_VISUAL_REVIEW_VERSION;
export const isSingleVisualReviewVersion = (value: unknown): value is SingleVisualReviewVersion =>
  value === SINGLE_VISUAL_REVIEW_VERSION || value === SINGLE_MEDIUM_VISUAL_REVIEW_VERSION;
export const singleVisualReviewEffort = (version: SingleVisualReviewVersion) =>
  version === SINGLE_MEDIUM_VISUAL_REVIEW_VERSION ? 'medium' as const : 'low' as const;
const shape = z.object({ version: z.enum([SINGLE_VISUAL_REVIEW_VERSION, SINGLE_MEDIUM_VISUAL_REVIEW_VERSION]), assessment: z.record(z.string(), z.unknown()),
  continuity: z.record(z.string(), z.unknown()), doubt: z.boolean(), doubtReason: z.string().min(12).max(400).nullable(), head: z.record(z.string(), z.unknown()).optional() }).strict()
  .refine(v=>v.version===SINGLE_MEDIUM_VISUAL_REVIEW_VERSION||v.head===undefined)
  .refine(v => v.doubt ? v.doubtReason !== null : v.doubtReason === null);
function readEnvelope(raw: string | null) {
  const text = raw?.trim() ?? '', body = text.match(/^\x60\x60\x60(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n\x60\x60\x60$/i)?.[1] ?? text;
  try { const result = shape.safeParse(JSON.parse(body)); return result.success ? {
    version: result.data.version, assessment: JSON.stringify(result.data.assessment), continuity: JSON.stringify(result.data.continuity),
    doubt: result.data.doubt, doubtReason: result.data.doubtReason } : null; } catch { return null; }
}
export function readSingleVisualReviewVersion(raw: string | null) { return readEnvelope(raw)?.version ?? null; }
export function readSingleVisualReview(raw: string | null) {
  const parsed = readEnvelope(raw); if (!parsed) return null;
  const { version: _version, ...reading } = parsed; return reading;
}
