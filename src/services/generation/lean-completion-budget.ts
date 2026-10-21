import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { boardConditioningHash as hash } from "./board-conditioned-source";
import { leanReleaseOf, leanReleaseReceipt } from "./lean-release";
import { PrismaWorldBudgetStore, WORLD_BUDGET_LEDGER_MAX_REVISION } from "../../infra/db/prisma-world-budget-store";
import { auditWorldBudget } from "./world-budget";
import type { BoardWizardBudgetGrant } from "./board-wizard-budget";
import { LEAN_COMPLETION_BUDGET_VERSION, LEAN_COMPLETION_BUDGET_CAP, LEAN_COMPLETION_BUDGET_ACTION } from "../../domain/generation/lean-completion-budget";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/), digest = z.string().regex(/^[a-f0-9]{64}$/);
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const bodySchema = z.object({ version: z.literal(LEAN_COMPLETION_BUDGET_VERSION), gameId: id,
  worldId: z.string().regex(/^[A-Za-z0-9_-]{1,160}:board-wizard$/), ownerId: id, childId: id,
  baseCapMicroUsd: z.literal(4_000_000), capMicroUsd: z.literal(LEAN_COMPLETION_BUDGET_CAP),
  leanPinSha256: digest, sourceStartSha256: digest, originalJobHoldSha256: digest,
  ledgerSha256: digest, ledgerRevision: money, committedMicroUsd: money, reservedMicroUsd: money,
  retainedUnknowns: z.array(z.object({ requestKey: z.string().min(1).max(300), operationFingerprint: digest, reserveMicroUsd: money }).strict()),
  planSha256: digest, operatorId: id, authorizedAt: z.string().datetime(), automaticRelease: z.literal(false),
}).strict();
export const leanCompletionBudgetReceiptSchema = bodySchema.extend({ authorizationSha256: digest }).strict();
export const leanCompletionBudgetAuditId = (gameId: string) => "aud_lean_completion_budget_" + gameId;
function demand(ok: unknown, message: string): asserts ok { if (!ok) throw Error("LEAN_COMPLETION_BUDGET: " + message); }

async function context(c: Container, gameId: string) {
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "Qualified QA database storage is required");
  demand(await leanReleaseOf(c.db, gameId), "An existing immutable lean pin is required");
  const { identityRevisionStartOf } = await import("./identity-source-revision-state");
  const start = await identityRevisionStartOf(c.db, gameId);
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true, orders: true } });
  demand(start && game.ownerId === start.ownerId && game.childProfileId === start.childId && game.styleVersion === "local-patch-world-v1"
    && !game.deletedAt && game.childProfile?.ownerId === start.ownerId && !game.childProfile.deletedAt
    && game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    && !game.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt), "Paid nonrefunded source-revision world is required");
  return { start, game };
}

/** Read a separate, explicit one-world grant. The original four-dollar pin remains byte-for-byte intact. */
export async function readLeanCompletionBudget(c: Container, worldId: string): Promise<BoardWizardBudgetGrant | null> {
  if (env().APP_ENV !== "qa" || !/^[A-Za-z0-9_-]{1,160}:board-wizard$/.test(worldId)) return null;
  const gameId = worldId.slice(0, -":board-wizard".length);
  const row = await c.db.auditLog.findUnique({ where: { id: leanCompletionBudgetAuditId(gameId) } });
  if (!row) return null;
  const receipt = leanCompletionBudgetReceiptSchema.parse(JSON.parse(row.metaJson ?? "null"));
  const { authorizationSha256, ...body } = receipt;
  const { identityRevisionStartOf } = await import("./identity-source-revision-state");
  const start = await identityRevisionStartOf(c.db, gameId);
  demand(start && await leanReleaseOf(c.db, gameId)
    && row.actorType === "ADMIN" && row.actorId === receipt.operatorId && row.entityType === "Game" && row.entityId === gameId
    && row.action === LEAN_COMPLETION_BUDGET_ACTION && row.metaJson === JSON.stringify(receipt)
    && receipt.gameId === gameId && receipt.worldId === worldId && receipt.ownerId === start.ownerId && receipt.childId === start.childId
    && receipt.operatorId === start.operatorId && receipt.sourceStartSha256 === hash(start)
    && receipt.originalJobHoldSha256 === start.jobHoldSha256 && receipt.leanPinSha256 === hash(leanReleaseReceipt(gameId))
    && authorizationSha256 === hash(body), "Grant does not bind this exact authorized QA world");
  // Later lifecycle changes revoke new capacity, not the ability to record a genuine late bill.
  // Validate immutable authority first; a forged receipt must still throw rather than fall back.
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, orders: true } });
  if (c.storage.id !== "db" || !game || game.deletedAt || game.ownerId !== receipt.ownerId || game.childProfileId !== receipt.childId
    || game.styleVersion !== "local-patch-world-v1" || !game.childProfile || game.childProfile.deletedAt || game.childProfile.ownerId !== receipt.ownerId
    || !game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    || game.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt)) return null;
  return { worldId, capMicroUsd: receipt.capMicroUsd, authorizationSha256 };
}

/** Read-only capacity plan. Does not change a ledger, purchase, hold, model or quality threshold. */
export async function planLeanCompletionBudget(c: Container, gameId: string) {
  id.parse(gameId);
  demand(!await c.db.auditLog.findUnique({ where: { id: leanCompletionBudgetAuditId(gameId) } }), "The single completion grant already exists");
  const { start, game } = await context(c, gameId);
  const { identityRevisionPending } = await import("./identity-source-revision-state");
  demand(game.status === "TARGETS_GENERATING" && !game.readyAt && !game.configJson && await identityRevisionPending(c.db, gameId), "Only an unfinished source revision may receive this grant");
  const child = game.childProfile!;
  demand(child.identityAssetId === start.oldIdentityAssetId && child.avatarAssetId === start.oldAvatarAssetId
    && child.originalPhotoAssetId === start.photoAssetId && child.ageYears === start.ageYears
    && hash(child.photoCropJson ? JSON.parse(child.photoCropJson) : null) === start.cropSha256, "The frozen child/source profile changed");
  const scenes = await c.db.gameScene.findMany({ where: { gameId } });
  demand(scenes.length === 9 && scenes.every(scene => scene.sceneVersion === 12), "The complete nine-board v12 world must remain");
  demand(await c.db.game.count({ where: { childProfileId: child.id, deletedAt: null, NOT: { id: gameId } } }) === 0, "A shared profile cannot receive a one-world completion grant");
  const assets = await c.db.asset.findMany({ where: { id: { in: [start.photoAssetId, start.oldIdentityAssetId] } } });
  demand(assets.length === 2 && assets.every(asset => asset.ownerId === start.ownerId && asset.visibility === "PRIVATE"
    && asset.status === "READY" && !asset.deletedAt), "Live private source assets are required");
  const job = await c.db.generationJob.findUniqueOrThrow({ where: { id: start.jobId } });
  const { parkedHoldSha256 } = await import("./lean-review-recovery-pin");
  demand(job.gameId === gameId && parkedHoldSha256(job) === start.jobHoldSha256, "The original immutable job hold changed");
  const stored = await new PrismaWorldBudgetStore(c.db).read(gameId + ":board-wizard");
  demand(stored && stored.revision < WORLD_BUDGET_LEDGER_MAX_REVISION, "A safe existing ledger revision is required");
  const audit = auditWorldBudget(stored.snapshot, LEAN_COMPLETION_BUDGET_CAP);
  demand(!audit.held && !audit.pendingRequestKeys.length && !audit.conflictRequestKeys.length && !audit.overrunRequestKeys.length
    && audit.committedMicroUsd < 4_000_000, "No pending or unresolved accounting hold may be bypassed");
  const binding = { version: LEAN_COMPLETION_BUDGET_VERSION, gameId, worldId: gameId + ":board-wizard",
    ownerId: start.ownerId, childId: start.childId, baseCapMicroUsd: 4_000_000 as const, capMicroUsd: LEAN_COMPLETION_BUDGET_CAP,
    leanPinSha256: hash(leanReleaseReceipt(gameId)), sourceStartSha256: hash(start), originalJobHoldSha256: start.jobHoldSha256,
    ledgerSha256: hash(stored.snapshot), ledgerRevision: stored.revision, committedMicroUsd: audit.committedMicroUsd,
    reservedMicroUsd: audit.reservedMicroUsd,
    retainedUnknowns: stored.snapshot.requests.filter(r => r.state === "unknown").map(r => ({ requestKey: r.requestKey,
      operationFingerprint: r.operationFingerprint, reserveMicroUsd: r.reserveMicroUsd })) };
  return { binding, planSha256: hash(binding), game, job, stored, start };
}

/** A real ADMIN action after explicit owner authorization. Idempotent; never resumes a held operation. */
export async function authorizeLeanCompletionBudget(c: Container, input: { gameId: string; operatorId: string; expectedPlanSha256: string }) {
  const gameId = id.parse(input.gameId), operatorId = id.parse(input.operatorId), expected = digest.parse(input.expectedPlanSha256);
  const operator = await c.db.user.findUnique({ where: { id: operatorId }, select: { email: true } });
  demand(operator && (c.adminEmails ?? []).some(email => email.trim().toLowerCase() === operator.email.trim().toLowerCase()), "A verified administrator is required");
  const old = await readLeanCompletionBudget(c, gameId + ":board-wizard");
  if (old) {
    const row = await c.db.auditLog.findUniqueOrThrow({ where: { id: leanCompletionBudgetAuditId(gameId) } });
    const receipt = leanCompletionBudgetReceiptSchema.parse(JSON.parse(row.metaJson!));
    demand(receipt.operatorId === operatorId && receipt.planSha256 === expected, "Existing grant differs from this request");
    return old;
  }
  const plan = await planLeanCompletionBudget(c, gameId);
  demand(plan.planSha256 === expected && plan.start.operatorId === operatorId, "The current capacity plan or authorized operator changed");
  return c.db.$transaction(async tx => {
    const scoped = { ...c, db: tx as unknown as Container["db"] };
    const fresh = await planLeanCompletionBudget(scoped, gameId);
    const actor = await tx.user.findUnique({ where: { id: operatorId } });
    demand(actor && (c.adminEmails ?? []).some(email => email.trim().toLowerCase() === actor.email.trim().toLowerCase()) && fresh.planSha256 === expected && fresh.start.operatorId === operatorId, "Administrator, source or ledger changed");
    const fence = await tx.game.updateMany({ where: { id: gameId, status: fresh.game.status, updatedAt: fresh.game.updatedAt,
      deletedAt: null, ownerId: fresh.game.ownerId, childProfileId: fresh.game.childProfileId }, data: { updatedAt: new Date() } });
    const ledger = await tx.worldBudgetLedger.updateMany({ where: { worldId: fresh.binding.worldId, revision: fresh.stored.revision }, data: { revision: { increment: 1 } } });
    demand(fence.count === 1 && ledger.count === 1, "Concurrent generation changed the capacity plan");
    const body = bodySchema.parse({ ...fresh.binding, planSha256: expected, operatorId, authorizedAt: new Date().toISOString(), automaticRelease: false });
    const receipt = leanCompletionBudgetReceiptSchema.parse({ ...body, authorizationSha256: hash(body) });
    await tx.auditLog.create({ data: { id: leanCompletionBudgetAuditId(gameId), actorType: "ADMIN", actorId: operatorId,
      action: LEAN_COMPLETION_BUDGET_ACTION, entityType: "Game", entityId: gameId, metaJson: JSON.stringify(receipt) } });
    // snapshotJson, job hold, requests, bills and all unknown reservations are untouched.
    return { worldId: receipt.worldId, capMicroUsd: receipt.capMicroUsd, authorizationSha256: receipt.authorizationSha256 };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}
