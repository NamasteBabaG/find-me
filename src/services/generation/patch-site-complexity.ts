/**
 * Choosing a place a local patch may safely be taken from.
 *
 * Two paid renders settled this: the model redraws the whole crop it is given.
 * Prose ("change nothing else") did not stop it, and an edit mask did not either
 * - the masked attempt strayed slightly MORE than the unmasked one. So the board
 * is not preserved by asking; it is preserved by taking only a declared
 * rectangle and leaving every pixel outside it alone.
 *
 * That makes the choice of rectangle the whole game. Whatever sits inside it
 * will come back redrawn, so it must be paint nobody can miss: open sand, a
 * wall, a stretch of path. A rectangle over a sandcastle comes back with a
 * different sandcastle, and that reads as a change even though the seam is
 * clean.
 *
 * This scores a candidate the way the eye does - how much structure is in it -
 * so a site can be rejected before anything is bought.
 */
import sharp from "sharp";

export type SiteRect = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };

export type SiteScore = {
  /** Mean gradient magnitude, 0..255. Flat paint is near zero. */
  readonly detail: number;
  /** Share of pixels sitting on a strong edge. */
  readonly edgeFraction: number;
  /** Spread of colour, which catches a busy but soft area a gradient misses. */
  readonly colourSpread: number;
  readonly verdict: "plain" | "busy";
  readonly reason: string;
};

export const SITE_LIMITS = Object.freeze({
  /** Above this the rectangle has drawn structure in it, not just texture. */
  maxDetail: 14,
  /** Above this share of strong edges, something in there has an outline. */
  maxEdgeFraction: 0.06,
  /** Above this the rectangle spans more than one material. */
  maxColourSpread: 42,
  /** Gradient magnitude that counts as a drawn edge rather than grain. */
  edgeMagnitude: 48,
});

/**
 * Scores one candidate rectangle of a board. Free: no provider, no ledger.
 */
export async function scorePatchSite(boardPng: Buffer, rect: SiteRect, limits = SITE_LIMITS): Promise<SiteScore> {
  if (rect.width < 8 || rect.height < 8) throw new Error("PATCH_SITE: a candidate rectangle must be at least 8 pixels each way");
  const { data, info } = await sharp(boardPng, { limitInputPixels: 8_294_400 })
    .extract(rect).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, channels = info.channels;
  const grey = new Float32Array(w * h);
  let rSum = 0, gSum = 0, bSum = 0, rSq = 0, gSq = 0, bSq = 0;
  for (let i = 0, p = 0; p < w * h; p++, i += channels) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    grey[p] = (r * 299 + g * 587 + b * 114) / 1000;
    rSum += r; gSum += g; bSum += b; rSq += r * r; gSq += g * g; bSq += b * b;
  }
  const n = w * h;
  const sd = (sum: number, sq: number) => Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
  const colourSpread = (sd(rSum, rSq) + sd(gSum, gSq) + sd(bSum, bSq)) / 3;

  // Sobel magnitude; interior only, so the rectangle's own edge is not counted.
  let total = 0, strong = 0, counted = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const at = (dx: number, dy: number) => grey[(y + dy) * w + (x + dx)]!;
    const gx = at(-1, -1) + 2 * at(-1, 0) + at(-1, 1) - at(1, -1) - 2 * at(1, 0) - at(1, 1);
    const gy = at(-1, -1) + 2 * at(0, -1) + at(1, -1) - at(-1, 1) - 2 * at(0, 1) - at(1, 1);
    const magnitude = Math.hypot(gx, gy) / 4;
    total += magnitude; counted++;
    if (magnitude >= limits.edgeMagnitude) strong++;
  }
  const detail = counted ? total / counted : 0;
  const edgeFraction = counted ? strong / counted : 0;
  const busy = detail > limits.maxDetail || edgeFraction > limits.maxEdgeFraction || colourSpread > limits.maxColourSpread;
  return {
    detail, edgeFraction, colourSpread,
    verdict: busy ? "busy" : "plain",
    reason: busy
      ? `detail ${detail.toFixed(1)}, edges ${(edgeFraction * 100).toFixed(1)}%, colour spread ${colourSpread.toFixed(1)}: this rectangle has drawn structure, and the render will bring back a different version of it`
      : `detail ${detail.toFixed(1)}, edges ${(edgeFraction * 100).toFixed(1)}%, colour spread ${colourSpread.toFixed(1)}: plain enough that a redraw inside it will not read as a change`,
  };
}

/**
 * Sweeps a board for the plainest rectangles of a given size. Returns the best
 * candidates in order, so three hides can be chosen mechanically per board.
 */
export async function findPatchSites(boardPng: Buffer, size: { width: number; height: number },
  options: { step?: number; limit?: number; margin?: number } = {}, limits = SITE_LIMITS) {
  const meta = await sharp(boardPng, { limitInputPixels: 8_294_400 }).metadata();
  const boardWidth = meta.width!, boardHeight = meta.height!;
  const step = options.step ?? Math.max(32, Math.round(size.width / 2));
  const margin = options.margin ?? 0;
  const found: (SiteScore & { rect: SiteRect })[] = [];
  for (let top = margin; top + size.height <= boardHeight - margin; top += step) {
    for (let left = margin; left + size.width <= boardWidth - margin; left += step) {
      const rect = { left, top, width: size.width, height: size.height };
      const score = await scorePatchSite(boardPng, rect, limits);
      found.push({ ...score, rect });
    }
  }
  found.sort((a, b) => a.detail - b.detail);
  return found.slice(0, options.limit ?? 10);
}

/**
 * Scores the BORDER of a crop rather than its inside.
 *
 * When the whole crop is replaced there is nothing to preserve inside it, so the
 * inside no longer decides anything. What decides is the boundary: a crop whose
 * edge runs through flat sand or plain cobbles joins invisibly, and one whose
 * edge cuts across a face, a railing or a surfboard shows a step no fade can
 * hide. Every visible rectangular seam in the first two rounds was an edge drawn
 * through detail.
 */
export async function scoreCropBorder(boardPng: Buffer, rect: SiteRect, band = 16, limits = SITE_LIMITS): Promise<SiteScore> {
  if (rect.width < band * 3 || rect.height < band * 3) throw new Error("PATCH_SITE: crop is too small to have a border band");
  const { data, info } = await sharp(boardPng, { limitInputPixels: 8_294_400 })
    .extract(rect).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, channels = info.channels;
  const grey = new Float32Array(w * h);
  for (let i = 0, p = 0; p < w * h; p++, i += channels) {
    grey[p] = (data[i]! * 299 + data[i + 1]! * 587 + data[i + 2]! * 114) / 1000;
  }
  const onBand = (x: number, y: number) => x < band || y < band || x >= w - band || y >= h - band;
  let total = 0, strong = 0, counted = 0, sum = 0, sq = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (!onBand(x, y)) continue;
    const at = (dx: number, dy: number) => grey[(y + dy) * w + (x + dx)]!;
    const gx = at(-1, -1) + 2 * at(-1, 0) + at(-1, 1) - at(1, -1) - 2 * at(1, 0) - at(1, 1);
    const gy = at(-1, -1) + 2 * at(0, -1) + at(1, -1) - at(-1, 1) - 2 * at(0, 1) - at(1, 1);
    const magnitude = Math.hypot(gx, gy) / 4;
    total += magnitude; counted++; sum += grey[y * w + x]!; sq += grey[y * w + x]! ** 2;
    if (magnitude >= limits.edgeMagnitude) strong++;
  }
  const detail = counted ? total / counted : 0;
  const edgeFraction = counted ? strong / counted : 0;
  const colourSpread = counted ? Math.sqrt(Math.max(0, sq / counted - (sum / counted) ** 2)) : 0;
  const busy = detail > limits.maxDetail || edgeFraction > limits.maxEdgeFraction;
  return {
    detail, edgeFraction, colourSpread,
    verdict: busy ? "busy" : "plain",
    reason: busy
      ? `border detail ${detail.toFixed(1)}, edges ${(edgeFraction * 100).toFixed(1)}%: this crop's edge cuts through drawn detail, and the join will show`
      : `border detail ${detail.toFixed(1)}, edges ${(edgeFraction * 100).toFixed(1)}%: the crop's edge runs through plain paint and should join invisibly`,
  };
}
