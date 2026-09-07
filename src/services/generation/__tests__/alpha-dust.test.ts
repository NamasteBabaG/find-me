import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { hitBoxFromAlpha, keepMainBlobs } from "../patch";

/**
 * A real isolated render, alpha only (fixtures/dust-alpha.png): the child
 * stands in the middle of a 1024 canvas, and two single-pixel specks of
 * near-transparent dust sit in the bottom corners. Codex's grounded-sprite
 * module measured the child's box over every pixel above a threshold, so the
 * dust stretched it to the full canvas width and left ~80 empty pixels under
 * the shoes — the anchor, the tap box and the judge's crop all inherited it.
 *
 * The product path (diffToPatch) goes through keepMainBlobs before it measures
 * anything. This pins that contract on the real input, not on a clean drawn
 * rectangle: dust must not move the box, the feet or the anchor.
 */
const FIXTURE = path.join(__dirname, "fixtures", "dust-alpha.png");

async function alphaMask(threshold: number): Promise<{ mask: Buffer; w: number; h: number }> {
  const { data, info } = await sharp(readFileSync(FIXTURE)).raw().toBuffer({ resolveWithObject: true });
  const mask = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * info.channels]! >= threshold ? 255 : 0;
  return { mask, w: info.width, h: info.height };
}

describe("alpha dust and the tap contract", () => {
  it("the fixture really carries the defect: measured naively, the box spans the whole canvas", async () => {
    const { mask, w, h } = await alphaMask(16);
    let x0 = w, x1 = -1;
    for (let i = 0; i < mask.length; i++) if (mask[i]) { const x = i % w; if (x < x0) x0 = x; if (x > x1) x1 = x; }
    expect(x0).toBe(0);
    expect(x1).toBe(w - 1);
  });

  it("the product path ignores the dust: the box, the feet and the anchor belong to the child", async () => {
    const { mask, w, h } = await alphaMask(16);
    // The same call diffToPatch makes: a piece of the child is never more than a
    // quarter of her height away, and never a speck.
    const childPx = 900;
    const blobs = keepMainBlobs(mask, w, h, 0.05, childPx * 0.25);
    expect(blobs.kept).toBe(1);
    const box = hitBoxFromAlpha(blobs.out, w, h);
    // The main component measured by the diagnosis: x=343, y=57, w=328, h=887.
    expect(box.hitRect.x).toBeGreaterThanOrEqual(340);
    expect(box.hitRect.x + box.hitRect.w).toBeLessThanOrEqual(675);
    expect(box.hitRect.y).toBeGreaterThanOrEqual(55);
    expect(box.hitRect.y + box.hitRect.h).toBeLessThanOrEqual(948);
    // The feet: the lowest solid row of the child, not of the canvas.
    let lowest = -1;
    for (let i = 0; i < blobs.out.length; i++) if (blobs.out[i]) lowest = Math.max(lowest, Math.floor(i / w));
    expect(lowest).toBeLessThanOrEqual(947);
    expect(lowest).toBeGreaterThan(900);
    // And the anchor sits within the child's own box.
    expect(box.anchor.x).toBeGreaterThanOrEqual(box.hitRect.x);
    expect(box.anchor.x).toBeLessThanOrEqual(box.hitRect.x + box.hitRect.w);
  });
});
