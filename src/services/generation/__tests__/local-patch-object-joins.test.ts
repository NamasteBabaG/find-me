import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { prepareBoundaryComparisons, prepareJoinDetails, JOIN_DETAIL_HALF, JOIN_DETAIL_MARGIN } from "../local-patch-integration-evidence";
import { localPatchBoardEvidenceIds, localPatchBoardJudgeImageLabels, localPatchBoardJudgeImages, localPatchBoardJudgePrompt, type LocalPatchBoardJudgeRequest } from "../local-patch-judge";
import { boundaryReviewInstructions, leanBoundaryReviewInstructions, objectJoinInstructions, PLAYER_REVIEW_MODE, LEGACY_PLAYER_REVIEW_MODE } from "../local-patch-player-review";
import { dualQualityQuestion, dualQualityRequest, QUALITY_ANSWER_SHORT_WHEN_PASSING } from "../local-patch-dual-review";
import { DUAL_VISUAL_REVIEW_V2, DUAL_VISUAL_REVIEW_V3, DUAL_VISUAL_REVIEW_VERSION, QUALITY_QUESTION_OBJECT_JOINS, QUALITY_QUESTION_OBJECT_JOINS_LEAN,
  qualityQuestionFor } from "../visual-review-release";

const GRAY = { r: 120, g: 120, b: 120 }, RED = [255, 0, 0], TICK = [224, 0, 0];
const flat = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: GRAY } }).png().toBuffer();
/** The AFTER context: gray, with a red bar crossing the bottom join at x 300 (y 300-460). */
const withBar = async (base: Buffer) => sharp(base).composite([{ input: await sharp({ create: { width: 1, height: 160, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer(), left: 300, top: 300 }]).png().toBuffer();
const at = async (png: Buffer, x: number, y: number) => { const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true }); const p = (y * info.width + x) * 3; return [data[p], data[p + 1], data[p + 2]]; };

describe("magnified object joins (dual release v3)", () => {
  const returned = { left: 200, top: 100, width: 250, height: 300 };
  it("cuts each band from the registered window, marks the join outside the pixels, and magnifies without smoothing", async () => {
    const before = await flat(600, 500), after = await withBar(before);
    const details = await prepareJoinDetails(before, after, returned);
    expect(details.map(d => d.edge)).toEqual(["left", "top", "right", "bottom"]);
    const bottom = details[3]!, m = JOIN_DETAIL_MARGIN;
    expect(bottom.band).toEqual({ left: 160, top: 400 - JOIN_DETAIL_HALF, width: 330, height: 2 * JOIN_DETAIL_HALF });
    expect([bottom.scale, bottom.joinOffset]).toEqual([3, 120]);
    expect(await sharp(bottom.png).metadata()).toMatchObject({ width: 330 * 3 + 2 * m, height: 2 * 240 + 16 });
    // The bar is in AFTER (lower band) and not in BEFORE (upper band), at its magnified column.
    const x = m + (300 - 160) * 3 + 1;
    expect(await at(bottom.png, x, 256 + 10)).toEqual(RED);
    expect(await at(bottom.png, x, 256 + 230)).toEqual(RED);
    expect(await at(bottom.png, x, 10)).toEqual([GRAY.r, GRAY.g, GRAY.b]);
    // Ticks in the margins at the join row of both bands; the margin is otherwise white.
    for (const y of [120, 256 + 120]) { expect(await at(bottom.png, 8, y)).toEqual(TICK); expect(await at(bottom.png, m + 990 + 6, y)).toEqual(TICK); }
    expect(await at(bottom.png, 8, 60)).toEqual([255, 255, 255]);
    const left = details[0]!;
    expect(left.band).toEqual({ left: 160, top: 60, width: 80, height: 380 });
    expect([left.scale, left.joinOffset]).toEqual([3, 120]);
    expect(await sharp(left.png).metadata()).toMatchObject({ width: 2 * 240 + 16, height: 380 * 3 + 2 * m });
    expect(await at(left.png, 120, 8)).toEqual(TICK); expect(await at(left.png, 256 + 120, 380 * 3 + m + 6)).toEqual(TICK);
  });

  it("clips at the context edge and refuses unregistered or outside windows", async () => {
    const before = await flat(300, 300), after = await flat(300, 300);
    const edge = await prepareJoinDetails(before, after, { left: 0, top: 0, width: 100, height: 100 });
    expect(edge[0]!).toMatchObject({ band: { left: 0, top: 0, width: JOIN_DETAIL_HALF, height: 140 }, joinOffset: 0 });
    await expect(prepareJoinDetails(before, await flat(301, 300), returned)).rejects.toThrow("registered context");
    await expect(prepareJoinDetails(before, after, { left: 250, top: 0, width: 100, height: 100 })).rejects.toThrow("valid return window");
  });
});

async function playerRequest(): Promise<LocalPatchBoardJudgeRequest> {
  const before = await flat(600, 500), after = await withBar(before), closeup = await flat(250, 300);
  const afterEvidence = await sharp({ create: { width: 600 + 24 + 250, height: 500, channels: 3, background: "white" } })
    .composite([{ input: after, left: 0, top: 0 }, { input: closeup, left: 624, top: 0 }]).png().toBuffer();
  return { boardId: "newyork", contentVersion: 12, assessmentMode: PLAYER_REVIEW_MODE, reviewScope: "ready-only/v1",
    boardPng: await flat(300, 200), identityPng: await flat(64, 64),
    hides: [{ hideId: "newyork-v12-1", beforePng: before, afterPng: after, closeupPng: closeup, afterEvidencePng: afterEvidence,
      boundaryComparisons: await prepareBoundaryComparisons(before, after, returned), returnedWindow: returned, expectation: { ageYears: 10, support: "standing on the sidewalk" } }] };
}
const returned = { left: 200, top: 100, width: 250, height: 300 };

describe("the object-joins question", () => {
  it("is asked only under release v3; v1 and v2 keep the prepared question object", async () => {
    const request = await playerRequest();
    expect(qualityQuestionFor(DUAL_VISUAL_REVIEW_VERSION)).toBeUndefined();
    expect(qualityQuestionFor(DUAL_VISUAL_REVIEW_V2)).toBeUndefined();
    expect(qualityQuestionFor(DUAL_VISUAL_REVIEW_V3)).toBe(QUALITY_QUESTION_OBJECT_JOINS);
    expect(await dualQualityRequest(DUAL_VISUAL_REVIEW_VERSION, request)).toBe(request);
    expect(await dualQualityRequest(DUAL_VISUAL_REVIEW_V2, request)).toBe(request);
  });

  it("adds four join images after the historical twelve, with their own ids, labels and paragraph", async () => {
    const request = await playerRequest(), asked = await dualQualityRequest(DUAL_VISUAL_REVIEW_V3, request);
    const historical = { images: localPatchBoardJudgeImages(request), ids: localPatchBoardEvidenceIds(request),
      labels: localPatchBoardJudgeImageLabels(request)!, prompt: localPatchBoardJudgePrompt(request) };
    const images = localPatchBoardJudgeImages(asked), ids = localPatchBoardEvidenceIds(asked), labels = localPatchBoardJudgeImageLabels(asked)!;
    expect(historical.images).toHaveLength(8); expect(images).toHaveLength(12);
    expect(images.slice(0, 8)).toEqual(historical.images);
    expect(images.slice(8)).toEqual(asked.hides[0]!.joinDetails!.map(d => d.png));
    expect(ids).toEqual([...historical.ids, ...["left", "top", "right", "bottom"].map(e => `newyork-v12-1:join:${e}`)]);
    expect(labels.slice(0, 8)).toEqual(historical.labels);
    expect(labels.slice(8).every(l => l.includes("ROLE=JOIN_DETAIL") && l.includes("red ticks"))).toBe(true);
    expect(labels[11]).toContain("TOP=BEFORE, BOTTOM=AFTER"); expect(labels[8]).toContain("LEFT=BEFORE, RIGHT=AFTER");
    const prompt = localPatchBoardJudgePrompt(asked), lines = prompt.split("\n");
    expect(lines[lines.findIndex(l => l.startsWith("Return JSON only:")) - 1]).toBe(objectJoinInstructions);
    expect(prompt.replace(`${objectJoinInstructions}\n`, "").replaceAll("specific crossing people and objects", "specific crossing anatomy")).toBe(historical.prompt);
    expect(prompt).not.toContain("specific crossing anatomy");
    // The same pixels always give the same question.
    expect(localPatchBoardJudgeImages(await dualQualityRequest(DUAL_VISUAL_REVIEW_V3, request))).toEqual(images);
  });

  it("names a break as a break, and keeps coherent change and natural occlusion legal", () => {
    expect(objectJoinInstructions).toMatch(/word or sign cut along the line, a doubled or ghost edge, a stepped contour, half of an old object beside a new one/);
    expect(objectJoinInstructions).toMatch(/never as softening or blur/);
    expect(objectJoinInstructions).toMatch(/fail pictureWhole and severeSeam with a located fault and fail that edge's boundaryIntegrity/);
    expect(objectJoinInstructions).toMatch(/repainted, moved, resized or removed wholly on one side of the line passes/);
    expect(objectJoinInstructions).toMatch(/natural occlusion by a coherent foreground object passes/);
    expect(objectJoinInstructions).toMatch(/registration difference .* is not a break/);
  });

  it("refuses join evidence outside its question, and the question without its evidence", async () => {
    const request = await playerRequest(), asked = await dualQualityRequest(DUAL_VISUAL_REVIEW_V3, request);
    expect(() => localPatchBoardJudgeImages({ ...asked, qualityQuestion: undefined })).toThrow("only to the object-joins question");
    expect(() => localPatchBoardJudgeImages({ ...request, qualityQuestion: QUALITY_QUESTION_OBJECT_JOINS })).toThrow("four magnified joins");
    expect(() => localPatchBoardJudgeImages({ ...asked, assessmentMode: LEGACY_PLAYER_REVIEW_MODE })).toThrow("four magnified joins");
    const { returnedWindow: _w, ...unregistered } = request.hides[0]!;
    await expect(dualQualityRequest(DUAL_VISUAL_REVIEW_V3, { ...request, hides: [unregistered] })).rejects.toThrow("registered return window");
  });
});

describe("the lean object-joins question (cost experiment E1)", () => {
  it("is v3's question without the four return comparisons: eight images, their ids and labels, and three exact rewrites", async () => {
    const v3 = await dualQualityRequest(DUAL_VISUAL_REVIEW_V3, await playerRequest()), lean = { ...v3, qualityQuestion: QUALITY_QUESTION_OBJECT_JOINS_LEAN };
    const full = { images: localPatchBoardJudgeImages(v3), ids: localPatchBoardEvidenceIds(v3), labels: localPatchBoardJudgeImageLabels(v3)!, prompt: localPatchBoardJudgePrompt(v3) };
    const images = localPatchBoardJudgeImages(lean), ids = localPatchBoardEvidenceIds(lean), labels = localPatchBoardJudgeImageLabels(lean)!;
    // Board, portrait, BEFORE, AFTER and the four joins, in v3's order: only the return comparisons (images 5-8) are gone.
    expect(images).toHaveLength(8);
    expect(images).toEqual([...full.images.slice(0, 4), ...full.images.slice(8)]);
    expect(ids).toEqual([...full.ids.slice(0, 4), ...full.ids.slice(8)]);
    expect(labels).toEqual([...full.labels.slice(0, 4), ...full.labels.slice(8)]);
    expect(ids.some(id => id.includes(":return:"))).toBe(false);
    const prompt = localPatchBoardJudgePrompt(lean);
    expect(prompt).not.toMatch(/RETURN_BOUNDARY|return comparisons|return boundaries/);
    expect(prompt).toContain(objectJoinInstructions); expect(prompt).toContain(leanBoundaryReviewInstructions);
    // Undo the three rewrites and the lean question is v3's, byte for byte.
    expect(prompt.replace(leanBoundaryReviewInstructions, () => boundaryReviewInstructions)
      .replace(" The FOUR JOIN_DETAIL images magnify the four returned edges.", " The FOUR continuous return comparisons use LEFT=BEFORE and RIGHT=AFTER.")
      .replace("Review all four magnified joins, including below the target,", "Review all four continuous return boundaries, including below the target,")).toBe(full.prompt);
    // The boundary rules after the first line are v3's own.
    expect(leanBoundaryReviewInstructions.split("\n").slice(1)).toEqual(boundaryReviewInstructions.split("\n").slice(1));
    // Without its joins the lean question is refused like v3's.
    const bare = await playerRequest();
    expect(() => localPatchBoardJudgeImages({ ...bare, qualityQuestion: QUALITY_QUESTION_OBJECT_JOINS_LEAN })).toThrow("four magnified joins");
  });

  it("asks today's quality question unless a variant is named, and each named variant is its own purchase", async () => {
    const v3 = await dualQualityRequest(DUAL_VISUAL_REVIEW_V3, await playerRequest()), binding = { version: DUAL_VISUAL_REVIEW_V3, hideId: "newyork-v12-1" };
    const today = dualQualityQuestion(v3, binding, 1);
    expect(today).toMatchObject({ role: "scene-quality", effort: "high", policy: { model: "claude-opus-5-5", effort: "high" } });
    expect(today.prompt).toBe(`${localPatchBoardJudgePrompt(v3)}\nImmutable candidate binding: ${JSON.stringify(binding)}. Evidence attempt: 1.`);
    expect(dualQualityQuestion(v3, binding, 1, "standard/v1", {}).fingerprint).toBe(today.fingerprint);
    const sol = dualQualityQuestion(v3, binding, 1, "standard/v1", { judge: "gpt-6.1-sol", effort: "medium" });
    expect(sol.policy).toMatchObject({ provider: "openai", model: "gpt-6.1-sol", effort: "medium", maxOutputTokens: 6500 });
    expect(sol.prompt).toBe(today.prompt);
    const short = dualQualityQuestion(v3, binding, 1, "standard/v1", { judge: "gpt-6.1-sol", effort: "medium", answer: QUALITY_ANSWER_SHORT_WHEN_PASSING });
    expect(short.prompt.startsWith(localPatchBoardJudgePrompt(v3) + "\nANSWER LENGTH: for every check that passes")).toBe(true);
    expect(short.prompt).toMatch(/never omit, merge or soften a failure, a required field or an evidence ID to save space\.\nImmutable candidate binding: /);
    expect(new Set([today, sol, short].map(q => q.fingerprint)).size).toBe(3);
  });
});
