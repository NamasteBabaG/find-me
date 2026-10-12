import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CHILD_AGES } from "../../../domain/child-appearance";
import { childBodyDirection } from "../../../domain/child-body";
import type { SelfRepairDecision } from "../../../domain/scene/local-patch-self-repair";
import { selfRepairRenderInstructions } from "../../../domain/scene/local-patch-self-repair";
import { INTEGRATED_COLLECTION_BOARDS } from "../../../../content/adventures/wizard-integrated-release";
import { characterPrompt } from "../../../infra/generation/character-prompt";
import {
  AGE_BODY_CONTRACT, ageBodyRequestDirections, localPatchPrompt, paintRecipeForPinnedPrompt, pinnedLocalPatchPromptVersion, referenceNeutralHairDirections,
  LOCAL_PATCH_AGE_BODY_PROMPT_VERSION, LOCAL_PATCH_AGE_PROMPT_VERSION, LOCAL_PATCH_IDENTITY_LOCK_PROMPT_VERSION, LOCAL_PATCH_INTEGRATED_PROMPT_VERSION,
  LOCAL_PATCH_REFERENCE_NEUTRAL_PROMPT_VERSION, type LocalPatchPaintRecipe, type LocalPatchRepairCheck,
} from "../local-patch-prompt";
import { integrationDiagnosisPrompt } from "../local-patch-integration-diagnosis";
import { retainedRestylePrompt } from "../local-patch-restyle";
import type { IdentityGateReceipt } from "../board-wizard-identity-gate";
import { diagnoseIdentityFailures, identityRepairFeedback, IDENTITY_FEEDBACK_MAX, IDENTITY_FEEDBACK_ORDER } from "../identity-best-of-two";

/**
 * v16 is a new question for fresh v12 rows, chosen explicitly. These are prompt
 * contracts: they prove which words reach each paid stage, not how a painter
 * draws them, which only controlled renders can show.
 */
const sha = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);
const AGES = [3, 5, 6, 8, 10] as const;
type Board = (typeof INTEGRATED_COLLECTION_BOARDS)[number];
const HIDES = INTEGRATED_COLLECTION_BOARDS.flatMap(board => board.hides.map(hide => ({ board, hide })));
const painter = (board: Board, hide: Board["hides"][number], ageYears: number, paintRecipe: LocalPatchPaintRecipe, repairChecks?: readonly LocalPatchRepairCheck[]) =>
  localPatchPrompt({ ...board, pose: hide.pose, mask: hide.mask, placement: hide.placement, ageYears, contentVersion: 12, paintRecipe, ...(repairChecks ? { repairChecks } : {}) });
const v15 = (id: string, age = 8) => { const { board, hide } = HIDES.find(x => x.hide.id === id)!; return painter(board, hide, age, "scene-integration-v4"); };
const v16 = (id: string, age = 8) => { const { board, hide } = HIDES.find(x => x.hide.id === id)!; return painter(board, hide, age, "scene-integration-v5"); };
/** Wording that sized the new child by the person it replaces or by a neighbour. */
const SCALE_ANCHORS = /source child head and hand scale|head\/hand scale as the selected child|Match the scale of nearby children|Same natural child scale|at the original head size|at the same scale as the neighbors|proportions of a age-appropriate/;
/** A hair type imposed on every child, whatever the reference shows. */
const IMPOSED_HAIR = /dark curls|dark locks|curl silhouette|Group curls|grouped dark/i;
const REPAIRS: readonly LocalPatchRepairCheck[] = ["styleMatch", "scaleRight", "childPresent", "childOnlyOnce", "childComplete", "pictureWhole", "groundContact",
  "faceLikeness", "faceReadable", "severeSeam", "ageAppropriate", "lightingMatch", "neighborsIntact"];
const CAUSES: SelfRepairDecision["cause"][] = ["composition-clipping", "background-registration", "wrong-identity", "age-or-scale", "unreadable-evidence",
  "drawing-defect", "paint-style", "portrait-lighting", "neighbor-damage"];
const geometry = { returnWindow: { left: 20, top: 20, width: 470, height: 730 }, protectedCore: { left: 100, top: 160, width: 200, height: 400 },
  faceRect: { left: 140, top: 180, width: 80, height: 90 } };

describe("v13-v15 and the historical diagnosis are unchanged", () => {
  it("keeps the v15 painter, the historical v12 diagnosis and the v4 identity sheet byte for byte, for every hide and age", () => {
    // Recorded at 053338d1, before v16 existed. A difference here is a changed paid question.
    const recorded = {
      painter: { 3: "61fc55f904db785e", 5: "723382b1431d60f1", 6: "13c1511d82921e86", 8: "c79f0a5c544dbae8", 10: "1160286174046a76" },
      diagnosis: { 3: "5271ecc56aaf80d0", 5: "0b819f06fa9f985e", 6: "de1a1e6d0e62609b", 8: "284a7754c20d78ed", 10: "63a1b7245c10f551" },
      identity: { 3: "6f1f6b0fae1d95f8", 5: "405c021f47746e49", 6: "9bf94167a8090a49", 8: "887bf861a31d53dc", 10: "e06c9220e02934ca" },
    };
    const repairs = [undefined, ["ageAppropriate"], ["styleMatch", "lightingMatch", "neighborsIntact", "pictureWhole", "faceLikeness"]] as const;
    for (const age of AGES) {
      const texts = HIDES.flatMap(({ board, hide }) => repairs.map(r => referenceNeutralHairDirections(painter(board, hide, age, "scene-integration-v4", r))));
      expect(sha(texts.join("\n§\n")), `v15 painter, age ${age}`).toBe(recorded.painter[age]);
      const base = { ageYears: age, pose: "standing", support: "synthetic support", envelope: { left: 1, top: 2, width: 3, height: 4 }, sourceKeys: ["raw-1"], feedback: { feedback: "x" }, history: [] };
      expect(sha([integrationDiagnosisPrompt(base), integrationDiagnosisPrompt({ ...base, boundaryContext: true, excludedRegions: [{ left: 0, top: 0, width: 10, height: 10 }] })].join("\n§\n")),
        `diagnosis, age ${age}`).toBe(recorded.diagnosis[age]);
      expect(sha(characterPrompt({ styled: true, ageYears: age, qaStyleContractVersion: "board-matched-identity/v4" })), `identity, age ${age}`).toBe(recorded.identity[age]);
    }
  });

  it("pins v16 only for a fresh v12 row and only when it is chosen; a stored row keeps its own question", () => {
    expect(pinnedLocalPatchPromptVersion(null, LOCAL_PATCH_AGE_PROMPT_VERSION, 12)).toBe(LOCAL_PATCH_REFERENCE_NEUTRAL_PROMPT_VERSION);
    expect(pinnedLocalPatchPromptVersion(null, LOCAL_PATCH_AGE_PROMPT_VERSION, 12, "v15")).toBe(LOCAL_PATCH_REFERENCE_NEUTRAL_PROMPT_VERSION);
    expect(pinnedLocalPatchPromptVersion(null, LOCAL_PATCH_AGE_PROMPT_VERSION, 12, "v16")).toBe(LOCAL_PATCH_AGE_BODY_PROMPT_VERSION);
    expect(pinnedLocalPatchPromptVersion(null, LOCAL_PATCH_AGE_PROMPT_VERSION, 11, "v16")).toBe(LOCAL_PATCH_IDENTITY_LOCK_PROMPT_VERSION);
    for (const stored of [LOCAL_PATCH_INTEGRATED_PROMPT_VERSION, LOCAL_PATCH_REFERENCE_NEUTRAL_PROMPT_VERSION])
      expect(pinnedLocalPatchPromptVersion({ attempts: 2, promptVersion: stored }, LOCAL_PATCH_AGE_PROMPT_VERSION, 12, "v16")).toBe(stored);
    expect(pinnedLocalPatchPromptVersion({ attempts: 2, promptVersion: LOCAL_PATCH_AGE_BODY_PROMPT_VERSION }, LOCAL_PATCH_AGE_PROMPT_VERSION, 12, "v15")).toBe(LOCAL_PATCH_AGE_BODY_PROMPT_VERSION);
    expect(paintRecipeForPinnedPrompt(LOCAL_PATCH_AGE_BODY_PROMPT_VERSION)).toBe("scene-integration-v5");
    expect(paintRecipeForPinnedPrompt(LOCAL_PATCH_REFERENCE_NEUTRAL_PROMPT_VERSION)).toBe("scene-integration-v4");
  });
});

describe("v16: the stated age shapes the body; the placement only locates the child", () => {
  it("removed a scale anchor from every hide that had one", () => {
    // 21 + 3 Journey comparators tied to the replaced child, New York's three to
    // nearby children, and one Kingdom support sentence to its neighbours.
    expect(HIDES.filter(({ hide }) => SCALE_ANCHORS.test(v15(hide.id)))).toHaveLength(28);
    for (const { hide } of HIDES) expect(v16(hide.id), hide.id).not.toMatch(SCALE_ANCHORS);
  });

  it.each(AGES)("gives age %i to all 54 hides exactly once, with no other age and no fixed age8", age => {
    for (const { hide } of HIDES) {
      const prompt = v16(hide.id, age);
      expect(prompt.split(childBodyDirection(age)).length - 1, hide.id).toBe(1);
      for (const other of CHILD_AGES.filter(a => a !== age)) expect(prompt).not.toContain(`BODY AGE CONTRACT: ${other} years.`);
      expect(prompt).toContain(AGE_BODY_CONTRACT);
      expect(prompt).not.toMatch(/\bage8\b/);
    }
  });

  it("changes only the body between ages 3 and 10; the identity and placement wording stays the same", () => {
    for (const { hide } of HIDES) {
      const [young, old] = [3, 10].map(age => v16(hide.id, age).replace(childBodyDirection(age), "<BODY>"));
      expect(young, hide.id).toBe(old);
    }
    expect(AGE_BODY_CONTRACT).toContain("Image 2 alone decides the face and hair; the stated age never changes facial identity");
    expect(AGE_BODY_CONTRACT).toContain("everyday children's clothes");
  });

  it("describes the painted child neutrally and keeps who is replaced and who is kept exactly located", () => {
    expect(v15("greatwall-v12-1")).toContain("His hands hold the same sticks");
    expect(v16("greatwall-v12-1")).toContain("The new child's hands hold the same sticks");
    expect(v15("cloudcity-v12-3")).toContain("the taller child beside him");
    expect(v16("cloudcity-v12-3")).toContain("the other child beside the new child");
    const boyIdentifier = /Replace ONLY the [^.;]*\bboy\b/;
    expect(HIDES.filter(({ hide }) => boyIdentifier.test(v15(hide.id)))).toHaveLength(11);
    for (const { hide } of HIDES) expect(v16(hide.id), hide.id).not.toMatch(/\bHis hands\b|\bbeside him\b|Replace ONLY the [^.;]*\bboy\b/);
    // The source child is still found by clothing and position.
    expect(v16("amazon-v12-3")).toContain("Replace ONLY the blue-shirt child on the LEFT of the purple-shirt girl reading the wildlife book");
    expect(v16("icepalace-v12-1")).toContain("Replace ONLY the blue sweater child skating hand-in-hand between the two girls");
    expect(v16("paris-v12-2")).toContain("Replace ONLY the blue shirt child dancing to the LEFT of the girl in yellow");
    // Neighbours keep their own descriptions: they are locations, not the child.
    expect(v16("tokyo-v12-3")).toContain("she is NOT a replacement target");
    expect(v16("paris-v12-2")).toContain("Preserve the yellow-dress girl and accordion player");
    expect(v16("greatwall-v12-2")).toContain("Preserve the buns, elderly woman and puppet theatre");
    expect(v16("amazon-v12-3")).toContain("Same physical depth as the girl; the parent-stated age, not her size, decides the body.");
  });

  it("imposes no hair type through any repair, self-repair cause or restyle, and states the reference's own hair", () => {
    expect(painter(HIDES[0]!.board, HIDES[0]!.hide, 8, "scene-integration-v3")).toMatch(IMPOSED_HAIR);
    for (const { board, hide } of HIDES) {
      const plain = painter(board, hide, 8, "scene-integration-v5"), repaired = painter(board, hide, 8, "scene-integration-v5", REPAIRS);
      for (const text of [plain, repaired]) {
        expect(text, hide.id).not.toMatch(IMPOSED_HAIR);
        expect(text).toContain("Straight hair stays straight, short hair stays short");
      }
    }
    const { board, hide } = HIDES[0]!;
    for (const cause of CAUSES) {
      const decision: SelfRepairDecision = { action: "redraw-with-new-placement", cause, sourceKey: "new-image", explanation: "Synthetic located cause for a changed placement.", ...geometry };
      const request = ageBodyRequestDirections(`${painter(board, hide, 6, "scene-integration-v5")}\n\n${selfRepairRenderInstructions(decision)}`);
      expect(request, cause).not.toMatch(IMPOSED_HAIR);
      expect(request).toContain(AGE_BODY_CONTRACT);
    }
    const restyle = ageBodyRequestDirections(retainedRestylePrompt({ action: "restyle-retained", cause: "paint-style", sourceKey: `${hide.id}:${hide.pose}:render:2`,
      explanation: "Retained figure is complete; only its surface is photographic.", ...geometry }));
    expect(retainedRestylePrompt({ action: "restyle-retained", cause: "paint-style", sourceKey: "x", explanation: "Retained figure is complete; only its surface is photographic.", ...geometry })).toMatch(IMPOSED_HAIR);
    expect(restyle).not.toMatch(IMPOSED_HAIR);
  });

  it.each(AGES)("diagnoses a v16 row at its stated age %i; a historical row keeps its fixed sentence", age => {
    const base = { ageYears: age, pose: "standing", support: "synthetic support", envelope: { left: 1, top: 2, width: 3, height: 4 }, sourceKeys: [], feedback: null, history: [] };
    expect(integrationDiagnosisPrompt(base)).toContain("Do not shrink age8 into a toddler");
    const exact = integrationDiagnosisPrompt({ ...base, exactAge: true });
    expect(exact).not.toContain("age8");
    expect(exact).toContain(`Keep the ${age}-year-old body of the BODY AGE CONTRACT: never change its age to fit the window`);
    expect(exact).toContain(childBodyDirection(age));
  });
});

describe("v16 identity repair feedback", () => {
  const checks = { identity: "fail", age: "fail", paintedStyle: "pass", sheetLayout: "pass" } as const;
  const receipt = (reason: string) => ({ checks, reason }) as unknown as IdentityGateReceipt;
  /** An allowed 584-character review, as in the 9 October measurement. */
  const reason = "The face borrows a neighbour's eye spacing and the full-body views read younger than the stated age. ".repeat(8).slice(0, 584);

  it("keeps the repair strategy whole inside the provider window, where the historical order lost it", () => {
    const diagnosis = diagnoseIdentityFailures(receipt(reason), receipt(reason), 8);
    const historical = JSON.stringify({ checks, reason, diagnosis, attempt: 3 });
    // The provider reads the first 1,200 characters: the historical order never reached the strategy.
    expect(historical.slice(0, IDENTITY_FEEDBACK_MAX)).not.toContain("explicit age 8");
    const ordered = identityRepairFeedback({ checks, reason, diagnosis, attempt: 3 });
    expect(ordered.length).toBeLessThanOrEqual(IDENTITY_FEEDBACK_MAX);
    expect(ordered).toContain("original photo FIRST"); expect(ordered).toContain("explicit age 8");
    expect(ordered.indexOf("explicit age 8")).toBeLessThan(ordered.indexOf('"evidence"'));
    const parsed = JSON.parse(ordered);
    expect(parsed).toMatchObject({ order: IDENTITY_FEEDBACK_ORDER, attempt: 3, checks, candidates: [checks, checks] });
    expect(parsed.strategy).toHaveLength(3);
    // Only the evidence was shortened, from its end.
    expect(reason.startsWith(parsed.evidence.split(" | ")[0])).toBe(true);
  });

  it("keeps short evidence whole and survives a diagnosis it cannot read", () => {
    expect(JSON.parse(identityRepairFeedback({ checks, reason: "Face too generic." }))).toEqual({ order: IDENTITY_FEEDBACK_ORDER, strategy: [], checks, evidence: "Face too generic." });
    const unreadable = JSON.parse(identityRepairFeedback({ checks, reason: "Face too generic.", diagnosis: "{not json", attempt: 4 }));
    expect(unreadable).toMatchObject({ order: IDENTITY_FEEDBACK_ORDER, attempt: 4, strategy: [], checks, evidence: "Face too generic." });
  });
});
