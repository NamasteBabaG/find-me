import { z } from 'zod';
/** One paid answer containing every required inspection. No automatic second question. */
export const SINGLE_VISUAL_REVIEW_VERSION = 'single-sol-low/v1' as const;
const shape = z.object({ version: z.literal(SINGLE_VISUAL_REVIEW_VERSION), assessment: z.record(z.unknown()),
  continuity: z.record(z.unknown()), doubt: z.boolean(), doubtReason: z.string().min(12).max(400).nullable() }).strict()
  .refine(v => v.doubt ? v.doubtReason !== null : v.doubtReason === null);
export function readSingleVisualReview(raw: string | null) {
  const text = raw?.trim() ?? '', body = text.match(/^\x60\x60\x60(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n\x60\x60\x60$/i)?.[1] ?? text;
  try { const result = shape.safeParse(JSON.parse(body)); return result.success ? {
    assessment: JSON.stringify(result.data.assessment), continuity: JSON.stringify(result.data.continuity),
    doubt: result.data.doubt, doubtReason: result.data.doubtReason } : null; } catch { return null; }
}
