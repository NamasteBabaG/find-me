import { createHash } from 'node:crypto';
import { z } from 'zod';
import { JOURNEY_SOURCE_HEAD_AUTHORITIES, JOURNEY_SOURCE_HEAD_MANIFEST_SHA256 } from '../../../content/detectives/journey-source-head-v2';
import { JOURNEY_SUNBURST_TAIL_AUTHORITIES } from '../../../content/detectives/journey-sunburst-tail-v1';
import { JOURNEY_SUNBURST_TAIL_VERSION, assertJourneySunburstTailManifest, journeySunburstTailAuthorityFor, type JourneySunburstTailAuthority } from './journey-sunburst-tail';
import { pointInSourceHeadPolygon } from './source-head-recovery';
import type { AuthoredLocalPatchReturnContract } from '../scene/local-patch-return-region';

export const JOURNEY_SOURCE_HEAD_VERSION = 'source-head-recovery/v2' as const;
export const JOURNEY_SOURCE_HEAD_ACTION = 'generation:journey-source-head/v2' as const;
/** Provider encoding is normalized once before native-pixel composition. */
export const JOURNEY_HEAD_PROVIDER_FRAME_VERSION = 'journey-head-provider-frame/v1' as const;
export const JOURNEY_HEAD_FRAME_REPLAY_ACTION = 'generation:journey-head-provider-frame/v1' as const;
export function journeyHeadProviderFrame(width: number | undefined, height: number | undefined) {
  if (!(width === 512 && height === 768 || width === 768 && height === 1152))
    throw Error('JOURNEY_HEAD: unsupported provider frame');
  return { version: JOURNEY_HEAD_PROVIDER_FRAME_VERSION, width, height, outputWidth: 512 as const, outputHeight: 768 as const,
    resized: width !== 512, kernel: 'lanczos3' as const };
}
/** Prospective image admission allowance, verified against BOTH prepared tiers.
 * The ledger still reserves each exact full standard-rate maximum, never an
 * average bill or a discounted Flex estimate. */
export const JOURNEY_HEAD_REVIEW_COVERAGE_MICRO_USD = 178_000;
export type JourneyHeadAuthority = typeof JOURNEY_SOURCE_HEAD_AUTHORITIES[number] | JourneySunburstTailAuthority;
export type JourneyHeadPixels = { data: Uint8Array; width: number; height: number; channels: number };
export const journeyHeadBytesHash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
export function journeyHeadHash(value: unknown): string {
  const canonical = (v: unknown): unknown => v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.map(canonical)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([k, x]) => [k, canonical(x)])) : v;
  return createHash('sha256').update(JSON.stringify(canonical(value)) ?? 'undefined').digest('hex');
}
const same = (a: unknown, b: unknown) => journeyHeadHash(a) === journeyHeadHash(b);
export function assertJourneyHeadManifest() {
  if (journeyHeadHash(JOURNEY_SOURCE_HEAD_AUTHORITIES) !== JOURNEY_SOURCE_HEAD_MANIFEST_SHA256)
    throw Error('JOURNEY_HEAD: public SOURCE permission changed');
}
export function journeyHeadAuthorityFor(parent: AuthoredLocalPatchReturnContract, marker?: unknown): JourneyHeadAuthority | null {
  if (marker !== undefined) {
    const parsed = journeyHeadMarkerSchema.safeParse(marker);
    if (!parsed.success) return null;
    if (parsed.data.version === JOURNEY_SUNBURST_TAIL_VERSION) {
      const a = journeySunburstTailAuthorityFor(parent);
      return a && a.hideId === parsed.data.hideId && journeyHeadHash(a) === parsed.data.authoritySha256 ? a : null;
    }
  }
  assertJourneyHeadManifest();
  const a = JOURNEY_SOURCE_HEAD_AUTHORITIES.find(a => a.hideId === parent?.hideId);
  return a && parent.contentVersion === 13 && a.boardId === parent.boardId && same(a.source, parent.source)
    && same(a.crop, parent.crop) && same(a.child, parent.child) && same(a.returned, parent.local)
    && parent.sourcePlacement?.basePlacementSha256 === a.basePlacementSha256 ? a : null;
}
const insideRect = (r: { left: number; top: number; width: number; height: number }, x: number, y: number) =>
  x >= r.left && y >= r.top && x < r.left + r.width && y < r.top + r.height;
const protectedAt = (a: JourneyHeadAuthority, x: number, y: number) => a.protectedRects.some(r => insideRect(r, x, y))
  || a.protectedHeads.some(p => pointInSourceHeadPolygon(p, x + .5, y + .5))
  || a.protectedSourceFragments.some(p => pointInSourceHeadPolygon(p.polygon, x + .5, y + .5));

/** Public SOURCE role geometry, never a generated-face segmentation. The padded
 * Paris target registration overlaps another child's SOURCE feet. Those pixels
 * belong to that continuing person, not to the target head to replace. */
export function journeyHeadAlpha(a: JourneyHeadAuthority) {
  assertJourneyHeadManifest();
  if (!JOURNEY_SOURCE_HEAD_AUTHORITIES.some(p => same(p, a))) {
    assertJourneySunburstTailManifest();
    if (!JOURNEY_SUNBURST_TAIL_AUTHORITIES.some(p => same(p, a))) throw Error('JOURNEY_HEAD: unknown permission');
  }
  const alpha = new Uint8Array(512 * 768);
  for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
    const editable = pointInSourceHeadPolygon(a.editableHead, x + .5, y + .5) && y < a.protectedBelow && !protectedAt(a, x, y);
    if (editable) {
      if (x < a.returned.left + 12 || y < a.returned.top + 12 || x >= a.returned.left + a.returned.width - 12
        || y >= a.returned.top + a.returned.height - 12) throw Error('JOURNEY_HEAD: edit leaves original opaque return');
      alpha[y * 512 + x] = 255;
    }
    if (insideRect(a.targetRegisteredHead, x, y) && !protectedAt(a, x, y) && !editable)
      throw Error('JOURNEY_HEAD: original target role remains outside its new permission');
  }
  return alpha;
}

/** Same protected-exterior rule as the qualified native SOURCE-head join. Paid
 * head pixels stay at their native coordinates; discarded RAW background motion
 * cannot shift the SOURCE body, original people or head/neck join. */
export function composeJourneySourceHead(a: JourneyHeadAuthority, source: JourneyHeadPixels, raw: JourneyHeadPixels) {
  if (![source, raw].every(p => p.width === 512 && p.height === 768 && p.channels === 4 && p.data.length === 512 * 768 * 4))
    throw Error('JOURNEY_HEAD: exact native RGBA required');
  for (const p of [source, raw]) for (let i = 3; i < p.data.length; i += 4)
    if (p.data[i] !== 255) throw Error('JOURNEY_HEAD: opaque SOURCE and paid RAW required');
  const alpha = journeyHeadAlpha(a), pixels = new Uint8Array(source.data), points: { x: number; y: number }[] = [];
  for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
    const p = y * 512 + x;
    if (alpha[p]) pixels.set(raw.data.subarray(p * 4, p * 4 + 4), p * 4);
    else if (x >= 12 && x < 500 && y >= 12 && y < 756 && [[-12, 0], [12, 0], [0, -12], [0, 12]]
      .some(([dx, dy]) => alpha[(y + dy!) * 512 + x + dx!])) points.push({ x, y });
  }
  const score = (samples: typeof points, dx: number, dy: number) => {
    let sum = 0;
    for (const p of samples) { const i = (p.y * 512 + p.x) * 4, j = ((p.y + dy) * 512 + p.x + dx) * 4;
      for (let c = 0; c < 3; c++) sum += Math.abs(source.data[i + c]! - raw.data[j + c]!) / 3; }
    return samples.length ? sum / samples.length : Infinity;
  };
  const zero = score(points, 0, 0);
  if (!Number.isFinite(zero) || zero > 24) throw Error('JOURNEY_HEAD: protected SOURCE exterior exceeds unchanged24 limit');
  const registration = points.filter(p => {
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (alpha[(p.y + dy) * 512 + p.x + dx]) return false;
    return true;
  });
  let observed = { dx: 0, dy: 0, score: score(registration, 0, 0) };
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const s = score(registration, dx, dy);
    if (s < observed.score - 1e-9 || Math.abs(s - observed.score) < 1e-9 && Math.hypot(dx, dy) < Math.hypot(observed.dx, observed.dy))
      observed = { dx, dy, score: s };
  }
  let outsideChanged = 0, paidHeadChanged = 0;
  for (let i = 0; i < alpha.length; i++) {
    const expected = alpha[i] ? raw.data : source.data;
    if ([0, 1, 2, 3].some(c => pixels[i * 4 + c] !== expected[i * 4 + c])) {
      if (alpha[i]) paidHeadChanged++; else outsideChanged++;
    }
  }
  if (outsideChanged || paidHeadChanged) throw Error('JOURNEY_HEAD: native head or outside SOURCE copy changed');
  return { pixels, proof: { version: JOURNEY_SOURCE_HEAD_VERSION, maskSha256: journeyHeadBytesHash(alpha),
    joinPoints: points.length, borderMeanDiff: zero, shift: { dx: 0, dy: 0 },
    discardedRawBackgroundBestShift: observed, outsideMaskChangedPixels: outsideChanged, paidHeadChangedPixels: paidHeadChanged } };
}

/** One named Paris SOURCE head bought with the explicit Sunburst profile under
 * the separately authorized five-dollar completion of one existing game. It is
 * its own finite pin and action; every v2 pin and marker keeps its exact bytes,
 * and the game's global painter release is never changed. */
export const JOURNEY_SUNBURST_HEAD_VERSION = 'journey-source-head-sunburst/v1' as const;
export const JOURNEY_SUNBURST_HEAD_ACTION = 'generation:journey-source-head-sunburst/v1' as const;
export const JOURNEY_SUNBURST_HEAD_HIDE_ID = 'paris-detectives-hide-1' as const;
/** Equal to painter-release LOCAL_PATCH_SUNBURST_PAINTER (asserted in tests); a
 * domain literal so pure code never imports the service layer. */
export const JOURNEY_SUNBURST_HEAD_PAINTER = 'local-patch-painter/sunburst-high-low-complexity-v1' as const;
/** Audit ids of the two finite head pins. The v2 formula is the historical one, unchanged. */
export const journeyHeadPinId = (gameId: string, hideId: string) => 'aud_journey_head_' + journeyHeadHash([gameId, hideId]).slice(0, 40);
export const journeySunburstHeadPinId = (gameId: string) => 'aud_journey_head_sb_' + journeyHeadHash([gameId, JOURNEY_SUNBURST_HEAD_HIDE_ID]).slice(0, 40);

const digest = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().regex(/^[A-Za-z0-9_:.-]{1,240}$/);
export const journeyHeadMarkerSchema = z.object({ version: z.enum([JOURNEY_SOURCE_HEAD_VERSION, JOURNEY_SUNBURST_TAIL_VERSION]), authorizationSha256: digest,
  authoritySha256: digest, rowId: id, hideId: id, originalAttempts: z.literal(1), authorizedAttempt: z.literal(2),
  previousJudgeSha256: digest, requestKey: id,
  // Absent on every v2 purchase (unchanged bytes); present only on the one Sunburst head.
  painterRelease: z.literal(JOURNEY_SUNBURST_HEAD_PAINTER).optional() }).strict()
  .refine(p => p.version !== JOURNEY_SUNBURST_TAIL_VERSION || p.painterRelease === JOURNEY_SUNBURST_HEAD_PAINTER,
    { message: 'A finite Sunburst tail requires the exact HIGH/LOW painter' });
export type JourneyHeadMarker = z.infer<typeof journeyHeadMarkerSchema>;
export function journeyHeadMarker(row: { judgeJson: string | null }) {
  try { const p = journeyHeadMarkerSchema.safeParse(JSON.parse(row.judgeJson ?? 'null')?.journeyHeadRecovery); return p.success ? p.data : null; }
  catch { return null; }
}
export function journeyHeadPaintDirection(a: JourneyHeadAuthority, ageYears: number) {
  journeyHeadAlpha(a);
  if (ageYears !== 7) throw Error('JOURNEY_HEAD: original stated age7 required');
  const target = a.hideId === 'newyork-detectives-hide-1' ? 'the orange-jacket flower child holding flowers beside the florist'
    : a.hideId === 'amazon-detectives-hide-3' ? 'the orange-shirt ponytailed child watching the forest instrument beside the guide'
    : a.hideId === 'greatwall-detectives-hide-1' ? 'the pink-jacket child holding the pinwheel beside the stone wall'
    : 'the crouching blue-hoodie petanque child looking toward the metal ball';
  return 'NATIVE SOURCE HEAD ' + (a.version === JOURNEY_SUNBURST_TAIL_VERSION ? JOURNEY_SUNBURST_TAIL_VERSION : JOURNEY_SOURCE_HEAD_VERSION) + '. FIRST image is the unchanged original512x768 SOURCE crop. '
    + 'Replace ONLY the complete head, hair, hairline, face and neck of ' + target + ' with the exact canonical child at stated age7. '
    + 'Keep the SOURCE head angle, natural task-focused gaze, body, jacket, shoulders, hands, props, stance and support. Do not turn it into a portrait or redraw the body. '
    + 'The native alpha mask is the only editable footprint. Draw the complete canonical hairstyle wholly inside it with no residual original hair, clipped strands, fade or hard cut. '
    + 'Other original people continuing beyond the crop must keep their exact SOURCE fragments. In Paris the feet of the upper green-skirt child are protected SOURCE, including where the padded target head registration overlaps them; never redraw or relocate those feet. '
    + 'PHOTO and CANONICAL define identity, facial geometry, hair pattern/length and stated age. SOURCE people define painted contour weight, local contrast, softness, lighting and native sharpness. Avoid photographic microdetail, blur, halos or a style mismatch. '
    + 'Return only the unmarked512x768 original frame. A fresh ordinary MEDIUM assessment still decides complete head/hair, likeness, age, people, body, pose, all joins and style; no old verdict transfers.';
}

/** Additional native inspection in the same ordinary MEDIUM answer. Geometry
 * supplies roles and edit permission, never an accepted hairstyle or age. */
export function journeyHeadReviewDirection(a:JourneyHeadAuthority){
  journeyHeadAlpha(a);
  return '\nNATIVE SOURCE HEAD '+JOURNEY_SOURCE_HEAD_VERSION+': a NEW canonical head/hair/neck is painted on the exact unchanged SOURCE body. '
    +'SOURCE jacket, shoulders, hands, flowers or petanque task, body, feet and continuing people are intentional preserved pixels. '
    +'Independently inspect the ENTIRE new hair silhouette, face and neck in RAW and SHIPPING against PHOTO and canonical portrait. '
    +'The unchanged SOURCE target head angle and task-focused gaze are authoritative; a generic earlier pose suggestion never requires a new portrait angle or redraw of its SOURCE body. '
    +'The public edit footprint below is SOURCE role geometry, NOT a segmentation of the generated head. Fail a head clipped at ANY internal polygon or protected-fragment edge even when its bounding rectangle fits the outer return. '
    +'Require no residual original hair/face, halo, fade, hard cut, duplicate head, moved SOURCE feet, anatomical break, photographic texture, oversharp face or blurred hair. '
    +'Native head contrast, edge softness, painted style and sharpness must agree with nearby SOURCE people. No previous approval transfers. '
    +(a.version === JOURNEY_SUNBURST_TAIL_VERSION
      ? 'Independently judge perceived age from PHOTO versus both face and body; state the honest evidence-based age interval. Never narrow an interval, invent certainty or pass a child who looks older merely to finish. '
      : 'The unchanged age reader requires a narrow independently estimated range containing stated age7: no lower than5, no upper above8, span at most3. Report genuine7-9 or uncertainty honestly; do not narrow an estimate to pass. ')
    +'PUBLIC SOURCE HEAD FOOTPRINT, crop-local512x768: '+JSON.stringify({editablePolygon:a.editableHead,protectedBelow:a.protectedBelow,protectedRects:a.protectedRects,protectedSourceFragments:a.protectedSourceFragments,otherHeads:a.protectedHeads});
}
