import { z } from "zod";

/** Explicit one-world recovery from evidenced provider capacity failures. No earlier pin changes meaning. */
export const LEAN_CAPACITY_RECOVERY = "lean-capacity-recovery/v1" as const;
export const LEAN_CAPACITY_RECOVERY_ACTION = "generation:lean-capacity-recovery";
export const LEAN_CAPACITY_RECOVERY_CAP = 12_000_000 as const;
export const LEAN_CAPACITY_RECOVERY_LIMIT = 32;
export const LEAN_CAPACITY_RECOVERY_CONFIRMATION = "owner-authorized-twelve-dollars-cumulative-capacity-recovery-v1";
export const CAPACITY_REVIEW_POLICY = "local-patch-review-interruption/v4" as const;
export const capacityFailureCode = (code: string | null | undefined) => code === "server_is_overloaded";
export const leanCapacityRecoveryId = (gameId: string) => `aud_lean_capacity_recovery_${gameId}`;

const id = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/), digest = z.string().regex(/^[a-f0-9]{64}$/);
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const capacityEvidenceSchema = z.object({ roundId: z.string().regex(/^sb[0-9a-f]{30}$/),
  requestKey: z.string().min(1).max(300), variantId: id, imageSha256: digest, geometrySha256: digest,
  identitySha256: digest, roundSha256: digest, errorCode: z.literal("server_is_overloaded") }).strict();
export const capacityBindingSchema = z.object({ version: z.literal(LEAN_CAPACITY_RECOVERY), gameId: id,
  worldId: z.string().regex(/^[A-Za-z0-9_-]{1,160}:board-wizard$/), ownerId: id, childId: id,
  baseCapMicroUsd: z.literal(6_000_000), capMicroUsd: z.literal(LEAN_CAPACITY_RECOVERY_CAP),
  maxContinuations: z.number().int().min(1).max(LEAN_CAPACITY_RECOVERY_LIMIT), newQuestionTier: z.literal("default"),
  sourceStartSha256: digest, sourceCommitSha256: digest, completionGrantSha256: digest,
  leanPinSha256: digest, recoveryPinSha256: digest, identitySha256: digest,
  jobId: id, holdSha256: digest, ledgerSha256: digest, ledgerRevision: money,
  committedMicroUsd: money, reservedMicroUsd: money,
  retainedUnknowns: z.array(z.object({ requestKey: z.string().min(1).max(300), operationFingerprint: digest, reserveMicroUsd: money }).strict()).max(200),
  heldRequestKeys: z.array(z.string().min(1).max(300)).min(1).max(32),
  capacityEvidence: z.array(capacityEvidenceSchema).min(2).max(162),
}).strict();
export const leanCapacityReceiptSchema = capacityBindingSchema.extend({ planSha256: digest, operatorId: id,
  authorizedAt: z.string().datetime(), automaticRelease: z.literal(false), authorizationSha256: digest }).strict();
export type LeanCapacityReceipt = z.infer<typeof leanCapacityReceiptSchema>;

export function capacityReceiptHasValidSets(receipt: LeanCapacityReceipt) {
  const unknown = receipt.retainedUnknowns.map(r => r.requestKey), held = receipt.heldRequestKeys;
  const evidence = receipt.capacityEvidence.map(r => r.roundId);
  const ordered = (keys: string[]) => new Set(keys).size === keys.length && keys.every((key, i) => i === 0 || keys[i - 1]! < key);
  return ordered(unknown) && ordered(held) && ordered(evidence) && held.every(key => unknown.includes(key))
    && new Set(receipt.capacityEvidence.map(r => r.imageSha256)).size >= 2
    && receipt.capacityEvidence.every(r => r.identitySha256 === receipt.identitySha256);
}
