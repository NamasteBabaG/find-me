import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { DbStorage } from "../../infra/storage/db";
import { QA_SUNBURST_TAIL_BASE_CAP, QA_SUNBURST_TAIL_CAP, QA_SUNBURST_TAIL_COMPLETION_ACTION, QA_SUNBURST_TAIL_COMPLETION_VERSION,
  qaSunburstTailCompletionId, qaSunburstTailPlanSchema, qaSunburstTailReceiptSchema, qaSunburstTailRequestKey,
  type QaSunburstTailOperation, type QaSunburstTailReceipt } from "../../domain/generation/qa-sunburst-tail-completion";
import { JOURNEY_SUNBURST_TAIL_HIDE_IDS, JOURNEY_SUNBURST_TAIL_VERSION, journeySunburstTailPinId } from "../../domain/generation/journey-sunburst-tail";
import { SUNBURST_IMAGE_RESERVE_MICRO_USD, SUNBURST_MIN_CAPACITY_MICRO_USD, SUNBURST_REVIEW_COVERAGE_MICRO_USD } from "../../domain/generation/sunburst-painter";
import { JOURNEY_SUNBURST_HEAD_HIDE_ID, journeyHeadPinId, journeySunburstHeadPinId } from "../../domain/generation/journey-source-head";
import { qaFiveCompletionId } from "../../domain/generation/qa-five-dollar-completion";
import { qaCompletionCapacityId } from "../../domain/generation/qa-completion-capacity";
import { detectivesCompletionId, detectivesExtensionId, detectivesTailId } from "../../domain/generation/detectives-completion-budget";
import { leanCapacityRecoveryId } from "../../domain/generation/lean-capacity-recovery";
import { localPatchReadyReviewOwed } from "../../domain/scene/local-patch-progress";
import { retainedWindowCanonicalHash as hash } from "../../domain/generation/retained-window";
import { PrismaWorldBudgetStore, WORLD_BUDGET_LEDGER_MAX_REVISION } from "../../infra/db/prisma-world-budget-store";
import { PrismaRetainedPurchaseStore } from "../../infra/db/prisma-retained-purchase-store";
import { qaCompletionSourceState } from "./qa-completion-capacity";
import { leanCompletionBudgetAuditId } from "./lean-completion-budget";
import { localPatchEmergencyBudgetAuditId } from "./local-patch-budget-recovery";
import { auditWorldBudget } from "./world-budget";
import { applyBoardWizardBudgetCap, type BoardWizardBudgetGrant } from "./board-wizard-budget";
import { backgroundReviewWaiting } from "./continuity-background";
import { fenceLocalPatchImages } from "./local-patch-lifecycle";
import { resolveLocalPatchBoardsForGame } from "./source-placement-release";

/**
 * explicit-existing-qa-sunburst-tail-completion/v1: one ADMIN owner grant that raises
 * ONE existing paid scene-13 QA Detective game's cumulative ceiling from four to five
 * dollars for a frozen finite list of one to three named Sunburst SOURCE-head repaints.
 * Planned only when every other appearance is already acceptable, nothing is pending
 * or owed, and the original four dollars cannot cover the complete list while five can.
 * Exclusive of every other completion grant, the released single-Paris five-dollar
 * receipt included. It never resets, releases or rewrites a bill, attempt, judgement
 * or UNKNOWN reserve; it neither buys nor approves anything.
 *
 * Deliberately independent of qa-five-dollar-completion's service (which reads THIS
 * module) and of board-conditioned-wizard (whose resolver reads that one).
 */
const demand = (ok: unknown, reason: string): void => { if (!ok) throw Error("QA_SUNBURST_TAIL: " + reason); };
const qualified = (c: Pick<Container, "storage">) => env().APP_ENV === "qa" && c.storage?.id === "db";
const validId = (value: string) => /^[A-Za-z0-9_-]{1,160}$/.test(value);
const bytesSha = (text: string) => createHash("sha256").update(text).digest("hex");
const worldOf = (gameId: string) => gameId + ":board-wizard";

/** Every OTHER explicit capacity authority a world can hold, the v1 five-dollar receipt included. */
function otherGrantIds(gameId: string) {
  const worldId = worldOf(gameId);
  return [qaFiveCompletionId(gameId), qaCompletionCapacityId(gameId), detectivesCompletionId(gameId), detectivesExtensionId(gameId),
    detectivesTailId(gameId), leanCapacityRecoveryId(gameId), leanCompletionBudgetAuditId(gameId), localPatchEmergencyBudgetAuditId(worldId)];
}
async function otherGrantPresent(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string) {
  return (await db.auditLog.count({ where: { id: { in: otherGrantIds(gameId) } } })) > 0;
}

async function receiptOf(c: Pick<Container, "db">, gameId: string): Promise<QaSunburstTailReceipt | null> {
  const row = await c.db.auditLog.findUnique({ where: { id: qaSunburstTailCompletionId(gameId) } });
  if (!row) return null;
  if (row.metaJson === null) {
    const game = await c.db.game.findUnique({ where: { id: gameId }, select: { status: true, deletedAt: true } });
    demand(game?.status === 'DELETED' && game.deletedAt, 'Purged Sunburst tail authority without completed deletion');
    return null;
  }
  const receipt = qaSunburstTailReceiptSchema.parse(JSON.parse(row.metaJson ?? "null")), { authorizationSha256, ...body } = receipt;
  demand(row.actorType === "ADMIN" && row.actorId === receipt.operatorId && receipt.operatorId === receipt.plan.state.ownerId
    && row.action === QA_SUNBURST_TAIL_COMPLETION_ACTION && row.entityType === "Game" && row.entityId === gameId
    && receipt.plan.state.gameId === gameId && receipt.plan.state.worldId === worldOf(gameId)
    && row.metaJson === JSON.stringify(receipt) && hash(body) === authorizationSha256
    && hash(receipt.plan) === receipt.planSha256, "Invalid immutable Sunburst tail authority");
  return receipt;
}

/** Budget resolver input. Exclusive: beside any other completion grant (the v1
 * five-dollar receipt included) the world is invalid, never a fallback or a sum.
 * Withdrawn (null) by refund, deletion, ownership, identity or source change. */
export async function readQaSunburstTailCompletionBudget(c: Container, worldId: string): Promise<BoardWizardBudgetGrant | null> {
  if (!qualified(c) || !worldId.endsWith(":board-wizard")) return null;
  const gameId = worldId.slice(0, -":board-wizard".length);
  if (!validId(gameId)) return null;
  const receipt = await receiptOf(c, gameId);
  if (!receipt) return null;
  demand(!await otherGrantPresent(c.db, gameId), "Sunburst tail authority cannot coexist with another completion grant");
  let live; try { live = await qaCompletionSourceState(c, gameId); } catch { return null; }
  if (hash(live.state) !== hash(receipt.plan.state)) return null;
  const { readJourneyWallReplacementPin } = await import('./journey-source-head-recovery');
  const replacement = await readJourneyWallReplacementPin(c.db, gameId);
  if (replacement) demand(replacement.completionAuthorizationSha256 === receipt.authorizationSha256
    && replacement.ownerId === receipt.plan.state.ownerId && receipt.plan.operations.some(op =>
      op.hideId === replacement.hideId && op.rowId === replacement.rowId), 'replacement belongs to a different finite tail');
  return { worldId, capMicroUsd: QA_SUNBURST_TAIL_CAP, authorizationSha256: receipt.authorizationSha256,
    imageAboveBaseSet: { baseCapMicroUsd: QA_SUNBURST_TAIL_BASE_CAP,
      requests: receipt.plan.operations.map(op => ({
        requestKey: replacement && op.hideId === replacement.hideId ? replacement.requestKey : op.requestKey,
        reserveMicroUsd: op.imageReserveMicroUsd,
      })) } };
}

/** For root's native tail pins: the active receipt, with every pre-grant request
 * (settled bills and UNKNOWN reserves) still byte-identical. A real later
 * reconciliation of an original request therefore fails closed. */
export async function qaSunburstTailCompletionActive(c: Container, gameId: string): Promise<QaSunburstTailReceipt | null> {
  if (!qualified(c) || !validId(gameId)) return null;
  const receipt = await receiptOf(c, gameId);
  if (!receipt || !await readQaSunburstTailCompletionBudget(c, worldOf(gameId))) return null;
  const ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(c.db).read(worldOf(gameId));
  if (!ledger || !receipt.plan.originalRequests.every(old => ledger.snapshot.requests.some(r => r.requestKey === old.requestKey && hash(r) === old.sha256)))
    return null;
  return receipt;
}

/** Owner/admin visibility: a recorded grant never silently disappears. */
export async function qaSunburstTailCompletionStatus(c: Container, gameId: string) {
  if (!qualified(c) || !validId(gameId)) return null;
  const receipt = await receiptOf(c, gameId);
  if (!receipt) return null;
  let active = false;
  try { active = !!await readQaSunburstTailCompletionBudget(c, receipt.plan.state.worldId); } catch { active = false; }
  return { ownerId: receipt.plan.state.ownerId, baseCapMicroUsd: QA_SUNBURST_TAIL_BASE_CAP, capMicroUsd: QA_SUNBURST_TAIL_CAP,
    requiredMicroUsd: receipt.plan.requiredMicroUsd,
    operations: receipt.plan.operations.map(op => ({ kind: op.kind, hideId: op.hideId, requiredMicroUsd: op.requiredMicroUsd })),
    status: active ? "active" as const : "withdrawn" as const };
}

type Row = { id: string; provider: string; status: string; attempts: number; assetId: string | null; judgeJson: string | null;
  targetInstance: { targetId: string; gameScene: { sceneSlug: string } } };

/** The finite list, read-only: a named appearance is an operation only when it is a
 * concluded first FAILED attempt with no second purchase and no head pin; an
 * acceptable named appearance is simply not listed; anything else refuses. */
async function operationsOf(c: Container, gameId: string, sceneVersion: number, rows: readonly Row[],
  ledgerRequests: readonly { requestKey: string }[]): Promise<{ operations: QaSunburstTailOperation[]; operationRows: Set<string> }> {
  const placement = await resolveLocalPatchBoardsForGame(c.db, gameId, sceneVersion);
  const operations: QaSunburstTailOperation[] = [], operationRows = new Set<string>();
  const retained = new PrismaRetainedPurchaseStore(c.db);
  for (const hideId of JOURNEY_SUNBURST_TAIL_HIDE_IDS) {
    const boards = placement.boards.filter(b => b.hides.some(h => h.id === hideId));
    demand(boards.length === 1, `${hideId} is not in this game's pinned source family`);
    const board = boards[0]!, hide = board.hides.find(h => h.id === hideId)!;
    const matches = rows.filter(r => r.targetInstance.gameScene.sceneSlug === board.board && r.targetInstance.targetId === hide.targetId);
    demand(matches.length === 1, `Exactly one original appearance of ${hideId} required`);
    const row = matches[0]!;
    if (row.status === "GENERATED" && !localPatchReadyReviewOwed(row, { required: true })) continue;
    const previous = (() => { try { return JSON.parse(row.judgeJson ?? "null"); } catch { return null; } })();
    demand(row.provider === "local-patch" && row.status === "FAILED" && row.attempts === 1 && row.assetId && row.judgeJson
      && previous?.hide === hideId && previous.reviewState === "board-review-complete" && previous.journeyHeadRecovery === undefined,
      `${hideId} must be acceptable or a concluded first failure without a head purchase`);
    const requestKey = qaSunburstTailRequestKey(hideId, hide.pose);
    demand(!ledgerRequests.some(r => r.requestKey === requestKey || r.requestKey === "attempt-2:" + requestKey)
      && !await retained.get(worldOf(gameId), requestKey), `The second purchase of ${hideId} already exists`);
    const pins = [journeyHeadPinId(gameId, hideId), journeySunburstTailPinId(gameId, hideId),
      ...(hideId === JOURNEY_SUNBURST_HEAD_HIDE_ID ? [journeySunburstHeadPinId(gameId)] : [])];
    demand(!await c.db.auditLog.count({ where: { id: { in: pins } } }), `A finite head pin of ${hideId} already exists`);
    operations.push({ kind: JOURNEY_SUNBURST_TAIL_VERSION, hideId, rowId: row.id, requestKey, previousJudgeSha256: bytesSha(row.judgeJson!),
      imageReserveMicroUsd: SUNBURST_IMAGE_RESERVE_MICRO_USD, reviewCoverageMicroUsd: SUNBURST_REVIEW_COVERAGE_MICRO_USD,
      requiredMicroUsd: SUNBURST_MIN_CAPACITY_MICRO_USD });
    operationRows.add(row.id);
  }
  return { operations, operationRows };
}

/** No purchase and no write: freeze exactly what the owner approves. */
export async function planQaSunburstTailCompletion(c: Container, gameId: string) {
  demand(qualified(c) && validId(gameId), "Qualified existing QA game required");
  demand(!await receiptOf(c, gameId), "The Sunburst tail authority already exists");
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
  demand(audit.capMicroUsd === QA_SUNBURST_TAIL_BASE_CAP && !audit.held && !audit.overCapMicroUsd && !audit.pendingRequestKeys.length
    && !audit.conflictRequestKeys.length && !audit.overrunRequestKeys.length && audit.committedMicroUsd > 0,
    "The unchanged original four-dollar ledger must be free of pending or conflicting purchases");
  const rows = await c.db.targetVariantAsset.findMany({ where: { variant: "A", targetInstance: { gameScene: { gameId } } },
    include: { targetInstance: { include: { gameScene: true } } }, orderBy: { id: "asc" } }) as unknown as Row[];
  demand(rows.length === 27, "All27 original appearances required");
  const { operations, operationRows } = await operationsOf(c, gameId, state.sceneVersion, rows, stored!.snapshot.requests);
  demand(operations.length > 0, "No named appearance needs a Sunburst repaint");
  // Free window restores and their ordinary reviews finish BEFORE the list is frozen.
  demand(rows.every(r => operationRows.has(r.id) || r.status === "GENERATED" && !localPatchReadyReviewOwed(r, { required: true })),
    "Every other appearance must already be acceptable with no ordinary review owed");
  const requiredMicroUsd = operations.reduce((sum, op) => sum + op.requiredMicroUsd, 0);
  demand(audit.remainingMicroUsd < requiredMicroUsd, "The complete list still fits the original four dollars");
  demand(audit.committedMicroUsd + requiredMicroUsd <= QA_SUNBURST_TAIL_CAP, "The complete list does not fit five dollars");
  const plan = qaSunburstTailPlanSchema.parse({ version: QA_SUNBURST_TAIL_COMPLETION_VERSION, state,
    baseCapMicroUsd: QA_SUNBURST_TAIL_BASE_CAP, capMicroUsd: QA_SUNBURST_TAIL_CAP, jobId: job.id, jobSha256: hash(job),
    ledgerRevision: stored!.revision, ledgerSha256: hash(stored!.snapshot), rowsSha256: hash(rows),
    committedMicroUsd: audit.committedMicroUsd, reservedMicroUsd: audit.reservedMicroUsd, remainingUnderBaseMicroUsd: audit.remainingMicroUsd,
    requiredMicroUsd, operations,
    originalRequests: stored!.snapshot.requests.map(r => ({ requestKey: r.requestKey, sha256: hash(r) })),
    unknowns: stored!.snapshot.requests.filter(r => r.state === "unknown").map(r => ({ requestKey: r.requestKey,
      operationFingerprint: r.operationFingerprint, reserveMicroUsd: r.reserveMicroUsd })).sort((a, b) => a.requestKey.localeCompare(b.requestKey)) });
  return { plan, planSha256: hash(plan), job };
}

/** Public preview for the owner's own approval page: money and the named
 * operations only; no photo, identity, path or private evidence. */
export async function previewQaSunburstTailCompletion(c: Container, gameId: string) {
  const { plan, planSha256 } = await planQaSunburstTailCompletion(c, gameId);
  return { gameId, planSha256, ownerId: plan.state.ownerId, baseCapMicroUsd: plan.baseCapMicroUsd, capMicroUsd: plan.capMicroUsd,
    committedMicroUsd: plan.committedMicroUsd, reservedMicroUsd: plan.reservedMicroUsd, unknownCount: plan.unknowns.length,
    remainingUnderBaseMicroUsd: plan.remainingUnderBaseMicroUsd, requiredMicroUsd: plan.requiredMicroUsd,
    operations: plan.operations.map(op => ({ kind: op.kind, hideId: op.hideId, imageReserveMicroUsd: op.imageReserveMicroUsd,
      reviewCoverageMicroUsd: op.reviewCoverageMicroUsd, requiredMicroUsd: op.requiredMicroUsd })) };
}

/** One explicitly approved cumulative ceiling and a fenced wake. No provider
 * request, attempt, picture, verdict, bill or UNKNOWN reserve is changed. */
export async function authorizeQaSunburstTailCompletion(c: Container, input: {
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
    demand(await readQaSunburstTailCompletionBudget(c, worldOf(input.gameId)), "Existing Sunburst tail authority is no longer current");
    return old;
  }
  const first = await planQaSunburstTailCompletion(c, input.gameId);
  demand(first.plan.state.ownerId === input.operatorId && first.planSha256 === input.expectedPlanSha256, "Stale plan or wrong owner");
  return c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, input.gameId);
    const inside = { ...c, db: tx as unknown as Container["db"], storage: new DbStorage(tx) } as Container;
    const fresh = await planQaSunburstTailCompletion(inside, input.gameId);
    demand(fresh.planSha256 === first.planSha256, "Sunburst tail plan changed before authorization");
    const body = { plan: fresh.plan, planSha256: fresh.planSha256, operatorId: input.operatorId,
      ownerAuthorizationSha256: input.ownerAuthorizationSha256, authorizedAt: new Date().toISOString(), automaticExtension: false as const,
      requestsPreserved: true as const, attemptsPreserved: true as const, qualityPolicyPreserved: true as const, exclusiveOfOtherGrants: true as const };
    const receipt = qaSunburstTailReceiptSchema.parse({ ...body, authorizationSha256: hash(body) });
    const ledger = await tx.worldBudgetLedger.updateMany({ where: { worldId: receipt.plan.state.worldId, revision: receipt.plan.ledgerRevision }, data: { revision: { increment: 1 } } });
    const job = await tx.generationJob.updateMany({ where: { id: fresh.job.id, status: fresh.job.status, attempts: fresh.job.attempts,
      updatedAt: fresh.job.updatedAt, currentStep: fresh.job.currentStep, lastError: fresh.job.lastError }, data: { status: "QUEUED", currentStep: "local-patch", lastError: null } });
    demand(ledger.count === 1 && job.count === 1, "Concurrent budget or job change");
    await tx.auditLog.create({ data: { id: qaSunburstTailCompletionId(input.gameId), actorType: "ADMIN", actorId: input.operatorId,
      action: QA_SUNBURST_TAIL_COMPLETION_ACTION, entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify(receipt) } });
    const after = await PrismaWorldBudgetStore.forReadOnlyTransaction(tx).read(receipt.plan.state.worldId);
    demand(after && hash(after.snapshot) === receipt.plan.ledgerSha256, "Authorization changed a bill");
    return receipt;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}
