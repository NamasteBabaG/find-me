import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { DbStorage } from "../../infra/storage/db";
import { QA_FIVE_COMPLETION_ACTION, QA_FIVE_COMPLETION_BASE_CAP, QA_FIVE_COMPLETION_CAP, QA_FIVE_COMPLETION_VERSION,
  QA_FIVE_NEXT_HIDE_ID, QA_FIVE_NEXT_OPERATION, qaFiveCompletionId, qaFiveCompletionPlanSchema, qaFiveCompletionReceiptSchema,
  type QaFiveCompletionReceipt } from "../../domain/generation/qa-five-dollar-completion";
import { SUNBURST_IMAGE_RESERVE_MICRO_USD, SUNBURST_MIN_CAPACITY_MICRO_USD, SUNBURST_REVIEW_COVERAGE_MICRO_USD } from "../../domain/generation/sunburst-painter";
import { qaCompletionCapacityId } from "../../domain/generation/qa-completion-capacity";
import { detectivesCompletionId, detectivesExtensionId, detectivesTailId } from "../../domain/generation/detectives-completion-budget";
import { leanCapacityRecoveryId } from "../../domain/generation/lean-capacity-recovery";
import { retainedWindowCanonicalHash as hash } from "../../domain/generation/retained-window";
import { PrismaWorldBudgetStore, WORLD_BUDGET_LEDGER_MAX_REVISION } from "../../infra/db/prisma-world-budget-store";
import { PrismaRetainedPurchaseStore } from "../../infra/db/prisma-retained-purchase-store";
import { JOURNEY_SOURCE_HEAD_AUTHORITIES } from "../../../content/detectives/journey-source-head-v2";
import { journeyHeadPinId, journeySunburstHeadPinId } from "../../domain/generation/journey-source-head";
import { qaCompletionSourceState } from "./qa-completion-capacity";
import { leanCompletionBudgetAuditId } from "./lean-completion-budget";
import { localPatchEmergencyBudgetAuditId } from "./local-patch-budget-recovery";
import { auditWorldBudget } from "./world-budget";
import { applyBoardWizardBudgetCap, type BoardWizardBudgetGrant } from "./board-wizard-budget";
import { backgroundReviewWaiting } from "./continuity-background";
import { fenceLocalPatchImages } from "./local-patch-lifecycle";
import { resolveLocalPatchBoardsForGame } from "./source-placement-release";
import { qaSunburstTailCompletionId } from "../../domain/generation/qa-sunburst-tail-completion";
import { qaSunburstTailCompletionActive, readQaSunburstTailCompletionBudget } from "./qa-sunburst-tail-completion";

/**
 * explicit-existing-qa-five-dollar-completion/v1: one ADMIN owner grant that
 * raises ONE existing paid QA game's cumulative ceiling from four to five
 * dollars. It is planned only when the single named next operation (the Paris
 * SOURCE head with the explicit Sunburst profile) is genuinely refused under the
 * original four dollars. It is exclusive: it never coexists or sums with another
 * completion grant. It never resets, releases or rewrites a bill, attempt or
 * UNKNOWN reserve; it neither buys nor approves anything.
 *
 * Deliberately NOT imported from board-conditioned-wizard: that resolver reads
 * this module, and every check here works on the stored ledger directly.
 */
const demand = (ok: unknown, reason: string): void => { if (!ok) throw Error("QA_FIVE_COMPLETION: " + reason); };
const qualified = (c: Pick<Container, "storage">) => env().APP_ENV === "qa" && c.storage?.id === "db";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,160}$/.test(value);
const bytesSha = (text: string) => createHash("sha256").update(text).digest("hex");
const worldOf = (gameId: string) => gameId + ":board-wizard";

/** Every OTHER explicit capacity authority a world can hold. Birth pins (lean,
 * new-QA) are ceilings, not grants, and are not listed. */
function otherGrantIds(gameId: string) {
  const worldId = worldOf(gameId);
  return [qaCompletionCapacityId(gameId), detectivesCompletionId(gameId), detectivesExtensionId(gameId), detectivesTailId(gameId),
    leanCapacityRecoveryId(gameId), leanCompletionBudgetAuditId(gameId), localPatchEmergencyBudgetAuditId(worldId),
    qaSunburstTailCompletionId(gameId)];
}
async function otherGrantPresent(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string) {
  return (await db.auditLog.count({ where: { id: { in: otherGrantIds(gameId) } } })) > 0;
}

async function receiptOf(c: Pick<Container, "db">, gameId: string): Promise<QaFiveCompletionReceipt | null> {
  const row = await c.db.auditLog.findUnique({ where: { id: qaFiveCompletionId(gameId) } });
  if (!row) return null;
  if (row.metaJson === null) {
    const game = await c.db.game.findUnique({ where: { id: gameId }, select: { status: true, deletedAt: true } });
    demand(game?.status === 'DELETED' && game.deletedAt, 'Purged five-dollar authority without completed deletion');
    return null;
  }
  const receipt = qaFiveCompletionReceiptSchema.parse(JSON.parse(row.metaJson ?? "null")), { authorizationSha256, ...body } = receipt;
  demand(row.actorType === "ADMIN" && row.actorId === receipt.operatorId && receipt.operatorId === receipt.plan.state.ownerId
    && row.action === QA_FIVE_COMPLETION_ACTION && row.entityType === "Game" && row.entityId === gameId
    && receipt.plan.state.gameId === gameId && receipt.plan.state.worldId === worldOf(gameId)
    && row.metaJson === JSON.stringify(receipt) && hash(body) === authorizationSha256
    && hash(receipt.plan) === receipt.planSha256, "Invalid immutable five-dollar authority");
  return receipt;
}

/** Budget resolver input. Exclusive: a recorded five-dollar grant beside any
 * other completion grant is an invalid world, never a silent fallback or sum.
 * Withdrawn (null) by refund, deletion, ownership, identity or source change.
 * The resolver's one five-dollar entry also returns the separate Sunburst tail
 * receipt's grant (explicit-existing-qa-sunburst-tail-completion/v1); both
 * receipts at once refuse. */
export async function readQaFiveCompletionBudget(c: Container, worldId: string): Promise<BoardWizardBudgetGrant | null> {
  if (!qualified(c) || !worldId.endsWith(":board-wizard")) return null;
  const gameId = worldId.slice(0, -":board-wizard".length);
  if (!validId(gameId)) return null;
  const receipt = await receiptOf(c, gameId);
  if (!receipt) return readQaSunburstTailCompletionBudget(c, worldId);
  demand(!await otherGrantPresent(c.db, gameId), "Five-dollar authority cannot coexist with another completion grant");
  let live; try { live = await qaCompletionSourceState(c, gameId); } catch { return null; }
  return hash(live.state) === hash(receipt.plan.state)
    ? { worldId, capMicroUsd: QA_FIVE_COMPLETION_CAP, authorizationSha256: receipt.authorizationSha256,
      imageAboveBaseOnly: { baseCapMicroUsd: QA_FIVE_COMPLETION_BASE_CAP, requestKey: receipt.plan.nextOperation.requestKey,
        reserveMicroUsd: receipt.plan.nextOperation.imageReserveMicroUsd } } : null;
}

/** For the named operation itself: the active receipt, with every original
 * request (settled bills and UNKNOWN reserves) still byte-identical. */
export async function qaFiveCompletionActive(c: Container, gameId: string): Promise<QaFiveCompletionReceipt | null> {
  if (!qualified(c) || !validId(gameId)) return null;
  const receipt = await receiptOf(c, gameId);
  if (!receipt || !await readQaFiveCompletionBudget(c, worldOf(gameId))) return null;
  const ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(c.db).read(worldOf(gameId));
  if (!ledger || !receipt.plan.originalRequests.every(old => ledger.snapshot.requests.some(r => r.requestKey === old.requestKey && hash(r) === old.sha256)))
    return null;
  return receipt;
}

/** P1-A: the original four dollars, or exactly this game's verified explicit
 * five-dollar completion (the single-Paris v1 receipt or the Sunburst tail
 * receipt, each authentic and active). Every other widened ceiling still refuses. */
export async function originalOrFiveDollarCap(c: Container, gameId: string, capMicroUsd: number): Promise<boolean> {
  if (capMicroUsd === QA_FIVE_COMPLETION_BASE_CAP) return true;
  return capMicroUsd === QA_FIVE_COMPLETION_CAP && (!!await qaFiveCompletionActive(c, gameId) || !!await qaSunburstTailCompletionActive(c, gameId));
}

/** Owner/admin visibility: a recorded grant never silently disappears. */
export async function qaFiveCompletionStatus(c: Container, gameId: string) {
  if (!qualified(c) || !validId(gameId)) return null;
  const receipt = await receiptOf(c, gameId);
  if (!receipt) return null;
  let active = false;
  try { active = !!await readQaFiveCompletionBudget(c, receipt.plan.state.worldId); } catch { active = false; }
  return { ownerId: receipt.plan.state.ownerId, baseCapMicroUsd: QA_FIVE_COMPLETION_BASE_CAP, capMicroUsd: QA_FIVE_COMPLETION_CAP,
    nextOperation: { kind: receipt.plan.nextOperation.kind, hideId: receipt.plan.nextOperation.hideId },
    status: active ? "active" as const : "withdrawn" as const };
}

/** The named next operation, read-only: the original first Paris head is a
 * concluded FAILED attempt 1 with no finite head pin and no second purchase. */
async function nextOperationOf(c: Container, gameId: string, ledgerRequests: readonly { requestKey: string }[], remainingUnderBaseMicroUsd: number) {
  const authority = JOURNEY_SOURCE_HEAD_AUTHORITIES.find(a => a.hideId === QA_FIVE_NEXT_HIDE_ID);
  demand(authority, "Public Paris SOURCE head authority missing");
  const placement = await resolveLocalPatchBoardsForGame(c.db, gameId, 13);
  const hide = placement.boards.find(b => b.board === authority!.boardId)?.hides.find(h => h.id === QA_FIVE_NEXT_HIDE_ID);
  demand(hide && hide.pose === authority!.pose, "Named Paris hide is not in this game's pinned source family");
  const rows = await c.db.targetVariantAsset.findMany({ where: { variant: "A", targetInstance: { gameScene: { gameId, sceneSlug: authority!.boardId }, targetId: hide!.targetId } } });
  demand(rows.length === 1, "Exactly one original Paris appearance required");
  const row = rows[0]!, previous = JSON.parse(row.judgeJson ?? "null");
  demand(row.provider === "local-patch" && row.status === "FAILED" && row.attempts === 1 && row.assetId && row.judgeJson
    && previous?.hide === QA_FIVE_NEXT_HIDE_ID && previous.reviewState === "board-review-complete" && previous.journeyHeadRecovery === undefined,
    "The named Paris head must be a concluded first failure without a head purchase");
  const requestKey = QA_FIVE_NEXT_HIDE_ID + ":" + hide!.pose + ":render:2";
  demand(!ledgerRequests.some(r => r.requestKey === requestKey) && !await new PrismaRetainedPurchaseStore(c.db).get(worldOf(gameId), requestKey),
    "The named second Paris purchase already exists");
  demand(!await c.db.auditLog.count({ where: { id: { in: [journeyHeadPinId(gameId, QA_FIVE_NEXT_HIDE_ID), journeySunburstHeadPinId(gameId)] } } }),
    "A finite Paris head pin already exists");
  return { kind: QA_FIVE_NEXT_OPERATION, hideId: QA_FIVE_NEXT_HIDE_ID, rowId: row.id, requestKey, previousJudgeSha256: bytesSha(row.judgeJson!),
    imageReserveMicroUsd: SUNBURST_IMAGE_RESERVE_MICRO_USD, reviewCoverageMicroUsd: SUNBURST_REVIEW_COVERAGE_MICRO_USD,
    requiredMicroUsd: SUNBURST_MIN_CAPACITY_MICRO_USD, remainingUnderBaseMicroUsd };
}

/** No purchase and no write: freeze exactly what the owner approves. */
export async function planQaFiveCompletion(c: Container, gameId: string) {
  demand(qualified(c) && validId(gameId), "Qualified existing QA game required");
  demand(!await receiptOf(c, gameId), "The five-dollar authority already exists");
  demand(!await otherGrantPresent(c.db, gameId), "Another completion grant already governs this world");
  const live = await qaCompletionSourceState(c, gameId), { game, child, state } = live;
  demand(state.sceneVersion === 13 && game.status === "TARGETS_GENERATING" && game.paidAt && !game.readyAt && !game.configJson
    && child.originalPhotoAssetId === state.photoAssetId, "Unfinished paid original Detective source required");
  const job = await c.db.generationJob.findUniqueOrThrow({ where: { id: "job_" + gameId } });
  demand(job.gameId === gameId && (job.status === "QUEUED" || job.status === "FAILED"), "A running or completed job cannot receive a grant");
  demand(!(await backgroundReviewWaiting(c.db, gameId, { inFlightOnly: true })).size, "Provider work must settle first");
  const stored = await PrismaWorldBudgetStore.forReadOnlyTransaction(c.db).read(state.worldId);
  demand(stored && stored.revision < WORLD_BUDGET_LEDGER_MAX_REVISION - 1, "Safe existing ledger required");
  const audit = applyBoardWizardBudgetCap(auditWorldBudget(stored!.snapshot));
  demand(audit.capMicroUsd === QA_FIVE_COMPLETION_BASE_CAP && !audit.held && !audit.overCapMicroUsd && !audit.pendingRequestKeys.length
    && !audit.conflictRequestKeys.length && !audit.overrunRequestKeys.length && audit.committedMicroUsd > 0,
    "The unchanged original four-dollar ledger must be free of pending or conflicting purchases");
  demand(audit.remainingMicroUsd < SUNBURST_MIN_CAPACITY_MICRO_USD, "The named operation still fits the original four dollars");
  const nextOperation = await nextOperationOf(c, gameId, stored!.snapshot.requests, audit.remainingMicroUsd);
  const rows = await c.db.targetVariantAsset.findMany({ where: { variant: "A", targetInstance: { gameScene: { gameId } } }, orderBy: { id: "asc" } });
  demand(rows.length === 27, "All27 original appearances required");
  const plan = qaFiveCompletionPlanSchema.parse({ version: QA_FIVE_COMPLETION_VERSION, state,
    baseCapMicroUsd: QA_FIVE_COMPLETION_BASE_CAP, capMicroUsd: QA_FIVE_COMPLETION_CAP, jobId: job.id, jobSha256: hash(job),
    ledgerRevision: stored!.revision, ledgerSha256: hash(stored!.snapshot), rowsSha256: hash(rows),
    committedMicroUsd: audit.committedMicroUsd, reservedMicroUsd: audit.reservedMicroUsd, nextOperation,
    originalRequests: stored!.snapshot.requests.map(r => ({ requestKey: r.requestKey, sha256: hash(r) })),
    unknowns: stored!.snapshot.requests.filter(r => r.state === "unknown").map(r => ({ requestKey: r.requestKey,
      operationFingerprint: r.operationFingerprint, reserveMicroUsd: r.reserveMicroUsd })).sort((a, b) => a.requestKey.localeCompare(b.requestKey)) });
  return { plan, planSha256: hash(plan), job };
}

/** Public preview for the owner's own approval page: money and the named
 * operation only; no photo, identity, path or private evidence. */
export async function previewQaFiveCompletion(c: Container, gameId: string) {
  const { plan, planSha256 } = await planQaFiveCompletion(c, gameId);
  return { gameId, planSha256, ownerId: plan.state.ownerId, baseCapMicroUsd: plan.baseCapMicroUsd, capMicroUsd: plan.capMicroUsd,
    committedMicroUsd: plan.committedMicroUsd, reservedMicroUsd: plan.reservedMicroUsd, unknownCount: plan.unknowns.length,
    nextOperation: { kind: plan.nextOperation.kind, hideId: plan.nextOperation.hideId, requiredMicroUsd: plan.nextOperation.requiredMicroUsd,
      remainingUnderBaseMicroUsd: plan.nextOperation.remainingUnderBaseMicroUsd } };
}

/** One explicitly approved cumulative ceiling and a fenced wake. No provider
 * request, attempt, picture, verdict, bill or UNKNOWN reserve is changed. */
export async function authorizeQaFiveCompletion(c: Container, input: {
  gameId: string; operatorId: string; expectedPlanSha256: string; ownerAuthorizationSha256: string;
}) {
  demand(qualified(c) && validId(input.gameId) && validId(input.operatorId) && /^[a-f0-9]{64}$/.test(input.expectedPlanSha256)
    && /^[a-f0-9]{64}$/.test(input.ownerAuthorizationSha256), "Bound explicit owner authorization required");
  const user = await c.db.user.findUnique({ where: { id: input.operatorId } });
  demand(user && c.adminEmails?.some(e => e.trim().toLowerCase() === user.email.trim().toLowerCase()), "Owner administrator required");
  const old = await receiptOf(c, input.gameId);
  if (old) {
    demand(old.operatorId === input.operatorId && old.ownerAuthorizationSha256 === input.ownerAuthorizationSha256
      && old.planSha256 === input.expectedPlanSha256, "Different authority cannot replace the original grant");
    demand(await readQaFiveCompletionBudget(c, worldOf(input.gameId)), "Existing five-dollar authority is no longer current");
    return old;
  }
  const first = await planQaFiveCompletion(c, input.gameId);
  demand(first.plan.state.ownerId === input.operatorId && first.planSha256 === input.expectedPlanSha256, "Stale plan or wrong owner");
  return c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, input.gameId);
    const inside = { ...c, db: tx as unknown as Container["db"], storage: new DbStorage(tx) } as Container;
    const fresh = await planQaFiveCompletion(inside, input.gameId);
    demand(fresh.planSha256 === first.planSha256, "Five-dollar plan changed before authorization");
    const body = { plan: fresh.plan, planSha256: fresh.planSha256, operatorId: input.operatorId,
      ownerAuthorizationSha256: input.ownerAuthorizationSha256, authorizedAt: new Date().toISOString(), automaticExtension: false as const,
      requestsPreserved: true as const, attemptsPreserved: true as const, qualityPolicyPreserved: true as const, exclusiveOfOtherGrants: true as const };
    const receipt = qaFiveCompletionReceiptSchema.parse({ ...body, authorizationSha256: hash(body) });
    const ledger = await tx.worldBudgetLedger.updateMany({ where: { worldId: receipt.plan.state.worldId, revision: receipt.plan.ledgerRevision }, data: { revision: { increment: 1 } } });
    const job = await tx.generationJob.updateMany({ where: { id: fresh.job.id, status: fresh.job.status, attempts: fresh.job.attempts,
      updatedAt: fresh.job.updatedAt, currentStep: fresh.job.currentStep, lastError: fresh.job.lastError }, data: { status: "QUEUED", currentStep: "local-patch", lastError: null } });
    demand(ledger.count === 1 && job.count === 1, "Concurrent budget or job change");
    await tx.auditLog.create({ data: { id: qaFiveCompletionId(input.gameId), actorType: "ADMIN", actorId: input.operatorId,
      action: QA_FIVE_COMPLETION_ACTION, entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify(receipt) } });
    const after = await PrismaWorldBudgetStore.forReadOnlyTransaction(tx).read(receipt.plan.state.worldId);
    demand(after && hash(after.snapshot) === receipt.plan.ledgerSha256, "Authorization changed a bill");
    return receipt;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}
