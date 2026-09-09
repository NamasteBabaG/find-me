import { describe, expect, it } from "vitest";
import { solveFixedScale } from "../fixed-scale-solver";
import {
  computeFixedPlacement, evaluateFixedPlacement, extractSpriteCell, fixedPlacementManifest, sha256Bytes, sha256Rgba,
  visibleSpriteSourceSchema, fixedSlotV3ContractSchema,
  type FixedSlotContract, type FixedSlotContractV3, type NormalizedPolygon, type SpriteSource, type VisibleSpriteSource,
} from "../fixed-sprite";

const WIDTH = 32;
const HEIGHT = 40;
const BOARD = { sha256: "a".repeat(64), width: 200, height: 200 };
const box = (x: number, y: number, w: number, h: number): NormalizedPolygon => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const SOURCE: SpriteSource = {
  poseId: "standing-front",
  landmarks: {
    headTop: { x: 16 / WIDTH, y: 5 / HEIGHT },
    headBottom: { x: 16 / WIDTH, y: 14 / HEIGHT },
    feet: { x: 16 / WIDTH, y: 36 / HEIGHT },
    seatContact: { x: 19 / WIDTH, y: 26 / HEIGHT },
  },
  protectedFacePolygon: box(14 / WIDTH, 8 / HEIGHT, 4 / WIDTH, 4 / HEIGHT),
  landmarkTolerancePx: 1,
};

function paint(rgba: Buffer, x: number, y: number, width: number, height: number, alpha = 255, canvasWidth = WIDTH) {
  for (let dy = y; dy < y + height; dy++) for (let dx = x; dx < x + width; dx++) {
    const i = (dy * canvasWidth + dx) * 4;
    rgba[i] = 90; rgba[i + 1] = 120; rgba[i + 2] = 180; rgba[i + 3] = alpha;
  }
}
function figure() {
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
  paint(rgba, 11, 5, 11, 10);
  paint(rgba, 12, 15, 9, 22);
  return rgba;
}
function extract(rgba = figure(), source = SOURCE, reviewed = true) {
  return extractSpriteCell({
    rgba, width: WIDTH, height: HEIGHT,
    grid: { cells: [{ id: "front", left: 0, top: 0, width: WIDTH, height: HEIGHT }] }, cellId: "front", source,
    ...(reviewed ? { review: { sourceSha256: sha256Rgba(rgba, WIDTH, HEIGHT), cellId: "front", figureCount: 1, completeFigure: true, extraProps: false, poseMatches: true, reviewer: "synthetic fixture" } } : {}),
  });
}
function contract(source = SOURCE): FixedSlotContract {
  return {
    version: "fixed-sprite/v2", board: BOARD, slotId: "authored-only", poseId: source.poseId,
    support: { type: "ground", sourceLandmark: "feet", destination: { x: 0.5, y: 0.7 }, tolerancePx: 1 },
    scale: { kind: "landmark-distance", from: "headTop", to: "headBottom", destinationDistancePx: 9, tolerancePx: 0.5 },
    anchorChecks: [], allowedEnvelope: box(0, 0, 1, 1), forbiddenRegions: [],
  };
}
function alphaAt(sprite: ReturnType<typeof extract>, x: number, y: number) {
  return sprite.rgba[((y - sprite.crop.top) * sprite.width + x - sprite.crop.left) * 4 + 3];
}

describe("fixed sprite source extraction", () => {
  it("extracts only the declared cell and preserves its source coordinates", () => {
    const sprite = extract();
    expect(sprite.ok).toBe(true);
    expect(sprite.crop).toEqual({ left: 11, top: 5, width: 11, height: 32 });
    expect(sprite.source.landmarks).toEqual(SOURCE.landmarks);
    expect(sprite.measurements.mainStrongPixels).toBe(308);
  });

  it("preserves a connected semitransparent fringe without filling a legitimate enclosed arm gap", () => {
    const rgba = figure();
    paint(rgba, 20, 18, 8, 10);
    paint(rgba, 22, 20, 4, 6, 0);
    paint(rgba, 10, 8, 1, 1, 12);
    const sprite = extract(rgba);
    expect(sprite.ok).toBe(true);
    expect(alphaAt(sprite, 10, 8)).toBe(12);
    expect(alphaAt(sprite, 23, 22)).toBe(0);
    expect(sprite.measurements.protectedFaceMissingPixels).toBe(0);
  });

  it("rejects an interior protected-face hole and never fills it", () => {
    const rgba = figure();
    paint(rgba, 15, 9, 1, 1, 0);
    const sprite = extract(rgba);
    expect(sprite.ok).toBe(false);
    expect(sprite.flags.map((item) => item.code)).toContain("protected_face_hole");
    expect(sprite.measurements.enclosedFaceHolePixels).toBe(1);
    expect(sprite.measurements.exteriorFaceMissingPixels).toBe(0);
    expect(alphaAt(sprite, 15, 9)).toBe(0);
  });

  it("also rejects face transparency connected to exterior instead of treating it as an arm gap", () => {
    const rgba = figure();
    paint(rgba, 11, 9, 5, 1, 0);
    const sprite = extract(rgba);
    expect(sprite.ok).toBe(false);
    expect(sprite.measurements.exteriorFaceMissingPixels).toBe(2);
    expect(sprite.measurements.enclosedFaceHolePixels).toBe(0);
  });

  it("does not accept outer sheet margins as proof of internal grid separation", () => {
    const rgba = Buffer.alloc(64 * HEIGHT * 4);
    paint(rgba, 28, 10, 8, 20, 255, 64);
    const sprite = extractSpriteCell({
      rgba, width: 64, height: HEIGHT,
      grid: { cells: [{ id: "left", left: 0, top: 0, width: 32, height: HEIGHT }, { id: "right", left: 32, top: 0, width: 32, height: HEIGHT }] },
      cellId: "left", source: SOURCE,
    });
    expect(rgba[3]).toBe(0);
    expect(rgba[(64 * HEIGHT - 1) * 4 + 3]).toBe(0);
    expect(sprite.flags.map((item) => item.code)).toContain("cell_frame_contact");
    expect(sprite.ok).toBe(false);
  });

  it("rejects an absent figure and reports multiple substantial components as ambiguous", () => {
    const empty = extract(Buffer.alloc(WIDTH * HEIGHT * 4));
    expect(empty.flags.map((item) => item.code)).toContain("missing_figure");
    const two = figure();
    paint(two, 3, 18, 5, 14);
    const ambiguous = extract(two);
    expect(ambiguous.ok).toBe(false);
    expect(ambiguous.measurements.significantComponentCount).toBe(2);
    expect(ambiguous.flags.map((item) => item.code)).toContain("ambiguous_components");
  });

  it("requires exact-image semantic review even when connected alpha looks like one figure", () => {
    expect(extract(figure(), SOURCE, false).flags.map((item) => item.code)).toContain("semantic_review_required");
    const rgba = figure();
    const input = {
      rgba, width: WIDTH, height: HEIGHT,
      grid: { cells: [{ id: "front", left: 0, top: 0, width: WIDTH, height: HEIGHT }] }, cellId: "front", source: SOURCE,
      review: { sourceSha256: sha256Rgba(rgba, WIDTH, HEIGHT), cellId: "front", figureCount: 2, completeFigure: true, extraProps: true, poseMatches: true, reviewer: "synthetic review" },
    };
    const sprite = extractSpriteCell(input);
    expect(sprite.measurements.strongComponentCount).toBe(1);
    expect(sprite.flags.map((item) => item.code)).toEqual(expect.arrayContaining(["figure_count_mismatch", "extra_props"]));
    input.review.figureCount = 1;
    input.review.extraProps = false;
    input.review.sourceSha256 = "b".repeat(64);
    expect(extractSpriteCell(input).flags.map((item) => item.code)).toContain("semantic_review_required");
  });

  it("rejects a declared landmark in empty space without moving it to the body", () => {
    const source: SpriteSource = { ...SOURCE, landmarks: { ...SOURCE.landmarks, feet: { x: 0.1, y: 0.9 } } };
    const sprite = extract(figure(), source);
    expect(sprite.flags.map((item) => item.code)).toContain("landmark_not_on_alpha");
    expect(sprite.source.landmarks.feet).toEqual({ x: 0.1, y: 0.9 });
  });

  it("removes detached faint frame dust before deciding whether the figure is clipped", () => {
    const rgba = figure();
    paint(rgba, 0, 0, 1, 1, 1);
    paint(rgba, 31, 39, 1, 1, 12);
    const sprite = extract(rgba);
    expect(sprite.ok).toBe(true);
    expect(sprite.measurements.rawFrameContactPixels).toBe(2);
    expect(sprite.measurements.frameContactPixels).toBe(0);
    expect(sprite.flags.map((item) => item.code)).toContain("detached_frame_dust_removed");
    expect(sprite.flags.map((item) => item.code)).not.toContain("cell_frame_contact");
  });

  it("records faint clearance fringe but rejects connected alpha on the actual boundary", () => {
    const rgba = figure();
    paint(rgba, 15, 4, 1, 1);
    paint(rgba, 15, 1, 1, 3, 12);
    const nearEdge = extract(rgba);
    expect(nearEdge.ok).toBe(true);
    expect(nearEdge.flags.map((item) => item.code)).toContain("frame_clearance_fringe");
    expect(alphaAt(nearEdge, 15, 1)).toBe(12);
    paint(rgba, 15, 3, 1, 2);
    paint(rgba, 15, 0, 1, 3, 12);
    const onEdge = extract(rgba);
    expect(onEdge.ok).toBe(false);
    expect(onEdge.measurements.frameBoundaryPixels).toBe(1);
    expect(onEdge.flags.map((item) => item.code)).toContain("cell_frame_contact");
  });

  it("never forgives strong anatomy entering the clearance or a detached small limb", () => {
    const rgba = figure();
    paint(rgba, 15, 1, 1, 4);
    const clipped = extract(rgba);
    expect(clipped.ok).toBe(false);
    expect(clipped.measurements.strongFrameContactPixels).toBe(1);
    expect(clipped.flags.map((item) => item.code)).toContain("cell_frame_contact");
    const limb = figure();
    paint(limb, 25, 20, 2, 4);
    expect(extract(limb).flags.map((item) => item.code)).toContain("ambiguous_components");
  });

  it("requires explicit completeness review even when the source contains one figure", () => {
    const sprite = extract();
    const rgba = figure();
    const reviewed = extractSpriteCell({ rgba, width: WIDTH, height: HEIGHT, grid: { cells: [sprite.cell] }, cellId: sprite.cell.id, source: SOURCE, review: { ...sprite.review!, completeFigure: false } });
    expect(reviewed.ok).toBe(false);
    expect(reviewed.flags.map((item) => item.code)).toContain("incomplete_figure");
  });
});

function standingFigure() {
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
  paint(rgba, 11, 5, 11, 10);
  paint(rgba, 12, 15, 9, 11);
  paint(rgba, 12, 26, 3, 11);
  paint(rgba, 18, 26, 3, 11);
  return rgba;
}
function visibleSource(rgba: Uint8Array): VisibleSpriteSource {
  return {
    measurementVersion: "visible-face/v1", poseId: "standing",
    landmarks: { eyeMidpoint: { x: 16 / WIDTH, y: 9 / HEIGHT }, chin: { x: 16 / WIDTH, y: 14 / HEIGHT }, leftFoot: { x: 13.5 / WIDTH, y: 37 / HEIGHT }, rightFoot: { x: 19.5 / WIDTH, y: 37 / HEIGHT } },
    protectedFacePolygon: box(14 / WIDTH, 10 / HEIGHT, 4 / WIDTH, 3 / HEIGHT), landmarkTolerancePx: 0,
    measurementFrame: { rgbaSha256: sha256Rgba(rgba, WIDTH, HEIGHT), width: WIDTH, height: HEIGHT, cell: { id: "standing", left: 0, top: 0, width: WIDTH, height: HEIGHT }, coordinates: "cell-normalized-pixel-edges" },
  };
}
function extractVisible(rgba = standingFigure(), source = visibleSource(rgba)) {
  return extractSpriteCell({ rgba, width: WIDTH, height: HEIGHT, grid: { cells: [{ id: "standing", left: 0, top: 0, width: WIDTH, height: HEIGHT }] }, cellId: "standing", source,
    review: { sourceSha256: sha256Rgba(rgba, WIDTH, HEIGHT), cellId: "standing", figureCount: 1, completeFigure: true, extraProps: false, poseMatches: true, reviewer: "synthetic visible-source fixture" },
  });
}
function visibleContract(): FixedSlotContractV3 {
  return { version: "fixed-sprite/v3", measurementVersion: "visible-face/v1", board: BOARD, poseId: "standing", slotId: "standing-ground-one",
    support: { type: "ground", sourceLandmark: "soleMidpoint", destination: { x: 0.5, y: 0.8 }, tolerancePx: 1 },
    scale: { kind: "landmark-distance", from: "eyeMidpoint", to: "chin", destinationDistancePx: 5, tolerancePx: 0.5 },
    anchorChecks: [], allowedEnvelope: box(0, 0, 1, 1), forbiddenRegions: [],
  };
}
function foregroundFromRow(row: number, alpha = 255) {
  const rgba = Buffer.alloc(BOARD.width * BOARD.height * 4);
  for (let y = row; y < BOARD.height; y++) for (let x = 0; x < BOARD.width; x++) rgba[(y * BOARD.width + x) * 4 + 3] = alpha;
  return { rgba, width: BOARD.width, height: BOARD.height };
}
function bindForeground(contract: FixedSlotContractV3, foreground: ReturnType<typeof foregroundFromRow>) {
  contract.foregroundMask = { rgbaSha256: sha256Rgba(foreground.rgba, foreground.width, foreground.height), width: foreground.width, height: foreground.height, mode: "board-foreground-alpha" };
}

describe("opt-in occluded standing at a visible eye anchor", () => {
  function eyeContract() {
    const recipe = visibleContract();
    recipe.support = { type: "occluded-standing", sourceLandmark: "eyeMidpoint", destination: { x: 0.5, y: 0.55 }, tolerancePx: 0 };
    recipe.bodyScale = { kind: "landmark-distance-interval", from: "eyeMidpoint", to: "soleMidpoint", minDistancePx: 27, maxDistancePx: 29 };
    const foreground = foregroundFromRow(130); bindForeground(recipe, foreground);
    return { contract: recipe, foreground, board: BOARD };
  }

  it("fixes the visible eye for two differently angled sources without using hidden soles as the anchor", () => {
    const first = extractVisible();
    const rgba = standingFigure(); paint(rgba, 11, 5, 11, 10, 0); paint(rgba, 8, 5, 11, 10);
    const source = visibleSource(rgba);
    source.landmarks.eyeMidpoint.x -= 3 / WIDTH; source.landmarks.chin.x -= 3 / WIDTH;
    source.protectedFacePolygon = source.protectedFacePolygon.map((point) => ({ ...point, x: point.x - 3 / WIDTH }));
    const second = extractVisible(rgba, source);
    const input = eyeContract(); const frozen = JSON.stringify(input.contract);
    const results = [first, second].map((sprite) => computeFixedPlacement({ ...input, sprite }));
    for (const result of results) {
      expect(result.ok).toBe(true);
      expect(result.landmarks.eyeMidpoint).toEqual({ x: 100, y: 0.55 * BOARD.height });
      expect(result.visibility!.headAnchor).toEqual({ x: 0.5, y: 0.55 });
      expect(result.measurements.supportDistancePx).toBe(0);
      expect(result.measurements.standingBodyDistancePx).toBeGreaterThan(27);
      expect(result.measurements.standingBodyDistancePx).toBeLessThan(29);
      expect(result.visibility!.occludedSourcePixels).toBeGreaterThan(0);
    }
    expect(results[0]!.landmarks.soleMidpoint!.x).not.toBe(results[1]!.landmarks.soleMidpoint!.x);
    expect(JSON.stringify(input.contract)).toBe(frozen);
  });

  it("requires a declared supplied bound foreground and actual occlusion", () => {
    const input = eyeContract(); const sprite = extractVisible();
    expect(() => computeFixedPlacement({ contract: { ...input.contract, foregroundMask: undefined }, board: BOARD, sprite })).toThrow(/Occluded standing requires an authored foreground mask/);
    expect(() => computeFixedPlacement({ ...input, foreground: undefined, sprite })).toThrow(/Declared foreground mask/);
    input.foreground = foregroundFromRow(BOARD.height); bindForeground(input.contract, input.foreground);
    const empty = computeFixedPlacement({ ...input, sprite });
    expect(empty.ok).toBe(false);
    expect(empty.flags.map((flag) => flag.code)).toContain("occluded_standing_not_occluded");
  });

  it("keeps whole-body and wrong-transform gates active and solver anchoring generic", () => {
    const input = eyeContract(); const sprite = extractVisible(); const nominal = computeFixedPlacement({ ...input, sprite });
    const wrong = evaluateFixedPlacement({ ...input, sprite, transform: { ...nominal.transform, translateY: nominal.transform.translateY - 10 } });
    expect(wrong.flags.map((flag) => flag.code)).toContain("support_check_failed");
    input.contract.bodyScale!.maxDistancePx = 27.5;
    expect(computeFixedPlacement({ ...input, sprite }).flags.map((flag) => flag.code)).toContain("body_scale_check_failed");
    input.contract.bodyScale!.maxDistancePx = 29;
    const solved = solveFixedScale({ ...input, sprite, policy: { version: "fixed-scale-solver/v1" } });
    expect(solved.geometryPassed).toBe(true);
    expect(solved.placement!.landmarks.eyeMidpoint).toEqual({ x: 100, y: 0.55 * BOARD.height });
    expect(solved.placement!.measurements.supportDistancePx).toBe(0);
  });

  it("does not reinterpret historical ground or seat support as an eye anchor", () => {
    const eye = eyeContract();
    expect(fixedSlotV3ContractSchema.safeParse({ ...eye.contract, support: { ...eye.contract.support, type: "ground" } }).success).toBe(false);
    expect(fixedSlotV3ContractSchema.safeParse({ ...eye.contract, support: { ...eye.contract.support, sourceLandmark: "soleMidpoint" } }).success).toBe(false);
    expect(fixedSlotV3ContractSchema.parse(visibleContract()).support).toEqual(visibleContract().support);
  });
});

describe("optional required hiding of both observed sole neighborhoods", () => {
  function fixture() {
    const recipe = visibleContract();
    recipe.support = { type: "occluded-standing", sourceLandmark: "eyeMidpoint", destination: { x: 0.5, y: 0.55 }, tolerancePx: 0 };
    recipe.requiredHiddenLandmarks = [{ sourceLandmark: "leftFoot", radiusPx: 2 }, { sourceLandmark: "rightFoot", radiusPx: 2 }];
    const foreground = foregroundFromRow(130); bindForeground(recipe, foreground);
    return { contract: recipe, foreground, board: BOARD, sprite: extractVisible() };
  }

  it("passes both opaque-hidden soles with real source support, even though the observed sole lies on a transparent pixel edge", () => {
    const input = fixture(); const placed = computeFixedPlacement(input);
    expect(input.sprite.source.landmarks.leftFoot.y * HEIGHT).toBe(input.sprite.crop.top + input.sprite.height);
    expect(placed.ok).toBe(true);
    expect(placed.measurements.requiredHiddenLandmarkChecks).toHaveLength(2);
    for (const check of placed.measurements.requiredHiddenLandmarkChecks!) {
      expect(check.passed).toBe(true); expect(check.landmarkFullyOpaque).toBe(true);
      expect(check.strongSourcePixels).toBeGreaterThan(0);
      expect(check.boardDiscPixels).toBeGreaterThan(0);
      expect(check.nativeAlphaPixels).toBeGreaterThan(0);
      expect(check.nonOpaqueForegroundPixels + check.notFullyMaskedNativePixels + check.visibleNativePixels + check.visibleBoardPixels + check.visiblePremaskedPreviewPixels).toBe(0);
    }
    expect(fixedPlacementManifest(placed, input.sprite)).toHaveProperty("requiredHiddenLandmarkGeometryBasis");
  });

  it("leaves absent historical v3 fields, measurements and manifests unchanged", () => {
    const input = fixture(); delete input.contract.requiredHiddenLandmarks;
    const placed = computeFixedPlacement(input);
    expect(placed.ok).toBe(true);
    expect(placed.contract).not.toHaveProperty("requiredHiddenLandmarks");
    expect(placed.measurements).not.toHaveProperty("requiredHiddenLandmarkChecks");
    expect(fixedPlacementManifest(placed, input.sprite)).not.toHaveProperty("requiredHiddenLandmarkGeometryBasis");
  });

  it("rejects one exposed boot even while the other boot and some body pixels are occluded", () => {
    const input = fixture();
    for (let y = 133; y <= 141; y++) for (let x = 93; x <= 100; x++) input.foreground.rgba[(y * BOARD.width + x) * 4 + 3] = 0;
    bindForeground(input.contract, input.foreground);
    const placed = computeFixedPlacement(input); const checks = placed.measurements.requiredHiddenLandmarkChecks!;
    expect(placed.visibility!.occludedSourcePixels).toBeGreaterThan(0);
    expect(checks.find((check) => check.sourceLandmark === "leftFoot")!.passed).toBe(false);
    expect(checks.find((check) => check.sourceLandmark === "rightFoot")!.passed).toBe(true);
    expect(checks[0]!.visibleNativePixels).toBeGreaterThan(0);
    expect(checks[0]!.visibleBoardPixels).toBeGreaterThan(0);
    expect(placed.flags.map((flag) => flag.code)).toContain("required_foot_occlusion_failed");
    expect(placed.ok).toBe(false);
    delete input.contract.requiredHiddenLandmarks;
    expect(computeFixedPlacement(input).ok).toBe(true); // Existing any-body rule is deliberately not changed.
  });

  it.each([128, 254])("rejects a partially opaque mask (%s)", (alpha) => {
    const input = fixture(); input.foreground = foregroundFromRow(130, alpha); bindForeground(input.contract, input.foreground);
    const placed = computeFixedPlacement(input);
    expect(placed.ok).toBe(false);
    for (const check of placed.measurements.requiredHiddenLandmarkChecks!) {
      expect(check.passed).toBe(false); expect(check.landmarkFullyOpaque).toBe(false);
      expect(check.nonOpaqueForegroundPixels).toBeGreaterThan(0);
      expect(check.notFullyMaskedNativePixels).toBeGreaterThan(0);
    }
  });

  it("rejects a faint alpha1 source sample even if an alpha254 mask rounds its residual to zero", () => {
    const input = fixture(); const rgba = standingFigure(); paint(rgba, 12, 36, 1, 1, 1); input.sprite = extractVisible(rgba);
    input.foreground.rgba[(137 * BOARD.width + 96) * 4 + 3] = 254; bindForeground(input.contract, input.foreground);
    const placed = computeFixedPlacement(input);
    const i = ((36 - input.sprite.crop.top) * input.sprite.width + 12 - input.sprite.crop.left) * 4 + 3;
    expect(input.sprite.rgba[i]).toBe(1); expect(placed.visibility!.sourceImage.rgba[i]).toBe(0);
    expect(placed.measurements.requiredHiddenLandmarkChecks![0]!.notFullyMaskedNativePixels).toBeGreaterThan(0);
    expect(placed.ok).toBe(false);
  });

  it("requires opaque foreground across the disc even where the source has no alpha", () => {
    const input = fixture(); input.foreground.rgba[(139 * BOARD.width + 95) * 4 + 3] = 0; bindForeground(input.contract, input.foreground);
    const placed = computeFixedPlacement(input); const check = placed.measurements.requiredHiddenLandmarkChecks![0]!;
    expect(check.landmarkFullyOpaque).toBe(true);
    expect(check.visibleNativePixels).toBe(0);
    expect(check.nonOpaqueForegroundPixels).toBeGreaterThan(0);
    expect(check.passed).toBe(false); expect(placed.ok).toBe(false);
  });

  it("does not call missing foot alpha successfully hidden just because the mask covers its location", () => {
    const input = fixture(); const rgba = standingFigure(); paint(rgba, 12, 26, 3, 11, 0); input.sprite = extractVisible(rgba);
    const placed = computeFixedPlacement(input); const check = placed.measurements.requiredHiddenLandmarkChecks![0]!;
    expect(check.landmarkFullyOpaque).toBe(true); expect(check.nonOpaqueForegroundPixels).toBe(0);
    expect(check.strongSourcePixels).toBe(0); expect(check.passed).toBe(false);
    expect(placed.flags.map((flag) => flag.code)).toContain("required_foot_occlusion_failed");
    expect(placed.ok).toBe(false);
  });

  it("rejects radius smaller than source measurement uncertainty instead of silently expanding it", () => {
    const input = fixture(); const rgba = standingFigure(); const source = visibleSource(rgba); source.landmarkTolerancePx = 2;
    input.sprite = extractVisible(rgba, source); input.contract.requiredHiddenLandmarks!.forEach((check) => { check.radiusPx = 0.5; });
    const placed = computeFixedPlacement(input);
    for (const check of placed.measurements.requiredHiddenLandmarkChecks!) {
      expect(check.radiusPx).toBe(0.5); expect(check.landmarkToleranceBoardPx).toBe(2);
      expect(check.radiusCoversLandmarkTolerance).toBe(false); expect(check.passed).toBe(false);
    }
    expect(placed.ok).toBe(false);
  });

  it("rejects missing, stale or undeclared foreground and ground-only support", () => {
    const input = fixture();
    expect(() => computeFixedPlacement({ ...input, foreground: undefined })).toThrow(/Declared foreground mask/);
    expect(() => computeFixedPlacement({ ...input, contract: { ...input.contract, foregroundMask: undefined }, foreground: undefined })).toThrow(/Required hidden soles|Occluded standing requires/);
    expect(() => computeFixedPlacement({ ...input, contract: { ...input.contract, support: visibleContract().support } })).toThrow(/Required hidden soles/);
    input.foreground.rgba[3] = 1;
    expect(() => computeFixedPlacement(input)).toThrow(/Foreground decoded RGBA hash/);
  });

  it("requires exactly both soles and rejects zero radii, duplicate points and v2 reinterpretation", () => {
    const input = fixture();
    for (const checks of [[], [{ sourceLandmark: "leftFoot", radiusPx: 2 }], [{ sourceLandmark: "leftFoot", radiusPx: 2 }, { sourceLandmark: "leftFoot", radiusPx: 2 }], [{ sourceLandmark: "leftFoot", radiusPx: 0 }, { sourceLandmark: "rightFoot", radiusPx: 2 }], [{ sourceLandmark: "leftFoot", radiusPx: 17 }, { sourceLandmark: "rightFoot", radiusPx: 2 }], [{ sourceLandmark: "eyeMidpoint", radiusPx: 2 }, { sourceLandmark: "rightFoot", radiusPx: 2 }]]) {
      expect(fixedSlotV3ContractSchema.safeParse({ ...input.contract, requiredHiddenLandmarks: checks }).success).toBe(false);
    }
    expect(() => computeFixedPlacement({ board: BOARD, sprite: extract(), contract: { ...contract(), requiredHiddenLandmarks: input.contract.requiredHiddenLandmarks } })).toThrow(/explicit valid fixed-sprite/);
  });

  it("never waives protected face occlusion merely because both feet are hidden", () => {
    const input = fixture(); input.foreground = foregroundFromRow(0); bindForeground(input.contract, input.foreground);
    const placed = computeFixedPlacement(input);
    expect(placed.measurements.requiredHiddenLandmarkChecks!.every((check) => check.passed)).toBe(true);
    expect(placed.flags.map((flag) => flag.code)).toContain("foreground_face_occlusion");
    expect(placed.ok).toBe(false);
  });
});

describe("explicit v3 final-visible forbidden regions", () => {
  function occludedFixture(scope?: "unoccluded" | "final-visible", alpha = 255) {
    const sprite = extractVisible(); const recipe = visibleContract(); const foreground = foregroundFromRow(149, alpha);
    recipe.forbiddenRegions = [{ id: "original-face-behind-opaque-object", polygon: box(95 / 200, 152 / 200, 10 / 200, 8 / 200), ...(scope ? { scope } : {}) }];
    bindForeground(recipe, foreground);
    return { sprite, contract: recipe, board: BOARD, foreground };
  }

  it("keeps omitted and explicit unoccluded collisions strict behind opaque foreground", () => {
    for (const scope of [undefined, "unoccluded"] as const) {
      const input = occludedFixture(scope); const placed = computeFixedPlacement(input);
      expect(placed.ok).toBe(false);
      expect(placed.flags.map((flag) => flag.code)).toContain("forbidden_overlap");
      expect(placed.measurements.forbiddenOverlaps[0]!.pixels).toBeGreaterThan(0);
      expect(placed.measurements).not.toHaveProperty("forbiddenScopeChecks");
      if (scope === undefined) expect(placed.contract.forbiddenRegions[0]).not.toHaveProperty("scope");
    }
  });

  it("permits only explicit fully restored overlap, retains raw evidence and changes the frozen hash", () => {
    const input = occludedFixture(); const original = computeFixedPlacement(input);
    const before = sha256Bytes(Buffer.from(JSON.stringify(original.contract)));
    input.contract.forbiddenRegions[0]!.scope = "final-visible";
    const placed = computeFixedPlacement(input);
    expect(placed.ok).toBe(true);
    expect(placed.measurements.forbiddenOverlaps).toEqual(original.measurements.forbiddenOverlaps);
    expect(placed.measurements.nativeForbiddenOverlaps).toEqual(original.measurements.nativeForbiddenOverlaps);
    expect(placed.measurements.forbiddenScopeChecks).toEqual([{ id: "original-face-behind-opaque-object", scope: "final-visible", boardPixels: 0, nativeSamples: 0, premaskedPreviewPixels: 0 }]);
    expect(sha256Bytes(Buffer.from(JSON.stringify(placed.contract)))).not.toBe(before);
    const manifest = fixedPlacementManifest(placed, input.sprite);
    expect(manifest).toHaveProperty("forbiddenScopeGeometryBasis");
    expect(fixedPlacementManifest(original, input.sprite)).not.toHaveProperty("forbiddenScopeGeometryBasis");
    expect(manifest.automaticRelease).toBe(false);
  });

  it.each([0, 128, 254])("does not waive any partial alpha mask (%s)", (alpha) => {
    const placed = computeFixedPlacement(occludedFixture("final-visible", alpha));
    expect(placed.ok).toBe(false);
    expect(placed.flags.map((flag) => flag.code)).toContain("forbidden_overlap");
    expect(placed.measurements.forbiddenScopeChecks![0]!.boardPixels).toBeGreaterThan(0);
    expect(placed.measurements.forbiddenScopeChecks![0]!.nativeSamples).toBeGreaterThan(0);
  });

  it("rejects overlap when no foreground exists and rejects an absent declared mask", () => {
    const input = occludedFixture("final-visible");
    expect(() => computeFixedPlacement({ ...input, foreground: undefined })).toThrow(/Declared foreground mask/);
    delete input.contract.foregroundMask;
    const placed = computeFixedPlacement({ ...input, foreground: undefined });
    expect(placed.ok).toBe(false);
    expect(placed.flags.map((flag) => flag.code)).toContain("forbidden_overlap");
    expect(placed.measurements.forbiddenScopeChecks![0]!.boardPixels).toBeGreaterThan(0);
  });

  it("rejects uncovered pixels inside an otherwise opaque face mask", () => {
    const input = occludedFixture("final-visible");
    input.foreground.rgba[(154 * BOARD.width + 97) * 4 + 3] = 0;
    bindForeground(input.contract, input.foreground);
    const placed = computeFixedPlacement(input);
    expect(placed.ok).toBe(false);
    expect(placed.measurements.forbiddenScopeChecks![0]!.boardPixels).toBeGreaterThan(0);
    expect(placed.measurements.forbiddenScopeChecks![0]!.nativeSamples).toBeGreaterThan(0);
  });

  it("does not forgive alpha1 source pixels rounded away by a partial mask", () => {
    const input = occludedFixture("final-visible", 254);
    const rgba = standingFigure(); paint(rgba, 12, 30, 1, 1, 1);
    input.sprite = extractVisible(rgba);
    // At this half-board-x native sample, two alpha254 mask taps participate.
    input.contract.forbiddenRegions[0]!.polygon = box(95.75 / 200, 153.25 / 200, 0.5 / 200, 0.5 / 200);
    const placed = computeFixedPlacement(input);
    const i = ((30 - input.sprite.crop.top) * input.sprite.width + 12 - input.sprite.crop.left) * 4 + 3;
    expect(input.sprite.rgba[i]).toBe(1);
    expect(placed.visibility!.sourceImage.rgba[i]).toBe(0);
    expect(placed.measurements.forbiddenScopeChecks![0]!.nativeSamples).toBe(1);
    expect(placed.ok).toBe(false);
  });

  it("checks non-centred native mask taps even when no board sample intersects the tiny region", () => {
    const input = occludedFixture("final-visible");
    input.contract.forbiddenRegions[0]!.polygon = box(95.75 / 200, 153.25 / 200, 0.5 / 200, 0.5 / 200);
    input.foreground.rgba[(153 * BOARD.width + 95) * 4 + 3] = 0;
    bindForeground(input.contract, input.foreground);
    const placed = computeFixedPlacement(input);
    expect(placed.measurements.forbiddenScopeChecks![0]!.boardPixels).toBe(0);
    expect(placed.measurements.forbiddenScopeChecks![0]!.nativeSamples).toBe(1);
    expect(placed.ok).toBe(false);
  });

  it("also checks exposed board samples between the projected native centres", () => {
    const input = occludedFixture("final-visible");
    input.contract.forbiddenRegions[0]!.polygon = box(96.4 / 200, 153.25 / 200, 0.2 / 200, 0.5 / 200);
    input.foreground.rgba[(153 * BOARD.width + 96) * 4 + 3] = 0;
    bindForeground(input.contract, input.foreground);
    const placed = computeFixedPlacement(input);
    expect(placed.measurements.forbiddenScopeChecks![0]!.nativeSamples).toBe(0);
    expect(placed.measurements.forbiddenScopeChecks![0]!.boardPixels).toBe(1);
    expect(placed.ok).toBe(false);
  });

  it("never waives the new source's protected face or eye occlusion", () => {
    const input = occludedFixture("final-visible"); input.foreground = foregroundFromRow(130); bindForeground(input.contract, input.foreground);
    const placed = computeFixedPlacement(input);
    expect(placed.ok).toBe(false);
    expect(placed.measurements.forbiddenScopeChecks![0]!.boardPixels).toBe(0);
    expect(placed.flags.map((flag) => flag.code)).toEqual(expect.arrayContaining(["foreground_face_occlusion", "foreground_eye_occlusion"]));
  });

  it("rejects stale board/mask identity and undeclared masks without a scope escape hatch", () => {
    const input = occludedFixture("final-visible");
    expect(() => computeFixedPlacement({ ...input, board: { ...BOARD, sha256: "b".repeat(64) } })).toThrow(/Board hash or dimensions differ/);
    input.foreground.rgba[3] = 1;
    expect(() => computeFixedPlacement(input)).toThrow(/Foreground decoded RGBA hash or dimensions differ/);
    delete input.contract.foregroundMask;
    expect(() => computeFixedPlacement(input)).toThrow(/without a frozen mask identity/);
  });

  it("does not add the extension to historical v2 contracts", () => {
    const old = contract();
    const bad = { ...old, forbiddenRegions: [{ id: "old", polygon: box(0, 0, 0.1, 0.1), scope: "final-visible" }] };
    expect(() => computeFixedPlacement({ contract: bad, board: BOARD, sprite: extract() })).toThrow(/explicit valid fixed-sprite/);
  });
});

describe("optional v3 joint standing-body interval", () => {
  const bodyBand = (minDistancePx: number, maxDistancePx: number): NonNullable<FixedSlotContractV3["bodyScale"]> => ({ kind: "landmark-distance-interval", from: "eyeMidpoint", to: "soleMidpoint", minDistancePx, maxDistancePx });
  const bodyDistance = Math.hypot(0.5, 28);

  it("leaves historical v2/v3 measurement and contract shapes unchanged when absent", () => {
    for (const result of [computeFixedPlacement({ contract: visibleContract(), board: BOARD, sprite: extractVisible() }), computeFixedPlacement({ contract: contract(), board: BOARD, sprite: extract() })]) {
      expect(result.contract).not.toHaveProperty("bodyScale");
      expect(result.measurements).not.toHaveProperty("standingBodyDistancePx");
      expect(result.measurements).not.toHaveProperty("standingBodyErrorPx");
    }
  });

  it("accepts inclusive endpoints and records the declared range and full-body metric", () => {
    for (const band of [bodyBand(bodyDistance, bodyDistance), bodyBand(bodyDistance, 31), bodyBand(20, bodyDistance)]) {
      const recipe = visibleContract(); recipe.bodyScale = band;
      const sprite = extractVisible(); const result = computeFixedPlacement({ contract: recipe, board: BOARD, sprite });
      expect(result.ok).toBe(true);
      expect(result.measurements.standingBodyDistancePx).toBe(bodyDistance);
      expect(result.measurements.standingBodyErrorPx).toBe(0);
      expect(fixedPlacementManifest(result, sprite).contract).toHaveProperty("bodyScale", band);
    }
  });

  it("rejects a too-short or too-long body while facial scale still matches", () => {
    for (const band of [bodyBand(29, 31), bodyBand(20, 27)]) {
      const recipe = visibleContract(); recipe.bodyScale = band;
      const result = computeFixedPlacement({ contract: recipe, board: BOARD, sprite: extractVisible() });
      expect(result.ok).toBe(false);
      expect(result.measurements.scaleErrorPx).toBe(0);
      expect(result.flags.map(f => f.code)).toContain("body_scale_check_failed");
      expect(result.measurements.standingBodyErrorPx).toBe(Math.max(band.minDistancePx - bodyDistance, bodyDistance - band.maxDistancePx, 0));
    }
  });

  it("is invariant to translation and individual-foot anchoring", () => {
    for (const sourceLandmark of ["soleMidpoint", "leftFoot", "rightFoot"] as const) {
      const recipe = visibleContract(); recipe.bodyScale = bodyBand(27, 29); recipe.support.sourceLandmark = sourceLandmark;
      const sprite = extractVisible(); const base = computeFixedPlacement({ contract: recipe, board: BOARD, sprite });
      const moved = evaluateFixedPlacement({ contract: recipe, board: BOARD, sprite, transform: { ...base.transform, translateY: base.transform.translateY - 35 } });
      expect(base.measurements.standingBodyDistancePx).toBe(bodyDistance);
      expect(moved.measurements.standingBodyDistancePx).toBe(bodyDistance);
      expect(moved.measurements.standingBodyErrorPx).toBe(0);
      expect(moved.flags.map(f => f.code)).toContain("support_check_failed");
    }
  });

  it("does not replace facial scale checks with body acceptance", () => {
    const recipe = visibleContract(); recipe.bodyScale = bodyBand(33, 34);
    const sprite = extractVisible(); const scale = 1.2;
    const result = evaluateFixedPlacement({ contract: recipe, board: BOARD, sprite, transform: { scale, translateX: 100 - 16.5 * scale, translateY: 160 - 37 * scale } });
    expect(result.measurements.standingBodyErrorPx).toBe(0);
    expect(result.flags.map(f => f.code)).toContain("scale_check_failed");
    expect(result.ok).toBe(false);
  });

  it("uses the full observed body span even when its lower half is foreground-occluded", () => {
    const recipe = visibleContract(); recipe.bodyScale = bodyBand(20, 27);
    const foreground = foregroundFromRow(150); bindForeground(recipe, foreground);
    const sprite = extractVisible(); const before = Buffer.from(sprite.rgba);
    const result = computeFixedPlacement({ contract: recipe, board: BOARD, sprite, foreground });
    expect(result.visibility!.occludedSourcePixels).toBeGreaterThan(0);
    expect(result.measurements.standingBodyDistancePx).toBe(bodyDistance);
    expect(result.flags.map(f => f.code)).toContain("body_scale_check_failed");
    expect(sprite.rgba).toEqual(before);
  });

  it("lets the opt-in solver apply the joint gate without changing the recipe", () => {
    const recipe = visibleContract(); recipe.bodyScale = bodyBand(26, 27);
    const before = JSON.stringify(recipe);
    const result = solveFixedScale({ contract: recipe, board: BOARD, sprite: extractVisible(), policy: { version: "fixed-scale-solver/v1" } });
    expect(result.targetAttempt.flags.map(f => f.code)).toContain("body_scale_check_failed");
    expect(result.geometryPassed).toBe(true);
    expect(result.placement!.measurements.scaleDistancePx).toBeCloseTo(4.8);
    expect(result.placement!.measurements.standingBodyDistancePx).toBeCloseTo(bodyDistance * 0.96);
    expect(result.placement!.measurements.standingBodyErrorPx).toBe(0);
    expect(JSON.stringify(recipe)).toBe(before);
  });

  it("rejects invalid intervals, hidden-anatomy substitutions and v2 reinterpretation", () => {
    const valid = bodyBand(20, 30);
    for (const invalid of [
      { ...valid, minDistancePx: 0 }, { ...valid, minDistancePx: -1 }, { ...valid, minDistancePx: 31 },
      { ...valid, maxDistancePx: Infinity }, { ...valid, maxDistancePx: Number.NaN },
      { ...valid, from: "headTop" }, { ...valid, to: "leftFoot" }, { ...valid, sourceLength: 100 },
    ]) expect(() => fixedSlotV3ContractSchema.parse({ ...visibleContract(), bodyScale: invalid })).toThrow();
    expect(() => computeFixedPlacement({ contract: { ...contract(), bodyScale: valid }, board: BOARD, sprite: extract() })).toThrow(/explicit valid/);
  });
});

describe("fixed sprite v3 visible facial scale and observable soles", () => {
  it("derives a transparent sole midpoint while verifying each individual sole", () => {
    const rgba = standingFigure(); const sprite = extractVisible(rgba);
    expect(rgba[(36 * WIDTH + 16) * 4 + 3]).toBe(0);
    expect(sprite.ok).toBe(true);
    expect(sprite.source.landmarks).not.toHaveProperty("soleMidpoint");
    expect(sprite.derivedLandmarks!.soleMidpoint).toEqual({ x: 16.5 / WIDTH, y: 37 / HEIGHT });
    const result = computeFixedPlacement({ contract: visibleContract(), board: BOARD, sprite });
    expect(result.ok).toBe(true);
    expect(result.landmarks.soleMidpoint).toEqual({ x: 100, y: 160 });
    expect(result.landmarks.leftFoot).toEqual({ x: 97, y: 160 });
    expect(result.landmarks.rightFoot).toEqual({ x: 103, y: 160 });
    expect(result.measurements.scaleDistancePx).toBe(5);
    expect(result.landmarks).not.toHaveProperty("headTop");
    expect(result.landmarks).not.toHaveProperty("headBottom");
  });

  it("does not allow a missing individual foot to hide behind a derived support point", () => {
    const rgba = standingFigure(); paint(rgba, 18, 26, 3, 11, 0);
    const sprite = extractVisible(rgba);
    expect(sprite.ok).toBe(false);
    expect(sprite.flags.some(f => f.code === "landmark_not_on_alpha" && f.message.includes("rightFoot"))).toBe(true);
  });

  it("rejects an observed sole in the transparent gap without snapping it to another foot", () => {
    const rgba = standingFigure(); const source = visibleSource(rgba);
    source.landmarks.leftFoot = { x: 16.5 / WIDTH, y: 37 / HEIGHT };
    const sprite = extractVisible(rgba, source);
    expect(sprite.ok).toBe(false);
    expect(sprite.flags.some(f => f.code === "landmark_not_on_alpha" && f.message.includes("leftFoot"))).toBe(true);
    expect(sprite.source.landmarks.leftFoot).toEqual(source.landmarks.leftFoot);
  });

  it("uses exact Euclidean point-to-square tolerance, including the preceding boundary pixel", () => {
    const rgba = standingFigure(); const source = visibleSource(rgba);
    source.landmarkTolerancePx = 2;
    source.landmarks.leftFoot.y = 39 / HEIGHT; // sole pixel ends at37: exactly2px away
    expect(extractVisible(rgba, source).ok).toBe(true);
    source.landmarks.leftFoot.y = 39.01 / HEIGHT;
    const tooFar = extractVisible(rgba, source);
    expect(tooFar.ok).toBe(false);
    expect(tooFar.flags.some(f => f.code === "landmark_not_on_alpha" && f.message.includes("leftFoot"))).toBe(true);
    expect(tooFar.source.landmarks.leftFoot.y).toBe(39.01 / HEIGHT);
  });

  it("reuses one measured native source at two frozen destinations", () => {
    const sprite = extractVisible(); const first = visibleContract(); const second = visibleContract();
    second.slotId = "standing-ground-two"; second.support.destination.x = 0.75;
    const a = computeFixedPlacement({ contract: first, board: BOARD, sprite });
    const b = computeFixedPlacement({ contract: second, board: BOARD, sprite });
    expect(a.ok && b.ok).toBe(true);
    expect(a.sourceImage.rgbaSha256).toBe(b.sourceImage.rgbaSha256);
    expect(a.sourceImage.rgba).toEqual(b.sourceImage.rgba);
    expect(a.transform.scale).toBe(b.transform.scale);
    expect(b.landmarks.soleMidpoint).toEqual({ x: 150, y: 160 });
    expect(fixedPlacementManifest(a, sprite).source.measurementFrame).toEqual(fixedPlacementManifest(b, sprite).source.measurementFrame);
  });

  it("does not let hair height or asymmetric arm bounds change visible-face scale", () => {
    const original = standingFigure(); const largeHair = standingFigure();
    paint(largeHair, 9, 3, 15, 5); paint(largeHair, 20, 16, 9, 3);
    const a = computeFixedPlacement({ contract: visibleContract(), board: BOARD, sprite: extractVisible(original) });
    const b = computeFixedPlacement({ contract: visibleContract(), board: BOARD, sprite: extractVisible(largeHair) });
    expect(a.ok && b.ok).toBe(true);
    expect(b.sourceImage.width).toBeGreaterThan(a.sourceImage.width);
    expect(b.transform).toEqual(a.transform);
    expect(b.measurements.scaleDistancePx).toBe(5);
  });

  it("supports either explicitly observed sole as the fixed ground anchor", () => {
    for (const sourceLandmark of ["leftFoot", "rightFoot"] as const) {
      const contract = visibleContract(); contract.support.sourceLandmark = sourceLandmark;
      const result = computeFixedPlacement({ contract, board: BOARD, sprite: extractVisible() });
      expect(result.ok).toBe(true);
      expect(result.landmarks[sourceLandmark]).toEqual({ x: 100, y: 160 });
    }
  });

  it("refuses hidden-skull fields, a supplied midpoint, and non-visible scale references", () => {
    const source = visibleSource(standingFigure());
    expect(() => visibleSpriteSourceSchema.parse({ ...source, landmarks: { ...source.landmarks, soleMidpoint: { x: 0.5, y: 0.9 } } })).toThrow();
    expect(() => visibleSpriteSourceSchema.parse({ ...source, landmarks: { ...source.landmarks, headTop: { x: 0.5, y: 0.1 } } })).toThrow();
    const contract = visibleContract();
    expect(() => fixedSlotV3ContractSchema.parse({ ...contract, scale: { ...contract.scale, from: "headTop", to: "headBottom" } })).toThrow();
    expect(() => fixedSlotV3ContractSchema.parse({ ...contract, sourceLandmarks: source.landmarks })).toThrow();
    expect(() => fixedSlotV3ContractSchema.parse({ ...contract, scale: { ...contract.scale, sourceLength: 5 } })).toThrow();
  });

  it("keeps v2 semantics separate instead of silently migrating coordinates", () => {
    const v2 = contract(); v2.poseId = "standing";
    expect(() => computeFixedPlacement({ contract: v2, board: BOARD, sprite: extractVisible() })).toThrow(/historical v2/);
    const oldSource = { ...SOURCE, poseId: "standing" };
    expect(() => computeFixedPlacement({ contract: visibleContract(), board: BOARD, sprite: extract(figure(), oldSource) })).toThrow(/historical v2/);
    expect(fixedPlacementManifest(computeFixedPlacement({ contract: contract(), board: BOARD, sprite: extract() }), extract()).version).toBe("fixed-sprite-manifest/v2");
  });

  it("binds visible measurements to the exact source hash, dimensions, cell and coordinates", () => {
    for (const corrupt of [
      (s: VisibleSpriteSource) => { s.measurementFrame.rgbaSha256 = "b".repeat(64); },
      (s: VisibleSpriteSource) => { s.measurementFrame.width += 1; },
      (s: VisibleSpriteSource) => { s.measurementFrame.cell.id = "wrong-cell"; },
      (s: VisibleSpriteSource) => { s.measurementFrame.cell.left = 1; },
    ]) {
      const rgba = standingFigure(); const source = visibleSource(rgba); corrupt(source);
      expect(() => extractVisible(rgba, source)).toThrow(/exact decoded source sheet/);
    }
    const source = visibleSource(standingFigure());
    expect(() => visibleSpriteSourceSchema.parse({ ...source, measurementFrame: { ...source.measurementFrame, coordinates: "cropped-bbox" } })).toThrow();
  });

  it("rejects changed observations, crop geometry or native bytes after extraction", () => {
    const observed = extractVisible(); observed.source.landmarks.chin.y += 0.01;
    expect(() => computeFixedPlacement({ contract: visibleContract(), board: BOARD, sprite: observed })).toThrow(/changed after/);
    const pixels = extractVisible(); pixels.rgba[0] = pixels.rgba[0]! ^ 1;
    expect(() => computeFixedPlacement({ contract: visibleContract(), board: BOARD, sprite: pixels })).toThrow(/changed after/);
    const cropped = extractVisible(); cropped.crop.left++;
    expect(() => computeFixedPlacement({ contract: visibleContract(), board: BOARD, sprite: cropped })).toThrow(/changed after/);
    const midpoint = extractVisible(); midpoint.derivedLandmarks!.soleMidpoint.x += 0.01;
    expect(() => computeFixedPlacement({ contract: visibleContract(), board: BOARD, sprite: midpoint })).toThrow(/deterministic midpoint/);
  });

  it("binds extraction QA/review so deleting failure flags cannot launder an unreviewed source", () => {
    const rgba = standingFigure();
    const sprite = extractSpriteCell({ rgba, width: WIDTH, height: HEIGHT, grid: { cells: [{ id: "standing", left: 0, top: 0, width: WIDTH, height: HEIGHT }] }, cellId: "standing", source: visibleSource(rgba) });
    expect(sprite.ok).toBe(false);
    expect(computeFixedPlacement({ contract: visibleContract(), board: BOARD, sprite }).ok).toBe(false);
    sprite.flags = [];
    expect(() => computeFixedPlacement({ contract: visibleContract(), board: BOARD, sprite })).toThrow(/QA changed after/);
    const reviewed = extractVisible(); reviewed.review!.completeFigure = false;
    expect(() => computeFixedPlacement({ contract: visibleContract(), board: BOARD, sprite: reviewed })).toThrow(/QA changed after/);
  });

  it("retains protected face hole rejection and never fills the hole", () => {
    const rgba = standingFigure(); paint(rgba, 15, 11, 1, 1, 0);
    const sprite = extractVisible(rgba);
    expect(sprite.flags.map(f => f.code)).toContain("protected_face_hole");
    expect(sprite.rgba[((11 - sprite.crop.top) * sprite.width + 15 - sprite.crop.left) * 4 + 3]).toBe(0);
    expect(computeFixedPlacement({ contract: visibleContract(), board: BOARD, sprite }).ok).toBe(false);
  });

  it("tests float and oversized transforms against the same v3 recipe", () => {
    const sprite = extractVisible(); const contract = visibleContract();
    const base = computeFixedPlacement({ contract, board: BOARD, sprite });
    const floated = evaluateFixedPlacement({ contract, board: BOARD, sprite, transform: { ...base.transform, translateY: base.transform.translateY - 45 } });
    const scale = base.transform.scale * 1.5; const midpoint = sprite.derivedLandmarks!.soleMidpoint;
    const large = evaluateFixedPlacement({ contract, board: BOARD, sprite, transform: { scale, translateX: 100 - midpoint.x * WIDTH * scale, translateY: 160 - midpoint.y * HEIGHT * scale } });
    expect(floated.flags.map(f => f.code)).toContain("support_check_failed");
    expect(large.flags.map(f => f.code)).toContain("scale_check_failed");
    expect(large.measurements.supportDistancePx).toBe(0);
    expect(large.contract).toEqual(base.contract);
  });
});

describe("v3 foreground and visible player geometry", () => {
  it("provides eye-based hint geometry without pretending it is the top of a hidden skull", () => {
    const result = computeFixedPlacement({ contract: visibleContract(), board: BOARD, sprite: extractVisible() });
    expect(result.visibility!.headAnchor).toEqual({ x: 99.5 / 200, y: 132 / 200 });
    expect(result.visibility!.hitRect).not.toBeNull();
    expect(result.visibility!.sourceImage.rgba).toEqual(result.sourceImage.rgba);
    expect(result.visibility!.foregroundApplied).toBe(false);
  });

  it("applies declared occlusion to a native copy and excludes hidden legs from hit geometry", () => {
    const sprite = extractVisible(); const contract = visibleContract(); const foreground = foregroundFromRow(150);
    bindForeground(contract, foreground);
    const masterBefore = Buffer.from(sprite.rgba);
    const result = computeFixedPlacement({ contract, board: BOARD, sprite, foreground });
    expect(result.ok).toBe(true);
    expect(result.sourceImage.rgba).toEqual(masterBefore);
    expect(result.visibility!.sourceImage.width).toBe(result.sourceImage.width);
    expect(result.visibility!.sourceImage.height).toBe(result.sourceImage.height);
    expect(result.visibility!.occludedSourcePixels).toBeGreaterThan(0);
    expect(result.visibility!.hitRect!.y + result.visibility!.hitRect!.h).toBeCloseTo(150 / 200);
    expect(result.composite.height).toBeLessThan(result.unoccludedComposite!.height);
    const footIndex = ((36 - sprite.crop.top) * sprite.width + 13 - sprite.crop.left) * 4 + 3;
    expect(result.sourceImage.rgba[footIndex]).toBe(255);
    expect(result.visibility!.sourceImage.rgba[footIndex]).toBe(0);
  });

  it("multiplies partial foreground alpha once instead of flattening or changing RGB", () => {
    const contract = visibleContract(); const foreground = foregroundFromRow(150, 128); bindForeground(contract, foreground);
    const sprite = extractVisible(); const result = computeFixedPlacement({ contract, board: BOARD, sprite, foreground });
    const i = ((36 - sprite.crop.top) * sprite.width + 13 - sprite.crop.left) * 4;
    expect(result.visibility!.sourceImage.rgba[i + 3]).toBe(127);
    expect(result.visibility!.sourceImage.rgba.subarray(i, i + 3)).toEqual(result.sourceImage.rgba.subarray(i, i + 3));
  });

  it("applies opaque board alpha exactly in the preview, including thin occluders", () => {
    const contract = visibleContract(); const foreground = foregroundFromRow(BOARD.height);
    for (let y = 150; y < 160; y++) foreground.rgba[(y * BOARD.width + 97) * 4 + 3] = 255;
    bindForeground(contract, foreground);
    const result = computeFixedPlacement({ contract, board: BOARD, sprite: extractVisible(), foreground });
    expect(result.ok).toBe(true);
    const i = ((155 - result.composite.top) * result.composite.width + 97 - result.composite.left) * 4 + 3;
    expect(result.composite.rgba[i]).toBe(0);
  });

  it("fails closed when an upscaled native asset cannot resolve a thin board-space foreground", () => {
    const contract = visibleContract(); contract.scale.destinationDistancePx = 20;
    const foreground = foregroundFromRow(BOARD.height);
    for (let y = 52; y < 64; y++) foreground.rgba[(y * BOARD.width + 93) * 4 + 3] = 255;
    bindForeground(contract, foreground);
    const result = computeFixedPlacement({ contract, board: BOARD, sprite: extractVisible(), foreground });
    expect(result.ok).toBe(false);
    expect(result.flags.map(f => f.code)).toContain("foreground_upscale_unsupported");
    // The disposable board preview still applies the declared stripe exactly.
    const i = ((55 - result.composite.top) * result.composite.width + 93 - result.composite.left) * 4 + 3;
    expect(result.composite.rgba[i]).toBe(0);
    expect(result.transform.scale).toBe(4);
  });

  it("fails missing, stale, wrongly-sized and undeclared foreground masks", () => {
    const contract = visibleContract(); const foreground = foregroundFromRow(150); bindForeground(contract, foreground); const sprite = extractVisible();
    expect(() => computeFixedPlacement({ contract, board: BOARD, sprite })).toThrow(/must be supplied/);
    foreground.rgba[3] = 1;
    expect(() => computeFixedPlacement({ contract, board: BOARD, sprite, foreground })).toThrow(/Foreground decoded RGBA hash/);
    expect(() => computeFixedPlacement({ contract: visibleContract(), board: BOARD, sprite, foreground })).toThrow(/without a frozen mask/);
    contract.foregroundMask!.height = 201;
    expect(() => computeFixedPlacement({ contract, board: BOARD, sprite, foreground })).toThrow(/Foreground dimensions/);
  });

  it("does not allow foreground to hide a forbidden-person overlap", () => {
    const contract = visibleContract(); const foreground = foregroundFromRow(150); bindForeground(contract, foreground);
    contract.forbiddenRegions = [{ id: "person-behind-foreground", polygon: box(0.45, 0.75, 0.1, 0.1) }];
    const result = computeFixedPlacement({ contract, board: BOARD, sprite: extractVisible(), foreground });
    expect(result.ok).toBe(false);
    expect(result.flags.map(f => f.code)).toContain("forbidden_overlap");
    expect(result.measurements.nativeForbiddenOverlaps[0]!.pixels).toBeGreaterThan(0);
  });

  it("fails an occluded face/eye and an entirely hidden figure", () => {
    const contract = visibleContract(); const foreground = foregroundFromRow(0); bindForeground(contract, foreground);
    const result = computeFixedPlacement({ contract, board: BOARD, sprite: extractVisible(), foreground });
    expect(result.ok).toBe(false);
    expect(result.visibility!.hitRect).toBeNull();
    expect(result.flags.map(f => f.code)).toEqual(expect.arrayContaining(["fully_occluded_figure", "foreground_face_occlusion", "foreground_eye_occlusion"]));
  });

  it("records v3 source-frame provenance, midpoint derivation, native masters and visible assets separately", () => {
    const sprite = extractVisible(); const contract = visibleContract(); const foreground = foregroundFromRow(150); bindForeground(contract, foreground);
    const result = computeFixedPlacement({ contract, board: BOARD, sprite, foreground }); const manifest = fixedPlacementManifest(result, sprite);
    expect(manifest.version).toBe("fixed-sprite-manifest/v3");
    expect(manifest.source.measurementVersion).toBe("visible-face/v1");
    expect(manifest.source.measurementFrame).toEqual(sprite.source.measurementFrame);
    expect(manifest.source.derivedLandmarks!.soleMidpoint).toEqual(sprite.derivedLandmarks!.soleMidpoint);
    expect(manifest.sourceImage.rgbaSha256).not.toBe(manifest.visibility!.sourceImage.rgbaSha256);
    expect(manifest.visibility!.sourceImage).not.toHaveProperty("rgba");
    expect(manifest.unoccludedComposite!.rgbaSha256).toHaveLength(64);
    expect(manifest.automaticRelease).toBe(false);
    expect(manifest.semanticStatus).toBe("pending");
  });
});

describe("fixed placement contracts", () => {
  it("rejects missing contracts and a mismatched board hash or dimensions", () => {
    const sprite = extract();
    expect(() => computeFixedPlacement({ contract: undefined, board: BOARD, sprite })).toThrow(/explicit valid/);
    expect(() => computeFixedPlacement({ contract: contract(), board: { ...BOARD, sha256: "b".repeat(64) }, sprite })).toThrow(/Board hash or dimensions/);
    expect(() => computeFixedPlacement({ contract: contract(), board: { ...BOARD, width: 201 }, sprite })).toThrow(/Board hash or dimensions/);
  });

  it("places a seated pose by seat contact, which remains distinct from feet", () => {
    const source = { ...SOURCE, poseId: "seated-side" };
    const authored = contract(source);
    authored.support = { type: "seat", sourceLandmark: "seatContact", destination: { x: 0.55, y: 0.6 }, tolerancePx: 1 };
    const placement = computeFixedPlacement({ contract: authored, board: BOARD, sprite: extract(figure(), source) });
    expect(placement.ok).toBe(true);
    expect(placement.landmarks.seatContact).toEqual({ x: 110.00000000000001, y: 120 });
    expect(placement.landmarks.feet!.y).toBe(130);
    expect(placement.landmarks.feet).not.toEqual(placement.landmarks.seatContact);
    authored.support.sourceLandmark = "feet";
    expect(() => computeFixedPlacement({ contract: authored, board: BOARD, sprite: extract(figure(), source) })).toThrow(/seatContact/);
  });

  it("an asymmetric arm changes the crop but cannot shift feet or change head-based scale", () => {
    const ordinary = extract();
    const arms = figure();
    paint(arms, 20, 15, 9, 3);
    const asymmetric = extract(arms);
    expect(asymmetric.width).toBeGreaterThan(ordinary.width);
    const a = computeFixedPlacement({ contract: contract(), board: BOARD, sprite: ordinary });
    const b = computeFixedPlacement({ contract: contract(), board: BOARD, sprite: asymmetric });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.landmarks.feet).toEqual({ x: 100, y: 140 });
    expect(b.landmarks.feet).toEqual(a.landmarks.feet);
    expect(b.transform).toEqual(a.transform);
  });

  it("supports one explicit support anchor and a scale measurement named by the fixed recipe", () => {
    const authored = contract();
    authored.scale.destinationDistancePx = 13.5;
    const placement = computeFixedPlacement({ contract: authored, board: BOARD, sprite: extract() });
    expect(placement.ok).toBe(true);
    expect(placement.transform.scale).toBe(1.5);
    expect(placement.landmarks.feet).toEqual({ x: 100, y: 140 });
    expect(placement.landmarks.headBottom!.y - placement.landmarks.headTop!.y).toBe(13.5);
  });

  it("fails rendered overlap with a forbidden person and does not fall back or shrink", () => {
    const authored = contract();
    authored.forbiddenRegions = [{ id: "neighbour-person", polygon: box(0.45, 0.5, 0.15, 0.3) }];
    const placement = computeFixedPlacement({ contract: authored, board: BOARD, sprite: extract() });
    expect(placement.ok).toBe(false);
    expect(placement.flags.map((item) => item.code)).toContain("forbidden_overlap");
    expect(placement.measurements.forbiddenOverlaps[0]!.pixels).toBeGreaterThan(0);
    expect(placement.contract.slotId).toBe("authored-only");
    expect(placement.transform.scale).toBe(1);
  });

  it("checks the actual alpha envelope and independent authored anchors", () => {
    const authored = contract();
    authored.allowedEnvelope = box(0.495, 0.695, 0.01, 0.01);
    authored.anchorChecks = [{ sourceLandmark: "headTop", destination: { x: 0.5, y: 0.1 }, tolerancePx: 1 }];
    const placement = computeFixedPlacement({ contract: authored, board: BOARD, sprite: extract() });
    expect(placement.ok).toBe(false);
    expect(placement.flags.map((item) => item.code)).toEqual(expect.arrayContaining(["outside_allowed_envelope", "anchor_check_failed"]));
    expect(placement.transform.scale).toBe(1);
  });

  it("retains exact uniform geometry in the render and serializable manifest", () => {
    const sprite = extract();
    const placement = computeFixedPlacement({ contract: contract(), board: BOARD, sprite });
    const manifest = fixedPlacementManifest(placement, sprite);
    const pixelAtSourceHead = ((109 - placement.composite.top) * placement.composite.width + 95 - placement.composite.left) * 4;
    expect(placement.composite.rgba[pixelAtSourceHead + 3]).toBe(255);
    expect(manifest.transform).toEqual({ scale: 1, translateX: 84, translateY: 104 });
    expect(manifest.source.crop).toEqual(sprite.crop);
    expect(manifest.composite).not.toHaveProperty("rgba");
    expect(manifest.composite.rgbaSha256).toHaveLength(64);
    expect(JSON.parse(JSON.stringify(manifest)).ok).toBe(true);
  });

  it("cannot clear a source QA failure through placement", () => {
    const placement = computeFixedPlacement({ contract: contract(), board: BOARD, sprite: extract(figure(), SOURCE, false) });
    expect(placement.ok).toBe(false);
    expect(placement.flags.map((item) => item.code)).toContain("semantic_review_required");
  });

  it("trims transparent sampling padding so an edge placement has a valid composite origin", () => {
    const authored = contract();
    authored.support.destination.x = 5 / BOARD.width;
    const placement = computeFixedPlacement({ contract: authored, board: BOARD, sprite: extract() });
    expect(placement.ok).toBe(true);
    expect(placement.composite.left).toBe(0);
    expect(placement.landmarks.feet!.x).toBe(5);
    expect(placement.composite.width).toBe(11);
  });

  it("rejects stale foreground dimensions and missing required source landmarks", () => {
    const authored = contract();
    authored.foregroundMask = { ...BOARD, height: 201, mode: "board-foreground-alpha" };
    expect(() => computeFixedPlacement({ contract: authored, board: BOARD, sprite: extract() })).toThrow(/Foreground dimensions/);
    delete authored.foregroundMask;
    const source = { ...SOURCE, landmarks: { headTop: SOURCE.landmarks.headTop!, headBottom: SOURCE.landmarks.headBottom! } };
    expect(() => computeFixedPlacement({ contract: authored, board: BOARD, sprite: extract(figure(), source) })).toThrow(/Missing explicit feet/);
  });

  it("accepts varying source landmarks without modifying one frozen board recipe", () => {
    const authored = contract();
    Object.freeze(authored.support);
    Object.freeze(authored.scale);
    Object.freeze(authored);
    const frozenJson = JSON.stringify(authored);
    const shifted = Buffer.alloc(WIDTH * HEIGHT * 4);
    const original = figure();
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH - 2; x++) shifted.set(original.subarray((y * WIDTH + x) * 4, (y * WIDTH + x + 1) * 4), (y * WIDTH + x + 2) * 4);
    const shiftedSource: SpriteSource = {
      ...SOURCE,
      landmarks: Object.fromEntries(Object.entries(SOURCE.landmarks).map(([name, point]) => [name, { x: point!.x + 2 / WIDTH, y: name === "headBottom" ? 13 / HEIGHT : point!.y }])),
      protectedFacePolygon: SOURCE.protectedFacePolygon.map((point) => ({ ...point, x: point.x + 2 / WIDTH })),
    };
    const a = computeFixedPlacement({ contract: authored, board: BOARD, sprite: extract() });
    const b = computeFixedPlacement({ contract: authored, board: BOARD, sprite: extract(shifted, shiftedSource) });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(b.landmarks.feet).toEqual(a.landmarks.feet);
    expect(b.measurements.scaleDistancePx).toBe(9);
    expect(b.transform.scale).not.toBe(a.transform.scale);
    expect(JSON.stringify(authored)).toBe(frozenJson);
  });

  it("rejects a floated negative control against the same frozen seat recipe", () => {
    const authored = contract();
    authored.support = { ...authored.support, type: "seat", sourceLandmark: "seatContact" };
    const frozenJson = JSON.stringify(authored);
    Object.freeze(authored);
    const sprite = extract();
    const baseline = computeFixedPlacement({ contract: authored, board: BOARD, sprite });
    const floated = evaluateFixedPlacement({ contract: authored, board: BOARD, sprite, transform: { ...baseline.transform, translateY: baseline.transform.translateY - 45 } });
    expect(baseline.ok).toBe(true);
    expect(floated.ok).toBe(false);
    expect(floated.measurements.supportDistancePx).toBe(45);
    expect(floated.measurements.scaleErrorPx).toBe(0);
    expect(floated.flags.map((item) => item.code)).toContain("support_check_failed");
    expect(JSON.stringify(authored)).toBe(frozenJson);
  });

  it("rejects 1.5x growth about the seat even though the support still matches", () => {
    const authored = contract();
    authored.support = { ...authored.support, type: "seat", sourceLandmark: "seatContact" };
    const sprite = extract();
    const baseline = computeFixedPlacement({ contract: authored, board: BOARD, sprite });
    const scale = baseline.transform.scale * 1.5;
    const enlarged = evaluateFixedPlacement({ contract: authored, board: BOARD, sprite, transform: {
      scale,
      translateX: authored.support.destination.x * BOARD.width - SOURCE.landmarks.seatContact!.x * WIDTH * scale,
      translateY: authored.support.destination.y * BOARD.height - SOURCE.landmarks.seatContact!.y * HEIGHT * scale,
    } });
    expect(enlarged.ok).toBe(false);
    expect(enlarged.measurements.supportDistancePx).toBe(0);
    expect(enlarged.measurements.scaleErrorPx).toBe(4.5);
    expect(enlarged.flags.map((item) => item.code)).toContain("scale_check_failed");
    expect(enlarged.flags.map((item) => item.code)).not.toContain("support_check_failed");
    expect(enlarged.contract).toEqual(baseline.contract);
  });

  it("retains native cleaned pixels and their cropped transform when the board preview shrinks", () => {
    const authored = contract();
    authored.scale.destinationDistancePx = 4.5;
    const sprite = extract();
    const placement = computeFixedPlacement({ contract: authored, board: BOARD, sprite });
    expect(placement.ok).toBe(true);
    expect(placement.sourceImage.rgba).toEqual(sprite.rgba);
    expect(placement.sourceImage.width).toBe(sprite.width);
    expect(placement.sourceImage.height).toBe(sprite.height);
    expect(placement.composite.height).toBeLessThan(placement.sourceImage.height);
    expect(placement.sourceImage.transform.translateX).toBe(placement.transform.translateX + sprite.crop.left * placement.transform.scale);
    const manifest = fixedPlacementManifest(placement, sprite);
    expect(manifest.sourceImage.rgbaSha256).toBe(sha256Rgba(sprite.rgba, sprite.width, sprite.height));
    expect(manifest.sourceImage.resolution).toBe("native-cleaned");
    expect(manifest.sourceImage).not.toHaveProperty("rgba");
    expect(manifest.composite.purpose).toBe("board-resolution-qa-preview-only");
  });

  it("checks native-resolution detail that falls between preview pixel centres", () => {
    const authored = contract();
    authored.scale.destinationDistancePx = 4.5;
    authored.forbiddenRegions = [{ id: "fine-feature", polygon: box(97.74 / 200, 124.74 / 200, 0.02 / 200, 0.02 / 200) }];
    const placement = computeFixedPlacement({ contract: authored, board: BOARD, sprite: extract() });
    expect(placement.measurements.forbiddenOverlaps[0]!.pixels).toBe(0);
    expect(placement.measurements.nativeForbiddenOverlaps[0]!.pixels).toBe(1);
    expect(placement.ok).toBe(false);
    expect(placement.flags.map((item) => item.code)).toContain("forbidden_overlap");
  });

  it("rejects source coordinates or literal source scale values embedded in a v2 recipe", () => {
    const authored = contract();
    expect(() => computeFixedPlacement({ contract: { ...authored, sourceLandmarks: SOURCE.landmarks }, board: BOARD, sprite: extract() })).toThrow(/explicit valid/);
    expect(() => computeFixedPlacement({ contract: { ...authored, scale: { ...authored.scale, sourceLength: 0.2 } }, board: BOARD, sprite: extract() })).toThrow(/explicit valid/);
    expect(() => evaluateFixedPlacement({ contract: authored, board: BOARD, sprite: extract(), transform: { scale: 1, translateX: Number.NaN, translateY: 0 } })).toThrow(/finite positive uniform/);
  });
});
