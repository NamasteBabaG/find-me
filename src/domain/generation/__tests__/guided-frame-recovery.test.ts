import { nativeMaskTailCandidate, NATIVE_MASK_TAIL_VERSION } from "../native-mask-tail";
import { describe, expect, it } from "vitest";
import { guidedFrameCandidate, guidedFrameExhausted, guidedFrameGeometry, guidedFrameMarker, newGuidedFrameMarker, guidedFrameDirections, guidedFrameOverlay, guidedFrameVersionMatches, parseGuidedFrameMarker } from "../guided-frame-recovery";
import { SINGLE_VISUAL_REVIEW_VERSION } from "../single-visual-review";
const failure = () => ({ status:"FAILED",attempts:2,assetId:"synthetic-asset",judgeJson:JSON.stringify({selfRepair:{version:"local-patch-self-repair/v1",subjectV2Cycles:3},reviewState:"board-review-complete",wireFault:null,judgedSha256:"a".repeat(64),
  verdict:{verdict:"fail",childComplete:"fail",boundaryIntegrity:{top:{status:"fail"}}},boardReview:{dual:{single:SINGLE_VISUAL_REVIEW_VERSION,quality:{requestKey:"synthetic:review",policy:{effort:"low",model:"gpt-6.1-sol"},raw:JSON.stringify({version:SINGLE_VISUAL_REVIEW_VERSION,assessment:{},continuity:{},doubt:false,doubtReason:null})}}}}) });
describe("guided frame eligibility preserves finite ordinary attempts",()=>{
  it("admits only a conclusive LOW boundary failure after two paintings, preserving the earlier cycles",()=>{ const row=failure();expect(guidedFrameCandidate(row)).toBe(true);const marker=newGuidedFrameMarker(row,"b".repeat(64));expect(marker).toMatchObject({originalAttempts:2,repairCyclesPreserved:3});const r=JSON.parse(row.judgeJson);r.guidedFrameRecovery=marker;expect(guidedFrameCandidate({...row,status:"PENDING",attempts:3,judgeJson:JSON.stringify(r)})).toBe(true);expect(guidedFrameMarker({...row,judgeJson:JSON.stringify(r)})).toEqual(marker);expect(guidedFrameCandidate({...row,attempts:3,judgeJson:JSON.stringify(r)})).toBe(false); });
  it.each([0,1,2])("reuses an existing LOW rejection at %s prior planner cycles",cycles=>{const row=failure(),r=JSON.parse(row.judgeJson);if(cycles)r.selfRepair.subjectV2Cycles=cycles;else delete r.selfRepair;row.judgeJson=JSON.stringify(r);expect(guidedFrameCandidate(row)).toBe(true);const marker=newGuidedFrameMarker(row,"b".repeat(64));expect(marker.repairCyclesPreserved).toBe(cycles);r.guidedFrameRecovery=marker;expect(guidedFrameExhausted({...row,status:"FAILED",attempts:3,judgeJson:JSON.stringify(r)})).toBe(true);expect(guidedFrameExhausted({...row,status:"GENERATED",attempts:3,judgeJson:JSON.stringify(r)})).toBe(false);});
  it.each(["accepted","only-one-attempt","cycles-overflow","wire-fault","high","old-model","no-single","no-boundary","doubt","missing-hash"])("rejects %s",kind=>{const row=failure(),r=JSON.parse(row.judgeJson);if(kind==="accepted")row.status="GENERATED";if(kind==="only-one-attempt")row.attempts=1;if(kind==="cycles-overflow")r.selfRepair.subjectV2Cycles=4;if(kind==="wire-fault")r.wireFault="http";if(kind==="high")r.boardReview.dual.quality.policy.effort="high";if(kind==="old-model")r.boardReview.dual.quality.policy.model="gpt-5.6-sol";if(kind==="no-single")delete r.boardReview.dual.single;if(kind==="no-boundary")r.verdict.boundaryIntegrity={};if(kind==="doubt"){const raw=JSON.parse(r.boardReview.dual.quality.raw);raw.doubt=true;raw.doubtReason="A located synthetic unresolved edge";r.boardReview.dual.quality.raw=JSON.stringify(raw);}if(kind==="missing-hash")delete r.judgedSha256;row.judgeJson=JSON.stringify(r);expect(guidedFrameCandidate(row)).toBe(false);});
});
describe("guide geometry is contained in the original immutable permission",()=>{
 const child={left:305,top:155,width:165,height:350},window={left:290,top:140,width:221,height:560};
 it("insets the head and sides but preserves the feet baseline and original rectangles",()=>{const before=structuredClone({child,window}),g=guidedFrameGeometry(child,window);expect({child,window}).toEqual(before);expect(g.target.left).toBeGreaterThan(child.left);expect(g.target.top).toBeGreaterThan(child.top);expect(g.target.left+g.target.width).toBeLessThan(child.left+child.width);expect(g.target.top+g.target.height).toBe(child.top+child.height);expect(g.returned).toEqual(window);expect(guidedFrameOverlay(child,window)).toContain("WHOLE TARGET INSIDE");expect(guidedFrameDirections(child,window)).toContain("No guide colour");});
 it.each([{...window,top:160},{...window,width:5},{...window,left:-1},{...window,height:800},{...window,left:1.5}])("rejects a window that cannot contain the original child",r=>{expect(()=>guidedFrameGeometry(child,r)).toThrow();});
});


describe("version-bound guided third painting", () => {
  it("preserves the historical v13 marker bytes and refuses their use for v12", () => {
    const marker = newGuidedFrameMarker(failure(), "b".repeat(64));
    expect(marker).not.toHaveProperty("sceneVersion");
    expect(guidedFrameVersionMatches(marker, 13)).toBe(true);
    expect(guidedFrameVersionMatches(marker, 12)).toBe(false);
  });
  it("binds a new Explorer marker to v12 without changing the finite third attempt", () => {
    const row = failure(), marker = newGuidedFrameMarker(row, "b".repeat(64), 12), receipt = JSON.parse(row.judgeJson);
    expect(marker).toMatchObject({ sceneVersion: 12, originalAttempts: 2, repairCyclesPreserved: 3 });
    expect(parseGuidedFrameMarker(marker)).toEqual(marker);
    receipt.guidedFrameRecovery = marker;
    expect(guidedFrameCandidate({ ...row, status: "PENDING", attempts: 3, judgeJson: JSON.stringify(receipt) })).toBe(true);
    expect(guidedFrameExhausted({ ...row, status: "FAILED", attempts: 3, judgeJson: JSON.stringify(receipt) })).toBe(true);
  });
  it.each([undefined, 10, 11, 13, 14])("refuses an Explorer guide for scene version %s", version => {
    expect(guidedFrameVersionMatches(newGuidedFrameMarker(failure(), "b".repeat(64), 12), version)).toBe(false);
  });
  it.each(["FAILED", "PENDING"])("never offers an Explorer fourth painting from %s", status => {
    const row = failure(), receipt = JSON.parse(row.judgeJson);
    receipt.guidedFrameRecovery = newGuidedFrameMarker(row, "b".repeat(64), 12);
    receipt.renderFault = "quality-seam: synthetic stationary background rewrite";
    receipt.compositionPermission = "refused";
    receipt.seam = { verdict: "background-rewritten", borderMeanDiff: 30, shift: { dx: 0, dy: 0 } };
    if (status === "PENDING") receipt.nativeMaskTail = { version: NATIVE_MASK_TAIL_VERSION, authorizationSha256: "c".repeat(64), previousAuthorizationSha256: "b".repeat(64),
      rowId: "synthetic-row", sourceRowSha256: "d".repeat(64), retainedRenderSha256: "e".repeat(64), originalAttempts: 3, authorizedAttempt: 4 };
    expect(nativeMaskTailCandidate({ ...row, status, attempts: status === "PENDING" ? 4 : 3, judgeJson: JSON.stringify(receipt) })).toBe(false);
  });
});
