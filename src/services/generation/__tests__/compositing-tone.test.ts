import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { applyCompositingTone, type CompositingTone } from "../compositing-tone";
import { sha256Bytes } from "../fixed-sprite";

const tone: CompositingTone = { version: "local-exposure-chroma/v1", exposureStops: -.5, saturation: .65 };
const linear = (v: number) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
const luminance = (rgb: number[]) => .2126 * linear(rgb[0]! / 255) + .7152 * linear(rgb[1]! / 255) + .0722 * linear(rgb[2]! / 255);
async function fixture() {
  const rgba = Buffer.from([250, 40, 30, 255, 150, 90, 55, 224, 10, 180, 230, 71, 255, 0, 180, 0]);
  const png = await sharp(rgba, { raw: { width: 2, height: 2, channels: 4 } }).png().toBuffer();
  return { rgba, source: { png, sha256: sha256Bytes(png) } };
}
describe("bounded local exposure/chroma grade", () => {
  it("preserves every alpha byte, image dimensions and raw paid source", async () => {
    const f = await fixture(), original = Buffer.from(f.source.png), result = await applyCompositingTone(f.source, tone);
    const graded = await sharp(result.source.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(graded.info.width).toBe(2); expect(graded.info.height).toBe(2);
    expect([3, 7, 11, 15].map(i => graded.data[i])).toEqual([255, 224, 71, 0]);
    expect(graded.data.subarray(12)).toEqual(f.rgba.subarray(12));
    expect(f.source.png).toEqual(original); expect(sha256Bytes(result.source.png)).toBe(result.source.sha256);
    expect(result.provenance).toMatchObject({ alphaPreservedExactly: true, originalSourcePreserved: true,
      geometryChanged: false, originalSourceSha256: f.source.sha256, derivedSourceSha256: result.source.sha256, modifiedPixels: 3, semanticStatus: "pending" });
  });
  it("preserves linear luminance during saturation adjustment before the requested exposure attenuation", async () => {
    const f = await fixture(), result = await applyCompositingTone(f.source, tone);
    const rgb = await sharp(result.source.png).ensureAlpha().raw().toBuffer();
    for (const i of [0, 4, 8]) expect(luminance([...rgb.subarray(i, i + 3)]))
      .toBeCloseTo(luminance([...f.rgba.subarray(i, i + 3)]) * 2 ** tone.exposureStops, 2);
  });
  it("keeps identity grade PNG bytes exactly unchanged", async () => {
    const f = await fixture(), result = await applyCompositingTone(f.source, { ...tone, saturation: 1, exposureStops: 0 });
    expect(result.source.png).toEqual(f.source.png); expect(result.source.sha256).toBe(f.source.sha256);
    expect(result.provenance.modifiedPixels).toBe(0);
  });
  it.each([{ exposureStops: .01 }, { exposureStops: -.76 }, { saturation: 1.01 }, { saturation: .49 }])("rejects out-of-budget optical parameters %j", async override => {
    await expect(applyCompositingTone((await fixture()).source, { ...tone, ...override })).rejects.toThrow();
  });
  it("refuses a wrong source hash instead of grading unrelated bytes", async () => {
    const f = await fixture(); f.source.sha256 = "0".repeat(64);
    await expect(applyCompositingTone(f.source, tone)).rejects.toThrow(/bound source bytes changed/);
  });
});
