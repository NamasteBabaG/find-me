import { describe, expect, it, vi } from "vitest";
import { judgeLocalPatchBoard, localPatchBoardJudgeImages, localPatchBoardJudgeImageLabels,
  localPatchBoardEvidenceIds, localPatchBoardJudgePrompt, localPatchBoardJudgeSettings,
  localPatchHideEvidenceIds, localPatchQualityDisposition, parseLocalPatchBoardVerdicts,
  requestJudgeWire, type LocalPatchBoardJudgeRequest } from "../local-patch-judge";
import { LOCAL_PATCH_AGE_BOARD_REVIEW_VERSION, localPatchBoardReviewKey, localPatchBoardReviewKeys } from "../local-patch-board-review";
import { LOCAL_PATCH_COMPOSITION_VERSION } from "../local-patch-seam";

const ids = Array.from({ length: 5 }, (_, i) => `sydney-v7-${i + 1}`);
const good = { childPresent: "pass", childOnlyOnce: "pass", childComplete: "pass", pictureWhole: "pass",
  scaleRight: "pass", groundContact: "pass", styleMatch: "pass", faceLikeness: "pass", faceReadable: "pass",
  severeSeam: "pass", ageAppropriate: "pass", verdict: "pass", reason: "The labeled appearance is coherent.", faults: [] };
const request: LocalPatchBoardJudgeRequest = { contentVersion: 9, boardId: "sydney",
  boardPng: Buffer.from("ORIGINAL BOARD"), identityPng: Buffer.from("CANONICAL PORTRAIT"),
  hides: ids.map((hideId, index) => ({ hideId, beforePng: Buffer.from(`before ${index}`), afterPng: Buffer.from(`context ${index}`),
    closeupPng: Buffer.from(`native ${index}`), afterEvidencePng: Buffer.from(`context + native ${index}`), expectation: { ageYears: 5 } })) };
const rows = () => ids.map(hideId => ({ hideId, evidenceIds: localPatchHideEvidenceIds(hideId), verdict: good }));
const wire = (raw: unknown) => vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ model: "gpt-5.6-luna",
  usage: { prompt_tokens: 100, completion_tokens: 100 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify(raw) } }] }),
{ status: 200, headers: { "x-request-id": "synthetic-labeled-wire" } }));

describe("v9 grouped evidence is associated by adjacent labels, not image counting", () => {
  it("sends the exact twelve unique images with a matching label immediately before every image including hide five", async () => {
    const fetchOnce = wire({ hides: rows() });
    const result = await judgeLocalPatchBoard("synthetic-key", request, fetchOnce);
    const body = JSON.parse(String(fetchOnce.mock.calls[0]![1]!.body));
    const content = body.messages[0].content;
    const evidenceIds = localPatchBoardEvidenceIds(request), labels = localPatchBoardJudgeImageLabels(request)!;
    const images = localPatchBoardJudgeImages(request);
    expect(fetchOnce).toHaveBeenCalledOnce();
    expect(body).toMatchObject({ model: "gpt-5.6-luna", reasoning_effort: "low", max_completion_tokens: 3000 });
    expect(content).toHaveLength(25); expect(images).toHaveLength(12);
    expect(new Set(evidenceIds).size).toBe(12);
    for (let i = 0; i < 12; i++) {
      expect(content[1 + i * 2]).toEqual({ type: "text", text: labels[i] });
      expect(labels[i]).toContain(`EVIDENCE_ID=${evidenceIds[i]} |`);
      expect(content[2 + i * 2]).toEqual({ type: "image_url", image_url: { detail: "high",
        url: `data:image/png;base64,${images[i]!.toString("base64")}` } });
    }
    expect(labels[0]).toContain("not a BEFORE/AFTER pair");
    expect(labels[1]).toContain("not a hide");
    expect(labels[11]).toContain("HIDE_ID=sydney-v7-5 | ROLE=AFTER");
    expect(labels[11]).toContain("not another hide or an extra evidence image");
    expect(content[0].text).toContain("NEVER by counting images, panels or people");
    expect(content[0].text).not.toContain("Image2");
    expect(Object.values(result.verdicts).every(v => localPatchQualityDisposition(v, 9).state === "acceptable")).toBe(true);
  });
  it("preserves the unlabelled v8 transport and response shape exactly", async () => {
    const { ageAppropriate: _age, ...legacyGood } = good;
    const fetchOnce = wire({ hides: ids.map(hideId => ({ hideId, verdict: legacyGood })) });
    const legacy = { ...request, contentVersion: 8 };
    const result = await judgeLocalPatchBoard("synthetic-key", legacy, fetchOnce);
    const content = JSON.parse(String(fetchOnce.mock.calls[0]![1]!.body)).messages[0].content;
    expect(localPatchBoardJudgeImageLabels(legacy)).toBeUndefined();
    expect(content).toEqual([{ type: "text", text: localPatchBoardJudgePrompt(legacy) }, ...localPatchBoardJudgeImages(legacy).map(png => ({
      type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}`, detail: "high" },
    }))]);
    expect(Object.values(result.verdicts).every(v => v?.verdict === "pass")).toBe(true);
  });
  it("refuses a shifted pair echo without attaching its verdict to the named hide", () => {
    const reply = rows();
    reply[0]!.evidenceIds = localPatchHideEvidenceIds(ids[1]!);
    const verdicts = parseLocalPatchBoardVerdicts(JSON.stringify({ hides: reply }), ids, 9);
    expect(verdicts[ids[0]!]).toBeNull();
    expect(localPatchQualityDisposition(verdicts[ids[0]!] ?? null, 9).state).toBe("unresolved");
    expect(verdicts[ids[1]!]?.verdict).toBe("pass");
  });
  it.each(["missing", "reversed", "reference", "last-pair-absent"])("does not approve malformed association: %s", problem => {
    const reply: Record<string, unknown>[] = rows();
    if (problem === "missing") delete reply[0]!.evidenceIds;
    if (problem === "reversed") reply[0]!.evidenceIds = localPatchHideEvidenceIds(ids[0]!).reverse();
    if (problem === "reference") reply[0]!.evidenceIds = ["sydney:original-board", "sydney:canonical-portrait"];
    if (problem === "last-pair-absent") reply.pop();
    const verdicts = parseLocalPatchBoardVerdicts(JSON.stringify({ hides: reply }), ids, 9);
    expect(Object.values(verdicts).some(v => v === null)).toBe(true);
    expect(localPatchQualityDisposition(verdicts[problem === "last-pair-absent" ? ids[4]! : ids[0]!] ?? null, 9).state).toBe("unresolved");
  });
  it("keeps an out-of-order reply attached to its explicit hide and evidence IDs", () => {
    const reply = rows().reverse();
    reply[0]!.verdict = { ...good, reason: "Fifth appearance, not first." };
    const verdicts = parseLocalPatchBoardVerdicts(JSON.stringify({ hides: reply }), ids, 9);
    expect(verdicts[ids[4]!]?.reason).toBe("Fifth appearance, not first.");
    expect(verdicts[ids[0]!]?.reason).toBe(good.reason);
  });
  it("refuses missing wire labels locally before dispatch, rather than silently dropping an image", async () => {
    const fetchOnce = wire({ hides: rows() });
    await expect(requestJudgeWire("synthetic-key", { prompt: "test", images: [Buffer.from("a"), Buffer.from("b")],
      imageLabels: ["only one"], settings: localPatchBoardJudgeSettings(9) }, fetchOnce)).rejects.toThrow(/Every review image/);
    expect(fetchOnce).not.toHaveBeenCalled();
  });
  it("separates the new paid question while retaining old v9 receipt keys in the inventory", () => {
    const attempts = [1, 1, 1, 1, 2], newKey = localPatchBoardReviewKey("sydney", attempts, LOCAL_PATCH_COMPOSITION_VERSION, 9);
    const oldKey = "board:sydney:five-review:v9:1-1-1-1-2:bounded-return.v3-head-safe-axis";
    expect(LOCAL_PATCH_AGE_BOARD_REVIEW_VERSION).toBe("local-patch-board-five-quality/v5-evidence-labeled");
    expect(newKey).toBe(`${oldKey}:evidence-v5`);
    const keys = localPatchBoardReviewKeys("sydney", 9);
    expect(keys).toContain(oldKey); expect(keys).toContain(newKey);
    expect(keys).toHaveLength(1459); expect(new Set(keys).size).toBe(1459);
    expect(localPatchBoardReviewKey("sydney", attempts, LOCAL_PATCH_COMPOSITION_VERSION, 8)).toBe(oldKey.replace(":v9:", ":v8:"));
  });
});
