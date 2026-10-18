import { describe, expect, it } from "vitest";
import { localPatchBoardsForVersion } from "../../scene/local-patch-catalog";
import {
  SUBJECT_CHECKS, SUBJECT_POLICY_VERSION, readSubjectAnswer, subjectPlanFor, subjectPlansForBoard, subjectRenderDirection,
  subjectReviewLabels, subjectReviewPrompt, subjectWardrobe, type SubjectPlan,
} from "../subject-policy";

const BOARDS = localPatchBoardsForVersion(12);
const antarctica = BOARDS.find(board => board.board === "antarctica")!;
const newyork = BOARDS.find(board => board.board === "newyork")!;
const observed = (status: string) => ({ status, observation: "A specific synthetic observation of the drawn child." });
/** A complete synthetic answer; every check passes unless overridden. */
function answer(plan: SubjectPlan, over: { checks?: Record<string, unknown>; faults?: { check: string; where: string }[]; hideId?: string } = {}) {
  return JSON.stringify({ hideId: over.hideId ?? plan.hideId, subjectPolicy: SUBJECT_POLICY_VERSION,
    checks: { photoLikeness: observed("pass"), canonicalAgreement: observed("pass"), faceVisible: observed("pass"),
      perceivedAge: { ...observed("pass"), estimatedMinYears: 6, estimatedMaxYears: 8 },
      plannedAction: observed("pass"), plannedHead: observed("pass"), plannedExpression: observed("pass"),
      requiredWardrobe: observed(plan.warmHat ? "pass" : "not-required"), ...over.checks },
    faults: over.faults ?? [] });
}

describe("versioned subject plans", () => {
  it("gives every hide of every v12 board its own head direction and expression, never the portrait's front-facing smile", () => {
    for (const board of BOARDS) {
      const plans = subjectPlansForBoard(board);
      expect(plans).toHaveLength(3);
      expect(new Set(plans.map(p => p.head)).size).toBe(3);
      expect(new Set(plans.map(p => p.expression)).size).toBe(3);
      expect(new Set(plans.map(p => p.action)).size).toBe(3);
      for (const plan of plans) {
        expect(plan.policy).toBe(SUBJECT_POLICY_VERSION);
        expect(`${plan.head} ${plan.gaze} ${plan.expression}`).not.toMatch(/facing the viewer|big smile|open smile/i);
      }
    }
  });
  it("requires a warm hat in Antarctica only, and replaces the historical hair-over-hat wardrobe there", () => {
    expect(subjectPlansForBoard(antarctica).every(p => p.warmHat)).toBe(true);
    expect(BOARDS.filter(b => b.board !== "antarctica").flatMap(b => subjectPlansForBoard(b)).some(p => p.warmHat)).toBe(false);
    // The enrolled wardrobe asks for a hat; the authored board brief itself is unchanged.
    expect(subjectWardrobe(subjectPlansForBoard(antarctica)[0]!)).toMatch(/warm knit winter hat/);
    expect(subjectWardrobe(subjectPlansForBoard(newyork)[0]!)).toBeUndefined();
  });
  it("tells the painter the plan, the exact age and the hat, without copying the portrait's pose", () => {
    const plan = subjectPlansForBoard(antarctica)[1]!, text = subjectRenderDirection(plan, 7, ["requiredWardrobe", "perceivedAge"]);
    expect(text).toContain(plan.head); expect(text).toContain(plan.expression);
    expect(text).toContain("exactly 7 years old");
    expect(text).toContain("WARM HAT REQUIRED");
    expect(text).toContain("Do NOT copy its head angle, its smile");
    expect(text).toContain("SUBJECT REPAIR: the previous painting failed requiredWardrobe, perceivedAge");
    expect(subjectRenderDirection(subjectPlansForBoard(newyork)[0]!, 7)).not.toContain("WARM HAT");
    expect(() => subjectRenderDirection(plan, 15)).toThrow();
  });
  it("labels the owned photograph and the canonical face as identity/age evidence, and the board pixels as the style authority", () => {
    const plan = subjectPlanFor(newyork, newyork.hides[0]!.id), labels = subjectReviewLabels(plan.hideId);
    expect(labels).toHaveLength(4);
    expect(labels[0]).toContain("ROLE=IDENTITY_AGE_PHOTO"); expect(labels[0]).toContain("Never a style");
    expect(labels[1]).toContain("ROLE=CANONICAL_ILLUSTRATED_FACE"); expect(labels[1]).toContain("Not a pose, head-angle or expression target");
    expect(labels[2]).toContain("authority for illustration style and lighting");
    const prompt = subjectReviewPrompt(plan, 7);
    for (const check of SUBJECT_CHECKS) expect(prompt).toContain(check);
    expect(prompt).toContain("Unsure never counts as a pass");
  });
});

describe("the subject reader decides; the model's summary never does", () => {
  const plan = subjectPlanFor(newyork, newyork.hides[0]!.id), hat = subjectPlanFor(antarctica, antarctica.hides[0]!.id);
  const read = (raw: string, p = plan, ageYears = 7) => readSubjectAnswer(raw, { hideId: p.hideId, ageYears, plan: p });
  it("passes only an explicit, observed pass of every check", () => {
    expect(read(answer(plan))).toMatchObject({ ok: true, disposition: "pass" });
    expect(read("```json\n" + answer(plan) + "\n```")).toMatchObject({ ok: true, disposition: "pass" });
  });
  it("does not accept a broad age range that could conceal a noticeably older child", () => {
    expect(read(answer(plan, { checks: { perceivedAge: { ...observed("pass"), estimatedMinYears: 7, estimatedMaxYears: 12 } } })))
      .toMatchObject({ ok: true, disposition: "uncertain", checks: { perceivedAge: "unsure" } });
    for (const p of subjectPlansForBoard(antarctica)) if (p.head.includes("profile")) {
      expect(subjectRenderDirection(p, 7)).not.toMatch(/both eyes[^.]{0,60}fully visible/i);
    }
  });
  it("fails an older-looking child even when every status says pass", () => {
    const result = read(answer(plan, { checks: { perceivedAge: { ...observed("pass"), estimatedMinYears: 9, estimatedMaxYears: 11 } } }));
    expect(result).toMatchObject({ ok: true, disposition: "repair", checks: { perceivedAge: "fail" } });
    if (result.ok) expect(result.faults.some(f => f.check === "perceivedAge" && /9-11.*7/.test(f.where))).toBe(true);
  });
  it("never counts unsure, an unlocated fail or a contradicted pass as approval", () => {
    expect(read(answer(plan, { checks: { photoLikeness: observed("unsure") } }))).toMatchObject({ disposition: "uncertain" });
    expect(read(answer(plan, { checks: { photoLikeness: observed("fail") } }))).toMatchObject({ disposition: "uncertain", checks: { photoLikeness: "unsure" } });
    expect(read(answer(plan, { faults: [{ check: "plannedHead", where: "The head faces the viewer like the portrait" }] })))
      .toMatchObject({ disposition: "uncertain", checks: { plannedHead: "unsure" } });
    expect(read(answer(plan, { faults: [{ check: "lighting", where: "Somewhere" }] }))).toMatchObject({ disposition: "uncertain" });
  });
  it("repairs a missing warm hat in Antarctica and refuses a hat answered as not required", () => {
    expect(read(answer(hat, { checks: { requiredWardrobe: observed("fail") }, faults: [{ check: "requiredWardrobe", where: "Bare head with hair exposed in the snow" }] }), hat))
      .toMatchObject({ disposition: "repair", checks: { requiredWardrobe: "fail" } });
    expect(read(answer(hat, { checks: { requiredWardrobe: observed("not-required") } }), hat)).toMatchObject({ disposition: "uncertain" });
    // No requirement elsewhere: nothing about wardrobe can fail there.
    expect(read(answer(plan, { checks: { requiredWardrobe: observed("fail") }, faults: [{ check: "requiredWardrobe", where: "No hat" }] }))).toMatchObject({ disposition: "pass" });
  });
  it("refuses another hide's answer, missing observations and malformed estimates as unreadable", () => {
    expect(read(answer(plan, { hideId: "newyork-v12-2" }))).toMatchObject({ ok: false, fault: { code: "ids" } });
    expect(read(answer(plan, { checks: { faceVisible: { status: "pass" } } }))).toMatchObject({ ok: false, fault: { code: "shape" } });
    expect(read(answer(plan, { checks: { perceivedAge: { ...observed("pass"), estimatedMinYears: 9, estimatedMaxYears: 5 } } }))).toMatchObject({ ok: false });
    expect(read("not json")).toMatchObject({ ok: false, fault: { code: "syntax" } });
    expect(read("")).toMatchObject({ ok: false, fault: { code: "empty" } });
  });
});
