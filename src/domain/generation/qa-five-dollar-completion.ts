import { z } from "zod";
import { qaCompletionStateSchema } from "./qa-completion-capacity";
import { SUNBURST_IMAGE_RESERVE_MICRO_USD, SUNBURST_MIN_CAPACITY_MICRO_USD, SUNBURST_REVIEW_COVERAGE_MICRO_USD } from "./sunburst-painter";
import { JOURNEY_SUNBURST_HEAD_HIDE_ID, JOURNEY_SUNBURST_HEAD_VERSION } from "./journey-source-head";

/** A separately authorized existing-world completion, never a new-game default.
 * The owner's decision (9 Nov 2026): up to five dollars TOTAL for this one game,
 * target four. The original four-dollar history, bills and UNKNOWN reserves stay. */
export const QA_FIVE_COMPLETION_VERSION = "explicit-existing-qa-five-dollar-completion/v1" as const;
export const QA_FIVE_COMPLETION_ACTION = "generation:explicit-existing-qa-five-dollar-completion";
export const QA_FIVE_COMPLETION_CAP = 5_000_000 as const;
export const QA_FIVE_COMPLETION_BASE_CAP = 4_000_000 as const;
export const QA_FIVE_COMPLETION_CONFIRMATION = "owner-authorized-five-dollars-cumulative-for-this-existing-qa-game-v1";
export const qaFiveCompletionId = (gameId: string) => "aud_qa_five_completion_" + gameId;

/** The single named operation the original ceiling cannot admit. The grant is
 * planned only when THIS operation is genuinely refused under four dollars. */
export const QA_FIVE_NEXT_OPERATION = JOURNEY_SUNBURST_HEAD_VERSION;
export const QA_FIVE_NEXT_HIDE_ID = JOURNEY_SUNBURST_HEAD_HIDE_ID;
export const QA_FIVE_NEXT_REQUIRED_MICRO_USD = SUNBURST_MIN_CAPACITY_MICRO_USD;

const digest = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const key = z.string().regex(/^[A-Za-z0-9_:.-]{1,300}$/);
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const qaFiveNextOperationSchema = z.object({
  kind: z.literal(QA_FIVE_NEXT_OPERATION), hideId: z.literal(QA_FIVE_NEXT_HIDE_ID), rowId: key, requestKey: key,
  previousJudgeSha256: digest, imageReserveMicroUsd: z.literal(SUNBURST_IMAGE_RESERVE_MICRO_USD),
  reviewCoverageMicroUsd: z.literal(SUNBURST_REVIEW_COVERAGE_MICRO_USD), requiredMicroUsd: z.literal(SUNBURST_MIN_CAPACITY_MICRO_USD),
  remainingUnderBaseMicroUsd: money,
}).strict().refine(op => op.remainingUnderBaseMicroUsd < op.requiredMicroUsd, { message: "The named operation still fits the original ceiling" });
export const qaFiveCompletionPlanSchema = z.object({
  version: z.literal(QA_FIVE_COMPLETION_VERSION), state: qaCompletionStateSchema,
  baseCapMicroUsd: z.literal(QA_FIVE_COMPLETION_BASE_CAP), capMicroUsd: z.literal(QA_FIVE_COMPLETION_CAP),
  jobId: id, jobSha256: digest, ledgerRevision: money, ledgerSha256: digest, rowsSha256: digest,
  committedMicroUsd: money, reservedMicroUsd: money, nextOperation: qaFiveNextOperationSchema,
  originalRequests: z.array(z.object({ requestKey: key, sha256: digest }).strict()).min(1),
  unknowns: z.array(z.object({ requestKey: key, operationFingerprint: digest, reserveMicroUsd: money }).strict()),
}).strict().refine(p => p.committedMicroUsd <= p.baseCapMicroUsd, { message: "The original ceiling is already exceeded" });
export const qaFiveCompletionReceiptSchema = z.object({
  plan: qaFiveCompletionPlanSchema, planSha256: digest, operatorId: id, ownerAuthorizationSha256: digest, authorizedAt: z.string().datetime(),
  automaticExtension: z.literal(false), requestsPreserved: z.literal(true), attemptsPreserved: z.literal(true),
  qualityPolicyPreserved: z.literal(true), exclusiveOfOtherGrants: z.literal(true), authorizationSha256: digest,
}).strict();
export type QaFiveCompletionPlan = z.infer<typeof qaFiveCompletionPlanSchema>;
export type QaFiveCompletionReceipt = z.infer<typeof qaFiveCompletionReceiptSchema>;
