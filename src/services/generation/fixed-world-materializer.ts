import sharp from "sharp";
import { z } from "zod";
import { GameConfigSchema, type GameConfig, type PlaySlot } from "../../domain/game/config";
import { composeGame, composeScene, composeWorld } from "../../domain/game/compose";
import { LocalizedTextSchema, SceneDefinitionSchema, type SceneDefinition } from "../../domain/scene/schema";
import { WorldDefinitionSchema, boardSlugs, type WorldDefinition } from "../../domain/world";
import { fillTemplate } from "../../lib/copy";
import { pick, type Locale } from "../../i18n/config";
import { fixedSlotV3ContractSchema, sha256Bytes, sha256Rgba, visibleSpriteSourceSchema, type ForegroundRgba, type VisibleSpriteSource } from "./fixed-sprite";
import type { FixedSpriteBoardRasterPlayerResult } from "./fixed-sprite-player";
import { auditWorldBudget, type WorldBudgetSnapshot, type WorldBudgetScope } from "./world-budget";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const nonempty = z.string().trim().min(1);
const MAX_BOARD_PIXELS = 16_777_216; // Bounded v1 decode: existing boards are 3072×2048.
const requestRefSchema = z.object({ requestKey: nonempty, operationFingerprint: nonempty }).strict();
export type FixedWorldRequestRef = z.infer<typeof requestRefSchema>;

/** Frozen generation intent, not source measurements or a claim of source compatibility. */
export const fixedWorldSourceSettingsSchema = z.object({
  image: z.object({ model: z.literal("gpt-image-2"), quality: z.literal("low"), size: z.literal("1024x1024"), background: z.literal("transparent"), outputFormat: z.literal("png"), n: z.literal(1) }).strict(),
  observer: z.object({ model: z.literal("gpt-5.6-sol"), effort: z.literal("high"), version: z.literal("visible-landmarks/v1") }).strict(),
  promptSha256: digest, styleReferenceSha256: digest, wardrobeKey: nonempty,
}).strict();
const appearanceSchema = z.object({
  targetId: nonempty, sourceKey: nonempty, contract: fixedSlotV3ContractSchema, contractSha256: digest,
  copy: z.object({ mission: LocalizedTextSchema, item: LocalizedTextSchema, success: z.array(LocalizedTextSchema).min(1), hintText: LocalizedTextSchema }).strict(),
  hintRadius: z.number().finite().min(0.03).max(0.5),
}).strict();
export const frozenFixedWorldPlanSchema = z.object({
  version: z.literal("fixed-world-plan/v1"), engine: z.literal("fixed-sprite/v3"), variantPolicy: z.literal("A-only"),
  /** Explicit opt-in: catalog foreground/bonus are not inherited or mutated. */
  foregroundPolicy: z.literal("per-appearance-premasked-only"), bonusPolicy: z.literal("disabled"),
  world: z.object({ slug: nonempty, version: z.number().int().positive(), definitionSha256: digest }).strict(),
  identitySha256: digest,
  sourceGroups: z.array(z.object({ key: nonempty, settings: fixedWorldSourceSettingsSchema, settingsSha256: digest }).strict()).min(1).max(27),
  boards: z.array(z.object({
    slug: nonempty, sceneVersion: z.number().int().positive(), definitionSha256: digest,
    board: z.object({ sha256: digest, width: z.number().int().positive().max(8192), height: z.number().int().positive().max(8192) }).strict()
      .refine(board => board.width * board.height <= MAX_BOARD_PIXELS, "Board exceeds the bounded materializer frame"),
    appearances: z.array(appearanceSchema).length(3),
  }).strict()).length(9),
}).strict();
export type FrozenFixedWorldPlan = z.infer<typeof frozenFixedWorldPlanSchema>;

export class FixedWorldMaterializerError extends Error {
  constructor(readonly code: "schema" | "coverage" | "hash_mismatch" | "source" | "artifact" | "review" | "budget" | "geometry", message: string) { super(message); this.name = "FixedWorldMaterializerError"; }
}
function requireThat(value: unknown, code: FixedWorldMaterializerError["code"], message: string): asserts value {
  if (!value) throw new FixedWorldMaterializerError(code, message);
}
/** Canonical JSON hash for this module's plans/receipts; not an encoded-file hash. */
export function fixedWorldJsonSha256(value: unknown): string {
  const seen = new Set<object>();
  const json = (item: unknown): string => {
    if (item === null || typeof item === "string" || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item)) return JSON.stringify(item);
    requireThat(typeof item === "object" && item !== null && !seen.has(item), "schema", "Receipt must be finite acyclic JSON");
    requireThat(Array.isArray(item) || Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null, "schema", "Receipt must be plain JSON");
    seen.add(item);
    const result = Array.isArray(item) ? `[${item.map(json).join(",")}]` : `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${json((item as Record<string, unknown>)[key])}`).join(",")}}`;
    seen.delete(item); return result;
  };
  return sha256Bytes(Buffer.from(json(value)));
}
function parsed<S extends z.ZodTypeAny>(schema: S, value: unknown, label: string): z.output<S> {
  const result = schema.safeParse(value);
  requireThat(result.success, "schema", `${label} schema is invalid`); return result.data;
}
function same(a: unknown, b: unknown, code: FixedWorldMaterializerError["code"], message: string) { requireThat(fixedWorldJsonSha256(a) === fixedWorldJsonSha256(b), code, message); }
function unique<T>(items: readonly T[], key: (item: T) => string, label: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) { const id = key(item); requireThat(!result.has(id), "coverage", `Duplicate ${label}: ${id}`); result.set(id, item); }
  return result;
}

export interface FixedWorldIntentInput {
  plan: FrozenFixedWorldPlan; planSha256: string; world: WorldDefinition; scenes: SceneDefinition[];
}
/** Free pre-generation intent validation. Never substitutes for paid receipts or final visual review. */
export function validateFrozenFixedWorldIntent(raw: FixedWorldIntentInput): { plan: FrozenFixedWorldPlan; world: WorldDefinition; scenes: SceneDefinition[] } {
  const input = structuredClone(raw);
  const plan = parsed(frozenFixedWorldPlanSchema, input.plan, "Frozen plan");
  requireThat(fixedWorldJsonSha256(plan) === input.planSha256, "hash_mismatch", "Frozen plan hash changed");
  const world = parsed(WorldDefinitionSchema, input.world, "World"), scenes = input.scenes.map(scene => parsed(SceneDefinitionSchema, scene, "Scene"));
  requireThat(world.slug === plan.world.slug && world.version === plan.world.version && fixedWorldJsonSha256(world) === plan.world.definitionSha256, "hash_mismatch", "World definition changed");
  const ordered = boardSlugs(world);
  requireThat(new Set(ordered).size === 9 && new Set(world.nodes.map(node => node.routeIndex)).size === 9, "coverage", "World route must contain nine unique boards and indices");
  same(plan.boards.map(board => board.slug), ordered, "coverage", "Plan must exactly match world route order");
  const sceneMap = unique(scenes, scene => scene.slug, "scene"), groups = unique(plan.sourceGroups, group => group.key, "source group");
  requireThat(sceneMap.size === 9 && ordered.every(slug => sceneMap.has(slug)), "coverage", "Exactly nine supplied scenes required");
  const contractIds = new Set<string>(), usedSources = new Set<string>();
  for (const group of plan.sourceGroups) requireThat(group.settingsSha256 === fixedWorldJsonSha256(group.settings), "hash_mismatch", "Source settings hash changed");
  for (const board of plan.boards) {
    const scene = sceneMap.get(board.slug)!;
    requireThat(scene.version === board.sceneVersion && fixedWorldJsonSha256(scene) === board.definitionSha256, "hash_mismatch", `Scene definition changed: ${board.slug}`);
    same({ sha256: scene.art.sha256, width: scene.art.width, height: scene.art.height }, board.board, "hash_mismatch", `Catalog art binding changed: ${board.slug}`);
    same([...board.appearances.map(item => item.targetId)].sort(), [...scene.targets.map(target => target.id)].sort(), "coverage", `Exact target mapping required: ${board.slug}`);
    unique(board.appearances, item => item.targetId, "target mapping");
    for (const slot of board.appearances) {
      requireThat(!contractIds.has(slot.contract.slotId), "coverage", "Contract slots must be globally distinct"); contractIds.add(slot.contract.slotId);
      requireThat(groups.has(slot.sourceKey), "coverage", "Missing declared source"); usedSources.add(slot.sourceKey);
      same(slot.contract.board, board.board, "hash_mismatch", "Contract uses different board");
      requireThat(sha256Bytes(Buffer.from(JSON.stringify(slot.contract))) === slot.contractSha256, "hash_mismatch", "Core contract hash changed");
      requireThat(slot.contract.support.type === "occluded-standing" && slot.contract.foregroundMask && slot.contract.bodyScale && slot.contract.requiredHiddenLandmarks?.length === 2, "geometry", "Fixed world v1 requires eye-anchored standing, a mask, body band and both sole guards");
    }
  }
  requireThat(usedSources.size === groups.size, "coverage", "Unused source groups are not allowed");
  return { plan, world, scenes };
}

export interface QualifiedFixedWorldSource {
  status: "qualified"; key: string; identitySha256: string;
  settings: z.infer<typeof fixedWorldSourceSettingsSchema>; settingsSha256: string;
  encodedPng: Uint8Array; sourceImageSha256: string; sourceRgbaSha256: string;
  measurement: VisibleSpriteSource; measurementSha256: string; observationReceiptSha256: string;
  imageRequest: FixedWorldRequestRef; observerRequest: FixedWorldRequestRef;
}
const reviewBase = {
  version: z.literal("fixed-world-review/v1"), status: z.literal("approved"),
  planSha256: digest, appearanceSha256: digest, contextSha256: digest,
  reviewedAt: z.string().datetime(),
};
const humanReviewer = z.object({ kind: z.literal("human"), id: nonempty }).strict();
const reviewSchema = z.discriminatedUnion("kind", [
  z.object({ ...reviewBase, kind: z.literal("semantic"), reviewer: z.discriminatedUnion("kind", [
    humanReviewer,
    z.object({ kind: z.literal("provider"), id: nonempty, model: z.literal("gpt-5.6-sol"), effort: z.literal("high"), request: requestRefSchema }).strict(),
  ]) }).strict(),
  z.object({ ...reviewBase, kind: z.literal("browser"), reviewer: z.discriminatedUnion("kind", [
    humanReviewer, z.object({ kind: z.literal("browser-validator"), id: nonempty, version: nonempty }).strict(),
  ]), capture: z.object({
    renderer: z.literal("SceneViewport"), browser: nonempty,
    viewportWidth: z.number().int().positive(), viewportHeight: z.number().int().positive(), deviceScaleFactor: z.number().finite().positive(),
    screenshotSha256: digest, appearanceSha256: digest,
  }).strict() }).strict(),
]);
export type FixedWorldReviewReceipt = z.infer<typeof reviewSchema>;
export interface QualifiedFixedWorldAppearance {
  boardSlug: string; targetId: string; sourceKey: string; variant: "A";
  /** Produced by the replaying board-raster adapter, not a handwritten SpriteRef. */
  exported: FixedSpriteBoardRasterPlayerResult;
  /** Encoded PNG preferred: 27 decoded 3072×2048 masks alone occupy ~648 MiB. */
  foreground: ForegroundRgba | { png: Uint8Array };
  /** Exact encoded context reviewed upstream. Never used as a player layer. */
  reviewContext: Uint8Array;
  reviews: FixedWorldReviewReceipt[];
}
export interface FixedWorldMaterializerInput {
  plan: FrozenFixedWorldPlan; planSha256: string;
  world: WorldDefinition; scenes: SceneDefinition[];
  originalBoards: Array<{ slug: string; bytes: Uint8Array }>;
  identity: { bytes: Uint8Array; sha256: string; request: FixedWorldRequestRef };
  sources: QualifiedFixedWorldSource[]; appearances: QualifiedFixedWorldAppearance[];
  budget: { worldId: string; snapshot: WorldBudgetSnapshot; snapshotSha256: string };
  game: { id: string; childName: string; avatarUrl: string; locale: Locale; styleVersion: string; composedAt: string; gift?: { fromName?: string; message?: string } };
}
/** Public deterministic runtime projection; never reads legacy slot coordinates or hints. */
export function fixedWorldRuntimeSlot(appearance: FrozenFixedWorldPlan["boards"][number]["appearances"][number], locale: Locale, childName: string): PlaySlot {
  const { contract } = appearance;
  return {
    id: contract.slotId, ...contract.support.destination,
    scale: (contract.bodyScale?.maxDistancePx ?? contract.scale.destinationDistancePx) / contract.board.height,
    rotation: 0, flip: false, layer: "front", zIndex: 30,
    hintZone: { ...contract.support.destination, r: appearance.hintRadius },
    hintText: fillTemplate(pick(appearance.copy.hintText, locale), { name: childName }),
  };
}
/** Receipt binding deliberately excludes the expiring URL, includes pixels and exact geometry. */
export function fixedWorldAppearanceSha256(input: {
  planSha256: string; boardSlug: string; targetId: string; sourceKey: string;
  source: Pick<QualifiedFixedWorldSource, "identitySha256" | "settingsSha256" | "sourceImageSha256" | "sourceRgbaSha256" | "measurementSha256" | "observationReceiptSha256">;
  exported: FixedSpriteBoardRasterPlayerResult;
}): string {
  const p = input.exported.provenance, sprite = input.exported.sprite;
  return fixedWorldJsonSha256({
    version: "fixed-world-appearance/v1", planSha256: input.planSha256, boardSlug: input.boardSlug, targetId: input.targetId, sourceKey: input.sourceKey,
    source: { identitySha256: input.source.identitySha256, settingsSha256: input.source.settingsSha256, sourceImageSha256: input.source.sourceImageSha256,
      sourceRgbaSha256: input.source.sourceRgbaSha256, measurementSha256: input.source.measurementSha256, observationReceiptSha256: input.source.observationReceiptSha256 },
    board: p.board, contractSha256: p.contractSha256, slotId: p.slotId,
    boardRasterRgbaSha256: p.boardRasterRgbaSha256, boardPixelRect: p.boardPixelRect,
    sourceCellToBoard: p.sourceCellToBoard, nativeCropToBoard: p.nativeCropToBoard, crop: p.crop,
    cleanedSourceRgbaSha256: p.cleanedSourceRgbaSha256, nativeVisibleRgbaSha256: p.nativeVisibleRgbaSha256,
    placementMaskRgbaSha256: p.placementMaskRgbaSha256, semanticReviewRequirement: p.semanticReviewRequirement,
    foregroundApplied: p.foregroundApplied, foregroundReapplication: p.foregroundReapplication,
    sprite: { kind: sprite.kind, width: sprite.width, height: sprite.height, rect: sprite.rect, hitRect: sprite.hitRect, anchor: sprite.anchor },
  });
}

/**
 * Pure in-memory materialization: no files, network, signer, DB, callback or publication.
 *
 * TRUST BOUNDARY: upstream must authenticate qualification/reviewer receipts and
 * establish that reviewContext is the actual composition reviewed. Hash equality
 * is tamper/drift detection, not a signature or a new semantic/pixel-parity judge.
 * This function verifies supplied board/source bytes, exact-original masks and the
 * qualified adapter's raster geometry. It does not reinterpret a raw model reply.
 *
 * Persist lossless PNG encodings of assetWrites and verify their decoded hashes;
 * supplied URLs must resolve to those assets. Store private provenance outside
 * GameConfig. Only publish after ALL writes and a fresh durable budget audit.
 * Sources/identity need ownership/deletion links in the caller's source bank.
 */
export async function materializeFixedWorld(input: FixedWorldMaterializerInput): Promise<{
  config: GameConfig;
  assetWrites: Array<{ key: string; boardSlug: string; targetId: string; variant: "A"; url: string; type: "TARGET_SPRITE"; visibility: "GAME"; format: "lossless-png"; rgba: Buffer; width: number; height: number; rgbaSha256: string }>;
  provenance: { version: "fixed-world-materialization/v1"; planSha256: string; budgetSnapshotSha256: string; sourceKeys: string[]; appearances: Array<{ boardSlug: string; targetId: string; slotId: string; appearanceSha256: string; reviewReceiptSha256: string[] }> };
  automaticRelease: false; persistenceStatus: "not-written";
}> {
  // Snapshot caller-owned memory before the first asynchronous decode.
  input = structuredClone(input);
  const { plan, world, scenes } = validateFrozenFixedWorldIntent(input);
  requireThat(input.game.id.trim() && input.game.childName.trim() && input.game.avatarUrl.trim() && input.game.styleVersion.trim() && z.string().datetime().safeParse(input.game.composedAt).success, "schema", "Complete game identity and timestamp required");
  requireThat(input.game.locale === "en" || input.game.locale === "he", "schema", "Supported game locale required");
  const ordered = boardSlugs(world);
  requireThat(new Set(ordered).size === 9 && new Set(world.nodes.map(node => node.routeIndex)).size === 9, "coverage", "World route must contain nine unique boards and indices");
  same(plan.boards.map(board => board.slug), ordered, "coverage", "Plan must exactly match world route order");
  const sceneMap = unique(scenes, scene => scene.slug, "scene"), boards = unique(input.originalBoards, board => board.slug, "original board");
  requireThat(sceneMap.size === 9 && boards.size === 9 && ordered.every(slug => sceneMap.has(slug) && boards.has(slug)), "coverage", "Exactly nine supplied scenes and original boards required");
  const groups = unique(plan.sourceGroups, group => group.key, "source group"), sources = unique(input.sources, source => source.key, "source");
  requireThat(groups.size === sources.size && [...groups.keys()].every(key => sources.has(key)), "coverage", "Exactly the declared source groups must be supplied");
  const appearances = unique(input.appearances, item => `${item.boardSlug}/${item.targetId}`, "appearance");
  requireThat(appearances.size === 27, "coverage", "Exactly 27 A-only appearances required");
  const contractIds = new Set<string>(), usedSources = new Set<string>();
  for (const board of plan.boards) {
    const scene = sceneMap.get(board.slug)!;
    requireThat(scene.version === board.sceneVersion && fixedWorldJsonSha256(scene) === board.definitionSha256, "hash_mismatch", `Scene definition changed: ${board.slug}`);
    same({ sha256: scene.art.sha256, width: scene.art.width, height: scene.art.height }, board.board, "hash_mismatch", `Catalog art binding changed: ${board.slug}`);
    same([...board.appearances.map(item => item.targetId)].sort(), [...scene.targets.map(target => target.id)].sort(), "coverage", `Exact target mapping required: ${board.slug}`);
    unique(board.appearances, item => item.targetId, "target mapping");
    for (const slot of board.appearances) {
      requireThat(!contractIds.has(slot.contract.slotId), "coverage", "Contract slots must be globally distinct"); contractIds.add(slot.contract.slotId);
      requireThat(groups.has(slot.sourceKey) && appearances.has(`${board.slug}/${slot.targetId}`), "coverage", "Missing declared source or appearance"); usedSources.add(slot.sourceKey);
      same(slot.contract.board, board.board, "hash_mismatch", "Contract uses different board");
      requireThat(sha256Bytes(Buffer.from(JSON.stringify(slot.contract))) === slot.contractSha256, "hash_mismatch", "Core contract hash changed");
      requireThat(slot.contract.support.type === "occluded-standing" && slot.contract.foregroundMask && slot.contract.bodyScale && slot.contract.requiredHiddenLandmarks?.length === 2, "geometry", "Fixed world v1 requires eye-anchored standing, a mask, body band and both sole guards");
    }
  }
  requireThat(usedSources.size === groups.size, "coverage", "Unused source groups are not allowed");
  requireThat(input.budget.worldId === input.budget.snapshot.worldId && input.budget.worldId === `${input.game.id}:${world.slug}`, "budget", "Budget must bind this game-world instance");
  requireThat(fixedWorldJsonSha256(input.budget.snapshot) === input.budget.snapshotSha256, "hash_mismatch", "Budget snapshot changed");
  const budget = auditWorldBudget(input.budget.snapshot);
  requireThat(!budget.held && budget.pendingRequestKeys.length === 0 && budget.unknownRequestKeys.length === 0 && budget.reservedMicroUsd === 0 && budget.overCapMicroUsd === 0, "budget", "Unknown, pending or over-cap budget cannot materialize");
  const paid = (ref: FixedWorldRequestRef, scopes: WorldBudgetScope[], expectedModel?: string) => {
    parsed(requestRefSchema, ref, "Paid request");
    const request = input.budget.snapshot.requests.find(item => item.requestKey === ref.requestKey);
    requireThat(request && (request.state === "settled" || request.state === "linked") && request.operationFingerprint === ref.operationFingerprint && scopes.includes(request.scope), "budget", "Qualified receipt lacks its settled matching world charge");
    if (expectedModel) requireThat(request.evidence.model === expectedModel, "budget", "Settled request model differs from qualified settings");
  };
  requireThat(input.identity.sha256 === plan.identitySha256 && sha256Bytes(input.identity.bytes) === plan.identitySha256, "hash_mismatch", "Identity bytes changed"); paid(input.identity.request, ["identity", "sheet"]);
  for (const group of plan.sourceGroups) {
    const source = sources.get(group.key)!;
    requireThat(source.status === "qualified", "source", "Pending or failed source cannot materialize");
    same(source.settings, group.settings, "source", "Source settings differ from frozen intent");
    requireThat(group.settingsSha256 === fixedWorldJsonSha256(group.settings) && source.settingsSha256 === group.settingsSha256, "hash_mismatch", "Source settings hash changed");
    requireThat(source.identitySha256 === plan.identitySha256 && sha256Bytes(source.encodedPng) === source.sourceImageSha256, "hash_mismatch", "Source or identity binding changed");
    const meta = await sharp(Buffer.from(source.encodedPng)).metadata();
    requireThat(meta.format === "png" && (meta.pages ?? 1) === 1 && (meta.orientation ?? 1) === 1 && meta.width === 1024 && meta.height === 1024, "source", "Source frame must remain a single unrotated 1024-square PNG before decoding");
    const raw = await sharp(Buffer.from(source.encodedPng), { limitInputPixels: 1024 * 1024 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    requireThat(meta.format === "png" && (meta.pages ?? 1) === 1 && (meta.orientation ?? 1) === 1 && raw.info.width === 1024 && raw.info.height === 1024 && sha256Rgba(raw.data, 1024, 1024) === source.sourceRgbaSha256, "source", "Source must preserve its approved original 1024-square PNG pixels");
    const measurement = parsed(visibleSpriteSourceSchema, source.measurement, "Visible measurements");
    requireThat(measurement.measurementFrame.rgbaSha256 === source.sourceRgbaSha256 && measurement.measurementFrame.width === 1024 && measurement.measurementFrame.height === 1024 && fixedWorldJsonSha256(measurement) === source.measurementSha256 && digest.safeParse(source.observationReceiptSha256).success, "hash_mismatch", "Source observation binding changed");
    source.measurement = measurement;
    same(measurement.measurementFrame.cell, { id: "standing", left: 0, top: 0, width: 1024, height: 1024 }, "source", "Source must use its original complete observation frame");
    requireThat(measurement.landmarkTolerancePx === 2, "source", "Source must retain the automatic observer's two-pixel uncertainty");
    paid(source.imageRequest, ["image"], group.settings.image.model); paid(source.observerRequest, ["judge"], group.settings.observer.model);
  }
  const assetWrites: Awaited<ReturnType<typeof materializeFixedWorld>>["assetWrites"] = [], evidence: Awaited<ReturnType<typeof materializeFixedWorld>>["provenance"]["appearances"] = [];
  const composedScenes: GameConfig["scenes"] = [], urls = new Set<string>();
  for (const board of plan.boards) {
    const scene = sceneMap.get(board.slug)!, bytes = boards.get(board.slug)!.bytes;
    requireThat(sha256Bytes(bytes) === board.board.sha256, "hash_mismatch", `Original board bytes changed: ${board.slug}`);
    const meta = await sharp(Buffer.from(bytes)).metadata();
    requireThat(meta.width === board.board.width && meta.height === board.board.height && (meta.pages ?? 1) === 1 && (meta.orientation ?? 1) === 1, "hash_mismatch", "Original board frame changed before decoding");
    const decoded = await sharp(Buffer.from(bytes), { limitInputPixels: MAX_BOARD_PIXELS }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    requireThat(decoded.info.width === board.board.width && decoded.info.height === board.board.height && (meta.pages ?? 1) === 1 && (meta.orientation ?? 1) === 1, "hash_mismatch", "Decoded board frame changed");
    const targets = [];
    for (const slot of board.appearances) {
      const item = appearances.get(`${board.slug}/${slot.targetId}`)!, source = sources.get(slot.sourceKey)!, out = item.exported, p = out.provenance, sprite = out.sprite, raster = out.rasterAsset;
      requireThat(item.variant === "A" && item.sourceKey === slot.sourceKey && out.exportMode === "board-raster" && p.version === "fixed-sprite-player/board-raster-v1", "artifact", "Only declared qualified board-raster A appearances are supported");
      requireThat(p.slotId === slot.contract.slotId && p.contractSha256 === slot.contractSha256, "hash_mismatch", "Artifact contract binding changed");
      same(p.board, board.board, "hash_mismatch", "Artifact board binding changed");
      requireThat(p.sourceRgbaSha256 === source.sourceRgbaSha256 && p.sourceMeasurementSha256 === sha256Bytes(Buffer.from(JSON.stringify(source.measurement))), "hash_mismatch", "Artifact source measurement changed");
      let mask: ForegroundRgba;
      if ("png" in item.foreground) {
        const maskBytes = Buffer.from(item.foreground.png), maskMeta = await sharp(maskBytes).metadata();
        requireThat(maskMeta.format === "png" && (maskMeta.pages ?? 1) === 1 && (maskMeta.orientation ?? 1) === 1 && maskMeta.width === board.board.width && maskMeta.height === board.board.height, "artifact", "Foreground must be a single unrotated PNG at the bound board dimensions before decoding");
        const decodedMask = await sharp(maskBytes, { limitInputPixels: MAX_BOARD_PIXELS }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        mask = { rgba: decodedMask.data, width: decodedMask.info.width, height: decodedMask.info.height };
      } else mask = item.foreground;
      requireThat(mask.width === board.board.width && mask.height === board.board.height && sha256Rgba(mask.rgba, mask.width, mask.height) === slot.contract.foregroundMask!.rgbaSha256, "hash_mismatch", "Foreground mask changed");
      requireThat(p.placementMaskRgbaSha256 === slot.contract.foregroundMask!.rgbaSha256, "hash_mismatch", "Exported mask provenance changed");
      for (let i = 0; i < mask.rgba.length; i += 4) {
        const a = mask.rgba[i + 3]!;
        requireThat(a === 0 || a === 255, "artifact", "Materializer v1 accepts only binary original foreground masks");
        if (a) for (let c = 0; c < 4; c++) requireThat(mask.rgba[i + c] === decoded.data[i + c], "artifact", "Foreground must copy exact original board RGBA");
      }
      requireThat(p.foregroundApplied && p.foregroundReapplication === false && p.runtimeForegroundVerification === "none" && p.anchorSemantics === "observed-eye-midpoint" && p.hitGeometryBasis === "board-raster-alpha-ge32" && p.geometryParity === "exact-board-raster-rect" && p.pixelParity === "exact-replayed-qa-composite-before-viewport-resampling", "artifact", "Unqualified raster/foreground geometry provenance");
      same(p.runtime.art, { base: scene.art.base, width: board.board.width, height: board.board.height }, "artifact", "Artifact runtime inherits different art or global foreground");
      const runtimeSlot = fixedWorldRuntimeSlot(slot, input.game.locale, input.game.childName);
      same(p.runtime.slot, { id: runtimeSlot.id, flip: false, rotation: 0, layer: "front", zIndex: 30 }, "artifact", "Artifact runtime slot is not the fixed projection");
      same(p.runtime.adjust, { dx: 0, dy: 0, scale: 1 }, "artifact", "Artifact has an extra runtime adjustment");
      const r = p.boardPixelRect;
      requireThat([r.left, r.top, r.width, r.height].every(Number.isInteger) && r.left >= 0 && r.top >= 0 && r.width > 0 && r.height > 0 && r.left + r.width <= board.board.width && r.top + r.height <= board.board.height, "geometry", "Board raster bounds invalid");
      requireThat(raster.width === r.width && raster.height === r.height && sprite.width === r.width && sprite.height === r.height && sha256Rgba(raster.rgba, r.width, r.height) === raster.rgbaSha256 && raster.rgbaSha256 === p.boardRasterRgbaSha256, "hash_mismatch", "Raster pixels or dimensions changed");
      same(p.semanticReviewRequirement, { detailAsset: "board-raster", rgbaSha256: raster.rgbaSha256, nativeDetailApprovalSufficient: false }, "review", "Board-raster detail approval requirement changed");
      same(sprite.rect, { x: r.left / board.board.width, y: r.top / board.board.height, w: r.width / board.board.width, h: r.height / board.board.height }, "geometry", "Sprite would rescale or move the reviewed board raster");
      let minX = r.width, minY = r.height, maxX = -1, maxY = -1;
      for (let y = 0; y < r.height; y++) for (let x = 0; x < r.width; x++) if (raster.rgba[(y * r.width + x) * 4 + 3]! >= 32) {
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      requireThat(maxX >= 0, "geometry", "An empty raster cannot be a playable appearance");
      same(sprite.hitRect, { x: (r.left + minX) / board.board.width, y: (r.top + minY) / board.board.height, w: (maxX - minX + 1) / board.board.width, h: (maxY - minY + 1) / board.board.height }, "geometry", "Hit rectangle differs from the actual visible raster alpha");
      const transform = p.sourceCellToBoard, eye = source.measurement.landmarks.eyeMidpoint;
      const eyeX = (eye.x * 1024 * transform.scale + transform.translateX) / board.board.width, eyeY = (eye.y * 1024 * transform.scale + transform.translateY) / board.board.height;
      requireThat(Number.isFinite(transform.scale) && transform.scale > 0 && Math.abs(sprite.anchor.x - eyeX) <= 1e-12 && Math.abs(sprite.anchor.y - eyeY) <= 1e-12 && eyeX >= sprite.hitRect.x && eyeX <= sprite.hitRect.x + sprite.hitRect.w && eyeY >= sprite.hitRect.y && eyeY <= sprite.hitRect.y + sprite.hitRect.h, "geometry", "Eye anchor differs from observed source geometry or falls outside visible hit geometry");
      requireThat(sprite.kind === "image" && sprite.url.trim() && !urls.has(sprite.url), "artifact", "Distinct supplied asset URLs required; no fallback sprites"); urls.add(sprite.url);
      // SceneViewport draws only the current mission's child. Other missions'
      // storage rectangles need not be packed as if all 27 were shown together.
      const appearanceSha256 = fixedWorldAppearanceSha256({ planSha256: input.planSha256, boardSlug: board.slug, targetId: slot.targetId, sourceKey: slot.sourceKey,
        source: { identitySha256: source.identitySha256, settingsSha256: source.settingsSha256, sourceImageSha256: source.sourceImageSha256, sourceRgbaSha256: source.sourceRgbaSha256, measurementSha256: source.measurementSha256, observationReceiptSha256: source.observationReceiptSha256 }, exported: out });
      requireThat(item.reviews.length === 2, "review", "Independent semantic and browser review receipts required");
      const reviews = item.reviews.map(review => parsed(reviewSchema, review, "Approved review"));
      requireThat(new Set(reviews.map(review => review.kind)).size === 2, "review", "Both semantic and browser checks are required");
      for (const review of reviews) {
        requireThat(review.planSha256 === input.planSha256 && review.appearanceSha256 === appearanceSha256 && review.contextSha256 === sha256Bytes(item.reviewContext), "review", "Review does not bind this exact fixed appearance and context");
        if (review.kind === "semantic" && review.reviewer.kind === "provider") paid(review.reviewer.request, ["judge"], review.reviewer.model);
        if (review.kind === "browser") requireThat(review.capture.appearanceSha256 === appearanceSha256, "review", "Browser capture names a different displayed appearance");
      }
      const legacy = scene.targets.find(target => target.id === slot.targetId)!;
      const text = (copy: z.infer<typeof LocalizedTextSchema>) => fillTemplate(pick(copy, input.game.locale), { name: input.game.childName });
      targets.push({ id: slot.targetId, targetType: "fixed-standing-peek", difficulty: legacy.difficulty,
        mission: text(slot.copy.mission), item: text(slot.copy.item), success: slot.copy.success.map(text), animation: "peek" as const,
        slots: [runtimeSlot, { ...runtimeSlot, id: `${runtimeSlot.id}:inactive-B` }] as [PlaySlot, PlaySlot], sprite, spriteByVariant: { A: sprite } });
      assetWrites.push({ key: `${input.game.id}/${board.slug}/${slot.targetId}/A/${raster.rgbaSha256}`, boardSlug: board.slug, targetId: slot.targetId, variant: "A", url: sprite.url,
        type: "TARGET_SPRITE", visibility: "GAME", format: "lossless-png", rgba: Buffer.from(raster.rgba), width: raster.width, height: raster.height, rgbaSha256: raster.rgbaSha256 });
      evidence.push({ boardSlug: board.slug, targetId: slot.targetId, slotId: slot.contract.slotId, appearanceSha256, reviewReceiptSha256: reviews.map(fixedWorldJsonSha256) });
    }
    const base = composeScene(scene, { name: input.game.childName, avatarUrl: input.game.avatarUrl }, targets.map(target => ({ targetId: target.id, sprite: target.sprite, spriteByVariant: target.spriteByVariant })), input.game.locale);
    const { foreground: _legacyForeground, ...art } = base.art;
    const { bonus: _legacyBonus, ...withoutBonus } = base;
    composedScenes.push({ ...withoutBonus, art, targets, worldSlug: world.slug });
  }
  const config = GameConfigSchema.parse(composeGame({ gameId: input.game.id, child: { name: input.game.childName, avatarUrl: input.game.avatarUrl }, packageTier: "ONE_WORLD", styleVersion: input.game.styleVersion,
    locale: input.game.locale, scenes: composedScenes, worlds: [composeWorld(world, { name: input.game.childName, avatarUrl: input.game.avatarUrl }, input.game.locale)], gift: input.game.gift, now: new Date(input.game.composedAt) }));
  return { config, assetWrites, provenance: { version: "fixed-world-materialization/v1", planSha256: input.planSha256, budgetSnapshotSha256: input.budget.snapshotSha256, sourceKeys: [...groups.keys()], appearances: evidence }, automaticRelease: false, persistenceStatus: "not-written" };
}
