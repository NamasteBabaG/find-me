import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOW_PAIR_ID, validateLowPairRequest } from "../../../../scripts/fixed-quality-policy";
import { LOW_CONTINUATION_ID, LOW_CONTINUATION_POLICY, LOW_CONTINUATION_ROOT, validateLowContinuationPolicy, validateLowContinuationRequest } from "../../../../scripts/fixed-low-continuation-policy";

vi.mock("../../../../scripts/fixed-quality-policy", () => ({
  LOW_PAIR_ID: "fixed-medium-low-pair-20260908", validateLowPairRequest: vi.fn(),
}));
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
beforeEach(() => { vi.mocked(validateLowPairRequest).mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });
function fixture() {
  const files = { prompt: Buffer.from("A new whole-body archetype; exact captured prompt"), style: Buffer.from("synthetic original-board style"), identity: Buffer.from("synthetic child identity") };
  const request = {
    version: 1, createdAt: "2026-09-08T12:00:00.000Z", commit: "a".repeat(40), sourceFiles: [],
    policy: { ...LOW_CONTINUATION_POLICY } as Record<string, unknown>,
    settings: { kind: "image", modelRequested: "gpt-image-2", quality: "low", size: "1024x1024", background: "transparent", inputOrder: ["style", "identity"], timeoutMs: 240000 } as Record<string, unknown>,
    promptSha256: sha(files.prompt), inputs: [{ file: "style.png", sha256: sha(files.style), bytes: files.style.length }, { file: "identity.png", sha256: sha(files.identity), bytes: files.identity.length }],
  };
  return { files, request };
}

describe("separate LOW continuation policy", () => {
  it("pins a distinct LOW200c ledger, SolHIGH and no retries without changing the historical pair", () => {
    expect(LOW_CONTINUATION_ID).not.toBe(LOW_PAIR_ID);
    expect(LOW_CONTINUATION_ROOT).toBe("work/fixed-sprite-pilot-20260908/quality-low-continuation-v1");
    expect(Object.isFrozen(LOW_CONTINUATION_POLICY)).toBe(true);
    expect(validateLowContinuationPolicy({ ...LOW_CONTINUATION_POLICY })).toBe(LOW_CONTINUATION_POLICY);
    expect(LOW_CONTINUATION_POLICY).toEqual({ id: LOW_CONTINUATION_ID, limitCents: 200, imageModel: "gpt-image-2", imageQuality: "low", judgeModel: "gpt-5.6-sol", judgeEffort: "high", noAutomaticRetries: true });
    expect(() => validateLowContinuationPolicy({ ...LOW_CONTINUATION_POLICY, id: LOW_PAIR_ID, limitCents: 100 })).toThrow("unapproved continuation policy");
  });

  it("accepts a new exact LOW request without requiring a MEDIUM sponsor or making calls", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network permitted"));
    const { files, request } = fixture(); const before = JSON.stringify(request);
    const result = await validateLowContinuationRequest(request, files);
    expect(result.sourceOrigin).toBe("new-low-continuation");
    expect(result.sourcePolicyId).toBe(LOW_CONTINUATION_ID);
    expect(result.sourceRequestObjectSha256).toBe(sha(before));
    expect(result.continuationPolicySha256).toBe(sha(JSON.stringify(LOW_CONTINUATION_POLICY)));
    expect(result.inputs).toEqual({ promptSha256: sha(files.prompt), styleSha256: sha(files.style), identitySha256: sha(files.identity) });
    expect(result).toMatchObject({ matchedComparison: false, placementApprovalTransferred: false, requiresNewPlacementEvidence: true, automaticRelease: false });
    expect(result).not.toHaveProperty("originalPairProvenance");
    expect(JSON.stringify(request)).toBe(before);
    expect(validateLowPairRequest).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
  });

  it("distinguishes raw request-file hash from object-serialization hash and preserves supplied property order", async () => {
    const { request, files } = fixture();
    const reordered = { settings: request.settings, policy: request.policy, inputs: request.inputs, promptSha256: request.promptSha256, version: request.version, commit: request.commit };
    const actualRequestBytes = Buffer.from(JSON.stringify(reordered, null, 2) + "\n");
    const rawParsed = JSON.parse(actualRequestBytes.toString("utf8"));
    const result = await validateLowContinuationRequest(rawParsed, files);
    expect(result.sourceRequestObjectSha256).toBe(sha(JSON.stringify(rawParsed)));
    expect(result.sourceRequestObjectSha256).not.toBe(sha(actualRequestBytes));
    expect(result).not.toHaveProperty("sourceRequestFileSha256");
    // The harness retains actualRequestBytes/hash separately. Passing a schema-
    // reordered object gives a different honest object hash, not the file hash.
    const schemaReordered = { version: rawParsed.version, promptSha256: rawParsed.promptSha256, inputs: rawParsed.inputs, policy: rawParsed.policy, settings: rawParsed.settings, commit: rawParsed.commit };
    const second = await validateLowContinuationRequest(schemaReordered, files);
    expect(second.sourceRequestObjectSha256).not.toBe(result.sourceRequestObjectSha256);
  });

  it.each(["id", "limitCents", "imageModel", "imageQuality", "judgeModel", "judgeEffort", "noAutomaticRetries"])("rejects continuation policy drift: %s", async key => {
    const f = fixture(); f.request.policy[key] = "invalid";
    await expect(validateLowContinuationRequest(f.request, f.files)).rejects.toThrow(/unapproved continuation policy|source policy is neither/);
    expect(validateLowPairRequest).not.toHaveBeenCalled();
  });

  it.each(["kind", "modelRequested", "quality", "size", "background", "inputOrder", "timeoutMs"])("rejects image setting drift: %s", async key => {
    const f = fixture(); f.request.settings[key] = "invalid";
    await expect(validateLowContinuationRequest(f.request, f.files)).rejects.toThrow("new LOW settings changed");
    expect(validateLowPairRequest).not.toHaveBeenCalled();
  });

  it.each(["high", "medium", "auto"])("forbids non-LOW image quality %s even though judges use HIGH effort", async quality => {
    const f = fixture(); f.request.settings.quality = quality; f.request.policy.imageQuality = quality;
    await expect(validateLowContinuationRequest(f.request, f.files)).rejects.toThrow("unapproved continuation policy");
  });

  it.each(["n", "mask", "outputFormat", "pairedMediumBaseline", "continuationContext"])("rejects undeclared image parameter %s", async key => {
    const f = fixture(); f.request.settings[key] = key === "n" ? 2 : {};
    await expect(validateLowContinuationRequest(f.request, f.files)).rejects.toThrow("undeclared parameter/paired proof");
  });

  it("rejects undeclared policy fields and silent budget increases", async () => {
    const f = fixture(); f.request.policy.allowRetries = false;
    await expect(validateLowContinuationRequest(f.request, f.files)).rejects.toThrow("unapproved continuation policy");
    delete f.request.policy.allowRetries; f.request.policy.limitCents = 201;
    await expect(validateLowContinuationRequest(f.request, f.files)).rejects.toThrow("unapproved continuation policy");
  });

  it.each(["prompt", "style", "identity"] as const)("rejects replaced captured %s bytes", async key => {
    const f = fixture(); f.files[key] = Buffer.from("replacement");
    await expect(validateLowContinuationRequest(f.request, f.files)).rejects.toThrow("exact captured prompt/style/identity bytes");
  });

  it.each(["prompt-hash", "style-length", "identity-hash", "reversed-inputs", "extra-input", "missing-input", "wrong-version"])("rejects malformed provenance: %s", async kind => {
    const f = fixture();
    if (kind === "prompt-hash") f.request.promptSha256 = sha("wrong");
    if (kind === "style-length") f.request.inputs[0]!.bytes++;
    if (kind === "identity-hash") f.request.inputs[1]!.sha256 = sha("wrong");
    if (kind === "reversed-inputs") f.request.inputs.reverse();
    if (kind === "extra-input") f.request.inputs.push({ file: "mask.png", sha256: sha("mask"), bytes: 4 });
    if (kind === "missing-input") f.request.inputs.pop();
    if (kind === "wrong-version") f.request.version = 2;
    await expect(validateLowContinuationRequest(f.request, f.files)).rejects.toThrow(/source request is malformed|exact captured prompt/);
    expect(validateLowPairRequest).not.toHaveBeenCalled();
  });

  it("rejects empty captured references and whitespace-only prompts", async () => {
    const f = fixture(); f.files.prompt = Buffer.from("  ");
    await expect(validateLowContinuationRequest(f.request, f.files)).rejects.toThrow("nonempty captured");
    f.files.prompt = Buffer.from("text"); f.files.identity = Buffer.alloc(0);
    await expect(validateLowContinuationRequest(f.request, f.files)).rejects.toThrow("nonempty captured");
  });

  it("delegates a historical paired source to the unchanged strict validator, without transferring placement approval", async () => {
    const f = fixture();
    f.request.policy = { ...LOW_CONTINUATION_POLICY, id: LOW_PAIR_ID, limitCents: 100 };
    const proof = { version: "medium-low-pair/v1", baselineCaseFile: "unchanged historical case", contractSha256: sha("old contract"), slotsFileSha256: sha("old frozen slots") };
    f.request.settings.pairedMediumBaseline = proof;
    const baseline = { proof } as unknown as Awaited<ReturnType<typeof validateLowPairRequest>>;
    vi.mocked(validateLowPairRequest).mockResolvedValueOnce(baseline);
    const before = JSON.stringify(f.request);
    const result = await validateLowContinuationRequest(f.request, f.files);
    expect(validateLowPairRequest).toHaveBeenCalledExactlyOnceWith(f.request, f.files);
    expect(result.sourceOrigin).toBe("historical-low-pair");
    expect(result.sourcePolicyId).toBe(LOW_PAIR_ID);
    expect(result.continuationPolicyId).toBe(LOW_CONTINUATION_ID);
    expect(result.originalPairProvenance).toEqual(proof);
    expect(result.originalPairProvenance).not.toBe(proof);
    expect(result).toMatchObject({ matchedComparison: false, placementApprovalTransferred: false, requiresNewPlacementEvidence: true, automaticRelease: false });
    expect(JSON.stringify(f.request)).toBe(before);
    const newSlotContext = { slotsFileSha256: sha("new frozen slots"), contractSha256: sha("new tent or taxi contract"), lowContinuation: result };
    expect(newSlotContext.contractSha256).not.toBe(result.originalPairProvenance!.contractSha256);
    expect(newSlotContext.lowContinuation.originalPairProvenance!.slotsFileSha256).toBe(proof.slotsFileSha256);
    expect(newSlotContext.lowContinuation.matchedComparison).toBe(false);
    expect(newSlotContext.lowContinuation.placementApprovalTransferred).toBe(false);
    expect(newSlotContext.lowContinuation.requiresNewPlacementEvidence).toBe(true);
  });

  it("propagates a historical pair rejection and never retries or relabels its source", async () => {
    const f = fixture(); f.request.policy = { ...LOW_CONTINUATION_POLICY, id: LOW_PAIR_ID, limitCents: 100 };
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network permitted"));
    vi.mocked(validateLowPairRequest).mockRejectedValueOnce(new Error("LOW_PAIR: baseline proof changed"));
    await expect(validateLowContinuationRequest(f.request, f.files)).rejects.toThrow("LOW_PAIR: baseline proof changed");
    expect(validateLowPairRequest).toHaveBeenCalledTimes(1);
    expect(f.request.policy.id).toBe(LOW_PAIR_ID); expect(network).not.toHaveBeenCalled();
  });

  it("checks historical capture hashes before attempting any sponsor file replay", async () => {
    const f = fixture(); f.request.policy = { ...LOW_CONTINUATION_POLICY, id: LOW_PAIR_ID, limitCents: 100 };
    f.request.inputs[1]!.sha256 = sha("other identity");
    await expect(validateLowContinuationRequest(f.request, f.files)).rejects.toThrow("exact captured prompt/style/identity bytes");
    expect(validateLowPairRequest).not.toHaveBeenCalled();
  });
});
