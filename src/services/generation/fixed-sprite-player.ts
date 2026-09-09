import { isDeepStrictEqual } from "node:util";
import { SpriteRefSchema, type ArtRect, type PlaySlot, type SceneConfig, type SpriteRef, type TargetAdjust } from "../../domain/game/config";
import {
  evaluateFixedPlacement, sha256Bytes, sha256Rgba,
  type BoardIdentity, type ExtractedSprite, type FixedPlacement, type ForegroundRgba, type VisibleSpriteSource,
} from "./fixed-sprite";

export class FixedSpritePlayerError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = "FixedSpritePlayerError"; }
}

/** The caller's storage/signer receipt; this pure adapter never fetches or signs a URL. */
export interface FixedPlayerAssetReceipt { url: string; width: number; height: number; rgbaSha256: string }
export type FixedPlayerSpriteRef = Extract<SpriteRef, { kind: "image" }> & {
  rect: ArtRect; hitRect: ArtRect; anchor: { x: number; y: number };
};
export interface FixedSpritePlayerInput {
  /** Omitted preserves the original native export and its serialized result. */
  exportMode?: "native";
  placement: FixedPlacement;
  extracted: ExtractedSprite<VisibleSpriteSource>;
  /** Persisted hash of JSON.stringify(the parsed, frozen contract), not recomputed from an untrusted placement. */
  contractSha256: string;
  /** Receipt for the exact original full-board art bytes; cropped/repainted art is not interchangeable. */
  boardAsset: BoardIdentity & { url: string };
  asset: FixedPlayerAssetReceipt;
  foreground?: ForegroundRgba;
  runtime: {
    art: Pick<SceneConfig["art"], "base" | "width" | "height" | "foreground">;
    slot: Pick<PlaySlot, "id" | "layer" | "flip" | "rotation" | "zIndex">;
    adjust?: TargetAdjust;
  };
}
export type FixedSpriteBoardRasterPlayerInput = Omit<FixedSpritePlayerInput, "exportMode"> & { exportMode: "board-raster" };
export type FixedSpriteAnyPlayerInput = FixedSpritePlayerInput | FixedSpriteBoardRasterPlayerInput;
export type FixedSpriteNativePlayerResult = ReturnType<typeof nativePlayerResult>;
export type FixedSpriteBoardRasterPlayerResult = ReturnType<typeof boardRasterPlayerResult>;

/**
 * Research-only bridge to the existing SpriteRef.rect route. No release, DB,
 * signer, fallback body, image encoding, or scene mutation takes place here.
 *
 * Integration requirements:
 * - Store/serve the selected native or board-raster RGBA losslessly, preserving its dimensions;
 *   the caller must verify that its signed URL actually addresses that asset.
 *   The board URL likewise must resolve to the receipt's exact original bytes.
 * - Retain the returned provenance OUTSIDE public GameConfig. Rect/hitRect/anchor
 *   map to existing rectJson/hitRectJson/headAnchorJson columns, but the latter
 *   contains an OBSERVED EYE MIDPOINT here, not an inferred skull top.
 * - Validate each playable A/B slot independently and explicitly populate only
 *   the available spriteByVariant entries. A-only replay is supported; omission
 *   of spriteByVariant instead makes the player assume both variants exist.
 * - Keep the checked runtime art/slot/adjust settings. Rect avoids generic
 *   drop-shadow, slot scale/rotation and body placement; flip is still active in
 *   SceneViewport. Front targets need zIndex > 20 when scene foreground exists:
 *   current layer wrappers do not establish separate stacking contexts.
 * - Any global foreground must already be part of the separately verified QA
 *   scene. It renders BELOW this premasked asset, never masks the child again.
 * - Obtain semantic approval and browser evidence separately. Existing general
 *   composition may admit GENERATED assets; this adapter is NOT a release gate.
 *
 * Exact affine geometry is preserved, without rounding or a crop correction at
 * runtime. General pixel parity is NOT claimed: native premasking then browser
 * resampling differs at some cut edges from core QA's resample-then-board-mask.
 * The generic boardComposite helper also rounds rects and uses another filter.
 * Explicit board-raster mode exports the exact replayed QA composite instead,
 * at one image pixel per board pixel before viewport zoom. It introduces no
 * new resizing, masking, cropping or coordinate correction. It requires a new
 * raster-detail review: native-detail approval is not approval of this asset,
 * and browser filtering/zoom parity remains unverified in either mode.
 */
export function adaptFixedSpriteForPlayer(input: FixedSpriteBoardRasterPlayerInput): FixedSpriteBoardRasterPlayerResult;
export function adaptFixedSpriteForPlayer(input: FixedSpritePlayerInput): FixedSpriteNativePlayerResult;
export function adaptFixedSpriteForPlayer(input: FixedSpriteAnyPlayerInput): FixedSpriteNativePlayerResult | FixedSpriteBoardRasterPlayerResult;
export function adaptFixedSpriteForPlayer(input: FixedSpriteAnyPlayerInput) {
  if (input.exportMode !== undefined && input.exportMode !== "native" && input.exportMode !== "board-raster") {
    throw new FixedSpritePlayerError("unsupported_export_mode", "Explicit native or board-raster export mode required; no automatic asset-type fallback");
  }
  const checked = replayPlayerPlacement(input);
  return input.exportMode === "board-raster" ? boardRasterPlayerResult(input, checked) : nativePlayerResult(input, checked);
}

function replayPlayerPlacement(input: FixedSpriteAnyPlayerInput) {
  const { placement, extracted, boardAsset, runtime } = input;
  if (placement.contract.version !== "fixed-sprite/v3" || extracted.source.measurementVersion !== "visible-face/v1") {
    throw new FixedSpritePlayerError("v3_required", "Only visible-face/v1 fixed-sprite/v3 placements are supported");
  }
  if (!placement.ok || placement.flags.some((flag) => flag.severity === "error")) {
    throw new FixedSpritePlayerError("placement_rejected", "A rejected placement cannot become a player asset");
  }
  const contractSha256 = sha256Bytes(Buffer.from(JSON.stringify(placement.contract)));
  if (input.contractSha256 !== contractSha256) throw new FixedSpritePlayerError("contract_identity_mismatch", "Placement differs from the independently frozen contract hash");
  if (!boardAsset.url.trim() || runtime.art.base !== boardAsset.url || runtime.art.width !== boardAsset.width || runtime.art.height !== boardAsset.height) {
    throw new FixedSpritePlayerError("runtime_board_mismatch", "Player art must be the exact full-board URL and dimensions from the board receipt");
  }
  const { slot, adjust } = runtime;
  if (slot.id !== placement.contract.slotId) throw new FixedSpritePlayerError("runtime_slot_mismatch", "Player slot must identify this exact frozen contract");
  if (slot.flip !== false || slot.rotation !== 0 || (adjust && (adjust.dx !== 0 || adjust.dy !== 0 || adjust.scale !== 1))) {
    throw new FixedSpritePlayerError("runtime_transform_unsupported", "No player flip, rotation, or additional target adjustment is permitted");
  }
  if (slot.layer !== "front" || !Number.isInteger(slot.zIndex) || slot.zIndex < 0 || (runtime.art.foreground && slot.zIndex <= 20)) {
    throw new FixedSpritePlayerError("runtime_layer_unsupported", "Premasked sprites require front placement above any scene foreground (zIndex > 20 when present)");
  }
  const board = { sha256: boardAsset.sha256, width: boardAsset.width, height: boardAsset.height };
  // Replay all source, foreground, support, scale/body, envelope and forbidden
  // checks. An editable placement.ok boolean is not validation evidence.
  const replay = evaluateFixedPlacement({ contract: placement.contract, board, sprite: extracted, foreground: input.foreground, transform: placement.transform });
  if (!replay.ok) throw new FixedSpritePlayerError("placement_rejected", `Core replay rejected the placement: ${replay.flags.filter((flag) => flag.severity === "error").map((flag) => flag.code).join(", ")}`);
  if (!isDeepStrictEqual(placement, replay)) throw new FixedSpritePlayerError("placement_replay_mismatch", "Supplied native pixels, transform, geometry or QA outputs differ from deterministic core replay");
  const visibility = replay.visibility;
  if (!visibility?.hitRect) throw new FixedSpritePlayerError("visible_geometry_required", "Visible native alpha, hitRect and observed eye anchor are required");
  return { replay, visibility, hitRect: visibility.hitRect, board, contractSha256 };
}

type CheckedPlayerPlacement = ReturnType<typeof replayPlayerPlacement>;

function nativePlayerResult(input: FixedSpritePlayerInput, checked: CheckedPlayerPlacement) {
  const { extracted, asset, runtime } = input;
  const { slot } = runtime;
  const { replay, visibility, board, contractSha256 } = checked;
  const native = visibility.sourceImage;
  const nativeRgbaSha256 = sha256Rgba(native.rgba, native.width, native.height);
  if (!asset.url.trim() || asset.width !== native.width || asset.height !== native.height || asset.rgbaSha256 !== nativeRgbaSha256) {
    throw new FixedSpritePlayerError("native_asset_mismatch", "Signed asset receipt must identify the native foreground-masked RGBA, not a preview or unmasked source");
  }
  const { scale, translateX, translateY } = native.transform;
  const rect = { x: translateX / board.width, y: translateY / board.height, w: native.width * scale / board.width, h: native.height * scale / board.height };
  const hitRect = { ...checked.hitRect };
  const anchor = { ...visibility.headAnchor };
  const parsed = SpriteRefSchema.safeParse({ kind: "image", url: asset.url, width: native.width, height: native.height, rect, hitRect, anchor });
  // Core alpha checks sample pixel centres; this additional storage-rect check
  // can reject an otherwise accepted edge case. Never silently clamp or recrop.
  if (!parsed.success || rect.x + rect.w > 1 || rect.y + rect.h > 1 || hitRect.x + hitRect.w > 1 || hitRect.y + hitRect.h > 1) {
    throw new FixedSpritePlayerError("player_geometry_out_of_bounds", "Native storage and hit rectangles must fit the player board without rounding, clipping or recentering");
  }
  const epsilon = 1e-12; // Arithmetic tolerance only; no coordinates are changed.
  if (hitRect.x < rect.x - epsilon || hitRect.y < rect.y - epsilon || hitRect.x + hitRect.w > rect.x + rect.w + epsilon || hitRect.y + hitRect.h > rect.y + rect.h + epsilon || anchor.x < hitRect.x - epsilon || anchor.y < hitRect.y - epsilon || anchor.x > hitRect.x + hitRect.w + epsilon || anchor.y > hitRect.y + hitRect.h + epsilon) {
    throw new FixedSpritePlayerError("player_geometry_inconsistent", "Visible hit geometry must lie within the native patch and contain the observed eye anchor");
  }
  const sprite: FixedPlayerSpriteRef = { kind: "image", url: asset.url, width: native.width, height: native.height, rect, hitRect, anchor };
  return {
    sprite,
    // Defensive copy: consumers cannot mutate the validated extraction/QA asset.
    nativeAsset: { rgba: Buffer.from(native.rgba), width: native.width, height: native.height, rgbaSha256: nativeRgbaSha256 },
    provenance: {
      version: "fixed-sprite-player/v1" as const,
      contractSha256, board: { ...board }, slotId: replay.contract.slotId,
      sourceRgbaSha256: extracted.sourceSha256,
      sourceMeasurementSha256: extracted.extractionBinding!.sourceMeasurementSha256,
      cleanedSourceRgbaSha256: replay.sourceImage.rgbaSha256,
      nativeVisibleRgbaSha256: nativeRgbaSha256,
      // This is the placement's local mask, NOT a receipt for art.foreground.
      ...(replay.contract.foregroundMask && "rgbaSha256" in replay.contract.foregroundMask ? { placementMaskRgbaSha256: replay.contract.foregroundMask.rgbaSha256 } : {}),
      sourceCellToBoard: { ...replay.transform }, nativeCropToBoard: { ...native.transform }, crop: { ...native.crop },
      foregroundApplied: visibility.foregroundApplied,
      foregroundReapplication: false as const, anchorSemantics: "observed-eye-midpoint" as const,
      runtime: { art: { ...runtime.art }, slot: { ...slot }, adjust: { dx: 0, dy: 0, scale: 1 } },
      geometryParity: "exact-affine-unrounded" as const,
      urlContentVerification: "caller-storage-receipt-not-fetched" as const,
      runtimeForegroundVerification: runtime.art.foreground ? "caller-qa-required-unverified" as const : "none" as const,
    },
    semanticStatus: "pending" as const,
    browserPixelParity: "unverified" as const,
    automaticRelease: false as const,
  };
}

/** Hit support from the asset actually exported, at the core's visible-alpha threshold. */
function rasterHitRect(patch: FixedPlacement["composite"], board: BoardIdentity): ArtRect {
  let minX = patch.width, minY = patch.height, maxX = -1, maxY = -1;
  for (let y = 0; y < patch.height; y++) for (let x = 0; x < patch.width; x++) {
    if (patch.rgba[(y * patch.width + x) * 4 + 3]! < 32) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (maxX < 0) throw new FixedSpritePlayerError("visible_geometry_required", "Board raster must retain visible alpha at or above 32; native hit bounds cannot substitute");
  return { x: (patch.left + minX) / board.width, y: (patch.top + minY) / board.height, w: (maxX - minX + 1) / board.width, h: (maxY - minY + 1) / board.height };
}

function boardRasterPlayerResult(input: FixedSpriteBoardRasterPlayerInput, checked: CheckedPlayerPlacement) {
  const { extracted, asset, runtime } = input;
  const { replay, visibility, board, contractSha256 } = checked;
  const patch = replay.composite;
  if (![patch.left, patch.top, patch.width, patch.height].every(Number.isSafeInteger) || patch.width <= 0 || patch.height <= 0
      || patch.left < 0 || patch.top < 0 || patch.left + patch.width > board.width || patch.top + patch.height > board.height) {
    throw new FixedSpritePlayerError("player_geometry_out_of_bounds", "The exact integer board raster must fit without rounding, clipping or recentering");
  }
  const boardRasterRgbaSha256 = sha256Rgba(patch.rgba, patch.width, patch.height);
  if (!asset.url.trim() || asset.width !== patch.width || asset.height !== patch.height || asset.rgbaSha256 !== boardRasterRgbaSha256) {
    throw new FixedSpritePlayerError("raster_asset_mismatch", "Signed asset receipt must identify the exact replayed board-resolution RGBA, not native pixels, a resized image or a new mask");
  }
  const rect = { x: patch.left / board.width, y: patch.top / board.height, w: patch.width / board.width, h: patch.height / board.height };
  const hitRect = rasterHitRect(patch, board);
  // Do not snap the measured eye to this raster's grid or substitute its bbox centre.
  const anchor = { ...visibility.headAnchor };
  const parsed = SpriteRefSchema.safeParse({ kind: "image", url: asset.url, width: patch.width, height: patch.height, rect, hitRect, anchor });
  if (!parsed.success || hitRect.x + hitRect.w > 1 || hitRect.y + hitRect.h > 1) {
    throw new FixedSpritePlayerError("player_geometry_out_of_bounds", "Board raster storage and hit rectangles must fit the player board without rounding, clipping or recentering");
  }
  const epsilon = 1e-12; // Arithmetic tolerance only; never move the observed eye.
  if (hitRect.x < rect.x - epsilon || hitRect.y < rect.y - epsilon || hitRect.x + hitRect.w > rect.x + rect.w + epsilon || hitRect.y + hitRect.h > rect.y + rect.h + epsilon
      || anchor.x < hitRect.x - epsilon || anchor.y < hitRect.y - epsilon || anchor.x > hitRect.x + hitRect.w + epsilon || anchor.y > hitRect.y + hitRect.h + epsilon) {
    throw new FixedSpritePlayerError("player_geometry_inconsistent", "Exported raster hit bounds must lie inside its exact patch and contain the unchanged observed eye anchor");
  }
  const sprite: FixedPlayerSpriteRef = { kind: "image", url: asset.url, width: patch.width, height: patch.height, rect, hitRect, anchor };
  const native = visibility.sourceImage;
  return {
    exportMode: "board-raster" as const,
    sprite,
    // No resize, re-mask or trim: this is an exact defensive copy of core QA.
    rasterAsset: { rgba: Buffer.from(patch.rgba), width: patch.width, height: patch.height, rgbaSha256: boardRasterRgbaSha256 },
    provenance: {
      version: "fixed-sprite-player/board-raster-v1" as const, exportMode: "board-raster" as const,
      contractSha256, board: { ...board }, slotId: replay.contract.slotId,
      sourceRgbaSha256: extracted.sourceSha256,
      sourceMeasurementSha256: extracted.extractionBinding!.sourceMeasurementSha256,
      cleanedSourceRgbaSha256: replay.sourceImage.rgbaSha256,
      nativeVisibleRgbaSha256: sha256Rgba(native.rgba, native.width, native.height),
      boardRasterRgbaSha256,
      boardPixelRect: { left: patch.left, top: patch.top, width: patch.width, height: patch.height },
      ...(replay.contract.foregroundMask && "rgbaSha256" in replay.contract.foregroundMask ? { placementMaskRgbaSha256: replay.contract.foregroundMask.rgbaSha256 } : {}),
      sourceCellToBoard: { ...replay.transform }, nativeCropToBoard: { ...native.transform }, crop: { ...native.crop },
      foregroundApplied: visibility.foregroundApplied, foregroundReapplication: false as const,
      anchorSemantics: "observed-eye-midpoint" as const, hitGeometryBasis: "board-raster-alpha-ge32" as const,
      runtime: { art: { ...runtime.art }, slot: { ...runtime.slot }, adjust: { dx: 0, dy: 0, scale: 1 } },
      geometryParity: "exact-board-raster-rect" as const,
      pixelParity: "exact-replayed-qa-composite-before-viewport-resampling" as const,
      semanticReviewRequirement: { detailAsset: "board-raster" as const, rgbaSha256: boardRasterRgbaSha256, nativeDetailApprovalSufficient: false as const },
      urlContentVerification: "caller-storage-receipt-not-fetched" as const,
      runtimeForegroundVerification: runtime.art.foreground ? "caller-qa-required-unverified" as const : "none" as const,
    },
    semanticStatus: "pending" as const,
    browserPixelParity: "unverified" as const,
    automaticRelease: false as const,
  };
}
