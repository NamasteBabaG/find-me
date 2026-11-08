import { createHash } from 'node:crypto';
import { z } from 'zod';
import { KINGDOM_FIGURE_RETURNS } from '../../../content/detectives/kingdom/figure-return-v1';
import type { AuthoredLocalPatchReturnContract, PatchRectangle } from '../scene/local-patch-return-region';

export const SOURCE_FIGURE_RETURN_VERSION = 'source-figure-return/v1' as const;
export const SOURCE_FIGURE_GEOMETRY_VERSION = 'source-figure-geometry/v1' as const;
export const SOURCE_FIGURE_ACTION = 'generation:source-figure-return/v1';
export type SourceFigureAuthority = typeof KINGDOM_FIGURE_RETURNS[number];
export const sourceFigureHash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const same = (a: unknown, b: unknown) => sourceFigureHash(a) === sourceFigureHash(b);
export function sourceFigureAuthorityFor(parent: AuthoredLocalPatchReturnContract, returned: PatchRectangle): SourceFigureAuthority | null {
  if (!parent || !returned) return null;
  const a = KINGDOM_FIGURE_RETURNS.find(a => a.hideId === parent.hideId);
  return a && parent.contentVersion === a.sceneVersion && parent.boardId === a.boardId && same(parent.source, a.source)
    && same(parent.crop, a.crop) && same(parent.child, a.child) && same(parent.local, a.parentReturned)
    && parent.sourcePlacement?.basePlacementSha256 === a.parentPlacementSha256 && same(returned, a.baselineReturned) ? a : null;
}
export function assertSourceFigureAuthority(a: SourceFigureAuthority) {
  if (!KINGDOM_FIGURE_RETURNS.some(c => same(c, a))) throw Error('SOURCE_FIGURE: unknown public source permission');
}
const digest = z.string().regex(/^[a-f0-9]{64}$/), key = z.string().min(1).max(240).regex(/^[A-Za-z0-9_:.-]+$/);
export const sourceFigureReturnSchema = z.object({ version: z.literal(SOURCE_FIGURE_RETURN_VERSION),
  geometryVersion: z.literal(SOURCE_FIGURE_GEOMETRY_VERSION), auditId: z.string().regex(/^aud_source_figure_[a-f0-9]{40}$/),
  gameId: key, rowId: key, hideId: key, attempts: z.number().int().min(1).max(3), authoritySha256: digest,
  parentSha256: digest, baselineReceiptSha256: digest, sourceRequestKey: key, sourceFingerprint: digest, sourcePayloadSha256: digest,
  normalizedRawSha256: digest, sourcePngSha256: digest, baselineAssetId: key, baselineImageSha256: digest,
  baselineGeometrySha256: digest, candidateSha256: digest, geometrySha256: digest, identitySha256: digest,
}).strict();
export type SourceFigureReturn = z.infer<typeof sourceFigureReturnSchema>;
export const sourceFigureAuditId = (p: Omit<SourceFigureReturn, 'auditId'>) => 'aud_source_figure_' + sourceFigureHash([
  p.version, p.gameId, p.rowId, p.hideId, p.attempts, p.authoritySha256, p.sourcePayloadSha256, p.baselineReceiptSha256,
  p.baselineImageSha256, p.candidateSha256, p.geometrySha256, p.identitySha256,
]).slice(0, 40);

/** Bounding window for the native-head inspection. The real permission consists
 * of the unchanged baseline plus two additions with protected source cores; it
 * is not a claim that the entire bounding rectangle is editable or opaque. */
export function sourceFigureHeadWindow(a: SourceFigureAuthority): PatchRectangle {
  assertSourceFigureAuthority(a);
  const all = [a.baselineReturned, ...a.extensions.map(e => e.rect)];
  const left = Math.min(...all.map(r => r.left)), top = Math.min(...all.map(r => r.top));
  return { left, top, width: Math.max(...all.map(r => r.left + r.width)) - left,
    height: Math.max(...all.map(r => r.top + r.height)) - top };
}
/** Prospective evidence only; never append to a previously paid question. */
export function sourceFigureReviewPrompt(a: SourceFigureAuthority) {
  assertSourceFigureAuthority(a);
  return '\nWHOLE FIGURE SOURCE RETURN ' + SOURCE_FIGURE_RETURN_VERSION + ': these are the same already-paid RAW pixels in a newly composed, UNAPPROVED shipping. '
    + 'The old rectangle is a baseline, not the boundary of the whole child. Two fixed additions restore the crown and boots together. '
    + 'The bounding head-inspection rectangle is NOT an editable rectangle: source heads have protected holes. Inspect real hair, face, full body, both feet, clothing, every new join and natural depth against RAW and BEFORE. '
    + 'Require the replaced original target to disappear completely, including its old head and lower body. Preserve the original neighboring faces, crowns and their continuation beyond the crop. '
    + 'Only the specifically named lower loose hair may be naturally occluded by the target; never excuse a damaged face, crown, mask line, duplicate or ghost. '
    + 'Judge styleMatch from visible line detail, edge softness, local contrast, lighting and depth against nearby people at the same depth. Neither extra sharpness nor blur is an automatic pass. '
    + 'The fixed permission is not artistic approval. All existing quality, source-neighbor, identity, subject, anatomy, complete-head and doubt requirements remain blocking. '
    + 'SOURCE_FIGURE_PERMISSION: ' + JSON.stringify({ baseline: a.baselineReturned, additions: a.extensions, sourcePeople: a.sourcePeople,
      replacedSourceHead: a.replacedSourceHead, replacedSourceLowerBody: a.replacedSourceLowerBody, plannedStandingHeight: a.standingHeight });
}
export type SourceFigurePixels = { data: Uint8Array; width: number; height: number; channels: number };
const inside = (r: PatchRectangle, x: number, y: number) => x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height;
const distance = (r: PatchRectangle, x: number, y: number) => Math.max(r.left - x, x - r.left - r.width + 1, r.top - y, y - r.top - r.height + 1, 0);
export function sourceFigureWeight(a: SourceFigureAuthority, part: SourceFigureAuthority['extensions'][number], x: number, y: number) {
  if (!inside(part.rect, x, y)) return 0;
  const r = part.rect, d = Math.min(x - r.left, r.left + r.width - 1 - x, part.kind === 'head' ? y - r.top : r.top + r.height - 1 - y);
  return Math.min(1, (d + 0.5) / 12, ...a.sourcePeople.map(p => Math.min(1, distance(p.protectedCore, x, y) / p.feather)));
}
function changed(a: SourceFigurePixels, b: SourceFigurePixels, r: PatchRectangle) {
  let n = 0;
  for (let y = Math.max(0, r.top); y < Math.min(a.height, r.top + r.height); y++) for (let x = Math.max(0, r.left); x < Math.min(a.width, r.left + r.width); x++) {
    const i = (y * a.width + x) * 4;
    if ([0, 1, 2, 3].some(c => a.data[i + c] !== b.data[i + c])) n++;
  }
  return n;
}
/** No painting, resampling, silhouette invention or approval. Only a public,
 * fixed compound return applied to authenticated already-paid aligned pixels.
 * The service independently proves the entire baseline recipe and every input. */
export function composeSourceFigureReturn(input: { authority: SourceFigureAuthority; raw: SourceFigurePixels; scene: SourceFigurePixels; baseline: SourceFigurePixels }) {
  const { authority: a, raw, scene, baseline } = input;
  assertSourceFigureAuthority(a);
  if (![raw, scene, baseline].every(p => p.width === 512 && p.height === 768 && p.channels === 4 && p.data.length === 512 * 768 * 4))
    throw Error('SOURCE_FIGURE: aligned native RGBA crops required');
  if (a.sourcePeople.some(p => changed(baseline, scene, p.protectedCore))) throw Error('SOURCE_FIGURE: baseline protected source core changed');
  const pixels = new Uint8Array(baseline.data), reports = [];
  for (const part of a.extensions) {
    const points: { x: number; y: number }[] = [], r = part.rect;
    for (let y = r.top; y < r.top + r.height; y++) for (let x = r.left; x < r.left + r.width; x++) {
      const i = (y * 512 + x) * 4, weight = sourceFigureWeight(a, part, x, y);
      if (!inside(a.baselineReturned, x, y) && [0, 1, 2, 3].some(c => baseline.data[i + c] !== scene.data[i + c]))
        throw Error('SOURCE_FIGURE: added return no longer meets original source pixels');
      if (weight > 0) for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(raw.data[i + c]! * weight + pixels[i + c]! * (1 - weight));
      if (weight > 0 && weight < 1 && (part.kind === 'head' ? y < a.baselineReturned.top : y >= a.baselineReturned.top + a.baselineReturned.height)) points.push({ x, y });
    }
    const score = (dx: number, dy: number) => {
      let sum = 0, n = 0;
      for (const { x, y } of points) {
        if (x + dx < 0 || y + dy < 0 || x + dx >= 512 || y + dy >= 768) continue;
        const i = (y * 512 + x) * 4, j = ((y + dy) * 512 + x + dx) * 4;
        for (let c = 0; c < 3; c++) sum += Math.abs(scene.data[i + c]! - raw.data[j + c]!) / 3;
        n++;
      }
      return n ? sum / n : Infinity;
    };
    const zero = score(0, 0); let best = { dx: 0, dy: 0, score: zero };
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const s = score(dx, dy);
      if (s < best.score - 1.5 || s < best.score - 1e-9 && Math.hypot(dx, dy) < Math.hypot(best.dx, best.dy)) best = { dx, dy, score: s };
    }
    if (best.score > zero - 1.5) best = { dx: 0, dy: 0, score: zero };
    const usable = Number.isFinite(zero) && zero <= 24 && !best.dx && !best.dy;
    reports.push({ kind: part.kind, joinPoints: points.length, borderMeanDiff: zero, shift: { dx: best.dx, dy: best.dy }, usable });
  }
  if (reports.some(r => !r.usable)) throw Error('SOURCE_FIGURE: new join exceeds unchanged seam or alignment limits');
  const result = { ...baseline, data: pixels };
  if (a.sourcePeople.some(p => changed(result, scene, p.protectedCore))) throw Error('SOURCE_FIGURE: protected source core changed');
  if (changed(result, raw, a.replacedSourceLowerBody)) throw Error('SOURCE_FIGURE: lower source body is not completely replaced');
  let outside = 0;
  for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) if (!a.extensions.some(e => inside(e.rect, x, y))) {
    const i = (y * 512 + x) * 4;
    if ([0, 1, 2, 3].some(c => baseline.data[i + c] !== pixels[i + c])) outside++;
  }
  if (outside) throw Error('SOURCE_FIGURE: pixels outside public additions changed');
  return { pixels, reports, outsideAdditionsChangedPixels: 0 as const, protectedCoreChangedPixels: 0 as const, lowerBodyDifferentFromRaw: 0 as const };
}
