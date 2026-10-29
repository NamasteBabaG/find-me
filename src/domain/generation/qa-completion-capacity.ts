import { z } from "zod";

/** Explicit existing-world QA authority; the commercial birth cap stays $4. */
export const QA_COMPLETION_CAPACITY = "qa-existing-medium-completion/v1" as const;
export const QA_COMPLETION_CAP = 12_000_000 as const;
export const QA_COMPLETION_CONFIRMATION = "owner-authorized-existing-medium-qa-completion-twelve-total-v1";
export const qaCompletionCapacityId = (gameId: string) => "aud_qa_medium_completion_" + gameId;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/), sha = z.string().regex(/^[a-f0-9]{64}$/);
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const qaCompletionStateSchema = z.object({
  gameId: id, worldId: z.string().regex(/^[A-Za-z0-9_-]{1,160}:board-wizard$/), ownerId: id, childId: id,
  sceneVersion: z.union([z.literal(12),z.literal(13)]), scenesSha256: sha, familySha256: sha, paymentSha256: sha,
  reviewAuthoritySha256: sha, enrollmentSha256: sha, identityReviewSha256: sha,
  identityAssetId: id, identitySha256: sha, avatarAssetId: id, photoAssetId: id, photoSha256: sha,
  ageYears: z.number().int().min(2).max(10), cropSha256: sha,
}).strict();
export const qaCompletionPlanSchema = z.object({ version: z.literal(QA_COMPLETION_CAPACITY), state: qaCompletionStateSchema,
  baseCapMicroUsd: z.literal(4_000_000), capMicroUsd: z.literal(QA_COMPLETION_CAP),
  jobId: id, jobSha256: sha, ledgerRevision: money, ledgerSha256: sha, rowsSha256: sha,
  committedMicroUsd: money, reservedMicroUsd: money,
  unknowns: z.array(z.object({requestKey:z.string().min(1).max(500),operationFingerprint:sha,reserveMicroUsd:money}).strict()),
}).strict();
export const qaCompletionReceiptSchema = qaCompletionPlanSchema.extend({ planSha256: sha, operatorId: id,
  ownerAuthorizationSha256: sha, authorizedAt: z.string().datetime(), automaticExtension: z.literal(false),
  requestsPreserved: z.literal(true), attemptsPreserved: z.literal(true), qualityPolicyPreserved: z.literal(true), authorizationSha256: sha,
}).strict();
export type QaCompletionState = z.infer<typeof qaCompletionStateSchema>;
export type QaCompletionReceipt = z.infer<typeof qaCompletionReceiptSchema>;
