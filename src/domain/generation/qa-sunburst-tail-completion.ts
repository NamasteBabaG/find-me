import { z } from "zod";
import { qaCompletionStateSchema } from "./qa-completion-capacity";
import { SUNBURST_IMAGE_RESERVE_MICRO_USD, SUNBURST_MIN_CAPACITY_MICRO_USD, SUNBURST_REVIEW_COVERAGE_MICRO_USD } from "./sunburst-painter";
import { JOURNEY_SUNBURST_TAIL_HIDE_IDS, JOURNEY_SUNBURST_TAIL_VERSION, type JourneySunburstTailHideId } from "./journey-sunburst-tail";

/**
 * explicit-existing-qa-sunburst-tail-completion/v1: the owner's existing decision
 * (9 Nov 2026), up to five dollars TOTAL for ONE existing QA Detective game, target
 * four, applied to a frozen finite list of one to three named Sunburst SOURCE-head
 * repaints (Amazon3, GreatWall1, Paris1). It is a NEW receipt: the released
 * single-Paris explicit-existing-qa-five-dollar-completion/v1 receipt keeps its
 * own contract and is never reinterpreted. The two never coexist.
 *
 * Pure: no model output, child data or private evidence. Money is integer micro-USD.
 */
export const QA_SUNBURST_TAIL_COMPLETION_VERSION = "explicit-existing-qa-sunburst-tail-completion/v1" as const;
export const QA_SUNBURST_TAIL_COMPLETION_ACTION = "generation:explicit-existing-qa-sunburst-tail-completion" as const;
export const QA_SUNBURST_TAIL_COMPLETION_CONFIRMATION = "owner-authorized-five-dollars-cumulative-sunburst-tail-for-this-existing-qa-game-v1" as const;
/** The owner form's explicit query selector; the default stays the v1 single-Paris plan. */
export const QA_SUNBURST_TAIL_PLAN_SELECTOR = "sunburst-tail-v1" as const;
export const QA_SUNBURST_TAIL_CAP = 5_000_000 as const;
export const QA_SUNBURST_TAIL_BASE_CAP = 4_000_000 as const;
export const QA_SUNBURST_TAIL_MAX_OPERATIONS = JOURNEY_SUNBURST_TAIL_HIDE_IDS.length;
export const qaSunburstTailCompletionId = (gameId: string) => "aud_qa_sunburst_tail_" + gameId;
/** The one purchase each operation names: that appearance's second render. */
export const qaSunburstTailRequestKey = (hideId: JourneySunburstTailHideId, pose: string) => hideId + ":" + pose + ":render:2";

const digest = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const key = z.string().regex(/^[A-Za-z0-9_:.-]{1,240}$/);
/** A recorded ledger key, bound by hash only and never dispatched: imported bills are `@import/["namespace","id"]`. */
const recordedKey = z.string().min(1).max(1000);
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const hideIdSchema = z.enum(JOURNEY_SUNBURST_TAIL_HIDE_IDS);

export const qaSunburstTailOperationSchema = z.object({
  kind: z.literal(JOURNEY_SUNBURST_TAIL_VERSION), hideId: hideIdSchema, rowId: key, requestKey: key,
  previousJudgeSha256: digest, imageReserveMicroUsd: z.literal(SUNBURST_IMAGE_RESERVE_MICRO_USD),
  reviewCoverageMicroUsd: z.literal(SUNBURST_REVIEW_COVERAGE_MICRO_USD), requiredMicroUsd: z.literal(SUNBURST_MIN_CAPACITY_MICRO_USD),
}).strict().refine(op => op.requestKey.startsWith(op.hideId + ":") && /^[a-z-]+:render:2$/.test(op.requestKey.slice(op.hideId.length + 1)),
  { message: "Each operation names exactly its own appearance's second render" });
const order = (hideId: string) => (JOURNEY_SUNBURST_TAIL_HIDE_IDS as readonly string[]).indexOf(hideId);

export const qaSunburstTailPlanSchema = z.object({
  version: z.literal(QA_SUNBURST_TAIL_COMPLETION_VERSION), state: qaCompletionStateSchema,
  baseCapMicroUsd: z.literal(QA_SUNBURST_TAIL_BASE_CAP), capMicroUsd: z.literal(QA_SUNBURST_TAIL_CAP),
  jobId: id, jobSha256: digest, ledgerRevision: money, ledgerSha256: digest, rowsSha256: digest,
  committedMicroUsd: money, reservedMicroUsd: money, remainingUnderBaseMicroUsd: money, requiredMicroUsd: money,
  operations: z.array(qaSunburstTailOperationSchema).min(1).max(QA_SUNBURST_TAIL_MAX_OPERATIONS),
  originalRequests: z.array(z.object({ requestKey: recordedKey, sha256: digest }).strict()).min(1),
  unknowns: z.array(z.object({ requestKey: recordedKey, operationFingerprint: recordedKey, reserveMicroUsd: money }).strict()),
}).strict()
  .refine(p => p.committedMicroUsd <= p.baseCapMicroUsd && p.reservedMicroUsd <= p.committedMicroUsd, { message: "The original ceiling is already exceeded" })
  .refine(p => p.remainingUnderBaseMicroUsd === p.baseCapMicroUsd - p.committedMicroUsd, { message: "Remaining capacity must be the original ceiling's" })
  .refine(p => p.operations.every((op, i) => i === 0 || order(p.operations[i - 1]!.hideId) < order(op.hideId))
    && new Set(p.operations.map(op => op.requestKey)).size === p.operations.length
    && new Set(p.operations.map(op => op.rowId)).size === p.operations.length, { message: "Distinct named appearances in their fixed order" })
  .refine(p => p.requiredMicroUsd === p.operations.reduce((sum, op) => sum + op.requiredMicroUsd, 0), { message: "The list's full reservation" })
  // No forced extension: a list the original four dollars can finish is never granted the fifth.
  .refine(p => p.remainingUnderBaseMicroUsd < p.requiredMicroUsd, { message: "The complete list still fits the original ceiling" })
  // Hard five, UNKNOWN reserves included (they are part of committed).
  .refine(p => p.committedMicroUsd + p.requiredMicroUsd <= p.capMicroUsd, { message: "The complete list does not fit five dollars" })
  .refine(p => p.unknowns.reduce((sum, u) => sum + u.reserveMicroUsd, 0) <= p.reservedMicroUsd, { message: "UNKNOWN reserves must be held whole" });

export const qaSunburstTailReceiptSchema = z.object({
  plan: qaSunburstTailPlanSchema, planSha256: digest, operatorId: id, ownerAuthorizationSha256: digest, authorizedAt: z.string().datetime(),
  automaticExtension: z.literal(false), requestsPreserved: z.literal(true), attemptsPreserved: z.literal(true),
  qualityPolicyPreserved: z.literal(true), exclusiveOfOtherGrants: z.literal(true), authorizationSha256: digest,
}).strict();

export type QaSunburstTailOperation = z.infer<typeof qaSunburstTailOperationSchema>;
export type QaSunburstTailPlan = z.infer<typeof qaSunburstTailPlanSchema>;
export type QaSunburstTailReceipt = z.infer<typeof qaSunburstTailReceiptSchema>;

/** The one operation a native head pin binds, or null when the receipt does not name that appearance. */
export const qaSunburstTailOperationOf = (receipt: Pick<QaSunburstTailReceipt, "plan">, hideId: string): QaSunburstTailOperation | null =>
  receipt.plan.operations.find(op => op.hideId === hideId) ?? null;
