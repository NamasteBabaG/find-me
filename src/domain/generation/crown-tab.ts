import { z } from 'zod';
import { LOCAL_PATCH_RETURN_FEATHER } from '../scene/local-patch-return-region';

/** A free correction of an already-paid painting whose located crown was drawn ABOVE
 * its whole return window, where the ordinary composition restored the original scene
 * over it. Only for an authored window whose strip above holds nothing nearer than the
 * target: there the head is in front, and the restored scene was the wrong depth.
 * The tab takes the paid painting's own pixels over the located head and a fixed
 * margin; every other shipped pixel stays byte for byte. No new painting, warp,
 * scale, segmentation or approval: a fresh ordinary review decides the candidate. */
export const CROWN_TAB_VERSION = 'crown-tab/v1' as const;
export const CROWN_TAB_ACTION = 'local-patch:crown-tab';
/** The farthest a located crown may sit above its whole return window. */
export const CROWN_TAB_MAX_RAISE = 64;
/** Columns kept either side of the located head: wider than the feather, so the
 * measured side joins are scene, not the head. */
export const CROWN_TAB_SIDE_MARGIN = 16;
/** Rows between the end of the top feather and the located crown. */
export const CROWN_TAB_CROWN_CLEARANCE = 4;
/** The only faults a crown cut can explain; any other refusal keeps its own route. */
export const CROWN_TAB_FAULT_CHECKS = Object.freeze(['childComplete', 'pictureWhole', 'severeSeam'] as const);

type Rect = { left: number; top: number; width: number; height: number };

/** Authored visual classification of the strip above each window (public base art,
 * 2026-11-02). Everything named here is farther than the target, so a crown drawn
 * above the window occludes it. A window not listed, or whose source or geometry
 * differs, has no authority. Kingdom and Explorer windows are not classified. */
export const CROWN_TAB_AUTHORITY = Object.freeze([
  { hideId: 'newyork-detectives-hide-1', sourceSha256: '66429a8efd93433c4c4b62157c76c787060a466e033728ba3ead68b52ef8fd1b', crop: { left: 900, top: 160 },
    child: { left: 145, top: 265, width: 175, height: 365 }, returned: { left: 128, top: 250, width: 212, height: 400 }, behind: 'flower stall and shop window' },
  { hideId: 'newyork-detectives-hide-2', sourceSha256: '66429a8efd93433c4c4b62157c76c787060a466e033728ba3ead68b52ef8fd1b', crop: { left: 260, top: 1380 },
    child: { left: 145, top: 300, width: 255, height: 300 }, returned: { left: 130, top: 280, width: 290, height: 340 }, behind: 'a bench reader\'s jeans and knees' },
  { hideId: 'newyork-detectives-hide-3', sourceSha256: '66429a8efd93433c4c4b62157c76c787060a466e033728ba3ead68b52ef8fd1b', crop: { left: 3260, top: 80 },
    child: { left: 110, top: 95, width: 137, height: 310 }, returned: { left: 98, top: 83, width: 161, height: 334 }, behind: 'building door and wall' },
  { hideId: 'amazon-detectives-hide-1', sourceSha256: '2d641f25808666a72cf092bac5069ba0c9ab68b518199c3d584cdc802c8b885d', crop: { left: 0, top: 180 },
    child: { left: 12, top: 132, width: 235, height: 250 }, returned: { left: 0, top: 120, width: 259, height: 274 }, behind: 'capuchins on a branch and foliage' },
  // Paris 1 and Giza 2 are source-body windows: the engine uses the corrected body window
  // (content/detectives/source-body-repair.ts), not the parent, so the authority binds that one.
  { hideId: 'paris-detectives-hide-1', sourceSha256: '85e29b9efead0e06eea5b9cc40d9a7d2af84f114cb1bdf01338c9cbf381f01a4', crop: { left: 500, top: 650 },
    child: { left: 135, top: 195, width: 175, height: 355 }, returned: { left: 123, top: 183, width: 226, height: 379 }, behind: 'a standing girl\'s legs and shoes' },
  { hideId: 'paris-detectives-hide-2', sourceSha256: '85e29b9efead0e06eea5b9cc40d9a7d2af84f114cb1bdf01338c9cbf381f01a4', crop: { left: 2800, top: 1220 },
    child: { left: 205, top: 145, width: 205, height: 570 }, returned: { left: 193, top: 133, width: 242, height: 594 }, behind: 'a man\'s shoe and a bicycle wheel' },
  { hideId: 'marrakech-detectives-hide-2', sourceSha256: 'd9d8c7807e7f1774fdda23ec0491aaef62912de6f3b2d26ef4a0b3f02bd8f9c4', crop: { left: 970, top: 1385 },
    child: { left: 42, top: 127, width: 260, height: 590 }, returned: { left: 30, top: 115, width: 284, height: 614 }, behind: 'a woven basket' },
  { hideId: 'marrakech-detectives-hide-3', sourceSha256: 'd9d8c7807e7f1774fdda23ec0491aaef62912de6f3b2d26ef4a0b3f02bd8f9c4', crop: { left: 3070, top: 1210 },
    child: { left: 65, top: 145, width: 168, height: 290 }, returned: { left: 53, top: 133, width: 456, height: 487 }, behind: 'a seated reader\'s open newspaper' },
  { hideId: 'giza-detectives-hide-1', sourceSha256: 'd02ad65ef1024d531e1bc07727cc881db2720c0682b372991f048b9de2a940b9', crop: { left: 790, top: 320 },
    child: { left: 60, top: 75, width: 165, height: 285 }, returned: { left: 30, top: 63, width: 207, height: 309 }, behind: 'tent shelving' },
  { hideId: 'giza-detectives-hide-2', sourceSha256: 'd02ad65ef1024d531e1bc07727cc881db2720c0682b372991f048b9de2a940b9', crop: { left: 2210, top: 650 },
    child: { left: 130, top: 220, width: 180, height: 345 }, returned: { left: 118, top: 208, width: 232, height: 390 }, behind: 'a standing man\'s jeans' },
  { hideId: 'giza-detectives-hide-3', sourceSha256: 'd02ad65ef1024d531e1bc07727cc881db2720c0682b372991f048b9de2a940b9', crop: { left: 3280, top: 910 },
    child: { left: 208, top: 130, width: 192, height: 300 }, returned: { left: 170, top: 118, width: 242, height: 324 }, behind: 'a sandbox and a child seen from behind' },
  { hideId: 'sydney-detectives-hide-3', sourceSha256: '34ebb5fe859a3dc046f86269717205ac63209361f0348240eb549180e841ac1c', crop: { left: 2860, top: 270 },
    child: { left: 263, top: 160, width: 193, height: 361 }, returned: { left: 44, top: 140, width: 424, height: 544 }, behind: 'distant beach figures' },
] as const);
export type CrownTabAuthority = typeof CROWN_TAB_AUTHORITY[number];

const sameRect = (a: Rect, b: Rect) => a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
/** The authority of exactly this window, or null. */
export function crownTabAuthorityFor(input: { hideId: string; sourceSha256: string; crop: { left: number; top: number }; child: Rect; returned: Rect }): CrownTabAuthority | null {
  const a = CROWN_TAB_AUTHORITY.find(entry => entry.hideId === input.hideId);
  return a && a.sourceSha256 === input.sourceSha256 && a.crop.left === input.crop.left && a.crop.top === input.crop.top
    && sameRect(a.child, input.child) && sameRect(a.returned, input.returned) ? a : null;
}

const digest = z.string().regex(/^[a-f0-9]{64}$/), key = z.string().min(1).max(240).regex(/^[A-Za-z0-9_:.-]+$/);
const rect = z.object({ left: z.number().int().nonnegative(), top: z.number().int().nonnegative(),
  width: z.number().int().positive(), height: z.number().int().positive() }).strict().refine(r => r.left + r.width <= 512 && r.top + r.height <= 768);
export const crownTabSchema = z.object({ version: z.literal(CROWN_TAB_VERSION), auditId: z.string().regex(/^aud_crown_tab_[a-f0-9]{40}$/),
  hideId: key, authoritySha256: digest,
  sourceRequestKey: key, sourceFingerprint: digest, sourcePayloadSha256: digest, normalizedRawSha256: digest,
  baselineAssetId: key, baselineShippingSha256: digest, baselineGeometrySha256: digest, boardArtSha256: digest,
  returned: rect, rawHead: rect, tab: rect, band: z.literal(LOCAL_PATCH_RETURN_FEATHER),
  seam: z.object({ borderMeanDiff: z.number().nonnegative(), shift: z.object({ dx: z.number().int(), dy: z.number().int() }).strict() }).strict(),
  headAnswer: z.object({ requestKey: key, fingerprint: digest, rawSha256: digest }).strict(),
  candidateSha256: digest, geometrySha256: digest, identitySha256: digest }).strict();
export type CrownTab = z.infer<typeof crownTabSchema>;

/** The window a fresh review measures the head against: the return and its tab. */
export const crownTabWindow = (returned: Rect, tab: Rect): Rect =>
  ({ left: returned.left, top: tab.top, width: returned.width, height: returned.top + returned.height - tab.top });

/** The tab over a located crown, or the reason there is none. The crown must sit
 * above the whole window by at most the raise, inside its columns, below a full
 * feather plus clearance, and clear of every registered original head. */
export function crownTabRect(returned: Rect, rawHead: Rect, sourceHeads: readonly Rect[], band = LOCAL_PATCH_RETURN_FEATHER): Rect | string {
  const above = returned.top - rawHead.top;
  if (above <= 0) return 'The located crown is inside its return window';
  if (above > CROWN_TAB_MAX_RAISE) return 'The located crown is above its return window by more than the authorized raise';
  if (rawHead.left - CROWN_TAB_SIDE_MARGIN < returned.left || rawHead.left + rawHead.width + CROWN_TAB_SIDE_MARGIN > returned.left + returned.width)
    return 'The located crown is not inside its window columns with a full side margin';
  const top = rawHead.top - band - CROWN_TAB_CROWN_CLEARANCE;
  if (top < 0) return 'The located crown leaves no feather inside the crop';
  const tab = { left: rawHead.left - CROWN_TAB_SIDE_MARGIN, top, width: rawHead.width + 2 * CROWN_TAB_SIDE_MARGIN, height: returned.top + band - top };
  if (sourceHeads.some(h => h.left < tab.left + tab.width && tab.left < h.left + h.width && h.top < tab.top + tab.height && tab.top < h.top + h.height))
    return 'The tab would cover a registered original head';
  return tab;
}

export type CrownTabPixels = { readonly data: Uint8Array; readonly width: number; readonly height: number; readonly channels: number };
const inside = (r: Rect, x: number, y: number) => x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height;
/** Feather from the tab's top, left and right edges; its bottom joins the paid painting. */
export function crownTabWeight(tab: Rect, x: number, y: number, band = LOCAL_PATCH_RETURN_FEATHER) {
  if (!inside(tab, x, y)) return 0;
  const d = Math.min(x - tab.left, y - tab.top, tab.left + tab.width - 1 - x);
  return Math.min(1, (d + 0.5) / band);
}
/** The join the tab adds: its top/left/right feather rows that lie above the old window
 * plus its band, where the scene, not the old composition, meets the paid painting. */
const joinPoint = (tab: Rect, returned: Rect, band: number, x: number, y: number) =>
  inside(tab, x, y) && y < returned.top + band && Math.min(x - tab.left, y - tab.top, tab.left + tab.width - 1 - x) < band;

const diff = (a: CrownTabPixels, b: CrownTabPixels, ax: number, ay: number, bx: number, by: number) => {
  const i = (ay * a.width + ax) * 4, j = (by * b.width + bx) * 4;
  return (Math.abs(a.data[i]! - b.data[j]!) + Math.abs(a.data[i + 1]! - b.data[j + 1]!) + Math.abs(a.data[i + 2]! - b.data[j + 2]!)) / 3;
};
/** The new join, measured as the ordinary seam check measures a return: the same
 * mean limit, the same whole-pixel shift search and margin. Usable only aligned
 * and at or below the limit; nothing is blended across a moved edge. */
export function crownTabSeam(input: { raw: CrownTabPixels; scene: CrownTabPixels; tab: Rect; returned: Rect; band?: number },
  limits = { rewrittenMeanDiff: 24, searchPx: 3, alignmentMargin: 1.5 }) {
  const { raw, scene, tab, returned } = input, band = input.band ?? LOCAL_PATCH_RETURN_FEATHER, r = limits.searchPx;
  const points: { x: number; y: number }[] = [];
  for (let y = tab.top; y < Math.min(tab.top + tab.height, returned.top + band); y++) for (let x = tab.left; x < tab.left + tab.width; x++)
    if (joinPoint(tab, returned, band, x, y)) points.push({ x, y });
  const score = (dx: number, dy: number) => {
    let total = 0, n = 0;
    for (const { x, y } of points) {
      if (x + dx < 0 || y + dy < 0 || x + dx >= raw.width || y + dy >= raw.height) continue;
      total += diff(scene, raw, x, y, x + dx, y + dy); n++;
    }
    return n ? total / n : Number.POSITIVE_INFINITY;
  };
  const base = score(0, 0);
  let best = { dx: 0, dy: 0, score: base };
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (!dx && !dy) continue;
    const s = score(dx, dy);
    if (s < best.score - limits.alignmentMargin || (s < best.score - 1e-9 && Math.hypot(dx, dy) < Math.hypot(best.dx, best.dy))) best = { dx, dy, score: s };
  }
  if (best.score > base - limits.alignmentMargin) best = { dx: 0, dy: 0, score: base };
  const usable = points.length > 0 && Number.isFinite(base) && base <= limits.rewrittenMeanDiff && !best.dx && !best.dy;
  return { usable, borderMeanDiff: base, shift: { dx: best.dx, dy: best.dy } };
}

/** Pure pixels, crop-local and aligned: the paid RAW, the original scene crop and the
 * shipped baseline. Every pixel the tab replaces above the old window must still be the
 * original scene; nothing outside the tab changes, so every earlier correction is kept. */
export function composeCrownTab(input: { raw: CrownTabPixels; scene: CrownTabPixels; baseline: CrownTabPixels; returned: Rect; tab: Rect; band?: number }) {
  const { raw, scene, baseline, returned, tab } = input, band = input.band ?? LOCAL_PATCH_RETURN_FEATHER, w = baseline.width, h = baseline.height;
  if (![raw, scene].every(p => p.width === w && p.height === h) || ![raw, scene, baseline].every(p => p.channels === 4 && p.data.length === w * h * 4)
    || tab.left < 0 || tab.top < 0 || tab.left + tab.width > w || tab.top + tab.height > h || tab.top >= returned.top
    || tab.top + tab.height !== returned.top + band || tab.left < returned.left || tab.left + tab.width > returned.left + returned.width)
    throw Error('CROWN_TAB: aligned RGBA crop pixels and a tab above its own return are required');
  const out = new Uint8Array(baseline.data);
  let changed = 0;
  for (let y = tab.top; y < tab.top + tab.height; y++) for (let x = tab.left; x < tab.left + tab.width; x++) {
    const p = (y * w + x) * 4;
    if (y < returned.top) for (let c = 0; c < 4; c++)
      if (baseline.data[p + c] !== scene.data[p + c]) throw Error('CROWN_TAB: the strip above the window is no longer the original scene');
    const weight = crownTabWeight(tab, x, y, band);
    if (weight <= 0) continue;
    let moved = false;
    for (let c = 0; c < 3; c++) {
      const value = Math.round(raw.data[p + c]! * weight + baseline.data[p + c]! * (1 - weight));
      if (value !== out[p + c]) { out[p + c] = value; moved = true; }
    }
    if (moved) changed++;
  }
  return { pixels: out, changed };
}

const object = (v: unknown): Record<string, unknown> | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
/** Scheduling only: a single MEDIUM refusal whose paid answer locates a complete RAW
 * crown above the whole window and an incomplete shipped one, with only crown-cut faults.
 * The service still authenticates every paid byte, role, source, owner and authority. */
export function crownTabCandidate(row: { status: string; assetId?: string | null; judgeJson?: string | null } | undefined): boolean {
  if (!row || row.status !== 'FAILED' || !row.assetId) return false;
  try {
    const j = object(JSON.parse(row.judgeJson ?? 'null')), state = object(j?.selfRepair), verdict = object(j?.verdict);
    const proof = object(object(j?.boardReview)?.dual), quality = object(proof?.quality), head = object(quality?.headEvidence);
    if (!j || j.reviewState !== 'board-review-complete' || proof?.single !== 'single-sol-medium/v1'
      || state && !['awaiting-review', 'rejected'].includes(String(state.phase))
      || ['crownTab', 'headPixelCorrection', 'retainedNormalHead', 'authoredRecovery', 'crownReturn', 'sourceBodyRepair', 'wholeSourceContext', 'headSourceVersion', 'foreground']
        .some(field => j[field] !== undefined)
      || head?.version !== 'target-head-return/v2-visible-completeness'
      || verdict?.verdict !== 'fail' || !Array.isArray(verdict.faults) || !verdict.faults.length
      || !verdict.faults.every(f => (CROWN_TAB_FAULT_CHECKS as readonly string[]).includes(String(object(f)?.check)))) return false;
    const answer = object(object(JSON.parse(String(quality?.raw ?? 'null').trim().replace(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i, '$1')))?.head);
    const returned = rect.safeParse(head.returned), rawHead = rect.safeParse(answer?.rawHead);
    return answer?.rawCrown === 'pass' && answer.shippingCrown === 'fail' && returned.success && rawHead.success
      && rawHead.data.top < returned.data.top && returned.data.top - rawHead.data.top <= CROWN_TAB_MAX_RAISE;
  } catch { return false; }
}
