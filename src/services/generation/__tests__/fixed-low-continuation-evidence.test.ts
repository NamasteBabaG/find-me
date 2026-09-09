/** Free integration replays. Private child artifacts are never changed or paid for. */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { validateFixedPoseReviewCase } from "../../../../scripts/fixed-pose-evidence";
import { LOW_CONTINUATION_POLICY, validateLowContinuationRequest } from "../../../../scripts/fixed-low-continuation-policy";
import { GenerationBudget } from "../../../../scripts/generation-budget";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
// These are opaque captured JSON documents, deliberately retaining every field.
type Document = Record<string, any>;
const readJson = (file: string): Document => JSON.parse(readFileSync(file, "utf8"));
const writeJson = (file: string, value: unknown) => writeFileSync(file, JSON.stringify(value, null, 2));
const scratchRoots: string[] = [];
function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), "findme-low-evidence-"));
  scratchRoots.push(dir);
  return dir;
}
afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  for (const dir of scratchRoots) {
    const resolved = realpathSync(dir);
    if (path.dirname(resolved) !== realpathSync(tmpdir()) || !path.basename(resolved).startsWith("findme-low-evidence-")) throw new Error("Unsafe test cleanup target");
    rmSync(resolved, { recursive: true });
  }
});

const pilot = "work/fixed-sprite-pilot-20260908";
const newCase = (child: string) => path.join(pilot, `newyork-low-${child}-v1`, "middle-taxi-rear-quarter-candidate", "judge-case.json");
const oldCase = (child: string) => path.join(pilot, "standing-v1", `automatic-occluded-joint-${child}-low-v1`, "freestanding-left-crates-candidate", "judge-case.json");
function available(file: string) {
  if (!existsSync(file)) return false;
  const c = readJson(file);
  return existsSync(c.manifest) && existsSync(c.inputs) && existsSync(readJson(c.inputs).sourceFile);
}

/** Only local overlays are writable; original captured images retain their paths. */
function overlay(file: string) {
  const dir = scratch(), c = readJson(file), inputs = readJson(c.inputs), manifest = readJson(c.manifest);
  for (const name of ["native-visible.png", "board.png"]) copyFileSync(path.join(path.dirname(c.manifest), name), path.join(dir, name));
  c.manifest = path.join(dir, "manifest.json");
  c.inputs = path.join(dir, "inputs.json");
  const caseFile = path.join(dir, "judge-case.json");
  function save() { writeJson(c.inputs, inputs); writeJson(c.manifest, manifest); writeJson(caseFile, c); }
  save();
  return { dir, c, inputs, manifest, caseFile, save };
}

describe("LOW continuation ledger and CLI isolation, without private artifacts", () => {
  it.each(["medium", "paired-low"])("cannot open a %s ledger with the new continuation policy", mode => {
    const dir = scratch();
    const oldPolicy = { id: mode === "medium" ? "fixed-sprite-pilot-20260908" : "fixed-medium-low-pair-20260908", limitCents: mode === "medium" ? 500 : 100,
      imageModel: "gpt-image-2", imageQuality: mode === "medium" ? "medium" : "low", judgeModel: "gpt-5.6-sol", judgeEffort: "high", noAutomaticRetries: true };
    new GenerationBudget(dir, oldPolicy.limitCents, oldPolicy);
    const ledger = path.join(dir, "requests.json"), before = readFileSync(ledger);
    const dispatch = vi.fn();
    expect(() => {
      const budget = new GenerationBudget(dir, LOW_CONTINUATION_POLICY.limitCents, LOW_CONTINUATION_POLICY);
      void budget.run("must-not-dispatch", 1, dispatch);
    }).toThrow("request ledger inputs or budget changed");
    expect(dispatch).not.toHaveBeenCalled();
    expect(readFileSync(ledger).equals(before)).toBe(true);
  });

  it("rejects combined LOW modes before any source, credentials, or ledger access", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/fixed-sprite-pilot.ts", "judge-pose", "--paired-low", "--low-pilot"],
      { encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "" }, timeout: 20_000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Choose paired comparison OR LOW continuation, never both");
  });
});

describe("optional real LOW continuation evidence — skipped without private captures", () => {
  for (const child of ["yuval", "noa"]) {
    it.skipIf(!available(newCase(child)))(`${child}: replays the new board/mask while retaining source provenance and no transferred approval`, async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden in free replay"));
      const result = await validateFixedPoseReviewCase(newCase(child));
      const inputs = readJson(result.caseData.inputs), continuation = inputs.lowContinuation;
      expect(result.sourceImageQuality).toBe("low");
      expect(result.researchMode).toBe("low-continuation");
      expect(result.evidence).toMatchObject({ geometryPassed: true, geometryFailureAllowed: false, semanticStatus: "pending", automaticRelease: false });
      expect(continuation).toMatchObject({ sourceOrigin: "historical-low-pair", matchedComparison: false, placementApprovalTransferred: false,
        requiresNewPlacementEvidence: true, automaticRelease: false });
      expect(inputs.slotsFileSha256).not.toBe(continuation.originalPairProvenance.slotsFileSha256);
      expect(result.evidence.contractSha256).not.toBe(continuation.originalPairProvenance.contractSha256);
      const foreground = inputs.slots.slots.find((slot: Document) => slot.id === result.caseData.slotId).foregroundFile;
      expect(result.evidence.capturedFiles.some(file => file.file === path.resolve(foreground))).toBe(true);
      expect(result.evidence.imageRequestId).toBe(inputs.imageRequestId);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.skipIf(!available(oldCase(child)))(`${child}: unchanged historical pair still replays as paired-low`, async () => {
      const result = await validateFixedPoseReviewCase(oldCase(child));
      expect(result.researchMode).toBe("paired-low");
      expect(result.sourceImageQuality).toBe("low");
      expect(result.evidence.automaticRelease).toBe(false);
      expect(readJson(result.caseData.inputs).lowContinuation).toBeUndefined();
    });
  }

  const yuval = newCase("yuval"), hasYuval = available(yuval);
  it.skipIf(!hasYuval)("does not let a new slot masquerade as the strict historical comparison", async () => {
    const f = overlay(yuval);
    delete f.inputs.lowContinuation;
    delete f.manifest.evidence.lowContinuation;
    f.save();
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toThrow("LOW pair changed frozen placement recipe");
  });

  it.skipIf(!hasYuval).each(["matchedComparison", "placementApprovalTransferred", "automaticRelease"])("rejects forged continuation %s even when both evidence copies agree", async field => {
    const f = overlay(yuval);
    f.inputs.lowContinuation[field] = true;
    f.manifest.evidence.lowContinuation[field] = true;
    f.save();
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toThrow("Explicit LOW continuation context does not match recorded evidence");
  });

  it.skipIf(!hasYuval)("rejects relabeling a real MEDIUM case as a LOW continuation", async () => {
    const continuation = readJson(readJson(yuval).inputs).lowContinuation;
    const f = overlay(continuation.originalPairProvenance.baselineCaseFile);
    f.inputs.lowContinuation = structuredClone(continuation);
    f.manifest.evidence.lowContinuation = structuredClone(continuation);
    f.save();
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toThrow("LOW continuation cannot relabel MEDIUM evidence");
  });

  it.skipIf(!hasYuval)("rejects a historical MEDIUM request with quality labels changed to LOW", async () => {
    const continuation = readJson(readJson(yuval).inputs).lowContinuation;
    const baseline = readJson(continuation.originalPairProvenance.baselineCaseFile);
    const dir = path.dirname(readJson(baseline.inputs).sourceFile), request = readJson(path.join(dir, "request.json"));
    request.policy.imageQuality = "low";
    request.settings.quality = "low";
    await expect(validateLowContinuationRequest(request, { prompt: readFileSync(path.join(dir, "prompt.txt")),
      style: readFileSync(path.join(dir, "style.png")), identity: readFileSync(path.join(dir, "identity.png")) })).rejects.toThrow(/source policy|policy/i);
  });

  it.skipIf(!hasYuval || !available(newCase("noa")))("rejects the other child's real identity sheet", async () => {
    const f = overlay(yuval);
    f.c.identity = readJson(newCase("noa")).identity;
    f.save();
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toThrow("Judge identity sheet does not match the captured identity");
  });

  it.skipIf(!hasYuval || !available(newCase("noa")))("cannot pair another real LOW source and its valid receipt with the old source observer", async () => {
    const f = overlay(yuval), other = readJson(readJson(newCase("noa")).inputs);
    f.inputs.sourceFile = other.sourceFile;
    for (const key of ["sourceFileSha256", "sourceRequestSha256", "sourceReceiptSha256", "imageRequestId"]) {
      f.inputs[key] = other[key];
      f.manifest.evidence[key] = other[key];
    }
    f.save();
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toThrow("Observer request is not source-only Sol HIGH with the captured image receipt");
  });

  it.skipIf(!hasYuval)("reconstructs context pixels instead of trusting an updated PNG digest", async () => {
    const f = overlay(yuval), metadata = await sharp(readFileSync(f.c.composite)).metadata();
    const replacement = await sharp({ create: { width: metadata.width!, height: metadata.height!, channels: 4, background: "red" } }).png().toBuffer();
    f.c.composite = path.join(f.dir, "tampered-context.png");
    writeFileSync(f.c.composite, replacement);
    f.manifest.imageFiles.contextSha256 = hash(replacement);
    f.save();
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toMatchObject({ code: "replay_mismatch" });
  });

  it.skipIf(!hasYuval)("does not accept a replacement foreground with self-consistent slot-file hashes", async () => {
    const f = overlay(yuval), slots = structuredClone(f.inputs.slots);
    const slot = slots.slots.find((entry: Document) => entry.id === f.c.slotId);
    const foreground = await sharp({ create: { width: slot.contract.board.width, height: slot.contract.board.height, channels: 4, background: "transparent" } }).png().toBuffer();
    slot.foregroundFile = path.join(f.dir, "replacement-foreground.png");
    writeFileSync(slot.foregroundFile, foreground);
    f.inputs.slotsFile = path.join(f.dir, "slots.json");
    writeJson(f.inputs.slotsFile, slots);
    f.inputs.slots = slots;
    f.inputs.slotsFileSha256 = hash(readFileSync(f.inputs.slotsFile));
    f.manifest.evidence.slotsFileSha256 = f.inputs.slotsFileSha256;
    f.save();
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toBeInstanceOf(Error);
  });

  it.skipIf(!hasYuval)("requires the continuation's recorded scale search", async () => {
    const f = overlay(yuval);
    delete f.manifest.scaleSearch;
    f.save();
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toThrow("LOW continuation requires recorded bounded scale search");
  });

  it.skipIf(!hasYuval).each(["step", "policyHash", "attempts", "cap", "selectedAttempt"])("rejects forged scale-search %s history, not just an unchanged passing transform", async change => {
    const f = overlay(yuval), search = f.manifest.scaleSearch;
    if (change === "step") {
      search.search.policy.stepPx = 0.4;
      // Repair the local policy digest too: the original attempted/planned search still must replay.
      search.provenance.policySha256 = hash(JSON.stringify(search.search.policy));
    }
    if (change === "policyHash") search.provenance.policySha256 = "0".repeat(64);
    if (change === "attempts") search.attempts[0].geometryPassed = false;
    if (change === "cap") search.search.policy.maxCandidates = 1000;
    if (change === "selectedAttempt") search.selectedAttemptIndex = 1;
    f.save();
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toBeInstanceOf(Error);
  });

  it.skipIf(!hasYuval).each([{ unsupported: true }, { dy: -35 }, { factor: 1.3 }, {}])("rejects unsupported or unreproduced control corruption %j despite passing candidate pixels", async corruption => {
    const f = overlay(yuval);
    f.c.control = true;
    f.manifest.corruption = corruption;
    f.save();
    await expect(validateFixedPoseReviewCase(f.caseFile, { allowGeometryFailure: true })).rejects.toBeInstanceOf(Error);
  });

  for (const control of ["floating", "oversized"]) {
    const file = path.join(path.dirname(path.dirname(yuval)), `middle-taxi-rear-quarter-${control}`, "judge-case.json");
    it.skipIf(!available(file))(`retains an actual ${control} continuation control as explicitly labelled, never automatically released`, async () => {
      const result = await validateFixedPoseReviewCase(file, { allowGeometryFailure: true });
      expect(result.caseData.control).toBe(true);
      expect(result.researchMode).toBe("low-continuation");
      expect(result.evidence.automaticRelease).toBe(false);
      expect(result.evidence.semanticStatus).toBe("pending");
      expect(result.evidence.geometryFailureAllowed).toBe(!result.evidence.geometryPassed);
    });
  }

  it.skipIf(!hasYuval).each([{ mode: [] as string[] }, { mode: ["--paired-low"] }])("rejects a continuation case under wrong review flags $mode before the paid path", async ({ mode }) => {
    // Invalid ID is a second, independent fail-closed barrier if mode checking regresses.
    // Empty key cannot be filled by localEnv; no network or paid ledger is reachable.
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/fixed-sprite-pilot.ts", "judge-pose", `--case=${path.resolve(yuval)}`,
      ...mode, "--run", "--id=invalid!"], { encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "" }, timeout: 30_000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Review run policy/ledger differs from reconstructed source and experiment context");
    expect(result.stderr).not.toContain("safe unique --id");
  });

  it.skipIf(!hasYuval)("correct continuation mode validates for free with no --run", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/fixed-sprite-pilot.ts", "judge-pose", `--case=${path.resolve(yuval)}`, "--low-pilot"],
      { encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "" }, timeout: 30_000, maxBuffer: 2_000_000 });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ dryRun: true, geometryPassed: true, paidCalls: 0, evidence: { automaticRelease: false, semanticStatus: "pending" } });
  });
});
