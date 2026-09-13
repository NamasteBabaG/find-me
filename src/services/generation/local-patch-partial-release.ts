import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { DbStorage } from "../../infra/storage/db";
import { localPatchBoardForVersion } from "../../domain/scene/local-patch-catalog";
import { sceneBySlug } from "../scene-catalog.service";
import { boardWizardWorldId } from "./board-conditioned-wizard";
import { localPatchPublicationGeometryHash } from "./local-patch-publication-policy";
import { LOCAL_PATCH_COMPOSITION_VERSION } from "./local-patch-seam";
import { requireLocalPatchRecoveryBudget, requireLocalPatchRecoveryIdentity } from "./local-patch-quality-pilot";
import { finishLocalPatchGame } from "./local-patch-player";

export const LOCAL_PATCH_PARTIAL_RELEASE_ACTION = "local-patch:partial-release";
const TERMINAL = "local-patch:quality-failed";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const idOf = (gameId: string) => `aud_lppr_${hash(gameId).slice(0, 32)}`;
function demand(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(`LOCAL_PATCH_PARTIAL_RELEASE: ${reason}`); }
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const selectedSchema = z.object({ hideId: z.string(), sceneId: z.string(), targetId: z.string(), variantId: z.string(),
  assetId: z.string(), imageSha256: digest, geometrySha256: digest, judgeSha256: digest, attempts: z.number().int().positive() }).strict();
const bodySchema = z.object({ version: z.literal(1), gameId: z.string(), operatorId: z.string(), reason: z.string().min(10).max(1000),
  decision: z.literal("publish-retained-subset-by-human-decision"), machineApprovalInvented: z.literal(false),
  snapshotSha256: digest, selected: z.array(selectedSchema).min(36).max(44), omittedHideIds: z.array(z.string()).min(1).max(9),
  jobAttempt: z.number().int().nonnegative() }).strict();
const recordSchema = bodySchema.extend({ authorizationSha256: digest }).strict();
export type LocalPatchPartialRelease = z.infer<typeof recordSchema>;
export const LocalPatchPartialReleaseInputSchema = z.object({ gameId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  operatorId: z.string().min(1), reason: z.string().trim().min(10).max(1000), omittedHideIds: z.array(z.string().min(1)).min(1).max(9) }).strict();
export type LocalPatchPartialReleaseInput = z.input<typeof LocalPatchPartialReleaseInputSchema>;
const transactionContainer = (c: Container, tx: Prisma.TransactionClient): Container => ({ ...c, db: tx as Container["db"], storage: new DbStorage(tx as Container["db"]) });

/** A complete, read-only snapshot of the retained inventory. Publication changes
 * game/scene lifecycle fields, never these pixels, attempts or machine reports. */
async function snapshot(c: Container, gameId: string, omittedHideIds: readonly string[]) {
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true,
    orders: { orderBy: { id: "asc" } }, jobs: { orderBy: { id: "asc" } }, scenes: { orderBy: { orderIndex: "asc" },
      include: { targets: { orderBy: { id: "asc" }, include: { variants: { orderBy: { id: "asc" } } } } } } } });
  const child = game.childProfile, omitted = new Set(omittedHideIds);
  demand(omitted.size === omittedHideIds.length && omitted.size > 0, "Explicit distinct omissions required");
  demand(game.styleVersion === "local-patch-world-v1" && !game.deletedAt && game.ownerId && child && !child.deletedAt
    && child.ownerId === game.ownerId && child.identityAssetId && child.avatarAssetId && game.packageTier === "ONE_WORLD"
    && game.paidAt && !["REFUNDED", "CANCELLED", "DELETED"].includes(game.status), "Live owned paid game and illustrated identity required");
  demand(game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    && !game.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt), "Paid nonrefunded order required");
  demand(game.scenes.length === 9 && new Set(game.scenes.map(s => s.sceneSlug)).size === 9
    && game.scenes.every(s => s.sceneVersion === 9), "Exactly nine pinned age-five boards required");
  const job = game.jobs.find(j => j.id === `job_${gameId}`);
  demand(job && game.jobs.every(j => j.status === "DONE") && [TERMINAL, null].includes(job.currentStep), "All workers must be inactive");
  const variants = game.scenes.flatMap(s => s.targets.flatMap(t => t.variants));
  demand(variants.length === 45 && variants.every(v => v.variant === "A"), "The original 45-row inventory must remain intact");
  const assetIds = [...new Set([child.identityAssetId, child.avatarAssetId, ...variants.map(v => v.assetId).filter((id): id is string => !!id)])];
  const assets = await c.db.asset.findMany({ where: { id: { in: assetIds } }, orderBy: { id: "asc" } });
  demand(assets.length === assetIds.length, "Retained assets missing");
  const blobs = await c.db.fileBlob.findMany({ where: { key: { in: assets.map(a => a.storagePath) } } });
  const bytes = new Map(blobs.map(blob => [blob.key, blob.data]));
  for (const asset of assets) demand(asset.ownerId === game.ownerId && asset.status === "READY" && !asset.deletedAt
    && bytes.get(asset.storagePath)?.length, "Owned retained bytes missing");
  const identity = assets.find(a => a.id === child.identityAssetId)!, avatar = assets.find(a => a.id === child.avatarAssetId)!;
  demand(identity.type === "IDENTITY_SHEET" && identity.visibility === "PRIVATE" && avatar.type === "AVATAR" && avatar.visibility === "GAME", "Wrong identity or portrait purpose");
  const selected: z.infer<typeof selectedSchema>[] = [], matched = new Set<string>();
  const scenePins = [];
  for (const scene of game.scenes) {
    const board = localPatchBoardForVersion(scene.sceneSlug, scene.sceneVersion), def = sceneBySlug(scene.sceneSlug, scene.sceneVersion);
    demand(board && board.hides.length === 5 && scene.targets.length === 5 && `public${def.art.base}` === board.art, "Original authored placements changed");
    scenePins.push({ id: scene.id, order: scene.orderIndex, slug: scene.sceneSlug, version: scene.sceneVersion, definitionSha256: hash(def) });
    let kept = 0;
    for (const hide of board.hides) {
      const target = scene.targets.find(t => t.targetId === hide.targetId), row = target?.variants[0];
      demand(target && row && row.provider === "local-patch", "An authored target is missing or from another engine");
      if (omitted.has(hide.id)) {
        demand(row.status === "FAILED" && !row.assetId && row.attempts > 0, "Only failed unshippable appearances may be omitted");
        matched.add(hide.id); continue;
      }
      demand(row.status === "GENERATED" && row.assetId && row.rectJson && row.hitRectJson && row.headAnchorJson, "Every included appearance needs its existing image and geometry");
      const asset = assets.find(a => a.id === row.assetId)!;
      demand(asset.type === "TARGET_SPRITE" && asset.visibility === "GAME" && asset.provider === "local-patch" && asset.providerRequestId === gameId, "Included image belongs to another game or purpose");
      const imageSha256 = sha(bytes.get(asset.storagePath)!), geometrySha256 = localPatchPublicationGeometryHash(row);
      const receipt = JSON.parse(row.judgeJson ?? "null");
      demand(receipt?.hide === hide.id && receipt.judgedSha256 === imageSha256 && receipt.geometrySha256 === geometrySha256
        && receipt.compositionVersion === LOCAL_PATCH_COMPOSITION_VERSION && !receipt.renderFault
        && ["pending-board-review", "board-review-complete"].includes(receipt.reviewState), "Included pixels or geometry no longer match the retained render");
      selected.push({ hideId: hide.id, sceneId: scene.id, targetId: hide.targetId, variantId: row.id, assetId: row.assetId,
        imageSha256, geometrySha256, judgeSha256: hash(row.judgeJson), attempts: row.attempts });
      kept++;
    }
    demand(kept === 4 || kept === 5, "Each released board must retain four or five appearances");
  }
  demand(matched.size === omitted.size, "An omission does not belong to this game");
  const ledger = await c.db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: boardWizardWorldId(gameId) } });
  const snapshotSha256 = hash({ game: { id: game.id, ownerId: game.ownerId, childId: child.id, locale: game.locale,
    packageTier: game.packageTier, styleVersion: game.styleVersion, paidAt: game.paidAt, giftJson: game.giftJson },
    child: { id: child.id, ownerId: child.ownerId, displayName: child.displayName, ageYears: child.ageYears,
      identityAssetId: child.identityAssetId, avatarAssetId: child.avatarAssetId, photoCropJson: child.photoCropJson },
    orders: game.orders, scenes: scenePins, targets: game.scenes.flatMap(s => s.targets), jobAttempt: job.attempts,
    assets: assets.map(a => ({ asset: a, bytesSha256: sha(bytes.get(a.storagePath)!) })), ledgerSha256: hash(ledger.snapshotJson) });
  return { game, job, selected, snapshotSha256 };
}

/** No record means normal strict assembly. A present but invalid record is a
 * hard refusal, never permission to silently use today's subset instead. */
export async function readLocalPatchPartialRelease(c: Container, gameId: string): Promise<LocalPatchPartialRelease | null> {
  const audit = await c.db.auditLog.findUnique({ where: { id: idOf(gameId) } });
  if (!audit) return null;
  demand(audit.action === LOCAL_PATCH_PARTIAL_RELEASE_ACTION && audit.actorType === "ADMIN" && audit.actorId
    && audit.entityType === "Game" && audit.entityId === gameId, "Partial release audit changed");
  const record = recordSchema.parse(JSON.parse(audit.metaJson ?? "null")), { authorizationSha256, ...body } = record;
  demand(body.gameId === gameId && body.operatorId === audit.actorId && hash(body) === authorizationSha256, "Partial release authority changed");
  const current = await snapshot(c, gameId, record.omittedHideIds);
  demand(current.snapshotSha256 === record.snapshotSha256 && hash(current.selected) === hash(record.selected), "The authorized images, identity, inventory or charges changed");
  if (["READY", "DELIVERED"].includes(current.game.status)) {
    const ready = await c.db.auditLog.findFirst({ where: { action: "local-patch:ready", entityType: "Game", entityId: gameId }, orderBy: { createdAt: "desc" } });
    const evidence = JSON.parse(ready?.metaJson ?? "null");
    demand(current.game.configJson && ready?.actorType === "SYSTEM" && evidence?.targets === record.selected.length
      && evidence.configSha256 === sha(Buffer.from(current.game.configJson)), "The published config differs from the atomically finalized game");
  }
  return record;
}

/** User-authorized QA delivery of an explicit retained subset. No provider,
 * attempt reset, target deletion, machine verdict rewrite or spend occurs. */
export async function publishLocalPatchPartialGame(c: Container, raw: LocalPatchPartialReleaseInput): Promise<{ targets: number; omittedHideIds: string[] }> {
  const input = LocalPatchPartialReleaseInputSchema.parse(raw);
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "Only durable QA games may use partial release");
  const operator = await c.db.user.findUnique({ where: { id: input.operatorId } });
  demand(operator && c.adminEmails?.some(email => email.trim().toLowerCase() === operator.email.toLowerCase()), "Authenticated administrator required");
  let record = await readLocalPatchPartialRelease(c, input.gameId);
  if (!record) {
    await requireLocalPatchRecoveryIdentity(c, input.gameId);
    await requireLocalPatchRecoveryBudget(c, input.gameId);
    const frozen = await snapshot(c, input.gameId, input.omittedHideIds);
    demand(frozen.game.status === "GENERATION_FAILED" && !frozen.game.configJson && !frozen.game.readyAt && !frozen.game.deliveredAt
      && frozen.job.currentStep === TERMINAL, "Only an unpublished terminal quality failure is eligible");
    const body: z.infer<typeof bodySchema> = { version: 1, gameId: input.gameId, operatorId: input.operatorId, reason: input.reason,
      decision: "publish-retained-subset-by-human-decision", machineApprovalInvented: false,
      snapshotSha256: frozen.snapshotSha256, selected: frozen.selected, omittedHideIds: [...input.omittedHideIds].sort(), jobAttempt: frozen.job.attempts };
    record = recordSchema.parse({ ...body, authorizationSha256: hash(body) });
    const staged = record;
    await c.db.$transaction(async tx => {
      const lock = await tx.game.updateMany({ where: { id: input.gameId, status: "GENERATION_FAILED", configJson: null, readyAt: null, deliveredAt: null, deletedAt: null }, data: { status: "GENERATION_FAILED" } });
      const job = await tx.generationJob.updateMany({ where: { id: frozen.job.id, status: "DONE", currentStep: TERMINAL, attempts: frozen.job.attempts }, data: { status: "DONE" } });
      demand(lock.count === 1 && job.count === 1, "The terminal game or worker changed");
      const current = await snapshot(transactionContainer(c, tx), input.gameId, staged.omittedHideIds);
      demand(current.snapshotSha256 === staged.snapshotSha256, "The selected inventory changed during authorization");
      await tx.auditLog.create({ data: { id: idOf(input.gameId), actorType: "ADMIN", actorId: input.operatorId,
        action: LOCAL_PATCH_PARTIAL_RELEASE_ACTION, entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify(staged) } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 120_000 });
  }
  demand(record.operatorId === input.operatorId && hash([...input.omittedHideIds].sort()) === hash(record.omittedHideIds), "An existing authorization names another operator or subset");
  const current = await c.db.game.findUniqueOrThrow({ where: { id: input.gameId }, select: { status: true, configJson: true } });
  if (["READY", "DELIVERED"].includes(current.status)) {
    demand(current.configJson, "Released game has no playable config");
    return { targets: record.selected.length, omittedHideIds: record.omittedHideIds };
  }
  const frozenRecord = record;
  await finishLocalPatchGame(c, input.gameId, async tx => {
    const lock = await tx.game.updateMany({ where: { id: input.gameId, status: "GENERATION_FAILED", configJson: null, readyAt: null, deliveredAt: null, deletedAt: null }, data: { status: "GENERATION_FAILED" } });
    const job = await tx.generationJob.updateMany({ where: { id: `job_${input.gameId}`, status: "DONE", currentStep: TERMINAL,
      attempts: frozenRecord.jobAttempt }, data: { status: "DONE" } });
    demand(lock.count === 1 && job.count === 1, "Publication lost its game or worker fence");
    const checked = await readLocalPatchPartialRelease(transactionContainer(c, tx), input.gameId);
    demand(checked?.authorizationSha256 === frozenRecord.authorizationSha256, "Partial release changed before publication");
  }, { transactionTimeoutMs: 120_000 });
  return { targets: record.selected.length, omittedHideIds: record.omittedHideIds };
}
