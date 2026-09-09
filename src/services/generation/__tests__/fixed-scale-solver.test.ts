import { describe, expect, it } from "vitest";
import {
  computeFixedPlacement, evaluateFixedPlacement, extractSpriteCell, sha256Bytes, sha256Rgba,
  type FixedSlotContractV3, type NormalizedPolygon, type VisibleSpriteSource,
} from "../fixed-sprite";
import { solveFixedScale, type FixedScaleSolverInput, type FixedScaleSolverPolicy } from "../fixed-scale-solver";

const WIDTH = 32;
const HEIGHT = 40;
const BOARD = { sha256: "a".repeat(64), width: 200, height: 200 };
const POLICY: FixedScaleSolverPolicy = { version: "fixed-scale-solver/v1" };
const box = (x: number, y: number, w: number, h: number): NormalizedPolygon => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const hashJson = (value: unknown) => sha256Bytes(Buffer.from(JSON.stringify(value)));

function fixture() {
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
  const paint = (x: number, y: number, width: number, height: number) => {
    for (let py = y; py < y + height; py++) for (let px = x; px < x + width; px++) {
      const i = (py * WIDTH + px) * 4;
      rgba[i] = 90; rgba[i + 1] = 120; rgba[i + 2] = 180; rgba[i + 3] = 255;
    }
  };
  paint(8, 5, 17, 10); paint(12, 15, 9, 11); paint(12, 26, 3, 11); paint(18, 26, 3, 11);
  const source: VisibleSpriteSource = {
    measurementVersion: "visible-face/v1", poseId: "standing",
    landmarks: { eyeMidpoint: { x: 16 / WIDTH, y: 9 / HEIGHT }, chin: { x: 16 / WIDTH, y: 14 / HEIGHT }, leftFoot: { x: 13.5 / WIDTH, y: 37 / HEIGHT }, rightFoot: { x: 19.5 / WIDTH, y: 37 / HEIGHT } },
    protectedFacePolygon: box(14 / WIDTH, 10 / HEIGHT, 4 / WIDTH, 3 / HEIGHT), landmarkTolerancePx: 0,
    measurementFrame: { rgbaSha256: sha256Rgba(rgba, WIDTH, HEIGHT), width: WIDTH, height: HEIGHT, cell: { id: "standing", left: 0, top: 0, width: WIDTH, height: HEIGHT }, coordinates: "cell-normalized-pixel-edges" },
  };
  return { rgba, source };
}
function extract(data = fixture(), reviewed = true) {
  return extractSpriteCell({ rgba: data.rgba, width: WIDTH, height: HEIGHT, grid: { cells: [data.source.measurementFrame.cell] }, cellId: "standing", source: data.source,
    ...(reviewed ? { review: { sourceSha256: sha256Rgba(data.rgba, WIDTH, HEIGHT), cellId: "standing", figureCount: 1, completeFigure: true, extraProps: false, poseMatches: true, reviewer: "synthetic solver fixture" } } : {}),
  });
}
function contract(): FixedSlotContractV3 {
  return { version: "fixed-sprite/v3", measurementVersion: "visible-face/v1", board: BOARD, slotId: "frozen-standing", poseId: "standing",
    support: { type: "ground", sourceLandmark: "soleMidpoint", destination: { x: 0.5, y: 0.8 }, tolerancePx: 5 },
    scale: { kind: "landmark-distance", from: "eyeMidpoint", to: "chin", destinationDistancePx: 5, tolerancePx: 0.5 },
    anchorChecks: [], allowedEnvelope: box(0, 0, 1, 1), forbiddenRegions: [],
  };
}
function input(recipe = contract()): FixedScaleSolverInput { return { contract: recipe, board: BOARD, sprite: extract(), policy: POLICY }; }
function blockEverything(recipe: FixedSlotContractV3) { recipe.forbiddenRegions = [{ id: "all-forbidden", polygon: box(0, 0, 1, 1) }]; }

describe("explicit fixed scale search", () => {
  it("prefers the original target and never claims semantic or automatic release", () => {
    const data = input(); const nominal = computeFixedPlacement(data);
    const result = solveFixedScale(data);
    expect(result.status).toBe("feasible-tested-candidate");
    expect(result.geometryPassed).toBe(true);
    expect(result.attempts).toHaveLength(1);
    expect(result.selectedAttemptIndex).toBe(0);
    expect(result.targetAttempt).toBe(result.attempts[0]);
    expect(result.placement!.transform).toEqual(nominal.transform);
    expect(result.search.intervalExhaustivelyProven).toBe(false);
    expect(result.semanticStatus).toBe("pending");
    expect(result.automaticRelease).toBe(false);
  });

  it("tries a zero-width interval exactly once", () => {
    const recipe = contract(); recipe.scale.tolerancePx = 0; blockEverything(recipe);
    const result = solveFixedScale(input(recipe));
    expect(result.search.plannedFaceDistancesPx).toEqual([5]);
    expect(result.attempts).toHaveLength(1);
    expect(result.status).toBe("no-feasible-tested-candidate");
  });

  it("includes fractional endpoints with deterministic smaller-face tie breaking", () => {
    const recipe = contract(); recipe.scale.tolerancePx = 0.25; blockEverything(recipe);
    const result = solveFixedScale(input(recipe));
    expect(result.attempts.map(a => a.faceDistancePx)).toEqual([5, 4.9, 5.1, 4.8, 5.2, 4.75, 5.25]);
    expect(result.search.planTruncated).toBe(false);
    expect(new Set(result.search.plannedFaceDistancesPx).size).toBe(7);
  });

  it("finds a passing non-grid endpoint without changing any frozen anchor or tolerance", () => {
    const recipe = contract(); recipe.scale.tolerancePx = 0.25;
    recipe.anchorChecks = [{ sourceLandmark: "eyeMidpoint", destination: { x: 99.525 / 200, y: 133.4 / 200 }, tolerancePx: 0.001 }];
    const data = input(recipe); const before = hashJson(recipe); const sourceBefore = Buffer.from(data.sprite.rgba);
    const result = solveFixedScale(data);
    expect(result.targetAttempt.geometryPassed).toBe(false);
    expect(result.targetAttempt.flags.map(f => f.code)).toContain("anchor_check_failed");
    expect(result.placement!.measurements.scaleDistancePx).toBeCloseTo(4.75);
    expect(result.attempts.every(a => a.measurements.supportDistancePx < 1e-10)).toBe(true);
    expect(result.placement!.landmarks.soleMidpoint).toEqual({ x: 100, y: 160 });
    expect(hashJson(recipe)).toBe(before);
    expect(data.sprite.rgba).toEqual(sourceBefore);
    expect(result.placement!.sourceImage.rgba).toBe(data.sprite.rgba);
    expect(result.placement!.sourceImage.width).toBe(data.sprite.width);
    expect(result.placement!.sourceImage.height).toBe(data.sprite.height);
    expect(computeFixedPlacement(data).measurements.scaleDistancePx).toBe(5);
    expect(computeFixedPlacement(data).ok).toBe(false);
  });

  it("reserves both endpoints under the hard cap and reports incomplete coverage honestly", () => {
    const recipe = contract(); recipe.scale.tolerancePx = 3; blockEverything(recipe);
    const result = solveFixedScale({ ...input(recipe), policy: { ...POLICY, stepPx: 0.01 } });
    expect(result.attempts).toHaveLength(65);
    expect(result.search.uncappedCandidateCount).toBeGreaterThan(65);
    expect(result.search.planTruncated).toBe(true);
    expect(result.search.plannedFaceDistancesPx).toContain(2);
    expect(result.search.plannedFaceDistancesPx).toContain(8);
    expect(result.search.intervalExhaustivelyProven).toBe(false);
    expect(result.status).toBe("no-feasible-tested-candidate");
    expect(result.placement).toBeNull();
    expect(result.selectedAttemptIndex).toBeNull();
    expect(result.attempts.every(a => a.flags.some(f => f.code === "forbidden_overlap"))).toBe(true);
  });

  it("can select the upper endpoint when a three-call cap drops the interior grid", () => {
    const recipe = contract(); recipe.scale.tolerancePx = 0.25;
    recipe.anchorChecks = [{ sourceLandmark: "eyeMidpoint", destination: { x: 99.475 / 200, y: 130.6 / 200 }, tolerancePx: 0.001 }];
    const result = solveFixedScale({ ...input(recipe), policy: { ...POLICY, maxCandidates: 3 } });
    expect(result.search.planTruncated).toBe(true);
    expect(result.attempts.map(a => a.faceDistancePx)).toEqual([5, 4.75, 5.25]);
    expect(result.selectedAttemptIndex).toBe(2);
    expect(result.placement!.measurements.scaleDistancePx).toBeCloseTo(5.25);
    expect(result.attempts.every(a => a.measurements.supportDistancePx < 1e-10)).toBe(true);
  });

  it("does not assume forbidden geometry is monotonic in scale", () => {
    const recipe = contract(); recipe.scale.tolerancePx = 1;
    recipe.forbiddenRegions = [{ id: "small-face", polygon: box(92 / 200, 134 / 200, 1 / 200, 1 / 200) }];
    const data = input(recipe);
    const result = solveFixedScale(data);
    expect(result.targetAttempt.geometryPassed).toBe(false);
    expect(result.geometryPassed).toBe(true);
    expect(result.placement!.measurements.scaleDistancePx).toBeCloseTo(4.1);
    for (const face of [4, 6]) {
      const scale = face / 5;
      expect(evaluateFixedPlacement({ ...data, transform: { scale, translateX: 100 - 16.5 * scale, translateY: 160 - 37 * scale } }).ok).toBe(true);
    }
    expect(result.attempts.every(a => a.faceDistancePx >= 4 && a.faceDistancePx <= 6)).toBe(true);
  });

  it("uses exact individual support landmarks, not just the midpoint", () => {
    for (const name of ["leftFoot", "rightFoot"] as const) {
      const recipe = contract(); recipe.support.sourceLandmark = name;
      const result = solveFixedScale(input(recipe));
      expect(result.placement!.landmarks[name]).toEqual({ x: 100, y: 160 });
      expect(result.targetAttempt.measurements.supportDistancePx).toBe(0);
    }
  });

  it("measures Euclidean face distance in original non-square source coordinates", () => {
    const data = fixture(); data.source.landmarks.chin.x = 19 / WIDTH;
    const sprite = extract(data); const result = solveFixedScale({ ...input(), sprite });
    expect(result.search.sourceFaceDistancePx).toBeCloseTo(Math.sqrt(34));
    expect(result.placement!.transform.scale).toBeCloseTo(5 / Math.sqrt(34));
    expect(result.placement!.sourceImage.crop).toEqual(sprite.crop);
    expect(sprite.crop.left).not.toBe(0);
    expect(result.placement!.sourceImage.sourceWidth).toBe(WIDTH);
    expect(result.placement!.sourceImage.sourceHeight).toBe(HEIGHT);
  });

  it("records exact source, recipe, board and policy provenance without mutating inputs", () => {
    const data = input(); const before = hashJson({ source: data.sprite.source, binding: data.sprite.extractionBinding, contract: data.contract });
    const result = solveFixedScale(data);
    expect(result.provenance.contractSha256).toBe(hashJson(data.contract));
    expect(result.provenance.suppliedContractSha256).toBe(hashJson(data.contract));
    expect(result.provenance.policySha256).toBe(hashJson(result.search.policy));
    expect(result.provenance.sourceSheetRgbaSha256).toBe(data.sprite.sourceSha256);
    expect(result.provenance.extractionBinding).toEqual(data.sprite.extractionBinding);
    expect(result.provenance.board).toEqual(BOARD);
    expect(hashJson({ source: data.sprite.source, binding: data.sprite.extractionBinding, contract: data.contract })).toBe(before);
  });

  it("propagates board/source provenance errors instead of reporting an ordinary failed search", () => {
    expect(() => solveFixedScale({ ...input(), board: { ...BOARD, sha256: "b".repeat(64) } })).toThrow(/Board hash/);
    const altered = input(); altered.sprite.rgba[0] = altered.sprite.rgba[0]! ^ 1;
    expect(() => solveFixedScale(altered)).toThrow(/changed after/);
    const measured = input(); measured.sprite.source.landmarks.chin.x += 0.01;
    expect(() => solveFixedScale(measured)).toThrow(/changed after/);
    const cropped = input(); cropped.sprite.crop.left++;
    expect(() => solveFixedScale(cropped)).toThrow(/changed after/);
  });

  it("preserves foreground pixels and validates missing, stale and undeclared masks", () => {
    const foreground = { rgba: Buffer.alloc(200 * 200 * 4), width: 200, height: 200 };
    for (let y = 150; y < 200; y++) for (let x = 0; x < 200; x++) foreground.rgba[(y * 200 + x) * 4 + 3] = 255;
    const recipe = contract(); recipe.foregroundMask = { rgbaSha256: sha256Rgba(foreground.rgba, 200, 200), width: 200, height: 200, mode: "board-foreground-alpha" };
    const data = { ...input(recipe), foreground }; const bytes = Buffer.from(foreground.rgba);
    const result = solveFixedScale(data);
    expect(result.geometryPassed).toBe(true);
    expect(result.provenance.foregroundRgbaSha256).toBe(recipe.foregroundMask.rgbaSha256);
    expect(foreground.rgba).toEqual(bytes);
    expect(result.placement!.sourceImage.rgba).toEqual(data.sprite.rgba);
    expect(result.placement!.visibility!.occludedSourcePixels).toBeGreaterThan(0);
    expect(() => solveFixedScale(input(recipe))).toThrow(/foreground/i);
    const stale = { ...foreground, rgba: Buffer.from(foreground.rgba) }; stale.rgba[0] = 1;
    expect(() => solveFixedScale({ ...data, foreground: stale })).toThrow(/foreground/i);
    expect(() => solveFixedScale({ ...input(), foreground })).toThrow(/foreground/i);
  });

  it("does not let foreground conceal forbidden overlap", () => {
    const foreground = { rgba: Buffer.alloc(200 * 200 * 4), width: 200, height: 200 };
    for (let y = 150; y < 200; y++) for (let x = 0; x < 200; x++) foreground.rgba[(y * 200 + x) * 4 + 3] = 255;
    const recipe = contract(); recipe.scale.tolerancePx = 0.1;
    recipe.foregroundMask = { rgbaSha256: sha256Rgba(foreground.rgba, 200, 200), width: 200, height: 200, mode: "board-foreground-alpha" };
    recipe.forbiddenRegions = [{ id: "hidden-feet-still-forbidden", polygon: box(0, 150 / 200, 1, 50 / 200) }];
    const result = solveFixedScale({ ...input(recipe), foreground });
    expect(result.geometryPassed).toBe(false);
    expect(result.attempts.every(a => a.flags.some(f => f.code === "forbidden_overlap"))).toBe(true);
  });

  it("cannot rescue an unreviewed source or repair protected face holes", () => {
    const recipe = contract(); recipe.scale.tolerancePx = 0.1;
    const unreviewed = solveFixedScale({ ...input(recipe), sprite: extract(fixture(), false) });
    expect(unreviewed.geometryPassed).toBe(false);
    expect(unreviewed.attempts.every(a => a.flags.some(f => f.code === "semantic_review_required"))).toBe(true);
    const data = fixture(); data.rgba[(11 * WIDTH + 15) * 4 + 3] = 0;
    data.source.measurementFrame.rgbaSha256 = sha256Rgba(data.rgba, WIDTH, HEIGHT);
    const sprite = extract(data); const before = Buffer.from(sprite.rgba);
    const hole = solveFixedScale({ ...input(recipe), sprite });
    expect(hole.geometryPassed).toBe(false);
    expect(hole.attempts.every(a => a.flags.some(f => f.code === "protected_face_hole"))).toBe(true);
    expect(sprite.rgba).toEqual(before);
  });

  it("checks corrupt controls independently without asking the solver to fix them", () => {
    const data = input(); const result = solveFixedScale(data); const base = result.placement!;
    const floating = evaluateFixedPlacement({ ...data, transform: { ...base.transform, translateY: base.transform.translateY - 45 } });
    const scale = base.transform.scale * 1.5;
    const oversized = evaluateFixedPlacement({ ...data, transform: { scale, translateX: 100 - 16.5 * scale, translateY: 160 - 37 * scale } });
    expect(floating.flags.map(f => f.code)).toContain("support_check_failed");
    expect(oversized.flags.map(f => f.code)).toContain("scale_check_failed");
    expect(floating.contract).toEqual(base.contract);
    expect(oversized.contract).toEqual(base.contract);
    expect(result.attempts).toHaveLength(1);
  });

  it("rejects absent/v2 contracts and physically invalid interval endpoints", () => {
    expect(() => solveFixedScale({ ...input(), contract: undefined })).toThrow(/fixed-sprite\/v3/);
    expect(() => solveFixedScale({ ...input(), contract: { ...contract(), version: "fixed-sprite/v2" } })).toThrow(/fixed-sprite\/v3/);
    for (const target of [0, -1]) {
      const recipe = contract(); recipe.scale.destinationDistancePx = target;
      expect(() => solveFixedScale(input(recipe))).toThrow();
    }
    const recipe = contract(); recipe.scale.destinationDistancePx = 0.5;
    expect(() => solveFixedScale(input(recipe))).toThrow(/strictly positive/);
  });

  it("requires explicit bounded policy and rejects unsafe planning parameters", () => {
    for (const policy of [undefined, {}, { ...POLICY, stepPx: 0 }, { ...POLICY, stepPx: Number.NaN }, { ...POLICY, stepPx: Infinity }, { ...POLICY, stepPx: 1e-300 }, { ...POLICY, maxCandidates: 66 }, { ...POLICY, maxCandidates: 1 }, { ...POLICY, maxCandidates: 3.5 }]) {
      expect(() => solveFixedScale({ ...input(), policy: policy as FixedScaleSolverPolicy })).toThrow();
    }
  });
});
