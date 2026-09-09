import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { sha256Bytes } from "../fixed-sprite";
import { composeOpenPlacement, type OpenPlacementInput } from "../open-placement";
import { STANDING_PIXEL_REFINEMENT_V2 } from "../standing-pixels";
import { CROWN_FRINGE_REFINEMENT_V3 } from "../crown-fringe";

async function fixture(): Promise<OpenPlacementInput> {
  const raw = Buffer.alloc(40 * 80 * 4);
  for (let y = 5; y <= 74; y++) for (let x = 10; x <= 29; x++) {
    const i = (y * 40 + x) * 4; raw[i] = 200; raw[i + 1] = 120; raw[i + 2] = 90; raw[i + 3] = 255;
  }
  const bound = (png: Buffer) => ({ png, sha256: sha256Bytes(png) });
  const png = await sharp(raw, { raw: { width: 40, height: 80, channels: 4 } }).png().toBuffer();
  return { source: { ...bound(png), eye: { x: 20, y: 15 }, chin: { x: 20, y: 25 },
    protectedFacePolygon: [{ x: 15, y: 12 }, { x: 25, y: 12 }, { x: 25, y: 26 }, { x: 15, y: 26 }],
    measurement: { kind: "manual-pilot", note: "Synthetic full figure with observed soles" },
    standing: { complete: true, originalFrameClear: true, crown: { x: 20, y: 5 }, leftSole: { x: 14, y: 74 }, rightSole: { x: 25, y: 74 } } },
    board: bound(await sharp({ create: { width: 100, height: 100, channels: 4, background: "white" } }).png().toBuffer()),
    foreground: bound(await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } }).png().toBuffer()),
    slot: { id: "open", mode: "open", pose: "standing", eye: { x: 50, y: 26.9 }, faceHeightPx: 9,
      supportPointPx: { x: 50, y: 80 }, standingHeightPx: 62.1, window: { left: 0, top: 0, width: 100, height: 100 } } };
}

describe("open standing composition", () => {
  it("places a complete child on support without requiring a hidden cut", async () => {
    const result = await composeOpenPlacement(await fixture());
    expect(result.ok).toBe(true);
    expect(result.automaticRelease).toBe(false);
    expect(result).not.toHaveProperty("source.lowerCutY");
  });
  it("rejects an incomplete bust even if its alpha has a bottom row", async () => {
    const input = await fixture(); input.source.standing.complete = false;
    expect((await composeOpenPlacement(input)).checks.completeFigure).toBe(false);
  });
  it("rejects unsupported inferred feet", async () => {
    const input = await fixture(); input.source.standing.leftSole.x = 1;
    expect((await composeOpenPlacement(input)).ok).toBe(false);
  });
  it("rejects an unreadable face when the authored standing height is too small", async () => {
    const input = await fixture(); input.slot.standingHeightPx = 30;
    expect((await composeOpenPlacement(input)).checks.faceReadableAndNotOversized).toBe(false);
  });
  it("uses standing height, not a large face target, so the source cannot become a giant", async () => {
    const input = await fixture(); input.slot.faceHeightPx = 20;
    const result = await composeOpenPlacement(input);
    expect(result.measurements.standingHeightPx).toBeCloseTo(62.1);
    expect(result.ok).toBe(true);
  });
  it("rejects original canvas clipping even when extraction adds clear padding", async () => {
    const input = await fixture(); input.source.standing.originalFrameClear = false;
    expect((await composeOpenPlacement(input)).ok).toBe(false);
  });
  it("rejects overlap with an authored protected bystander", async () => {
    const input = await fixture(); input.slot.forbiddenRects = [{ id: "bystander", left: 45, top: 30, width: 10, height: 50 }];
    expect((await composeOpenPlacement(input)).checks.forbiddenRegionsClear).toBe(false);
  });
  it("rejects a placement outside its fixed window", async () => {
    const input = await fixture(); input.slot.window = { left: 0, top: 0, width: 20, height: 20 };
    expect((await composeOpenPlacement(input)).checks.withinFrozenWindow).toBe(false);
  });
  it("rejects changed source bytes", async () => {
    const input = await fixture(); input.source.sha256 = "0".repeat(64);
    await expect(composeOpenPlacement(input)).rejects.toThrow("bound image");
  });
});

/** Synthetic anatomy follows the paid Tokyo receipt's coordinates, without
 * retaining or fetching any child image. Left sole is9source px from its ink,
 * but the other foot still controls maxY, so correction moves the board<1px. */
async function tokyoGeometry(): Promise<OpenPlacementInput> {
  const width = 300, height = 850, raw = Buffer.alloc(width * height * 4);
  const rectangle = (left: number, top: number, right: number, bottom: number) => {
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) { const i = (y * width + x) * 4; raw[i] = 80; raw[i + 1] = 100; raw[i + 2] = 120; raw[i + 3] = 255; }
  };
  rectangle(125, 12, 165, 120); rectangle(115, 100, 195, 650);
  rectangle(105, 640, 120, 790); rectangle(105, 790, 112, 810);
  rectangle(185, 640, 201, 813); rectangle(195, 810, 209, 824);
  const bound = (png: Buffer) => ({ png, sha256: sha256Bytes(png) });
  return { source: { ...bound(await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer()), eye: { x: 140, y: 55 }, chin: { x: 140, y: 87 },
    protectedFacePolygon: [{ x: 132, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 88 }, { x: 132, y: 88 }], measurement: { kind: "observed", note: "Synthetic Tokyo-coordinate receipt" },
    standing: { complete: true, originalFrameClear: true, crown: { x: 138, y: 12 }, leftSole: { x: 116, y: 818 }, rightSole: { x: 209, y: 823 } } },
    board: bound(await sharp({ create: { width: 600, height: 500, channels: 4, background: "white" } }).png().toBuffer()),
    foreground: bound(await sharp({ create: { width: 600, height: 500, channels: 4, background: "#00000000" } }).png().toBuffer()),
    slot: { id: "tokyo-synthetic", mode: "open", pose: "standing", eye: { x: 290, y: 124 }, faceHeightPx: 12, standingHeightPx: 811 * .333745,
      supportPointPx: { x: 300, y: 380 }, window: { left: 0, top: 0, width: 600, height: 500 }, pixelRefinement: STANDING_PIXEL_REFINEMENT_V2 } };
}

describe("opt-in standing refinement bounded by the actual board transform", () => {
  it("corrects Tokyo's9source-pixel contour miss only because every transformed source corner moves0.66749board px", async () => {
    const input = await tokyoGeometry(), result = await composeOpenPlacement(input);
    expect(result.ok).toBe(true); expect(result.source.standing.leftSole).toEqual({ x: 116, y: 818 });
    const raster = result.source.rasterStanding;
    expect(raster.version).toBe(STANDING_PIXEL_REFINEMENT_V2);
    expect(raster.leftSole).toEqual({ x: 112, y: 810 });
    expect("refinement" in raster && raster.refinement).toMatchObject({ applied: true, reason: "accepted-bounded-quantization", nearest: { leftSole: { x: 112, y: 810 } } });
    if (!("refinement" in raster)) throw new Error("refinement provenance missing");
    expect(raster.refinement.maxCornerDisplacementPx).toBeCloseTo(.66749, 5);
    expect(result.automaticRelease).toBe(false);
  });
  it("preserves the old3pixel rejection and historical output shape without the opt-in policy", async () => {
    const input = await tokyoGeometry(); delete input.slot.pixelRefinement;
    const result = await composeOpenPlacement(input); expect(result.ok).toBe(false);
    expect(result.source.rasterStanding.version).toBe("bounded-three-source-pixel-contour/v1"); expect(result.source.rasterStanding).not.toHaveProperty("refinement");
  });
  it("measures additional fallback from the renderer's already-resolved crown, retaining the larger total raw displacement separately", async () => {
    const input = await tokyoGeometry();
    const image = await sharp(input.source.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Real Tokyo crown(138,12) resolves normally to(137,14). The source top
    // remains12 elsewhere; this standard correction predates the new fallback.
    for (let y = 12; y <= 13; y++) for (let x = 136; x <= 140; x++) image.data[(y * image.info.width + x) * 4 + 3] = 0;
    for (let x = 138; x <= 140; x++) image.data[(14 * image.info.width + x) * 4 + 3] = 0;
    input.source.png = await sharp(image.data, { raw: { width: image.info.width, height: image.info.height, channels: 4 } }).png().toBuffer(); input.source.sha256 = sha256Bytes(input.source.png);
    const result = await composeOpenPlacement(input), raster = result.source.rasterStanding;
    expect(result.ok).toBe(true); if (!("refinement" in raster)) throw new Error("missing provenance");
    expect(raster.refinement.raw.crown).toEqual({ x: 138, y: 12 }); expect(raster.refinement.baseline.crown).toEqual({ x: 137, y: 14 });
    expect(raster.refinement.baseline.leftSole).toEqual({ x: 116, y: 818 }); expect(raster.refinement.nearest.leftSole).toEqual({ x: 112, y: 810 });
    expect(raster.refinement.maxRawCornerDisplacementPx).toBeGreaterThan(1);
    expect(raster.refinement.maxCornerDisplacementPx).toBeCloseTo(2 * input.slot.standingHeightPx / 809, 6);
    expect(raster.refinement.maxCornerDisplacementPx).toBeLessThan(1); expect(raster.refinement.maxRasterCornerDisplacementPx).toBeLessThanOrEqual(1);
  });
  it("rejects moving the actual supporting foot by7source pixels when the full-image board displacement exceeds1px", async () => {
    const input = await tokyoGeometry(); input.source.standing.leftSole = { x: 112, y: 810 }; input.source.standing.rightSole.y = 831;
    const result = await composeOpenPlacement(input); expect(result.ok).toBe(false);
    const raster = result.source.rasterStanding; if (!("refinement" in raster)) throw new Error("missing provenance");
    expect(raster.refinement.maxCornerDisplacementPx).toBeGreaterThan(1); expect(raster.refinement.applied).toBe(false);
  });
  it.each(["floating", "missing-foot", "ambiguous-feet", "unsupported-crown", "incomplete", "frame-contact"] as const)("never repairs%s into anatomy approval", async defect => {
    const input = await tokyoGeometry();
    if (defect === "floating") { input.source.standing.leftSole.y = 840; input.source.standing.rightSole.y = 842; }
    if (defect === "missing-foot") {
      const image = await sharp(input.source.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let y = 780; y < image.info.height; y++) for (let x = 0; x < 150; x++) image.data[(y * image.info.width + x) * 4 + 3] = 0;
      input.source.png = await sharp(image.data, { raw: { width: image.info.width, height: image.info.height, channels: 4 } }).png().toBuffer(); input.source.sha256 = sha256Bytes(input.source.png);
    }
    if (defect === "ambiguous-feet") { input.source.standing.leftSole = { x: 113, y: 818 }; input.source.standing.rightSole = { x: 122, y: 818 }; }
    if (defect === "unsupported-crown") input.source.standing.crown.y = 8;
    if (defect === "incomplete") input.source.standing.complete = false;
    if (defect === "frame-contact") input.source.standing.originalFrameClear = false;
    expect((await composeOpenPlacement(input)).checks.completeFigure).toBe(false);
  });
  it("still rejects forbidden geometry and covered facial pixels after a successful contour refinement", async () => {
    const input = await tokyoGeometry(); input.slot.forbiddenRects = [{ id: "bystander", left: 250, top: 140, width: 100, height: 200 }];
    expect((await composeOpenPlacement(input)).checks.forbiddenRegionsClear).toBe(false);
    input.slot.forbiddenRects = [];
    input.foreground.png = Buffer.from(input.board.png); input.foreground.sha256 = input.board.sha256;
    const covered = await composeOpenPlacement(input); expect(covered.checks.protectedFaceVisible).toBe(false); expect(covered.ok).toBe(false);
  });
});

async function crownFringeGeometry() {
  const input = await tokyoGeometry();
  const image = await sharp(input.source.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 8; y < 12; y++) image.data[(y * image.info.width + 138) * 4 + 3] = 178;
  input.source.png = await sharp(image.data, { raw: { width: image.info.width, height: image.info.height, channels: 4 } }).png().toBuffer();
  input.source.sha256 = sha256Bytes(input.source.png);
  input.source.standing.crown = { x: 138, y: 8 };
  input.source.standing.leftSole = { x: 112, y: 810 };
  input.slot.pixelRefinement = CROWN_FRINGE_REFINEMENT_V3;
  return input;
}

describe("v3 crown-fringe composition with unchanged semantic crown", () => {
  it("changes validation only, preserving exact PNG pixels and transform of the old diagnostic image", async () => {
    const input = await crownFringeGeometry();
    input.slot.pixelRefinement = STANDING_PIXEL_REFINEMENT_V2;
    const previous = await composeOpenPlacement(input); expect(previous.checks.completeFigure).toBe(false);
    input.slot.pixelRefinement = CROWN_FRINGE_REFINEMENT_V3;
    const revised = await composeOpenPlacement(input);
    expect(revised.ok).toBe(true); expect(revised.transform).toEqual(previous.transform);
    expect(revised.patchPng.equals(previous.patchPng)).toBe(true); expect(revised.compositePng.equals(previous.compositePng)).toBe(true);
    expect(revised.source.standing.crown).toEqual({ x: 138, y: 8 });
    expect(revised.source.rasterStanding).toMatchObject({ version: CROWN_FRINGE_REFINEMENT_V3, crown: { x: 138, y: 8 },
      crownFringe: { accepted: true, coordinateChanged: false, additionalCrownTransformShiftPx: 0 } });
    expect(revised.automaticRelease).toBe(false);
  });
  it("retains the feet-only1native-pixel precision bound alongside fringe validation", async () => {
    const input = await crownFringeGeometry(); input.source.standing.leftSole = { x: 116, y: 818 };
    const result = await composeOpenPlacement(input); expect(result.ok).toBe(true);
    const raster = result.source.rasterStanding; if (!("refinement" in raster)) throw new Error("missing refinement");
    expect(raster.refinement.applied).toBe(true); expect(raster.refinement.maxCornerDisplacementPx).toBeLessThan(1);
    input.source.standing.leftSole = { x: 112, y: 810 }; input.source.standing.rightSole.y = 831;
    expect((await composeOpenPlacement(input)).checks.completeFigure).toBe(false);
  });
  it.each(["incomplete", "clipped-head", "face-hole", "covered-face", "crown-beyond-native-top-bound"])("retains rejection of%s", async defect => {
    const input = await crownFringeGeometry();
    if (defect === "incomplete") input.source.standing.complete = false;
    if (defect === "clipped-head") input.source.standing.originalFrameClear = false;
    if (defect === "covered-face") { input.foreground.png = Buffer.from(input.board.png); input.foreground.sha256 = input.board.sha256; }
    if (defect === "face-hole" || defect === "crown-beyond-native-top-bound") {
      const image = await sharp(input.source.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (defect === "face-hole") image.data[(55 * image.info.width + 140) * 4 + 3] = 0;
      else { input.source.standing.crown.y = 1; for (let y = 1; y < 8; y++) image.data[(y * image.info.width + 138) * 4 + 3] = 178; }
      input.source.png = await sharp(image.data, { raw: { width: image.info.width, height: image.info.height, channels: 4 } }).png().toBuffer();
      input.source.sha256 = sha256Bytes(input.source.png);
    }
    expect((await composeOpenPlacement(input)).ok).toBe(false);
  });
});
