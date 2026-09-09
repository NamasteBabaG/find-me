import { Prisma } from "@prisma/client";
import sharp from "sharp";
import type { Container } from "../container";
import type { Actor } from "../audit.service";
import { signedAssetUrl } from "../asset.service";
import { env } from "../../lib/env";
import { newId } from "../../lib/ids";
import { GameConfigSchema } from "../../domain/game/config";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { auditWorldBudget } from "./world-budget";
import { sha256Bytes, sha256Rgba } from "./fixed-sprite";
import { materializeFixedWorld, fixedWorldJsonSha256, type FixedWorldMaterializerInput } from "./fixed-world-materializer";
import {
  FIXED_WORLD_STYLE_VERSION, isFixedWorldStyle, FixedWorldStageError, fixedStageAssert as requireThat,
  fixedWorldStageRecordSchema, readFixedWorldStage, fixedWorldConfigSha256, fixedStageJsonSha256,
  fixedStageStoragePath, type FixedStageAsset, type FixedWorldStageRecord,
  readFixedWorldEnrollment,
} from "./fixed-world-stage-record";

type Tx = Prisma.TransactionClient;
const transactionOptions = { maxWait: 5_000, timeout: 30_000 };
const MAX_ENCODED_INPUT = 100 * 1024 * 1024;
const fixedAssetId = (gameId: string, plan: string, key: string) => `ast_fixed_${fixedWorldJsonSha256([gameId, plan, key])}`;
const rowId = (prefix: string, ...values: string[]) => `${prefix}_fixed_${fixedWorldJsonSha256(values)}`;
type PreparedAsset = { metadata: FixedStageAsset; bytes: Buffer };

function requireQaDb(c: Container) {
  requireThat(process.env.NODE_ENV === "test" || env().APP_ENV === "qa", "unsupported", "Fixed-world staging is QA-only");
  // Atomic FileBlob + metadata + config persistence is deliberately DB-only.
  // A local/object-storage implementation needs immutable writes + recovery first.
  requireThat(c.storage.id === "db", "unsupported", "Fixed-world staging requires transactional DB storage");
}
async function requireAdmin(c: Container, actor: Actor) {
  requireThat(actor.type === "ADMIN" && actor.id.trim(), "permission", "An authenticated manual administrator is required");
  const user = await c.db.user.findUnique({ where: { id: actor.id }, select: { email: true } });
  requireThat(user && c.adminEmails?.some(email => email.trim().toLowerCase() === user.email.toLowerCase()), "permission", "The approving administrator is not authorized");
}
async function readPng(bytes: Uint8Array, maxPixels = 16_777_216) {
  const meta = await sharp(Buffer.from(bytes), { limitInputPixels: maxPixels, failOn: "warning" }).metadata();
  requireThat(meta.format === "png" && (meta.pages ?? 1) === 1 && (meta.orientation ?? 1) === 1, "integrity", "Expected one unrotated PNG");
  const raw = await sharp(Buffer.from(bytes), { limitInputPixels: maxPixels, failOn: "warning" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: raw.info.width, height: raw.info.height, rgbaSha256: sha256Rgba(raw.data, raw.info.width, raw.info.height) };
}
async function ownedAssetBytes(db: Pick<Tx, "asset" | "fileBlob">, id: string, ownerId: string, visibility: "PRIVATE" | "GAME", type: "IDENTITY_SHEET" | "AVATAR") {
  const row = await db.asset.findUnique({ where: { id } });
  requireThat(row && row.ownerId === ownerId && row.status === "READY" && row.visibility === visibility && row.type === type && row.mimeType === "image/png", "identity", "Referenced child asset is unavailable or belongs to another owner");
  const blob = await db.fileBlob.findUnique({ where: { key: row.storagePath } });
  requireThat(blob && blob.contentType === row.mimeType && row.bytes === blob.data.byteLength, "storage", "Referenced child image bytes are unavailable");
  return Buffer.from(blob.data);
}
async function safeBudget(c: Container, worldId: string, expectedHash: string) {
  const row = await new PrismaWorldBudgetStore(c.db).read(worldId);
  requireThat(row && fixedWorldJsonSha256(row.snapshot) === expectedHash, "budget", "The current durable budget differs from the qualified world");
  const audit = auditWorldBudget(row.snapshot);
  requireThat(!audit.held && audit.reservedMicroUsd === 0 && audit.pendingRequestKeys.length === 0 && audit.unknownRequestKeys.length === 0 && audit.overCapMicroUsd === 0, "budget", "World budget has unsettled, unknown or excessive charges");
  return row;
}
async function fenceBudget(tx: Tx, worldId: string, revision: number, hash: string) {
  const row = await tx.worldBudgetLedger.findUnique({ where: { worldId } });
  requireThat(row && row.schemaVersion === 1 && row.revision === revision && fixedWorldJsonSha256(JSON.parse(row.snapshotJson)) === hash && revision < 2_147_483_647, "budget", "Budget changed before the atomic commit");
  const claim = await tx.worldBudgetLedger.updateMany({ where: { worldId, schemaVersion: 1, revision }, data: { revision: { increment: 1 } } });
  requireThat(claim.count === 1, "budget", "Budget fence was lost");
}
async function auditTx(tx: Tx, actor: Actor, gameId: string, action: string, meta?: unknown) {
  await tx.auditLog.create({ data: { id: newId("aud"), actorType: actor.type, actorId: "id" in actor ? actor.id : null, action, entityType: "Game", entityId: gameId, metaJson: meta === undefined ? null : JSON.stringify(meta) } });
}
/** Enrollment pins exist before generation, and survive staging/publication. */
async function checkEnrollment(db: Pick<Tx, "game" | "childProfile" | "asset" | "fileBlob" | "generationJob">, gameId: string) {
  const game = await db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, scenes: { orderBy: { orderIndex: "asc" } } } });
  const job = await db.generationJob.findUnique({ where: { id: `job_${gameId}` } });
  const enrollment = job ? readFixedWorldEnrollment(job.stepsJson) : null;
  requireThat(game && !game.deletedAt && game.styleVersion === FIXED_WORLD_STYLE_VERSION && game.childProfile && !game.childProfile.deletedAt && enrollment, "integrity", "A valid fixed-from-birth enrollment is required");
  const child = game.childProfile;
  requireThat(enrollment.gameId === game.id && enrollment.ownerId === game.ownerId && child.ownerId === game.ownerId && enrollment.childProfileId === child.id && enrollment.childAgeYears === child.ageYears && enrollment.childDisplayName === child.displayName && enrollment.locale === game.locale, "identity", "Enrollment child or locale binding changed");
  requireThat(game.packageTier === "ONE_WORLD" && game.sceneCount === 9 && fixedWorldJsonSha256(game.scenes.map(s => [s.sceneSlug, s.sceneVersion])) === fixedWorldJsonSha256(enrollment.scenes.map(s => [s.slug, s.sceneVersion])), "integrity", "Enrolled scene route changed");
  requireThat(child.identityAssetId === enrollment.identityAssetId && child.avatarAssetId === enrollment.avatarAssetId, "identity", "Enrolled child asset pointers changed");
  const images = [
    { id: enrollment.identityAssetId, storagePath: enrollment.identityStoragePath, sha256: enrollment.identitySha256, type: "IDENTITY_SHEET", visibility: "PRIVATE" },
    { id: enrollment.avatarAssetId, storagePath: enrollment.avatarStoragePath, sha256: enrollment.avatarSha256, type: "AVATAR", visibility: "GAME" },
  ];
  if (child.originalPhotoAssetId) {
    requireThat(enrollment.originalPhoto && child.originalPhotoAssetId === enrollment.originalPhoto.id, "identity", "Original-photo pointer differs from enrollment");
    images.push({ ...enrollment.originalPhoto, type: "ORIGINAL_PHOTO", visibility: "PRIVATE" });
  } else requireThat(!enrollment.originalPhoto || !child.retainOriginalPhoto && ["READY", "DELIVERED"].includes(game.status), "identity", "Original photo disappeared before approved retention cleanup");
  for (const image of images) {
    const asset = await db.asset.findUnique({ where: { id: image.id } });
    const blob = await db.fileBlob.findUnique({ where: { key: image.storagePath } });
    requireThat(asset && asset.ownerId === game.ownerId && asset.status === "READY" && asset.type === image.type && asset.visibility === image.visibility && asset.storagePath === image.storagePath && blob && blob.contentType === asset.mimeType && asset.bytes === blob.data.byteLength && sha256Bytes(blob.data) === image.sha256, "identity", "Enrolled child image bytes or ownership changed");
    requireThat(await db.asset.count({ where: { storagePath: image.storagePath, NOT: { id: image.id } } }) === 0 && await db.childProfile.count({ where: { NOT: { id: child.id }, OR: [{ identityAssetId: image.id }, { avatarAssetId: image.id }, { originalPhotoAssetId: image.id }] } }) === 0, "identity", "Enrolled child image is shared");
  }
  return enrollment;
}
async function checkInventory(db: Pick<Tx, "asset" | "fileBlob">, record: FixedWorldStageRecord) {
  for (const asset of record.assets) {
    const row = await db.asset.findUnique({ where: { id: asset.id } });
    requireThat(row && row.ownerId === record.ownerId && row.status === "READY" && row.provider === "fixed-sprite-v3" && row.type === (asset.role === "sprite" ? "TARGET_SPRITE" : asset.role === "board" ? "BOARD_ART" : "FIXED_WORLD_EVIDENCE") && row.visibility === asset.visibility && row.storagePath === fixedStageStoragePath(asset) && row.mimeType === asset.mimeType && row.width === asset.width && row.height === asset.height, "integrity", "Staged asset metadata changed");
    const blob = await db.fileBlob.findUnique({ where: { key: row.storagePath } });
    requireThat(blob && blob.contentType === asset.mimeType && row.bytes === blob.data.byteLength && sha256Bytes(blob.data) === asset.encodedSha256, "integrity", "Staged asset bytes changed or disappeared");
  }
}
async function checkStoredGame(db: Pick<Tx, "game" | "childProfile" | "generationJob" | "asset" | "fileBlob">, gameId: string) {
  const game = await db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, scenes: { orderBy: { orderIndex: "asc" }, include: { targets: { include: { variants: true } } } } } });
  const job = await db.generationJob.findUnique({ where: { id: `job_${gameId}` } });
  const record = job ? readFixedWorldStage(job.stepsJson) : null;
  requireThat(game && job && record && record.state === "staged" && job.status === "DONE" && game.styleVersion === FIXED_WORLD_STYLE_VERSION && !game.deletedAt && game.status !== "DELETED", "integrity", "A complete staged fixed world is required");
  const enrollment = await checkEnrollment(db, gameId);
  requireThat(enrollment.planSha256 === record.planSha256 && enrollment.worldId === record.worldId, "integrity", "Staged world differs from enrollment");
  const child = game.childProfile;
  requireThat(await db.game.count({ where: { childProfileId: game.childProfileId, deletedAt: null, NOT: { id: gameId } } }) === 0, "identity", "Fixed staging requires a dedicated child profile");
  requireThat(record.gameId === game.id && record.ownerId === game.ownerId && child && !child.deletedAt && record.childProfileId === child.id && child.ownerId === game.ownerId && child.avatarAssetId === record.avatarAssetId && child.identityAssetId === record.identityAssetId, "identity", "The staged child/owner binding changed");
  requireThat(child.ageYears === record.childAgeYears, "identity", "The staged child's age changed");
  requireThat(game.configJson && game.packageTier === "ONE_WORLD" && game.sceneCount === 9, "integrity", "The staged package/config is incomplete");
  const config = GameConfigSchema.parse(JSON.parse(game.configJson));
  requireThat(fixedWorldConfigSha256(config) === record.configSha256 && config.gameId === gameId && config.child.name === child.displayName && config.locale === game.locale, "integrity", "Stored visual config differs from the reviewed world");
  requireThat(game.scenes.length === 9 && config.scenes.length === 9, "integrity", "Stored world is incomplete");
  const seenAssets = new Set<string>(), seenBoards = new Set<string>();
  for (let i = 0; i < 9; i++) {
    const scene = game.scenes[i]!, expected = record.scenes[i]!, rendered = config.scenes[i]!;
    requireThat(scene.sceneSlug === expected.slug && scene.sceneVersion === expected.sceneVersion && scene.configJson && fixedStageJsonSha256(JSON.parse(scene.configJson)) === expected.configSha256 && fixedStageJsonSha256(rendered) === expected.configSha256 && scene.targets.length === 3, "integrity", "Stored scene differs from its fixed staging record");
    const board = record.assets.find(asset => asset.role === "board" && rendered.art.base.split("?")[0] === `/api/assets/${asset.id}`);
    requireThat(board && !seenBoards.has(board.id) && rendered.art.thumbnail.split("?")[0] === `/api/assets/${board.id}`, "integrity", "Immutable original board binding changed");
    seenBoards.add(board.id);
    for (const target of rendered.targets) {
      const row = scene.targets.find(item => item.targetId === target.id), sprite = target.sprite;
      requireThat(row && row.adjustJson === null && row.spriteKind === "image" && row.variants.length === 1 && sprite.kind === "image" && target.spriteByVariant?.A?.kind === "image" && fixedStageJsonSha256(sprite) === fixedStageJsonSha256(target.spriteByVariant.A), "integrity", "A fixed target was adjusted, lost or replaced");
      const variant = row.variants[0]!;
      const asset = record.assets.find(item => item.id === variant.assetId && item.role === "sprite");
      requireThat(asset && variant.variant === "A" && variant.slotId === target.slots[0].id && row.slotAId === target.slots[0].id && row.slotBId === target.slots[1].id && row.spriteAssetId === asset.id && (variant.status === "GENERATED" || variant.status === "APPROVED") && !seenAssets.has(asset.id), "integrity", "Fixed A-only asset mapping changed");
      requireThat(sprite.url.split("?")[0] === `/api/assets/${asset.id}` && fixedWorldJsonSha256(JSON.parse(variant.rectJson ?? "null")) === fixedWorldJsonSha256(sprite.rect) && fixedWorldJsonSha256(JSON.parse(variant.hitRectJson ?? "null")) === fixedWorldJsonSha256(sprite.hitRect) && fixedWorldJsonSha256(JSON.parse(variant.headAnchorJson ?? "null")) === fixedWorldJsonSha256(sprite.anchor), "integrity", "Stored target geometry or URL changed");
      seenAssets.add(asset.id);
    }
  }
  requireThat(seenAssets.size === 27, "integrity", "Exactly 27 unique playable patches required");
  requireThat(sha256Bytes(await ownedAssetBytes(db, record.identityAssetId, record.ownerId, "PRIVATE", "IDENTITY_SHEET")) === record.identitySha256 && sha256Bytes(await ownedAssetBytes(db, record.avatarAssetId, record.ownerId, "GAME", "AVATAR")) === record.avatarSha256, "identity", "Referenced identity or avatar bytes changed");
  await checkInventory(db, record);
  return { game, job, record };
}

/**
 * Trusted operator/server boundary, not an HTTP JSON endpoint. Qualification
 * receipts must already be authenticated by their producer. No model is called.
 * The complete world is persisted atomically in DB storage; no legacy composer,
 * signed private source URL, live flag flip, automatic publication or partial
 * world is permitted. Uncertain commit acknowledgement is retried with the SAME
 * game/plan: exact records are verified, never replaced or paid for again.
 */
export async function stageQualifiedFixedWorld(c: Container, raw: FixedWorldMaterializerInput, actor: Actor): Promise<{ gameId: string; status: "MANUAL_REVIEW"; assetCount: number; reused: boolean }> {
  requireQaDb(c);
  const encodedBytes = [...raw.originalBoards.map(board => board.bytes), raw.identity.bytes, ...raw.sources.map(source => source.encodedPng), ...raw.appearances.flatMap(item => {
    requireThat("png" in item.foreground, "unsupported", "Staging requires compressed original masks to bound memory");
    return [item.foreground.png, item.reviewContext];
  })];
  requireThat(encodedBytes.reduce((sum, bytes) => sum + bytes.byteLength, 0) <= MAX_ENCODED_INPUT, "unsupported", "Encoded staging input exceeds the bounded world size");
  const input = structuredClone(raw);
  await requireAdmin(c, actor);
  const game = await c.db.game.findUnique({ where: { id: input.game.id }, include: { childProfile: true, scenes: { orderBy: { orderIndex: "asc" } } } });
  // Fixed games must be enrolled under this marker BEFORE any legacy work can
  // see them. Converting a legacy game here would race stale publish/delete calls.
  requireThat(game && game.styleVersion === FIXED_WORLD_STYLE_VERSION && !game.deletedAt && ["PAID", "QA_PENDING", "MANUAL_REVIEW"].includes(game.status) && game.ownerId && game.childProfile && !game.childProfile.deletedAt && game.ownerId === game.childProfile.ownerId && game.packageTier === "ONE_WORLD" && game.scenes.length === 9, "conflict", "Only an already enrolled, owned, nonplayable fixed one-world game can be staged");
  const child = game.childProfile, ownerId = game.ownerId;
  const enrollment = await checkEnrollment(c.db, game.id);
  requireThat(enrollment.planSha256 === input.planSha256 && enrollment.worldId === input.budget.worldId && enrollment.worldSlug === input.plan.world.slug && enrollment.worldVersion === input.plan.world.version && enrollment.worldDefinitionSha256 === input.plan.world.definitionSha256 && fixedWorldJsonSha256(enrollment.scenes) === fixedWorldJsonSha256(input.plan.boards.map(board => ({ slug: board.slug, sceneVersion: board.sceneVersion, definitionSha256: board.definitionSha256 }))), "conflict", "Qualified intent differs from original enrollment");
  requireThat(await c.db.game.count({ where: { childProfileId: child.id, deletedAt: null, NOT: { id: game.id } } }) === 0, "identity", "Fixed staging requires a dedicated child profile");
  requireThat(child.ageYears !== null && Number.isInteger(child.ageYears) && child.ageYears >= 2 && child.ageYears <= 10, "identity", "Fixed child needs a known age from 2 to 10");
  requireThat(child.avatarAssetId && child.identityAssetId && child.displayName === input.game.childName && input.game.styleVersion === FIXED_WORLD_STYLE_VERSION && game.locale === input.game.locale, "identity", "Fixed input does not match the game's child and locale");
  requireThat(fixedWorldJsonSha256(game.scenes.map(scene => [scene.sceneSlug, scene.sceneVersion])) === fixedWorldJsonSha256(input.plan.boards.map(board => [board.slug, board.sceneVersion])), "conflict", "Database scene order/version differs from the fixed plan");
  const identity = await ownedAssetBytes(c.db, child.identityAssetId, ownerId, "PRIVATE", "IDENTITY_SHEET");
  const avatar = await ownedAssetBytes(c.db, child.avatarAssetId, ownerId, "GAME", "AVATAR");
  requireThat(sha256Bytes(identity) === input.identity.sha256, "identity", "Input identity is not the child's owned identity sheet");
  await readPng(identity); await readPng(avatar);
  input.game.avatarUrl = signedAssetUrl(c, child.avatarAssetId);
  for (const item of input.appearances) item.exported.sprite.url = signedAssetUrl(c, fixedAssetId(game.id, input.planSha256, `sprite:${item.boardSlug}/${item.targetId}:${item.exported.rasterAsset.rgbaSha256}`));
  const materialized = await materializeFixedWorld(input);
  // Gift is editable user copy, not part of visual qualification.
  if (game.giftJson) materialized.config.gift = JSON.parse(game.giftJson);
  const config = GameConfigSchema.parse(materialized.config);
  const prepared: PreparedAsset[] = [];
  const addPng = async (key: string, role: "sprite" | "source" | "context" | "mask", bytes: Uint8Array, expectedRgba?: string) => {
    const decoded = await readPng(bytes);
    requireThat(!expectedRgba || decoded.rgbaSha256 === expectedRgba, "integrity", "Lossless PNG encoding changed the reviewed RGBA");
    const metadata: FixedStageAsset = { id: fixedAssetId(game.id, input.planSha256, key), role, visibility: role === "sprite" ? "GAME" : "PRIVATE", mimeType: "image/png", encodedSha256: sha256Bytes(bytes), ...decoded };
    prepared.push({ metadata, bytes: Buffer.from(bytes) }); return metadata.id;
  };
  // Serve the exact verified original bytes through immutable game-owned IDs.
  // A later replacement of a catalog URL cannot move these fixed hiding places.
  const originalBoardEvidence = [];
  for (const board of input.originalBoards) {
    const bytes = Buffer.from(board.bytes), meta = await sharp(bytes).metadata();
    requireThat(meta.format === "png" || meta.format === "webp" || meta.format === "jpeg", "unsupported", "Unsupported original board format");
    const raw = await sharp(bytes, { limitInputPixels: 16_777_216, failOn: "warning" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const encodedSha256 = sha256Bytes(bytes), id = fixedAssetId(game.id, input.planSha256, `board:${board.slug}:${encodedSha256}`);
    const metadata: FixedStageAsset = { id, role: "board", visibility: "GAME", mimeType: `image/${meta.format}`, encodedSha256, width: raw.info.width, height: raw.info.height, rgbaSha256: sha256Rgba(raw.data, raw.info.width, raw.info.height) };
    prepared.push({ metadata, bytes }); originalBoardEvidence.push({ boardSlug: board.slug, assetId: id, encodedSha256 });
    const scene = config.scenes.find(scene => scene.slug === board.slug)!;
    scene.art.base = signedAssetUrl(c, id); scene.art.thumbnail = scene.art.base;
  }
  for (const asset of materialized.assetWrites) {
    const png = await sharp(asset.rgba, { raw: { width: asset.width, height: asset.height, channels: 4 } }).png().toBuffer();
    await addPng(`sprite:${asset.boardSlug}/${asset.targetId}:${asset.rgbaSha256}`, "sprite", png, asset.rgbaSha256);
  }
  const sourceEvidence = [];
  for (const source of input.sources) {
    const { encodedPng: _bytes, ...metadata } = source;
    sourceEvidence.push({ ...metadata, assetId: await addPng(`source:${source.key}:${source.sourceImageSha256}`, "source", source.encodedPng, source.sourceRgbaSha256) });
  }
  const appearanceEvidence = [];
  for (const item of input.appearances) {
    requireThat("png" in item.foreground, "unsupported", "Compressed foreground required");
    appearanceEvidence.push({ boardSlug: item.boardSlug, targetId: item.targetId, sourceKey: item.sourceKey, reviews: item.reviews, exportProvenance: item.exported.provenance,
      maskAssetId: await addPng(`mask:${item.boardSlug}/${item.targetId}`, "mask", item.foreground.png, item.exported.provenance.placementMaskRgbaSha256 ?? undefined),
      contextAssetId: await addPng(`context:${item.boardSlug}/${item.targetId}`, "context", item.reviewContext) });
  }
  const bundle = Buffer.from(JSON.stringify({ version: "fixed-world-private-evidence/v1", plan: input.plan, planSha256: input.planSha256, provenance: materialized.provenance, boards: originalBoardEvidence, sources: sourceEvidence, appearances: appearanceEvidence }));
  prepared.push({ bytes: bundle, metadata: { id: fixedAssetId(game.id, input.planSha256, "provenance"), role: "provenance", visibility: "PRIVATE", mimeType: "application/json", width: null, height: null, encodedSha256: sha256Bytes(bundle) } });
  requireThat(prepared.reduce((sum, asset) => sum + asset.bytes.length, 0) <= MAX_ENCODED_INPUT, "unsupported", "Prepared world exceeds atomic storage size limit");
  const now = new Date(), record = fixedWorldStageRecordSchema.parse({ version: "fixed-world-stage/v1", status: "done", state: "staged", startedAt: now.toISOString(), finishedAt: now.toISOString(), gameId: game.id, ownerId, childProfileId: child.id,
    childAgeYears: child.ageYears, worldId: input.budget.worldId, planSha256: input.planSha256, budgetSnapshotSha256: input.budget.snapshotSha256, configSha256: fixedWorldConfigSha256(config), identityAssetId: child.identityAssetId, identitySha256: sha256Bytes(identity), avatarAssetId: child.avatarAssetId, avatarSha256: sha256Bytes(avatar),
    assets: prepared.map(asset => asset.metadata), scenes: config.scenes.map((scene, i) => ({ slug: scene.slug, sceneVersion: input.plan.boards[i]!.sceneVersion, configSha256: fixedStageJsonSha256(scene) })) });
  const budget = await safeBudget(c, record.worldId, record.budgetSnapshotSha256);
  return c.db.$transaction(async tx => {
    requireThat(fixedWorldJsonSha256(await checkEnrollment(tx, game.id)) === fixedWorldJsonSha256(enrollment), "conflict", "Enrollment changed during staging");
    const current = await tx.game.findUnique({ where: { id: game.id }, include: { childProfile: true, scenes: { orderBy: { orderIndex: "asc" }, include: { targets: true } } } });
    requireThat(current && current.styleVersion === FIXED_WORLD_STYLE_VERSION && !current.deletedAt && current.ownerId === ownerId && current.childProfileId === child.id && current.childProfile?.avatarAssetId === child.avatarAssetId && current.childProfile.identityAssetId === child.identityAssetId && !current.childProfile.deletedAt && current.childProfile.displayName === child.displayName && current.packageTier === "ONE_WORLD" && ["PAID", "QA_PENDING", "MANUAL_REVIEW"].includes(current.status), "conflict", "Game changed during staging");
    requireThat(await tx.game.count({ where: { childProfileId: child.id, deletedAt: null, NOT: { id: game.id } } }) === 0, "identity", "Another game now shares the fixed child profile");
    requireThat(current.childProfile.ownerId === ownerId && current.childProfile.ageYears === child.ageYears && current.locale === game.locale && current.updatedAt.getTime() === game.updatedAt.getTime() && fixedWorldJsonSha256(current.scenes.map(scene => [scene.sceneSlug, scene.sceneVersion])) === fixedWorldJsonSha256(game.scenes.map(scene => [scene.sceneSlug, scene.sceneVersion])), "conflict", "Game, child or pinned route changed during preparation");
    const jobId = `job_${game.id}`, jobs = await tx.generationJob.findMany({ where: { gameId: game.id } });
    requireThat(jobs.every(job => job.id === jobId && job.status !== "RUNNING"), "conflict", "An active or alternate generation job prevents staging");
    const job = jobs[0], previous = job ? readFixedWorldStage(job.stepsJson) : null;
    if (previous) {
      requireThat(previous.planSha256 === record.planSha256 && previous.configSha256 === record.configSha256 && fixedWorldJsonSha256(previous.assets) === fixedWorldJsonSha256(record.assets), "conflict", "A different fixed world is already staged");
      const gameFence = await tx.game.updateMany({ where: { id: game.id, updatedAt: current.updatedAt, deletedAt: null, status: current.status, styleVersion: FIXED_WORLD_STYLE_VERSION }, data: { updatedAt: new Date() } });
      requireThat(gameFence.count === 1, "conflict", "Idempotent staging game fence was lost");
      const jobFence = await tx.generationJob.updateMany({ where: { id: job!.id, status: "DONE", stepsJson: job!.stepsJson }, data: { updatedAt: new Date() } });
      requireThat(jobFence.count === 1, "conflict", "Idempotent staging job fence was lost");
      await checkStoredGame(tx, game.id); await fenceBudget(tx, record.worldId, budget.revision, record.budgetSnapshotSha256);
      return { gameId: game.id, status: "MANUAL_REVIEW" as const, assetCount: record.assets.length, reused: true };
    }
    requireThat(!current.configJson && current.scenes.every(scene => scene.targets.length === 0), "conflict", "Existing configs or legacy targets cannot be overwritten");
    // Acquire the same Game and deterministic job rows used by deletion/workers.
    const claimed = await tx.game.updateMany({ where: { id: game.id, updatedAt: current.updatedAt, deletedAt: null, status: current.status, styleVersion: current.styleVersion }, data: { styleVersion: FIXED_WORLD_STYLE_VERSION, status: "MANUAL_REVIEW", lastError: null } });
    requireThat(claimed.count === 1, "conflict", "Game staging fence was lost");
    if (job) {
      const claimedJob = await tx.generationJob.updateMany({ where: { id: job.id, status: job.status, stepsJson: job.stepsJson }, data: { status: "DONE", currentStep: null, lastError: null, stepsJson: JSON.stringify({ fixedEnrollment: enrollment, fixedWorld: record }) } });
      requireThat(claimedJob.count === 1, "conflict", "Generation job staging fence was lost");
    } else throw new FixedWorldStageError("integrity", "Enrollment job disappeared before staging");
    await fenceBudget(tx, record.worldId, budget.revision, record.budgetSnapshotSha256);
    for (const asset of prepared) {
      const a = asset.metadata;
      // Create, never upsert: colliding IDs/keys abort the whole transaction.
      // Qualified replay evidence lives with this game, not on the 14-day
      // rejected-patch clock. The atomic game deleter owns its entire inventory.
      await tx.asset.create({ data: { id: a.id, ownerId, type: a.role === "sprite" ? "TARGET_SPRITE" : a.role === "board" ? "BOARD_ART" : "FIXED_WORLD_EVIDENCE", visibility: a.visibility, storagePath: fixedStageStoragePath(a), mimeType: a.mimeType, width: a.width, height: a.height, bytes: asset.bytes.length, provider: "fixed-sprite-v3", costCents: 0 } });
      await tx.fileBlob.create({ data: { key: fixedStageStoragePath(a), contentType: a.mimeType, data: new Uint8Array(asset.bytes) } });
    }
    for (const [i, scene] of config.scenes.entries()) {
      const gs = current.scenes[i]!;
      await tx.gameScene.update({ where: { id: gs.id }, data: { configJson: JSON.stringify(scene), generationStatus: "QA_OK" } });
      for (const target of scene.targets) {
        requireThat(target.sprite.kind === "image", "integrity", "A staged target cannot fall back");
        const sprite = target.sprite, assetId = sprite.url.split("?")[0]!.split("/").at(-1)!;
        const targetId = rowId("tgt", game.id, scene.slug, target.id);
        await tx.targetInstance.create({ data: { id: targetId, gameSceneId: gs.id, targetId: target.id, targetType: target.targetType, spriteKind: "image", spriteAssetId: assetId, slotAId: target.slots[0].id, slotBId: target.slots[1].id, status: "GENERATED" } });
        await tx.targetVariantAsset.create({ data: { id: rowId("tva", targetId, "A"), targetInstanceId: targetId, variant: "A", slotId: target.slots[0].id, assetId, rectJson: JSON.stringify(sprite.rect), hitRectJson: JSON.stringify(sprite.hitRect), headAnchorJson: JSON.stringify(sprite.anchor), provider: "fixed-sprite-v3", status: "GENERATED",
          judgeJson: JSON.stringify({ version: "fixed-world-stage/v1", verdict: "ok", reason: "Qualified exact board-raster and browser receipts; final game awaits manual QA", planSha256: record.planSha256 }) } });
      }
    }
    await tx.game.update({ where: { id: game.id }, data: { configJson: JSON.stringify(config), sceneCount: 9 } });
    await checkStoredGame(tx, game.id);
    await auditTx(tx, actor, game.id, "fixed-world:staged", { planSha256: record.planSha256, assetCount: record.assets.length, automaticRelease: false });
    if (current.status !== "MANUAL_REVIEW") await auditTx(tx, actor, game.id, `status:${current.status}->MANUAL_REVIEW`, { reason: "fixed-world-manual-qa" });
    return { gameId: game.id, status: "MANUAL_REVIEW" as const, assetCount: record.assets.length, reused: false };
  }, transactionOptions);
}

/** Final manual gate. All authorization, privacy deletion and READY state share one DB transaction. */
export async function approveFixedWorldForPublication(c: Container, gameId: string, actor: Actor): Promise<void> {
  requireQaDb(c); await requireAdmin(c, actor);
  const checked = await checkStoredGame(c.db, gameId), { record } = checked;
  const budget = await safeBudget(c, record.worldId, record.budgetSnapshotSha256);
  await c.db.$transaction(async tx => {
    const { game, job, record: fresh } = await checkStoredGame(tx, gameId);
    requireThat(fixedWorldJsonSha256(fresh) === fixedWorldJsonSha256(record) && ["QA_PENDING", "MANUAL_REVIEW", "READY", "DELIVERED"].includes(game.status), "conflict", "Fixed world changed or cannot be published");
    const fenced = await tx.game.updateMany({ where: { id: gameId, updatedAt: game.updatedAt, deletedAt: null, styleVersion: FIXED_WORLD_STYLE_VERSION, status: game.status }, data: { updatedAt: new Date() } });
    requireThat(fenced.count === 1, "conflict", "Fixed publication fence was lost");
    const jobFence = await tx.generationJob.updateMany({ where: { id: job.id, status: "DONE", stepsJson: job.stepsJson }, data: { updatedAt: new Date() } });
    requireThat(jobFence.count === 1, "conflict", "Fixed publication job changed");
    await fenceBudget(tx, record.worldId, budget.revision, record.budgetSnapshotSha256);
    if (game.status === "READY" || game.status === "DELIVERED") return;
    const child = game.childProfile!;
    if (!child.retainOriginalPhoto && child.originalPhotoAssetId) {
      const photo = await tx.asset.findUnique({ where: { id: child.originalPhotoAssetId } });
      requireThat(photo && photo.ownerId === record.ownerId && photo.type === "ORIGINAL_PHOTO" && photo.visibility === "PRIVATE", "identity", "Original-photo deletion binding is invalid");
      await tx.fileBlob.deleteMany({ where: { key: photo.storagePath } });
      await tx.asset.update({ where: { id: photo.id }, data: { status: "DELETED", deletedAt: new Date() } });
      await tx.childProfile.update({ where: { id: child.id }, data: { originalPhotoAssetId: null } });
      await auditTx(tx, actor, gameId, "photo:deleted-after-qa", { childProfileId: child.id });
    }
    if (game.status === "MANUAL_REVIEW") await auditTx(tx, actor, gameId, "status:MANUAL_REVIEW->QA_PENDING");
    await auditTx(tx, actor, gameId, "status:QA_PENDING->APPROVED");
    await auditTx(tx, actor, gameId, "status:APPROVED->READY");
    await tx.game.update({ where: { id: gameId }, data: { status: "READY", readyAt: new Date(), lastError: null } });
  }, transactionOptions);
}

/** DB-only deletion uses the same Game/job fence; a failed transaction leaves no partial purge. */
export async function deleteFixedWorldGame(c: Container, gameId: string, actor: Actor, userId?: string): Promise<boolean> {
  requireQaDb(c);
  if (actor.type === "ADMIN") await requireAdmin(c, actor);
  else requireThat(actor.type === "USER" && userId === actor.id && !!userId, "permission", "Deletion requires the owner or an authenticated administrator");
  return c.db.$transaction(async tx => {
    const game = await tx.game.findFirst({ where: { id: gameId, ...(userId ? { ownerId: userId } : {}) }, include: { childProfile: true, scenes: { include: { targets: { include: { variants: true } } } } } });
    if (!game || game.status === "DELETED" || game.deletedAt) return false;
    requireThat(isFixedWorldStyle(game.styleVersion), "unsupported", "Not a fixed-engine game");
    const job = await tx.generationJob.findUnique({ where: { id: `job_${gameId}` } });
    const stagedRecord = job ? readFixedWorldStage(job.stepsJson) : null;
    const enrollment = job ? readFixedWorldEnrollment(job.stepsJson) : null;
    const record = stagedRecord ?? (enrollment ? { ...enrollment, assets: [] as FixedStageAsset[] } : null);
    requireThat(record && record.gameId === gameId && record.ownerId === game.ownerId && record.childProfileId === game.childProfileId, "integrity", "Deletion requires the game's complete ownership capsule");
    requireThat(enrollment && enrollment.gameId === gameId && enrollment.ownerId === game.ownerId && enrollment.childProfileId === game.childProfileId, "integrity", "Deletion requires original enrollment ownership");
    if (!stagedRecord) requireThat(game.styleVersion === FIXED_WORLD_STYLE_VERSION && game.status === "QA_PENDING" && !game.configJson && game.scenes.length === 9 && game.scenes.every(scene => !scene.configJson && scene.targets.length === 0) && job?.status === "DONE", "integrity", "An unstaged game must remain the empty enrolled world");
    const claimed = await tx.game.updateMany({ where: { id: gameId, updatedAt: game.updatedAt, deletedAt: null, status: game.status }, data: { status: "DELETED", deletedAt: new Date(), configJson: null } });
    requireThat(claimed.count === 1, "conflict", "Deletion fence was lost");
    if (job) {
      const claimJob = await tx.generationJob.updateMany({ where: { id: job.id, stepsJson: job.stepsJson, status: job.status }, data: { status: "DONE", currentStep: null, stepsJson: "{}", lastError: null } });
      requireThat(claimJob.count === 1, "conflict", "Deletion job fence was lost");
    }
    const ids = new Set(record.assets.map(asset => asset.id));
    for (const scene of game.scenes) for (const target of scene.targets) {
      requireThat(!target.spriteAssetId || ids.has(target.spriteAssetId), "integrity", "Target deletion pointer is outside this game's capsule");
      for (const variant of target.variants) requireThat(!variant.assetId || ids.has(variant.assetId), "integrity", "Variant deletion pointer is outside this game's capsule");
      await tx.targetVariantAsset.updateMany({ where: { targetInstanceId: target.id }, data: { assetId: null, rejectedAssetIdsJson: null, usageJson: null, judgeJson: null } });
      await tx.targetInstance.update({ where: { id: target.id }, data: { spriteAssetId: null } });
    }
    if (game.childProfile) {
      const child = game.childProfile, shared = await tx.game.count({ where: { childProfileId: child.id, deletedAt: null, NOT: { id: gameId } } });
      if (!shared) {
        requireThat(child.ownerId === game.ownerId && child.avatarAssetId === record.avatarAssetId && child.identityAssetId === record.identityAssetId, "identity", "Child deletion pointers changed");
        requireThat(!child.originalPhotoAssetId || child.originalPhotoAssetId === enrollment.originalPhoto?.id, "identity", "Photo deletion pointer changed from enrollment");
        for (const id of [child.avatarAssetId, child.identityAssetId, child.originalPhotoAssetId]) if (id) ids.add(id);
        // The enrollment inventory is authoritative even if a later pointer was
        // cleared. Approved photo cleanup leaves a DELETED metadata row, which
        // is harmless to purge again; an unexpected null must not orphan bytes.
        if (enrollment.originalPhoto) ids.add(enrollment.originalPhoto.id);
        await tx.childProfile.update({ where: { id: child.id }, data: { avatarAssetId: null, identityAssetId: null, originalPhotoAssetId: null, photoCropJson: null, deletedAt: new Date() } });
      }
    }
    for (const id of ids) {
      const asset = await tx.asset.findUnique({ where: { id } });
      requireThat(asset && asset.ownerId === game.ownerId, "identity", "Deletion asset ownership mismatch");
      const recorded = record.assets.find(item => item.id === id);
      if (recorded) requireThat(asset.storagePath === fixedStageStoragePath(recorded) && asset.visibility === recorded.visibility && asset.mimeType === recorded.mimeType, "integrity", "Deletion asset path or metadata changed");
      else {
        const expectedType = id === record.avatarAssetId ? "AVATAR" : id === record.identityAssetId ? "IDENTITY_SHEET" : "ORIGINAL_PHOTO";
        requireThat(asset.type === expectedType && asset.visibility === (expectedType === "AVATAR" ? "GAME" : "PRIVATE"), "identity", "Child deletion asset type changed");
        requireThat(await tx.asset.count({ where: { storagePath: asset.storagePath, NOT: { id } } }) === 0, "integrity", "Child deletion storage path is shared");
        const expectedPath = id === enrollment.avatarAssetId ? enrollment.avatarStoragePath : id === enrollment.identityAssetId ? enrollment.identityStoragePath : enrollment.originalPhoto?.storagePath;
        requireThat(asset.storagePath === expectedPath && await tx.childProfile.count({ where: { NOT: { id: game.childProfileId! }, OR: [{ avatarAssetId: id }, { identityAssetId: id }, { originalPhotoAssetId: id }] } }) === 0, "identity", "Child deletion asset is shared or its path changed");
      }
      await tx.fileBlob.deleteMany({ where: { key: asset.storagePath } });
      await tx.asset.update({ where: { id }, data: { status: "DELETED", deletedAt: new Date() } });
    }
    await tx.gameScene.updateMany({ where: { gameId }, data: { configJson: null } });
    await tx.shareLink.updateMany({ where: { gameId, active: true }, data: { active: false, revokedAt: new Date() } });
    await auditTx(tx, actor, gameId, `status:${game.status}->DELETED`, { fixedAssetsPurged: ids.size });
    return true;
  }, transactionOptions);
}
