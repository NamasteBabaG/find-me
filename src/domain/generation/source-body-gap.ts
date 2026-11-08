import { createHash } from 'node:crypto';
import { z } from 'zod';
import { SOURCE_BODY_REPAIR_MANIFEST } from '../../../content/detectives/source-body-repair';
import { sourceBodyAlpha, sourceBodyEntrySchema, type SourceBodyGeometry } from '../scene/source-body-repair';

export const SOURCE_BODY_GAP_VERSION = 'source-body-gap-fill/v1' as const;
export const SOURCE_BODY_GAP_ACTION = 'generation:source-body-gap-fill/v1';
export const bodyGapHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const digest = z.string().regex(/^[a-f0-9]{64}$/), key = z.string().min(1).max(240).regex(/^[A-Za-z0-9_:.-]+$/);
export const sourceBodyGapSchema = z.object({
  version: z.literal(SOURCE_BODY_GAP_VERSION), auditId: z.string().regex(/^aud_body_gap_[a-f0-9]{40}$/),
  gameId: key, rowId: key, hideId: key, attempts: z.number().int().min(1).max(3),
  authoritySha256: digest, baselineReceiptSha256: digest, baselineAssetId: key, baselineImageSha256: digest,
  sourceRequestKey: key, sourceFingerprint: digest, sourcePayloadSha256: digest, normalizedRawSha256: digest,
  sourcePngSha256: digest, geometrySha256: digest, identitySha256: digest, candidateSha256: digest,
}).strict();
export type SourceBodyGap = z.infer<typeof sourceBodyGapSchema>;
export const bodyGapAuditId = (m: Omit<SourceBodyGap, 'auditId'>) => 'aud_body_gap_' + bodyGapHash(m).slice(0, 40);

/** The missing lower-right cell of this existing PUBLIC source footprint.
 * No generated image, subject measurement or customer identifier authors it.
 * The original from-birth mask and every paid question remain unchanged. */
export function sourceBodyGapAuthority(g: SourceBodyGeometry) {
  const original = SOURCE_BODY_REPAIR_MANIFEST.entries.find(e => e.hideId === 'paris-detectives-hide-1');
  if (!original || bodyGapHash(sourceBodyEntrySchema.parse(g)) !== bodyGapHash(sourceBodyEntrySchema.parse(original))) return null;
  const [body, side] = g.editableRects;
  if (!body || !side || g.editableRects.length !== 2 || g.editablePolygons.length) return null;
  const rect = { left: body.left + body.width, top: side.top + side.height,
    width: side.left + side.width - body.left - body.width,
    height: body.top + body.height - side.top - side.height };
  if (rect.width <= 0 || rect.height <= 0 || rect.left < g.returnRect.left + 12 || rect.top < g.returnRect.top + 12
    || rect.left + rect.width > g.returnRect.left + g.returnRect.width - 12
    || rect.top + rect.height > g.returnRect.top + g.returnRect.height - 12) return null;
  const alpha = sourceBodyAlpha(g);
  for (let y = rect.top; y < rect.top + rect.height; y++) for (let x = rect.left; x < rect.left + rect.width; x++)
    if (alpha[y * 512 + x] || g.protectedRects.some(p => inside(p, x, y)) || inside(g.child, x, y)) return null;
  return { version: SOURCE_BODY_GAP_VERSION, geometrySha256: bodyGapHash(sourceBodyEntrySchema.parse(g)), rect };
}
const inside = (r: { left: number; top: number; width: number; height: number }, x: number, y: number) =>
  x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height;
export function composeSourceBodyGap(g: SourceBodyGeometry, raw: Uint8Array, baseline: Uint8Array) {
  const authority = sourceBodyGapAuthority(g);
  if (!authority || raw.length !== 512 * 768 * 4 || baseline.length !== raw.length) throw Error('BODY_GAP: bound native RGBA source footprint required');
  const pixels = new Uint8Array(baseline), r = authority.rect;
  let changedPixels = 0;
  for (let y = r.top; y < r.top + r.height; y++) for (let x = r.left; x < r.left + r.width; x++) {
    const i = (y * 512 + x) * 4;
    if ([0, 1, 2, 3].some(c => pixels[i + c] !== raw[i + c])) changedPixels++;
    for (let c = 0; c < 4; c++) pixels[i + c] = raw[i + c]!;
  }
  return { pixels, proof: { version: SOURCE_BODY_GAP_VERSION, rect: r, changedPixels,
    outsideGapChangedPixels: 0 as const, protectedChangedPixels: 0 as const, childEnvelopeChangedPixels: 0 as const } };
}
export function sourceBodyGapCandidate(row: { id: string; status: string; attempts: number; assetId: string | null; judgeJson: string | null }) {
  try {
    const j = JSON.parse(row.judgeJson ?? 'null'), v = j?.verdict, b = j?.sourceBodyBirth;
    return row.status === 'FAILED' && !!row.assetId && row.attempts >= 1 && row.attempts <= 3
      && j?.hide === 'paris-detectives-hide-1' && j.sourceBodyGapFill === undefined
      && ['sourceFigureReturn', 'crownTab', 'headPixelCorrection', 'retainedNormalHead', 'crownReturn', 'authoredRecovery', 'propJoinCorrection'].every(k => j[k] === undefined)
      && b?.rowId === row.id && b.attempt === row.attempts && b.hideId === j.hide
      && j.reviewState === 'board-review-complete' && j.wireFault === null
      && j.boardReview?.dual?.single === 'single-sol-medium/v1' && v?.verdict === 'fail'
      && v.childComplete === 'pass' && v.childOnlyOnce === 'pass' && v.faceLikeness === 'pass'
      && v.faceReadable === 'pass' && v.ageAppropriate === 'pass' && v.neighborsIntact === 'pass'
      && v.scaleRight === 'pass' && v.styleMatch === 'pass'
      && Array.isArray(v.faults) && v.faults.length > 0
      && v.faults.every((f: { check?: string }) => f.check === 'pictureWhole' || f.check === 'severeSeam');
  } catch { return false; }
}
export function sourceBodyGapReviewDirection() {
  return 'SOURCE BODY GAP ' + SOURCE_BODY_GAP_VERSION + ': SHIPPING restores a fixed background cell inside the original returned frame from the same already-paid RAW. '
    + 'The original body, head and protected neighboring people are unchanged by this correction. The previous source mask and paid answer are historical evidence, not approval. '
    + 'Independently inspect the entire new SHIPPING, all joins, source neighbors, age, identity, size, pose, sharpness and complete head. Any visible remnant, stripe, blur or damaged person still fails.';
}
