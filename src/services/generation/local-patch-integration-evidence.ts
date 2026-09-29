import sharp from "sharp";
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
