import { describe, expect, it } from "vitest";
import { guardedEditBounds, inspectScenePreservation, type PixelRect } from "../../../scripts/lib/scene-preservation-preflight";

const rect = (left: number, top: number, width: number, height: number): PixelRect => ({ left, top, width, height });
const base = {
  board: { width: 1000, height: 1000 }, crop: rect(100, 100, 512, 768), editable: rect(300, 300, 100, 200),
  regions: [{ id: "prop", rect: rect(150, 200, 100, 100), protectPixels: true }],
} as const;

describe("offline scene-preservation geometry (not visual approval)", () => {
  it("recomputes guard clipping when context grows instead of preserving the old permission", () => {
    const mask = rect(1280, 1488, 476, 390);
    expect(guardedEditBounds(rect(1262, 1300, 512, 768), mask, 120)).toEqual(rect(1262, 1368, 512, 630));
    const crop = rect(970, 1300, 820, 768), editable = guardedEditBounds(crop, mask, 120);
    expect(editable).toEqual(rect(1160, 1368, 630, 630));
    expect(inspectScenePreservation({ board: { width: 3840, height: 2160 }, crop, editable,
      regions: [{ id: "arch", rect: rect(990, 1510, 420, 400), protectPixels: true }] }))
      .toMatchObject({ geometryClear: false, requiredContext: rect(990, 1368, 800, 630), fitsExistingCropSize: true,
        issues: [{ regionId: "arch", code: "edit-touches-protected-region" }] });
    expect(guardedEditBounds(crop, mask, 0)).toEqual(mask);
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])("rejects an invalid guard %s", guard => {
    expect(() => guardedEditBounds(base.crop, base.editable, guard)).toThrow(/Scene preflight/);
  });
  it("rejects masks outside the crop", () => {
    expect(() => guardedEditBounds(base.crop, rect(0, 0, 100, 100), 120)).toThrow(/Scene preflight/);
  });
  it("accepts visible protected context outside composition permission without mutation", () => {
    const before = JSON.stringify(base);
    expect(inspectScenePreservation(base)).toMatchObject({ geometryClear: true, fitsExistingCropSize: true, visualAcceptance: "not-assessed" });
    expect(JSON.stringify(base)).toBe(before);
  });
  it("distinguishes a clipped prop from absent context", () => {
    expect(inspectScenePreservation({ ...base, regions: [{ ...base.regions[0], rect: rect(50, 200, 100, 100) }] }).issues)
      .toEqual([{ regionId: "prop", code: "context-clips-region" }]);
    expect(inspectScenePreservation({ ...base, regions: [{ ...base.regions[0], rect: rect(700, 200, 100, 100) }] }).issues)
      .toEqual([{ regionId: "prop", code: "context-misses-region" }]);
  });
  it("fails even a fully visible protected prop when editing can overwrite it", () => {
    expect(inspectScenePreservation({ ...base, regions: [{ ...base.regions[0], rect: rect(350, 350, 10, 10) }] }).issues)
      .toEqual([{ regionId: "prop", code: "edit-touches-protected-region" }]);
  });
  it("allows declared editable context, without claiming pixel preservation", () => {
    expect(inspectScenePreservation({ ...base, regions: [{ id: "child", rect: base.editable, protectPixels: false }] }).geometryClear).toBe(true);
  });
  it("uses half-open edges: touching is safe, one-pixel overlap is not", () => {
    const at = (left: number) => inspectScenePreservation({ ...base, regions: [{ ...base.regions[0], rect: rect(left, 300, 10, 10) }] });
    expect(at(400).issues).toEqual([]);
    expect(at(399).issues).toHaveLength(1);
  });
  it("shows why moving the dragon crop or only widening it is not a preservation fix", () => {
    // Conservative manual annotation of the public source arch + loose block,
    // NOT a segmentation fixture or a corrected/approved game placement.
    const dragon = { board: { width: 3840, height: 2160 }, crop: rect(1262, 1300, 512, 768),
      editable: rect(1280, 1488, 476, 390),
      regions: [{ id: "arch-and-block", rect: rect(990, 1510, 420, 400), protectPixels: true }] };
    expect(inspectScenePreservation(dragon)).toMatchObject({ geometryClear: false, fitsExistingCropSize: false,
      requiredContext: rect(990, 1488, 766, 422),
      issues: [{ regionId: "arch-and-block", code: "context-clips-region" }, { regionId: "arch-and-block", code: "edit-touches-protected-region" }] });
    expect(inspectScenePreservation({ ...dragon, crop: rect(970, 1300, 820, 768) }).issues)
      .toEqual([{ regionId: "arch-and-block", code: "edit-touches-protected-region" }]);
  });
  it("checks the wider compositor return, not merely the provider mask", () => {
    const dragon = { board: { width: 3840, height: 2160 }, crop: rect(1262, 1300, 512, 768),
      editable: rect(1262, 1368, 512, 630),
      regions: [{ id: "arch", rect: rect(990, 1510, 420, 400), protectPixels: true }] };
    expect(inspectScenePreservation(dragon)).toMatchObject({ geometryClear: false,
      requiredContext: rect(990, 1368, 784, 630), fitsExistingCropSize: false });
  });
  it.each([
    { crop: rect(-1, 0, 512, 768) }, { crop: rect(100, 300, 512, 768) },
    { editable: rect(99, 300, 100, 200) }, { editable: rect(300.5, 300, 100, 200) },
    { editable: rect(300, 300, 0, 200) }, { board: { width: NaN, height: 1000 } },
    { regions: [] }, { regions: [base.regions[0], base.regions[0]] },
    { regions: [{ ...base.regions[0], rect: rect(990, 200, 100, 100) }] },
  ])("rejects invalid annotations/geometry rather than silently clipping: %j", override => {
    expect(() => inspectScenePreservation({ ...base, ...override })).toThrow(/Scene preflight/);
  });
});
