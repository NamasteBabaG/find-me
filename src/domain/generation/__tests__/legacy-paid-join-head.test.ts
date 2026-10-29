import { describe, expect, it } from "vitest";
import { legacyHeadCorrectionCandidate } from "../legacy-paid-join-head";

const returned = { left: 100, top: 120, width: 200, height: 420 };
function candidate(sourceKey = "synthetic-hide:standing:render:2", window = returned) {
  return { status: "FAILED", assetId: "synthetic-candidate", attempts: 2, judgeJson: JSON.stringify({
    hide: "synthetic-hide", pose: "standing", judgedSha256: "a".repeat(64), compositionVersion: "autonomous-paid-join/v1",
    compositionSource: "synthetic-hide:standing:render:2", selfRepair: { version: "local-patch-self-repair/v1", phase: "awaiting-review", cycle: 1 },
    recoveryComposition: { rawSha256: "b".repeat(64), alphaSha256: "c".repeat(64), sourceSha256: "d".repeat(64),
      outsideChangedPixels: 0, protectedChangedPixels: 0, protectedGuardPx: 12, maximumFeatherWidthPx: 6,
      crop: { left: 0, top: 0, width: 512, height: 768 }, returnWindow: returned,
      protectedCore: { left: 118, top: 138, width: 164, height: 384 }, faceRect: { left: 130, top: 150, width: 50, height: 60 } },
    boardReview: { dual: { quality: { headEvidence: { sourceRequestKey: sourceKey, returned: window } } } },
    verdict: { verdict: "fail", faults: [{ check: "childComplete", where: "HEAD_RETURN: complete target crown crosses the opaque return" }] },
  }) };
}
describe("legacy head input correction scheduling", () => {
  it("leaves a real crown refusal with the correct existing inputs on its ordinary repair path", () => {
    expect(legacyHeadCorrectionCandidate(candidate())).toBe(false);
  });
  it("still identifies the wrong RAW or wrong returned window for source-authenticated correction", () => {
    expect(legacyHeadCorrectionCandidate(candidate("synthetic-hide:standing:render:1"))).toBe(true);
    expect(legacyHeadCorrectionCandidate(candidate(undefined, { ...returned, top: 121 }))).toBe(true);
  });
});
