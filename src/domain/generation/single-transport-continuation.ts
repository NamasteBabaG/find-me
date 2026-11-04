/**
 * single-transport-continuation/v1: a single-review question whose settled round could not be used because the round
 * itself ended in transit, not because of the pixels, is asked once more about the same pixels.
 *
 * 2026-11-03 (game 3): five single MEDIUM questions on Flex were still running at their ten-minute deadline; the
 * engine cancelled them (LEAN_FLEX_CANCEL_AFTER_MS, whose own rule is that the question is asked again), the provider
 * settled each (three at its explicit zero usage, two billed), and the single path recorded every one as a permanent
 * "integration-review-unreadable" refusal of an appearance nothing was known about.
 *
 * Admitted: a round the engine itself cancelled at its deadline, or one the provider ended `failed` with a code that is
 * not permanent (account, content policy and invalid requests never are). Never: an unknown or unpriced charge (that is
 * the reserved-interruption route), a refused create, an incomplete or wrong-model answer, or a round with readable
 * text (a corrected reader decides that for free). One continuation per image; the continuation is the existing
 * single question's own "transport continuation", on the default tier, with its own key and full reserve.
 */
import { isSingleVisualReviewVersion } from "./single-visual-review";
import { permanentProviderFailure } from "./lean-review-recovery";
import type { BackgroundReviewRound } from "./background-review-round";
import type { WorldBudgetRequest } from "./world-budget";

export const SINGLE_TRANSPORT_CONTINUATION = "single-transport-continuation/v1" as const;
export const SINGLE_TRANSPORT_CONTINUATION_ACTION = "generation:single-transport-continuation/v1";
/** Questions after the first one about one image: one. */
export const SINGLE_TRANSPORT_CONTINUATIONS_PER_IMAGE = 1;
export const SINGLE_TRANSPORT_DEADLINE_CODE = "cancelled-at-deadline";
const PROVIDER_FAILED = "provider-failed:";

const object = (value: unknown): Record<string, any> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : null;
const parse = (json: string | null | undefined) => { try { return object(JSON.parse(json ?? "null")); } catch { return null; } };
const continuable = (code: unknown) => code === SINGLE_TRANSPORT_DEADLINE_CODE || typeof code === "string" && code.startsWith(PROVIDER_FAILED);

/** How a round ended, when that end admits a continuation; null for every other end. */
export function singleTransportFaultOf(round: Pick<BackgroundReviewRound, "cancelAt" | "terminal">): string | null {
  const end = round.terminal;
  if (end?.kind !== "outcome" || end.state !== "unusable") return null;
  if (end.providerStatus === "cancelled" && round.cancelAt !== null) return SINGLE_TRANSPORT_DEADLINE_CODE;
  if (end.providerStatus === "failed" && !permanentProviderFailure(end.errorCode)) return PROVIDER_FAILED + (end.errorCode ?? "unclassified");
  return null;
}

/** A terminal audit can precede accounting after an interruption. Only this
 * round's settled, conflict-free charge qualifies; a pending/UNKNOWN reserve
 * keeps its own recovery route and is never relabeled as a known charge. */
export function singleTransportChargeSettled(request: WorldBudgetRequest | undefined, round: Pick<BackgroundReviewRound, "intent" | "submitted">): boolean {
  return request?.state === "settled" && request.scope === "judge" && !request.conflicts.length
    && request.requestKey === round.intent.requestKey && request.operationFingerprint === round.intent.fingerprint
    && request.reserveMicroUsd === round.intent.reserveMicroUsd && request.evidence.amountMicroUsd <= request.reserveMicroUsd
    && !!round.submitted && request.evidence.providerRequestId === round.submitted.responseId;
}

/** A FAILED single-review appearance whose latest round left no text and is not yet in its image's log: the round to
 * look up and the entry it would add. Reads the row only. */
export function singleTransportCandidate(row: { status: string; lastError?: string | null; judgeJson?: string | null }) {
  const receipt = parse(row.judgeJson), review = object(receipt?.boardReview), dual = object(review?.dual), quality = object(dual?.quality);
  if (row.status !== "FAILED" || !row.lastError?.startsWith("quality-unresolved:") || !receipt || !review || !dual || !quality
    || receipt.reviewState !== "board-review-complete" || receipt.verdict !== null || !receipt.wireFault || receipt.reviewInterruption !== undefined
    || !isSingleVisualReviewVersion(dual.single) || typeof receipt.judgedSha256 !== "string" || dual.imageSha256 !== receipt.judgedSha256
    || typeof quality.requestKey !== "string" || quality.raw !== null && quality.raw !== undefined) return null;
  const attempt = review.evidenceReviewAttempt ?? 1;
  if (!Number.isSafeInteger(attempt) || attempt < 1) return null;
  const log = Array.isArray(receipt.evidenceAttempts) ? receipt.evidenceAttempts.map(object) : [];
  if (log.some(a => a?.imageSha256 === receipt.judgedSha256 && a?.attempt === attempt)) return null;
  return { requestKey: quality.requestKey as string, imageSha256: receipt.judgedSha256 as string, attempt: attempt as number, single: dual.single as string };
}

/** Whether this image's logged single rounds admit one more question: the latest round is logged, every logged round
 * ended in an admitted transit fault, and the continuation is not yet spent. Null otherwise. Reads the receipt only. */
export function singleTransportContinuation(receipt: Record<string, unknown> | null): { asked: number } | null {
  const review = object(receipt?.boardReview), dual = object(review?.dual);
  if (!receipt || !review || !dual || receipt.reviewInterruption !== undefined || !isSingleVisualReviewVersion(dual.single)
    || typeof receipt.judgedSha256 !== "string") return null;
  const asked = review.evidenceReviewAttempt ?? 1;
  if (!Number.isSafeInteger(asked) || asked < 1 || asked > SINGLE_TRANSPORT_CONTINUATIONS_PER_IMAGE) return null;
  const log = (Array.isArray(receipt.evidenceAttempts) ? receipt.evidenceAttempts.map(object) : [])
    .filter(a => a?.single === dual.single && a?.imageSha256 === receipt.judgedSha256);
  if (!log.length || log.length > SINGLE_TRANSPORT_CONTINUATIONS_PER_IMAGE || !log.some(a => a!.attempt === asked)
    || !log.every(a => a!.kind === "transport" && a!.role === "quality" && continuable(a!.code))) return null;
  return { asked };
}
