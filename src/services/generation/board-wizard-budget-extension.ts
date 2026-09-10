import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { PrismaWorldBudgetStore, WORLD_BUDGET_LEDGER_MAX_REVISION } from "../../infra/db/prisma-world-budget-store";
import { boardConditioningHash } from "./board-conditioned-source";
import { auditWorldBudget } from "./world-budget";
import type { BoardWizardBudgetExtension } from "./board-wizard-budget";

export const BOARD_WIZARD_BUDGET_EXTENSION_ACTION = "board-wizard:budget-extension-authorized";
export const BOARD_WIZARD_BUDGET_EXTENSION_VERSION = "explicit-user-qa-world-five-dollar-extension/v1";
const digest = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().regex(/^[A-Za-z0-9_:-]{1,240}$/);
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const bodySchema = z.object({
  version: z.literal(BOARD_WIZARD_BUDGET_EXTENSION_VERSION), gameId: id, worldId: id, ownerId: id, childProfileId: id,
  catalogSha256: digest, identityAssetId: id, baseCapMicroUsd: z.literal(4_000_000), capMicroUsd: z.literal(5_000_000),
  expectedStepsSha256: digest, expectedLedgerSha256: digest, ledgerRevision: money,
  settledMicroUsd: money, reservedMicroUsd: money, committedMicroUsd: money,
  refusedReservation: z.object({ requestKey: id, reserveMicroUsd: money }).strict().optional(),
  retainedUnknownRequests: z.array(z.object({ requestKey: id, operationFingerprint: digest, reserveMicroUsd: money }).strict()),
  authorizationEvidenceSha256: digest, systemOperatorId: id,
  authorizedAt: z.string().datetime(), automaticRelease: z.literal(false),
}).strict();
export const boardWizardBudgetExtensionReceiptSchema = bodySchema.extend({ authorizationSha256: digest }).strict();
export type BoardWizardBudgetExtensionReceipt = z.infer<typeof boardWizardBudgetExtensionReceiptSchema>;
const inputSchema = z.object({ gameId: id, expectedStepsSha256: digest, expectedLedgerSha256: digest,
  authorizationEvidenceSha256: digest, systemOperatorId: id, authorizedAt: z.string().datetime() }).strict();
export type BoardWizardBudgetExtensionInput = z.infer<typeof inputSchema>;
export interface BoardWizardBudgetExtensionAuthority {
  /** The internal operator/tool entrypoint verifies the user's explicit grant.
   * A caller-supplied SYSTEM role or a hash alone is NOT authorization. */
  verifyExplicitUserAuthorization(receipt: Readonly<BoardWizardBudgetExtensionReceipt>): Promise<boolean>;
}
function demand(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(`BOARD_BUDGET_EXTENSION: ${reason}`); }
export const boardWizardBudgetExtensionAuditId = (worldId: string) => `aud_bwcap_${boardConditioningHash(worldId)}`;
function checkedReceipt(raw: unknown) {
  const receipt = boardWizardBudgetExtensionReceiptSchema.parse(raw), { authorizationSha256, ...body } = receipt;
  demand(boardConditioningHash(body) === authorizationSha256 && receipt.worldId === `${receipt.gameId}:board-wizard`, "Receipt hash or world scope changed");
  demand(receipt.settledMicroUsd + receipt.reservedMicroUsd === receipt.committedMicroUsd, "Receipt accounting changed");
  return receipt;
}

/** Trusted, QA-only resolver. No capsule cap can authorize its own increase. */
export async function readBoardWizardBudgetExtension(c: Container, worldId: string): Promise<BoardWizardBudgetExtension | null> {
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "Extension lookup is restricted to durable QA storage");
  const row = await c.db.auditLog.findUnique({ where: { id: boardWizardBudgetExtensionAuditId(worldId) } });
  if (!row) return null;
  demand(row.actorType === "SYSTEM" && row.actorId === null && row.action === BOARD_WIZARD_BUDGET_EXTENSION_ACTION && row.entityType === "Game" && row.metaJson,
    "Extension is not an immutable SYSTEM authorization receipt");
  const receipt = checkedReceipt(JSON.parse(row.metaJson));
  demand(receipt.worldId === worldId && receipt.gameId === row.entityId, "Extension belongs to another game");
  const game = await c.db.game.findUnique({ where: { id: receipt.gameId }, select: { ownerId: true, childProfileId: true, styleVersion: true, deletedAt: true } });
  demand(game && !game.deletedAt && game.styleVersion === "fixed-sprite-board-wizard-v1" && game.ownerId === receipt.ownerId && game.childProfileId === receipt.childProfileId,
    "Extended game ownership or lifecycle changed");
  return { worldId, capMicroUsd: receipt.capMicroUsd, authorizationSha256: receipt.authorizationSha256 };
}

/** Read-only operator plan, also usable by a separately reviewed exact-CAS SQL
 * operator when application credentials are unavailable. Contains no images,
 * secrets, fabricated usage, new HTTP request or permission to publish. */
export async function prepareBoardWizardBudgetExtension(c: Container, raw: unknown, authority: BoardWizardBudgetExtensionAuthority) {
  const input = inputSchema.parse(raw);
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "Only the QA database can receive this grant");
  const { readBoardWizard, BOARD_WIZARD_STYLE, BOARD_WIZARD_OBSERVER_POLICY } = await import("./board-conditioned-wizard");
  const game = await c.db.game.findUnique({ where: { id: input.gameId }, include: { childProfile: true, orders: true } });
  const job = await c.db.generationJob.findUnique({ where: { id: `job_${input.gameId}` } });
  demand(game && !game.deletedAt && game.styleVersion === BOARD_WIZARD_STYLE && game.ownerId && game.paidAt && game.childProfile && !game.childProfile.deletedAt
    && game.childProfile.ownerId === game.ownerId && game.orders.some(o => o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    && !game.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt), "Live paid, nonrefunded QA child game required");
  demand(job && job.gameId === game.id && job.status === "DONE" && !job.currentStep, "An active job cannot receive a cap grant");
  const record = readBoardWizard(job.stepsJson), worldId = `${game.id}:board-wizard`;
  const observationReservationRefused = job.lastError === "WorldBudgetError: Board observation reservation refused";
  const resumingCapHold = record.state === "held" && game.status === "MANUAL_REVIEW"
    && (observationReservationRefused || /Reservation exceeds (?:the inclusive (?:four-dollar|authorized) QA world ceiling|the five-dollar world budget)/.test(job.lastError ?? ""));
  demand(resumingCapHold || record.state === "running" && game.status === "TARGETS_GENERATING", "A cap extension cannot resume an unrelated hold or finished world");
  demand(record.gameId === game.id && record.ownerId === game.ownerId && record.childProfileId === game.childProfileId
    && record.identityAssetId === game.childProfile.identityAssetId && record.ageYears === game.childProfile.ageYears && record.childName === game.childProfile.displayName,
    "Frozen child identity changed");
  const stored = await new PrismaWorldBudgetStore(c.db).read(worldId);
  demand(stored && boardConditioningHash(stored.snapshot) === input.expectedLedgerSha256 && boardConditioningHash(job.stepsJson) === input.expectedStepsSha256,
    "Job or ledger changed; qualify the current state again");
  const audit = auditWorldBudget(stored.snapshot);
  demand(stored.revision < WORLD_BUDGET_LEDGER_MAX_REVISION, "Ledger revision cannot be incremented safely");
  demand(!audit.held && !audit.pendingRequestKeys.length && !audit.conflictRequestKeys.length && !audit.overrunRequestKeys.length && audit.committedMicroUsd < 5_000_000,
    "No unapproved unknown, pending charge, conflict or overrun can be bypassed by a cap increase");
  let refusedReservation: { requestKey: string; reserveMicroUsd: number } | undefined;
  if (observationReservationRefused) {
    const pending = record.boards.find(b => b.state === "pending" && (b.awaitingMeasurement || b.remeasurements?.some(r => r.state === "pending")));
    const repeat = pending?.remeasurements?.find(r => r.state === "pending"), attempt = repeat?.sourceAttempt ?? pending?.attempts;
    demand(pending && (attempt === 1 || attempt === 2), "No unchanged pending observation explains the refusal");
    const requestKey = `${attempt === 2 ? "attempt-2:" : ""}board:${pending.boardId}:measure:${repeat ? 2 : 1}`;
    demand(!stored.snapshot.requests.some(r => r.requestKey === requestKey)
      && audit.committedMicroUsd + BOARD_WIZARD_OBSERVER_POLICY.reserveMicroUsd > 4_000_000
      && audit.committedMicroUsd + BOARD_WIZARD_OBSERVER_POLICY.reserveMicroUsd <= 5_000_000,
      "Observation refusal is not explained solely by the original cap");
    refusedReservation = { requestKey, reserveMicroUsd: BOARD_WIZARD_OBSERVER_POLICY.reserveMicroUsd };
  }
  const body = bodySchema.parse({ version: BOARD_WIZARD_BUDGET_EXTENSION_VERSION, gameId: game.id, worldId, ownerId: record.ownerId, childProfileId: record.childProfileId,
    catalogSha256: record.catalogSha256, identityAssetId: record.identityAssetId, baseCapMicroUsd: 4_000_000, capMicroUsd: 5_000_000,
    expectedStepsSha256: input.expectedStepsSha256, expectedLedgerSha256: input.expectedLedgerSha256, ledgerRevision: stored.revision,
    settledMicroUsd: audit.settledMicroUsd, reservedMicroUsd: audit.reservedMicroUsd, committedMicroUsd: audit.committedMicroUsd,
    ...(refusedReservation ? { refusedReservation } : {}),
    retainedUnknownRequests: stored.snapshot.requests.filter(r => r.state === "unknown").map(r => ({ requestKey: r.requestKey, operationFingerprint: r.operationFingerprint, reserveMicroUsd: r.reserveMicroUsd })),
    authorizationEvidenceSha256: input.authorizationEvidenceSha256, systemOperatorId: input.systemOperatorId, authorizedAt: input.authorizedAt, automaticRelease: false });
  const receipt = checkedReceipt({ ...body, authorizationSha256: boardConditioningHash(body) });
  demand(authority && await authority.verifyExplicitUserAuthorization(structuredClone(receipt)) === true, "Explicit user authorization has not been verified by the operator entrypoint");
  const old = await c.db.auditLog.findUnique({ where: { id: boardWizardBudgetExtensionAuditId(worldId) } });
  demand(!old, "This game already has its single cap extension; do not rewrite or stack grants");
  const next = { ...record, state: "running" as const };
  const nextStepsJson = JSON.stringify({ ...JSON.parse(job.stepsJson), boardWizard: next });
  readBoardWizard(nextStepsJson); // The original base cap stays exactly four dollars.
  return { game, job, stored, receipt, nextStepsJson, resumingCapHold,
    auditLog: { id: boardWizardBudgetExtensionAuditId(worldId), actorType: "SYSTEM" as const, actorId: null,
      action: BOARD_WIZARD_BUDGET_EXTENSION_ACTION, entityType: "Game", entityId: game.id, metaJson: JSON.stringify(receipt) } };
}

/** Explicit internal operator action only. No browser route calls this service.
 * It appends a SYSTEM receipt and resumes a cap-only hold atomically; request
 * rows, original unknown reservations, source attempts and paid assets stay put. */
export async function authorizeBoardWizardBudgetExtension(c: Container, raw: unknown, authority: BoardWizardBudgetExtensionAuthority) {
  const plan = await prepareBoardWizardBudgetExtension(c, raw, authority);
  return c.db.$transaction(async tx => {
    const gameFence = await tx.game.updateMany({ where: { id: plan.game.id, updatedAt: plan.game.updatedAt, status: plan.game.status,
      deletedAt: null, ownerId: plan.game.ownerId, childProfileId: plan.game.childProfileId, styleVersion: plan.game.styleVersion }, data: { updatedAt: new Date() } });
    const jobFence = await tx.generationJob.updateMany({ where: { id: plan.job.id, status: "DONE", currentStep: null, attempts: plan.job.attempts, stepsJson: plan.job.stepsJson }, data: { updatedAt: new Date() } });
    const current = await PrismaWorldBudgetStore.forContinuationApprovalTransaction(tx).read(plan.receipt.worldId);
    demand(gameFence.count === 1 && jobFence.count === 1 && current && current.revision === plan.stored.revision
      && boardConditioningHash(current.snapshot) === plan.receipt.expectedLedgerSha256, "Game, job or ledger changed during cap authorization");
    const child = await tx.childProfile.findUniqueOrThrow({ where: { id: plan.receipt.childProfileId } });
    const orders = await tx.order.findMany({ where: { gameId: plan.game.id }, select: { paymentStatus: true, paidAt: true, refundedAt: true } });
    demand(!child.deletedAt && child.ownerId === plan.game.ownerId && child.identityAssetId === plan.game.childProfile!.identityAssetId
      && child.ageYears === plan.game.childProfile!.ageYears && child.displayName === plan.game.childProfile!.displayName
      && orders.some(o => o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt) && !orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt), "Child or payment changed during authorization");
    // Lock/CAS the revision while preserving snapshotJson BYTE FOR BYTE.
    const ledgerFence = await tx.worldBudgetLedger.updateMany({ where: { worldId: plan.receipt.worldId, revision: plan.stored.revision }, data: { revision: { increment: 1 } } });
    demand(ledgerFence.count === 1, "Ledger lost cap authorization fence");
    await tx.auditLog.create({ data: plan.auditLog });
    await tx.generationJob.update({ where: { id: plan.job.id }, data: { stepsJson: plan.nextStepsJson, status: "DONE", currentStep: null, lastError: null } });
    await tx.game.update({ where: { id: plan.game.id }, data: { status: "TARGETS_GENERATING", lastError: null } });
    return { gameId: plan.game.id, authorizationSha256: plan.receipt.authorizationSha256, capMicroUsd: 5_000_000 as const, automaticRelease: false as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}
