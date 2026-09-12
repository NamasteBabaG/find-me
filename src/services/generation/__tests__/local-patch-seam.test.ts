import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { analysePatchSeam, applyLocalPatch, composeBoundedLocalPatch, type PatchRegion } from "../local-patch-seam";

const REGION: PatchRegion = { left: 300, top: 200, width: 220, height: 320 };

/** Vertical stripes, like the surfboards a patch would be cut from. */
async function board() {
  const bars = Array.from({ length: 16 }, (_, i) => ({
    input: Buffer.from(`<svg width="40" height="900"><rect width="40" height="900" fill="rgb(${40 + i * 12},${150 - i * 6},${90 + i * 8})"/></svg>`),
    left: i * 45, top: 0,
  }));
  return sharp({ create: { width: 800, height: 900, channels: 4, background: { r: 220, g: 200, b: 150, alpha: 255 } } })
    .composite(bars).png().toBuffer();
}
const cut = (png: Buffer, region: PatchRegion = REGION) => sharp(png).extract(region).png().toBuffer();
/** Declared BEFORE any render: where the child and her shadow may appear. */
const ALLOWED: PatchRegion = { left: 60, top: 75, width: 100, height: 185 };
const seam = (b: Buffer, patch: Buffer, region: PatchRegion = REGION) =>
  analysePatchSeam(b, region, patch, { allowedRect: ALLOWED });

describe("returning a locally rendered rectangle to the board", () => {
  it("v8 preserves all context outside its predeclared return window, even if the model repaints it", async () => {
    const b = await board();
    const c = await cut(b);
    const patch = await sharp(c).composite([
      { input: Buffer.from('<svg width="220" height="20"><rect width="220" height="20" fill="red"/></svg>'), left: 0, top: 0 },
      { input: Buffer.from('<svg width="70" height="150"><rect width="70" height="150" fill="#204090"/></svg>'), left: 75, top: 90 },
    ]).png().toBuffer();
    const result = await composeBoundedLocalPatch(b, REGION, patch, ALLOWED);
    expect(result.usable).toBe(true);
    const original = await sharp(b).ensureAlpha().raw().toBuffer();
    const candidate = await sharp(result.candidate).ensureAlpha().raw().toBuffer();
    for (let y = 0; y < 900; y++) for (let x = 0; x < 800; x++) {
      const r = result.region;
      if (x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height) continue;
      const i = (y * 800 + x) * 4;
      if (!candidate.subarray(i, i + 4).equals(original.subarray(i, i + 4))) throw new Error(`context changed at ${x},${y}`);
    }
    // No feather crosses the protected face/body box.
    const protectedPixels = await sharp(result.candidate).extract({ ...ALLOWED, left: REGION.left + ALLOWED.left, top: REGION.top + ALLOWED.top }).raw().toBuffer();
    expect(protectedPixels.equals(await sharp(patch).extract(ALLOWED).raw().toBuffer())).toBe(true);
  });

  it("v8 does not call an invented or shifted return-boundary usable", async () => {
    const b = await board();
    const shifted = await cut(b, { ...REGION, left: REGION.left + 2 });
    expect((await composeBoundedLocalPatch(b, REGION, shifted, ALLOWED)).usable).toBe(false);
    const unrelated = await sharp({ create: { width: REGION.width, height: REGION.height, channels: 4, background: "#00ffff" } }).png().toBuffer();
    expect((await composeBoundedLocalPatch(b, REGION, unrelated, ALLOWED)).usable).toBe(false);
  });

  it("v8 refuses unsafe authored windows instead of fading the child's head", async () => {
    const b = await board();
    await expect(composeBoundedLocalPatch(b, REGION, await cut(b), { ...ALLOWED, top: 0 })).rejects.toThrow(/safe seam margin/);
  });
  it("accepts a patch that kept the board's own pixels", async () => {
    const b = await board();
    const report = await seam(b, await cut(b));
    expect(report.verdict).toBe("clean");
    expect(report.shift).toEqual({ dx: 0, dy: 0 });
    expect(report.borderMeanDiff).toBeLessThan(1);
  });

  it("offers a fade for the same scene at a different exposure", async () => {
    const b = await board();
    // The scene is unchanged; only its tone moved, which a narrow fade carries.
    const warmer = await sharp(await cut(b)).modulate({ brightness: 1.06 }).png().toBuffer();
    const report = await seam(b, warmer);
    expect(report.verdict).toBe("fade-recommended");
    expect(report.shift).toEqual({ dx: 0, dy: 0 });
  });

  it("diagnoses a moved scene rather than calling it a tone difference", async () => {
    const b = await board();
    // Same stripes, shifted two pixels: exactly the case a fade makes worse.
    const shifted = await cut(b, { ...REGION, left: REGION.left + 2 });
    const report = await seam(b, shifted);
    expect(report.verdict).toBe("misaligned");
    expect(report.shift.dx).not.toBe(0);
    expect(report.reason).toMatch(/moved/);
  });

  it("calls out a border that is no longer the same background at all", async () => {
    const b = await board();
    const invented = await sharp({ create: { width: REGION.width, height: REGION.height, channels: 4, background: { r: 10, g: 200, b: 240, alpha: 255 } } }).png().toBuffer();
    const report = await seam(b, invented);
    expect(["background-rewritten", "misaligned"]).toContain(report.verdict);
  });

  it("sees a figure added in the middle without disturbing the border", async () => {
    const b = await board();
    const withChild = await sharp(await cut(b))
      .composite([{ input: Buffer.from('<svg width="70" height="150"><ellipse cx="35" cy="75" rx="35" ry="75" fill="rgb(240,180,150)"/></svg>'), left: 75, top: 90 }])
      .png().toBuffer();
    const report = await seam(b, withChild);
    expect(report.verdict).toBe("clean");
    expect(report.changedTouchesBorder).toBe(false);
    expect(report.changedFraction).toBeGreaterThan(0.05);
  });

  it("puts the patch back in place, and a fade only ever touches the border", async () => {
    const b = await board();
    const patch = await sharp(await cut(b))
      .composite([{ input: Buffer.from('<svg width="70" height="150"><ellipse cx="35" cy="75" rx="35" ry="75" fill="rgb(240,180,150)"/></svg>'), left: 75, top: 90 }])
      .png().toBuffer();
    const report = await seam(b, patch);
    for (const fade of [false, true]) {
      const composed = await applyLocalPatch(b, REGION, patch, { fade, report });
      const back = await sharp(composed).extract(REGION).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const source = await sharp(patch).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      // The middle is the render itself, fade or not: the child is never washed out.
      const centre = ((REGION.height / 2) * REGION.width + REGION.width / 2) * 4;
      expect(back.data[centre]).toBe(source.data[centre]);
      // Outside the region the board is untouched.
      const outside = await sharp(composed).extract({ left: 0, top: 0, width: 40, height: 40 }).raw().toBuffer();
      const originalOutside = await sharp(b).extract({ left: 0, top: 0, width: 40, height: 40 }).raw().toBuffer();
      expect(outside.equals(originalOutside)).toBe(true);
    }
  });

  it("refuses a region or patch that does not line up with the board", async () => {
    const b = await board();
    await expect(seam(b, await cut(b, { ...REGION, width: 100 }))).rejects.toThrow(/but the region is/);
    const clean = await seam(b, await cut(b));
    await expect(applyLocalPatch(b, { left: 700, top: 800, width: 220, height: 320 }, await cut(b), { fade: false, report: clean })).rejects.toThrow(/outside the board/);
  });

  it("actually stops the composition when a fade is asked for a moved patch", async () => {
    // The previous test only checked the diagnosis. This one checks that the
    // decision is enforced where it matters: a caller cannot read "misaligned"
    // and blend anyway.
    const b = await board();
    const shifted = await cut(b, { ...REGION, left: REGION.left + 2 });
    const report = await seam(b, shifted);
    expect(report.verdict).toBe("misaligned");
    await expect(applyLocalPatch(b, REGION, shifted, { fade: true, report })).rejects.toThrow(/fade is refused/);
    // A hard placement is still allowed, so the patch can be looked at.
    await expect(applyLocalPatch(b, REGION, shifted, { fade: false, report })).resolves.toBeInstanceOf(Buffer);
  });

  it("catches a neighbour repainted inside the crop, which a quiet border hides", async () => {
    const b = await board();
    // The added figure, plus a second change well away from it: exactly the case
    // a border-only check cannot see.
    const meddled = await sharp(await cut(b))
      .composite([
        { input: Buffer.from('<svg width="70" height="150"><ellipse cx="35" cy="75" rx="35" ry="75" fill="rgb(240,180,150)"/></svg>'), left: 75, top: 90 },
        { input: Buffer.from('<svg width="40" height="60"><rect width="40" height="60" fill="rgb(10,10,200)"/></svg>'), left: 20, top: 240 },
      ]).png().toBuffer();
    const report = await seam(b, meddled);
    expect(report.strayChangedFraction).toBeGreaterThan(0);
    expect(report.verdict).toBe("background-rewritten");
    await expect(applyLocalPatch(b, REGION, meddled, { fade: true, report })).rejects.toThrow(/fade is refused/);
  });

  it("catches a crop whose middle was replaced wholesale, with no child at all", async () => {
    // The counter-test that broke the previous version: 71.6% of the interior
    // replaced by a flat rectangle, no figure, borders left untouched. Inferring
    // the child's area from what changed read that rectangle AS the child and
    // exempted it. A rectangle declared beforehand cannot be talked around.
    const b = await board();
    const gutted = await sharp(await cut(b))
      .composite([{ input: Buffer.from('<svg width="180" height="280"><rect width="180" height="280" fill="rgb(10,10,200)"/></svg>'), left: 20, top: 20 }])
      .png().toBuffer();
    const report = await seam(b, gutted);
    expect(report.changedFraction).toBeGreaterThan(0.7);
    expect(report.strayChangedFraction).toBeGreaterThan(0.3);
    expect(report.verdict).toBe("background-rewritten");
    await expect(applyLocalPatch(b, REGION, gutted, { fade: true, report })).rejects.toThrow(/fade is refused/);
  });

  it("requires the allowed rectangle to sit inside the region", async () => {
    const b = await board();
    await expect(analysePatchSeam(b, REGION, await cut(b), { allowedRect: { left: 0, top: 0, width: 999, height: 10 } }))
      .rejects.toThrow(/must sit inside the region/);
  });
});
