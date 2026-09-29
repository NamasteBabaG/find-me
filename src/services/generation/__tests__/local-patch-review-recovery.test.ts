import { describe, expect, it } from "vitest";
import { localPatchEvidenceRecovery, LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS } from "../local-patch-review-recovery";

const now = Date.UTC(2026, 8, 30, 1);
const failed = (attempt: number, time = now) => ({ status: "FAILED", lastError: "quality-unresolved: schema",
  judgeJson: JSON.stringify({ reviewState: "board-review-complete", wireFault: "schema", verdict: null,
    boardReview: { evidenceReviewAttempt: attempt, evidenceReviewedAt: new Date(time).toISOString() } }) });

describe("unreadable evidence retries the same pixels with bounded bursts", () => {
  it("tries two new evidence questions before a quiet automatic backoff", () => {
    expect(localPatchEvidenceRecovery(failed(1), now)).toMatchObject({ retry: true, nextAttempt: 2 });
    expect(localPatchEvidenceRecovery(failed(2), now)).toMatchObject({ retry: true, nextAttempt: 3 });
    expect(localPatchEvidenceRecovery(failed(3), now)).toMatchObject({ retry: false, waiting: true, nextAttempt: 4 });
    expect(localPatchEvidenceRecovery(failed(3), now + LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS)).toMatchObject({ retry: true, waiting: false, nextAttempt: 4 });
    expect(localPatchEvidenceRecovery(failed(4), now)).toMatchObject({ retry: true, nextAttempt: 5 });
    expect(localPatchEvidenceRecovery(failed(6), now)).toMatchObject({ retry: false, waiting: true });
  });
  it("does not confuse a readable visual refusal with missing evidence", () => {
    expect(localPatchEvidenceRecovery({ ...failed(2), lastError: "quality-refused: photographic face" }, now)).toBeNull();
    expect(localPatchEvidenceRecovery({ ...failed(2), status: "GENERATED" }, now)).toBeNull();
  });
  it("never dispatches from an invented or corrupt attempt counter", () => {
    expect(localPatchEvidenceRecovery(failed(1.5), now)?.retry).toBe(false);
    expect(localPatchEvidenceRecovery(failed(Number.MAX_SAFE_INTEGER), now)?.retry).toBe(false);
  });
  it("uses the persisted row date for historical failures that predate the timestamp field", () => {
    const row = { ...failed(3), updatedAt: new Date(now), judgeJson: JSON.stringify({ reviewState: "board-review-complete",
      wireFault: "schema", verdict: null, boardReview: { evidenceReviewAttempt: 3 } }) };
    expect(localPatchEvidenceRecovery(row, now)?.retry).toBe(false);
    expect(localPatchEvidenceRecovery(row, now + LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS)?.retry).toBe(true);
  });
});
