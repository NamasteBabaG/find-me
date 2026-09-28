import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { REFRESHED_COLLECTION_BOARDS, REFRESHED_WIZARD_CATALOG } from "../../../../content/adventures/wizard-refresh-release";
import { TWO_WORLD_RELEASE_CATALOG, TWO_WORLD_RELEASE_ROUTES } from "../../../../content/adventures/two-worlds-release";
import manifest from "../../../../content/adventures/wizard-refresh-art.json";
import { findScene } from "../../../../content/scenes";
import { sceneVersionForDraft } from "../../create-flow.service";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { selfRepairEnabled, needsSelfRepair } from "../../../domain/scene/local-patch-self-repair";
import { childBodyDirection } from "../../../domain/child-body";
import { localPatchPrompt, pinnedLocalPatchPromptVersion, LOCAL_PATCH_IDENTITY_LOCK_PROMPT_VERSION, LOCAL_PATCH_AGE_PROMPT_VERSION } from "../local-patch-prompt";
import { localPatchBoardJudgePrompt, localPatchQualityDisposition, localPatchHideEvidenceIds, localPatchBoardJudgeSettings } from "../local-patch-judge";
import { characterPrompt } from "../../../infra/generation/character-prompt";
import { buildBoardWizardIdentityStyle } from "../board-wizard-identity-style";
import { sha256Bytes } from "../fixed-sprite";
import { PASSING_ANSWER } from "./local-patch-fixtures";

describe("refreshed main creation pipeline", () => {
  it("selects the storefront's nine current masters and keeps paid v10 addressable", async () => {
    const version = sceneVersionForDraft("local-patch-world-v1");
    expect(version).toBe(11);
    expect(localPatchBoardsForVersion(version!).flatMap(b => b.hides)).toHaveLength(27);
    expect(localPatchBoardsForVersion(10).flatMap(b => b.hides)).toHaveLength(27);
    for (const board of REFRESHED_COLLECTION_BOARDS) {
      const route = TWO_WORLD_RELEASE_ROUTES.find(r => r.world === "journey" && r.route === board.board)!;
      const plan = TWO_WORLD_RELEASE_CATALOG.boards.find(b => b.boardSlug === route.slug)!;
      if (plan.status !== "ready") throw Error("Not ready");
      const scene = findScene(board.board, version)!;
      expect(scene.art.base).toBe(plan.art.base);
      expect(scene.art.sha256).toBe(plan.art.sha256);
      expect(manifest.find(m => m.path === board.art)?.sha256).toBe(plan.art.sha256);
      const bytes = await readFile(board.art);
      expect(sha256Bytes(bytes)).toBe(plan.art.sha256);
      expect(await sharp(bytes).metadata()).toMatchObject({ width: 3840, height: 2160 });
      expect(JSON.stringify(board)).not.toMatch(/\bBar\b|age[- ]five|five-year-old|preschool|curly hair|brown curls/i);
    }
    expect(findScene("amazon", 10)!.art.base).not.toBe(findScene("amazon", 11)!.art.base);
    expect(REFRESHED_WIZARD_CATALOG.boards.flatMap(b => b.status === "ready" ? b.discoveries : [])).toHaveLength(54);
  });
  it("takes identity style pixels from the same refreshed board hashes", async () => {
    const atlas = await buildBoardWizardIdentityStyle(undefined, "board-matched-identity/v3");
    expect(atlas.examples).toHaveLength(9);
    for (const example of atlas.examples) {
      expect(example.boardSha256).toBe(findScene(example.boardId, 11)!.art.sha256);
    }
    expect(atlas.atlasSha256).toBe(sha256Bytes(atlas.png));
  });
  it("carries age8 body anatomy separately from canonical face identity through generation and review", () => {
    const board = REFRESHED_COLLECTION_BOARDS[0]!, hide = board.hides[0]!;
    const prompt = localPatchPrompt({ ...board, pose: hide.pose, mask: hide.mask, placement: hide.placement, ageYears: 8,
      contentVersion: 11, paintRecipe: "identity-body-v2" });
    expect(prompt).toContain(childBodyDirection(8));
    expect(prompt).toContain("NOT a height cap");
    expect(prompt).toContain("Never average or morph");
    const ageRepair = localPatchPrompt({ ...board, pose: hide.pose, mask: hide.mask, placement: hide.placement, ageYears: 8,
      contentVersion: 11, paintRecipe: "identity-body-v2", repairChecks: ["ageAppropriate"] });
    expect(ageRepair).toContain(childBodyDirection(8));
    expect(ageRepair).not.toContain("A preschool child needs");
    expect(prompt).not.toContain("at most 370");
    const sheet = characterPrompt({ styled: true, ageYears: 8, qaStyleContractVersion: "board-matched-identity/v3" });
    expect(sheet).toContain(childBodyDirection(8));
    expect(childBodyDirection(5)).not.toBe(childBodyDirection(8));
    const review = localPatchBoardJudgePrompt({ boardId: board.board, contentVersion: 11,
      hides: board.hides.map(h => ({ hideId: h.id, beforePng: Buffer.from("synthetic"), afterPng: Buffer.from("synthetic"), expectation: { ageYears: 8 }, evidenceIds: localPatchHideEvidenceIds(h.id) })) });
    expect(review).toContain(childBodyDirection(8));
    expect(review).toContain("A five-year-old body for a stated eight-year-old fails");
    expect(localPatchBoardJudgeSettings(11).model).toBe("gpt-5.6-sol");
    expect(pinnedLocalPatchPromptVersion(null, LOCAL_PATCH_AGE_PROMPT_VERSION, 11)).toBe(LOCAL_PATCH_IDENTITY_LOCK_PROMPT_VERSION);
  });
  it("routes two failures to automatic diagnosis and cannot publish missing likeness, age or broken anatomy", () => {
    expect(selfRepairEnabled(11)).toBe(true);
    expect(needsSelfRepair({ status: "FAILED", attempts: 2 })).toBe(true);
    const good = { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass", ageAppropriate: "pass" };
    expect(localPatchQualityDisposition(good as never, 11).state).toBe("acceptable");
    for (const key of ["faceLikeness", "ageAppropriate", "scaleRight", "childComplete", "pictureWhole"]) {
      expect(localPatchQualityDisposition({ ...good, [key]: "fail", faults: [{ check: key, where: "Located synthetic defect" }] } as never, 11).state).toBe("retry");
    }
  });
});
