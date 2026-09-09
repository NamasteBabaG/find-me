import { describe, expect, it } from "vitest";
import type { SceneConfig, TargetConfig } from "../../../domain/game/config";
import { targetGeometry } from "../../../game/engine/target-geometry";
import { adaptFixedSpriteForPlayer, type FixedSpriteBoardRasterPlayerInput, type FixedSpritePlayerInput } from "../fixed-sprite-player";
import { computeFixedPlacement, evaluateFixedPlacement, extractSpriteCell, sha256Bytes, sha256Rgba, type FixedSlotContractV3, type NormalizedPolygon, type VisibleSpriteSource } from "../fixed-sprite";

const W = 32, H = 40;
const BOARD = { width: 160, height: 120, sha256: "a".repeat(64) };
const box = (x: number, y: number, w: number, h: number): NormalizedPolygon => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
function paint(rgba: Buffer, x: number, y: number, w: number, h: number, alpha = 255) {
  for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) rgba.set([90, 120, 180, alpha], (py * W + px) * 4);
}
function fixture(scale = 1, foregroundAlpha = 255): FixedSpritePlayerInput {
  const rgba = Buffer.alloc(W * H * 4);
  paint(rgba, 11, 5, 11, 10); // head
  paint(rgba, 12, 15, 9, 11); // torso
  paint(rgba, 9, 17, 16, 5); // asymmetric arms: non-square native crop with nonzero offset
  paint(rgba, 12, 26, 3, 11); paint(rgba, 18, 26, 3, 11); // separate complete soles
  paint(rgba, 9, 17, 1, 1, 128); // retained fringe, not deleted by the adapter
  const cell = { id: "standing", left: 0, top: 0, width: W, height: H };
  const source: VisibleSpriteSource = {
    measurementVersion: "visible-face/v1", poseId: "standing",
    landmarks: { eyeMidpoint: { x: 16 / W, y: 9 / H }, chin: { x: 16 / W, y: 14 / H }, leftFoot: { x: 13.5 / W, y: 37 / H }, rightFoot: { x: 19.5 / W, y: 37 / H } },
    landmarkTolerancePx: 0, protectedFacePolygon: box(14 / W, 10 / H, 4 / W, 3 / H),
    measurementFrame: { rgbaSha256: sha256Rgba(rgba, W, H), width: W, height: H, cell, coordinates: "cell-normalized-pixel-edges" },
  };
  const extracted = extractSpriteCell({ rgba, width: W, height: H, grid: { cells: [cell] }, cellId: cell.id, source,
    review: { sourceSha256: source.measurementFrame.rgbaSha256, cellId: cell.id, figureCount: 1, completeFigure: true, extraProps: false, poseMatches: true, reviewer: "synthetic fixture" },
  });
  const foreground = { rgba: Buffer.alloc(BOARD.width * BOARD.height * 4), width: BOARD.width, height: BOARD.height };
  for (let y = 79; y < BOARD.height; y++) for (let x = 0; x < BOARD.width; x++) foreground.rgba.set([120, 80, 40, foregroundAlpha], (y * BOARD.width + x) * 4);
  const contract: FixedSlotContractV3 = {
    version: "fixed-sprite/v3", measurementVersion: "visible-face/v1", poseId: "standing", board: BOARD, slotId: "frozen-standing-slot",
    support: { type: "ground", sourceLandmark: "soleMidpoint", destination: { x: 82.5 / BOARD.width, y: 90 / BOARD.height }, tolerancePx: 0 },
    scale: { kind: "landmark-distance", from: "eyeMidpoint", to: "chin", destinationDistancePx: 5 * scale, tolerancePx: 0.1 },
    bodyScale: { kind: "landmark-distance-interval", from: "eyeMidpoint", to: "soleMidpoint", minDistancePx: 10, maxDistancePx: 35 },
    anchorChecks: [], allowedEnvelope: box(0, 0, 1, 1), forbiddenRegions: [],
    foregroundMask: { rgbaSha256: sha256Rgba(foreground.rgba, foreground.width, foreground.height), width: foreground.width, height: foreground.height, mode: "board-foreground-alpha" },
  };
  const placement = computeFixedPlacement({ contract, sprite: extracted, board: BOARD, foreground });
  expect(extracted.ok).toBe(true); expect(placement.ok).toBe(true);
  const native = placement.visibility!.sourceImage;
  return {
    placement, extracted, foreground,
    contractSha256: sha256Bytes(Buffer.from(JSON.stringify(placement.contract))),
    boardAsset: { ...BOARD, url: "/boards/exact-original.webp" },
    asset: { url: "/signed/native-visible.png?test=receipt", width: native.width, height: native.height, rgbaSha256: native.rgbaSha256 },
    runtime: { art: { base: "/boards/exact-original.webp", width: BOARD.width, height: BOARD.height }, slot: { id: contract.slotId, flip: false, rotation: 0, layer: "front", zIndex: 10 } },
  };
}

/** Integer-aligned source-over fixture, not a claim to emulate browser filters. */
function onOriginalBoard(layer: { rgba: Uint8Array; width: number; height: number; left: number; top: number }): Buffer {
  expect(Number.isInteger(layer.left) && Number.isInteger(layer.top)).toBe(true);
  const board = Buffer.alloc(BOARD.width * BOARD.height * 4);
  for (let y = 0; y < BOARD.height; y++) for (let x = 0; x < BOARD.width; x++) board.set(y >= 79 ? [120, 80, 40, 255] : [220, 230, 240, 255], (y * BOARD.width + x) * 4);
  for (let y = 0; y < layer.height; y++) for (let x = 0; x < layer.width; x++) {
    const s = (y * layer.width + x) * 4, b = ((layer.top + y) * BOARD.width + layer.left + x) * 4;
    const a = layer.rgba[s + 3]! / 255;
    for (let channel = 0; channel < 3; channel++) board[b + channel] = Math.round(layer.rgba[s + channel]! * a + board[b + channel]! * (1 - a));
  }
  return board;
}

function asRaster(input = fixture(0.63)): FixedSpriteBoardRasterPlayerInput {
  const patch = input.placement.composite;
  return { ...input, exportMode: "board-raster", asset: { url: "/signed/exact-board-raster.png", width: patch.width, height: patch.height, rgbaSha256: sha256Rgba(patch.rgba, patch.width, patch.height) } };
}

describe("fixed v3 native player adapter", () => {
  it("preserves native asymmetric crop, source offset and fractional uniform geometry without rounding", () => {
    const input = fixture(0.63);
    const result = adaptFixedSpriteForPlayer(input);
    const { sprite } = result;
    expect(input.extracted.crop).toEqual({ left: 9, top: 5, width: 16, height: 32 });
    expect([sprite.width, sprite.height]).toEqual([16, 32]);
    expect(sprite.width).not.toBe(input.placement.composite.width);
    expect(sprite.rect.w * BOARD.width).toBeCloseTo(16 * 0.63, 12);
    expect(sprite.rect.h * BOARD.height).toBeCloseTo(32 * 0.63, 12);
    const native = input.placement.visibility!.sourceImage;
    expect(sprite.rect.x * BOARD.width).toBeCloseTo(native.transform.translateX, 12);
    expect(sprite.rect.y * BOARD.height).toBeCloseTo(native.transform.translateY, 12);
    for (const point of [{ x: 9, y: 5 }, { x: 25, y: 37 }, { x: 16, y: 9 }, { x: 12.25, y: 18.75 }]) {
      const playerX = (sprite.rect.x + (point.x - input.extracted.crop.left) / sprite.width * sprite.rect.w) * BOARD.width;
      const playerY = (sprite.rect.y + (point.y - input.extracted.crop.top) / sprite.height * sprite.rect.h) * BOARD.height;
      expect(playerX).toBeCloseTo(input.placement.transform.translateX + point.x * input.placement.transform.scale, 12);
      expect(playerY).toBeCloseTo(input.placement.transform.translateY + point.y * input.placement.transform.scale, 12);
      // The common stage zoom/translation also preserves this mapping at every zoom.
      expect(playerX * 2.7 - 48).toBeCloseTo((input.placement.transform.translateX + point.x * 0.63) * 2.7 - 48, 12);
    }
    expect(result.nativeAsset.rgba).toEqual(native.rgba);
    expect(result.nativeAsset.rgba).not.toBe(native.rgba);
    expect(result.provenance.sourceCellToBoard).toEqual(input.placement.transform);
    expect(result.provenance.nativeCropToBoard).toEqual(native.transform);
    expect(result.provenance.sourceRgbaSha256).toBe(input.extracted.sourceSha256);
    expect(result.provenance.contractSha256).toBe(input.contractSha256);
  });

  it("matches QA composition for an integer-aligned opaque foreground without restoring hidden legs", () => {
    const input = fixture();
    const result = adaptFixedSpriteForPlayer(input);
    const { nativeAsset: asset, sprite } = result;
    const playerBoard = onOriginalBoard({ ...asset, left: sprite.rect.x * BOARD.width, top: sprite.rect.y * BOARD.height });
    expect(playerBoard).toEqual(onOriginalBoard(input.placement.composite));
    const footPixel = ((36 - input.extracted.crop.top) * asset.width + 13 - input.extracted.crop.left) * 4 + 3;
    expect(input.extracted.rgba[footPixel]).toBe(255);
    expect(asset.rgba[footPixel]).toBe(0);
    expect(input.placement.visibility!.occludedSourcePixels).toBeGreaterThan(0);
    expect(sprite.hitRect.y + sprite.hitRect.h).toBeCloseTo(79 / BOARD.height, 12);
    expect(result.provenance.foregroundApplied).toBe(true);
    expect(result.provenance.foregroundReapplication).toBe(false);
    expect(result.provenance.placementMaskRgbaSha256).toBe(sha256Rgba(input.foreground!.rgba, BOARD.width, BOARD.height));
    expect(result.provenance.runtimeForegroundVerification).toBe("none");
  });

  it("keeps partial foreground alpha exactly once and labels broader browser parity unverified", () => {
    const input = fixture(1, 128);
    const result = adaptFixedSpriteForPlayer(input);
    const i = ((36 - input.extracted.crop.top) * result.nativeAsset.width + 13 - input.extracted.crop.left) * 4;
    expect(result.nativeAsset.rgba.subarray(i, i + 4)).toEqual(Buffer.from([90, 120, 180, 127]));
    expect(result.nativeAsset.rgba).toEqual(input.placement.visibility!.sourceImage.rgba);
    expect(result.provenance.geometryParity).toBe("exact-affine-unrounded");
    expect(result.browserPixelParity).toBe("unverified");
    expect(result.semanticStatus).toBe("pending");
    expect(result.automaticRelease).toBe(false);
    expect(result.sprite.kind).toBe("image");
    expect(result.sprite).not.toHaveProperty("bodyTemplate");
  });

  it("feeds observed eye and visible hit geometry unchanged into the actual player geometry route", () => {
    const input = fixture(0.63);
    const { sprite } = adaptFixedSpriteForPlayer(input);
    const slot = { ...input.runtime.slot, x: 0.1, y: 0.2, scale: 0.03, hintZone: { x: 0.1, y: 0.2, r: 0.1 }, hintText: "" };
    const target: TargetConfig = { id: "child", targetType: "hide", difficulty: 1, mission: "Find", item: "", success: ["Yes"], animation: "wave", slots: [slot, slot], sprite, spriteByVariant: { A: sprite, B: sprite } };
    const scene = { art: input.runtime.art, targets: [target, target, target] } as SceneConfig;
    for (const variant of ["A", "B"] as const) {
      const geometry = targetGeometry(scene, target, variant);
      expect(geometry.isPatch).toBe(true);
      expect(geometry.head).toEqual(input.placement.visibility!.headAnchor);
      expect(geometry.head).not.toEqual({ x: slot.x, y: slot.y });
      expect(geometry.hitRect).toEqual({ x0: sprite.hitRect.x, y0: sprite.hitRect.y, x1: sprite.hitRect.x + sprite.hitRect.w, y1: sprite.hitRect.y + sprite.hitRect.h });
      expect(geometry.sprite).toBe(sprite);
    }
  });

  it("supports visible-eye anchoring and scoped restored-face overlap without a player fallback", () => {
    const input = fixture();
    const contract = input.placement.contract as FixedSlotContractV3;
    contract.support = { type: "occluded-standing", sourceLandmark: "eyeMidpoint", destination: { ...input.placement.visibility!.headAnchor }, tolerancePx: 0 };
    contract.forbiddenRegions = [{ id: "restored-existing-face", scope: "final-visible", polygon: box(78 / BOARD.width, 81 / BOARD.height, 9 / BOARD.width, 8 / BOARD.height) }];
    input.placement = computeFixedPlacement({ contract, board: BOARD, sprite: input.extracted, foreground: input.foreground });
    input.contractSha256 = sha256Bytes(Buffer.from(JSON.stringify(input.placement.contract)));
    input.asset.rgbaSha256 = input.placement.visibility!.sourceImage.rgbaSha256;
    expect(input.placement.ok).toBe(true);
    expect(input.placement.measurements.forbiddenOverlaps[0]!.pixels).toBeGreaterThan(0);
    const result = adaptFixedSpriteForPlayer(input);
    expect(result.sprite.anchor).toEqual(contract.support.destination);
    expect(result.sprite.kind).toBe("image");
    expect(result.nativeAsset.rgba).toEqual(input.placement.visibility!.sourceImage.rgba);
    expect(result.automaticRelease).toBe(false);
  });

  it("rejects v2, missing visibility and forged successful placement outputs", () => {
    const old = fixture();
    old.placement.contract = { ...old.placement.contract, version: "fixed-sprite/v2" } as unknown as typeof old.placement.contract;
    expect(() => adaptFixedSpriteForPlayer(old)).toThrow(/Only visible-face/);
    const missing = fixture(); delete missing.placement.visibility;
    expect(() => adaptFixedSpriteForPlayer(missing)).toThrow(/differ from deterministic core replay/);
    const rejected = fixture(); rejected.placement.ok = false;
    expect(() => adaptFixedSpriteForPlayer(rejected)).toThrow(/rejected placement/);
    const mutated = fixture(); mutated.placement.visibility!.sourceImage.rgba[0] = 17;
    expect(() => adaptFixedSpriteForPlayer(mutated)).toThrow(/differ from deterministic core replay/);
    const geometry = fixture(); geometry.placement.visibility!.headAnchor.x += 0.01;
    expect(() => adaptFixedSpriteForPlayer(geometry)).toThrow(/differ from deterministic core replay/);
  });

  it("replays required hiding of both feet before supplying the native player asset", () => {
    const input = fixture();
    const contract = input.placement.contract as FixedSlotContractV3;
    contract.support = { type: "occluded-standing", sourceLandmark: "eyeMidpoint", destination: { ...input.placement.visibility!.headAnchor }, tolerancePx: 0 };
    contract.requiredHiddenLandmarks = [{ sourceLandmark: "leftFoot", radiusPx: 2 }, { sourceLandmark: "rightFoot", radiusPx: 2 }];
    input.placement = computeFixedPlacement({ contract, board: BOARD, sprite: input.extracted, foreground: input.foreground });
    input.contractSha256 = sha256Bytes(Buffer.from(JSON.stringify(input.placement.contract)));
    input.asset.rgbaSha256 = input.placement.visibility!.sourceImage.rgbaSha256;
    expect(input.placement.ok).toBe(true);
    expect(input.placement.measurements.requiredHiddenLandmarkChecks!.map(check => check.passed)).toEqual([true, true]);
    expect(adaptFixedSpriteForPlayer(input).nativeAsset.rgba).toEqual(input.placement.visibility!.sourceImage.rgba);

    // A separate fixture recipe exposes the left sole while still hiding the torso
    // and right sole. The adapter must independently replay the new core gate.
    for (let y = 86; y < 94; y++) for (let x = 76; x < 83; x++) input.foreground!.rgba[(y * BOARD.width + x) * 4 + 3] = 0;
    contract.foregroundMask!.rgbaSha256 = sha256Rgba(input.foreground!.rgba, BOARD.width, BOARD.height);
    input.placement = computeFixedPlacement({ contract, board: BOARD, sprite: input.extracted, foreground: input.foreground });
    input.contractSha256 = sha256Bytes(Buffer.from(JSON.stringify(input.placement.contract)));
    input.asset.rgbaSha256 = input.placement.visibility!.sourceImage.rgbaSha256;
    expect(input.placement.measurements.requiredHiddenLandmarkChecks!.map(check => check.passed)).toEqual([false, true]);
    expect(input.placement.flags.map(flag => flag.code)).toContain("required_foot_occlusion_failed");
    input.placement.ok = true; input.placement.flags = [];
    expect(() => adaptFixedSpriteForPlayer(input)).toThrow(/Core replay rejected.*required_foot_occlusion_failed/);
  });

  it("rechecks a floating negative control even if someone overwrites its ok flag", () => {
    const input = fixture();
    input.placement = evaluateFixedPlacement({ board: BOARD, sprite: input.extracted, foreground: input.foreground, contract: input.placement.contract,
      transform: { ...input.placement.transform, translateY: input.placement.transform.translateY - 8 },
    });
    expect(input.placement.ok).toBe(false);
    input.placement.ok = true; input.placement.flags = [];
    expect(() => adaptFixedSpriteForPlayer(input)).toThrow(/Core replay rejected.*support_check_failed/);
  });

  it("requires the exact frozen recipe, original board and extracted source hashes", () => {
    const recipe = fixture(); recipe.placement.contract.support.tolerancePx = 1;
    expect(() => adaptFixedSpriteForPlayer(recipe)).toThrow(/independently frozen contract hash/);
    const board = fixture(); board.boardAsset.sha256 = "b".repeat(64);
    expect(() => adaptFixedSpriteForPlayer(board)).toThrow(/Board hash or dimensions differ/);
    const source = fixture(); source.extracted.source.landmarks.eyeMidpoint.x += 0.01;
    expect(() => adaptFixedSpriteForPlayer(source)).toThrow(/changed after their bound extraction/);
    const mask = fixture(); mask.foreground!.rgba[3] = 1;
    expect(() => adaptFixedSpriteForPlayer(mask)).toThrow(/Foreground/);
  });

  it("does not accept a preview, unmasked source, resized asset, empty URL or altered board URL", () => {
    const source = fixture(); source.asset.rgbaSha256 = source.placement.sourceImage.rgbaSha256;
    expect(() => adaptFixedSpriteForPlayer(source)).toThrow(/native foreground-masked RGBA/);
    const preview = fixture(0.63); preview.asset.width = preview.placement.composite.width; preview.asset.height = preview.placement.composite.height;
    expect(() => adaptFixedSpriteForPlayer(preview)).toThrow(/native foreground-masked RGBA/);
    const empty = fixture(); empty.asset.url = "  ";
    expect(() => adaptFixedSpriteForPlayer(empty)).toThrow(/native foreground-masked RGBA/);
    const wrongUrl = fixture(); wrongUrl.runtime.art.base = "/boards/other.webp";
    expect(() => adaptFixedSpriteForPlayer(wrongUrl)).toThrow(/exact full-board URL/);
    const crop = fixture(); crop.runtime.art.width = 100;
    expect(() => adaptFixedSpriteForPlayer(crop)).toThrow(/exact full-board URL/);
  });

  it.each(["flip", "rotation", "adjust", "slot"] as const)("rejects runtime %s drift instead of rendering a different placement", (drift) => {
    const input = fixture();
    if (drift === "flip") input.runtime.slot.flip = true;
    if (drift === "rotation") input.runtime.slot.rotation = 1;
    if (drift === "adjust") input.runtime.adjust = { dx: 0.01, dy: 0, scale: 1 };
    if (drift === "slot") input.runtime.slot.id = "different-slot";
    expect(() => adaptFixedSpriteForPlayer(input)).toThrow(/No player flip|exact frozen contract/);
  });

  it("rejects foreground reapplication, including nominal front placement below global foreground z20", () => {
    const behind = fixture(); behind.runtime.slot.layer = "behindForeground";
    expect(() => adaptFixedSpriteForPlayer(behind)).toThrow(/Premasked sprites require front/);
    const frontBelow = fixture(); frontBelow.runtime.art.foreground = "/boards/foreground.png";
    expect(() => adaptFixedSpriteForPlayer(frontBelow)).toThrow(/zIndex > 20/);
    frontBelow.runtime.slot.zIndex = 20;
    expect(() => adaptFixedSpriteForPlayer(frontBelow)).toThrow(/zIndex > 20/);
    frontBelow.runtime.slot.zIndex = 21;
    const frontAbove = adaptFixedSpriteForPlayer(frontBelow);
    expect(frontAbove.provenance.foregroundReapplication).toBe(false);
    expect(frontAbove.provenance.runtimeForegroundVerification).toBe("caller-qa-required-unverified");
  });

  it("rejects an out-of-board native storage edge even if core alpha samples fit; never clamps it", () => {
    const input = fixture(0.63);
    const contract = { ...input.placement.contract, support: { ...input.placement.contract.support, destination: { x: (7.5 * 0.63 - 0.1) / BOARD.width, y: 90 / BOARD.height } } };
    input.placement = computeFixedPlacement({ board: BOARD, sprite: input.extracted, foreground: input.foreground, contract });
    input.contractSha256 = sha256Bytes(Buffer.from(JSON.stringify(input.placement.contract)));
    input.asset.rgbaSha256 = input.placement.visibility!.sourceImage.rgbaSha256;
    expect(input.placement.visibility!.sourceImage.transform.translateX).toBeCloseTo(-0.1, 12);
    expect(input.placement.ok).toBe(true);
    expect(() => adaptFixedSpriteForPlayer(input)).toThrow(/without rounding, clipping or recentering/);
  });
});

describe("fixed v3 board-raster player adapter", () => {
  it("keeps omitted mode identical to explicit native mode and preserves its serialized shape", () => {
    const input = fixture(0.63);
    const implicit = adaptFixedSpriteForPlayer(input);
    const explicit = adaptFixedSpriteForPlayer({ ...input, exportMode: "native" });
    expect(explicit).toEqual(implicit);
    expect(JSON.stringify(explicit)).toBe(JSON.stringify(implicit));
    expect(implicit).not.toHaveProperty("exportMode");
    expect(implicit).not.toHaveProperty("rasterAsset");
    expect(implicit.provenance.version).toBe("fixed-sprite-player/v1");
  });

  it("exports exact QA pixels at fractional source scale without resizing, masking or recropping", () => {
    const input = asRaster();
    const result = adaptFixedSpriteForPlayer(input);
    const patch = input.placement.composite;
    expect(result.exportMode).toBe("board-raster");
    expect(result.rasterAsset.rgba).toEqual(patch.rgba);
    expect(result.rasterAsset.rgba).not.toBe(patch.rgba);
    expect(result.rasterAsset.width).toBe(patch.width);
    expect(result.rasterAsset.height).toBe(patch.height);
    expect(result.rasterAsset.rgbaSha256).toBe(sha256Rgba(patch.rgba, patch.width, patch.height));
    expect(result.sprite.width).not.toBe(input.placement.visibility!.sourceImage.width);
    expect(result.sprite.rect).toEqual({ x: patch.left / BOARD.width, y: patch.top / BOARD.height, w: patch.width / BOARD.width, h: patch.height / BOARD.height });
    expect(result.provenance.boardPixelRect).toEqual({ left: patch.left, top: patch.top, width: patch.width, height: patch.height });
    expect(result.sprite.anchor).toEqual(input.placement.visibility!.headAnchor);
    for (const point of [{ x: 0, y: 0 }, { x: patch.width, y: patch.height }, { x: 2.5, y: 3.25 }]) {
      const playerX = (result.sprite.rect.x + point.x / patch.width * result.sprite.rect.w) * BOARD.width;
      const playerY = (result.sprite.rect.y + point.y / patch.height * result.sprite.rect.h) * BOARD.height;
      expect(playerX).toBeCloseTo(patch.left + point.x, 12);
      expect(playerY).toBeCloseTo(patch.top + point.y, 12);
      // A common stage transform preserves positions, not a claim about its pixel filter.
      expect(playerX * 2.7 - 48).toBeCloseTo((patch.left + point.x) * 2.7 - 48, 12);
    }
    const originalByte = patch.rgba[0];
    result.rasterAsset.rgba[0] = (originalByte! + 1) % 256;
    expect(patch.rgba[0]).toBe(originalByte);
  });

  it.each([255, 128])("matches the exact QA source-over board with foreground alpha %s applied only once", (alpha) => {
    const input = asRaster(fixture(0.63, alpha));
    const result = adaptFixedSpriteForPlayer(input);
    expect(onOriginalBoard({ ...result.rasterAsset, ...result.provenance.boardPixelRect })).toEqual(onOriginalBoard(input.placement.composite));
    expect(result.rasterAsset.rgba).toEqual(input.placement.composite.rgba);
    expect([...result.rasterAsset.rgba].filter((_, index) => index % 4 === 3).some(value => value > 0 && value < 255)).toBe(true);
    expect(result.provenance.foregroundApplied).toBe(true);
    expect(result.provenance.foregroundReapplication).toBe(false);
  });

  it("derives hit bounds from the exported raster alpha while retaining the observed eye in the player route", () => {
    const input = asRaster();
    const { sprite, rasterAsset, provenance } = adaptFixedSpriteForPlayer(input);
    const visible: { x: number; y: number }[] = [];
    for (let y = 0; y < rasterAsset.height; y++) for (let x = 0; x < rasterAsset.width; x++) {
      if (rasterAsset.rgba[(y * rasterAsset.width + x) * 4 + 3]! >= 32) visible.push({ x, y });
    }
    const x0 = Math.min(...visible.map(point => point.x)), x1 = Math.max(...visible.map(point => point.x)) + 1;
    const y0 = Math.min(...visible.map(point => point.y)), y1 = Math.max(...visible.map(point => point.y)) + 1;
    expect(sprite.hitRect).toEqual({ x: (provenance.boardPixelRect.left + x0) / BOARD.width, y: (provenance.boardPixelRect.top + y0) / BOARD.height, w: (x1 - x0) / BOARD.width, h: (y1 - y0) / BOARD.height });
    const slot = { ...input.runtime.slot, x: 0.1, y: 0.2, scale: 0.03, hintZone: { x: 0.1, y: 0.2, r: 0.1 }, hintText: "" };
    const target: TargetConfig = { id: "child", targetType: "hide", difficulty: 1, mission: "Find", item: "", success: ["Yes"], animation: "wave", slots: [slot, slot], sprite, spriteByVariant: { A: sprite, B: sprite } };
    const scene = { art: input.runtime.art, targets: [target, target, target] } as SceneConfig;
    for (const variant of ["A", "B"] as const) {
      const geometry = targetGeometry(scene, target, variant);
      expect(geometry.isPatch).toBe(true);
      expect(geometry.head).toEqual(input.placement.visibility!.headAnchor);
      expect(geometry.hitRect).toEqual({ x0: sprite.hitRect.x, y0: sprite.hitRect.y, x1: sprite.hitRect.x + sprite.hitRect.w, y1: sprite.hitRect.y + sprite.hitRect.h });
      expect(geometry.sprite).toBe(sprite);
    }
  });

  it("binds a distinct raster-detail review requirement and retains source, mask and native provenance", () => {
    const input = asRaster();
    const result = adaptFixedSpriteForPlayer(input);
    expect(result.provenance).toMatchObject({
      version: "fixed-sprite-player/board-raster-v1", exportMode: "board-raster", contractSha256: input.contractSha256, board: BOARD,
      slotId: input.placement.contract.slotId, sourceRgbaSha256: input.extracted.sourceSha256,
      sourceMeasurementSha256: input.extracted.extractionBinding!.sourceMeasurementSha256,
      cleanedSourceRgbaSha256: input.placement.sourceImage.rgbaSha256,
      nativeVisibleRgbaSha256: input.placement.visibility!.sourceImage.rgbaSha256,
      boardRasterRgbaSha256: result.rasterAsset.rgbaSha256,
      placementMaskRgbaSha256: sha256Rgba(input.foreground!.rgba, BOARD.width, BOARD.height),
      sourceCellToBoard: input.placement.transform, nativeCropToBoard: input.placement.visibility!.sourceImage.transform,
      crop: input.placement.visibility!.sourceImage.crop, anchorSemantics: "observed-eye-midpoint", hitGeometryBasis: "board-raster-alpha-ge32",
      geometryParity: "exact-board-raster-rect", pixelParity: "exact-replayed-qa-composite-before-viewport-resampling",
      semanticReviewRequirement: { detailAsset: "board-raster", rgbaSha256: result.rasterAsset.rgbaSha256, nativeDetailApprovalSufficient: false },
      urlContentVerification: "caller-storage-receipt-not-fetched", runtimeForegroundVerification: "none",
    });
    expect(result.semanticStatus).toBe("pending");
    expect(result.browserPixelParity).toBe("unverified");
    expect(result.automaticRelease).toBe(false);
    expect(result).not.toHaveProperty("nativeAsset");
  });

  it.each(["native", "dimensions", "pixels", "empty-url"] as const)("rejects a %s asset receipt rather than substituting or repairing pixels", (drift) => {
    const input = asRaster();
    if (drift === "native") {
      const native = input.placement.visibility!.sourceImage;
      input.asset = { ...input.asset, width: native.width, height: native.height, rgbaSha256: native.rgbaSha256 };
    }
    if (drift === "dimensions") input.asset.width++;
    if (drift === "pixels") input.asset.rgbaSha256 = "b".repeat(64);
    if (drift === "empty-url") input.asset.url = " ";
    expect(() => adaptFixedSpriteForPlayer(input)).toThrow(/exact replayed board-resolution RGBA/);
  });

  it("does not infer raster mode from the receipt, and rejects unsupported mode strings", () => {
    const raster = asRaster();
    const { exportMode: _mode, ...unmarked } = raster;
    expect(() => adaptFixedSpriteForPlayer(unmarked)).toThrow(/native foreground-masked RGBA/);
    expect(() => adaptFixedSpriteForPlayer({ ...raster, exportMode: "auto" } as never)).toThrow(/no automatic asset-type fallback/);
  });

  it.each(["pixels", "position", "anchor", "visibility"] as const)("rejects forged %s output even with an updated raster receipt", (drift) => {
    const input = fixture(0.63);
    if (drift === "pixels") input.placement.composite.rgba[0] = (input.placement.composite.rgba[0]! + 1) % 256;
    if (drift === "position") input.placement.composite.left++;
    if (drift === "anchor") input.placement.visibility!.headAnchor.x += 0.001;
    if (drift === "visibility") input.placement.visibility!.sourceImage.rgba[0] = 17;
    expect(() => adaptFixedSpriteForPlayer(asRaster(input))).toThrow(/differ from deterministic core replay/);
  });

  it.each(["recipe", "board", "source", "mask"] as const)("requires the original bound %s before exporting a board raster", (drift) => {
    const input = asRaster();
    if (drift === "recipe") input.placement.contract.support.tolerancePx = 1;
    if (drift === "board") input.boardAsset.sha256 = "b".repeat(64);
    if (drift === "source") input.extracted.source.landmarks.eyeMidpoint.x += 0.01;
    if (drift === "mask") input.foreground!.rgba[3] = 1;
    expect(() => adaptFixedSpriteForPlayer(input)).toThrow(/independently frozen contract hash|Board hash or dimensions differ|changed after their bound extraction|Foreground/);
  });

  it("replays both-sole occlusion even when the failed raster is relabelled successful", () => {
    const input = fixture();
    const contract = input.placement.contract as FixedSlotContractV3;
    contract.support = { type: "occluded-standing", sourceLandmark: "eyeMidpoint", destination: { ...input.placement.visibility!.headAnchor }, tolerancePx: 0 };
    contract.requiredHiddenLandmarks = [{ sourceLandmark: "leftFoot", radiusPx: 2 }, { sourceLandmark: "rightFoot", radiusPx: 2 }];
    input.placement = computeFixedPlacement({ contract, board: BOARD, sprite: input.extracted, foreground: input.foreground });
    input.contractSha256 = sha256Bytes(Buffer.from(JSON.stringify(input.placement.contract)));
    expect(input.placement.ok).toBe(true);
    expect(adaptFixedSpriteForPlayer(asRaster(input)).rasterAsset.rgba).toEqual(input.placement.composite.rgba);
    for (let y = 86; y < 94; y++) for (let x = 76; x < 83; x++) input.foreground!.rgba[(y * BOARD.width + x) * 4 + 3] = 0;
    contract.foregroundMask!.rgbaSha256 = sha256Rgba(input.foreground!.rgba, BOARD.width, BOARD.height);
    input.placement = computeFixedPlacement({ contract, board: BOARD, sprite: input.extracted, foreground: input.foreground });
    input.contractSha256 = sha256Bytes(Buffer.from(JSON.stringify(input.placement.contract)));
    expect(input.placement.measurements.requiredHiddenLandmarkChecks!.map(check => check.passed)).toEqual([false, true]);
    input.placement.ok = true; input.placement.flags = [];
    expect(() => adaptFixedSpriteForPlayer(asRaster(input))).toThrow(/Core replay rejected.*required_foot_occlusion_failed/);
  });

  it.each(["flip", "rotation", "adjust", "slot", "foreground-layer"] as const)("rejects runtime %s drift in raster mode too", (drift) => {
    const input = asRaster();
    if (drift === "flip") input.runtime.slot.flip = true;
    if (drift === "rotation") input.runtime.slot.rotation = 1;
    if (drift === "adjust") input.runtime.adjust = { dx: 0, dy: 0, scale: 0.9 };
    if (drift === "slot") input.runtime.slot.id = "different-slot";
    if (drift === "foreground-layer") input.runtime.art.foreground = "/boards/foreground.png";
    expect(() => adaptFixedSpriteForPlayer(input)).toThrow(/No player flip|exact frozen contract|zIndex > 20/);
  });
});
