import { describe, expect, it } from "vitest";
import { localPatchBoardForVersion } from "../../scene/local-patch-catalog";
import {
  SUBJECT_POLICY_V2, SUBJECT_POLICY_VERSION, readSubjectAnswer, readSubjectAnswerV2, subjectCollectionLookLimit, subjectCollectionRefusal, subjectCollectionSummary,
  subjectPlanFor, subjectPlansForBoard, subjectReviewPromptV2, type SubjectAppearance, type SubjectPlan,
} from "../subject-policy";
import { SUBJECT_PAINTER_V3, locatedDefects, subjectRenderDirectionV3 } from "../subject-painter";

/**
 * local-patch-subject/v2: the owner's clarification of 18 October 2026. Synthetic answers only,
 * written the way the judges answered the pilot: a natural pose is never a failure, and who the
 * child is, how old they look, a readable face and the Antarctica hat still decide.
 */
const board = (id: string) => localPatchBoardForVersion(id, 12)!;
const newyork = subjectPlanFor(board("newyork"), "newyork-v12-1");
const antarctica = subjectPlanFor(board("antarctica"), "antarctica-v12-1");
const pass = (observation: string) => ({ status: "pass", observation });
const APPEARANCE: SubjectAppearance = { head: "up", expression: "closed-smile", engagement: "watching", portraitCopy: false };
function answerV2(plan: SubjectPlan, over: { checks?: Record<string, unknown>; appearance?: Record<string, unknown>; faults?: unknown[] } = {}) {
  return JSON.stringify({ hideId: plan.hideId, subjectPolicy: SUBJECT_POLICY_V2,
    checks: { photoLikeness: pass("Eye spacing, nose and the long shaggy fringe match the photograph."),
      canonicalAgreement: pass("Face and layered hair over the ears agree with the canonical portrait."),
      faceVisible: pass("Three-quarter face with both eyes, nose and mouth readable."),
      perceivedAge: { ...pass("Round cheeks and a small slight body read as a young child."), estimatedMinYears: 6, estimatedMaxYears: 8 },
      requiredWardrobe: plan.warmHat ? pass("A fitted knit winter hat covers the crown; the face stays clear.") : { status: "not-required", observation: "No wardrobe requirement for this hide." },
      ...over.checks },
    appearance: { ...APPEARANCE, ...over.appearance }, faults: over.faults ?? [] });
}
/** The first New York correction, as v1 read it: everything held except the planned forearm. */
function historicalArmsAtSidesV1(plan: SubjectPlan) {
  return JSON.stringify({ hideId: plan.hideId, subjectPolicy: SUBJECT_POLICY_VERSION,
    checks: { photoLikeness: pass("Eye spacing, nose and the long shaggy fringe match the photograph."),
      canonicalAgreement: pass("Face and layered hair over the ears agree with the canonical portrait."),
      faceVisible: pass("Three-quarter face with both eyes, nose and mouth readable."),
      perceivedAge: { ...pass("Round cheeks and a small slight body read as a young child."), estimatedMinYears: 6, estimatedMaxYears: 8 },
      plannedAction: { status: "fail", observation: "Both arms hang straight at the sides instead of one forearm extended low." },
      plannedHead: pass("The head is lifted, looking up at the awning above."),
      plannedExpression: pass("Calm, curious look with lips closed."),
      requiredWardrobe: { status: "not-required", observation: "No wardrobe requirement for this hide." } },
    faults: [{ check: "plannedAction", where: "Child on the steps: both arms hang at the sides; no forearm extended into the scene." }] });
}

describe("local-patch-subject/v2: who the child is decides, not the pose", () => {
  it("reads the historical arms-at-the-sides refusal as v1 did, and accepts the same pixels' v2 answer", () => {
    expect(readSubjectAnswer(historicalArmsAtSidesV1(newyork), { hideId: newyork.hideId, ageYears: 7, plan: newyork }))
      .toMatchObject({ ok: true, disposition: "repair" });
    const reading = readSubjectAnswerV2(answerV2(newyork, { appearance: { head: "up", engagement: "watching" } }), { hideId: newyork.hideId, ageYears: 7, plan: newyork });
    expect(reading).toMatchObject({ ok: true, disposition: "pass", appearance: { head: "up", portraitCopy: false } });
  });

  it("keeps a fault about the pose and decides nothing from it", () => {
    const reading = readSubjectAnswerV2(answerV2(newyork, { faults: [{ check: "plannedAction", where: "Both arms hang at the sides on the steps." }] }),
      { hideId: newyork.hideId, ageYears: 7, plan: newyork });
    expect(reading).toMatchObject({ ok: true, disposition: "pass", derived: ["plan-only-fault-ignored"] });
  });

  it("still refuses a different child, an older-looking child, an unreadable face and an unlocated failure", () => {
    const read = (raw: string, plan = newyork) => readSubjectAnswerV2(raw, { hideId: plan.hideId, ageYears: 7, plan });
    expect(read(answerV2(newyork, { checks: { photoLikeness: { status: "fail", observation: "The hair is cropped short above the ears, unlike the photograph." } },
      faults: [{ check: "photoLikeness", where: "Child on the steps: short cropped hair instead of the long shaggy fringe." }] })))
      .toMatchObject({ ok: true, disposition: "repair", checks: { photoLikeness: "fail" } });
    expect(read(answerV2(newyork, { checks: { perceivedAge: { ...pass("Long limbs and a narrow face read as a pre-teen."), estimatedMinYears: 10, estimatedMaxYears: 12 } } })))
      .toMatchObject({ ok: true, disposition: "repair", checks: { perceivedAge: "fail" }, derived: ["perceivedAge:estimate-outside-stated-age"] });
    expect(read(answerV2(newyork, { checks: { faceVisible: { status: "unsure", observation: "The face is too small at native scale to read the features." } } })))
      .toMatchObject({ ok: true, disposition: "uncertain" });
    expect(read(answerV2(newyork, { checks: { canonicalAgreement: { status: "fail", observation: "The hair differs from the canonical portrait in length." } } })))
      .toMatchObject({ ok: true, disposition: "uncertain", derived: ["canonicalAgreement:unlocated-fail"] });
    expect(read(answerV2(newyork, { faults: [{ check: "neckJoin", where: "A seam crosses the neck of the child on the steps." }] })))
      .toMatchObject({ ok: true, disposition: "uncertain", derived: ["unclassified-fault"] });
  });

  it("still requires the Antarctica hat", () => {
    const read = (raw: string) => readSubjectAnswerV2(raw, { hideId: antarctica.hideId, ageYears: 7, plan: antarctica });
    expect(antarctica.warmHat).toBe(true);
    expect(read(answerV2(antarctica))).toMatchObject({ ok: true, disposition: "pass" });
    expect(read(answerV2(antarctica, { checks: { requiredWardrobe: { status: "fail", observation: "The child's hair is uncovered in the snow." } },
      faults: [{ check: "requiredWardrobe", where: "Kneeling child by the penguins: no hat, bare hair." }] }))).toMatchObject({ ok: true, disposition: "repair" });
    expect(read(answerV2(antarctica, { checks: { requiredWardrobe: { status: "not-required", observation: "No wardrobe requirement was visible to me." } } })))
      .toMatchObject({ ok: true, disposition: "uncertain", derived: ["requiredWardrobe:not-required-but-planned"] });
  });

  it("reads a longer observation and a differently spelled description, and refuses an unknown one", () => {
    const long = "The drawn child's eyes, nose, mouth, cheeks and the long layered fringe falling over the ears match the photograph closely; ".repeat(5);
    expect(long.length).toBeGreaterThan(400);
    const read = (raw: string) => readSubjectAnswerV2(raw, { hideId: newyork.hideId, ageYears: 7, plan: newyork });
    expect(read(answerV2(newyork, { checks: { photoLikeness: pass(long.slice(0, 780)) }, appearance: { head: "Three Quarter", expression: "OPEN_SMILE" } })))
      .toMatchObject({ ok: true, disposition: "pass", appearance: { head: "three-quarter", expression: "open-smile" } });
    expect(read(answerV2(newyork, { appearance: { head: "sideways" } }))).toMatchObject({ ok: false, fault: { code: "shape", path: "appearance.head" } });
    expect(read(answerV2(newyork, { appearance: { portraitCopy: "no" } }))).toMatchObject({ ok: false, fault: { code: "shape" } });
  });

  it("asks for the five checks and a description, and calls the plan a suggestion", () => {
    const prompt = subjectReviewPromptV2(newyork, 7);
    expect(prompt).toContain("NOT a requirement");
    expect(prompt).toContain("never a fail and never unsure");
    expect(prompt).toContain("portraitCopy true ONLY");
    expect(prompt).not.toMatch(/plannedAction|plannedHead|plannedExpression/);
    expect(subjectReviewPromptV2(newyork, 7, "bundle-member")).toContain(`subjectPolicy:"${SUBJECT_POLICY_V2}"`);
  });
});

describe("local-patch-subject/v2: variety belongs to the whole collection", () => {
  const copy: SubjectAppearance = { head: "three-quarter", expression: "open-smile", engagement: "posing", portraitCopy: true };
  const WORLD = ["amazon", "antarctica", "giza", "greatwall", "marrakech", "newyork", "paris", "sydney", "tokyo"].flatMap(id => subjectPlansForBoard(board(id)).map(plan => plan.hideId));
  const accept = (looks: (hideId: string, index: number) => SubjectAppearance) => {
    const accepted: { hideId: string; appearance: SubjectAppearance }[] = [], refused: string[] = [];
    WORLD.forEach((hideId, index) => { const appearance = looks(hideId, index);
      if (subjectCollectionRefusal({ hideId, appearance }, accepted, WORLD.length)) refused.push(hideId); else accepted.push({ hideId, appearance }); });
    return { accepted, refused };
  };

  it("accepts similar natural appearances: any look may repeat, the pasted portrait included, three times on one board", () => {
    expect(WORLD).toHaveLength(27);
    expect(subjectCollectionLookLimit(27)).toBe(9);
    // Three pasted portraits on the same board: no per-board limit.
    const tokyo = [{ hideId: "tokyo-v12-1", appearance: copy }, { hideId: "tokyo-v12-2", appearance: copy }];
    expect(subjectCollectionRefusal({ hideId: "tokyo-v12-3", appearance: copy }, tokyo, 27)).toBeNull();
    // A world of children who share heads, smiles and engagement in part, but never all three at once beyond a third.
    const heads = ["three-quarter", "up", "profile", "down", "frontal"] as const, expressions = ["closed-smile", "focused", "open-smile"] as const;
    const natural = accept((_, i) => ({ head: heads[i % 5]!, expression: expressions[i % 3]!, engagement: i % 2 ? "acting" : "watching", portraitCopy: i < 4 }));
    expect(natural.refused).toEqual([]);
    expect(subjectCollectionSummary(natural.accepted.map(a => a.appearance))).toMatchObject({ described: 27, portraitCopies: 4 });
    // Nine of one exact look are still accepted; a look accepted under v1 (no description) counts for nothing.
    expect(accept((_, i) => i < 9 ? copy : { ...APPEARANCE, head: heads[i % 5]! }).refused).toEqual([]);
    expect(subjectCollectionRefusal({ hideId: "tokyo-v12-3", appearance: copy }, WORLD.slice(0, 20).map(hideId => ({ hideId, appearance: null })), 27)).toBeNull();
  });

  it("corrects a material repetition: past a third of the world, one look is repainted with the suggestion", () => {
    // The pilot's failure, everywhere: every first painting pastes the portrait.
    const pasted = accept(() => copy);
    expect(pasted.accepted).toHaveLength(9); expect(pasted.refused).toHaveLength(18);
    expect(subjectCollectionRefusal({ hideId: pasted.refused[0]!, appearance: copy }, pasted.accepted, 27))
      .toContain("repeats a look (the pasted portrait) that 9 accepted appearances of this 27-hide world already show; at most 9 may share one look");
    // Any one look, not only the portrait.
    expect(accept(() => APPEARANCE).refused).toHaveLength(18);
    // Repainted with other looks, the world is accepted, no look beyond a third.
    const repainted = [...pasted.accepted, ...pasted.refused.map((hideId, i) => ({ hideId, appearance: { ...APPEARANCE, head: (["up", "down", "profile"] as const)[i % 3]! } }))];
    expect(subjectCollectionSummary(repainted.map(a => a.appearance))).toMatchObject({ described: 27, largestLook: 9 });
    expect(subjectCollectionLookLimit(9)).toBe(3); expect(subjectCollectionLookLimit(2)).toBe(1);
  });
});

describe("local-patch-subject-paint/v3", () => {
  it("requires the photograph's face, hair and age, and offers the plan as one natural option", () => {
    const text = subjectRenderDirectionV3(newyork, 7);
    expect(text).toContain(SUBJECT_PAINTER_V3);
    expect(text).toContain("Never crop, shorten, tidy or restyle the hair");
    expect(text).toContain("exactly 7 years old");
    expect(text).toContain("Relaxed arms at the sides are fine");
    expect(text).not.toContain("do not satisfy");
    expect(text).not.toContain("WARM HAT");
    expect(subjectRenderDirectionV3(antarctica, 7)).toContain("WARM HAT REQUIRED");
  });

  it("names a refusal's codes and quotes what the reviewer located, printable and bounded", () => {
    const located = locatedDefects([{ check: "photoLikeness", where: "Child on the steps: short cropped hair​ instead of the long shaggy fringe." },
      { check: "plannedAction", where: "Both arms hang at the sides." }], ["photoLikeness", "perceivedAge"]);
    expect(located).toEqual(["photoLikeness: Child on the steps: short cropped hair instead of the long shaggy fringe."]);
    const text = subjectRenderDirectionV3(newyork, 7, { codes: ["photoLikeness", "perceivedAge", "collectionVariety"], located });
    expect(text).toContain("refused for photoLikeness, perceivedAge, collectionVariety");
    expect(text).toContain("AGE REPAIR");
    expect(text).toContain("VARIETY REPAIR");
    expect(text).toContain('The reviewer located on the refused painting: "photoLikeness: Child on the steps: short cropped hair instead of the long shaggy fringe."');
  });
});
