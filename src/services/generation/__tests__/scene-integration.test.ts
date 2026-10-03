import { describe, expect, it } from "vitest";
import { INTEGRATED_COLLECTION_BOARDS, INTEGRATED_WIZARD_CATALOG } from "../../../../content/adventures/wizard-integrated-release";
import { findScene } from "../../../../content/scenes";
import { sceneVersionForDraft } from "../../create-flow.service";
import { needsSelfRepair, selfRepairEnabled } from "../../../domain/scene/local-patch-self-repair";
import { INTEGRATED_REQUIRED_CHECKS, localPatchBoardJudgePrompt, localPatchBoardJudgeSettings, localPatchExplicitUncertaintyChecks, localPatchQualityDisposition, parseLocalPatchVerdict } from "../local-patch-judge";
import { localPatchPrompt, localPatchRepairChecks, pinnedLocalPatchPromptVersion, LOCAL_PATCH_AGE_PROMPT_VERSION, LOCAL_PATCH_INTEGRATED_PROMPT_VERSION } from "../local-patch-prompt";
import { PASSING_ANSWER } from "./local-patch-fixtures";
import sharp from "sharp";
import { prepareNeighborComparisons } from "../local-patch-integration-evidence";
import { localPatchBoardJudgeImages, localPatchBoardJudgeImageLabels, parseLocalPatchBoardVerdicts } from "../local-patch-judge";
import { integrationDiagnosisPrompt } from "../local-patch-integration-diagnosis";
import { prepareLocalPatchIdentityReferences } from "../local-patch-identity-reference";
import { localPatchImagePolicyForVersion } from "../../../infra/generation/openai-local-patch";

const good = { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass", ageAppropriate: "pass", lightingMatch: "pass", neighborsIntact: "pass",
  integrationEvidence: { style: "Same broad painted face planes as the child at the table.", lighting: "Shared dim stall lighting without a bright face or rim.", neighbors: "Foreground woman's single head joins her unchanged neck and shoulders." } };
describe("mandatory scene integration", () => {
  it("requires explicit scoped authority and exact per-hide evidence for a subset review", () => {
    const hideId = "tokyo-v12-2", hide = { hideId, beforePng: Buffer.from("before"), afterPng: Buffer.from("after"), expectation: { ageYears: 8 } };
    const request = { boardId: "tokyo", contentVersion: 12, hides: [hide] };
    expect(() => localPatchBoardJudgePrompt(request)).toThrow("three distinct");
    const prompt = localPatchBoardJudgePrompt({ ...request, reviewScope: "unapproved-only/v1" });
    expect(prompt).toContain("Exactly 1 entries"); expect(prompt).toContain("FOUR overlapping native");
    expect(prompt).toContain("ALL required checks");
    const row = { hideId, evidenceIds: [`${hideId}:before`, `${hideId}:after`], verdict: good }, raw = JSON.stringify({ hides: [row] });
    expect(parseLocalPatchBoardVerdicts(raw, [hideId], 12)[hideId]).toBeNull();
    expect(parseLocalPatchBoardVerdicts(raw, [hideId], 11, "unapproved-only/v1")[hideId]).toBeNull();
    expect(parseLocalPatchBoardVerdicts(raw, [hideId], 12, "unapproved-only/v1")[hideId]).not.toBeNull();
    for (const bad of [{ hides: [row, row] }, { hides: [{ ...row, evidenceIds: ["other:before", "other:after"] }] }, { hides: [] }])
      expect(parseLocalPatchBoardVerdicts(JSON.stringify(bad), [hideId], 12, "unapproved-only/v1")[hideId]).toBeNull();
  });
  it("explains sibling exclusion geometry only on new pinned diagnostic questions", () => {
    const input = { ageYears: 8, pose: "standing", support: "ground", envelope: {}, sourceKeys: ["paid-raw"], feedback: {}, history: [] };
    expect(integrationDiagnosisPrompt(input)).not.toContain("Forbidden sibling");
    const rectangles = [{ left: 490, top: 0, width: 22, height: 748 }];
    const prompt = integrationDiagnosisPrompt({ ...input, excludedRegions: rectangles });
    expect(prompt).toContain(JSON.stringify(rectangles)); expect(prompt).toContain("ZERO area of overlap");
    expect(prompt).toContain("18px guard");
  });
  it("binds every native neighbour pair to the review and retains full identity detail for its judge", async () => {
    const before = await sharp({ create: { width: 512, height: 768, channels: 3, background: "#112233" } }).png().toBuffer();
    const after = await sharp({ create: { width: 512, height: 768, channels: 3, background: "#334455" } }).png().toBuffer();
    const pairs = await prepareNeighborComparisons(before, after);
    expect(pairs.map(p => p.quadrant)).toEqual(["upper-left", "upper-right", "lower-left", "lower-right"]);
    for (const pair of pairs) {
      expect(await sharp(pair.png).metadata()).toMatchObject({ width: 624, height: 432 });
      const pixels = await sharp(pair.png).removeAlpha().raw().toBuffer();
      expect([...pixels.subarray(0, 3)]).toEqual([17, 34, 51]);
      expect([...pixels.subarray(320 * 3, 320 * 3 + 3)]).toEqual([51, 68, 85]);
    }
    const hides = [1, 2, 3].map(n => ({ hideId: `test-${n}`, beforePng: before, afterPng: after, closeupPng: after, afterEvidencePng: after, neighborComparisons: pairs }));
    const request = { boardId: "test", contentVersion: 12, boardPng: before, identityPng: after, hides };
    expect(localPatchBoardJudgeImages(request)).toHaveLength(20);
    expect(localPatchBoardJudgeImageLabels(request)).toHaveLength(20);
    expect(() => localPatchBoardJudgeImages({ ...request, hides: hides.map(h => ({ ...h, neighborComparisons: pairs.slice(1) })) })).toThrow("four registered");
    const sheet = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#112233" } }).png().toBuffer();
    const references = await prepareLocalPatchIdentityReferences(sheet, 12);
    expect(await sharp(references.identityPng).metadata()).toMatchObject({ width: 192, height: 192 });
    expect(await sharp(references.judgeIdentityPng).metadata()).toMatchObject({ width: 512, height: 512 });
    expect(localPatchImagePolicyForVersion(12).quality).toBe("medium");
    expect(localPatchImagePolicyForVersion(11).quality).toBe("low");
  });
  it("pins new purchases to v12 while preserving v11 receipts and the same 27 locations", () => {
    expect(sceneVersionForDraft("local-patch-world-v1")).toBe(12);
    expect(INTEGRATED_COLLECTION_BOARDS.flatMap(b => b.hides)).toHaveLength(54);
    expect(INTEGRATED_WIZARD_CATALOG.boards.flatMap(b => b.status === "ready" ? b.discoveries : [])).toHaveLength(108);
    for (const board of INTEGRATED_COLLECTION_BOARDS) {
      const historic = findScene(board.board, 11);
      if (historic) expect(findScene(board.board, 12)!.art).toEqual(historic.art);
      else expect(findScene(board.board, 12)!.targets).toHaveLength(3);
    }
    expect(pinnedLocalPatchPromptVersion(null, LOCAL_PATCH_AGE_PROMPT_VERSION, 12)).toBe(LOCAL_PATCH_INTEGRATED_PROMPT_VERSION);
    expect(pinnedLocalPatchPromptVersion({ attempts: 2, promptVersion: "local-patch-prompt/v13-identity-body-lock" }, LOCAL_PATCH_AGE_PROMPT_VERSION, 11)).toBe("local-patch-prompt/v13-identity-body-lock");
    expect(localPatchBoardJudgeSettings(11).policyVersion).toBe("local-patch-sol-low-identity-body/v4");
    expect(localPatchBoardJudgeSettings(12)).toMatchObject({ effort: "medium", policyVersion: "local-patch-sol-medium-scene-integration/v5" });
  });
  it("rejects a historical verdict without new evidence, even if every old check passed", () => {
    const { lightingMatch: _light, neighborsIntact: _neighbors, integrationEvidence: _evidence, ...old } = good;
    expect(parseLocalPatchVerdict(old, 11)).not.toBeNull();
    expect(parseLocalPatchVerdict(old, 12)).toBeNull();
    expect(localPatchQualityDisposition(parseLocalPatchVerdict(old, 11), 12).state).toBe("unresolved");
    expect(localPatchQualityDisposition(parseLocalPatchVerdict(good, 12), 12).state).toBe("acceptable");
  });
  it.each(INTEGRATED_REQUIRED_CHECKS)("routes a located %s defect and explicit uncertainty to automatic repair", key => {
    const failed=parseLocalPatchVerdict({ ...good, [key]: "fail", faults: [{ check: key, where: "Lower-left foreground woman has two stacked faces" }] }, 12);
    expect(localPatchQualityDisposition(failed, 12)).toMatchObject({ state: "retry", faults: [key] });
    expect(localPatchRepairChecks(JSON.stringify({ verdict: failed }), 12)).toContain(key);
    const uncertain=parseLocalPatchVerdict({ ...good, [key]: "unsure" }, 12);
    expect(localPatchExplicitUncertaintyChecks(uncertain, 12)).toContain(key);
    expect(localPatchQualityDisposition(uncertain, 12).state).toBe("retry");
    expect(selfRepairEnabled(12)).toBe(true);
    expect(needsSelfRepair({ status: "FAILED", attempts: 2 })).toBe(true);
  });
  it("does not convert contradictory or missing evidence into a pass", () => {
    const contradiction=parseLocalPatchVerdict({ ...good, faults: [{ check: "neighborsIntact", where: "A second face overlaps the original face below the child" }] }, 12);
    expect(localPatchQualityDisposition(contradiction, 12).state).not.toBe("acceptable");
    expect(parseLocalPatchVerdict({ ...good, integrationEvidence: { ...good.integrationEvidence, neighbors: "okay" } }, 12)).toBeNull();
  });
  it("retains a located fault for every failed check rather than losing a long review", () => {
    const allFailed = { ...good, ...Object.fromEntries(INTEGRATED_REQUIRED_CHECKS.map(key => [key, "fail"])),
      faults: INTEGRATED_REQUIRED_CHECKS.map(check => ({ check, where: "Target and foreground neighbour overlap at the counter" })) };
    expect(localPatchQualityDisposition(parseLocalPatchVerdict(allFailed, 12), 12)).toEqual({ state: "retry", faults: [...INTEGRATED_REQUIRED_CHECKS] });
  });
  it("compares rendering, relative light and neighbouring anatomy independently of likeness", () => {
    const board=INTEGRATED_COLLECTION_BOARDS.find(b=>b.board==="tokyo")!, hide=board.hides[2]!;
    const prompt=localPatchPrompt({ ...board, contentVersion: 12, paintRecipe: "scene-integration-v3", ageYears: 8, pose: hide.pose, mask: hide.mask, placement: hide.placement, repairChecks: ["styleMatch", "lightingMatch", "neighborsIntact", "ageAppropriate"] });
    expect(prompt).toContain("8"); expect(prompt).toContain("stacked faces"); expect(prompt).toContain("Remove portrait fill light");
    expect(prompt).not.toContain("A preschool child needs");
    const review=localPatchBoardJudgePrompt({ boardId: board.board, contentVersion: 12, hides: board.hides.map(h=>({ hideId: h.id, beforePng: Buffer.from("test"), afterPng: Buffer.from("test"), expectation: { ageYears: 8 } })) });
    expect(review).toContain("BELOW the child"); expect(review).toContain("two original neighbouring faces");
    expect(review).not.toContain("remaining checks are advisory");
  });
});
