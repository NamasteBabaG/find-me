import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CHILD_AGES } from "../../../domain/child-appearance";
import { childBodyDirection } from "../../../domain/child-body";
import { INTEGRATED_COLLECTION_BOARDS } from "../../../../content/adventures/wizard-integrated-release";
import { characterPrompt } from "../../../infra/generation/character-prompt";
import { localPatchPrompt, referenceNeutralHairDirections } from "../local-patch-prompt";
import { integrationDiagnosisPrompt } from "../local-patch-integration-diagnosis";
import { localPatchBoardJudgePrompt } from "../local-patch-judge";
import { PLAYER_REVIEW_MODE } from "../local-patch-player-review";

/**
 * Explorers or Detectives changes which boards are searched, never the child.
 * No prompt builder takes a search level: the body comes from the exact,
 * parent-confirmed age alone, in every paid stage a fresh v12 game uses.
 */
const sha = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);
const board = INTEGRATED_COLLECTION_BOARDS[0]!, hide = board.hides[0]!;
const painter = (ageYears: number, repairChecks?: ["ageAppropriate"]) => referenceNeutralHairDirections(localPatchPrompt({
  ...board, pose: hide.pose, mask: hide.mask, placement: hide.placement, ageYears, contentVersion: 12, paintRecipe: "scene-integration-v4",
  ...(repairChecks ? { repairChecks } : {}) }));

describe("the exact age, not the search level, decides the body", () => {
  it("freezes today's body text byte for byte: a change needs a new versioned recipe, never an edit in place", () => {
    // Pinned v13-v15 painter rows, v3/v4 identity sheets, gates and diagnoses all embed this
    // text under unchanged labels; editing it would silently change paid questions in flight.
    expect(Object.fromEntries(CHILD_AGES.map(age => [age, sha(childBodyDirection(age))]))).toEqual({
      2: "61fbee902893e7aa", 3: "0548386947ee4654", 4: "f641132dfbcaf2c1", 5: "deb9937de4bf3f6a", 6: "7788bd8ad926b311",
      7: "8b1234ddf07871d9", 8: "d4c81ca8f93dd005", 9: "e155f845c1b672b9", 10: "8bdbf72e15f27ff0",
    });
  });

  it.each([3, 5, 6, 8, 10])("age %i reaches the identity sheet, the v15 painter, its age repair and the diagnosis", age => {
    const body = childBodyDirection(age);
    expect(characterPrompt({ styled: true, ageYears: age, qaStyleContractVersion: "board-matched-identity/v4" })).toContain(body);
    expect(painter(age)).toContain(body);
    expect(painter(age, ["ageAppropriate"])).toContain(body);
    expect(integrationDiagnosisPrompt({ ageYears: age, pose: hide.pose, support: "synthetic support", envelope: hide.mask, sourceKeys: [], feedback: null, history: [] })).toContain(body);
    // One age only: no other age's body contract travels with it.
    for (const other of CHILD_AGES.filter(a => a !== age)) expect(painter(age)).not.toContain(`BODY AGE CONTRACT: ${other} years.`);
  });

  it.each([3, 5, 8, 10])("the HIGH scene reviewer is told the stated age %i for its clear-category rule", age => {
    const png = Buffer.from("synthetic");
    const prompt = localPatchBoardJudgePrompt({ boardId: board.board, contentVersion: 12, assessmentMode: PLAYER_REVIEW_MODE, reviewScope: "ready-only/v1",
      hides: [{ hideId: hide.id, beforePng: png, afterPng: png, closeupPng: png, afterEvidencePng: png, expectation: { ageYears: age } }] });
    expect(prompt).toContain(`Parent-stated age: ${age}.`);
    expect(prompt).toContain("Fail only a CLEAR category error");
  });

  it("has no search level among its inputs: no stage names Explorers or Detectives", () => {
    for (const age of [5, 8]) {
      for (const text of [painter(age), characterPrompt({ styled: true, ageYears: age, qaStyleContractVersion: "board-matched-identity/v4" })]) {
        expect(text).not.toMatch(/\b(explorers?|detectives?|search level)\b|מגלים|בלשים/i);
      }
    }
  });
});
