import sharp from "sharp";
import type { PatchRegion } from "./local-patch-seam";
export const RETURN_EDGES = ["left", "top", "right", "bottom"] as const;
export type BoundaryComparison = { edge: typeof RETURN_EDGES[number]; png: Buffer; axis: "x" | "y"; joinOffset: number };

/** Each join stays continuous for its full span. Quadrants can split a damaged
 * neighbour's head from its torso; a quiet mean seam does not prove anatomy. */
export async function prepareBoundaryComparisons(beforePng: Buffer, afterPng: Buffer, returned: PatchRegion): Promise<BoundaryComparison[]> {
  const [before, after] = await Promise.all([sharp(beforePng).metadata(), sharp(afterPng).metadata()]);
  if (!before.width || !before.height || before.width !== after.width || before.height !== after.height
    || !Object.values(returned).every(Number.isInteger) || returned.left < 0 || returned.top < 0
    || returned.width <= 0 || returned.height <= 0 || returned.left + returned.width > before.width
    || returned.top + returned.height > before.height) throw Error("Boundary comparisons require registered context and a valid return window");
  const radius = 192;
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
