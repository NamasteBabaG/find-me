import { SINGLE_VISUAL_REVIEW_VERSION } from "./single-visual-review";
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


/** A new explicit owner decision extends one already authorized six-dollar world.
 * The earlier receipt remains immutable; this is not a commercial default. */
export const DETECTIVES_EXTENSION_BUDGET = "explicit-detectives-completion-eight-dollar/v1" as const;
export const DETECTIVES_EXTENSION_CAP = 8_000_000 as const;
export const DETECTIVES_EXTENSION_ACTION = "generation:detectives-completion-extension";
export const DETECTIVES_EXTENSION_RESUMED = "generation:detectives-extension-resumed";
export const DETECTIVES_EXTENSION_CONFIRMATION = "owner-authorized-eight-dollars-total-for-this-detective-world-v1";
export const detectivesExtensionId = (gameId: string) => `aud_detectives_extension_${gameId}`;
export const detectivesExtensionResumeId = (gameId: string) => `aud_detectives_extension_resume_${gameId}`;
export const detectiveExtensionBindingSchema = detectiveBudgetBindingSchema.extend({
  version: z.literal(DETECTIVES_EXTENSION_BUDGET), baseCapMicroUsd: z.literal(DETECTIVES_COMPLETION_CAP),
  capMicroUsd: z.literal(DETECTIVES_EXTENSION_CAP), previousAuthorizationSha256: digest, reviewMode: z.literal(SINGLE_VISUAL_REVIEW_VERSION),
}).strict();
export const detectiveExtensionReceiptBodySchema = detectiveExtensionBindingSchema.extend({ planSha256: digest,
  operatorId: id, ownerAuthorizationSha256: digest, authorizedAt: z.string().datetime(), automaticRelease: z.literal(false) }).strict();
export const detectiveExtensionReceiptSchema = detectiveExtensionReceiptBodySchema.extend({ authorizationSha256: digest }).strict();
export type DetectiveExtensionReceipt = z.infer<typeof detectiveExtensionReceiptSchema>;

/** A distinct owner decision for a finite tail; preserves the consumed six/eight-dollar receipts. */
export const DETECTIVES_TAIL_BUDGET = "explicit-detectives-completion-ten-dollar/v1" as const;
export const DETECTIVES_TAIL_CAP = 10_000_000 as const;
export const DETECTIVES_TAIL_ACTION = "generation:detectives-completion-tail";
export const DETECTIVES_TAIL_RESUMED = "generation:detectives-tail-resumed";
export const DETECTIVES_TAIL_CONFIRMATION = "owner-authorized-ten-dollars-total-for-this-detective-world-v1";
export const detectivesTailId = (gameId: string) => "aud_detectives_tail_"+gameId;
export const detectivesTailResumeId = (gameId: string) => "aud_detectives_tail_resume_"+gameId;
export const detectiveTailRowSchema = z.object({ rowId:id, hideId:id, rowSha256:digest, rowInvariantSha256:digest,
  originalAttempts:z.union([z.literal(2),z.literal(3)]), maxAttempt:z.union([z.literal(3),z.literal(4)]),
  mode:z.enum(["guided-third","native-mask-fourth"]), retainedRenderSha256:digest.nullable() }).strict();
export const detectiveTailBindingSchema = detectiveExtensionBindingSchema.extend({
  version:z.literal(DETECTIVES_TAIL_BUDGET), baseCapMicroUsd:z.literal(DETECTIVES_EXTENSION_CAP), capMicroUsd:z.literal(DETECTIVES_TAIL_CAP),
  allRowsSha256:digest, tailRows:z.array(detectiveTailRowSchema).min(1).max(4),
}).strict();
export const detectiveTailReceiptBodySchema = detectiveTailBindingSchema.extend({planSha256:digest, operatorId:id,
  ownerAuthorizationSha256:digest, authorizedAt:z.string().datetime(), automaticRelease:z.literal(false)}).strict();
export const detectiveTailReceiptSchema = detectiveTailReceiptBodySchema.extend({authorizationSha256:digest}).strict();
export type DetectiveTailReceipt = z.infer<typeof detectiveTailReceiptSchema>;
