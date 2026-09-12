import { Prisma } from "@prisma/client";
import { z } from "zod";
import sharp from "sharp";
import type { Container } from "../container";
import type { Actor } from "../audit.service";
import { env } from "../../lib/env";
import { normalizeChildName } from "../../lib/copy";
import { priceFor } from "../../domain/package";
import { localPatchBoardsForVersion, LOCAL_PATCH_STRICT_SCENE_VERSION } from "../../domain/scene/local-patch-catalog";
import { sceneBySlug } from "../scene-catalog.service";
import { DbStorage } from "../../infra/storage/db";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { auditWorldBudget } from "./world-budget";
import { boardConditioningHash } from "./board-conditioned-source";
import { readBoardConditionedCatalog } from "./board-conditioned-catalog";
import { boardWizardWorldId } from "./board-conditioned-wizard";
import { identityGateReceiptSchema, identityReceiptReadyForPublication, IDENTITY_GATE_ACTION, IDENTITY_GATE_KEY } from "./board-wizard-identity-gate";
import { avatarDisplayFromSheet } from "../../infra/generation/avatar-cut";
import { sha256Bytes } from "./fixed-sprite";
import { transitionGame } from "../game-status";

export const CANONICAL_IDENTITY_REUSE_ACTION = "local-patch:canonical-identity-reused";
export const CANONICAL_IDENTITY_REUSE_CONFIRMATION = "create-new-qa-game-with-this-exact-illustrated-identity";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const recordSchema = z.object({
  version: z.literal("canonical-identity-reuse/v1"), requestId: z.string(), operatorId: z.string(),
  sourceGameId: z.string(), sourceChildId: z.string(), sourceIdentityAssetId: z.string(), sourceContentVersion: z.number().int(),
  sourcePaidOrderId: z.string(), sourcePaintedJson: z.string(), sourceGateJson: z.string(), sourceLedgerSha256: digest,
  gameId: z.string(), childId: z.string(), ownerId: z.string(), displayName: z.string(), ageYears: z.number().int().min(2).max(10),
  identityAssetId: z.string(), identitySha256: digest, avatarAssetId: z.string(), avatarSha256: digest,
  catalogSha256: digest, cropJson: z.string().nullable(), contentVersion: z.literal(8),
  newIdentityChargeMicroUsd: z.literal(0), authorization: z.literal(CANONICAL_IDENTITY_REUSE_CONFIRMATION),
}).strict();
type ReuseRecord = z.infer<typeof recordSchema>;
function demand(value: unknown, reason: string): asserts value { if (!value) throw new Error(`IDENTITY_REUSE: ${reason}`); }
const recordId = (gameId: string) => `aud_lpir_${sha256Bytes(Buffer.from(gameId)).slice(0, 32)}`;
const idPart = (value: unknown) => sha256Bytes(Buffer.from(JSON.stringify(value))).slice(0, 28);

async function requireAdmin(c: Container, actor: Actor) {
  demand(env().APP_ENV === "qa" && c.storage.id === "db" && c.payment.id === "mock", "Only database-backed QA with sandbox checkout may clone an identity");
  demand(actor.type === "ADMIN", "Authenticated administrator required");
  const operator = await c.db.user.findUnique({ where: { id: actor.id } });
  demand(operator && c.adminEmails?.some(email => email.trim().toLowerCase() === operator.email.toLowerCase()), "Administrator is not authorized");
  return actor.id;
}

/** Validated once at adoption; the frozen proof then belongs to the new game.
 * Deleting the old game later must not erase a legitimately copied identity. */
async function inspectSource(c: Container, sourceGameId: string, expectedIdentityAssetId: string) {
  const source = await c.db.game.findUniqueOrThrow({ where: { id: sourceGameId }, include: { childProfile: true, orders: true, scenes: true, owner: true } });
  const child = source.childProfile;
  demand(!source.deletedAt && ["READY", "DELIVERED"].includes(source.status) && source.styleVersion === "local-patch-world-v1"
    && source.ownerId && source.owner && source.paidAt && child && !child.deletedAt && child.ownerId === source.ownerId
    && child.identityAssetId === expectedIdentityAssetId && child.ageYears, "Source must be a delivered owned game with the explicitly selected identity");
  const paid = source.orders.find(order => order.userId === source.ownerId && order.paymentStatus === "PAID" && order.paidAt && !order.refundedAt);
  demand(paid && !source.orders.some(order => order.paymentStatus === "REFUNDED" || order.refundedAt), "Source order must be paid and not refunded");
  demand(source.scenes.length === 9 && new Set(source.scenes.map(scene => scene.sceneVersion)).size === 1, "Source needs one pinned nine-board content version");
  const asset = await c.db.asset.findUniqueOrThrow({ where: { id: expectedIdentityAssetId } });
  demand(asset.ownerId === source.ownerId && asset.type === "IDENTITY_SHEET" && asset.visibility === "PRIVATE" && asset.status === "READY" && !asset.deletedAt, "Canonical source is unavailable or unrelated");
  const bytes = await c.storage.get(asset.storagePath), meta = await sharp(bytes, { limitInputPixels: 25_000_000 }).metadata();
  demand(bytes.length <= 32 * 1024 * 1024 && meta.format === "png" && meta.width && meta.width === meta.height && meta.width >= 8
    && (meta.pages ?? 1) === 1, "Canonical source must remain a bounded square PNG sheet");
  const gate = await c.db.auditLog.findFirst({ where: { action: IDENTITY_GATE_ACTION, entityType: "Asset", entityId: asset.id }, orderBy: { createdAt: "desc" } });
  const painted = await c.db.auditLog.findFirst({ where: { action: "sheet:painted", entityType: "Asset", entityId: asset.id }, orderBy: { createdAt: "desc" } });
  demand(gate?.metaJson && painted?.metaJson, "Original identity provenance is required; no approval may be invented");
  const receipt = identityGateReceiptSchema.parse(JSON.parse(gate.metaJson)), painting = JSON.parse(painted.metaJson);
  demand(identityReceiptReadyForPublication(receipt, source.scenes[0]!.sceneVersion) && receipt.identityAssetId === asset.id
    && receipt.sheetSha256 === sha256Bytes(bytes) && receipt.provenance.ageYears === child.ageYears
    && boardConditioningHash(receipt.provenance.crop) === boardConditioningHash(child.photoCropJson ? JSON.parse(child.photoCropJson) : null)
    && painting.gameId === source.id && boardConditioningHash(painting.identityProvenance) === boardConditioningHash(receipt.provenance), "Source pixels or identity provenance changed");
  if (child.originalPhotoAssetId === null) {
    const purge = await c.db.auditLog.findFirst({ where: { action: "local-patch:photo-purged-after-approval", entityType: "Asset", entityId: asset.id }, orderBy: { createdAt: "desc" } });
    const proof = JSON.parse(purge?.metaJson ?? "null");
    demand(proof?.photoAssetId === receipt.provenance.photoAssetId && proof?.approvalFingerprint === receipt.fingerprint
      && proof?.ageYears === child.ageYears, "Missing photo has no matching privacy-cleanup proof");
  } else {
    demand(child.originalPhotoAssetId === receipt.provenance.photoAssetId, "Source photograph changed");
    const photo = await c.db.asset.findUniqueOrThrow({ where: { id: child.originalPhotoAssetId } });
    demand(photo.ownerId === source.ownerId && photo.type === "ORIGINAL_PHOTO" && photo.visibility === "PRIVATE" && photo.status === "READY"
      && !photo.deletedAt && sha256Bytes(await c.storage.get(photo.storagePath)) === receipt.provenance.photoSha256, "Source photo evidence changed");
  }
  const ledger = await new PrismaWorldBudgetStore(c.db).read(boardWizardWorldId(source.id));
  demand(ledger, "Original identity accounting is missing");
  const cost = auditWorldBudget(ledger.snapshot);
  demand(!cost.held && cost.reservedMicroUsd === 0, "Source accounting is unresolved");
  const review = ledger.snapshot.requests.find(row => row.requestKey === IDENTITY_GATE_KEY);
  const render = ledger.snapshot.requests.find(row => row.requestKey === "wizard:identity:1");
  demand(review && (review.state === "settled" || review.state === "linked") && review.operationFingerprint === receipt.fingerprint
    && review.evidence.providerRequestId === receipt.requestId && review.evidence.amountMicroUsd === receipt.costMicroUsd
    && review.evidence.usageId === boardConditioningHash(receipt.usage), "Original review bill does not match");
  demand(render && (render.state === "settled" || render.state === "linked") && render.scope === "identity"
    && render.evidence.providerRequestId === painting.requestId && render.evidence.model === painting.model
    && render.evidence.usageId === boardConditioningHash(painting.usage) && render.evidence.amountMicroUsd === Math.ceil(painting.costCents * 10_000)
    && !painting.costUnknown, "Original identity purchase is not settled");
  return { source, child, asset, bytes, width: meta.width, paid, gateJson: gate.metaJson, paintedJson: painted.metaJson,
    ledgerSha256: sha256Bytes(Buffer.from(JSON.stringify(ledger.snapshot))) };
}

export type CreateCanonicalIdentityReuseInput = { sourceGameId: string; sourceIdentityAssetId: string; requestId: string; displayName: string; confirmation: string };
/** Creates a new, UNPAID sandbox checkout, never resets or queues the source. */
export async function createCanonicalIdentityReuse(c: Container, input: CreateCanonicalIdentityReuseInput, actor: Actor) {
  const operatorId = await requireAdmin(c, actor), name = normalizeChildName(input.displayName);
  demand(input.confirmation === CANONICAL_IDENTITY_REUSE_CONFIRMATION && /^[A-Za-z0-9_-]{8,120}$/.test(input.requestId)
    && /^[A-Za-z0-9_-]{1,160}$/.test(input.sourceGameId) && /^[A-Za-z0-9_-]{1,160}$/.test(input.sourceIdentityAssetId)
    && name.length >= 2 && name.length <= 60, "Explicit source, name and one idempotent authorization are required");
  const suffix = idPart([operatorId, input.sourceGameId, input.requestId]);
  const gameId = `game_reuse_${suffix}`, childId = `chl_reuse_${suffix}`, orderId = `ord_reuse_${suffix}`;
  const previous = await c.db.auditLog.findUnique({ where: { id: recordId(gameId) } });
  if (previous) {
    const record = recordSchema.parse(JSON.parse(previous.metaJson ?? "null"));
    demand(record.sourceIdentityAssetId === input.sourceIdentityAssetId && record.sourceGameId === input.sourceGameId
      && record.displayName === name && record.operatorId === operatorId && record.requestId === input.requestId, "Authorization key was already used for different inputs");
    await requireCanonicalIdentityReuse(c, { gameId });
    const order = await c.db.order.findUniqueOrThrow({ where: { id: orderId } });
    return { gameId, orderId, checkoutUrl: order.checkoutUrl!, replayed: true };
  }
  const current = await inspectSource(c, input.sourceGameId, input.sourceIdentityAssetId);
  const avatar = await avatarDisplayFromSheet(current.bytes, current.width), catalogSha256 = (await readBoardConditionedCatalog()).sha256;
  const identityAssetId = `ast_reuse_sheet_${suffix}`, avatarAssetId = `ast_reuse_face_${suffix}`;
  const record: ReuseRecord = { version: "canonical-identity-reuse/v1", requestId: input.requestId, operatorId,
    sourceGameId: current.source.id, sourceChildId: current.child.id, sourceIdentityAssetId: current.asset.id,
    sourceContentVersion: current.source.scenes[0]!.sceneVersion, sourcePaidOrderId: current.paid.id,
    sourcePaintedJson: current.paintedJson, sourceGateJson: current.gateJson, sourceLedgerSha256: current.ledgerSha256,
    gameId, childId, ownerId: current.source.ownerId!, displayName: name, ageYears: current.child.ageYears!,
    identityAssetId, identitySha256: sha256Bytes(current.bytes), avatarAssetId, avatarSha256: sha256Bytes(avatar),
    catalogSha256, cropJson: current.child.photoCropJson, contentVersion: LOCAL_PATCH_STRICT_SCENE_VERSION,
    newIdentityChargeMicroUsd: 0, authorization: CANONICAL_IDENTITY_REUSE_CONFIRMATION };
  const amount = priceFor("ONE_WORLD", "ILS");
  const checkout = await c.payment.createCheckout({ orderId, customerEmail: current.source.owner!.email, amountAgorot: amount, currency: "ILS", description: `איפה ${name}? — QA`,
    successUrl: `${c.appUrl}/creating/${gameId}`, cancelUrl: `${c.appUrl}/admin/orders/${input.sourceGameId}` });
  await c.db.$transaction(async tx => {
    const sourceFence = await tx.game.updateMany({ where: { id: current.source.id, status: current.source.status, updatedAt: current.source.updatedAt,
      ownerId: current.source.ownerId, childProfileId: current.child.id, deletedAt: null }, data: { updatedAt: current.source.updatedAt } });
    demand(sourceFence.count === 1, "Source changed before adoption");
    const tc = { ...c, db: tx as Container["db"], storage: new DbStorage(tx as Container["db"]) };
    const fresh = await inspectSource(tc, input.sourceGameId, input.sourceIdentityAssetId);
    demand(sha256Bytes(fresh.bytes) === record.identitySha256 && fresh.gateJson === record.sourceGateJson
      && fresh.paintedJson === record.sourcePaintedJson && fresh.ledgerSha256 === record.sourceLedgerSha256, "Source evidence changed before adoption");
    for (const [id, type, visibility, bytes, width] of [[identityAssetId, "IDENTITY_SHEET", "PRIVATE", current.bytes, current.width], [avatarAssetId, "AVATAR", "GAME", avatar, 512]] as const) {
      const storagePath = `${visibility.toLowerCase()}/${id}.png`;
      await tx.fileBlob.create({ data: { key: storagePath, data: new Uint8Array(bytes), contentType: "image/png" } });
      await tx.asset.create({ data: { id, ownerId: record.ownerId, type, visibility, status: "READY", storagePath, mimeType: "image/png", width, height: width,
        bytes: bytes.length, provider: "canonical-identity-reuse", providerRequestId: gameId, costCents: 0 } });
    }
    await tx.childProfile.create({ data: { id: childId, ownerId: record.ownerId, displayName: name, ageYears: record.ageYears,
      identityAssetId, avatarAssetId, originalPhotoAssetId: null, photoCropJson: record.cropJson, retainOriginalPhoto: false } });
    await tx.game.create({ data: { id: gameId, ownerId: record.ownerId, childProfileId: childId, status: "PACKAGE_SELECTED",
      styleVersion: "local-patch-world-v1", locale: "he", title: `איפה ${name}?`, packageTier: "ONE_WORLD", sceneCount: 9 } });
    const boards = localPatchBoardsForVersion(record.contentVersion);
    demand(boards.length === 9, "New canonical workflow must have all nine shipped boards");
    await tx.gameScene.createMany({ data: boards.map((board, orderIndex) => ({ id: `gsc_reuse_${suffix}_${orderIndex}`, gameId,
      sceneSlug: board.board, sceneVersion: sceneBySlug(board.board, record.contentVersion).version, orderIndex })) });
    await tx.order.create({ data: { id: orderId, userId: record.ownerId, gameId, amountAgorot: amount, currency: "ILS", packageTier: "ONE_WORLD",
      provider: c.payment.id, paymentStatus: "PENDING", checkoutUrl: checkout.checkoutUrl, providerPaymentId: checkout.providerPaymentId } });
    await tx.auditLog.create({ data: { id: recordId(gameId), actorType: "ADMIN", actorId: operatorId, action: CANONICAL_IDENTITY_REUSE_ACTION,
      entityType: "Game", entityId: gameId, metaJson: JSON.stringify(record) } });
    await transitionGame(tc, gameId, "CHECKOUT_PENDING", actor, { source: "canonical-identity-reuse", sourceGameId: current.source.id });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  return { gameId, orderId, checkoutUrl: checkout.checkoutUrl, replayed: false };
}

export async function requireCanonicalIdentityReuse(c: Container, input: {
  gameId: string; identityAssetId?: string; sheetSha256?: string; catalogSha256?: string; photoAssetId?: string | null;
  ageYears?: number; crop?: unknown; contentVersion?: number;
}) {
  const row = await c.db.auditLog.findUnique({ where: { id: recordId(input.gameId) } });
  if (!row) return null;
  const record = recordSchema.parse(JSON.parse(row.metaJson ?? "null"));
  demand(env().APP_ENV === "qa" && row.action === CANONICAL_IDENTITY_REUSE_ACTION && row.actorType === "ADMIN" && row.actorId === record.operatorId
    && row.entityType === "Game" && row.entityId === input.gameId && record.gameId === input.gameId, "Invalid reuse authority");
  const game = await c.db.game.findUniqueOrThrow({ where: { id: input.gameId }, include: { childProfile: true, scenes: true } });
  const child = game.childProfile;
  demand(!game.deletedAt && !["DELETED", "REFUNDED", "CANCELLED"].includes(game.status) && game.styleVersion === "local-patch-world-v1"
    && game.ownerId === record.ownerId && game.childProfileId === record.childId && child && !child.deletedAt && child.ownerId === record.ownerId
    && child.identityAssetId === record.identityAssetId && child.avatarAssetId === record.avatarAssetId && child.originalPhotoAssetId === null
    && child.ageYears === record.ageYears && child.displayName === record.displayName && child.photoCropJson === record.cropJson
    && game.scenes.length === 9 && game.scenes.every(scene => scene.sceneVersion === record.contentVersion), "Reuse belongs to another game, child or content version");
  for (const [id, type, visibility, expected] of [[record.identityAssetId, "IDENTITY_SHEET", "PRIVATE", record.identitySha256], [record.avatarAssetId, "AVATAR", "GAME", record.avatarSha256]] as const) {
    const asset = await c.db.asset.findUniqueOrThrow({ where: { id } });
    demand(asset.ownerId === record.ownerId && asset.type === type && asset.visibility === visibility && asset.status === "READY" && !asset.deletedAt
      && asset.provider === "canonical-identity-reuse" && asset.providerRequestId === game.id && sha256Bytes(await c.storage.get(asset.storagePath)) === expected,
    "Reused image bytes or ownership changed");
  }
  const receipt = identityGateReceiptSchema.parse(JSON.parse(record.sourceGateJson));
  demand(receipt.identityAssetId === record.sourceIdentityAssetId && receipt.sheetSha256 === record.identitySha256
    && receipt.provenance.ageYears === record.ageYears && identityReceiptReadyForPublication(receipt, record.sourceContentVersion), "Frozen source approval changed");
  demand((input.identityAssetId === undefined || input.identityAssetId === record.identityAssetId)
    && (input.sheetSha256 === undefined || input.sheetSha256 === record.identitySha256)
    && (input.catalogSha256 === undefined || input.catalogSha256 === record.catalogSha256)
    && (input.photoAssetId === undefined || input.photoAssetId === null)
    && (input.ageYears === undefined || input.ageYears === record.ageYears)
    && (input.contentVersion === undefined || input.contentVersion === record.contentVersion)
    && (!Object.hasOwn(input, "crop") || boardConditioningHash(input.crop) === boardConditioningHash(record.cropJson ? JSON.parse(record.cropJson) : null)), "Reuse input binding changed");
  return { record, sourceReceipt: receipt };
}

/** Paid queue handoff, not a fabricated identity purchase or review. */
export async function finishCanonicalIdentityReuse(c: Container, claim: { gameId: string; jobId: string; jobAttempt: number }) {
  const proof = await requireCanonicalIdentityReuse(c, { gameId: claim.gameId });
  demand(proof, "Explicit canonical reuse record required");
  const { record } = proof;
  await c.db.$transaction(async tx => {
    const game = await tx.game.updateMany({ where: { id: record.gameId, ownerId: record.ownerId, childProfileId: record.childId, deletedAt: null,
      styleVersion: "local-patch-world-v1", status: { in: ["PAID", "AVATAR_GENERATING", "GENERATION_FAILED"] } }, data: { styleVersion: "local-patch-world-v1" } });
    const job = await tx.generationJob.findUniqueOrThrow({ where: { id: claim.jobId } });
    demand(game.count === 1 && job.gameId === claim.gameId && job.status === "RUNNING" && job.attempts === claim.jobAttempt && job.currentStep === "avatar", "Reuse worker lost its claim");
    const paid = await tx.order.findFirst({ where: { gameId: record.gameId, userId: record.ownerId, paymentStatus: "PAID", paidAt: { not: null }, refundedAt: null } });
    demand(paid && !await tx.order.count({ where: { gameId: record.gameId, OR: [{ paymentStatus: "REFUNDED" }, { refundedAt: { not: null } }] } }), "New game must pass its own sandbox payment webhook");
    const tc = { ...c, db: tx as Container["db"], storage: new DbStorage(tx as Container["db"]) };
    await requireCanonicalIdentityReuse(tc, { gameId: claim.gameId });
    const steps = JSON.parse(job.stepsJson || "{}");
    steps.avatar = { ...steps.avatar, status: "done", source: "canonical-identity-reuse", finishedAt: new Date().toISOString() };
    const current = await tx.game.findUniqueOrThrow({ where: { id: claim.gameId }, select: { status: true } });
    if (current.status !== "AVATAR_GENERATING") await transitionGame(tc, claim.gameId, "AVATAR_GENERATING", { type: "SYSTEM" }, { source: "canonical-identity-reuse" });
    await transitionGame(tc, claim.gameId, "TARGETS_GENERATING", { type: "SYSTEM" }, { source: "canonical-identity-reuse", identityAssetId: record.identityAssetId, newIdentityChargeMicroUsd: 0 });
    await tx.game.update({ where: { id: claim.gameId }, data: { lastError: null } });
    await tx.generationJob.update({ where: { id: claim.jobId }, data: { status: "QUEUED", currentStep: "local-patch", lastError: null, stepsJson: JSON.stringify(steps) } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

/** Display uses the same durable adoption authority; no missing-photo exception
 * applies to ordinary identities or older content versions. */
export async function canonicalIdentityApprovedForDisplay(c: Container, profile: {
  identityAssetId: string | null; originalPhotoAssetId: string | null; ageYears: number | null;
}, contentVersion?: number): Promise<boolean | null> {
  if (contentVersion !== LOCAL_PATCH_STRICT_SCENE_VERSION || !profile.identityAssetId) return null;
  const asset = await c.db.asset.findUnique({ where: { id: profile.identityAssetId } });
  if (asset?.provider !== "canonical-identity-reuse") return null;
  if (!asset.providerRequestId || profile.originalPhotoAssetId !== null || !profile.ageYears) return false;
  try { return !!await requireCanonicalIdentityReuse(c, { gameId: asset.providerRequestId, identityAssetId: profile.identityAssetId,
    photoAssetId: profile.originalPhotoAssetId, ageYears: profile.ageYears, contentVersion }); }
  catch { return false; }
}
