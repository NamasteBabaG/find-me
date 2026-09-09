import { describe, it, expect } from "vitest";
import { resolveStandingPixel } from "../standing-pixels";

describe("bounded contour quantization", () => {
  it("retains an already-supported reading and never searches beyond three pixels", () => {
    const rgba = Buffer.alloc(20 * 20 * 4); rgba[(10 * 20 + 10) * 4 + 3] = 255;
    expect(resolveStandingPixel({ x: 10, y: 10 }, rgba, 20, 20)).toEqual({ x: 10, y: 10 });
    expect(resolveStandingPixel({ x: 8, y: 8 }, rgba, 20, 20)).toEqual({ x: 10, y: 10 });
    expect(resolveStandingPixel({ x: 7, y: 7 }, rgba, 20, 20)).toBeNull();
    expect(resolveStandingPixel({ x: 0, y: 0 }, rgba, 20, 20)).toBeNull();
  });
  it("does not accept a translucent contour as opaque support", () => {
    const rgba = Buffer.alloc(20 * 20 * 4); rgba[(10 * 20 + 10) * 4 + 3] = 223;
    expect(resolveStandingPixel({ x: 10, y: 10 }, rgba, 20, 20)).toBeNull();
  });
});
