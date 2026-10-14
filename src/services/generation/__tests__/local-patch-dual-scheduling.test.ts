import { describe, expect, it } from "vitest";
import { visualReviewPolicy } from "../../../domain/generation/visual-review-policy";
import { localPatchContinuityPending, CURRENT_QUALITY_READER } from "../local-patch-dual-evidence";
import { localPatchHideEvidenceIds } from "../local-patch-judge";
import { DUAL_VISUAL_REVIEW_V3 } from "../visual-review-release";
import { GOOD_V12_VERDICT } from "./local-patch-dual-fixtures";

function checkpoint() {
  const hideId="sydney-v12-1", policy=visualReviewPolicy("scene-quality","high");
  return { hide: hideId, judgedSha256: "a".repeat(64), geometrySha256: "b".repeat(64),
    dualQualityCheckpoint: { version: DUAL_VISUAL_REVIEW_V3, hideId, imageSha256: "a".repeat(64), geometrySha256: "b".repeat(64), identitySha256: "c".repeat(64),
      quality: { policy, model: policy.model, wireFault: null, finishReason: "end_turn", reader: CURRENT_QUALITY_READER,
        requestKey: "self-repair:board:sydney:"+"d".repeat(64), fingerprint: "d".repeat(64), attempt: 1, costMicroUsd: 100_000,
        raw: JSON.stringify({ hides: [{ hideId, evidenceIds: localPatchHideEvidenceIds(hideId), verdict: GOOD_V12_VERDICT }] }) }, continuity: null } };
}
const row=(receipt: unknown,status="GENERATED")=>({status,judgeJson:JSON.stringify(receipt)});
describe("completion-first scheduling hints never replace publication evidence",()=>{
  it("recognises a readable passing quality checkpoint still awaiting its independent role",()=>{
    expect(localPatchContinuityPending(row(checkpoint()))).toBe(true);
  });
  it("does not rank a different image, geometry, hide, unreadable answer or completed review as pending Sol",()=>{
    const base=checkpoint();
    for(const receipt of [ {...base,judgedSha256:"changed"},{...base,geometrySha256:"changed"},{...base,hide:"different"},
      {...base,boardReview:{}},{...base,dualQualityCheckpoint:{...base.dualQualityCheckpoint,continuity:{}}},
      {...base,dualQualityCheckpoint:{...base.dualQualityCheckpoint,quality:{...base.dualQualityCheckpoint.quality,raw:"unreadable"}}},
      {...base,dualQualityCheckpoint:{...base.dualQualityCheckpoint,quality:{...base.dualQualityCheckpoint.quality,reader:"unknown"}}}])
      expect(localPatchContinuityPending(row(receipt))).toBe(false);
    expect(localPatchContinuityPending(row(base,"FAILED"))).toBe(false);
    expect(localPatchContinuityPending({status:"GENERATED",judgeJson:"broken JSON"})).toBe(false);
  });
});
