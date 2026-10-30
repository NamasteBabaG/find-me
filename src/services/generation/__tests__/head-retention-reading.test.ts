import { describe, expect, it } from "vitest";
import { localPatchBoundEnvelopeUndecided, localPatchHeadRetentionUnread, localPatchRetainedAnswerUndecided } from "../local-patch-dual-evidence";
import { TARGET_HEAD_RETURN_VERSION, TARGET_HEAD_VISIBLE_VERSION } from "../../../domain/generation/target-head-return";

// Scheduling only: which committed decisions owe the one free measured re-reading.
const sha = (c: string) => c.repeat(64);
const head = { version: TARGET_HEAD_VISIBLE_VERSION, gameId: "synthetic-game", hideId: "synthetic-hide", sourceRequestKey: "synthetic-hide:standing:render:1",
  sourceFingerprint: sha("a"), sourcePayloadSha256: sha("b"), normalizedRawSha256: sha("c"), shippingSha256: sha("d"), geometrySha256: sha("e"),
  identitySha256: sha("f"), returned: { left: 100, top: 200, width: 300, height: 400 }, feather: 12 };
const stage = (patch: object = {}) => ({ requestKey: "self-repair:board:synthetic:" + sha("9"), fingerprint: sha("9"), raw: "{\"version\":\"single-sol-medium/v1\"}", ...patch });
function row(patch: { status?: string; head?: object | undefined; subject?: object; receipt?: object } = {}) {
  const proof = { version: "dual", single: "single-sol-medium/v1", hideId: "synthetic-hide", imageSha256: sha("d"), geometrySha256: sha("e"), identitySha256: sha("f"),
    quality: stage("head" in patch ? (patch.head ? { headEvidence: patch.head } : {}) : { headEvidence: head }), continuity: stage(), subject: stage(patch.subject) };
  return { status: patch.status ?? "GENERATED", lastError: null, judgeJson: JSON.stringify({ reviewState: "board-review-complete", hide: "synthetic-hide",
    judgedSha256: sha("d"), geometrySha256: sha("e"), boardReview: { dual: proof }, ...patch.receipt }) };
}

describe("one free measured re-reading of an unmeasured visible-head decision", () => {
  it("schedules a committed visible-head PASS whose evidence predates measured retention", () => {
    expect(localPatchHeadRetentionUnread(row())).toBe(true);
    // The existing exact-document route reads it, so no new question or purchase path exists.
    expect(localPatchBoundEnvelopeUndecided(row())).toBe(true);
    expect(localPatchRetainedAnswerUndecided(row())).toBe(true);
  });
  it("never schedules itself again once the measurement is attached", () => {
    expect(localPatchHeadRetentionUnread(row({ head: { ...head, retention: { version: "head-retention/v1" } } }))).toBe(false);
  });
  it("leaves historical v1 decisions, refusals and other phases alone", () => {
    expect(localPatchHeadRetentionUnread(row({ head: { ...head, version: TARGET_HEAD_RETURN_VERSION } }))).toBe(false);
    expect(localPatchHeadRetentionUnread(row({ head: undefined }))).toBe(false);
    expect(localPatchHeadRetentionUnread(row({ status: "FAILED" }))).toBe(false);
    expect(localPatchHeadRetentionUnread(row({ receipt: { reviewState: "pending-board-review" } }))).toBe(false);
    expect(localPatchHeadRetentionUnread({ status: "GENERATED", judgeJson: "{broken" })).toBe(false);
  });
  it("requires every role to be the same settled document about the same pixels", () => {
    expect(localPatchHeadRetentionUnread(row({ subject: { raw: "{\"version\":\"other\"}" } }))).toBe(false);
    expect(localPatchHeadRetentionUnread(row({ subject: { fingerprint: sha("8") } }))).toBe(false);
    expect(localPatchHeadRetentionUnread(row({ receipt: { judgedSha256: sha("7") } }))).toBe(false);
    expect(localPatchHeadRetentionUnread(row({ receipt: { hide: "another-hide" } }))).toBe(false);
  });
});
