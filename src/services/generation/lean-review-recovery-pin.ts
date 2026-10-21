import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  LEAN_REVIEW_RECOVERY_ACTION, leanReviewRecoveryAuditId, parseLeanReviewRecoveryReceipt, type LeanReviewRecoveryBinding, type LeanReviewRecoveryReceipt,
} from "../../domain/generation/lean-review-recovery";
import { isLeanWorld } from "./lean-release";

/**
 * The pin of local-patch-lean-review-recovery/v1 (domain/generation/lean-review-recovery.ts): written once, read exactly.
 * A new lean draft receives it in the transaction that pins its lean release (`pinLeanRelease`); an existing world only
 * from a person, bound to what they read (lean-review-recovery.ts). A world without it keeps every contract it had.
 */

/** The world's pin, or null. A row that is not exactly one, or a pin on a world that is not lean, is refused. */
export async function leanReviewRecoveryOf(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string): Promise<LeanReviewRecoveryReceipt | null> {
  const row = await db.auditLog.findUnique({ where: { id: leanReviewRecoveryAuditId(gameId) } });
  if (!row) return null;
  let parsed: unknown = null;
  try { parsed = JSON.parse(row.metaJson ?? "null"); } catch { parsed = null; }
  const receipt = parseLeanReviewRecoveryReceipt(parsed, gameId);
  const actor = receipt?.mode === "new-world" ? row.actorType === "SYSTEM" && row.actorId === null
    : receipt?.mode === "existing-world" ? row.actorType === "ADMIN" && row.actorId === receipt.operatorId : false;
  if (!receipt || !actor || row.action !== LEAN_REVIEW_RECOVERY_ACTION || row.entityType !== "Game" || row.entityId !== gameId
    || !await isLeanWorld(db, gameId)) throw Error("Pinned lean review recovery is invalid; refusing a fallback");
  return receipt;
}

/**
 * One hold: the job, its reason and the moment the reason was written (local-patch-parked-wake/v1). A new park is a new
 * hold; nothing that only reads a parked job changes it.
 */
export function parkedHoldSha256(job: { id: string; updatedAt: Date; lastError: string | null }): string {
  return createHash("sha256").update(JSON.stringify([job.id, job.updatedAt.toISOString(), job.lastError])).digest("hex");
}

/** The binding of a person's release when this job still holds exactly the hold they read, or null. */
export async function boundLeanRecoveryHold(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string,
  job: { id: string; updatedAt: Date; lastError: string | null }): Promise<LeanReviewRecoveryBinding | null> {
  const { boundLeanCapacityHold } = await import("./lean-capacity-recovery-pin");
  const capacity = await boundLeanCapacityHold(db, gameId, job);
  if (capacity) return capacity;
  const pin = await leanReviewRecoveryOf(db, gameId);
  return pin?.mode === "existing-world" && pin.binding.jobId === job.id && pin.binding.holdSha256 === parkedHoldSha256(job) ? pin.binding : null;
}
