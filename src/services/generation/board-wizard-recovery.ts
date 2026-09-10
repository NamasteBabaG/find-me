import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Container } from "../container";
import type { Actor } from "../audit.service";
import { env } from "../../lib/env";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../../infra/db/world-budget-repository";
import { PrismaBoardConditionedCheckpointStore } from "../../infra/db/board-conditioned-checkpoints";
import { prepareBoardPoseObservation } from "../../infra/generation/board-pose-observer";
import { BOARD_WIZARD_STYLE, BOARD_WIZARD_OBSERVER_POLICY, BOARD_WIZARD_SOURCE_POLICY, boardWizardEnabled, readBoardWizard } from "./board-conditioned-wizard";
import { boardConditioningHash } from "./board-conditioned-source";
import { requireBoardWizardIdentityApproval } from "./board-wizard-identity-gate";
import { boardWizardBudget, BOARD_WIZARD_CAP_MICRO_USD } from "./board-wizard-budget";
import { auditWorldBudget } from "./world-budget";

export const BOARD_WIZARD_RECOVERY_AUTHORITY = "one-same-source-measurement-retain-unknown-four-dollar-cap/v1";
export const boardWizardRecoveryRequestSchema = z.object({
  gameId: z.string().regex(/^[A-Za-z0-9_-]{1,120}$/),
  expectedStepsSha256: z.string().regex(/^[a-f0-9]{64}$/),
  expectedLedgerSha256: z.string().regex(/^[a-f0-9]{64}$/),
  confirm: z.literal(BOARD_WIZARD_RECOVERY_AUTHORITY),
}).strict();
export type BoardWizardRecoveryRequest = z.infer<typeof boardWizardRecoveryRequestSchema>;
export class BoardWizardRecoveryError extends Error {
  constructor(readonly code: "forbidden" | "ineligible" | "conflict", message: string) { super(message); this.name = "BoardWizardRecoveryError"; }
}
function demand(value: unknown, code: BoardWizardRecoveryError["code"], message: string): asserts value { if (!value) throw new BoardWizardRecoveryError(code, message); }

/** Read-only qualification; arbitrary held games, identity failures and later
 * unknown requests are not generic retry candidates. Never returns child pixels. */
export async function qualifyBoardWizardTransportRecovery(c: Container, gameId: string) {
  demand(boardWizardEnabled() && env().APP_ENV === "qa" && c.storage.id === "db", "forbidden", "Recovery is available only in the explicit QA wizard");
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, orders: true } });
  const job = await c.db.generationJob.findUnique({ where: { id: `job_${gameId}` } });
  demand(game && !game.deletedAt && game.status === "MANUAL_REVIEW" && game.styleVersion === BOARD_WIZARD_STYLE && game.paidAt
    && game.ownerId && game.childProfile && !game.childProfile.deletedAt && game.childProfile.ownerId === game.ownerId
    && game.orders.some(o => o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    && !game.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt), "ineligible", "A live paid, nonrefunded held wizard game is required");
  demand(job && job.gameId === gameId && job.status === "DONE", "ineligible", "The stopped job must have no active lease");
  const record = readBoardWizard(job.stepsJson), worldId = `${gameId}:board-wizard`;
  demand(record.gameId === gameId && record.ownerId === game.ownerId && record.childProfileId === game.childProfileId
    && record.state === "held" && record.capMicroUsd === BOARD_WIZARD_CAP_MICRO_USD
    && record.identityAssetId === game.childProfile.identityAssetId && record.ageYears === game.childProfile.ageYears
    && record.childName === game.childProfile.displayName
    && record.sourcePolicySha256 === boardConditioningHash(BOARD_WIZARD_SOURCE_POLICY)
    && record.observerPolicySha256 === boardConditioningHash(BOARD_WIZARD_OBSERVER_POLICY), "ineligible", "Held identity, catalog or policy changed");
  const stored = await new PrismaWorldBudgetStore(c.db).read(worldId);
  demand(stored && !stored.snapshot.unknownContinuationApprovals?.length, "ineligible", "Only one explicitly authorized transport recovery is permitted");
  const audit = auditWorldBudget(stored.snapshot), unknown = stored.snapshot.requests.filter(r => r.state === "unknown");
  demand(audit.held && unknown.length === 1 && !audit.pendingRequestKeys.length && !audit.conflictRequestKeys.length && !audit.overrunRequestKeys.length
    && audit.committedMicroUsd + BOARD_WIZARD_OBSERVER_POLICY.reserveMicroUsd <= BOARD_WIZARD_CAP_MICRO_USD,
  "ineligible", "The retained unknown plus one new observation must fit the unchanged four-dollar ceiling");
  const request = unknown[0]!, match = /^(attempt-2:)?board:([A-Za-z0-9_-]+):measure:1$/.exec(request.requestKey);
  demand(match && request.scope === "judge" && request.origin === "reserved" && request.reserveMicroUsd === BOARD_WIZARD_OBSERVER_POLICY.reserveMicroUsd
    && request.unknownReasons.length === 1 && request.unknownReasons[0] === "board-observation-transport-or-response-unresolved", "ineligible", "Only an unresolved first source observation can be continued");
  const sourceAttempt = match[1] ? 2 as const : 1 as const, boardId = match[2]!;
  const board = record.boards.find(b => b.boardId === boardId), direction = record.catalog.boards.find(b => b.boardId === boardId);
  demand(board && direction && board.state === "pending" && board.attempts <= sourceAttempt
    && !board.remeasurements?.some(r => r.sourceAttempt === sourceAttempt), "ineligible", "This exact source must not have consumed a second observation");
  const checkpointBoard = sourceAttempt === 2 ? `${boardId}--attempt-2` : boardId;
  const checkpoints = new PrismaBoardConditionedCheckpointStore(c.db), source = await checkpoints.getSource(worldId, checkpointBoard);
  demand(source && !(await checkpoints.getMeasurement(worldId, checkpointBoard, 1)) && !(await checkpoints.getMeasurement(worldId, checkpointBoard, 2)), "ineligible", "The original paid sheet must exist without a usable or second observation");
  const observed = await prepareBoardPoseObservation({ sheetPng: source.png, slots: direction.slots.map(d => ({ slotId: d.slot.id, pose: d.slot.pose })) }, BOARD_WIZARD_OBSERVER_POLICY);
  demand(observed.fingerprint === request.operationFingerprint, "ineligible", "The unknown charge does not belong to this source and slot map");
  const sourceCharge = stored.snapshot.requests.find(r => r.requestKey === `${sourceAttempt === 2 ? "attempt-2:" : ""}board:${boardId}:source:1`);
  demand(sourceCharge && (sourceCharge.state === "settled" || sourceCharge.state === "linked")
    && sourceCharge.operationFingerprint === source.fingerprint && sourceCharge.evidence.providerRequestId === source.evidence.providerRequestId
    && sourceCharge.evidence.amountMicroUsd === source.evidence.amountMicroUsd, "ineligible", "Retained source lacks its original settled charge");
  await requireBoardWizardIdentityApproval(c, boardWizardBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(c.db))), {
    gameId, identityAssetId: record.identityAssetId, sheetSha256: record.identitySourceSha256, catalogSha256: record.catalogSha256,
    photoAssetId: game.childProfile.originalPhotoAssetId, ageYears: record.ageYears,
    crop: game.childProfile.photoCropJson ? JSON.parse(game.childProfile.photoCropJson) : null,
  });
  return { game, job, record, stored, request, board, boardId, sourceAttempt, worldId, audit };
}

export async function boardWizardRecoveryForm(c: Container, gameId: string) {
  try {
    const state = await qualifyBoardWizardTransportRecovery(c, gameId);
    return { gameId, expectedStepsSha256: boardConditioningHash(state.job.stepsJson), expectedLedgerSha256: boardConditioningHash(state.stored.snapshot),
      boardId: state.boardId, retainedUnknownMicroUsd: state.request.reserveMicroUsd, committedMicroUsd: state.audit.committedMicroUsd };
  } catch { return null; } // Display only; action repeats all checks and fails closed.
}

/** ADMIN-only state bridge. No API calls, enqueue, payment bypass, cap increase,
 * imagery mutation or automatic publication. Permission leaves this function
 * only after the enclosing Game + Job + ledger + authority transaction commits. */
export async function authorizeBoardWizardTransportRecovery(c: Container, actor: Actor, raw: unknown) {
  const input = boardWizardRecoveryRequestSchema.parse(raw);
  demand(actor.type === "ADMIN" && actor.id.trim(), "forbidden", "An authenticated administrator is required");
  const admin = await c.db.user.findUnique({ where: { id: actor.id }, select: { email: true } });
  demand(admin && c.adminEmails?.some(email => email.trim().toLowerCase() === admin.email.toLowerCase()), "forbidden", "Administrator not authorized");
  const state = await qualifyBoardWizardTransportRecovery(c, input.gameId);
  demand(input.expectedStepsSha256 === boardConditioningHash(state.job.stepsJson)
    && input.expectedLedgerSha256 === boardConditioningHash(state.stored.snapshot), "conflict", "The stopped game changed; review the current authorization form");
  const authorizedAt = new Date().toISOString();
  const authority = { version: BOARD_WIZARD_RECOVERY_AUTHORITY, gameId: input.gameId, boardId: state.boardId, sourceAttempt: state.sourceAttempt,
    requestKey: state.request.requestKey, expectedStepsSha256: input.expectedStepsSha256, expectedLedgerSha256: input.expectedLedgerSha256,
    retainedUnknownMicroUsd: state.request.reserveMicroUsd, maximumNewObservations: 1, newImageGeneration: false,
    worldCapMicroUsd: BOARD_WIZARD_CAP_MICRO_USD, operatorId: actor.id, authorizedAt };
  const authorizationSha256 = boardConditioningHash(authority), approvalId = `wizard-recovery:${authorizationSha256}`;
  return c.db.$transaction(async tx => {
    const gameFence = await tx.game.updateMany({ where: { id: state.game.id, updatedAt: state.game.updatedAt, deletedAt: null,
      status: "MANUAL_REVIEW", styleVersion: BOARD_WIZARD_STYLE, ownerId: state.record.ownerId, childProfileId: state.record.childProfileId }, data: { updatedAt: new Date() } });
    const jobFence = await tx.generationJob.updateMany({ where: { id: state.job.id, status: "DONE", attempts: state.job.attempts, stepsJson: state.job.stepsJson }, data: { updatedAt: new Date() } });
    const child = await tx.childProfile.findUniqueOrThrow({ where: { id: state.record.childProfileId } });
    const orders = await tx.order.findMany({ where: { gameId: state.game.id }, select: { paymentStatus: true, paidAt: true, refundedAt: true } });
    demand(gameFence.count === 1 && jobFence.count === 1 && orders.some(order => order.paymentStatus === "PAID" && order.paidAt && !order.refundedAt)
      && !orders.some(order => order.paymentStatus === "REFUNDED" || order.refundedAt)
      && !child.deletedAt && child.ownerId === state.record.ownerId && child.identityAssetId === state.record.identityAssetId
      && child.originalPhotoAssetId === state.game.childProfile!.originalPhotoAssetId && child.photoCropJson === state.game.childProfile!.photoCropJson
      && child.ageYears === state.record.ageYears && child.displayName === state.record.childName, "conflict", "Game, payment, child or job changed during authorization");
    const store = PrismaWorldBudgetStore.forContinuationApprovalTransaction(tx);
    const current = await store.read(state.worldId);
    demand(current && current.revision === state.stored.revision && boardConditioningHash(current.snapshot) === input.expectedLedgerSha256, "conflict", "The world ledger changed");
    const budget = boardWizardBudget(new CasWorldBudgetRepository(store), 1, { authorizeUnknownContinuation: async approval => approval.operatorId === actor.id && approval.authorizationSha256 === authorizationSha256 });
    const approved = await budget.authorizeUnknownContinuation(state.worldId, { approvalId, requestKey: state.request.requestKey, scope: state.request.scope,
      operationFingerprint: state.request.operationFingerprint, reserveMicroUsd: state.request.reserveMicroUsd, unknownReasons: [...state.request.unknownReasons],
      operatorId: actor.id, authorizationSha256, authorizedAt });
    demand(approved.acquired && !approved.audit.held && approved.audit.committedMicroUsd === state.audit.committedMicroUsd, "conflict", "Continuation changed accounting or remains held");
    state.board.attempts = state.sourceAttempt;
    state.board.awaitingMeasurement = false;
    state.board.remeasurements = [...(state.board.remeasurements ?? []), { sourceAttempt: state.sourceAttempt, state: "pending", kind: "transport-recovery", approvalId }];
    state.record.state = "running";
    const stepsJson = JSON.stringify({ ...JSON.parse(state.job.stepsJson), boardWizard: state.record });
    readBoardWizard(stepsJson);
    await tx.auditLog.create({ data: { id: `aud_bwr_${authorizationSha256}`, actorType: "ADMIN", actorId: actor.id,
      action: "board-wizard:transport-recovery-authorized", entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify({ ...authority, authorizationSha256, approvalId }) } });
    await tx.generationJob.update({ where: { id: state.job.id }, data: { stepsJson, status: "DONE", currentStep: null, lastError: null } });
    await tx.game.update({ where: { id: state.game.id }, data: { status: "TARGETS_GENERATING", lastError: null } });
    return { gameId: input.gameId, boardId: state.boardId, approvalId, state: "recovery-authorized" as const, automaticRelease: false as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}
