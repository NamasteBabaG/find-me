import { z } from "zod";

/** Explicit existing-world QA authority; the commercial birth cap stays $4. */
export const QA_COMPLETION_CAPACITY = "qa-existing-medium-completion/v1" as const;
export const QA_COMPLETION_CAP = 12_000_000 as const;
export const QA_COMPLETION_CONFIRMATION = "owner-authorized-existing-medium-qa-completion-twelve-total-v1";
export const QA_KINGDOM_COMPLETION_CAPACITY = "qa-existing-kingdom-age-eight-completion/v1" as const;
export const QA_KINGDOM_COMPLETION_CAP = 6_000_000 as const;
export const QA_KINGDOM_COMPLETION_CONFIRMATION = "owner-authorized-kingdom-age-eight-qa-completion-six-total-v1";
export const QA_KINGDOM_TAIL_CAPACITY = "qa-existing-kingdom-age-eight-tail/v1" as const;
export const QA_KINGDOM_TAIL_CAP = 7_000_000 as const;
export const QA_KINGDOM_TAIL_CONFIRMATION = "owner-authorized-kingdom-age-eight-qa-completion-seven-total-v1";
export function qaCompletionConfirmation(cap: number) {
  if (cap === QA_KINGDOM_TAIL_CAP) return QA_KINGDOM_TAIL_CONFIRMATION;
  return cap === QA_KINGDOM_COMPLETION_CAP ? QA_KINGDOM_COMPLETION_CONFIRMATION : QA_COMPLETION_CONFIRMATION;
}
export const qaCompletionCapacityId = (gameId: string) => "aud_qa_medium_completion_" + gameId;
export const qaKingdomTailCapacityId = (gameId: string) => "aud_qa_kingdom_tail_" + gameId;
const id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/), sha = z.string().regex(/^[a-f0-9]{64}$/);
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const qaCompletionStateSchema = z.object({
  gameId: id, worldId: z.string().regex(/^[A-Za-z0-9_-]{1,160}:board-wizard$/), ownerId: id, childId: id,
  sceneVersion: z.union([z.literal(12),z.literal(13)]), scenesSha256: sha, familySha256: sha, paymentSha256: sha,
  reviewAuthoritySha256: sha, enrollmentSha256: sha, identityReviewSha256: sha,
  identityAssetId: id, identitySha256: sha, avatarAssetId: id, photoAssetId: id, photoSha256: sha,
  ageYears: z.number().int().min(2).max(10), cropSha256: sha,
}).strict();
export const qaKingdomTailReviewSchema = z.object({
  requestKey: z.string().min(1).max(240), operationFingerprint: sha,
  variantId: id, imageSha256: sha, geometrySha256: sha, roundSha256: sha,
}).strict();
const planShape = {
  version: z.enum([QA_COMPLETION_CAPACITY, QA_KINGDOM_COMPLETION_CAPACITY, QA_KINGDOM_TAIL_CAPACITY]), state: qaCompletionStateSchema,
  baseCapMicroUsd: z.union([z.literal(4_000_000), z.literal(QA_KINGDOM_COMPLETION_CAP)]),
  capMicroUsd: z.union([z.literal(QA_COMPLETION_CAP), z.literal(QA_KINGDOM_COMPLETION_CAP), z.literal(QA_KINGDOM_TAIL_CAP)]),
  jobId: id, jobSha256: sha, ledgerRevision: money, ledgerSha256: sha, rowsSha256: sha,
  committedMicroUsd: money, reservedMicroUsd: money,
  unknowns: z.array(z.object({requestKey:z.string().min(1).max(500),operationFingerprint:sha,reserveMicroUsd:money}).strict()),
  previousAuthorizationSha256: sha.optional(),
  interruptedReview: qaKingdomTailReviewSchema.optional(),
};
const matchingBudget = (plan: z.infer<z.ZodObject<typeof planShape>>) => {
  if (plan.version === QA_KINGDOM_TAIL_CAPACITY) {
    return plan.baseCapMicroUsd === QA_KINGDOM_COMPLETION_CAP && plan.capMicroUsd === QA_KINGDOM_TAIL_CAP
      && !!plan.previousAuthorizationSha256 && !!plan.interruptedReview;
  }
  return plan.baseCapMicroUsd === 4_000_000 && plan.previousAuthorizationSha256 === undefined && plan.interruptedReview === undefined
    && plan.capMicroUsd === (plan.version === QA_KINGDOM_COMPLETION_CAPACITY ? QA_KINGDOM_COMPLETION_CAP : QA_COMPLETION_CAP);
};
export const qaCompletionPlanSchema = z.object(planShape).strict().refine(matchingBudget);
export const qaCompletionReceiptSchema = z.object({ ...planShape, planSha256: sha, operatorId: id,
  ownerAuthorizationSha256: sha, authorizedAt: z.string().datetime(), automaticExtension: z.literal(false),
  requestsPreserved: z.literal(true), attemptsPreserved: z.literal(true), qualityPolicyPreserved: z.literal(true), authorizationSha256: sha,
}).strict().refine(matchingBudget);
export type QaCompletionState = z.infer<typeof qaCompletionStateSchema>;
export type QaCompletionReceipt = z.infer<typeof qaCompletionReceiptSchema>;
