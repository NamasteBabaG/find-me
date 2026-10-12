import sharp from "sharp";
import type { PatchRegion } from "./local-patch-seam";
export const RETURN_EDGES = ["left", "top", "right", "bottom"] as const;
export type BoundaryComparison = { edge: typeof RETURN_EDGES[number]; png: Buffer; axis: "x" | "y"; joinOffset: number };

/** Each join stays continuous for its full span. Quadrants can split a damaged
 * neighbour's head from its torso; a quiet mean seam does not prove anatomy. */
export async function prepareBoundaryComparisons(beforePng: Buffer, afterPng: Buffer, returned: PatchRegion, radius = 192): Promise<BoundaryComparison[]> {
  const [before, after] = await Promise.all([sharp(beforePng).metadata(), sharp(afterPng).metadata()]);
  if (!before.width || !before.height || before.width !== after.width || before.height !== after.height
    || !Object.values(returned).every(Number.isInteger) || returned.left < 0 || returned.top < 0
    || returned.width <= 0 || returned.height <= 0 || returned.left + returned.width > before.width
    || returned.top + returned.height > before.height || !Number.isSafeInteger(radius) || radius < 1 || radius > 768)
    throw Error("Boundary comparisons require registered context and a valid return window");
  return Promise.all(RETURN_EDGES.map(async edge => {
    const vertical = edge === "left" || edge === "right";
    const join = vertical ? returned.left + (edge === "right" ? returned.width : 0)
      : returned.top + (edge === "bottom" ? returned.height : 0);
    const start = Math.max(0, join - radius), end = Math.min(vertical ? before.width! : before.height!, join + radius);
    const rect = vertical ? { left: start, top: 0, width: end - start, height: before.height! }
      : { left: 0, top: start, width: before.width!, height: end - start };
    const [old, current] = await Promise.all([sharp(beforePng).extract(rect).png().toBuffer(), sharp(afterPng).extract(rect).png().toBuffer()]);
    const png = await sharp({ create: { width: rect.width * 2 + 16, height: rect.height, channels: 3, background: "white" } })
      .composite([{ input: old, left: 0, top: 0 }, { input: current, left: rect.width + 16, top: 0 }]).png().toBuffer();
    return { edge, png, axis: vertical ? "x" as const : "y" as const, joinOffset: join - start };
  }));
}

/** Opt-in evidence for newly authored locations. Keep the historical 192px
 * question above unchanged unless the caller explicitly selects this helper.
 * Neighbour bodies can continue outside the 512x768 shipping crop: compose
 * first, then extract registered native context from the actual full boards. */
export async function prepareFullBoardBoundaryEvidence(beforeBoardPng: Buffer, afterBoardPng: Buffer,
  crop: PatchRegion, returnedInCrop: PatchRegion) {
  const [before, after] = await Promise.all([sharp(beforeBoardPng).metadata(), sharp(afterBoardPng).metadata()]);
  if (!before.width || !before.height || before.width !== after.width || before.height !== after.height
    || !Object.values(crop).every(Number.isInteger) || crop.left < 0 || crop.top < 0 || crop.width < 1 || crop.height < 1
    || crop.left + crop.width > before.width || crop.top + crop.height > before.height
    || !Object.values(returnedInCrop).every(Number.isInteger) || returnedInCrop.left < 0 || returnedInCrop.top < 0
    || returnedInCrop.width < 1 || returnedInCrop.height < 1
    || returnedInCrop.left + returnedInCrop.width > crop.width || returnedInCrop.top + returnedInCrop.height > crop.height)
    throw Error("Full-board boundary evidence requires registered boards and bounded crop/return geometry");
  const padding = 384;
  const left = Math.max(0, crop.left - padding), top = Math.max(0, crop.top - padding);
  const context = { left, top, width: Math.min(before.width, crop.left + crop.width + padding) - left,
    height: Math.min(before.height, crop.top + crop.height + padding) - top };
  const [beforePng, afterPng] = await Promise.all([
    sharp(beforeBoardPng).extract(context).png().toBuffer(), sharp(afterBoardPng).extract(context).png().toBuffer(),
  ]);
  const returned = { ...returnedInCrop, left: crop.left - left + returnedInCrop.left, top: crop.top - top + returnedInCrop.top };
  return { context, beforePng, afterPng, boundaries: await prepareBoundaryComparisons(beforePng, afterPng, returned, padding) };
}
/** Object-join evidence (dual release v3). Each returned edge's own span, a band of
 * JOIN_DETAIL_HALF native pixels on each side of the join, magnified so a cut word
 * or a doubled edge is not read as "softening". BEFORE above AFTER for the top and
 * bottom joins, BEFORE left of AFTER for the side joins. Red ticks in a white
 * margin mark the join line; nothing covers the pixels. */
export const JOIN_DETAIL_HALF = 40;
export const JOIN_DETAIL_MARGIN = 14;
export type JoinDetail = { edge: typeof RETURN_EDGES[number]; png: Buffer; scale: number;
  /** Where the join runs inside each magnified band, in its pixels. */ joinOffset: number;
  /** The native band, in the context image the comparisons are cut from. */ band: PatchRegion };
export async function prepareJoinDetails(beforePng: Buffer, afterPng: Buffer, returned: PatchRegion): Promise<JoinDetail[]> {
  const [before, after] = await Promise.all([sharp(beforePng).metadata(), sharp(afterPng).metadata()]);
  const W = before.width!, H = before.height!;
  if (!W || !H || W !== after.width || H !== after.height || !Object.values(returned).every(Number.isInteger) || returned.left < 0 || returned.top < 0
    || returned.width <= 0 || returned.height <= 0 || returned.left + returned.width > W || returned.top + returned.height > H)
    throw Error("Join details require registered context and a valid return window");
  const half = JOIN_DETAIL_HALF, m = JOIN_DETAIL_MARGIN;
  return Promise.all(RETURN_EDGES.map(async edge => {
    const vertical = edge === "left" || edge === "right";
    const join = vertical ? returned.left + (edge === "right" ? returned.width : 0) : returned.top + (edge === "bottom" ? returned.height : 0);
    const acrossStart = Math.max(0, join - half), acrossEnd = Math.min(vertical ? W : H, join + half);
    const alongStart = Math.max(0, (vertical ? returned.top : returned.left) - half);
    const alongEnd = Math.min(vertical ? H : W, (vertical ? returned.top + returned.height : returned.left + returned.width) + half);
    const band = vertical ? { left: acrossStart, top: alongStart, width: acrossEnd - acrossStart, height: alongEnd - alongStart }
      : { left: alongStart, top: acrossStart, width: alongEnd - alongStart, height: acrossEnd - acrossStart };
    const along = alongEnd - alongStart, scale = Math.max(2, Math.min(3, Math.floor(1500 / along)));
    const [old, current] = await Promise.all([beforePng, afterPng].map(png => sharp(png).extract(band)
      .resize(band.width * scale, band.height * scale, { kernel: "nearest" }).png().toBuffer()));
    const joinOffset = (join - acrossStart) * scale, w = band.width * scale, h = band.height * scale, gap = 16;
    // Ticks point at the join from the margin on both ends of each band.
    const tick = (x: number, y: number, dir: "down" | "up" | "right" | "left") => {
      const s = 6, p = dir === "down" ? `${x - s},${y - m + 2} ${x + s},${y - m + 2} ${x},${y - 1}` : dir === "up" ? `${x - s},${y + m - 2} ${x + s},${y + m - 2} ${x},${y + 1}`
        : dir === "right" ? `${x - m + 2},${y - s} ${x - m + 2},${y + s} ${x - 1},${y}` : `${x + m - 2},${y - s} ${x + m - 2},${y + s} ${x + 1},${y}`;
      return `<polygon points="${p}" fill="#e00000"/>`;
    };
    if (vertical) {
      const width = 2 * w + gap, height = h + 2 * m, ticks = [0, w + gap].flatMap(x0 => [tick(x0 + joinOffset, m, "down"), tick(x0 + joinOffset, m + h, "up")]).join("");
      const png = await sharp({ create: { width, height, channels: 3, background: "white" } }).composite([{ input: old, left: 0, top: m }, { input: current, left: w + gap, top: m },
        { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${ticks}</svg>`), left: 0, top: 0 }]).png().toBuffer();
      return { edge, png, scale, joinOffset, band };
    }
    const width = w + 2 * m, height = 2 * h + gap, ticks = [0, h + gap].flatMap(y0 => [tick(m, y0 + joinOffset, "right"), tick(m + w, y0 + joinOffset, "left")]).join("");
    const png = await sharp({ create: { width, height, channels: 3, background: "white" } }).composite([{ input: old, left: m, top: 0 }, { input: current, left: m, top: h + gap },
      { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${ticks}</svg>`), left: 0, top: 0 }]).png().toBuffer();
    return { edge, png, scale, joinOffset, band };
  }));
}
export const NEIGHBOR_QUADRANTS = ["upper-left", "upper-right", "lower-left", "lower-right"] as const;
export type NeighborComparison = { quadrant: typeof NEIGHBOR_QUADRANTS[number]; png: Buffer };
/** Registered native pairs with centre overlap; no resized or invented detail. */
export async function prepareNeighborComparisons(beforePng: Buffer, afterPng: Buffer): Promise<NeighborComparison[]> {
  const [before, after] = await Promise.all([sharp(beforePng).metadata(), sharp(afterPng).metadata()]);
  if (!before.width || !before.height || before.width !== after.width || before.height !== after.height) throw Error("Neighbour comparisons require registered equal-sized context");
  const x = Math.floor(before.width / 2), y = Math.floor(before.height / 2);
  return Promise.all(NEIGHBOR_QUADRANTS.map(async (quadrant, i) => {
    const left = i % 2 ? Math.max(0, x - 48) : 0, top = i > 1 ? Math.max(0, y - 48) : 0;
    const width = (i % 2 ? before.width! : Math.min(before.width!, x + 48)) - left;
    const height = (i > 1 ? before.height! : Math.min(before.height!, y + 48)) - top;
    const rect = { left, top, width, height };
    const [old, current] = await Promise.all([sharp(beforePng).extract(rect).png().toBuffer(), sharp(afterPng).extract(rect).png().toBuffer()]);
    const png = await sharp({ create: { width: width * 2 + 16, height, channels: 3, background: "white" } }).composite([
      { input: old, left: 0, top: 0 }, { input: current, left: width + 16, top: 0 },
    ]).png().toBuffer();
    return { quadrant, png };
  }));
}
