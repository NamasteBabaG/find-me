import { describe, expect, it } from "vitest";
import { SINGLE_TRANSPORT_CONTINUATIONS_PER_IMAGE, SINGLE_TRANSPORT_DEADLINE_CODE, singleTransportCandidate, singleTransportContinuation, singleTransportFaultOf,
} from "../single-transport-continuation";
import { SINGLE_MEDIUM_VISUAL_REVIEW_VERSION, SINGLE_VISUAL_REVIEW_VERSION } from "../single-visual-review";

const image = "a".repeat(64), key = "self-repair:board:amazon:" + "b".repeat(64);
const outcome = (providerStatus: string, over: Record<string, unknown> = {}) =>
  ({ kind: "outcome" as const, state: "unusable" as const, responseId: "resp_x", providerStatus, at: Date.parse("2026-11-03T19:15:02Z"), ...over });
const receipt = (over: Record<string, unknown> = {}, review: Record<string, unknown> = {}, dual: Record<string, unknown> = {}) => ({
  hide: "amazon-detectives-hide-1", reviewState: "board-review-complete", verdict: null, wireFault: "http", judgedSha256: image,
  boardReview: { requestKey: key, evidenceReviewAttempt: 1, raw: null, ...review,
    dual: { single: SINGLE_MEDIUM_VISUAL_REVIEW_VERSION, imageSha256: image, quality: { requestKey: key, raw: null }, ...dual } }, ...over });
const failed = (r: Record<string, unknown>) => ({ status: "FAILED", lastError: "quality-unresolved: integration-review-unreadable", judgeJson: JSON.stringify(r) });
const logged = (attempt = 1, code: string = SINGLE_TRANSPORT_DEADLINE_CODE, extra: Record<string, unknown> = {}) => ({ attempt, role: "quality", kind: "transport",
  code, path: null, strategy: "standard/v1", at: "2026-11-03T19:15:02.540Z", imageSha256: image, single: SINGLE_MEDIUM_VISUAL_REVIEW_VERSION, ...extra });

describe("single-transport-continuation/v1: which round ends admit one more question", () => {
  it("never renews an invalid or already advanced single-image counter", () => {
    for (const attempt of [0,-1,2,7,"1",Number.MAX_SAFE_INTEGER])
      expect(singleTransportContinuation(receipt({evidenceAttempts:[logged(attempt as number)]},{evidenceReviewAttempt:attempt})),String(attempt)).toBeNull();
  });
  it("admits our own deadline cancel and a provider failure that is not permanent", () => {
    expect(singleTransportFaultOf({ cancelAt: 1, terminal: outcome("cancelled") })).toBe(SINGLE_TRANSPORT_DEADLINE_CODE);
    expect(singleTransportFaultOf({ cancelAt: null, terminal: outcome("failed", { errorCode: "server_error" }) })).toBe("provider-failed:server_error");
    expect(singleTransportFaultOf({ cancelAt: null, terminal: outcome("failed") })).toBe("provider-failed:unclassified");
  });
  it("refuses everything else: a cancel the engine did not make, permanent failures, unknown or unpriced charges, refusals, answers", () => {
    expect(singleTransportFaultOf({ cancelAt: null, terminal: outcome("cancelled") })).toBeNull();
    for (const errorCode of ["insufficient_quota", "invalid_prompt", "image_content_policy_violation", "content_filter"])
      expect(singleTransportFaultOf({ cancelAt: null, terminal: outcome("failed", { errorCode }) }), errorCode).toBeNull();
    expect(singleTransportFaultOf({ cancelAt: 1, terminal: outcome("cancelled", { state: "unpriced" }) })).toBeNull();
    expect(singleTransportFaultOf({ cancelAt: 1, terminal: outcome("cancelled", { state: "missing" }) })).toBeNull();
    expect(singleTransportFaultOf({ cancelAt: 1, terminal: outcome("incomplete") })).toBeNull();
    expect(singleTransportFaultOf({ cancelAt: null, terminal: outcome("completed", { state: "answered" }) })).toBeNull();
    expect(singleTransportFaultOf({ cancelAt: null, terminal: { kind: "refused", status: 429, errorType: "insufficient_quota", at: 1 } })).toBeNull();
    expect(singleTransportFaultOf({ cancelAt: null, terminal: { kind: "lost", reason: "x", at: 1 } })).toBeNull();
    expect(singleTransportFaultOf({ cancelAt: null, terminal: null })).toBeNull();
  });
});

describe("single-transport-continuation/v1: candidates and the one continuation", () => {
  it("names game 3's unlogged cancellation, and nothing already logged, readable, interrupted or not single", () => {
    expect(singleTransportCandidate(failed(receipt()))).toEqual({ requestKey: key, imageSha256: image, attempt: 1, single: SINGLE_MEDIUM_VISUAL_REVIEW_VERSION });
    expect(singleTransportCandidate(failed(receipt({}, { evidenceReviewAttempt: 2 })))?.attempt).toBe(2);
    expect(singleTransportCandidate(failed(receipt({ evidenceAttempts: [logged()] })))).toBeNull();
    expect(singleTransportCandidate(failed(receipt({}, {}, { quality: { requestKey: key, raw: "{\"version\":1}" } })))).toBeNull();
    expect(singleTransportCandidate(failed(receipt({ reviewInterruption: { policyId: "single-sol-medium-transport-recovery/v1" } })))).toBeNull();
    expect(singleTransportCandidate(failed(receipt({}, {}, { single: undefined })))).toBeNull();
    expect(singleTransportCandidate(failed(receipt({}, {}, { imageSha256: "c".repeat(64) })))).toBeNull();
    expect(singleTransportCandidate(failed(receipt({ verdict: { verdict: "fail" } })))).toBeNull();
    expect(singleTransportCandidate({ ...failed(receipt()), status: "GENERATED" })).toBeNull();
    expect(singleTransportCandidate({ ...failed(receipt()), lastError: "quality-retry: severeSeam" })).toBeNull();
  });

  it("asks exactly one continuation per image, from the logged latest round, and only for admitted codes", () => {
    expect(SINGLE_TRANSPORT_CONTINUATIONS_PER_IMAGE).toBe(1);
    expect(singleTransportContinuation(receipt({ evidenceAttempts: [logged()] }))).toEqual({ asked: 1 });
    expect(singleTransportContinuation(receipt({ evidenceAttempts: [logged(1, "provider-failed:server_error")] }))).toEqual({ asked: 1 });
    // Unlogged (the round is still to be read), spent, or another kind of history: no continuation.
    expect(singleTransportContinuation(receipt())).toBeNull();
    expect(singleTransportContinuation(receipt({ evidenceAttempts: [logged(1), logged(2)] }, { evidenceReviewAttempt: 2 }))).toBeNull();
    expect(singleTransportContinuation(receipt({ evidenceAttempts: [logged(1, "timeout")] }))).toBeNull();
    expect(singleTransportContinuation(receipt({ evidenceAttempts: [logged(1, SINGLE_TRANSPORT_DEADLINE_CODE, { kind: "syntax" })] }))).toBeNull();
    expect(singleTransportContinuation(receipt({ evidenceAttempts: [logged(1, SINGLE_TRANSPORT_DEADLINE_CODE, { imageSha256: "c".repeat(64) })] }))).toBeNull();
    expect(singleTransportContinuation(receipt({ evidenceAttempts: [logged(1, SINGLE_TRANSPORT_DEADLINE_CODE, { single: SINGLE_VISUAL_REVIEW_VERSION })] }))).toBeNull();
    expect(singleTransportContinuation(receipt({ evidenceAttempts: [logged()] }, { evidenceReviewAttempt: 2 }))).toBeNull();
    expect(singleTransportContinuation(receipt({ evidenceAttempts: [logged()], reviewInterruption: {} }))).toBeNull();
  });
});
