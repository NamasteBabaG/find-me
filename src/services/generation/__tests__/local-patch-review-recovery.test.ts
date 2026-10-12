import { describe, expect, it } from "vitest";
import { localPatchEvidenceRecovery, LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS } from "../local-patch-review-recovery";
import { LOCAL_PATCH_EVIDENCE_ROUND_CAP, nextLocalPatchEvidenceStep, type EvidenceAttempt } from "../../../domain/scene/local-patch-evidence-policy";

const now = Date.UTC(2026, 9, 12, 1);
const IMAGE = "a".repeat(64);
/** A receipt as the deployed code wrote it: a round counter and a schema fault, no log. */
const failed = (attempt: number, time = now) => ({ status: "FAILED", lastError: "quality-unresolved: schema",
  judgeJson: JSON.stringify({ reviewState: "board-review-complete", wireFault: "schema", verdict: null, judgedSha256: IMAGE,
    boardReview: { evidenceReviewAttempt: attempt, evidenceReviewedAt: new Date(time).toISOString() } }) });
const round = (attempt: number, kind: EvidenceAttempt["kind"], strategy: EvidenceAttempt["strategy"] = "standard/v1",
  role: EvidenceAttempt["role"] = "continuity", at = now): EvidenceAttempt =>
  ({ attempt, role, kind, code: kind, path: kind === "length" ? "cases.0.headTrace" : null, strategy, at: new Date(at).toISOString(), imageSha256: IMAGE });
const logged = (...attempts: EvidenceAttempt[]) => ({ status: "FAILED", lastError: "quality-unresolved: integration-review-unreadable",
  judgeJson: JSON.stringify({ reviewState: "board-review-complete", wireFault: "schema", verdict: null, judgedSha256: IMAGE, evidenceAttempts: attempts,
    boardReview: { evidenceReviewAttempt: attempts.at(-1)!.attempt, evidenceReviewedAt: attempts.at(-1)!.at } }) });

describe("evidence recovery changes the question, and stops", () => {
  it("answers a format failure with a stricter question at once, and retires it after two failures", () => {
    expect(nextLocalPatchEvidenceStep([round(1, "shape")], now)).toMatchObject({ action: "ask", attempt: 2, strategy: "strict-json/v1",
      diagnosis: { family: "format", kind: "shape", next: "strict-json/v1", tried: [{ attempt: 1, kind: "shape", strategy: "standard/v1" }] } });
    expect(nextLocalPatchEvidenceStep([round(1, "shape"), round(2, "syntax", "strict-json/v1")], now))
      .toMatchObject({ action: "ask", attempt: 3, strategy: "strict-json/v1", diagnosis: null });
    expect(nextLocalPatchEvidenceStep([round(1, "shape"), round(2, "syntax", "strict-json/v1"), round(3, "shape", "strict-json/v1")], now))
      .toMatchObject({ action: "exhausted", diagnosis: { next: "exhausted", rounds: 3 } });
  });
  it("answers a length, count, oversize or truncation failure with a compact question", () => {
    for (const kind of ["length", "count", "oversize", "truncated"] as const)
      expect(nextLocalPatchEvidenceStep([round(1, kind)], now)).toMatchObject({ action: "ask", strategy: "compact/v1", diagnosis: { family: "size" } });
  });
  it("repeats only a transport failure, waits out two in a row, and the pause never resets the count", () => {
    expect(nextLocalPatchEvidenceStep([round(1, "transport")], now)).toMatchObject({ action: "ask", attempt: 2, strategy: "standard/v1" });
    const two = [round(1, "transport"), round(2, "transport")];
    expect(nextLocalPatchEvidenceStep(two, now)).toMatchObject({ action: "wait", retryAt: now + LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS });
    expect(nextLocalPatchEvidenceStep(two, now + LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS)).toMatchObject({ action: "ask", attempt: 3 });
    const four = [...two, round(3, "transport"), round(4, "transport")];
    expect(nextLocalPatchEvidenceStep(four, now + 10 * LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS)).toMatchObject({ action: "exhausted" });
    expect(LOCAL_PATCH_EVIDENCE_ROUND_CAP).toBe(4);
  });
  it("never waits forever, or buys at once, on an outage record whose time cannot be read", () => {
    const unreadable = [round(1, "transport"), { ...round(2, "transport"), at: "not a time" }];
    expect(nextLocalPatchEvidenceStep(unreadable, now)).toMatchObject({ action: "exhausted", diagnosis: { family: "transport", next: "exhausted" } });
    expect(localPatchEvidenceRecovery(logged(...unreadable), now)).toMatchObject({ retry: false, waiting: false, exhausted: true });
  });
  it("asks an uncertain reviewer to decide once, then hands the pixels to the bounded image route", () => {
    expect(nextLocalPatchEvidenceStep([round(1, "unsure")], now)).toMatchObject({ action: "ask", strategy: "decide/v1", diagnosis: { family: "visual" } });
    expect(nextLocalPatchEvidenceStep([round(1, "unsure"), round(2, "conflict", "decide/v1")], now)).toMatchObject({ action: "repair", diagnosis: { next: "repair" } });
  });
  it("never offers the image route for a reply that could not be read", () => {
    const steps = [[round(1, "syntax")], [round(1, "transport"), round(2, "truncated")], [round(1, "shape"), round(2, "shape", "strict-json/v1"), round(3, "shape", "strict-json/v1")]];
    for (const history of steps) expect(nextLocalPatchEvidenceStep(history, now)?.action).not.toBe("repair");
  });
});

describe("rows in the database", () => {
  it("moves a deployed receipt to the stricter question, and stops one that already used the total", () => {
    expect(localPatchEvidenceRecovery(failed(1), now)).toMatchObject({ retry: true, nextAttempt: 2, strategy: "strict-json/v1", exhausted: false });
    expect(localPatchEvidenceRecovery(failed(3), now)).toMatchObject({ retry: true, nextAttempt: 4, strategy: "strict-json/v1" });
    // The incident's rounds reached nine: no automatic question remains for them.
    for (const attempt of [4, 9]) expect(localPatchEvidenceRecovery(failed(attempt), now)).toMatchObject({ retry: false, waiting: false, exhausted: true });
  });
  it("reads the per-image log and ignores another image's rounds", () => {
    expect(localPatchEvidenceRecovery(logged(round(1, "length")), now)).toMatchObject({ retry: true, strategy: "compact/v1", role: "continuity" });
    const other = { ...round(1, "shape"), imageSha256: "b".repeat(64) };
    expect(localPatchEvidenceRecovery(logged(other, round(1, "transport")), now)).toMatchObject({ retry: true, strategy: "standard/v1" });
    expect(localPatchEvidenceRecovery(logged(round(1, "transport"), round(2, "transport")), now)).toMatchObject({ retry: false, waiting: true, exhausted: false });
  });
  it("does not confuse a readable visual refusal with missing evidence", () => {
    expect(localPatchEvidenceRecovery({ ...failed(2), lastError: "quality-refused: photographic face" }, now)).toBeNull();
    expect(localPatchEvidenceRecovery({ ...failed(2), status: "GENERATED" }, now)).toBeNull();
  });
  it("never dispatches from an invented or corrupt attempt counter", () => {
    expect(localPatchEvidenceRecovery(failed(1.5), now)).toMatchObject({ retry: false, exhausted: true });
    expect(localPatchEvidenceRecovery(failed(Number.MAX_SAFE_INTEGER), now)).toMatchObject({ retry: false, exhausted: true });
  });
  it("uses the persisted row date for historical failures that predate the timestamp field", () => {
    const row = { ...failed(2), updatedAt: new Date(now), judgeJson: JSON.stringify({ reviewState: "board-review-complete",
      wireFault: "timeout", verdict: null, judgedSha256: IMAGE, boardReview: { evidenceReviewAttempt: 2 } }) };
    // Two rounds whose latest was a transport failure: the earlier one is unknown, so no outage streak is assumed.
    expect(localPatchEvidenceRecovery(row, now)).toMatchObject({ retry: true, nextAttempt: 3, strategy: "standard/v1" });
  });
});
