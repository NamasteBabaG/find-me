import { describe, expect, it } from "vitest";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { SUBJECT_POLICY_VERSION, readSubjectAnswer, subjectPlanFor } from "../../../domain/generation/subject-policy";
import { localPatchQualityDisposition, parseLocalPatchVerdict } from "../local-patch-judge";
import { localPatchRepairChecks } from "../local-patch-prompt";
import { CURRENT_QUALITY_READER } from "../local-patch-dual-evidence";
import { withSubject } from "../local-patch-subject-review";
import { GOOD_V12_VERDICT } from "./local-patch-dual-fixtures";

const antarctica = localPatchBoardsForVersion(12).find(board => board.board === "antarctica")!;
const plan = subjectPlanFor(antarctica, antarctica.hides[0]!.id);
const observed = (status: string) => ({ status, observation: "A specific synthetic observation of the drawn child." });
const subject = (checks: Record<string, unknown>, faults: { check: string; where: string }[] = []) => readSubjectAnswer(JSON.stringify({
  hideId: plan.hideId, subjectPolicy: SUBJECT_POLICY_VERSION, checks: { photoLikeness: observed("pass"), canonicalAgreement: observed("pass"),
    faceVisible: observed("pass"), perceivedAge: { ...observed("pass"), estimatedMinYears: 7, estimatedMaxYears: 9 }, plannedAction: observed("pass"),
    plannedHead: observed("pass"), plannedExpression: observed("pass"), requiredWardrobe: observed("pass"), ...checks }, faults }),
{ hideId: plan.hideId, ageYears: 8, plan });

describe("an old quality pass cannot carry a subject failure through", () => {
  const quality = { [plan.hideId]: parseLocalPatchVerdict(GOOD_V12_VERDICT, 12, CURRENT_QUALITY_READER) };
  const acceptable = (verdicts: typeof quality) => localPatchQualityDisposition(verdicts[plan.hideId] ?? null, 12, { hideId: plan.hideId, reader: CURRENT_QUALITY_READER });
  it("starts from a quality verdict that passes on its own", () => {
    expect(acceptable(quality).state).toBe("acceptable");
  });
  it("turns a missing hat and an older face into located repairs routed to their own directions", () => {
    const reading = subject({ requiredWardrobe: observed("fail"), perceivedAge: { ...observed("pass"), estimatedMinYears: 11, estimatedMaxYears: 13 } },
      [{ check: "requiredWardrobe", where: "Bare head and exposed hair in the snow" }]);
    expect(reading).toMatchObject({ ok: true, disposition: "repair" });
    if (!reading.ok) return;
    const merged = withSubject(quality, plan.hideId, reading, CURRENT_QUALITY_READER);
    expect(acceptable(merged)).toMatchObject({ state: "retry" });
    expect(acceptable(merged).faults).toEqual(expect.arrayContaining(["childPresent", "ageAppropriate"]));
    // A missing hat is never sent as a face-likeness repair, whose direction asks for exposed hair.
    const repairs = localPatchRepairChecks(JSON.stringify({ verdict: merged[plan.hideId] }), 12, { hideId: plan.hideId });
    expect(repairs).toEqual(expect.arrayContaining(["childPresent", "ageAppropriate"]));
    expect(repairs).not.toContain("faceLikeness");
  });
  it("routes a photo likeness failure to face likeness, and explicit uncertainty to the bounded image route", () => {
    const drift = subject({ photoLikeness: observed("fail") }, [{ check: "photoLikeness", where: "Jaw and eye spacing of a different child than the photograph" }]);
    if (!drift.ok) throw Error("unreadable");
    expect(acceptable(withSubject(quality, plan.hideId, drift, CURRENT_QUALITY_READER))).toMatchObject({ state: "retry", faults: ["faceLikeness"] });
    const unsure = subject({ plannedExpression: observed("unsure") });
    if (!unsure.ok) throw Error("unreadable");
    expect(unsure.disposition).toBe("uncertain");
    expect(acceptable(withSubject(quality, plan.hideId, unsure, CURRENT_QUALITY_READER)).state).toBe("retry");
  });
  it("leaves the verdict untouched only for an explicit pass", () => {
    const pass = subject({});
    if (!pass.ok) throw Error("unreadable");
    expect(withSubject(quality, plan.hideId, pass, CURRENT_QUALITY_READER)).toBe(quality);
  });
});
