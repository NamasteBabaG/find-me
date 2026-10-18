import { describe, expect, it } from "vitest";
import { localPatchBoardForVersion } from "../../../domain/scene/local-patch-catalog";
import { visualReviewPolicy } from "../../../domain/generation/visual-review-policy";
import { SUBJECT_POLICY_V2, SUBJECT_POLICY_VERSION, SUBJECT_READER, SUBJECT_READER_V2, subjectPlanFor } from "../../../domain/generation/subject-policy";
import { CURRENT_QUALITY_READER, type DualReviewProof, type SubjectStage } from "../local-patch-dual-evidence";
import { integrationDiagnosisPrompt } from "../local-patch-integration-diagnosis";
import { recomposeRefusedBySubject, refusedCompositionSource } from "../local-patch-self-repair";
import { SELF_REPAIR_COMPOSITION_VERSION, type SelfRepairDecision } from "../../../domain/scene/local-patch-self-repair";
import { poseOnlyRefusal } from "../../../domain/generation/subject-policy";
import { localPatchHideEvidenceIds } from "../local-patch-judge";
import { subjectRefusalOf } from "../local-patch-subject-review";
import { subjectRejudgePending } from "../subject-rejudge";
import { DUAL_VISUAL_REVIEW_V3 } from "../visual-review-release";
import { GOOD_V12_VERDICT } from "./local-patch-dual-fixtures";

/**
 * The pieces of local-patch-subject/v2 that decide what happens to a refused appearance, on
 * synthetic receipts written the way the pilot's records are: which v1 refusals are re-asked on
 * the same pixels (and which never are), what the next painting and diagnosis are told about the
 * child, and how a diagnosis is told a defect inside the painted child from a join defect.
 */
const HIDE = "newyork-v12-1", IMAGE = "a".repeat(64);
const plan = subjectPlanFor(localPatchBoardForVersion("newyork", 12)!, HIDE);
const opus = visualReviewPolicy("scene-quality", "high");
const observed = (status: string, observation = "A specific synthetic observation of the drawn child.") => ({ status, observation });

function qualityStage(verdict: Record<string, unknown> = GOOD_V12_VERDICT) {
  return { requestKey: "self-repair:board:newyork:q", fingerprint: "q", attempt: 1, policy: opus, model: opus.model, finishReason: "end_turn",
    wireFault: null, costMicroUsd: 90_000, reader: CURRENT_QUALITY_READER,
    raw: "```json\n" + JSON.stringify({ hides: [{ hideId: HIDE, evidenceIds: localPatchHideEvidenceIds(HIDE), verdict }] }) + "\n```" };
}
function v1Answer(failed: Record<string, string>, faults: { check: string; where: string }[]) {
  return JSON.stringify({ hideId: HIDE, subjectPolicy: SUBJECT_POLICY_VERSION, checks: {
    photoLikeness: observed(failed.photoLikeness ?? "pass"), canonicalAgreement: observed("pass"), faceVisible: observed("pass"),
    perceivedAge: { ...observed(failed.perceivedAge ?? "pass"), estimatedMinYears: 6, estimatedMaxYears: 8 },
    plannedAction: observed(failed.plannedAction ?? "pass"), plannedHead: observed(failed.plannedHead ?? "pass"),
    plannedExpression: observed("pass"), requiredWardrobe: observed("not-required") }, faults });
}
function v1Stage(failedChecks: string[], raw: string): SubjectStage {
  return { requestKey: "self-repair:board:newyork:s1", fingerprint: "s1", attempt: 1, policy: opus, model: opus.model, finishReason: "end_turn",
    wireFault: null, costMicroUsd: 60_000, raw, subjectPolicy: SUBJECT_POLICY_VERSION, reader: SUBJECT_READER, photoSha256: "p".repeat(64),
    planSha256: "l".repeat(64), failedChecks: failedChecks as SubjectStage["failedChecks"] };
}
function row(subject: SubjectStage, over: { quality?: ReturnType<typeof qualityStage>; receipt?: Record<string, unknown>; lastError?: string; status?: string } = {}) {
  const proof: DualReviewProof = { version: DUAL_VISUAL_REVIEW_V3, hideId: HIDE, imageSha256: IMAGE, geometrySha256: "g".repeat(64),
    identitySha256: "i".repeat(64), quality: over.quality ?? qualityStage(), continuity: null, subject };
  return { status: over.status ?? "FAILED", assetId: "ast-synthetic", lastError: over.lastError ?? "quality-retry: childPresent",
    judgeJson: JSON.stringify({ hide: HIDE, reviewState: "board-review-complete", judgedSha256: IMAGE, boardReview: { dual: proof }, ...over.receipt }) };
}
const ARMS = v1Answer({ plannedAction: "fail" }, [{ check: "plannedAction", where: "Child on the steps: both arms hang at the sides." }]);

describe("subject-rejudge/v1: which v1 refusals are asked again on the same pixels", () => {
  it("re-asks a refusal for the pose plan alone, whose quality answer passed", () => {
    expect(subjectRejudgePending(row(v1Stage(["plannedAction"], ARMS)))).toBe(true);
    expect(subjectRejudgePending(row(v1Stage(["plannedAction", "plannedHead"], ARMS)))).toBe(true);
  });

  it("never re-asks who the child is, their age, face or hat, a failed quality answer, other pixels, a paid repair in flight or a v2 stage", () => {
    const identity = v1Answer({ photoLikeness: "fail", plannedAction: "fail" }, [{ check: "photoLikeness", where: "Short cropped hair." }]);
    expect(subjectRejudgePending(row(v1Stage(["photoLikeness", "plannedAction"], identity)))).toBe(false);
    expect(subjectRejudgePending(row(v1Stage(["perceivedAge", "plannedAction"], ARMS)))).toBe(false);
    expect(subjectRejudgePending(row(v1Stage(["plannedAction"], ARMS), { quality: qualityStage({ ...GOOD_V12_VERDICT, faceLikeness: "unsure" }) }))).toBe(false);
    expect(subjectRejudgePending(row(v1Stage(["plannedAction"], ARMS), { receipt: { judgedSha256: "b".repeat(64) } }))).toBe(false);
    expect(subjectRejudgePending(row(v1Stage(["plannedAction"], ARMS), { receipt: { selfRepair: { phase: "applying" } } }))).toBe(false);
    expect(subjectRejudgePending(row(v1Stage(["plannedAction"], ARMS), { status: "GENERATED" }))).toBe(false);
    expect(subjectRejudgePending(row({ ...v1Stage(["plannedAction"], ARMS), subjectPolicy: SUBJECT_POLICY_V2, reader: SUBJECT_READER_V2 }))).toBe(false);
  });
});

describe("subject-diagnosis/v1: what the next painting and diagnosis are told about the child", () => {
  const v2Stage = (raw: string, failedChecks: SubjectStage["failedChecks"], over: Partial<SubjectStage> = {}): SubjectStage =>
    ({ ...v1Stage([], raw), subjectPolicy: SUBJECT_POLICY_V2, reader: SUBJECT_READER_V2, failedChecks, ...over });
  const v2Answer = (checks: Record<string, unknown>, faults: { check: string; where: string }[], portraitCopy = false) => JSON.stringify({ hideId: HIDE,
    subjectPolicy: SUBJECT_POLICY_V2, checks: { photoLikeness: observed("pass"), canonicalAgreement: observed("pass"), faceVisible: observed("pass"),
      perceivedAge: { ...observed("pass"), estimatedMinYears: 6, estimatedMaxYears: 8 }, requiredWardrobe: observed("not-required"), ...checks },
    appearance: { head: "frontal", expression: "open-smile", engagement: "posing", portraitCopy }, faults });
  const receipt = (subject: SubjectStage, verdict: Record<string, unknown> = GOOD_V12_VERDICT) => ({ verdict, boardReview: { dual: { subject } } });

  it("quotes the located defect of an identity refusal and calls it intrinsic", () => {
    const raw = v2Answer({ photoLikeness: observed("fail") }, [{ check: "photoLikeness", where: "Child on the steps: short cropped hair instead of the long fringe." }]);
    // A check both policies share keeps its code for a historical painter's replay as well.
    expect(subjectRefusalOf(receipt(v2Stage(raw, ["photoLikeness"])), plan, 7)).toEqual({ v1Codes: ["photoLikeness"], codes: ["photoLikeness"],
      located: ["photoLikeness: Child on the steps: short cropped hair instead of the long fringe."], intrinsic: true });
  });

  it("names a collection refusal without calling it intrinsic", () => {
    const stage = v2Stage(v2Answer({}, [], true), ["collectionVariety"], { collectionRefusal: `${HIDE} repeats the canonical portrait itself, which newyork-v12-2 on this board already shows` });
    expect(subjectRefusalOf(receipt(stage), plan, 7)).toMatchObject({ codes: ["collectionVariety"], intrinsic: false,
      located: [`collectionVariety: ${HIDE} repeats the canonical portrait itself, which newyork-v12-2 on this board already shows`] });
  });

  it("drops a v1 pose-plan refusal from what v2 requires, and keeps it only for the historical painter", () => {
    expect(subjectRefusalOf(receipt(v1Stage(["plannedAction"], ARMS)), plan, 7)).toEqual({ v1Codes: ["plannedAction"], codes: [], located: [], intrinsic: false });
  });

  it("treats the quality judge's own face or age doubt as a defect inside the painted child", () => {
    const verdict = { ...GOOD_V12_VERDICT, faceLikeness: "fail", verdict: "fail", faults: [{ check: "faceLikeness", where: "The face is a different child's." }] };
    expect(subjectRefusalOf({ verdict }, plan, 7)).toMatchObject({ codes: [], intrinsic: true });
  });

  it("tells the diagnosis the photograph's role, the refusal and that the failed painting cannot be recomposed into a fix", () => {
    const base = { ageYears: 7, pose: "standing", support: "the steps", envelope: { left: 1, top: 1, width: 10, height: 10 }, sourceKeys: [`${HIDE}:standing:render:2`],
      feedback: null, history: [] };
    const without = integrationDiagnosisPrompt(base);
    expect(without).not.toContain("ORIGINAL PHOTOGRAPH");
    const subject = { codes: ["photoLikeness"], located: ["photoLikeness: short cropped hair"], failedSource: `${HIDE}:standing:render:2`,
      suggestion: plan.action, warmHat: false };
    const intrinsic = integrationDiagnosisPrompt({ ...base, subject: { ...subject, intrinsic: true } });
    expect(intrinsic).toContain("the LAST image is the child's ORIGINAL PHOTOGRAPH");
    expect(intrinsic).toContain('"codes":["photoLikeness"],"located":["photoLikeness: short cropped hair"]');
    expect(intrinsic).toContain(`recomposing the painting it came from (sourceKey "${HIDE}:standing:render:2") cannot fix it`);
    const join = integrationDiagnosisPrompt({ ...base, subject: { ...subject, codes: [], located: [], intrinsic: false } });
    expect(join).toContain("prefer recompose-retained of that RAW over a new painting");
    // Everything else in the question is the historical text, in its order.
    expect(intrinsic.split("\n").filter(line => !without.split("\n").includes(line))).toHaveLength(3);
    expect(without.split("\n").every(line => intrinsic.includes(line))).toBe(true);
    // A refused composition whose source is not recorded: no retained painting may be recomposed.
    const unknown = integrationDiagnosisPrompt({ ...base, subject: { ...subject, failedSource: null, intrinsic: true } });
    expect(unknown).toContain("the painting it came from is not recorded: recompose no retained RAW");
  });
});

describe("subject-diagnosis/v1: the refused child's source painting is bound to the refused composition", () => {
  const hide = { id: "newyork-v12-1", pose: "standing" as const };
  const plan = (action: SelfRepairDecision["action"], sourceKey: string): SelfRepairDecision => ({ cause: "wrong-identity", explanation: "Synthetic plan for a binding test.",
    action, sourceKey, returnWindow: { left: 16, top: 16, width: 480, height: 736 }, protectedCore: { left: 60, top: 40, width: 40, height: 60 },
    faceRect: { left: 64, top: 44, width: 30, height: 30 } });
  const context = (failedSource: string | null) => ({ version: "subject-diagnosis/v1" as const, codes: ["photoLikeness"], located: [], intrinsic: true, failedSource });

  it("names an ordinary composition's recorded purchase, else its own attempt's render", () => {
    expect(refusedCompositionSource({ hide: hide.id }, null, hide, 2)).toBe("newyork-v12-1:standing:render:2");
    // A recomposition kept the high-water attempt but showed attempt 1's pixels.
    expect(refusedCompositionSource({ renderPurchase: { requestKey: "newyork-v12-1:standing:render:1" } }, null, hide, 2)).toBe("newyork-v12-1:standing:render:1");
    expect(refusedCompositionSource({ renderPurchase: { requestKey: "tokyo-v12-1:standing:render:1" } }, null, hide, 2)).toBe("newyork-v12-1:standing:render:2");
  });

  it("names a refused self-repair candidate's own source: recorded, else its own cycle's plan", () => {
    const awaiting = (decision: SelfRepairDecision) => ({ phase: "awaiting-review" as const, cycle: 3, decision, subjectContext: context("newyork-v12-1:standing:render:2") });
    expect(refusedCompositionSource({ compositionVersion: SELF_REPAIR_COMPOSITION_VERSION }, awaiting(plan("redraw-with-new-placement", "newyork-v12-1:standing:render:1")), hide, 2))
      .toBe("newyork-v12-1:standing:self-repair:3");
    expect(refusedCompositionSource({ compositionVersion: SELF_REPAIR_COMPOSITION_VERSION }, awaiting(plan("recompose-retained", "newyork-v12-1:standing:render:1")), hide, 2))
      .toBe("newyork-v12-1:standing:render:1");
    expect(refusedCompositionSource({ compositionSource: "newyork-v12-1:standing:self-repair:2" }, awaiting(plan("redraw-with-new-placement", "x")), hide, 2))
      .toBe("newyork-v12-1:standing:self-repair:2");
  });

  it("keeps the binding when a plan was refused and the same composition stays in place", () => {
    // Codex's case: self-repair:1 was refused for likeness; the next plan was rejected; the binding must survive.
    const rejected = { phase: "rejected" as const, cycle: 2, decision: null, subjectContext: context("newyork-v12-1:standing:self-repair:1") };
    expect(refusedCompositionSource({ compositionVersion: SELF_REPAIR_COMPOSITION_VERSION }, rejected, hide, 2)).toBe("newyork-v12-1:standing:self-repair:1");
    expect(refusedCompositionSource({ compositionSource: "newyork-v12-1:standing:render:1" }, { ...rejected, subjectContext: undefined }, hide, 2)).toBe("newyork-v12-1:standing:render:1");
    // A candidate written before the binding cannot say: unknown, never a guess.
    expect(refusedCompositionSource({ compositionVersion: SELF_REPAIR_COMPOSITION_VERSION }, { ...rejected, subjectContext: undefined }, hide, 2)).toBeNull();
    // A cycle that never produced a candidate leaves the ordinary composition, whose source is known.
    expect(refusedCompositionSource({ renderPurchase: { requestKey: "newyork-v12-1:standing:render:1" } }, { ...rejected, subjectContext: undefined }, hide, 2))
      .toBe("newyork-v12-1:standing:render:1");
  });

  it("refuses recomposing the refused child's painting, and any painting when its source is unknown", () => {
    expect(recomposeRefusedBySubject(context("k:render:2"), plan("recompose-retained", "k:render:2"))).toContain("cannot be fixed by recomposing");
    expect(recomposeRefusedBySubject(context("k:render:2"), plan("recompose-retained", "k:render:1"))).toBeNull();
    expect(recomposeRefusedBySubject(context("k:render:2"), plan("redraw-with-new-placement", "k:render:2"))).toBeNull();
    expect(recomposeRefusedBySubject(context(null), plan("recompose-retained", "k:render:1"))).toContain("not recorded");
    expect(recomposeRefusedBySubject({ ...context("k:render:2"), intrinsic: false }, plan("recompose-retained", "k:render:2"))).toBeNull();
    expect(recomposeRefusedBySubject(null, plan("recompose-retained", "k:render:2"))).toBeNull();
  });

  it("calls a v1 refusal pose-only only when it names the plan alone", () => {
    expect(poseOnlyRefusal(["plannedAction", "plannedHead"])).toBe(true);
    expect(poseOnlyRefusal([])).toBe(false);
    expect(poseOnlyRefusal(["plannedAction", "perceivedAge"])).toBe(false);
    expect(poseOnlyRefusal(["requiredWardrobe"])).toBe(false);
  });
});
