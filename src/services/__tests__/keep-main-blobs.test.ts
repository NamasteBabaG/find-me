import { describe, expect, it } from "vitest";
import { keepMainBlobs } from "../generation/patch";

/**
 * What `keepMainBlobs` counts.
 *
 * It returns two numbers that are easy to swap and impossible to tell apart by
 * type: `kept` is how many blobs survived, `keptArea` is how many pixels they
 * cover. The one-piece acceptance rule wants the second. It was given the
 * first, which made it compare ten thousand pixels against the number 2 and
 * accept everything — while its own unit test passed, because that test built a
 * PatchResult by hand and put the right number in the field.
 *
 * So this one touches the function.
 */
function mask(w: number, h: number, boxes: Array<[number, number, number, number]>): Buffer {
  const b = Buffer.alloc(w * h);
  for (const [x0, y0, x1, y1] of boxes) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) b[y * w + x] = 255;
  }
  return b;
}

describe("keepMainBlobs", () => {
  it("counts blobs in `kept` and pixels in `keptArea`", () => {
    // A 6x6 body and a 4x4 smear, far enough apart not to touch.
    const r = keepMainBlobs(mask(30, 30, [[2, 2, 8, 8], [20, 20, 24, 24]]), 30, 30, 0.05);
    expect(r.largest).toBe(36);
    expect(r.kept).toBe(2);
    expect(r.keptArea).toBe(52);
    // The rule reads it this way round, and the two must not be confusable.
    expect(r.largest / r.keptArea).toBeCloseTo(0.69, 2);
  });

  it("leaves a single blob's area equal to the largest", () => {
    const r = keepMainBlobs(mask(30, 30, [[5, 5, 15, 15]]), 30, 30, 0.05);
    expect(r.largest).toBe(100);
    expect(r.keptArea).toBe(100);
  });

  it("drops specks below the keep fraction, so they never count as a second piece", () => {
    const r = keepMainBlobs(mask(30, 30, [[2, 2, 12, 12], [25, 25, 26, 26]]), 30, 30, 0.05);
    expect(r.kept).toBe(1);
    expect(r.keptArea).toBe(100);
  });
});
