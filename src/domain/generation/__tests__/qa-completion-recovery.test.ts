import { describe, expect, it } from "vitest";
import { qaCompletionEngineRest, qaCompletionGuidedRepair, qaCompletionUnknownsPreserved } from "../qa-completion-recovery";
import { GUIDED_FRAME_RECOVERY_VERSION } from "../guided-frame-recovery";
import { localPatchReadyReviewOwed, localPatchRestDecision, localPatchRestOf } from "../../scene/local-patch-progress";

const marker = { version: GUIDED_FRAME_RECOVERY_VERSION, authorizationSha256: "a".repeat(64),
  sourceImageSha256: "b".repeat(64), sourceAssetId: "synthetic-earlier-image", sourceReviewRequestKey: "synthetic-medium-review",
  originalAttempts: 2, repairCyclesPreserved: 0, sceneVersion: 12 };
const failure = (changes: object = {}) => ({ status: "FAILED", attempts: 3, assetId: "synthetic-earlier-image",
  judgeJson: JSON.stringify({ guidedFrameRecovery: marker, renderFault: "quality-seam: synthetic changed support", ...changes }) });

describe("an authorized existing-world completion after a guided third", () => {
  it("retains every original unknown and refuses newly unknown or reduced commitments", () => {
    const original = [{ requestKey: "synthetic-original-unknown", operationFingerprint: "a".repeat(64), reserveMicroUsd: 210000 }];
    const current = [{ ...original[0]!, state: "unknown" }];
    expect(qaCompletionUnknownsPreserved(current, original)).toBe(true);
    expect(qaCompletionUnknownsPreserved([{ ...current[0]!, state: "settled" }], original)).toBe(true);
    expect(qaCompletionUnknownsPreserved([], original)).toBe(false);
    expect(qaCompletionUnknownsPreserved([{ ...current[0]!, reserveMicroUsd: 0 }], original)).toBe(false);
    expect(qaCompletionUnknownsPreserved([...current, { ...current[0]!, requestKey: "synthetic-new-unknown" }], original)).toBe(false);
    expect(qaCompletionUnknownsPreserved([...current, { ...current[0]!, requestKey: "synthetic-new-settled", state: "settled" }], original)).toBe(true);
  });
  it("admits only remaining diagnosis cycles with live authority and the original scene", () => {
    expect(qaCompletionGuidedRepair(failure(), 12, true)).toBe(true);
    expect(qaCompletionGuidedRepair(failure(), 12, false)).toBe(false);
    expect(qaCompletionGuidedRepair(failure(), 13, true)).toBe(false);
    expect(qaCompletionGuidedRepair(failure({ guidedFrameRecovery: { ...marker, repairCyclesPreserved: 1 } }), 12, true)).toBe(false);
    expect(qaCompletionGuidedRepair({ ...failure(), attempts: 4 }, 12, true)).toBe(false);
  });
  it.each([1, 2])("preserves %i cycles already used before the guided third and admits only its remaining capacity", prior => {
    const marked = { ...marker, repairCyclesPreserved: prior };
    const repair = { version: "local-patch-self-repair/v1", phase: "awaiting-review", subjectV2Cycles: prior, cycle: prior };
    expect(qaCompletionGuidedRepair(failure({ guidedFrameRecovery: marked, selfRepair: repair }), 12, true)).toBe(true);
    expect(qaCompletionGuidedRepair(failure({ guidedFrameRecovery: marked, selfRepair: repair }), 12, false)).toBe(false);
    expect(qaCompletionGuidedRepair(failure({ guidedFrameRecovery: marked, selfRepair: { ...repair, subjectV2Cycles: prior - 1 } }), 12, true)).toBe(false);
    expect(qaCompletionGuidedRepair(failure({ guidedFrameRecovery: marked, selfRepair: { ...repair, subjectV2Cycles: 3 } }), 12, true)).toBe(false);
    expect(qaCompletionGuidedRepair(failure({ guidedFrameRecovery: marked, selfRepair: { ...repair, phase: "applying", subjectV2Cycles: 3 } }), 12, true)).toBe(true);
    expect(qaCompletionGuidedRepair(failure({ guidedFrameRecovery: { ...marked, repairCyclesPreserved: 3 }, selfRepair: repair }), 12, true)).toBe(false);
  });
  it("preserves the three-cycle bound and finishes a paid phase before it rests", () => {
    const repair = { version: "local-patch-self-repair/v1", phase: "awaiting-review", subjectV2Cycles: 2, cycle: 2 };
    expect(qaCompletionGuidedRepair(failure({ selfRepair: repair }), 12, true)).toBe(true);
    expect(qaCompletionGuidedRepair(failure({ selfRepair: { ...repair, subjectV2Cycles: 3 } }), 12, true)).toBe(false);
    expect(qaCompletionGuidedRepair(failure({ selfRepair: { ...repair, phase: "applying", subjectV2Cycles: 3 } }), 12, true)).toBe(true);
    expect(qaCompletionGuidedRepair(failure({ selfRepair: { ...repair, phase: "invented" } }), 12, true)).toBe(false);
  });
  it("never redraws for missing or unreadable evidence", () => {
    expect(qaCompletionGuidedRepair(failure({ renderFault: null }), 12, true)).toBe(false);
    expect(qaCompletionGuidedRepair(failure({ wireFault: "schema" }), 12, true)).toBe(false);
    expect(qaCompletionGuidedRepair(failure({ qualityDisposition: { state: "unresolved" } }), 12, true)).toBe(false);
    expect(qaCompletionGuidedRepair({ ...failure(), judgeJson: "{unreadable" }, 12, true)).toBe(false);
    expect(qaCompletionGuidedRepair(failure({ renderFault: null, reviewState: "board-review-complete", wireFault: null,
      verdict: { verdict: "fail" }, qualityDisposition: { state: "retry" } }), 12, true)).toBe(true);
  });
  it("recognizes the engine rest and rejects unrelated operator holds", () => {
    const rest = localPatchRestDecision([{ hideId: "synthetic-hide", rest: "spent" }]);
    expect(rest?.action).toBe("park");
    expect(qaCompletionEngineRest(rest?.action === "park" ? rest.reason : null)).toBe(true);
    expect(qaCompletionEngineRest("Unrelated operator hold")).toBe(false);
    expect(qaCompletionEngineRest(null)).toBe(false);
  });
});

it("keeps a new shipping image runnable beside spent siblings until its own bound review completes", () => {
  const row = (receipt: object) => ({ status: "GENERATED", judgeJson: JSON.stringify(receipt) });
  const pending = row({ reviewState: "pending-board-review", judgedSha256: "image-new" });
  expect(localPatchReadyReviewOwed(pending, { required: true })).toBe(true);
  const rests = [{ hideId: "spent-sibling", rest: "spent" as const }, localPatchRestOf({ hideId: "new-image", evidence: null,
    reviewOwed: localPatchReadyReviewOwed(pending, { required: true }), repairSpent: true })];
  expect(localPatchRestDecision(rests)).toBeNull();
  const accepted = { reviewState: "board-review-complete", qualityDisposition: { state: "acceptable" }, judgedSha256: "image-new",
    boardReview: { dual: { subject: {}, imageSha256: "image-new", identitySha256: "identity-canonical" } } };
  expect(localPatchReadyReviewOwed(row(accepted), { required: true, identitySha256: "identity-canonical" })).toBe(false);
  expect(localPatchReadyReviewOwed(row(accepted), { required: true, identitySha256: "identity-other" })).toBe(true);
  expect(localPatchReadyReviewOwed(row({ ...accepted, judgedSha256: "image-other" }), { required: true })).toBe(true);
  expect(localPatchReadyReviewOwed({ ...pending, status: "FAILED" }, { required: true })).toBe(false);
});
