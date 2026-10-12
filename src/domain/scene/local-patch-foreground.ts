import { createHash } from "node:crypto";
import { LOCAL_PATCH_CROP, maskForHide, type LocalPatchHide } from "./local-patch-hides";

/**
 * Authored foreground: board objects that stand in front of a hide's support,
 * drawn back from the original board over every painting of a row whose recipe
 * asks for it. Not a return window and not a measured silhouette of the child:
 * it is the outline of a fixed object, so whatever the painter drew behind it is
 * hidden the way the object hides it in the scene.
 *
 * Why: at `newyork-v12-1` the return window crosses the taxi sign, so every edit
 * the painter makes to the sign ships. The v17 render of 12 October shipped a new
 * sign joined to the original's lower half (B-a10). A straight return cut at the
 * sign's top amputated the shoes instead (Codex's free re-composition). Restoring
 * the sign along its own outline keeps it whole and lets a taller child stand on
 * the sidewalk behind it.
 *
 * What it guarantees, and what it does not:
 *  - inside the outline every published pixel is the board's own;
 *  - it never covers the authored envelope, and it always enters from the crop's
 *    edge, so it cannot hide a face or leave an island of board inside a painting;
 *  - it does NOT remove a copy of the object the painter drew outside the outline
 *    (a doubled object). The painter's wording and the visual review own that.
 */
export const LOCAL_PATCH_FOREGROUND_VERSION = "local-patch-foreground/v1";

export type ForegroundPoint = readonly [number, number];
export type LocalPatchForeground = {
  readonly hideId: string;
  /** What the region is, in the words the painter reads. */
  readonly what: string;
  /** Closed polygons in crop coordinates (0..512 x 0..768); their union is restored. */
  readonly polygons: readonly (readonly ForegroundPoint[])[];
};

/**
 * Traced on the shipped board (`adventure-newyork` base, crop (560,0,512,768)) at
 * 4-8x: the outer edge of the sign's ink contour, its rounded left end, and the
 * visible yellow roof below the sign's right end, to the crop's bottom edge.
 */
export const LOCAL_PATCH_FOREGROUNDS: readonly LocalPatchForeground[] = Object.freeze([{
  hideId: "newyork-v12-1",
  what: "The taxi roof sign \"7E95\" and the yellow taxi roof at the bottom of Image 1",
  polygons: [[
    [181, 718.5], [190, 716.3], [200, 714.5], [220, 712.4], [240, 710.4], [260, 708.4], [280, 706.5], [300, 704.6],
    [310, 703.8], [316, 704], [320, 707.3], [324.5, 712.3], [327.7, 720], [331.2, 732.5], [334.6, 742.5], [336.6, 748.5],
    [363, 750.6], [397, 755.6], [413, 759.8], [430, 764], [441.5, 768],
    [160.3, 768], [160.8, 765], [162.3, 755], [165.5, 745], [170.8, 735], [176.3, 723.5],
  ]],
}]);

export function authoredLocalPatchForeground(hideId: string): LocalPatchForeground | null {
  return LOCAL_PATCH_FOREGROUNDS.find(f => f.hideId === hideId) ?? null;
}

const SAMPLES = 4;
const insidePolygon = (points: readonly ForegroundPoint[], x: number, y: number) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!, [xj, yj] = points[j]!;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Coverage per crop pixel, 0..255: 4x4 samples, even-odd within a polygon, union across polygons. */
export function localPatchForegroundAlpha(foreground: LocalPatchForeground): Uint8Array {
  const { width, height } = LOCAL_PATCH_CROP, alpha = new Uint8Array(width * height);
  for (const polygon of foreground.polygons) {
    const ys = polygon.map(p => p[1]), xs = polygon.map(p => p[0]);
    const top = Math.max(0, Math.floor(Math.min(...ys))), bottom = Math.min(height - 1, Math.ceil(Math.max(...ys)));
    const left = Math.max(0, Math.floor(Math.min(...xs))), right = Math.min(width - 1, Math.ceil(Math.max(...xs)));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) for (let sx = 0; sx < SAMPLES; sx++)
        if (insidePolygon(polygon, x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES)) hits++;
      const value = Math.round(hits * 255 / (SAMPLES * SAMPLES));
      if (value > alpha[y * width + x]!) alpha[y * width + x] = value;
    }
  }
  return alpha;
}

const area = (points: readonly ForegroundPoint[]) => Math.abs(points.reduce((sum, [x, y], i) => {
  const [nx, ny] = points[(i + 1) % points.length]!; return sum + x * ny - nx * y;
}, 0)) / 2;

/** Refuses before anything is bought: an outline that could hide the envelope,
 * float inside the painting, or leave the crop is never applied, and never
 * silently skipped. Returns the coverage for the caller to reuse. */
export function assertLocalPatchForeground(hide: LocalPatchHide, foreground: LocalPatchForeground): Uint8Array {
  const fail = (why: string): never => { throw new Error(`LOCAL_PATCH_FOREGROUND: ${hide.id}: ${why}`); };
  if (foreground.hideId !== hide.id) fail(`the outline belongs to ${foreground.hideId}`);
  if (!foreground.what.trim() || !foreground.polygons.length) fail("an outline needs a description and at least one polygon");
  for (const polygon of foreground.polygons) {
    if (polygon.length < 3) fail("a polygon needs at least three points");
    if (polygon.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > LOCAL_PATCH_CROP.width || y > LOCAL_PATCH_CROP.height))
      fail("every point must lie inside the 512x768 crop");
    if (area(polygon) < 64) fail("a polygon must cover at least 64 square pixels");
  }
  const alpha = localPatchForegroundAlpha(foreground), { width, height } = LOCAL_PATCH_CROP, mask = maskForHide(hide);
  for (let y = mask.top; y < mask.top + mask.height; y++) for (let x = mask.left; x < mask.left + mask.width; x++)
    if (alpha[y * width + x]) fail("the outline covers the authored envelope, where the child's face and body belong");
  let edge = false;
  for (let x = 0; x < width && !edge; x++) edge = !!alpha[x] || !!alpha[(height - 1) * width + x];
  for (let y = 0; y < height && !edge; y++) edge = !!alpha[y * width] || !!alpha[y * width + width - 1];
  if (!edge) fail("the outline must enter from the crop's edge; a floating island would cut a painting from inside");
  return alpha;
}

const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
/** The outline's identity: version, hide and points. The painter's words are pinned with the prompt. */
export const localPatchForegroundSha256 = (foreground: LocalPatchForeground) =>
  sha(JSON.stringify({ version: LOCAL_PATCH_FOREGROUND_VERSION, hideId: foreground.hideId, polygons: foreground.polygons }));
export const localPatchForegroundAlphaSha256 = (alpha: Uint8Array) => sha(alpha);
