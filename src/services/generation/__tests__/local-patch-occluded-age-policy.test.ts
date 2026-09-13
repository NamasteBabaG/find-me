import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import {
  judgeLocalPatchBoard, localPatchAgeVerdictSchema, localPatchBoardJudgePrompt, localPatchExplicitUncertaintyChecks,
  localPatchOccludedAgeWarning, localPatchQualityDisposition, type LocalPatchBoardJudgeRequest,
} from "../local-patch-judge";
import { LOCAL_PATCH_COMPOSITION_VERSION } from "../local-patch-seam";
import { localPatchRepairChecks } from "../local-patch-prompt";
import { hasLocalPatchPublicationPolicy, LOCAL_PATCH_OCCLUDED_AGE_PUBLICATION_POLICY, recordLocalPatchPublicationPolicy,
  type LocalPatchPublicationBinding } from "../local-patch-publication-policy";

const good = { childPresent: "pass", childOnlyOnce: "pass", childComplete: "pass", pictureWhole: "pass",
  scaleRight: "pass", groundContact: "pass", styleMatch: "pass", faceLikeness: "pass", faceReadable: "pass",
  severeSeam: "pass", ageAppropriate: "pass", verdict: "pass", reason: "The canonical child is recognisable.", faults: [] };
const context = { hideId: "amazon-v7-5" };
const peeking = (extra: Record<string, unknown> = {}) => localPatchAgeVerdictSchema.parse({ ...good,
  ageAppropriate: "unsure", groundContact: "unsure", verdict: "unsure", reason: "The lower body is naturally concealed by foliage.", ...extra });

describe("natural peeking age is a typed contextual warning, never a model pass", () => {
  it("accepts only the clean occluded-age uncertainty while preserving every raw and derived check", () => {
    const verdict = peeking(), unchanged = structuredClone(verdict);
    const result = localPatchQualityDisposition(verdict, 9, context);
    expect(result).toMatchObject({ state: "acceptable", faults: [], contextualWarning: {
      check: "ageAppropriate", hideId: context.hideId, reason: "body-not-assessable-under-authored-natural-occlusion" } });
    expect(verdict).toEqual(unchanged); expect(verdict.verdict).toBe("unsure"); expect(verdict.ageAppropriate).toBe("unsure");
    expect(localPatchExplicitUncertaintyChecks(verdict, 9, context)).toEqual([]);
    expect(localPatchQualityDisposition(verdict, 9)).toEqual({ state: "retry", faults: ["ageAppropriate"] });
  });
  it.each([undefined, { hideId: "unknown" }, { hideId: "sydney-v7-3" }])("does not trust missing or non-peeking catalog context %j", hideContext => {
    expect(localPatchOccludedAgeWarning(peeking(), 9, hideContext)).toBeNull();
    expect(localPatchQualityDisposition(peeking(), 9, hideContext).state).toBe("retry");
  });
  it.each([undefined, 6, 7, 8, 10])("does not reinterpret old content %s", version => {
    expect(localPatchOccludedAgeWarning(peeking(), version, context)).toBeNull();
  });
  it.each(["unsure", "fail"])("never waives visible head-scale %s", scaleRight => {
    const verdict = peeking({ scaleRight, faults: scaleRight === "fail" ? [{ check: "scaleRight", where: "The visible head is three times too large at this depth." }] : [] });
    if (scaleRight === "fail") expect(localPatchOccludedAgeWarning(verdict, 9, context)).toBeNull();
    else expect(localPatchOccludedAgeWarning(verdict, 9, context)).not.toBeNull();
    expect(localPatchQualityDisposition(verdict, 9, context).state).toBe("retry");
  });
  it("asks only for visible scale clarification when both age and scale are uncertain, not a more exposed torso", () => {
    const verdict = peeking({ scaleRight: "unsure" }), original = structuredClone(verdict);
    expect(localPatchQualityDisposition(verdict, 9, context)).toMatchObject({ state: "retry", faults: ["scaleRight"],
      contextualWarning: { check: "ageAppropriate" } });
    expect(localPatchExplicitUncertaintyChecks(verdict, 9, context)).toEqual(["scaleRight"]);
    const receipt = JSON.stringify({ verdict });
    expect(localPatchRepairChecks(receipt, 9, context)).toEqual(["scaleRight"]);
    expect(localPatchRepairChecks(receipt, 9)).toEqual(["ageAppropriate", "scaleRight"]);
    expect(localPatchExplicitUncertaintyChecks(verdict, 9)).toEqual(["ageAppropriate", "scaleRight"]);
    expect(verdict).toEqual(original);
  });
  it.each(["faceLikeness", "faceReadable", "severeSeam", "ageAppropriate", "scaleRight"])("does not waive a located %s failure", check => {
    const verdict = peeking({ [check]: "fail", verdict: "fail", faults: [{ check, where: "A clear visible defect here." }] });
    expect(localPatchOccludedAgeWarning(verdict, 9, context)).toBeNull();
    expect(localPatchQualityDisposition(verdict, 9, context).state).toBe("retry");
  });
  it.each(["faceLikeness", "faceReadable", "severeSeam"])("still requires %s to be explicit pass", check => {
    expect(localPatchQualityDisposition(peeking({ [check]: "unsure" }), 9, context).state).toBe("retry");
  });
  it.each([
    { ageAppropriate: "fail", faults: [] },
    { faults: [{ check: "ageAppropriate", where: "The visible jaw looks adult." }] },
    { faults: [{ check: "scaleRight", where: "Large head." }] },
    { faults: ["Unclassified visible complaint"] },
    { styleMatch: "fail", faults: [{ check: "styleMatch", where: "Photographic surface." }] },
    { verdict: "fail" },
  ])("does not waive softened, contradictory, unclassified or other failed evidence %j", extra => {
    const verdict = peeking(extra);
    expect(localPatchOccludedAgeWarning(verdict, 9, context)).toBeNull();
    expect(localPatchQualityDisposition(verdict, 9, context).state).not.toBe("acceptable");
  });
  it("does not infer eligibility from the model's prose or an incomplete raw reply", () => {
    const verdict = peeking({ reason: "Arbitrary prose changes no decision." });
    expect(localPatchOccludedAgeWarning(verdict, 9, context)).not.toBeNull();
    expect(localPatchOccludedAgeWarning({ ...good, ageAppropriate: "unsure" }, 9, context)).toBeNull();
    expect(localPatchOccludedAgeWarning(null, 9, context)).toBeNull();
  });
});

const bytes = Buffer.from("synthetic-only");
const request: LocalPatchBoardJudgeRequest = { contentVersion: 9, boardId: "amazon", boardPng: bytes, identityPng: bytes,
  hides: Array.from({ length: 5 }, (_, i) => ({ hideId: `amazon-v7-${i + 1}`, beforePng: bytes, afterPng: bytes,
    closeupPng: bytes, afterEvidencePng: bytes, expectation: { ageYears: 5 } })) };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
describe("explicit visible-body paid question", () => {
  it("preserves the exact old question when undefined and changes only the opt-in question", () => {
    const baseline = localPatchBoardJudgePrompt(request);
    expect(hash(baseline)).toBe("6d30fa2dbd0bbde0deec8e07c8211d20b1a9200c1b902b0f6c92fa8724deec36");
    expect(localPatchBoardJudgePrompt({ ...request, assessmentMode: undefined })).toBe(baseline);
    const changed = localPatchBoardJudgePrompt({ ...request, assessmentMode: "visible-body-v1" });
    expect(changed.startsWith(baseline)).toBe(true); expect(hash(changed)).not.toBe(hash(baseline));
    expect(changed).toContain("Scale remains mandatory"); expect(changed).toContain("VISIBLE HEAD");
    expect(changed).toContain("ageAppropriate:unsure"); expect(changed).toContain("keep scaleRight:unsure");
  });
  it.each([6, 7, 8, undefined])("refuses visible-body assessment on old content %s", contentVersion => {
    expect(() => localPatchBoardJudgePrompt({ ...request, contentVersion, assessmentMode: "visible-body-v1" })).toThrow(/explicit v9 mode/);
  });
  it("sends the changed question on the same LOW judge and twelve labeled images, without changing an unsure reply", async () => {
    const raw = JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId, evidenceIds: [`${h.hideId}:before`, `${h.hideId}:after`],
      verdict: h.hideId === context.hideId ? { ...good, ageAppropriate: "unsure", groundContact: "unsure", verdict: "unsure" } : good })) });
    const fetchOnce = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ model: "gpt-5.6-luna",
      usage: { prompt_tokens: 100, completion_tokens: 100 }, choices: [{ finish_reason: "stop", message: { content: raw } }] }),
    { status: 200, headers: { "x-request-id": "req-synthetic-visible-body" } }));
    const reply = await judgeLocalPatchBoard("synthetic-no-network", { ...request, assessmentMode: "visible-body-v1" }, fetchOnce);
    const wire = JSON.parse(String(fetchOnce.mock.calls[0]![1]!.body));
    expect(wire).toMatchObject({ model: "gpt-5.6-luna", reasoning_effort: "low", max_completion_tokens: 3000 });
    expect(wire.messages[0].content.filter((part: { type: string }) => part.type === "image_url")).toHaveLength(12);
    expect(wire.messages[0].content[0].text).toContain("ASSESSMENT MODE visible-body-v1");
    expect(reply.raw).toBe(raw); expect(reply.verdicts[context.hideId]).toMatchObject({ ageAppropriate: "unsure", verdict: "unsure" });
    expect(localPatchQualityDisposition(reply.verdicts[context.hideId]!, 9, context).state).toBe("acceptable");
  });
});

let dir: string, db: PrismaClient;
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-occluded-age-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, "policy.sqlite").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
}, 60_000);
afterAll(async () => {
  await db.$disconnect();
  if (dir && path.dirname(realpathSync(dir)) === realpathSync(tmpdir()) && path.basename(dir).startsWith("findme-occluded-age-")) rmSync(dir, { recursive: true, force: true });
});
function binding(gameId: string, verdict = peeking()): LocalPatchPublicationBinding {
  return { gameId, sceneVersion: 9, hideId: context.hideId, variantId: `variant-${gameId}`, attempts: 3,
    identityAssetId: "identity", identitySha256: "a".repeat(64), assetId: "image", imageSha256: "b".repeat(64), geometrySha256: "c".repeat(64),
    judgeJson: JSON.stringify({ reviewState: "board-review-complete", wireFault: null, compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION,
      boardReview: { version: "local-patch-board-five-quality/v5-evidence-labeled", compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION }, verdict }) };
}
describe("bound contextual publication record", () => {
  it("records a distinct SYSTEM policy warning, never a human approval or model pass", async () => {
    const value = binding("occluded-age-positive"), before = value.judgeJson;
    await db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, value));
    expect(await hasLocalPatchPublicationPolicy({ db }, value)).toBe(true);
    const record = await db.auditLog.findFirstOrThrow({ where: { entityId: value.gameId } });
    expect(record).toMatchObject({ actorType: "SYSTEM", actorId: null });
    expect(JSON.parse(record.metaJson!)).toMatchObject({ policy: LOCAL_PATCH_OCCLUDED_AGE_PUBLICATION_POLICY,
      contextualWarning: { check: "ageAppropriate", hideId: context.hideId }, judgeSha256: hash(before!) });
    expect(value.judgeJson).toBe(before); expect(JSON.parse(before!).verdict).toMatchObject({ verdict: "unsure", ageAppropriate: "unsure" });
    for (const changed of [{ imageSha256: "d".repeat(64) }, { geometrySha256: "d".repeat(64) }, { identitySha256: "d".repeat(64) },
      { hideId: "sydney-v7-3" }, { judgeJson: binding(value.gameId, peeking({ scaleRight: "unsure" })).judgeJson }]) {
      expect(await hasLocalPatchPublicationPolicy({ db }, { ...value, ...changed })).toBe(false);
    }
  });
  it("refuses scale uncertainty or a missing complete bound review before writing any policy", async () => {
    const value = binding("occluded-age-negative", peeking({ scaleRight: "unsure" }));
    await expect(db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, value))).rejects.toThrow(/unresolved/);
    await expect(db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, { ...value, judgeJson: null }))).rejects.toThrow(/unresolved/);
    expect(await db.auditLog.count({ where: { entityId: value.gameId } })).toBe(0);
  });
});
