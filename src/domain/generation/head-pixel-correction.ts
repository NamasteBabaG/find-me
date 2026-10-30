import { z } from 'zod';
import { LOCAL_PATCH_RETURN_FEATHER } from '../scene/local-patch-return-region';
import { RETAINED_NORMAL_HEAD_VERSION, retainedNormalHeadSchema } from './retained-normal-head';

/** A free correction of an already-paid normal composition inside its SAME return:
 * the paid answer's located head region keeps the paid painting's pixels opaque,
 * instead of being feathered into the original scene. No new painting, no warp,
 * scale, blur, source replacement or window growth; it is a candidate for a fresh
 * ordinary review, never an approval, and never a segmentation of the child. */
export const HEAD_PIXEL_CORRECTION_VERSION = 'head-pixel-correction/v1' as const;
export const HEAD_PIXEL_CORRECTION_ACTION = 'local-patch:head-pixel-correction';
/** The refusal it answers, exactly as the measured head check writes it. */
export const MEASURED_HEAD_FADE_REASON = 'HEAD_RETURN: measured target crown pixels fade into the original scene at the return edge';
/** The located head must leave at least this many rows/columns of return outside
 * it, so the edge ramp starts low (<= 0.5/3.5) instead of jumping. */
export const HEAD_PIXEL_CORRECTION_MIN_GAP = 3;

const digest = z.string().regex(/^[a-f0-9]{64}$/), key = z.string().min(1).max(240).regex(/^[A-Za-z0-9_:.-]+$/);
const rect = z.object({ left: z.number().int().nonnegative(), top: z.number().int().nonnegative(),
  width: z.number().int().positive(), height: z.number().int().positive() }).strict().refine(r => r.left + r.width <= 512 && r.top + r.height <= 768);
export const headPixelCorrectionSchema = z.object({ version: z.literal(HEAD_PIXEL_CORRECTION_VERSION), auditId: z.string().regex(/^aud_head_pixels_[a-f0-9]{40}$/),
  sourceRequestKey: key, sourceFingerprint: digest, sourcePayloadSha256: digest, normalizedRawSha256: digest,
  /** The alias chain of the baseline, kept verbatim; its own audit still binds the baseline image. */
  alias: z.object({ retainedNormalHead: retainedNormalHeadSchema }).strict().optional(),
  baselineAssetId: key, baselineShippingSha256: digest, baselineGeometrySha256: digest, boardArtSha256: digest,
  returned: rect, heads: z.array(rect).min(1).max(2), band: z.literal(LOCAL_PATCH_RETURN_FEATHER),
  headAnswer: z.object({ requestKey: key, fingerprint: digest, rawSha256: digest }).strict(),
  candidateSha256: digest, geometrySha256: digest, identitySha256: digest }).strict()
  .refine(m => m.alias === undefined || m.alias.retainedNormalHead.version === RETAINED_NORMAL_HEAD_VERSION && m.alias.retainedNormalHead.shippingSha256 === m.baselineShippingSha256,
    'The alias chain must bind the baseline image');
export type HeadPixelCorrection = z.infer<typeof headPixelCorrectionSchema>;
type Rect = { left: number; top: number; width: number; height: number };
export type CorrectionPixels = { readonly data: Uint8Array; readonly width: number; readonly height: number; readonly channels: number };

const object = (v: unknown): Record<string, unknown> | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const depth = (r: Rect, x: number, y: number) => Math.min(x - r.left, y - r.top, r.left + r.width - 1 - x, r.top + r.height - 1 - y);
const inside = (r: Rect, x: number, y: number) => x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height;
const gapOf = (r: Rect, h: Rect) => Math.min(h.left - r.left, h.top - r.top, r.left + r.width - h.left - h.width, r.top + r.height - h.top - h.height);
/** The composition's own weight for one returned pixel (blendLocalPatch). */
const baseWeight = (d: number, band: number) => Math.min(1, (d + 0.5) / band);
/** Euclidean distance from a pixel centre to the union of located head boxes. */
const headDistance = (heads: readonly Rect[], x: number, y: number) => Math.min(...heads.map(h => {
  const dx = Math.max(h.left - x, 0, x - (h.left + h.width - 1)), dy = Math.max(h.top - y, 0, y - (h.top + h.height - 1));
  return Math.hypot(dx, dy);
}));
/** Corrected weight: 1 on the located head, a linear ramp from the return edge to
 * the head, and the original weight wherever that is already larger, which it is
 * from ~band px away from the head on. Zero outside the return. */
export function headPixelCorrectionWeight(returned: Rect, heads: readonly Rect[], x: number, y: number, band = LOCAL_PATCH_RETURN_FEATHER) {
  if (!inside(returned, x, y)) return 0;
  const d = depth(returned, x, y), base = baseWeight(d, band);
  if (base >= 1) return 1;
  const e = headDistance(heads, x, y);
  return Math.max(base, (d + 0.5) / (d + e + 0.5));
}

/** Scheduling only: a normal composition whose ONLY refusal is the measured head
 * fade, with complete passing crowns located inside its return. The service still
 * authenticates every paid byte, alias, answer, source and owner before acting. */
export function headPixelCorrectionCandidate(row: { status: string; assetId?: string | null; judgeJson?: string | null } | undefined): boolean {
  if (!row || row.status !== 'FAILED' || !row.assetId) return false;
  try {
    const j = object(JSON.parse(row.judgeJson ?? 'null')), state = object(j?.selfRepair), verdict = object(j?.verdict);
    const proof = object(object(j?.boardReview)?.dual), quality = object(proof?.quality), head = object(quality?.headEvidence);
    if (!j || j.reviewState !== 'board-review-complete' || j.headPixelCorrection !== undefined || proof?.single !== 'single-sol-medium/v1'
      || state && !['awaiting-review', 'rejected'].includes(String(state.phase))
      || !['bounded-return/v3-head-safe-axis', 'bounded-return/v4-authored-source-boundaries'].includes(String(j.compositionVersion))
      || ['authoredRecovery', 'crownReturn', 'propJoinCorrection', 'sourceBodyRepair', 'sourceBodyBirth', 'wholeSourceContext', 'headSourceVersion', 'foreground']
        .some(field => j[field] !== undefined)
      || head?.version !== 'target-head-return/v2-visible-completeness' || head.retention === undefined
      || verdict?.verdict !== 'fail' || !Array.isArray(verdict.faults) || !verdict.faults.length
      || !verdict.faults.every(f => object(f)?.where === MEASURED_HEAD_FADE_REASON)) return false;
    const answer = object(object(JSON.parse(String(quality?.raw ?? 'null').trim().replace(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i, '$1')))?.head);
    const returned = rect.safeParse(head.returned), heads = [answer?.rawHead, answer?.shippingHead].map(h => rect.safeParse(h));
    return answer?.rawCrown === 'pass' && answer.shippingCrown === 'pass' && returned.success && heads.every(h => h.success)
      && heads.every(h => gapOf(returned.data, h.data!) >= HEAD_PIXEL_CORRECTION_MIN_GAP);
  } catch { return false; }
}

/** Pure pixels, crop-local and aligned: RAW, the original scene crop and the shipped
 * baseline. The baseline must be EXACTLY the ordinary composition of this RAW over
 * this scene in this return (outside unchanged, inside the 12px feather blend), or
 * nothing is corrected. Returns the corrected RGBA pixels and the changed count. */
export function composeHeadPixelCorrection(input: { raw: CorrectionPixels; scene: CorrectionPixels; baseline: CorrectionPixels;
  returned: Rect; heads: readonly Rect[]; band?: number }) {
  const { raw, scene, baseline, returned, heads } = input, band = input.band ?? LOCAL_PATCH_RETURN_FEATHER, w = baseline.width, h = baseline.height;
  if (![raw, scene].every(p => p.width === w && p.height === h) || ![raw, scene, baseline].every(p => p.channels === 4 && p.data.length === w * h * 4)
    || returned.left < 0 || returned.top < 0 || returned.left + returned.width > w || returned.top + returned.height > h
    || !heads.length || heads.some(head => gapOf(returned, head) < HEAD_PIXEL_CORRECTION_MIN_GAP))
    throw Error('HEAD_PIXELS: aligned RGBA crop pixels and a located head inside its return are required');
  const out = new Uint8Array(baseline.data);
  let changed = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y * w + x) * 4, inReturn = inside(returned, x, y), base = inReturn ? baseWeight(depth(returned, x, y), band) : 0;
    for (let c = 0; c < 4; c++) {
      const expected = c === 3 || !inReturn ? scene.data[p + c]! : Math.round(raw.data[p + c]! * base + scene.data[p + c]! * (1 - base));
      if (baseline.data[p + c] !== expected) throw Error('HEAD_PIXELS: the baseline is not the ordinary composition of this RAW over this scene');
    }
    if (!inReturn || base >= 1) continue;
    const corrected = headPixelCorrectionWeight(returned, heads, x, y, band);
    if (corrected <= base) continue;
    let moved = false;
    for (let c = 0; c < 3; c++) {
      const value = Math.round(raw.data[p + c]! * corrected + scene.data[p + c]! * (1 - corrected));
      if (value !== out[p + c]) { out[p + c] = value; moved = true; }
    }
    if (moved) changed++;
  }
  return { pixels: out, changed };
}
