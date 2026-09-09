import { Prisma } from "@prisma/client";
import sharp from "sharp";
import { z } from "zod";
import type { Container } from "../container";
import type { Actor } from "../audit.service";
import { env } from "../../lib/env";
import { newId } from "../../lib/ids";
import { PrismaWorldBudgetStore, WORLD_BUDGET_LEDGER_SCHEMA_VERSION } from "../../infra/db/prisma-world-budget-store";
import { sha256Bytes } from "./fixed-sprite";
import { fixedWorldJsonSha256, validateFrozenFixedWorldIntent, type FixedWorldIntentInput } from "./fixed-world-materializer";
import { WORLD_BUDGET_CAP_MICRO_USD, type WorldBudgetSnapshot } from "./world-budget";
import {
  FIXED_WORLD_STYLE_VERSION, fixedStageAssert as requireThat,
  fixedWorldEnrollmentRecordSchema, readFixedWorldEnrollment, type FixedWorldEnrollmentRecord,
} from "./fixed-world-stage-record";

export interface FixedWorldEnrollmentInput extends FixedWorldIntentInput {
  gameId: string;
  childProfileId: string;
  locale: "he" | "en";
}
export interface FixedWorldEnrollmentResult {
  gameId: string; worldId: string; status: "QA_PENDING"; reused: boolean;
}
type Tx = Prisma.TransactionClient;
const identifiers = z.object({
  gameId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  childProfileId: z.string().trim().min(1).max(200), locale: z.enum(["he", "en"]),
});
const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 16_777_216;
const sceneId = (gameId: string, slug: string) => `gsc_fixed_${fixedWorldJsonSha256([gameId, slug])}`;

async function requireAdmin(db: Pick<Tx, "user">, actor: Actor, whitelist: readonly string[]) {
  requireThat(actor.type === "ADMIN" && typeof actor.id === "string" && actor.id.trim(), "permission", "An authenticated manual administrator is required");
  const user = await db.user.findUnique({ where: { id: actor.id }, select: { email: true } });
  requireThat(user && whitelist.includes(user.email.trim().toLowerCase()), "permission", "The enrolling administrator is not authorized");
}

/** Read the actual DB bytes, not a signer, storage path assertion or caller hash. */
async function ownedImage(tx: Tx, id: string, ownerId: string, type: "IDENTITY_SHEET" | "AVATAR" | "ORIGINAL_PHOTO") {
  const visibility = type === "AVATAR" ? "GAME" : "PRIVATE";
  const row = await tx.asset.findUnique({ where: { id } });
  requireThat(row && row.ownerId === ownerId && row.status === "READY" && !row.deletedAt && row.type === type && row.visibility === visibility && row.storagePath.trim(), "identity", "Child image metadata is missing, deleted, shared or not owned");
  requireThat(type === "ORIGINAL_PHOTO" ? /^image\/(png|jpeg|webp)$/.test(row.mimeType) : row.mimeType === "image/png", "identity", "Identity and avatar must be PNG; original photo must use a supported image format");
  const blob = await tx.fileBlob.findUnique({ where: { key: row.storagePath } });
  requireThat(blob && blob.contentType === row.mimeType && row.bytes === blob.data.byteLength && blob.data.byteLength > 0 && blob.data.byteLength <= MAX_IMAGE_BYTES, "storage", "Child image bytes are missing, oversized or inconsistent");
  const bytes = Buffer.from(blob.data);
  const metadata = await sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "warning" }).metadata();
  requireThat(`image/${metadata.format}` === row.mimeType && (metadata.pages ?? 1) === 1 && metadata.width === row.width && metadata.height === row.height, "integrity", "Child image format/frame differs from its stored metadata");
  requireThat(type === "ORIGINAL_PHOTO" || (metadata.orientation ?? 1) === 1, "integrity", "Illustrated identity and avatar must be unrotated PNGs");
  // Decode one bounded image at a time; a valid header alone does not prove a
  // truncated/corrupt PNG is a ready identity. No image pixels are rewritten.
  await sharp(bytes, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "warning" }).raw().toBuffer();
  const metadataFence = await tx.asset.updateMany({ where: {
    id, ownerId, status: "READY", deletedAt: null, type, visibility,
    storagePath: row.storagePath, mimeType: row.mimeType, bytes: row.bytes, width: row.width, height: row.height,
  }, data: { status: "READY" } });
  const blobFence = await tx.fileBlob.updateMany({ where: { key: row.storagePath, contentType: row.mimeType, data: bytes }, data: { contentType: row.mimeType } });
  requireThat(metadataFence.count === 1 && blobFence.count === 1, "conflict", "Child asset changed during enrollment");
  return { id, sha256: sha256Bytes(bytes), storagePath: row.storagePath, mimeType: row.mimeType };
}

/**
 * Operator/server-only QA bootstrap, deliberately NOT an HTTP/checkout route.
 * This creates intent, not qualified sprites, payment, model permission or a
 * playable world. Identity's prior cost must still be imported/qualified by the
 * later world pipeline; an empty enrollment ledger is not a claim it was free.
 *
 * Only transactional DB storage is supported. Child write fencing precedes
 * sibling/alias predicates and Serializable also protects their phantom reads.
 * On conflict or uncertain COMMIT acknowledgement, propagate the error. Never
 * compensate by deleting a game/asset or clearing a ledger: use the SAME game
 * and intent for an explicit retry. Replay is limited to the pre-staging state.
 */
export async function enrollFixedWorld(c: Container, raw: FixedWorldEnrollmentInput, actor: Actor): Promise<FixedWorldEnrollmentResult> {
  const input = structuredClone(raw), operator = structuredClone(actor);
  const whitelist = (c.adminEmails ?? []).map(email => email.trim().toLowerCase());
  requireThat(process.env.NODE_ENV === "test" || env().APP_ENV === "qa", "unsupported", "Fixed-world enrollment is QA-only");
  requireThat(c.storage.id === "db", "unsupported", "Fixed-world enrollment requires transactional DB storage");
  const ids = identifiers.safeParse(input);
  requireThat(ids.success && ids.data.childProfileId === input.childProfileId, "integrity", "Invalid enrollment identifiers or locale");
  await requireAdmin(c.db, operator, whitelist);
  const { plan, world } = validateFrozenFixedWorldIntent(input);
  const worldId = `${input.gameId}:${world.slug}`;
  const initialBudget: WorldBudgetSnapshot = { worldId, requests: [] };
  // Strict primary-ledger decoding without an unsafe cast of a transaction to
  // the paid-dispatch store. The exact revision/snapshot is rechecked below.
  const priorBudget = await new PrismaWorldBudgetStore(c.db).read(worldId);
  return c.db.$transaction(async tx => {
    await requireAdmin(tx, operator, whitelist);
    const child = await tx.childProfile.findUnique({ where: { id: input.childProfileId } });
    requireThat(child && !child.deletedAt && child.ownerId && child.ageYears !== null && Number.isInteger(child.ageYears) && child.ageYears >= 2 && child.ageYears <= 10 && child.identityAssetId && child.avatarAssetId, "identity", "A live owned child with known age 2–10 and ready identity/avatar is required");
    requireThat(child.displayName === child.displayName.trim() && child.displayName.length >= 2 && child.displayName.length <= 80, "identity", "Child display name must already be canonical; enrollment never silently renames a profile");
    // Take the profile write lock BEFORE asking whether another game claims it.
    // ChildProfile has no updatedAt, so all mutable enrollment bindings are CAS.
    const profileFence = await tx.childProfile.updateMany({ where: {
      id: child.id, ownerId: child.ownerId, deletedAt: null, ageYears: child.ageYears,
      displayName: child.displayName, identityAssetId: child.identityAssetId, avatarAssetId: child.avatarAssetId,
      originalPhotoAssetId: child.originalPhotoAssetId, retainOriginalPhoto: child.retainOriginalPhoto,
    }, data: { identityAssetId: child.identityAssetId } });
    requireThat(profileFence.count === 1, "conflict", "Child profile changed during enrollment");
    requireThat(await tx.game.count({ where: { childProfileId: child.id, deletedAt: null, NOT: { id: input.gameId } } }) === 0, "identity", "A fixed world requires a dedicated child with no other nondeleted games");
    const identity = await ownedImage(tx, child.identityAssetId, child.ownerId, "IDENTITY_SHEET");
    const avatar = await ownedImage(tx, child.avatarAssetId, child.ownerId, "AVATAR");
    const originalPhoto = child.originalPhotoAssetId ? await ownedImage(tx, child.originalPhotoAssetId, child.ownerId, "ORIGINAL_PHOTO") : null;
    requireThat(identity.sha256 === plan.identitySha256, "identity", "The owned identity bytes differ from the frozen plan");
    const assetIds = [identity.id, avatar.id, ...(originalPhoto ? [originalPhoto.id] : [])];
    const paths = [identity.storagePath, avatar.storagePath, ...(originalPhoto ? [originalPhoto.storagePath] : [])];
    requireThat(new Set(assetIds).size === assetIds.length && new Set(paths).size === paths.length, "identity", "Child image roles must not alias each other");
    requireThat(await tx.childProfile.count({ where: { NOT: { id: child.id }, OR: [
      { avatarAssetId: { in: assetIds } }, { identityAssetId: { in: assetIds } }, { originalPhotoAssetId: { in: assetIds } },
    ] } }) === 0, "identity", "Child image pointers are shared with another profile");
    requireThat(await tx.asset.count({ where: { storagePath: { in: paths }, NOT: { id: { in: assetIds } } } }) === 0, "identity", "Child image storage is shared with another asset");

    const game = await tx.game.findUnique({ where: { id: input.gameId }, include: { scenes: { orderBy: { orderIndex: "asc" }, include: { targets: true } }, jobs: true } });
    const ledger = await tx.worldBudgetLedger.findUnique({ where: { worldId } });
    const expected = {
      version: "fixed-world-enrollment/v1" as const, status: "done" as const, state: "enrolled" as const,
      gameId: input.gameId, ownerId: child.ownerId, childProfileId: child.id, childAgeYears: child.ageYears, childDisplayName: child.displayName, locale: input.locale,
      planSha256: input.planSha256, worldId, worldSlug: world.slug, worldVersion: world.version, worldDefinitionSha256: plan.world.definitionSha256,
      scenes: plan.boards.map(board => ({ slug: board.slug, sceneVersion: board.sceneVersion, definitionSha256: board.definitionSha256 })),
      identityAssetId: identity.id, identitySha256: identity.sha256, identityStoragePath: identity.storagePath,
      avatarAssetId: avatar.id, avatarSha256: avatar.sha256, avatarStoragePath: avatar.storagePath, originalPhoto,
      budgetCapMicroUsd: WORLD_BUDGET_CAP_MICRO_USD, initialBudgetSnapshotSha256: fixedWorldJsonSha256(initialBudget),
    };
    if (game) {
      requireThat(game.styleVersion === FIXED_WORLD_STYLE_VERSION && game.status === "QA_PENDING" && !game.deletedAt && game.ownerId === child.ownerId && game.childProfileId === child.id && game.locale === input.locale && game.packageTier === "ONE_WORLD" && game.sceneCount === 9 && game.configJson === null && game.paidAt === null && game.readyAt === null && game.deliveredAt === null && game.draftToken === null, "conflict", "Existing game is not the same pre-staging enrollment");
      const job = game.jobs[0];
      requireThat(game.jobs.length === 1 && job && job.id === `job_${game.id}` && job.status === "DONE" && job.currentStep === null && job.attempts === 0 && job.lastError === null, "conflict", "Enrollment job is missing, modified or active");
      const record = readFixedWorldEnrollment(job.stepsJson);
      requireThat(record && Object.keys(JSON.parse(job.stepsJson)).length === 1, "integrity", "A complete unmixed enrollment capsule is required");
      const comparison = fixedWorldEnrollmentRecordSchema.parse({ ...expected, createdAt: record.createdAt });
      requireThat(fixedWorldJsonSha256(record) === fixedWorldJsonSha256(comparison), "conflict", "The frozen enrollment intent or child image binding changed");
      requireThat(game.scenes.length === 9 && game.scenes.every((scene, i) => {
        const pin = record.scenes[i]!;
        return scene.id === sceneId(game.id, pin.slug) && scene.sceneSlug === pin.slug && scene.sceneVersion === pin.sceneVersion && scene.orderIndex === i && scene.generationStatus === "PENDING" && scene.configJson === null && scene.targets.length === 0;
      }), "integrity", "Enrolled scene pins or empty target state changed");
      requireThat(await tx.order.count({ where: { gameId: game.id } }) === 0 && await tx.shareLink.count({ where: { gameId: game.id } }) === 0, "conflict", "Enrollment cannot adopt commerce or player links");
      requireThat(priorBudget && ledger && ledger.schemaVersion === WORLD_BUDGET_LEDGER_SCHEMA_VERSION && ledger.revision === priorBudget.revision && fixedWorldJsonSha256(JSON.parse(ledger.snapshotJson)) === fixedWorldJsonSha256(priorBudget.snapshot), "budget", "Enrollment ledger is missing or changed; it will never be recreated");
      // No ledger writes here: settled bills, pending reservations, unknown
      // holds and even an over-cap audit all remain exactly as stored.
      return { gameId: game.id, worldId, status: "QA_PENDING", reused: true };
    }
    requireThat(!ledger && !priorBudget, "budget", "An existing orphan ledger cannot be adopted or reset");
    const record: FixedWorldEnrollmentRecord = fixedWorldEnrollmentRecordSchema.parse({ ...expected, createdAt: new Date().toISOString() });
    await tx.game.create({ data: { id: input.gameId, ownerId: child.ownerId, childProfileId: child.id, packageTier: "ONE_WORLD", sceneCount: 9, styleVersion: FIXED_WORLD_STYLE_VERSION, locale: input.locale, status: "QA_PENDING" } });
    for (const [index, board] of plan.boards.entries()) await tx.gameScene.create({ data: { id: sceneId(input.gameId, board.slug), gameId: input.gameId, sceneSlug: board.slug, sceneVersion: board.sceneVersion, orderIndex: index, generationStatus: "PENDING" } });
    await tx.generationJob.create({ data: { id: `job_${input.gameId}`, gameId: input.gameId, status: "DONE", stepsJson: JSON.stringify({ fixedEnrollment: record }) } });
    await tx.worldBudgetLedger.create({ data: { worldId, schemaVersion: WORLD_BUDGET_LEDGER_SCHEMA_VERSION, revision: 0, snapshotJson: JSON.stringify(initialBudget) } });
    await tx.auditLog.create({ data: { id: newId("aud"), actorType: operator.type, actorId: "id" in operator ? operator.id : null, action: "fixed_world.enrolled", entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify({ planSha256: input.planSha256, worldId, automaticRelease: false, paidDispatchAuthorized: false }) } });
    return { gameId: input.gameId, worldId, status: "QA_PENDING", reused: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 30_000 });
}
