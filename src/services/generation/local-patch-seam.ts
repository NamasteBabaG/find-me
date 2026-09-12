/**
 * Putting a locally rendered rectangle back into the board, safely.
 *
 * If the child is drawn together with her own surroundings, there is no cut line
 * to hide: no hair matte, no occluder mask, and none of the silhouette
 * dependence that makes a hide pass for one child and fail for the next. What
 * replaces it is one question the code can answer for nothing - did the model
 * keep the background it was given?
 *
 * Two failures look alike at a glance and must not be treated alike:
 *
 *  - The patch is the same scene at a slightly different exposure or tint. A
 *    narrow fade at the border hides that join honestly.
 *  - The model MOVED something - a surfboard edge, a railing, a shadow. Fading
 *    across that produces a double edge, which reads worse than a hard seam.
 *
 * So alignment is tested first, and a fade is only ever offered for a border
 * that is genuinely the same geometry. The fade also stays out of the middle,
 * where the child is, so it can never wash over her face or feet.
 */
import sharp from "sharp";

export type PatchRegion = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };

export type SeamReport = {
  /** Mean absolute RGB difference across the border band, 0..255. */
  readonly borderMeanDiff: number;
  readonly borderMaxDiff: number;
  /** Best whole-pixel shift found for the border band; 0,0 means nothing moved. */
  readonly shift: { readonly dx: number; readonly dy: number };
  /** Fraction of the patch that differs enough to be the newly drawn figure. */
  readonly changedFraction: number;
  /** Where the change sits. A figure added in the middle should not touch the border. */
  readonly changedTouchesBorder: boolean;
  /**
   * Changed pixels outside the rectangle the child was allowed to occupy. A
   * quiet border says the seam will look right; it says nothing about a
   * neighbour or a surfboard being repainted inside the crop, which is what this
   * counts. The rectangle is declared before the render, never inferred from it.
   */
  readonly strayChangedFraction: number;
  readonly verdict: "clean" | "fade-recommended" | "misaligned" | "background-rewritten";
  readonly reason: string;
};

export const SEAM_LIMITS = Object.freeze({
  /** Border band width in patch pixels; also the widest a fade may reach. */
  bandPx: 12,
  /** Below this mean difference the border is effectively the same pixels. */
  cleanMeanDiff: 2,
  /** Above this the border is not the same scene any more. */
  rewrittenMeanDiff: 24,
  /** Whole-pixel offsets searched when asking whether something moved. */
  searchPx: 3,
  /** A pixel differing by more than this counts as newly drawn. */
  changedPixelDiff: 18,
  /** How much better a shifted border must score before a move is believed. */
  alignmentMargin: 1.5,
  /** Changed area away from the added figure that still counts as keeping the scene. */
  maxStrayFraction: 0.03,
});

type Raw = { data: Buffer; width: number; height: number };

async function raw(png: Buffer, region?: PatchRegion): Promise<Raw> {
  const pipeline = sharp(png, { limitInputPixels: 8_294_400 });
  const cut = region ? pipeline.extract(region) : pipeline;
  const { data, info } = await cut.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const rgbDiff = (a: Raw, b: Raw, ax: number, ay: number, bx: number, by: number) => {
  const i = (ay * a.width + ax) * 4, j = (by * b.width + bx) * 4;
  return (Math.abs(a.data[i]! - b.data[j]!) + Math.abs(a.data[i + 1]! - b.data[j + 1]!) + Math.abs(a.data[i + 2]! - b.data[j + 2]!)) / 3;
};

/** True for pixels inside the border band of a width x height rectangle. */
const inBand = (x: number, y: number, width: number, height: number, band: number) =>
  x < band || y < band || x >= width - band || y >= height - band;

/**
 * Compares a rendered patch against the board pixels it replaces and says
 * whether it can be put back, and whether its join may be faded.
 */
export async function analysePatchSeam(boardPng: Buffer, region: PatchRegion, patchPng: Buffer,
  options: { allowedRect: PatchRegion }, limits = SEAM_LIMITS): Promise<SeamReport> {
  const allowed = options.allowedRect;
  if (allowed.left < 0 || allowed.top < 0 || allowed.width <= 0 || allowed.height <= 0
    || allowed.left + allowed.width > region.width || allowed.top + allowed.height > region.height) {
    throw new Error("LOCAL_PATCH: the allowed rectangle must sit inside the region, in patch coordinates");
  }
  const original = await raw(boardPng, region), patch = await raw(patchPng);
  if (patch.width !== original.width || patch.height !== original.height) {
    throw new Error(`LOCAL_PATCH: patch is ${patch.width}x${patch.height} but the region is ${original.width}x${original.height}`);
  }
  const band = Math.min(limits.bandPx, Math.floor(Math.min(original.width, original.height) / 3));

  // Alignment first: a moved object cannot be repaired by blending.
  //
  // Zero is the baseline, and a shift has to beat it by a clear margin to be
  // believed. Flat paint and repeating stripes make many offsets score the same,
  // so picking the numerically smallest score would report a shift for a patch
  // that is pixel-for-pixel identical - rejecting good renders for a fault that
  // is not there.
  const alignmentScore = (dx: number, dy: number) => {
    let total = 0, count = 0;
    const sample = (x: number, y: number) => {
      const sx = x + dx, sy = y + dy;
      if (sx < 0 || sy < 0 || sx >= patch.width || sy >= patch.height) return;
      total += rgbDiff(original, patch, x, y, sx, sy); count++;
    };
    for (let y = band; y < original.height - band; y += 2) for (const x of [band, original.width - band - 1]) sample(x, y);
    for (let x = band; x < original.width - band; x += 2) for (const y of [band, original.height - band - 1]) sample(x, y);
    return count ? total / count : Number.POSITIVE_INFINITY;
  };
  const baseline = alignmentScore(0, 0);
  let best = { dx: 0, dy: 0, score: baseline };
  for (let dy = -limits.searchPx; dy <= limits.searchPx; dy++) for (let dx = -limits.searchPx; dx <= limits.searchPx; dx++) {
    if (dx === 0 && dy === 0) continue;
    const score = alignmentScore(dx, dy);
    // Distinctly better, and better than the shift already held, before a move
    // is reported. Nearer shifts win ties, so a real move reads as its smallest
    // honest displacement.
    if (score < best.score - limits.alignmentMargin
      || (score < best.score - 1e-9 && Math.hypot(dx, dy) < Math.hypot(best.dx, best.dy))) best = { dx, dy, score };
  }
  if (best.score > baseline - limits.alignmentMargin) best = { dx: 0, dy: 0, score: baseline };

  let sum = 0, max = 0, bandCount = 0;
  for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++) {
    if (!inBand(x, y, original.width, original.height, band)) continue;
    const d = rgbDiff(original, patch, x, y, x, y);
    sum += d; max = Math.max(max, d); bandCount++;
  }
  const borderMeanDiff = bandCount ? sum / bandCount : 0;

  const pixels = original.width * original.height;
  const isChanged = new Uint8Array(pixels);
  let changed = 0, changedOnBorder = 0;
  for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++) {
    if (rgbDiff(original, patch, x, y, x, y) <= limits.changedPixelDiff) continue;
    isChanged[y * original.width + x] = 1; changed++;
    if (inBand(x, y, original.width, original.height, band)) changedOnBorder++;
  }
  const changedFraction = changed / pixels;
  const changedTouchesBorder = changedOnBorder > bandCount * 0.02;

  // Where the child and her shadow are ALLOWED to appear is declared before the
  // render, never inferred from what came back. Inferring it is circular: a
  // counter-test that replaced 71.6% of the crop with a flat rectangle and no
  // child at all was read as "that large change must be the figure", exempted
  // from its own check, and reported clean. A declared rectangle cannot be
  // argued with by the thing it is meant to police.
  let stray = 0;
  for (let y = 0; y < original.height; y++) for (let x = 0; x < original.width; x++) {
    if (!isChanged[y * original.width + x]) continue;
    const inside = x >= allowed.left && x < allowed.left + allowed.width
      && y >= allowed.top && y < allowed.top + allowed.height;
    if (!inside) stray++;
  }
  const strayChangedFraction = stray / pixels;

  const moved = best.dx !== 0 || best.dy !== 0;
  const strayed = strayChangedFraction > limits.maxStrayFraction;
  const verdict: SeamReport["verdict"] =
    moved ? "misaligned"
      : borderMeanDiff > limits.rewrittenMeanDiff || strayed ? "background-rewritten"
        : borderMeanDiff <= limits.cleanMeanDiff ? "clean" : "fade-recommended";
  const reason = moved
    ? `Border matches best at a shift of ${best.dx},${best.dy}: something in the scene moved, and blending a moved edge doubles it`
    : strayed ? `${(strayChangedFraction * 100).toFixed(1)}% of the crop changed OUTSIDE the rectangle the child was allowed to occupy: the scene was repainted, which a quiet border hides`
      : borderMeanDiff > limits.rewrittenMeanDiff ? `Border differs by ${borderMeanDiff.toFixed(1)} on average; this is not the same background`
        : verdict === "clean" ? "Border is the board's own pixels; the patch can go back as it is"
          : `Border differs by ${borderMeanDiff.toFixed(1)} on average, which a narrow fade can carry`;
  return { borderMeanDiff, borderMaxDiff: max, shift: { dx: best.dx, dy: best.dy }, changedFraction, changedTouchesBorder, strayChangedFraction, verdict, reason };
}

/**
 * Which pixels of a rendered patch are new, inside one rectangle of it, as an
 * alpha channel: 255 where the render differs from the board it replaces, 0
 * where it does not.
 *
 * This is how a hide gets a tap contract. There is no matte on this route - the
 * patch is an opaque piece of the world - so the child's own footprint cannot
 * come from alpha the way a cut-out sprite's does. What it can come from is the
 * difference, and `SEAM_LIMITS.changedPixelDiff` is already this route's one
 * answer to "is this pixel new"; asking it again here rather than inventing a
 * second threshold is the whole reason this lives beside the seam.
 *
 * The rectangle is DECLARED by the caller - the pose's own mask box, the only
 * part the painter was permitted to fill. Measuring across the whole crop would
 * measure re-encoding and repainted scenery as if they were a child, which is
 * the same circularity the stray-pixel check was written to avoid.
 */
export async function changedWithin(boardPng: Buffer, region: PatchRegion, patchPng: Buffer, within: PatchRegion, limits = SEAM_LIMITS): Promise<{
  alpha: Buffer; width: number; height: number; changed: number;
}> {
  if (within.left < 0 || within.top < 0 || within.width <= 0 || within.height <= 0
    || within.left + within.width > region.width || within.top + within.height > region.height) {
    throw new Error("LOCAL_PATCH: the measured rectangle must sit inside the region, in patch coordinates");
  }
  const original = await raw(boardPng, region), patch = await raw(patchPng);
  if (patch.width !== original.width || patch.height !== original.height) {
    throw new Error(`LOCAL_PATCH: patch is ${patch.width}x${patch.height} but the region is ${original.width}x${original.height}`);
  }
  const alpha = Buffer.alloc(within.width * within.height);
  let changed = 0;
  for (let y = 0; y < within.height; y++) for (let x = 0; x < within.width; x++) {
    const sx = within.left + x, sy = within.top + y;
    if (rgbDiff(original, patch, sx, sy, sx, sy) <= limits.changedPixelDiff) continue;
    alpha[y * within.width + x] = 255; changed++;
  }
  return { alpha, width: within.width, height: within.height, changed };
}

/**
 * Places the patch back into the board. A fade is applied only across the border
 * band, and only when the report says the geometry actually matches; the middle,
 * where the child is, stays fully opaque.
 */
export async function applyLocalPatch(boardPng: Buffer, region: PatchRegion, patchPng: Buffer, options: { fade: boolean; report: SeamReport }, limits = SEAM_LIMITS): Promise<Buffer> {
  // The decision is enforced here, not merely reported. A caller could otherwise
  // read "misaligned", pass fade anyway, and blend across a moved edge into a
  // double line - which is worse than the hard seam it was meant to hide.
  if (options.fade && options.report.verdict !== "fade-recommended" && options.report.verdict !== "clean") {
    throw new Error(`LOCAL_PATCH: a fade is refused for a ${options.report.verdict} patch. ${options.report.reason}`);
  }
  const board = await raw(boardPng), patch = await raw(patchPng);
  if (region.left < 0 || region.top < 0 || region.left + region.width > board.width || region.top + region.height > board.height) {
    throw new Error("LOCAL_PATCH: region falls outside the board");
  }
  if (patch.width !== region.width || patch.height !== region.height) {
    throw new Error(`LOCAL_PATCH: patch is ${patch.width}x${patch.height} but the region is ${region.width}x${region.height}`);
  }
  const band = options.fade ? Math.min(limits.bandPx, Math.floor(Math.min(region.width, region.height) / 3)) : 0;
  const out = Buffer.from(board.data);
  for (let y = 0; y < patch.height; y++) for (let x = 0; x < patch.width; x++) {
    // Ramp from 0 at the outer edge to 1 once past the band; 1 everywhere when
    // no fade was asked for, so the patch is placed exactly as rendered.
    const edge = Math.min(x, y, patch.width - 1 - x, patch.height - 1 - y);
    const weight = band <= 0 ? 1 : Math.min(1, (edge + 0.5) / band);
    const source = (y * patch.width + x) * 4, target = ((region.top + y) * board.width + (region.left + x)) * 4;
    for (let c = 0; c < 3; c++) out[target + c] = Math.round(patch.data[source + c]! * weight + board.data[target + c]! * (1 - weight));
  }
  return sharp(out, { raw: { width: board.width, height: board.height, channels: 4 } }).png().toBuffer();
}

/** v8: the provider sees a large context crop, but only this predeclared smaller
 * window may be returned. The entire child's box stays opaque; a guard around
 * it carries the join. Never infer the window from whatever the model changed.
 * A refused candidate exists only as evidence. Callers must respect `usable`.
 */
export const LOCAL_PATCH_RETURN_GUARD = 32;
export async function composeBoundedLocalPatch(boardPng: Buffer, crop: PatchRegion, patchPng: Buffer, child: PatchRegion) {
  if (![child.left, child.top, child.width, child.height].every(Number.isInteger)
    || child.left < 0 || child.top < 0 || child.width <= 0 || child.height <= 0
    || child.left + child.width > crop.width || child.top + child.height > crop.height) {
    throw new Error("LOCAL_PATCH: invalid declared child box");
  }
  const left = Math.max(0, child.left - LOCAL_PATCH_RETURN_GUARD);
  const top = Math.max(0, child.top - LOCAL_PATCH_RETURN_GUARD);
  const right = Math.min(crop.width, child.left + child.width + LOCAL_PATCH_RETURN_GUARD);
  const bottom = Math.min(crop.height, child.top + child.height + LOCAL_PATCH_RETURN_GUARD);
  // Do not feather through the child's face when an authored box hugs an edge.
  if (Math.min(child.left - left, child.top - top, right - child.left - child.width,
    bottom - child.top - child.height) < SEAM_LIMITS.bandPx) {
    throw new Error("LOCAL_PATCH: declared child box has no safe seam margin");
  }
  const local = { left, top, width: right - left, height: bottom - top };
  const region = { ...local, left: crop.left + left, top: crop.top + top };
  const patch = await sharp(patchPng, { limitInputPixels: 8_294_400 }).extract(local).png().toBuffer();
  // Here this is deliberately a BOUNDARY diagnosis, not a claim that scenery
  // inside the child's box is unchanged. The visual review checks that separately.
  const report = await analysePatchSeam(boardPng, region, patch, { allowedRect: { left: 0, top: 0, width: local.width, height: local.height } });
  const usable = report.verdict === "clean" || report.verdict === "fade-recommended";
  const candidate = await applyLocalPatch(boardPng, region, patch, { fade: usable, report });
  return { usable, candidate, report, region };
}
