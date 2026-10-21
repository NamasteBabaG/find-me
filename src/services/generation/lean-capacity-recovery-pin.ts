import type { Prisma } from "@prisma/client";
import { sha256Bytes } from "./fixed-sprite";
import type { WorldAutomaticReviewRecoveryV4 } from "./world-budget";
import { CAPACITY_REVIEW_POLICY } from "../../domain/generation/lean-capacity-recovery";
import { boardConditioningHash as hash } from "./board-conditioned-source";
import { leanReleaseOf, leanReleaseReceipt } from "./lean-release";
import { leanReviewRecoveryOf, parkedHoldSha256 } from "./lean-review-recovery-pin";
import { identityRevisionStateOf } from "./identity-source-revision-state";
import { leanCompletionBudgetAuditId, leanCompletionBudgetReceiptSchema } from "./lean-completion-budget";
import { LEAN_COMPLETION_BUDGET_ACTION } from "../../domain/generation/lean-completion-budget";
import { LEAN_CAPACITY_RECOVERY_ACTION, leanCapacityReceiptSchema, leanCapacityRecoveryId,
  capacityBindingSchema, capacityReceiptHasValidSets } from "../../domain/generation/lean-capacity-recovery";

type Db = Pick<Prisma.TransactionClient, "auditLog">;
const demand = (ok: unknown): void => { if (!ok) throw Error("LEAN_CAPACITY: invalid immutable capacity recovery; refusing fallback"); };

/** Immutable authority only. Live paid/deletion conditions remain the budget reader and dispatch boundary's. No writes/providers. */
export async function leanCapacityRecoveryOf(db: Db, gameId: string) {
  const row = await db.auditLog.findUnique({ where: { id: leanCapacityRecoveryId(gameId) } });
  if (!row) return null;
  const receipt = leanCapacityReceiptSchema.parse(JSON.parse(row.metaJson ?? "null"));
  const { authorizationSha256, ...body } = receipt;
  const { planSha256, operatorId: _operatorId, authorizedAt: _authorizedAt, automaticRelease: _automaticRelease, ...binding } = body;
  const { start, commit } = await identityRevisionStateOf(db, gameId);
  const lean = await leanReleaseOf(db, gameId), recovery = await leanReviewRecoveryOf(db, gameId);
  const sixRow = await db.auditLog.findUnique({ where: { id: leanCompletionBudgetAuditId(gameId) } });
  const six = sixRow ? leanCompletionBudgetReceiptSchema.parse(JSON.parse(sixRow.metaJson ?? "null")) : null;
  demand(start && commit && lean && recovery && six && sixRow);
  if (!start || !commit || !six || !sixRow) throw Error("LEAN_CAPACITY: incomplete source authority");
  const { authorizationSha256: sixHash, ...sixBody } = six;
  demand(row.actorType === "ADMIN" && row.actorId === receipt.operatorId && row.entityType === "Game" && row.entityId === gameId
    && row.action === LEAN_CAPACITY_RECOVERY_ACTION && row.metaJson === JSON.stringify(receipt)
    && receipt.gameId === gameId && receipt.worldId === `${gameId}:board-wizard` && receipt.operatorId === start.operatorId
    && receipt.ownerId === start.ownerId && receipt.childId === start.childId && receipt.jobId === start.jobId
    && receipt.sourceStartSha256 === hash(start) && receipt.sourceCommitSha256 === hash(commit)
    && receipt.identitySha256 === commit.newIdentitySha256 && receipt.leanPinSha256 === hash(leanReleaseReceipt(gameId))
    && receipt.recoveryPinSha256 === hash(recovery) && receipt.completionGrantSha256 === six.authorizationSha256
    && planSha256 === hash(capacityBindingSchema.parse(binding)) && authorizationSha256 === hash(body)
    && capacityReceiptHasValidSets(receipt));
  demand(sixRow.actorType === "ADMIN" && sixRow.actorId === start.operatorId && sixRow.entityType === "Game" && sixRow.entityId === gameId
    && sixRow.action === LEAN_COMPLETION_BUDGET_ACTION && sixRow.metaJson === JSON.stringify(six) && sixHash === hash(sixBody)
    && six.gameId === gameId && six.worldId === receipt.worldId && six.operatorId === start.operatorId
    && six.ownerId === start.ownerId && six.childId === start.childId && six.sourceStartSha256 === hash(start)
    && six.originalJobHoldSha256 === start.jobHoldSha256 && six.leanPinSha256 === receipt.leanPinSha256);
  return receipt;
}

/** Only the exact held job an administrator read can get a wake turn. A later park stays a later park. */
export async function boundLeanCapacityHold(db: Db, gameId: string, job: { id: string; updatedAt: Date; lastError: string | null }) {
  const pin = await leanCapacityRecoveryOf(db, gameId);
  return pin && pin.jobId === job.id && pin.holdSha256 === parkedHoldSha256(job)
    ? { worldId: pin.worldId, jobId: pin.jobId, holdSha256: pin.holdSha256, heldRequestKeys: pin.heldRequestKeys, ledgerSha256: pin.ledgerSha256 }
    : null;
}

/** Only a recorded exact v4 continuation of this source and grant can cross publication. */
export async function capacityContinuationPublishable(db: Db, gameId: string, approval: WorldAutomaticReviewRecoveryV4): Promise<boolean> {
  const pin = await leanCapacityRecoveryOf(db, gameId);
  if (!pin || approval.grantSha256 !== pin.authorizationSha256 || approval.worldId !== pin.worldId) return false;
  const row = await db.auditLog.findUnique({ where: { id: approval.approvalId } });
  if (!row || row.actorType !== "SYSTEM" || row.actorId !== null || row.entityType !== "Game" || row.entityId !== gameId
    || row.action !== CAPACITY_REVIEW_POLICY || !row.metaJson || sha256Bytes(Buffer.from(row.metaJson)) !== approval.authorizationSha256
    || approval.approvalId !== `auto-review-v4-${approval.authorizationSha256}`) return false;
  const proof = JSON.parse(row.metaJson);
  return proof.policyId === CAPACITY_REVIEW_POLICY && proof.grantSha256 === pin.authorizationSha256
    && proof.identitySha256 === pin.identitySha256 && proof.requestKey === approval.requestKey
    && proof.operationFingerprint === approval.operationFingerprint && proof.gameId === gameId && proof.ownerId === pin.ownerId
    && JSON.stringify(proof.unknownReasons) === JSON.stringify(approval.unknownReasons);
}
