import { z } from "zod";

/** Explicit one-world capacity only. Neither a visual verdict nor authority to change an old lean pin. */
export const DETECTIVES_COMPLETION_BUDGET = "explicit-detectives-completion-six-dollar/v1" as const;
export const DETECTIVES_COMPLETION_CAP = 6_000_000 as const;
export const DETECTIVES_COMPLETION_ACTION = "generation:detectives-completion-budget";
export const DETECTIVES_COMPLETION_RESUMED = "generation:detectives-completion-resumed";
export const DETECTIVES_COMPLETION_CONFIRMATION = "owner-authorized-six-dollars-total-for-this-detective-world-v1";
export const detectivesCompletionId = (gameId: string) => `aud_detectives_budget_${gameId}`;
export const detectivesCompletionResumeId = (gameId: string) => `aud_detectives_budget_resume_${gameId}`;
export const detectiveBudgetIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
export const detectiveBudgetHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const id = detectiveBudgetIdSchema, digest = detectiveBudgetHashSchema;
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const detectiveBudgetBindingSchema = z.object({
  version: z.literal(DETECTIVES_COMPLETION_BUDGET), gameId: id, worldId: z.string().regex(/^[A-Za-z0-9_-]{1,160}:board-wizard$/),
  ownerId: id, childId: id, baseCapMicroUsd: z.literal(4_000_000), capMicroUsd: z.literal(DETECTIVES_COMPLETION_CAP),
  familySha256: digest, scenesSha256: digest, leanPinSha256: digest, enrollmentSha256: digest, reviewSha256: digest,
  identityAssetId: id, identitySha256: digest, avatarAssetId: id, avatarSha256: digest,
  photoAssetId: id, photoSha256: digest, ageYears: z.number().int().min(2).max(10), cropSha256: digest, paymentSha256: digest,
  jobId: id, holdSha256: digest, jobAttempts: z.number().int().nonnegative().max(2_147_483_646),
  ledgerSha256: digest, ledgerRevision: z.number().int().nonnegative().max(2_147_483_645),
  committedMicroUsd: money, reservedMicroUsd: money,
  retainedUnknowns: z.array(z.object({ requestKey: z.string().min(1).max(300), operationFingerprint: digest, reserveMicroUsd: money }).strict()).max(128),
}).strict();
export const detectiveBudgetReceiptBodySchema = detectiveBudgetBindingSchema.extend({ planSha256: digest,
  operatorId: id, ownerAuthorizationSha256: digest, authorizedAt: z.string().datetime(), automaticRelease: z.literal(false) }).strict();
export const detectiveBudgetReceiptSchema = detectiveBudgetReceiptBodySchema.extend({ authorizationSha256: digest }).strict();
export type DetectiveBudgetReceipt = z.infer<typeof detectiveBudgetReceiptSchema>;
