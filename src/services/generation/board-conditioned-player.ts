import { isDeepStrictEqual } from "node:util";
import sharp from "sharp";
import { GameConfigSchema, SpriteRefSchema, type GameConfig, type PlaySlot, type SpriteRef } from "../../domain/game/config";
import type { FixedSourcePolicy } from "../../infra/generation/openai-fixed-source";
import { prepareBoardPoseObservation, decideBoardPoseObservation, BOARD_POSE_OBSERVER_SETTINGS, type BoardPoseObserverPolicy } from "../../infra/generation/board-pose-observer";
import { boardConditioningHash, prepareBoardConditionedSource, type BoardConditioningInput } from "./board-conditioned-source";
import type { generateBoardConditionedAppearances } from "./board-conditioned-generation";
import { extractBoardSprites } from "./board-sprite-extraction";
import { composeBoardPlacement } from "./board-placement";
import { sha256Bytes, sha256Rgba, type PixelRect } from "./fixed-sprite";
import { recoverBoardOccludedUpperBody, type BoardUpperBodyRecoveryRequest, type BoardUpperBodyRecoveryResult } from "./board-upper-body-recovery";

type BoardResult = Awaited<ReturnType<typeof generateBoardConditionedAppearances>>;
type ImageSprite = Extract<SpriteRef, { kind: "image" }>;
export interface BoardConditionedPlayerRequest {
  worldId: string;
  input: BoardConditioningInput;
  expectedContractSha256: string;
  sourcePolicy: FixedSourcePolicy;
  observerPolicy: BoardPoseObserverPolicy;
  result: BoardResult;
}
export interface BoardConditionedPrivateAsset {
  /** Private content-addressed intent, NOT a URL and never an Asset visibility claim. */
  key: string;
  kind: "static-board" | "premasked-sprite";
  boardId: string;
  slotId: string | null;
  png: Buffer;
  sha256: string;
  rgbaSha256: string;
  width: number;
  height: number;
  contentType: "image/png";
  visibility: "PRIVATE";
}
export interface BoardConditionedPrivateUrlReceipt {
  key: string;
  sha256: string;
  rgbaSha256: string;
  width: number;
  height: number;
  /** Authenticated URL minted by the trusted caller after private persistence. */
  url: string;
  access: "authenticated-private";
}
export const BOARD_PLAYER_REVIEW_DIMENSIONS = ["identity", "child-age", "pose", "local-scale", "contact-and-occlusion", "anatomy", "style", "local-lighting", "visual-integration"] as const;
export interface BoardConditionedSemanticReview {
  version: "board-conditioned-semantic-review/v1";
  worldId: string;
  boardId: string;
  playerBindingSha256: string;
  approved: true;
  reviewedBy: string;
  reviewedAt: string;
  checks: Record<(typeof BOARD_PLAYER_REVIEW_DIMENSIONS)[number], true>;
}
export class BoardConditionedPlayerError extends Error {
  constructor(readonly code: "invalid-input" | "source-rejected" | "geometry-rejected" | "replay-mismatch" | "asset-mismatch" | "review-required", message: string) {
    super(`BOARD_PLAYER: ${message}`); this.name = "BoardConditionedPlayerError";
  }
}
function demand(ok: unknown, code: BoardConditionedPlayerError["code"], message: string): asserts ok { if (!ok) throw new BoardConditionedPlayerError(code, message); }
const digest = (v: unknown) => boardConditioningHash(v);
function copy<T>(value: T): T {
  if (Buffer.isBuffer(value)) return Buffer.from(value) as T;
  if (Array.isArray(value)) return value.map(copy) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)])) as T;
  return value;
}
function same(a: unknown, b: unknown, message: string) { demand(isDeepStrictEqual(a, b), "replay-mismatch", message); }
function bounds(rgba: Buffer, width: number, height: number, alpha: number): PixelRect {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (rgba[(y * width + x) * 4 + 3]! >= alpha) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  demand(right >= left && bottom >= top, "geometry-rejected", "An empty raster cannot become a player target");
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}
async function image(bytes: Buffer) {
  demand(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 32 * 1024 * 1024, "asset-mismatch", "Bounded PNG bytes required");
  const png = sharp(bytes, { limitInputPixels: 25_000_000, failOn: "warning" }), m = await png.metadata();
  demand(m.format === "png" && (m.pages ?? 1) === 1 && (m.orientation ?? 1) === 1 && m.depth === "uchar", "asset-mismatch", "Single unrotated8-bit PNG required");
  return png.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}
async function asset(worldId: string, boardId: string, slotId: string | null, png: Buffer): Promise<BoardConditionedPrivateAsset> {
  const raw = await image(png), sha256 = sha256Bytes(png), width = raw.info.width, height = raw.info.height;
  return { key: `private/board-conditioned-player/v1/${digest([worldId, boardId, slotId, sha256])}`, boardId, slotId,
    kind: slotId === null ? "static-board" : "premasked-sprite", png: Buffer.from(png), sha256, rgbaSha256: sha256Rgba(raw.data, width, height),
    width, height, contentType: "image/png", visibility: "PRIVATE" };
}

/** Free deterministic adapter: no provider, database, ledger, URL fetch or writes.
 * The authenticated job must first verify checkpoint ownership and durable billing.
 * Every use replays the actual sheet extraction and final SimplePeek geometry;
 * a copied `ok` flag, screenshot or saved output PNG is never sufficient.
 * This separate version does not produce or loosen fixed-sprite/v3 standing evidence. */
export async function prepareBoardConditionedPlayerBoard(raw: BoardConditionedPlayerRequest) {
  const request = copy(raw), { input, result, worldId } = request;
  demand(/^[A-Za-z0-9_:-]{1,240}$/.test(worldId), "invalid-input", "Explicit trusted world scope required");
  demand(result.state === "review-required" && !result.previewIsDiagnostic && result.automaticRelease === false,
    "source-rejected", "Failed or diagnostic source/placement results cannot become player assets");
  const prepared = await prepareBoardConditionedSource(input, request.sourcePolicy);
  demand(prepared.contractSha256 === request.expectedContractSha256 && result.contractSha256 === request.expectedContractSha256
    && result.boardId === input.boardId, "replay-mismatch", "Frozen board/child/pose/light contract changed");
  same(result.contract, prepared.contract, "Recorded board contract differs from replay");
  demand(result.source.kind === "generated" && result.source.pngSha256 === sha256Bytes(result.source.png)
    && result.source.fingerprint === prepared.prepared.fingerprint && result.source.audit.worldId === worldId
    && result.source.semanticApproval === "pending", "source-rejected", "Source bytes, provenance or world changed");
  same(result.source.capture, prepared.prepared.capture, "Source request capture changed");
  const m = result.measurement;
  demand(m.status === "ok" && m.sources?.length === 3 && new Set(m.sources.map(s => s.slotId)).size === 3,
    "source-rejected", "Three successful observed sources required");
  const observed = await prepareBoardPoseObservation({ sheetPng: result.source.png, slots: input.slots.map(s => ({ slotId: s.slot.id, pose: s.slot.pose })) }, request.observerPolicy);
  demand(m.sheetSha256 === result.source.pngSha256 && m.fingerprint === observed.fingerprint, "source-rejected", "Observation belongs to another source or pose request");
  demand(input.slots.every((s, i) => m.sources![i]!.slotId === s.slot.id && m.sources![i]!.pose === s.slot.pose), "source-rejected", "Observed cell order differs from frozen slot assignments");
  const receipt = m.receipt;
  demand(receipt && receipt.version === "board-pose-observation-receipt/v1" && receipt.fingerprint === m.fingerprint
    && receipt.sourceImageSha256 === m.sheetSha256 && receipt.sourceRgbaSha256 === observed.capture.sourceRgbaSha256
    && receipt.wireImageSha256 === observed.capture.wireImageSha256 && receipt.promptSha256 === observed.capture.promptSha256
    && receipt.requestId === m.evidence.providerRequestId && receipt.costUnknown === false
    && Math.ceil(receipt.costCents * 10_000) === m.evidence.amountMicroUsd
    && receipt.modelRequested === BOARD_POSE_OBSERVER_SETTINGS.model && receipt.modelReturned === m.evidence.model
    && m.evidence.model === BOARD_POSE_OBSERVER_SETTINGS.model && m.evidence.providerNamespace === request.observerPolicy.providerNamespace
    && receipt.effort === BOARD_POSE_OBSERVER_SETTINGS.effort && receipt.attempts === 1
    && receipt.coordinates === "native-1024-sheet-pixel-edges" && receipt.finishReason === "stop"
    && receipt.httpStatus !== null && receipt.httpStatus >= 200 && receipt.httpStatus < 300,
    "source-rejected", "Complete successful source-observer receipt is required and must bind its capture and known charge");
  same(receipt.slots, observed.capture.slots, "Observed receipt slot order changed");
  demand(result.measurementAttempt === undefined || result.measurementAttempt === 2,
    "source-rejected", "Unknown observation selection");
  if (result.measurementAttempt === 2) {
    const charge = result.measurementCharge;
    demand(charge && (charge.state === "settled" || charge.state === "linked") && charge.scope === "judge"
      && [ `board:${input.boardId}:measure:2`, `attempt-2:board:${input.boardId}:measure:2` ].includes(charge.requestKey)
      && charge.operationFingerprint === m.fingerprint && charge.unknownReasons.length === 0 && charge.conflicts.length === 0,
    "source-rejected", "Second observation requires its exact settled measure:2 charge");
    same(charge.evidence, m.evidence, "Selected second observation differs from its settled charge");
  } else demand(!result.measurementCharge, "source-rejected", "A selected charge cannot be relabeled as the original observation");
  let response: unknown;
  try { response = JSON.parse(receipt.responseText ?? ""); } catch { throw new BoardConditionedPlayerError("source-rejected", "Original observer JSON response is required"); }
  // One decision, re-derived here from the ORIGINAL retained receipt rather than
  // a second, divergent rule. It still requires three figures, no props, the
  // requested gesture, confidently observed landmarks and the sheet-pixel
  // geometry checks. What it no longer does is demand source-only visible
  // completeness: that question belongs to the destination, and the occlusion
  // replay below re-establishes it in full for this exact placement.
  const decision = decideBoardPoseObservation(response, observed.capture.slots, observed.rgba, { standingPixelSupportAtComposition: true });
  demand(decision.status === "ok" && decision.sources?.length === 3,
    "source-rejected", "Original observer response did not qualify three source figures");
  // A deferral cannot be invented at this boundary: it must be exactly what the
  // measurement recorded when its charge was settled.
  same(decision.completenessDeferred, m.completenessDeferred ?? [], "Deferred completeness differs from the recorded measurement");
  for (const [i, source] of decision.sources!.entries()) {
    same(source, m.sources[i], "Measured source geometry differs from the original observer response");
  }
  const extracted = await extractBoardSprites({ sheetPng: result.source.png, expectedSheetSha256: result.source.pngSha256,
    seeds: m.sources.map(s => ({ ...s, measurement: { kind: "observed" as const, note: `Sol HIGH source observation ${m.evidence.providerRequestId}; ${m.fingerprint}` } })) });
  same(result.extracted, extracted, "Recorded component extraction or source pixels differ from replay");
  demand(extracted.sprites.every(s => !s.extraction.requiresBoundaryReview), "source-rejected", "Original weak frame contact still requires source review; padding is not clearance");
  demand(result.appearances.length === 3 && new Set(result.appearances.map(a => a.slotId)).size === 3, "geometry-rejected", "Exactly three distinct appearances required");
  const boardAsset = await asset(worldId, input.boardId, null, input.board.png), width = boardAsset.width, height = boardAsset.height;
  const assets: BoardConditionedPrivateAsset[] = [boardAsset], placements = [], fullPatches: Buffer[] = [];
  for (const direction of input.slots) {
    const recorded = result.appearances.find(a => a.slotId === direction.slot.id);
    demand(recorded && recorded.state === "visual-review-required" && "composite" in recorded && recorded.composite?.ok,
      "geometry-rejected", "Rejected appearance cannot become a player asset");
    const source = extracted.sprites.find(s => s.slotId === direction.slot.id)!;
    same(recorded.sprite, source, "Appearance source differs from its bound sheet extraction");
    const placement = await composeBoardPlacement(input.board, direction, source, m.sources.find(s => s.slotId === direction.slot.id)!);
    demand(placement, "geometry-rejected", "No valid placement with observed support or occluded lower cut");
    const { composite: replay, cut } = placement;
    demand(replay.ok && Object.values(replay.checks).every(Boolean), "geometry-rejected", "Face, boundary, mask, support, window or forbidden-region replay failed");
    same(recorded.composite, replay, "Recorded transform, lower cut, pixels or checks differ from exact SimplePeek replay");
    fullPatches.push(replay.patchPng);
    const pixels = await image(replay.patchPng);
    demand(pixels.info.width === width && pixels.info.height === height, "geometry-rejected", "Expected exact full-board raster");
    const storage = bounds(pixels.data, width, height, 1), hit = bounds(pixels.data, width, height, 32);
    // Lossless integer crop only. No resampling, alpha repair, recoloring or mask reapplication.
    const png = await sharp(replay.patchPng).extract(storage).png().toBuffer(), output = await asset(worldId, input.boardId, direction.slot.id, png);
    assets.push(output);
    const placedEye = { x: replay.transform.translateX + source.eye.x * replay.transform.scale,
      y: replay.transform.translateY + source.eye.y * replay.transform.scale };
    const spriteGeometry = { width: storage.width, height: storage.height,
      rect: { x: storage.left / width, y: storage.top / height, w: storage.width / width, h: storage.height / height },
      hitRect: { x: hit.left / width, y: hit.top / height, w: hit.width / width, h: hit.height / height },
      anchor: { x: (direction.slot.mode === "open" ? placedEye.x : direction.slot.eye.x) / width, y: (direction.slot.mode === "open" ? placedEye.y : direction.slot.eye.y) / height } };
    demand(placedEye.x >= hit.left && placedEye.x <= hit.left + hit.width && placedEye.y >= hit.top && placedEye.y <= hit.top + hit.height,
      "geometry-rejected", "Observed eye must lie inside visible raster hit support");
    placements.push({ slotId: direction.slot.id, pose: direction.slot.pose, assetKey: output.key, boardPixelRect: storage, spriteGeometry,
      fullPatchSha256: sha256Bytes(replay.patchPng), contextSha256: sha256Bytes(replay.contextPng), sourceSha256: source.sha256, foregroundSha256: direction.foreground.sha256, lowerCutY: cut });
  }
  const preview = await sharp(input.board.png).composite(fullPatches.map(png => ({ input: png, left: 0, top: 0 }))).png().toBuffer();
  same(result.boardPreviewPng, preview, "Recorded board preview differs from its three verified appearances");
  const manifest = { version: "board-conditioned-player/v1" as const, worldId, boardId: input.boardId, childProfileId: input.child.profileId, childAgeYears: input.child.ageYears,
    contractSha256: prepared.contractSha256, sourceSha256: result.source.pngSha256, observationSha256: digest(m),
    ...(result.measurementAttempt === 2 ? { measurementAttempt: 2 as const, measurementRequestKey: result.measurementCharge!.requestKey,
      measurementChargeSha256: digest(result.measurementCharge) } : {}),
    boardAssetKey: boardAsset.key, width, height, placements,
    assets: assets.map(({ png: _png, ...meta }) => meta),
    geometryParity: "exact-integer-board-raster-before-viewport-resampling" as const, foregroundReapplication: false as const, anchorSemantics: "observed-eye-midpoint" as const };
  return { manifest, playerBindingSha256: digest(manifest), assetWrites: assets, semanticStatus: "pending" as const,
    automaticRelease: false as const, persistenceStatus: "not-written" as const, browserPixelParity: "unverified" as const };
}

function privateUrl(value: string) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) return false;
  if (/^\/(?!\/)/.test(value)) return !/[\s\\]/.test(value);
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; }
}

export interface BoardUpperBodyRecoveryPlayerRequest extends BoardUpperBodyRecoveryRequest {
  result: BoardUpperBodyRecoveryResult;
}

/** Separate, private-only recovery boundary. Never manufacture a successful
 * normal generation result from the original rejected standing measurement. */
export async function prepareBoardUpperBodyRecoveryPlayerBoard(raw: BoardUpperBodyRecoveryPlayerRequest) {
  const request = copy(raw);
  demand(request.result?.state === "upper-body-recovery-review-required" && !request.result.previewIsDiagnostic,
    "source-rejected", "A complete explicit upper-body recovery result is required");
  const replayed = await recoverBoardOccludedUpperBody(request);
  same(request.result, replayed, "Upper-body recovery provenance, derivation, pixels or geometry differs from independent replay");
  demand(!replayed.previewIsDiagnostic && replayed.appearances.length === 3,
    "geometry-rejected", "All three recovered board appearances must qualify");
  const input = replayed.derivedInput, { worldId } = request;
  const boardAsset = await asset(worldId, input.boardId, null, input.board.png), width = boardAsset.width, height = boardAsset.height;
  const assets: BoardConditionedPrivateAsset[] = [boardAsset], placements = [];
  for (const direction of input.slots) {
    const appearance = replayed.appearances.find(a => a.slotId === direction.slot.id), source = replayed.extracted.sprites.find(s => s.slotId === direction.slot.id)!;
    demand(appearance?.state === "visual-review-required" && appearance.composite?.ok && Object.values(appearance.composite.checks).every(Boolean),
      "geometry-rejected", "Rejected recovered appearance cannot become a player target");
    const composite = appearance.composite, pixels = await image(composite.patchPng);
    demand(pixels.info.width === width && pixels.info.height === height, "geometry-rejected", "Expected exact recovered full-board raster");
    const storage = bounds(pixels.data, width, height, 1), hit = bounds(pixels.data, width, height, 32);
    const png = await sharp(composite.patchPng).extract(storage).png().toBuffer(), output = await asset(worldId, input.boardId, direction.slot.id, png);
    assets.push(output);
    const placedEye = { x: composite.transform.translateX + source.eye.x * composite.transform.scale,
      y: composite.transform.translateY + source.eye.y * composite.transform.scale };
    demand(placedEye.x >= hit.left && placedEye.x <= hit.left + hit.width && placedEye.y >= hit.top && placedEye.y <= hit.top + hit.height,
      "geometry-rejected", "Observed recovered eye must remain inside the visible hit support");
    const spriteGeometry = { width: storage.width, height: storage.height,
      rect: { x: storage.left / width, y: storage.top / height, w: storage.width / width, h: storage.height / height },
      hitRect: { x: hit.left / width, y: hit.top / height, w: hit.width / width, h: hit.height / height },
      anchor: { x: (direction.slot.mode === "open" ? placedEye.x : direction.slot.eye.x) / width,
        y: (direction.slot.mode === "open" ? placedEye.y : direction.slot.eye.y) / height } };
    placements.push({ slotId: direction.slot.id, pose: direction.slot.pose, assetKey: output.key, boardPixelRect: storage, spriteGeometry,
      fullPatchSha256: sha256Bytes(composite.patchPng), contextSha256: sha256Bytes(composite.contextPng), sourceSha256: source.sha256,
      foregroundSha256: direction.foreground.sha256, lowerCutY: appearance.cut });
  }
  const manifest = { version: "board-conditioned-player/v1" as const, worldId, boardId: input.boardId, childProfileId: input.child.profileId, childAgeYears: input.child.ageYears,
    contractSha256: replayed.provenance.destination.contractSha256, sourceSha256: request.originalResult.source.pngSha256,
    observationSha256: digest(request.originalResult.measurement), boardAssetKey: boardAsset.key, width, height, placements,
    assets: assets.map(({ png: _png, ...meta }) => meta),
    recovery: { version: "explicit-upper-body-private-player/v1" as const, provenanceSha256: replayed.provenanceSha256,
      originalContractSha256: request.expectedOriginalContractSha256, originalMeasurementStatus: request.originalResult.measurement.status,
      originalStandingDecision: replayed.provenance.original.decision, generatedForDestination: false as const,
      plan: copy(request.plan), provenance: copy(replayed.provenance) },
    geometryParity: "exact-integer-board-raster-before-viewport-resampling" as const, foregroundReapplication: false as const, anchorSemantics: "observed-eye-midpoint" as const };
  return { manifest, playerBindingSha256: digest(manifest), assetWrites: assets, semanticStatus: "pending" as const,
    automaticRelease: false as const, persistenceStatus: "not-written" as const, browserPixelParity: "unverified" as const };
}

/** One explicit recovered board, authenticated human-review export ONLY. The
 * normal reviewed-playable adapter intentionally cannot consume this request. */
export async function bindBoardUpperBodyRecoveryPlayerGame(raw: {
  board: BoardUpperBodyRecoveryPlayerRequest;
  template: GameConfig;
  targetSlots: { boardId: string; targetId: string; slotId: string; hintText: string }[];
  receipts: BoardConditionedPrivateUrlReceipt[];
  mode?: "private-review";
}) {
  const request = copy(raw);
  demand((request.mode ?? "private-review") === "private-review", "review-required", "Upper-body recovery permits private human review only");
  const player = await prepareBoardUpperBodyRecoveryPlayerBoard(request.board), template = GameConfigSchema.parse(request.template), p = player.manifest;
  demand(template.packageTier === "ONE_WORLD" && template.scenes.length === 1 && template.scenes[0]!.slug === p.boardId,
    "invalid-input", "Recovery template must contain exactly its one verified board");
  const scene = template.scenes[0]!;
  demand(scene.art.width === p.width && scene.art.height === p.height, "asset-mismatch", "Recovery template art dimensions changed");
  demand(scene.targets.length === 3 && new Set(scene.targets.map(t => t.id)).size === 3 && request.targetSlots.length === 3
    && new Set(request.targetSlots.map(m => m.targetId)).size === 3 && new Set(request.targetSlots.map(m => m.slotId)).size === 3
    && request.targetSlots.every(m => m.boardId === p.boardId && scene.targets.some(t => t.id === m.targetId) && p.placements.some(s => s.slotId === m.slotId) && m.hintText.trim()),
    "invalid-input", "Recovery needs exact bidirectional three-target mapping");
  demand(request.receipts.length === player.assetWrites.length && new Set(request.receipts.map(r => r.key)).size === request.receipts.length
    && new Set(request.receipts.map(r => r.url)).size === request.receipts.length
    && request.receipts.every(r => r.access === "authenticated-private" && privateUrl(r.url)), "asset-mismatch", "Exact distinct authenticated private asset receipts required");
  const url = (a: BoardConditionedPrivateAsset) => {
    const r = request.receipts.find(r => r.key === a.key);
    demand(r && r.sha256 === a.sha256 && r.rgbaSha256 === a.rgbaSha256 && r.width === a.width && r.height === a.height,
      "asset-mismatch", "Recovery URL receipt identifies different pixels");
    return r.url;
  };
  const boardUrl = url(player.assetWrites.find(a => a.kind === "static-board")!);
  const targets = scene.targets.map(t => {
    const mapping = request.targetSlots.find(m => m.targetId === t.id)!, placement = p.placements.find(s => s.slotId === mapping.slotId)!;
    const sprite = SpriteRefSchema.parse({ kind: "image", url: url(player.assetWrites.find(a => a.key === placement.assetKey)!), ...placement.spriteGeometry }) as ImageSprite;
    const eye = placement.spriteGeometry.anchor;
    const slot: PlaySlot = { id: `${placement.slotId}/frozen`, x: eye.x, y: eye.y, scale: placement.spriteGeometry.hitRect.h, rotation: 0, flip: false,
      layer: "front", zIndex: 30, hintZone: { ...eye, r: Math.max(.03, placement.spriteGeometry.hitRect.w) }, hintText: mapping.hintText };
    return { ...t, targetType: "board-conditioned-simple-peek", animation: "peek" as const, sprite,
      spriteByVariant: { A: sprite }, slots: [slot, { ...copy(slot), id: `${slot.id}:inactive-B` }] as [PlaySlot, PlaySlot], adjust: { dx: 0, dy: 0, scale: 1 } };
  });
  const { foreground: _foreground, ...art } = scene.art, { bonus: _bonus, worldSlug: _worldSlug, ...base } = scene;
  const { world: _world, worlds: _worlds, ...partialTemplate } = template;
  const privateReviewConfig = GameConfigSchema.parse({ ...partialTemplate, styleVersion: "fixed-sprite-board-conditioned-player-v1",
    scenes: [{ ...base, art: { ...art, base: boardUrl, thumbnail: boardUrl }, targets, ambient: [] }] });
  return { version: "board-conditioned-upper-body-private-game/v1" as const, privateReviewConfig, playableGameConfig: null,
    scope: "authenticated-private" as const, semanticStatus: "pending" as const, fullWorld: false,
    assetWrites: player.assetWrites, provenance: [{ manifest: player.manifest, playerBindingSha256: player.playerBindingSha256 }],
    urlContentVerification: "trusted-caller-receipts-not-fetched" as const, reviewerAuthorityVerification: "trusted-caller-required" as const,
    browserPixelParity: "unverified" as const, automaticRelease: false as const, persistenceStatus: "not-written" as const };
}

/** Two-phase private integration. The caller authenticates the supplied URL and
 * review receipts; this function does not fetch URLs or assert their authenticity.
 * Template gameId, child name/avatar, localized copy and association with the
 * trusted world/child are caller-authenticated job data, not verified here.
 * Replays original inputs again, rather than trusting mutable phase-one manifests.
 * Never writes Game.configJson, READY, Asset, DB or publication state. */
export async function bindBoardConditionedPlayerGame(raw: {
  boards: BoardConditionedPlayerRequest[];
  template: GameConfig;
  targetSlots: { boardId: string; targetId: string; slotId: string; hintText: string }[];
  receipts: BoardConditionedPrivateUrlReceipt[];
  mode?: "private-review" | "reviewed-playable";
  semanticReviews?: BoardConditionedSemanticReview[];
  /** Operator-only assembly of already-paid probe boards. Each source retains
   * its own billing scope and is fully replayed. Never permits playable release. */
  privateProbeScopes?: { boardId: string; sourceWorldId: string }[];
}) {
  const input = copy(raw), mode = input.mode ?? "private-review";
  demand(mode === "private-review" || mode === "reviewed-playable", "invalid-input", "Explicit supported private materialization mode required");
  demand(input.boards.length >= 1 && input.boards.length <= 9 && new Set(input.boards.map(b => b.input.boardId)).size === input.boards.length,
    "invalid-input", "One through nine distinct boards required");
  const first = input.boards[0]!;
  const probeScopes = input.privateProbeScopes;
  if (probeScopes) demand(mode === "private-review" && probeScopes.length === input.boards.length
    && new Set(probeScopes.map(s => s.boardId)).size === input.boards.length
    && input.boards.every(b => probeScopes.some(s => s.boardId === b.input.boardId && s.sourceWorldId === b.worldId)),
    "invalid-input", "Private probe mapping must cover every original scope exactly and cannot authorize release");
  demand(input.boards.every(b => (b.worldId === first.worldId || probeScopes)
    && b.input.child.profileId === first.input.child.profileId && b.input.child.ageYears === first.input.child.ageYears),
    "invalid-input", "All boards must belong to one trusted world and child");
  const parsedTemplate = GameConfigSchema.safeParse(input.template);
  demand(parsedTemplate.success, "invalid-input", "Private template must satisfy the player contract, including distinct target ids");
  const template = parsedTemplate.data;
  demand(template.packageTier === "ONE_WORLD" && template.scenes.length === input.boards.length
    && new Set(template.scenes.map(s => s.slug)).size === template.scenes.length
    && template.scenes.every(s => input.boards.some(b => b.input.boardId === s.slug)), "invalid-input", "Private template must contain exactly the selected world boards");
  demand(input.targetSlots.length === input.boards.length * 3 && new Set(input.targetSlots.map(s => `${s.boardId}/${s.targetId}`)).size === input.targetSlots.length
    && new Set(input.targetSlots.map(s => `${s.boardId}/${s.slotId}`)).size === input.targetSlots.length,
    "invalid-input", "Exact one-to-one target/slot mapping required");
  for (const scene of template.scenes) {
    const mappings = input.targetSlots.filter(m => m.boardId === scene.slug);
    demand(scene.targets.length === 3 && new Set(scene.targets.map(t => t.id)).size === 3 && mappings.length === 3
      && scene.targets.every(t => mappings.some(m => m.targetId === t.id)) && mappings.every(m => scene.targets.some(t => t.id === m.targetId)),
      "invalid-input", "Template targets and fixed mappings must have exact bidirectional coverage");
  }
  // A partial private preview is not a nine-board journey or its completion.
  // Full-world maps, when supplied, must name exactly these selected boards.
  if (input.boards.length === 9) {
    demand(!template.worlds || template.worlds.length <= 1, "invalid-input", "Only one selected world is supported");
    const worlds = [...(template.worlds ?? []), ...(template.world ? [template.world] : [])];
    if (worlds.length === 2) same(worlds[0], worlds[1], "Legacy world alias differs from selected world");
    for (const world of worlds) demand(world.nodes.length === 9 && new Set(world.nodes.map(n => n.boardSlug)).size === 9
      && world.nodes.every(n => template.scenes.some(s => s.slug === n.boardSlug))
      && template.scenes.every(s => !s.worldSlug || s.worldSlug === world.slug), "invalid-input", "World map must cover exactly the materialized boards");
  }
  demand(input.receipts.every(r => r.access === "authenticated-private" && privateUrl(r.url)) && new Set(input.receipts.map(r => r.key)).size === input.receipts.length
    && new Set(input.receipts.map(r => r.url)).size === input.receipts.length, "asset-mismatch", "Distinct authenticated private URL receipts required");
  const prepared: Awaited<ReturnType<typeof prepareBoardConditionedPlayerBoard>>[] = [];
  for (const board of input.boards) prepared.push(await prepareBoardConditionedPlayerBoard(board));
  demand(input.receipts.length === prepared.reduce((n, b) => n + b.assetWrites.length, 0), "asset-mismatch", "Exact receipt inventory required");
  const url = (a: BoardConditionedPrivateAsset) => {
    const r = input.receipts.find(r => r.key === a.key);
    demand(r && r.sha256 === a.sha256 && r.rgbaSha256 === a.rgbaSha256 && r.width === a.width && r.height === a.height,
      "asset-mismatch", "URL receipt identifies different pixels or dimensions");
    return r.url;
  };
  const reviewed = (board: (typeof prepared)[number]) => {
    const reviews = (input.semanticReviews ?? []).filter(r => r.boardId === board.manifest.boardId);
    if (reviews.length !== 1) return false;
    const r = reviews[0]!;
    return r.version === "board-conditioned-semantic-review/v1" && r.worldId === first.worldId && r.approved === true
      && r.playerBindingSha256 === board.playerBindingSha256 && typeof r.reviewedBy === "string" && r.reviewedBy.trim().length > 0
      && typeof r.reviewedAt === "string" && Number.isFinite(Date.parse(r.reviewedAt))
      && r.checks && Object.keys(r.checks).length === BOARD_PLAYER_REVIEW_DIMENSIONS.length && BOARD_PLAYER_REVIEW_DIMENSIONS.every(k => r.checks[k] === true);
  };
  const allReviewed = !probeScopes && prepared.every(reviewed);
  if (mode === "reviewed-playable") demand(allReviewed, "review-required", "Every exact board asset/placement requires explicit semantic approval before playable export");
  const scenes = template.scenes.map(scene => {
    const p = prepared.find(p => p.manifest.boardId === scene.slug)!;
    demand(scene.art.width === p.manifest.width && scene.art.height === p.manifest.height, "asset-mismatch", "Template art dimensions differ from frozen board");
    const boardUrl = url(p.assetWrites.find(a => a.kind === "static-board")!);
    const targets = scene.targets.map(t => {
      const mapping = input.targetSlots.find(m => m.boardId === scene.slug && m.targetId === t.id);
      demand(mapping && mapping.hintText.trim(), "invalid-input", "Each target needs its explicit fixed slot and hint");
      const placement = p.manifest.placements.find(s => s.slotId === mapping.slotId);
      demand(placement, "invalid-input", "Target mapping names an unverified slot");
      const a = p.assetWrites.find(a => a.key === placement.assetKey)!;
      const sprite = SpriteRefSchema.parse({ kind: "image", url: url(a), ...placement.spriteGeometry }) as ImageSprite;
      const eye = placement.spriteGeometry.anchor;
      const slot: PlaySlot = { id: `${placement.slotId}/frozen`, x: eye.x, y: eye.y, scale: placement.spriteGeometry.hitRect.h,
        rotation: 0, flip: false, layer: "front", zIndex: 30, hintZone: { ...eye, r: Math.max(.03, placement.spriteGeometry.hitRect.w) }, hintText: mapping.hintText };
      return { ...t, targetType: "board-conditioned-simple-peek", animation: "peek" as const, sprite,
        spriteByVariant: { A: sprite }, slots: [slot, { ...copy(slot), id: `${slot.id}:inactive-B` }] as [PlaySlot, PlaySlot], adjust: { dx: 0, dy: 0, scale: 1 } };
    });
    const { foreground: _globalMask, ...art } = scene.art;
    const { bonus: _bonus, ...base } = scene;
    const { worldSlug: _worldSlug, ...partial } = base;
    return { ...(input.boards.length < 9 ? partial : base), art: { ...art, base: boardUrl, thumbnail: boardUrl }, targets, ambient: [] };
  });
  const { world: _world, worlds: _worlds, ...partialTemplate } = template;
  const privateReviewConfig = GameConfigSchema.parse({ ...(input.boards.length < 9 ? partialTemplate : template), styleVersion: "fixed-sprite-board-conditioned-player-v1", scenes });
  return { version: "board-conditioned-player-game/v1" as const, privateReviewConfig,
    playableGameConfig: mode === "reviewed-playable" ? copy(privateReviewConfig) : null,
    scope: "authenticated-private" as const, semanticStatus: allReviewed ? "approved-by-supplied-receipts" as const : "pending" as const,
    fullWorld: input.boards.length === 9, assetWrites: prepared.flatMap(p => p.assetWrites),
    provenance: prepared.map(p => ({ manifest: p.manifest, playerBindingSha256: p.playerBindingSha256 })),
    urlContentVerification: "trusted-caller-receipts-not-fetched" as const, reviewerAuthorityVerification: "trusted-caller-required" as const,
    browserPixelParity: "unverified" as const, automaticRelease: false as const, persistenceStatus: "not-written" as const };
}
