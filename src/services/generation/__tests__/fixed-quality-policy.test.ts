import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BOARD_CHECKS } from "../../../infra/generation/board-verdict";
import { LOW_PAIR_ID, MEDIUM_PAIR_CASE, MEDIUM_PAIR_REVIEW, MEDIUM_PAIR_HASHES, NOA_MEDIUM_PAIR, successfulMediumPair, validateLowPairRequest,
  verifyLowPairInputs, verifyMediumPairSnapshot, type MediumPairSnapshot } from "../../../../scripts/fixed-quality-policy";

vi.mock("node:fs/promises", async original => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});
const actualFs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
afterEach(() => { vi.restoreAllMocks(); vi.mocked(readFile).mockReset().mockImplementation(actualFs.readFile); });

// Synthetic textual references and a stubbed successful geometry replay isolate
// the policy rules. No private child image is embedded or written by these tests.
function fixture() {
  const root = path.resolve("synthetic-quality-pair"), inputsFile = path.join(root, "inputs.json"), sourceDir = path.join(root, "source");
  const prompt = Buffer.from("exact paired prompt"), style = Buffer.from("synthetic style"), identity = Buffer.from("synthetic identity");
  const caseData = { control: false, inputs: inputsFile, recipe: { pose: "standing", support: "behind a real crate" } };
  const caseBytes = bytes(caseData), inputsBytes = bytes({ sourceFile: path.join(sourceDir, "sheet.png"), slotsFileSha256: hash("frozen slots") });
  const request = { policy: { imageQuality: "medium" }, settings: { quality: "medium" }, promptSha256: hash(prompt),
    inputs: [{ file: "style.png", sha256: hash(style), bytes: style.length }, { file: "identity.png", sha256: hash(identity), bytes: identity.length }] };
  const requestBytes = bytes(request);
  const capturedFiles = [[inputsFile, inputsBytes], [path.join(sourceDir, "request.json"), requestBytes],
    [path.join(sourceDir, "prompt.txt"), prompt], [path.join(sourceDir, "style.png"), style], [path.join(sourceDir, "identity.png"), identity]]
    .map(([file, content]) => ({ file: file as string, sha256: hash(content as Buffer), bytes: (content as Buffer).length }));
  const evidence = { caseSha256: hash(caseBytes), manifestSha256: hash("manifest"), inputsSha256: hash(inputsBytes),
    contractSha256: hash("contract"), contextSha256: hash("context"), nativeSha256: hash("native"), patchSha256: hash("patch"),
    imageRequestId: "req_image", observationRequestId: "req_observation", reference: { sha256: hash(identity) },
    geometryPassed: true, geometryFailureAllowed: false, capturedFiles };
  const scalePolicy = { version: "fixed-scale-solver/v1", stepPx: 0.2, maxCandidates: 65 };
  const verified = { caseData, manifest: { ok: true, scaleSearch: { search: { policy: scalePolicy }, provenance: { policySha256: hash(JSON.stringify(scalePolicy)) } } }, evidence } as unknown as MediumPairSnapshot["verified"];
  const checks = Object.fromEntries(BOARD_CHECKS.map(key => [key, "pass"]));
  const review = { verdict: "ok", geometryPassed: true, visualChecksPassed: true, costUnknown: false, held: false,
    model: "gpt-5.6-sol", checks, evidence, costCents: .45,
    attempts: [{ model: "gpt-5.6-sol", status: 200, requestId: "req_review", costUnknown: false, costCents: .45,
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 }, responseText: JSON.stringify({ checks, reason: "Synthetic seven checks passed" }) }] };
  const snapshot: MediumPairSnapshot = { caseBytes, inputsBytes, requestBytes, reviewBytes: bytes(review), prompt, style, identity, verified };
  return { snapshot, review, request };
}
function lowRequest(baseline: ReturnType<typeof verifyMediumPairSnapshot>) {
  return { policy: { id: LOW_PAIR_ID, imageQuality: "low", limitCents: 100, imageModel: "gpt-image-2", judgeModel: "gpt-5.6-sol", judgeEffort: "high", noAutomaticRetries: true },
    settings: { kind: "image", modelRequested: "gpt-image-2", quality: "low", size: "1024x1024", background: "transparent", timeoutMs: 240000,
      inputOrder: ["style", "identity"], pairedMediumBaseline: baseline.proof } };
}

describe("pure MEDIUM sponsor consistency", () => {
  it("accepts complete consistent evidence without file/network activity", () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network allowed"));
    const { snapshot } = fixture();
    const result = verifyMediumPairSnapshot(snapshot);
    expect(result.proof.scaleStepPx).toBe(.2);
    expect(result.proof.recipeSha256).toBe(hash(JSON.stringify(result.verified.caseData.recipe)));
    expect(result.proof.limitation).toContain("One paired stochastic sample");
    expect(network).not.toHaveBeenCalled(); expect(readFile).not.toHaveBeenCalled();
  });
  it.each(["low", "high", undefined])("rejects non-MEDIUM baseline %s", quality => {
    const f = fixture(); f.request.policy.imageQuality = quality as string; f.request.settings.quality = quality as string; f.snapshot.requestBytes = bytes(f.request);
    expect(() => verifyMediumPairSnapshot(f.snapshot)).toThrow("baseline is not MEDIUM");
  });
  it.each(["manifest", "evidence", "review"])("rejects false geometry in %s", location => {
    const f = fixture();
    if (location === "manifest") f.snapshot.verified.manifest.ok = false;
    else if (location === "evidence") f.snapshot.verified.evidence.geometryPassed = false;
    else { f.review.geometryPassed = false; f.snapshot.reviewBytes = bytes(f.review); }
    expect(() => verifyMediumPairSnapshot(f.snapshot)).toThrow("baseline has not passed");
  });
  it.each(["fail", "uncertain"])("rejects every %s check, including advisory style", verdict => {
    for (const key of BOARD_CHECKS) {
      const f = fixture(); f.review.checks[key] = verdict; f.snapshot.reviewBytes = bytes(f.review);
      expect(() => verifyMediumPairSnapshot(f.snapshot)).toThrow("baseline has not passed");
    }
  });
  it("rejects control-only geometry permission", () => {
    const f = fixture(); f.snapshot.verified.evidence.geometryFailureAllowed = true;
    expect(() => verifyMediumPairSnapshot(f.snapshot)).toThrow("baseline has not passed");
  });
  it.each(["caseSha256", "manifestSha256", "inputsSha256", "contractSha256", "contextSha256", "nativeSha256", "patchSha256", "imageRequestId", "observationRequestId"])("rejects mismatched review %s", key => {
    const f = fixture(); f.review.evidence = structuredClone(f.review.evidence);
    (f.review.evidence as unknown as Record<string, unknown>)[key] = hash("other"); f.snapshot.reviewBytes = bytes(f.review);
    expect(() => verifyMediumPairSnapshot(f.snapshot)).toThrow("not bound");
  });
  it("rejects a different judge identity reference", () => {
    const f = fixture(); f.review.evidence = structuredClone(f.review.evidence); f.review.evidence.reference.sha256 = hash("other child"); f.snapshot.reviewBytes = bytes(f.review);
    expect(() => verifyMediumPairSnapshot(f.snapshot)).toThrow("not bound");
  });
  it("rejects changed case bytes even if geometry is true", () => {
    const f = fixture(); f.snapshot.caseBytes = bytes({ ...JSON.parse(f.snapshot.caseBytes.toString()), recipe: { pose: "sitting" } });
    expect(() => verifyMediumPairSnapshot(f.snapshot)).toThrow("different case or inputs");
  });
  it("rejects raw-response failure hidden behind summarized passes", () => {
    const f = fixture(); f.review.attempts[0]!.responseText = JSON.stringify({ checks: { ...f.review.checks, identity: "fail" }, reason: "Wrong identity" }); f.snapshot.reviewBytes = bytes(f.review);
    expect(() => verifyMediumPairSnapshot(f.snapshot)).toThrow("receipt or usage");
  });
  it("rejects missing usage even if an unknown charge could equal zero", () => {
    const f = fixture(); delete (f.review.attempts[0] as { usage?: unknown }).usage; f.review.costCents = 0; f.review.attempts[0]!.costCents = 0; f.snapshot.reviewBytes = bytes(f.review);
    expect(() => verifyMediumPairSnapshot(f.snapshot)).toThrow("receipt or usage");
  });
  it.each(["inconsistent-total", "zero-output", "fractional-input", "too-much-output", "mismatched-attempt-cost", "unknown", "wrong-model", "bad-request-id", "two-attempts"])("rejects invalid receipt %s", kind => {
    const f = fixture(), attempt = f.review.attempts[0]!;
    if (kind === "inconsistent-total") attempt.usage.total_tokens++;
    if (kind === "zero-output") attempt.usage.completion_tokens = 0;
    if (kind === "fractional-input") attempt.usage.prompt_tokens = 1.5;
    if (kind === "too-much-output") attempt.usage.completion_tokens = 8001;
    if (kind === "mismatched-attempt-cost") attempt.costCents++;
    if (kind === "unknown") attempt.costUnknown = true;
    if (kind === "wrong-model") attempt.model = "gpt-4o";
    if (kind === "bad-request-id") attempt.requestId = "req_";
    if (kind === "two-attempts") f.review.attempts.push(structuredClone(attempt));
    f.snapshot.reviewBytes = bytes(f.review);
    expect(() => verifyMediumPairSnapshot(f.snapshot)).toThrow(/receipt or usage|one complete review attempt/);
  });
  it.each(["prompt", "style", "identity"] as const)("rejects %s changed after replay", key => {
    const f = fixture(); f.snapshot[key] = Buffer.from("changed bytes");
    expect(() => verifyMediumPairSnapshot(f.snapshot)).toThrow("source bytes differ");
  });
  it("rejects missing source capture", () => {
    const f = fixture(); f.snapshot.verified.evidence.capturedFiles.pop();
    expect(() => verifyMediumPairSnapshot(f.snapshot)).toThrow("source bytes differ");
  });
  it("rejects altered scale-step metadata instead of asserting a constant", () => {
    const f = fixture(); const search = f.snapshot.verified.manifest.scaleSearch as unknown as { search: { policy: { stepPx: number } } }; search.search.policy.stepPx = 1;
    expect(() => verifyMediumPairSnapshot(f.snapshot)).toThrow("scale search policy changed");
  });
});

describe("explicit LOW pair", () => {
  it("accepts only the same prompt and reference bytes with frozen proof", () => {
    const f = fixture(), baseline = verifyMediumPairSnapshot(f.snapshot);
    expect(verifyLowPairInputs(lowRequest(baseline), baseline, baseline)).toBe(baseline);
  });
  it.each(["prompt", "style", "identity"] as const)("rejects changed LOW %s", key => {
    const f = fixture(), baseline = verifyMediumPairSnapshot(f.snapshot);
    expect(() => verifyLowPairInputs(lowRequest(baseline), { ...baseline, [key]: Buffer.from("changed") }, baseline)).toThrow("reference bytes changed");
  });
  it.each(["id", "imageQuality", "limitCents", "imageModel", "judgeModel", "judgeEffort", "noAutomaticRetries"])("rejects invalid LOW policy %s before baseline file access", async key => {
    const f = fixture(), baseline = verifyMediumPairSnapshot(f.snapshot), request = lowRequest(baseline);
    (request.policy as Record<string, unknown>)[key] = "invalid";
    await expect(validateLowPairRequest(request, baseline)).rejects.toThrow("unapproved LOW policy");
    expect(readFile).not.toHaveBeenCalled();
  });
  it.each(["kind", "modelRequested", "quality", "size", "background", "inputOrder", "timeoutMs"])("rejects a second changed image parameter %s", key => {
    const f = fixture(), baseline = verifyMediumPairSnapshot(f.snapshot), request = lowRequest(baseline);
    (request.settings as Record<string, unknown>)[key] = "changed";
    expect(() => verifyLowPairInputs(request, baseline, baseline)).toThrow("image settings changed");
  });
  it("rejects undeclared image parameters such as another output or mask", () => {
    const f = fixture(), baseline = verifyMediumPairSnapshot(f.snapshot), request = lowRequest(baseline);
    Object.assign(request.settings, { n: 2 });
    expect(() => verifyLowPairInputs(request, baseline, baseline)).toThrow("undeclared paired image setting");
  });
  it.each(["baselineReviewSha256", "baselineCaseSha256", "contractSha256", "slotsFileSha256", "recipeSha256", "scalePolicySha256", "scaleStepPx"])("rejects changed frozen proof %s", key => {
    const f = fixture(), baseline = verifyMediumPairSnapshot(f.snapshot), request = lowRequest(baseline);
    request.settings.pairedMediumBaseline = { ...baseline.proof, [key]: "changed" };
    expect(() => verifyLowPairInputs(request, baseline, baseline)).toThrow("baseline proof changed");
  });
  it("rejects replacement files at the fixed MEDIUM paths", async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from("{}"));
    await expect(successfulMediumPair()).rejects.toThrow("approved baseline case or review hash changed");
    expect(readFile).toHaveBeenCalledTimes(2);
  });
  it("pins the independent Noa baseline rather than defaulting to Yuval", async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from("{}"));
    await expect(successfulMediumPair("noa")).rejects.toThrow("approved baseline case or review hash changed");
    expect(readFile).toHaveBeenNthCalledWith(1, NOA_MEDIUM_PAIR.caseFile);
    expect(readFile).toHaveBeenNthCalledWith(2, NOA_MEDIUM_PAIR.reviewFile);
  });
  it("refuses an unrecognized LOW sponsor without reading arbitrary paths", async () => {
    const baseline = verifyMediumPairSnapshot(fixture().snapshot), request = lowRequest(baseline);
    request.settings.pairedMediumBaseline.baselineCaseFile = path.resolve("unapproved-case.json");
    await expect(validateLowPairRequest(request, baseline)).rejects.toThrow("unknown approved pair");
    expect(readFile).not.toHaveBeenCalled();
  });
});

describe("optional private actual MEDIUM replay (no private images in git)", () => {
  const available = existsSync(MEDIUM_PAIR_CASE) && existsSync(MEDIUM_PAIR_REVIEW);
  it.skipIf(!available)("rejects replaced review bytes even while the actual case is unchanged", async () => {
    vi.mocked(readFile).mockResolvedValueOnce(await actualFs.readFile(MEDIUM_PAIR_CASE)).mockResolvedValueOnce(Buffer.from("{}"));
    await expect(successfulMediumPair()).rejects.toThrow("approved baseline case or review hash changed");
    expect(readFile).toHaveBeenCalledTimes(2);
  });
  it.skipIf(!available)("rejects a changed MEDIUM source request before geometry replay", async () => {
    const caseBytes = await actualFs.readFile(MEDIUM_PAIR_CASE), reviewBytes = await actualFs.readFile(MEDIUM_PAIR_REVIEW);
    const inputsBytes = await actualFs.readFile(JSON.parse(caseBytes.toString()).inputs);
    const requestFile = path.join(path.dirname(JSON.parse(inputsBytes.toString()).sourceFile), "request.json");
    const request = JSON.parse((await actualFs.readFile(requestFile)).toString()); request.promptSha256 = hash("replacement prompt");
    vi.mocked(readFile).mockResolvedValueOnce(caseBytes).mockResolvedValueOnce(reviewBytes).mockResolvedValueOnce(inputsBytes).mockResolvedValueOnce(bytes(request));
    await expect(successfulMediumPair()).rejects.toThrow("approved baseline source request hash changed");
    expect(readFile).toHaveBeenCalledTimes(4);
  });
  it.skipIf(!available)("reconstructs the actual immutable seven-pass baseline entirely free", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network allowed"));
    const baseline = await successfulMediumPair();
    expect(baseline.proof.baselineCaseSha256).toBe(MEDIUM_PAIR_HASHES.case);
    expect(baseline.proof.baselineReviewSha256).toBe(MEDIUM_PAIR_HASHES.review);
    expect(baseline.proof.baselineSourceRequestSha256).toBe(MEDIUM_PAIR_HASHES.sourceRequest);
    expect(baseline.verified.manifest.ok).toBe(true);
    expect(baseline.proof.scaleStepPx).toBe(.2);
    expect(verifyLowPairInputs(lowRequest(baseline), baseline, baseline)).toBe(baseline);
    expect(network).not.toHaveBeenCalled();
  });
  it.skipIf(!existsSync(NOA_MEDIUM_PAIR.caseFile) || !existsSync(NOA_MEDIUM_PAIR.reviewFile))("reconstructs Noa independently without confusing child identity or proof", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network allowed"));
    const baseline = await successfulMediumPair("noa");
    expect(baseline.proof.baselineCaseSha256).toBe(NOA_MEDIUM_PAIR.hashes.case);
    expect(baseline.proof.baselineReviewSha256).toBe(NOA_MEDIUM_PAIR.hashes.review);
    expect(baseline.proof.baselineSourceRequestSha256).toBe(NOA_MEDIUM_PAIR.hashes.sourceRequest);
    expect(baseline.verified.caseData.childName).toBe("Noa");
    expect(baseline.verified.caseData.ageYears).toBe(6);
    const replay = await validateLowPairRequest(lowRequest(baseline), baseline);
    expect(replay.proof).toEqual(baseline.proof);
    expect(network).not.toHaveBeenCalled();
  });
});
