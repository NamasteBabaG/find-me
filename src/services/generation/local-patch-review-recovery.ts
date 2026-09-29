/** A malformed judge answer is missing evidence, not evidence of a bad image. */
export const LOCAL_PATCH_MAX_EVIDENCE_REVIEWS = 3;
export const LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS = 60 * 60_000;
/** Bound each burst, then automatically retry the same pixels after an outage.
 * A schema fault never authorizes another image or an invented visual pass. */
export function localPatchEvidenceRecovery(row: { status: string; lastError?: string | null; judgeJson?: string | null; updatedAt?: Date }, now = Date.now()) {
  try {
    const receipt = JSON.parse(row.judgeJson ?? "null");
    if (row.status !== "FAILED" || !row.lastError?.startsWith("quality-unresolved:")
      || receipt?.reviewState !== "board-review-complete" || !receipt.boardReview
      || !(receipt.wireFault || receipt.verdict === null)) return null;
    const storedAttempt = receipt.boardReview.evidenceReviewAttempt ?? 1;
    const validAttempt = Number.isSafeInteger(storedAttempt) && storedAttempt > 0 && storedAttempt < Number.MAX_SAFE_INTEGER;
    const attempt = validAttempt ? storedAttempt : LOCAL_PATCH_MAX_EVIDENCE_REVIEWS;
    const reviewedAt = typeof receipt.boardReview.evidenceReviewedAt === "string" ? Date.parse(receipt.boardReview.evidenceReviewedAt) : row.updatedAt?.getTime();
    const retryAt = typeof reviewedAt === "number" && Number.isFinite(reviewedAt) ? reviewedAt + LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS : Infinity;
    const waiting = attempt % LOCAL_PATCH_MAX_EVIDENCE_REVIEWS === 0 && now < retryAt;
    return { attempt, nextAttempt: attempt + 1, retry: validAttempt && !waiting, waiting, retryAt };
  } catch { return null; }
}
