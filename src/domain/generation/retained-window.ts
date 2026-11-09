import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PatchRectangle } from '../scene/local-patch-return-region';

/** A new composition of paid pixels. This never changes an older return contract. */
export const RETAINED_WINDOW_VERSION = 'retained-source-window/v1' as const;
export const RETAINED_WINDOW_ACTION = 'generation:retained-source-window/v1' as const;
export function retainedWindowNeighborAlternateAllowed(input: { currentSourceKey: string; failedSourceKey: string; replacementSourceKey: string;
  reviewState: unknown; disposition: unknown; verdict: unknown; faults: unknown }) {
  const faults = input.faults;
  return input.currentSourceKey === input.failedSourceKey && input.replacementSourceKey !== input.failedSourceKey
    && input.reviewState === 'board-review-complete' && input.disposition === 'retry' && input.verdict === 'fail'
    && Array.isArray(faults) && faults.length === 2
    && ['pictureWhole', 'neighborsIntact'].every(x => faults.includes(x));
}
export const retainedWindowHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rectangle = z.object({ left: z.number().int().nonnegative(), top: z.number().int().nonnegative(),
  width: z.number().int().positive(), height: z.number().int().positive() }).strict();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/);
export const retainedWindowAuthoritySchema = z.object({
  version: z.literal(RETAINED_WINDOW_VERSION), sceneVersion: z.literal(13),
  family: z.enum(['kingdom-detectives/v1', 'journey-detectives/v1']), boardId: id, hideId: id,
  source: z.object({ art: z.string().regex(/^public\/scenes\/(?:[a-z0-9][a-z0-9._-]*\/)*[a-z0-9][a-z0-9._-]*\.(?:webp|png)$/),
    sha256: digest, width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
  crop: rectangle, parentChild: rectangle, parentReturn: rectangle, parentPlacementSha256: digest,
  targetSourceId: id, sourceHeads: z.array(z.object({ sourceId: id, head: rectangle }).strict()).min(1).max(8),
  frame: z.literal(12), feather: z.literal(12), maxRegistration: z.literal(3), maximumMeanDifference: z.literal(24),
}).strict();
export type RetainedWindowAuthority = z.infer<typeof retainedWindowAuthoritySchema>;
export type RetainedWindowPixels = { data: Uint8Array; width: number; height: number; channels: number };
/** JSONB object order is not an authority; array order and every value are. */
export function retainedWindowCanonicalHash(value: unknown): string {
  const ordered = (v: unknown): unknown => v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.map(ordered)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, ordered(x)])) : v;
  return retainedWindowHash(ordered(value));
}
export const retainedWindowMarkerSchema = z.object({ version: z.literal(RETAINED_WINDOW_VERSION),
  auditId: z.string().regex(/^aud_retained_window_[a-f0-9]{40}$/), gameId: id, rowId: id, hideId: id,
  attempts: z.number().int().min(1).max(8), authoritySha256: digest, manifestSha256: digest, parentSha256: digest,
  previousRowSha256: digest, originalRequestsSha256: digest, protectedRowsSha256: digest,
  sourceRequestKey: id.max(240), sourceFingerprint: digest, sourcePayloadSha256: digest,
  normalizedRawSha256: digest, sourcePngSha256: digest, candidateSha256: digest, geometrySha256: digest, identitySha256: digest,
  sampleX: z.number().int().min(-3).max(3), sampleY: z.number().int().min(-3).max(3),
}).strict();
export type RetainedWindowMarker = z.infer<typeof retainedWindowMarkerSchema>;
export const retainedWindowAuditId = (p: Omit<RetainedWindowMarker, 'auditId'>) => 'aud_retained_window_' + retainedWindowCanonicalHash(p).slice(0, 40);
/** The exact RAW-to-player mapping, without scaling, interpolation or sharpening.
 * Outside pixels are irrelevant to retention and stay original RAW pixels. */
export function alignRetainedWindowRaw(raw: RetainedWindowPixels, sampleX: number, sampleY: number): RetainedWindowPixels {
  checkPixels(raw);
  if (![sampleX, sampleY].every(v => Number.isInteger(v) && Math.abs(v) <= 3)) throw Error('RETAINED_WINDOW: invalid integer mapping');
  const data = new Uint8Array(raw.data);
  for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
    const rx = x + sampleX, ry = y + sampleY;
    if (rx >= 0 && rx < 512 && ry >= 0 && ry < 768)
      data.set(raw.data.subarray((ry * 512 + rx) * 4, (ry * 512 + rx) * 4 + 4), (y * 512 + x) * 4);
  }
  return { ...raw, data };
}

/** Bounded target measurement, not the entire repainted background. */
export function retainedWindowMeasurementBounds(a: RetainedWindowAuthority): PatchRectangle {
  assertRetainedWindowAuthority(a);
  const head = localHead(a, a.sourceHeads.find(h => h.sourceId === a.targetSourceId)!.head), child = a.parentChild;
  const left = Math.max(24, Math.min(child.left - 48, head.left - 48)), top = Math.max(24, Math.min(child.top - 112, head.top - 48));
  const right = Math.min(488, Math.max(child.left + child.width + 48, head.left + head.width + 48));
  const bottom = Math.min(744, Math.max(child.top + child.height + 64, head.top + head.height + 64));
  return { left, top, width: right - left, height: bottom - top };
}

export function retainedWindowReviewPrompt(a: RetainedWindowAuthority, sampleX: number, sampleY: number): string {
  assertRetainedWindowAuthority(a);
  return '\nRETAINED SOURCE WINDOW ' + RETAINED_WINDOW_VERSION + ': newly composed, UNAPPROVED shipping from the same already-paid RAW. '
    + 'The historical authored rectangle, registered source-neighbor contract.returnRect and repair plan are lineage/role registration, not the new outer boundary. The actual new join comparisons and compound permission below are authoritative for this composition. The new compound permission has a12px unchanged SOURCE frame,12px feather, and exact SOURCE holes protecting every registered head that crosses the new boundary. '
    + 'The registered original target is replaced WHOLE, not a person to preserve. Require its old head, hair, body and limbs to disappear completely, with no ghost or fragments. Other people may be preserved or cleanly replaced/removed whole as the ordinary source-neighbor policy allows. People continuing beyond the crop or permission must stay anatomically coherent. '
    + 'Native integer mapping: SHIPPING[x,y] takes RAW[x+' + sampleX + ',y+' + sampleY + '] in opaque paid regions; no scaling, interpolation, sharpening or facial restyling. The RAW evidence remains the authentic unshifted paid file. '
    + 'Compare the whole crown, face, full body, feet, pose, size and support against RAW and SOURCE. Inspect all four outer joins and the protected SOURCE-head holes. Reject cut or faded hair, residual source limbs, duplicate heads, seams, age/identity uncertainty, excessive sharpness, photographic texture, blur or a depth/style mismatch. '
    + 'No prior quality, identity, subject or head verdict transfers. Every ordinary MEDIUM field and doubt check remains blocking. '
    + 'RETAINED_WINDOW_PERMISSION: ' + JSON.stringify({ returned: retainedWindowRegion(a), targetSourceId: a.targetSourceId,
      protectedHeads: retainedWindowProtectedHeads(a), targetMeasurement: retainedWindowMeasurementBounds(a) });
}
const contained = (outer: PatchRectangle, inner: PatchRectangle) => inner.left >= outer.left && inner.top >= outer.top
  && inner.left + inner.width <= outer.left + outer.width && inner.top + inner.height <= outer.top + outer.height;
const localHead = (a: RetainedWindowAuthority, r: PatchRectangle): PatchRectangle => ({ ...r,
  left: r.left - a.crop.left, top: r.top - a.crop.top });
const distance = (r: PatchRectangle, x: number, y: number) => Math.max(r.left - x, x - (r.left + r.width - 1),
  r.top - y, y - (r.top + r.height - 1), 0);

export function retainedWindowRegion(a: RetainedWindowAuthority): PatchRectangle {
  return { left: a.frame, top: a.frame, width: 512 - 2 * a.frame, height: 768 - 2 * a.frame };
}
export function assertRetainedWindowAuthority(value: RetainedWindowAuthority): void {
  const a = retainedWindowAuthoritySchema.parse(value), board = { left: 0, top: 0, width: a.source.width, height: a.source.height };
  if (a.crop.width !== 512 || a.crop.height !== 768 || !contained(board, a.crop)
    || !contained({ left: 0, top: 0, width: 512, height: 768 }, a.parentChild)
    || !contained({ left: 0, top: 0, width: 512, height: 768 }, a.parentReturn)
    || new Set(a.sourceHeads.map(h => h.sourceId)).size !== a.sourceHeads.length)
    throw Error('RETAINED_WINDOW: invalid original source geometry');
  const target = a.sourceHeads.find(h => h.sourceId === a.targetSourceId);
  if (!target || a.sourceHeads.some(h => !contained(board, h.head))
    || !contained({ left: 24, top: 24, width: 464, height: 720 }, localHead(a, target.head)))
    throw Error('RETAINED_WINDOW: the replaced source head must be whole inside the new return');
}
/** Only people crossing the new boundary must stay at the exact SOURCE pixels.
 * The original target is explicitly replaced, never mistakenly preserved. */
export function retainedWindowProtectedHeads(a: RetainedWindowAuthority) {
  assertRetainedWindowAuthority(a);
  const r = retainedWindowRegion(a);
  return a.sourceHeads.filter(h => h.sourceId !== a.targetSourceId && !contained(r, localHead(a, h.head)))
    .map(h => ({ sourceId: h.sourceId, head: localHead(a, h.head) }));
}
export function retainedWindowHeadMask(a: RetainedWindowAuthority, sampleX: number, sampleY: number) {
  return { opaque: { left: 24, top: 24, width: 464, height: 720 }, sampleX, sampleY,
    excluded: retainedWindowProtectedHeads(a).map(h => {
      const left = Math.max(0, h.head.left - 6), top = Math.max(0, h.head.top - 6);
      return { left, top, width: Math.max(0, Math.min(512, h.head.left + h.head.width + 6) - left),
        height: Math.max(0, Math.min(768, h.head.top + h.head.height + 6) - top) };
    }).filter(r => r.width > 0 && r.height > 0) };
}
export function retainedWindowWeight(a: RetainedWindowAuthority, x: number, y: number): number {
  const edge = Math.min(x, y, 511 - x, 767 - y);
  let weight = Math.min(1, Math.max(0, (edge - a.frame + 0.5) / a.feather));
  // Keep a crossing SOURCE head entire, with a six-pixel transition outside it.
  for (const h of retainedWindowProtectedHeads(a)) weight = Math.min(weight, distance(h.head, x, y) / 6);
  return weight;
}
const checkPixels = (p: RetainedWindowPixels) => {
  if (p.width !== 512 || p.height !== 768 || p.channels !== 4 || p.data.length !== 512 * 768 * 4)
    throw Error('RETAINED_WINDOW: exact historical native RGBA crops required');
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] !== 255)
    throw Error('RETAINED_WINDOW: opaque original and paid image required');
};
type Registration = { sampleX: number; sampleY: number; meanDifference: number; zeroMeanDifference: number; points: number };
/** Registration uses protected SOURCE frame context only, never the new face.
 * Its integer offset is applied to pixels; it is not a zero-shift waiver. */
export function retainedWindowRegistration(a: RetainedWindowAuthority, scene: RetainedWindowPixels, raw: RetainedWindowPixels): Registration {
  assertRetainedWindowAuthority(a); checkPixels(scene); checkPixels(raw);
  const heads = a.sourceHeads.map(h => localHead(a, h.head)), points: [number, number][] = [];
  for (let y = 6; y < 762; y += 2) for (let x = 6; x < 506; x += 2) {
    if (!(x < 18 || x >= 494 || y < 18 || y >= 750) || heads.some(h => distance(h, x, y) < 12)) continue;
    points.push([x, y]);
  }
  if (points.length < 512) throw Error('RETAINED_WINDOW: insufficient unchanged frame context');
  const score = (dx: number, dy: number) => {
    let sum = 0;
    for (const [x, y] of points) {
      const i = (y * 512 + x) * 4, j = ((y + dy) * 512 + x + dx) * 4;
      for (let c = 0; c < 3; c++) sum += Math.abs(scene.data[i + c]! - raw.data[j + c]!);
    }
    return sum / (3 * points.length);
  };
  const zero = score(0, 0); let best = { x: 0, y: 0, mean: zero };
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const mean = score(dx, dy);
    if (mean < best.mean - 1e-9 || Math.abs(mean - best.mean) < 1e-9 && Math.hypot(dx, dy) < Math.hypot(best.x, best.y)) best = { x: dx, y: dy, mean };
  }
  if (zero - best.mean < 1.5) best = { x: 0, y: 0, mean: zero };
  if (!Number.isFinite(best.mean) || best.mean > 24) throw Error('RETAINED_WINDOW: registered frame exceeds unchanged 24 limit');
  // A claimed offset must actually make zero the best residual registration.
  const residual = score(best.x, best.y);
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    if (score(best.x + dx, best.y + dy) < residual - 1.5)
      throw Error('RETAINED_WINDOW: assembled frame still has a material registration error');
  }
  return { sampleX: best.x, sampleY: best.y, meanDifference: best.mean, zeroMeanDifference: zero, points: points.length };
}

/** Free composition only. No provider, scaling, artistic edit or quality verdict. */
export function composeRetainedWindow(input: { authority: RetainedWindowAuthority; scene: RetainedWindowPixels; raw: RetainedWindowPixels }) {
  const { authority: a, scene, raw } = input;
  assertRetainedWindowAuthority(a); checkPixels(scene); checkPixels(raw);
  const registration = retainedWindowRegistration(a, scene, raw), output = new Uint8Array(scene.data), protectedHeads = retainedWindowProtectedHeads(a);
  let paidPixels = 0, featherPixels = 0;
  const weights = new Float32Array(512 * 768);
  // Hoist validated SOURCE cores out of the pixel loop.
  for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
    const edge = Math.min(x, y, 511 - x, 767 - y);
    let w = Math.min(1, Math.max(0, (edge - a.frame + 0.5) / a.feather));
    for (const h of protectedHeads) w = Math.min(w, distance(h.head, x, y) / 6);
    weights[y * 512 + x] = w;
    if (!w) continue;
    const rx = x + registration.sampleX, ry = y + registration.sampleY;
    if (rx < 0 || rx >= 512 || ry < 0 || ry >= 768) throw Error('RETAINED_WINDOW: paid pixels missing inside permission');
    const i = (y * 512 + x) * 4, j = (ry * 512 + rx) * 4;
    for (let c = 0; c < 3; c++) output[i + c] = Math.round(raw.data[j + c]! * w + scene.data[i + c]! * (1 - w));
    output[i + 3] = 255;
    if (w === 1) paidPixels++; else featherPixels++;
  }
  for (const h of protectedHeads) for (let y = Math.max(0, h.head.top); y < Math.min(768, h.head.top + h.head.height); y++)
    for (let x = Math.max(0, h.head.left); x < Math.min(512, h.head.left + h.head.width); x++) {
      const i = (y * 512 + x) * 4;
      if ([0, 1, 2, 3].some(c => output[i + c] !== scene.data[i + c])) throw Error('RETAINED_WINDOW: crossing SOURCE head changed');
    }
  const targetHead = localHead(a, a.sourceHeads.find(h => h.sourceId === a.targetSourceId)!.head);
  for (let y = targetHead.top; y < targetHead.top + targetHead.height; y++) for (let x = targetHead.left; x < targetHead.left + targetHead.width; x++)
    if (weights[y * 512 + x] !== 1) throw Error('RETAINED_WINDOW: the old target head is not wholly replaced');
  return { pixels: { ...scene, data: output }, weights, proof: { version: RETAINED_WINDOW_VERSION, registration,
    appliedTranslation: { x: registration.sampleX ? -registration.sampleX : 0, y: registration.sampleY ? -registration.sampleY : 0 }, paidPixels, featherPixels,
    outsidePermissionChangedPixels: 0 as const, crossingSourceHeadChangedPixels: 0 as const } };
}
