import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { composeSimplePeek, findSimplePeekCut, type SimplePeekInput } from "../simple-peek";
import { sha256Bytes } from "../fixed-sprite";

async function png(data: Buffer, width: number, height: number) {
  const bytes = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { png: bytes, sha256: sha256Bytes(bytes) };
}

async function fixture() {
  const sprite = Buffer.alloc(20 * 24 * 4), board = Buffer.alloc(80 * 60 * 4), mask = Buffer.alloc(80 * 60 * 4);
  for (let y = 4; y < 24; y++) for (let x = 5; x < 15; x++) sprite.set([210, 70, 40, 255], (y * 20 + x) * 4);
  for (let y = 0; y < 60; y++) for (let x = 0; x < 80; x++) {
    const i = (y * 80 + x) * 4; board.set([40, 90, 130, 255], i); mask.set([40, 90, 130, y >= 28 ? 255 : 0], i);
  }
  const input: SimplePeekInput = {
    source: { ...await png(sprite, 20, 24), eye: { x: 10, y: 8 }, chin: { x: 10, y: 12 },
      protectedFacePolygon: [{ x: 7, y: 7 }, { x: 13, y: 7 }, { x: 13, y: 13 }, { x: 7, y: 13 }],
      lowerCutY: 20, measurement: { kind: "manual-pilot", note: "Synthetic fixture; explicitly marked eye and chin, no inferred soles." } },
    board: await png(board, 80, 60), foreground: await png(mask, 80, 60),
    slot: { id: "easy-upper-body", pose: "crouch", eye: { x: 40, y: 20 }, faceHeightPx: 4, window: { left: 30, top: 12, width: 20, height: 30 } },
  };
  return { input, sprite, board, mask };
}

describe("separate simple occluded upper-body pilot", () => {
  it("finds the first already-hidden cut without moving the fixed eye or scale", async () => {
    const { input } = await fixture();
    const before = structuredClone(input.slot);
    const lowerCutY = await findSimplePeekCut(input, { minCutY: 16 });
    expect(lowerCutY).toBe(19);
    expect(input.slot).toEqual(before);
    const result = await composeSimplePeek({ ...input, source: { ...input.source, lowerCutY: lowerCutY! } });
    expect(result.ok).toBe(true); expect(result.transform).toEqual({ scale: 1, translateX: 30, translateY: 12 });
    await expect(findSimplePeekCut(input, { minCutY: 15 })).rejects.toThrow("one face distance below the chin");
  });

  it("returns null when no cut is hidden instead of inventing support or masking pixels", async () => {
    const { input, mask } = await fixture(); for (let i = 3; i < mask.length; i += 4) mask[i] = 0;
    input.foreground = await png(mask, 80, 60);
    expect(await findSimplePeekCut(input, { minCutY: 16 })).toBeNull();
  });

  it.each(["side-lean", "crouch", "seated"] as const)("accepts %s with a fixed eye anchor and truly hidden cut edge, without a standing contract", async pose => {
    const { input, board } = await fixture(); input.slot.pose = pose;
    const result = await composeSimplePeek(input);
    expect(result.ok).toBe(true);
    expect(result.transform).toEqual({ scale: 1, translateX: 30, translateY: 12 });
    expect(result.measurement.kind).toBe("manual-pilot");
    expect(result.semanticStatus).toBe("pending"); expect(result.automaticRelease).toBe(false);
    expect(result.source).not.toHaveProperty("feet"); expect(result.source).not.toHaveProperty("seatContact");
    const composite = await sharp(result.compositePng).ensureAlpha().raw().toBuffer();
    // Occluding object is exactly the original board, and unrelated pixels stay unchanged.
    expect(composite.subarray(28 * 80 * 4)).toEqual(board.subarray(28 * 80 * 4));
    expect(composite.subarray(0, 10 * 80 * 4)).toEqual(board.subarray(0, 10 * 80 * 4));
    const metadata = await sharp(result.contextPng).metadata(); expect([metadata.width, metadata.height]).toEqual([20, 30]);
  });

  it("rejects a single leaking bottom-cut mask pixel, even at alpha254", async () => {
    const { input, mask } = await fixture(); mask[(31 * 80 + 40) * 4 + 3] = 254;
    input.foreground = await png(mask, 80, 60);
    const result = await composeSimplePeek(input);
    expect(result.ok).toBe(false); expect(result.checks.lowerCutFullyOccluded).toBe(false);
    expect(result.measurements.lowerCutUnmaskedNativePixels).toBeGreaterThan(0);
  });

  it("does not call a floating torso valid merely because feet were omitted", async () => {
    const { input, mask } = await fixture(); for (let i = 3; i < mask.length; i += 4) mask[i] = 0;
    input.foreground = await png(mask, 80, 60);
    const result = await composeSimplePeek(input);
    expect(result.ok).toBe(false); expect(result.checks.lowerCutFullyOccluded).toBe(false);
    expect(result.checks.actualForegroundOcclusion).toBe(false);
  });

  it("rejects holes in the protected face and does not repair them", async () => {
    const { input, sprite } = await fixture(); sprite[(9 * 20 + 9) * 4 + 3] = 0;
    input.source = { ...input.source, ...await png(sprite, 20, 24) };
    const result = await composeSimplePeek(input);
    expect(result.ok).toBe(false); expect(result.measurements.sourceFaceMissingPixels).toBe(1);
  });

  it("rejects a foreground object crossing the face", async () => {
    const { input, mask } = await fixture(); mask[(21 * 80 + 39) * 4 + 3] = 255;
    input.foreground = await png(mask, 80, 60);
    const result = await composeSimplePeek(input);
    expect(result.checks.protectedFaceVisible).toBe(false); expect(result.ok).toBe(false);
  });

  it("requires a real lower cut through opaque source, not an invented hidden point", async () => {
    const { input, sprite } = await fixture();
    for (let x = 0; x < 20; x++) sprite[(19 * 20 + x) * 4 + 3] = 0;
    input.source = { ...input.source, ...await png(sprite, 20, 24) };
    const result = await composeSimplePeek(input);
    expect(result.checks.lowerCutHasSourceSupport).toBe(false); expect(result.ok).toBe(false);
  });

  it("rejects top/side truncation independently from intentional hidden lower-body clipping", async () => {
    const { input, sprite } = await fixture(); sprite.set([210, 70, 40, 255], (10 * 20) * 4);
    input.source = { ...input.source, ...await png(sprite, 20, 24) };
    expect((await composeSimplePeek(input)).checks.onlyLowerEdgeTruncated).toBe(false);
  });

  it("rejects changed original-board bytes or foreground RGB invented after authoring", async () => {
    const { input, mask } = await fixture();
    await expect(composeSimplePeek({ ...input, board: { ...input.board, sha256: "0".repeat(64) } })).rejects.toThrow("bound image bytes changed");
    mask[(30 * 80 + 40) * 4] = 255; input.foreground = await png(mask, 80, 60);
    await expect(composeSimplePeek(input)).rejects.toThrow("not from the bound original board");
  });

  it("uses one uniform scale, rejects upscale, and never shifts to evade a forbidden person", async () => {
    const { input } = await fixture();
    input.slot.forbiddenRects = [{ id: "existing-person", left: 38, top: 20, width: 4, height: 5 }];
    const result = await composeSimplePeek(input);
    expect(result.checks.forbiddenRegionsClear).toBe(false); expect(result.transform.translateX).toBe(30);
    input.slot.faceHeightPx = 5; await expect(composeSimplePeek(input)).rejects.toThrow("no pilot upscale");
  });

  it("does not move or resize a source to fit an overly small frozen window", async () => {
    const { input } = await fixture(); input.slot.window = { left: 38, top: 20, width: 4, height: 5 };
    const result = await composeSimplePeek(input);
    expect(result.checks.withinFrozenWindow).toBe(false); expect(result.transform.scale).toBe(1);
  });

  it("protects exact polygon pixels, not empty corners in their bounding rectangle", async () => {
    const { input } = await fixture();
    input.slot.forbiddenPolygons = [{ id: "feature", polygon: [{ x: 30, y: 15 }, { x: 40, y: 15 }, { x: 30, y: 17 }] }];
    const result = await composeSimplePeek(input);
    expect(result.checks.forbiddenRegionsClear).toBe(true);
    input.slot.forbiddenPolygons[0]!.polygon = [{ x: 38, y: 20 }, { x: 42, y: 20 }, { x: 40, y: 24 }];
    expect((await composeSimplePeek(input)).checks.forbiddenRegionsClear).toBe(false);
  });

  it("unions exact polygons and old rectangles without changing or double-counting rectangle protection", async () => {
    const { input } = await fixture();
    input.slot.forbiddenRects = [{ id: "old-person", left: 38, top: 20, width: 4, height: 5 }];
    const old = await composeSimplePeek(input);
    input.slot.forbiddenPolygons = [{ id: "same-person", polygon: [{ x: 38, y: 20 }, { x: 42, y: 20 }, { x: 42, y: 25 }, { x: 38, y: 25 }] }];
    const both = await composeSimplePeek(input);
    expect(both.measurements.forbiddenPixels).toBe(old.measurements.forbiddenPixels);
    expect(both.checks.forbiddenRegionsClear).toBe(false);
  });

  it.each([
    [{ x: 1, y: 1 }, { x: 2, y: 2 }],
    [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }],
    [{ x: -1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
    [{ x: 1, y: 1 }, { x: Number.NaN, y: 1 }, { x: 2, y: 2 }],
    [{ x: 1, y: 1 }, { x: 81, y: 1 }, { x: 2, y: 2 }],
  ].map(polygon => ({ polygon })))("rejects invalid forbidden feature polygons", async ({ polygon }) => {
    const { input } = await fixture(); input.slot.forbiddenPolygons = [{ id: "invalid", polygon }];
    await expect(composeSimplePeek(input)).rejects.toThrow("forbidden polygon");
  });
});
