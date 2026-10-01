import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareBoundaryComparisons, prepareNeighborComparisons, RETURN_EDGES } from "../local-patch-integration-evidence";
import { localPatchBoardEvidenceIds, localPatchBoardJudgeImages, localPatchBoardJudgeImageLabels, localPatchBoardJudgePrompt,
  parseLocalPatchBoardVerdicts, localPatchQualityDisposition } from "../local-patch-judge";
import { PLAYER_REVIEW_MODE, LEGACY_PLAYER_REVIEW_MODE } from "../local-patch-player-review";
import { PASSING_ANSWER } from "./local-patch-fixtures";
import { integrationDiagnosisPrompt } from "../local-patch-integration-diagnosis";

const hideId = "greatwall-v12-2";
const integrity = () => Object.fromEntries(RETURN_EDGES.map(edge => [edge, { status: "pass", observation: "Connected people and supports; complete removal leaves no fragments" }]));
const good = { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass", ageAppropriate: "pass",
  lightingMatch: "pass", neighborsIntact: "pass", integrationEvidence: { style: "Same painted scene finish", lighting: "Coherent local illumination", neighbors: "Whole people with connected heads and bodies" } };
const raw = (verdict: unknown) => JSON.stringify({ hides: [{ hideId, evidenceIds: [`${hideId}:before`, `${hideId}:after`], verdict }] });
const parse = (verdict: unknown) => parseLocalPatchBoardVerdicts(raw(verdict), [hideId], 12, "ready-only/v1", PLAYER_REVIEW_MODE)[hideId];

describe("continuous return anatomy gate", () => {
  it("gives new recovery cycles continuous context without changing a historical diagnostic question", () => {
    const input = { ageYears: 8, pose: "peeking", support: "dumpling table", envelope: {}, sourceKeys: ["paid-raw"], feedback: {}, history: [] };
    expect(integrationDiagnosisPrompt(input)).not.toContain("last TWO images");
    const prompt = integrationDiagnosisPrompt({ ...input, boundaryContext: true });
    expect(prompt).toContain("last TWO images"); expect(prompt).toContain("Clean COMPLETE removal");
    expect(prompt).toContain("Do not buy the same failed geometry again");
  });
  it("refuses an overall clean verdict when any join reports half-erased anatomy, and remains stable on reparse", () => {
    const boundaryIntegrity = { ...integrity(), left: { status: "fail", observation: "Half of an elderly woman's face repeats beside another head at the left join" } };
    const answer = parse({ ...good, boundaryIntegrity })!;
    expect(answer).not.toBeNull(); expect(answer.verdict).toBe("fail"); expect(answer.pictureWhole).toBe("fail");
    expect(answer.faults).toContainEqual({ check: "pictureWhole", where: `Return boundary left: ${boundaryIntegrity.left.observation}` });
    expect(localPatchQualityDisposition(answer, 12, { hideId })).toEqual({ state: "retry", faults: ["pictureWhole"] });
  });
  it("requires four actual edge observations; a historical pass cannot approve the new question", () => {
    expect(parse(good)).toBeNull(); expect(parse({ ...good, boundaryIntegrity: { left: integrity().left } })).toBeNull();
    expect(parseLocalPatchBoardVerdicts(raw(good), [hideId], 12, "ready-only/v1", LEGACY_PLAYER_REVIEW_MODE)[hideId]?.verdict).toBe("pass");
    expect(localPatchQualityDisposition(parse({ ...good, boundaryIntegrity: integrity() }) ?? null, 12, { hideId }).state).toBe("acceptable");
  });
  it("keeps each join and crossing anatomy in one registered native pair without quadrant splits", async () => {
    const before = await sharp({ create: { width: 896, height: 1152, channels: 3, background: "#112233" } }).png().toBuffer();
    const after = await sharp({ create: { width: 896, height: 1152, channels: 3, background: "#334455" } }).png().toBuffer();
    const boundaries = await prepareBoundaryComparisons(before, after, { left: 192, top: 280, width: 512, height: 590 });
    expect(boundaries.map(p => p.edge)).toEqual(RETURN_EDGES);
    for (const pair of boundaries) {
      const meta = await sharp(pair.png).metadata();
      expect(meta).toMatchObject(pair.axis === "x" ? { width: 784, height: 1152 } : { width: 1808, height: 384 });
      expect(pair.joinOffset).toBe(192);
      const pixels = await sharp(pair.png).removeAlpha().raw().toBuffer();
      expect([...pixels.subarray(0, 3)]).toEqual([17, 34, 51]);
      const offset = ((meta.width! - 16) / 2 + 16) * 3;
      expect([...pixels.subarray(offset, offset + 3)]).toEqual([51, 68, 85]);
    }
    await expect(prepareBoundaryComparisons(before, after, { left: 800, top: 0, width: 200, height: 10 })).rejects.toThrow("valid return window");
    const hide = { hideId, beforePng: before, afterPng: after, closeupPng: after, afterEvidencePng: after,
      boundaryComparisons: boundaries, expectation: { ageYears: 8 } };
    const request = { boardId: "greatwall", contentVersion: 12, assessmentMode: PLAYER_REVIEW_MODE, reviewScope: "ready-only/v1" as const,
      boardPng: before, identityPng: before, hides: [hide] };
    expect(localPatchBoardJudgeImages(request)).toHaveLength(8); expect(localPatchBoardJudgeImageLabels(request)).toHaveLength(8);
    expect(localPatchBoardEvidenceIds(request).slice(4)).toEqual(RETURN_EDGES.map(edge => `${hideId}:return:${edge}`));
    expect(localPatchBoardJudgeImageLabels(request)![4]).toContain("x=192");
    expect(() => localPatchBoardJudgeImages({ ...request, hides: [{ ...hide, boundaryComparisons: undefined }] })).toThrow("four continuous");
    expect(localPatchBoardJudgePrompt(request)).toContain("boundaryIntegrity");
    const legacy = { ...request, assessmentMode: LEGACY_PLAYER_REVIEW_MODE, hides: [{ ...hide, neighborComparisons: await prepareNeighborComparisons(before, after) }] };
    expect(localPatchBoardJudgePrompt(legacy)).not.toContain("boundaryIntegrity");
    expect(localPatchBoardEvidenceIds(legacy)[4]).toBe(`${hideId}:neighbors:upper-left`);
  });
});
