import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it, vi } from "vitest";
import { validateFixedPoseReviewCase } from "../../../../scripts/fixed-pose-evidence";
import { extractSpriteCell, evaluateFixedPlacement, fixedPlacementManifest, fixedSlotV3ContractSchema, sha256Rgba, type VisibleSpriteSource } from "../fixed-sprite";
import { poseObserverPrompt } from "../../../infra/generation/pose-observer";

const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const roots: string[] = [];
const box = (x: number, y: number, w: number, h: number) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const note = "One paid source-only semantic measurement; not identity/style approval";
const policy = { imageModel: "gpt-image-2", imageQuality: "medium", judgeModel: "gpt-5.6-sol", judgeEffort: "high", noAutomaticRetries: true };
function jsonFile(file: string, value: unknown) { writeFileSync(file, JSON.stringify(value, null, 2)); }
function mutate(file: string, keys: string[], value: unknown) {
  const root = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  let node = root;
  for (const key of keys.slice(0, -1)) node = node[key] as Record<string, unknown>;
  node[keys.at(-1)!] = value; jsonFile(file, root);
}
afterAll(() => {
  for (const scratch of roots) {
    const resolved = realpathSync(scratch);
    if (path.dirname(resolved) !== realpathSync(tmpdir()) || !path.basename(resolved).startsWith("findme-pose-evidence-")) throw new Error("Refusing cleanup outside isolated evidence fixtures");
    rmSync(resolved, { recursive: true, force: true });
  }
});

// Entirely synthetic connected rectangles, never a child's picture in git.
async function fixture(options: { control?: boolean; quality?: string; confidence?: number; imageReceipt?: Record<string, unknown>; observerResult?: Record<string, unknown>; foreground?: boolean } = {}) {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-pose-evidence-")); roots.push(root);
  const imageDir = path.join(root, "image"), observerDir = path.join(root, "observer"), caseDir = path.join(root, "case");
  [imageDir, observerDir, caseDir].forEach(file => mkdirSync(file));
  const rgba = Buffer.alloc(1024 * 1024 * 4);
  const paint = (x: number, y: number, w: number, h: number) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) rgba.set([120, 80, 140, 255], (yy * 1024 + xx) * 4); };
  paint(448, 128, 128, 160); paint(480, 288, 64, 400); paint(480, 688, 24, 208); paint(520, 688, 24, 208);
  const sourcePng = await sharp(rgba, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
  const board = await sharp({ create: { width: 400, height: 400, channels: 4, background: "#d8dedc" } }).png().toBuffer();
  const sourceFile = path.join(imageDir, "sheet.png"), boardFile = path.join(root, "board.png"), identity = path.join(root, "full-reference.png");
  writeFileSync(sourceFile, sourcePng); writeFileSync(boardFile, board); writeFileSync(identity, sourcePng);
  const identityCrop = await sharp(sourcePng).extract({ left: 0, top: 0, width: 512, height: 512 }).resize(512, 512).png().toBuffer();
  writeFileSync(path.join(imageDir, "style.png"), board); writeFileSync(path.join(imageDir, "identity.png"), identityCrop); writeFileSync(path.join(imageDir, "prompt.txt"), "Synthetic image request");
  const imageRequest = { version: 1, policy, promptSha256: hash("Synthetic image request"), inputs: [{ file: "style.png", sha256: hash(board), bytes: board.length }, { file: "identity.png", sha256: hash(identityCrop), bytes: identityCrop.length }], settings: { kind: "image", modelRequested: "gpt-image-2", quality: options.quality ?? "medium", size: "1024x1024", background: "transparent", inputOrder: ["style", "identity"] } };
  const receipt = { model: "gpt-image-2", attempts: 1, costUnknown: false, costCents: 5.333, providerRequestId: "req_synthetic_image", outputSha256: hash(sourcePng), usage: { totalTokens: 1856, inputTokens: 100, outputTokens: 1756, textInputTokens: 50, imageInputTokens: 50 }, ...options.imageReceipt };
  jsonFile(path.join(imageDir, "request.json"), imageRequest); jsonFile(path.join(imageDir, "result.json"), receipt);
  const source: VisibleSpriteSource = { measurementVersion: "visible-face/v1", poseId: "standing", landmarkTolerancePx: 2,
    landmarks: { eyeMidpoint: { x: .5, y: 192 / 1024 }, chin: { x: .5, y: 272 / 1024 }, leftFoot: { x: 492 / 1024, y: 896 / 1024 }, rightFoot: { x: 532 / 1024, y: 896 / 1024 } },
    protectedFacePolygon: box(464 / 1024, 144 / 1024, 96 / 1024, 120 / 1024),
    measurementFrame: { rgbaSha256: sha256Rgba(rgba, 1024, 1024), width: 1024, height: 1024, cell: { id: "standing", left: 0, top: 0, width: 1024, height: 1024 }, coordinates: "cell-normalized-pixel-edges" } };
  const observation = { poseId: "standing", figureCount: 1, completeFigure: true, extraProps: false, poseMatches: true,
    landmarks: Object.fromEntries(Object.entries(source.landmarks).map(([name, point]) => [name, { status: "observed", point, confidence: options.confidence ?? .95, reason: "synthetic point" }])),
    protectedFacePolygon: { status: "observed", polygon: source.protectedFacePolygon, confidence: .95, reason: "synthetic polygon" }, reason: "synthetic complete figure" };
  const wire = await sharp(sourcePng).flatten({ background: { r: 130, g: 130, b: 130 } }).png().toBuffer();
  writeFileSync(path.join(observerDir, "source.png"), sourcePng); writeFileSync(path.join(observerDir, "wire.png"), wire);
  writeFileSync(path.join(observerDir, "source-receipt.json"), readFileSync(path.join(imageDir, "result.json")));
  writeFileSync(path.join(observerDir, "source-request.json"), readFileSync(path.join(imageDir, "request.json")));
  writeFileSync(path.join(observerDir, "prompt.txt"), poseObserverPrompt());
  const observerRequest = { version: 1, policy, promptSha256: hash(poseObserverPrompt()),
    inputs: ["source.png", "wire.png", "source-receipt.json", "source-request.json"].map(file => { const bytes = readFileSync(path.join(observerDir, file)); return { file, sha256: hash(bytes), bytes: bytes.length }; }),
    settings: { kind: "visible-pose-observation", model: "gpt-5.6-sol", effort: "high", noBoardIdentityOrManualCoordinatesSent: true, sourceReceiptSha256: hash(readFileSync(path.join(imageDir, "result.json"))) } };
  jsonFile(path.join(observerDir, "request.json"), observerRequest);
  const observer = { status: "ok", approved: true, costUnknown: false, costCents: .25, costBasis: "conservative-upper-estimate", attempts: 1,
    modelRequested: "gpt-5.6-sol", modelReturned: "gpt-5.6-sol", requestId: "req_synthetic_observer", httpStatus: 200, finishReason: "stop", serviceTier: "default", wireMatchesRecordedInput: true,
    promptVersion: "visible-landmarks/v1", promptSent: poseObserverPrompt(), responseText: JSON.stringify(observation), observation, source,
    sourceImage: { sha256: hash(sourcePng), rgbaSha256: source.measurementFrame.rgbaSha256, width: 1024, height: 1024, bytes: sourcePng.length }, wireImage: { sha256: hash(wire), width: 1024, height: 1024, bytes: wire.length },
    rawUsage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 }, ...options.observerResult };
  const observationFile = path.join(observerDir, "result.json"); jsonFile(observationFile, observer);
  let foreground;
  let foregroundFile: string | undefined;
  if (options.foreground) {
    const pixels = Buffer.alloc(400 * 400 * 4);
    for (let y = 320; y < 350; y++) for (let x = 150; x < 250; x++) pixels.set([216, 222, 220, 255], (y * 400 + x) * 4);
    foreground = { rgba: pixels, width: 400, height: 400 }; foregroundFile = path.join(root, "foreground.png");
    writeFileSync(foregroundFile, await sharp(pixels, { raw: { width: 400, height: 400, channels: 4 } }).png().toBuffer());
  }
  const contract = fixedSlotV3ContractSchema.parse({ version: "fixed-sprite/v3", measurementVersion: "visible-face/v1", board: { sha256: hash(board), width: 400, height: 400 }, slotId: "synthetic-standing", poseId: "standing",
    support: { type: "ground", sourceLandmark: "soleMidpoint", destination: { x: .5, y: .85 }, tolerancePx: 2 }, scale: { kind: "landmark-distance", from: "eyeMidpoint", to: "chin", destinationDistancePx: 16, tolerancePx: 1 }, anchorChecks: [], allowedEnvelope: box(0, 0, 1, 1), forbiddenRegions: [],
    ...(foreground ? { foregroundMask: { rgbaSha256: sha256Rgba(foreground.rgba, 400, 400), width: 400, height: 400, mode: "board-foreground-alpha" } } : {}) });
  const recipe = { pose: "standing", support: "Synthetic ground", occlusion: options.foreground ? "Synthetic foreground" : "No foreground", occlusionMode: options.foreground ? "layer" : "open" };
  const slot = { id: "slot", contract, foregroundFile, window: { left: 0, top: 0, width: 400, height: 400 }, judgeRecipe: recipe };
  const slots = { boardFile, boardSha256: hash(board), slots: [slot] }, slotsFile = path.join(root, "slots.json"); jsonFile(slotsFile, slots);
  const extracted = extractSpriteCell({ rgba, width: 1024, height: 1024, grid: { cells: [source.measurementFrame.cell], clearancePx: 2 }, cellId: "standing", source,
    review: { sourceSha256: source.measurementFrame.rgbaSha256, cellId: "standing", figureCount: 1, completeFigure: true, extraProps: false, poseMatches: true, reviewer: "gpt-5.6-sol:visible-landmarks/v1", note } });
  const placement = evaluateFixedPlacement({ contract, board: contract.board, sprite: extracted, foreground, transform: { scale: .2, translateX: 200 - 512 * .2, translateY: 340 - 896 * .2 - (options.control ? 35 : 0) } });
  const evidence = { slotsFileSha256: hash(readFileSync(slotsFile)), observationSha256: hash(readFileSync(observationFile)), observationRequestSha256: hash(readFileSync(path.join(observerDir, "request.json"))), sourceFileSha256: hash(sourcePng), sourceReceiptSha256: hash(readFileSync(path.join(imageDir, "result.json"))), sourceRequestSha256: hash(readFileSync(path.join(imageDir, "request.json"))), imageRequestId: "req_synthetic_image", observationRequestId: "req_synthetic_observer", missingHistoricalCaptures: [], productionEvidenceEligible: true, processorFiles: [] };
  const inputs = path.join(root, "inputs.json"); jsonFile(inputs, { ...evidence, source, slotsFile, sourceFile, observationFile, slots });
  const patch = placement.composite, native = placement.visibility!.sourceImage;
  const patchPng = await sharp(patch.rgba, { raw: { width: patch.width, height: patch.height, channels: 4 } }).png().toBuffer();
  const nativePng = await sharp(native.rgba, { raw: { width: native.width, height: native.height, channels: 4 } }).png().toBuffer();
  const full = await sharp(board).composite([{ input: patchPng, left: patch.left, top: patch.top }]).png().toBuffer();
  const context = await sharp(full).extract(slot.window).png().toBuffer(), preview = await sharp(full).resize(200, 200).png().toBuffer();
  for (const [file, bytes] of [["patch.png", patchPng], ["native-visible.png", nativePng], ["context.png", context], ["board.png", preview]] as const) writeFileSync(path.join(caseDir, file), bytes);
  const manifest = path.join(caseDir, "manifest.json"); jsonFile(manifest, { ...fixedPlacementManifest(placement, extracted), evidence, corruption: options.control ? { dy: -35 } : null,
    scaleSearch: { provenance: { contractSha256: hash(JSON.stringify(contract)) } },
    imageFiles: { nativeSha256: hash(nativePng), patchSha256: hash(patchPng), contextSha256: hash(context), boardPreview: { sha256: hash(preview), width: 200, height: 200, role: "downsampled-review-preview-not-player-master" } } });
  const caseFile = path.join(caseDir, "judge-case.json"); jsonFile(caseFile, { protocol: "fixed-pose-review/v1", manifest, inputs, slotId: "slot", patch: path.join(caseDir, "patch.png"), composite: path.join(caseDir, "context.png"), identity, childName: "Synthetic", ageYears: 8, recipe, control: Boolean(options.control), expectedGeometryPassed: placement.ok });
  return { caseFile, manifest, inputs, caseDir, observerDir, slotsFile, foregroundFile, identity };
}

describe("free fixed pose evidence validation", () => {
  it.each([false, true])("replays synthetic source, exact transform and native/board pixels, foreground=%s", async foreground => {
    const f = await fixture({ foreground }), fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden"));
    try {
      const result = await validateFixedPoseReviewCase(f.caseFile);
      expect(result.evidence).toMatchObject({ geometryPassed: true, semanticStatus: "pending", automaticRelease: false });
      expect(result.patchPng).toEqual(readFileSync(path.join(f.caseDir, "patch.png")));
      expect(result.nativePng).toEqual(readFileSync(path.join(f.caseDir, "native-visible.png")));
      expect(result.reference).toEqual(readFileSync(f.identity));
      expect(result.evidence.reference.role).toBe("full-identity-sheet-captured-not-identity-approved");
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it("requires both explicit control label and explicit allow option for failed geometry", async () => {
    const f = await fixture({ control: true });
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toMatchObject({ code: "geometry_failed" });
    expect((await validateFixedPoseReviewCase(f.caseFile, { allowGeometryFailure: true })).evidence).toMatchObject({ geometryPassed: false, geometryFailureAllowed: true });
    mutate(f.caseFile, ["control"], false); mutate(f.manifest, ["corruption"], null);
    await expect(validateFixedPoseReviewCase(f.caseFile, { allowGeometryFailure: true })).rejects.toMatchObject({ code: "geometry_failed" });
  });
  it("never trusts expectedGeometryPassed", async () => {
    const f = await fixture(); mutate(f.caseFile, ["expectedGeometryPassed"], false);
    expect((await validateFixedPoseReviewCase(f.caseFile)).evidence.geometryPassed).toBe(true);
  });
  it("rejects a different full identity sheet even though it is a valid 1024-square image", async () => {
    const f = await fixture();
    writeFileSync(f.identity, await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "red" } }).png().toBuffer());
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toMatchObject({ code: "provenance" });
  });
  it("requires a full 1024-square sheet, not just the matching 512-square generation crop", async () => {
    const f = await fixture(), full = readFileSync(f.identity);
    writeFileSync(f.identity, await sharp(full).extract({ left: 0, top: 0, width: 512, height: 512 }).png().toBuffer());
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toMatchObject({ code: "provenance" });
  });
  it.each([1, 11])("rejects age %s outside the product's 2–10 protocol", async age => {
    const f = await fixture(); mutate(f.caseFile, ["ageYears"], age);
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toMatchObject({ code: "schema" });
  });
  it.each([
    { quality: "high" }, { imageReceipt: { attempts: 2 } }, { imageReceipt: { costUnknown: true } }, { imageReceipt: { usage: {} } },
    { observerResult: { modelReturned: "other-model" } }, { observerResult: { rawUsage: {} } }, { observerResult: { costUnknown: true } },
  ])("rejects ineligible image/observation receipt even with matching file hashes %#", async options => {
    const f = await fixture(options); await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toBeInstanceOf(Error);
  });
  it("rejects a missing historical capture instead of fabricating it", async () => {
    const f = await fixture(); rmSync(path.join(f.observerDir, "source-receipt.json"));
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toMatchObject({ code: "missing_capture" });
  });
  it("rejects changed frozen slots even if their embedded copy remains unchanged", async () => {
    const f = await fixture(); mutate(f.slotsFile, ["boardSha256"], "f".repeat(64));
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toMatchObject({ code: "hash_mismatch" });
  });
  it("rejects a self-labelled approved observation below the unchanged confidence floor", async () => {
    const f = await fixture({ confidence: .84 });
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toMatchObject({ code: "provenance" });
  });
  it.each(["contract", "scaleSearch"])("checks the frozen parsed contract against manifest %s", async field => {
    const f = await fixture();
    if (field === "contract") mutate(f.manifest, ["contract", "scale", "destinationDistancePx"], 15);
    else mutate(f.manifest, ["scaleSearch", "provenance", "contractSha256"], "f".repeat(64));
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toMatchObject({ code: "hash_mismatch" });
  });
  it.each(["ok", "transform", "flags", "source"])("recomputes manifest %s instead of trusting it", async field => {
    const f = await fixture();
    if (field === "ok") mutate(f.manifest, ["ok"], false);
    if (field === "transform") mutate(f.manifest, ["transform", "translateY"], 0);
    if (field === "flags") mutate(f.manifest, ["flags"], [{ code: "fabricated", severity: "info", message: "fake" }]);
    if (field === "source") mutate(f.manifest, ["source", "extractionBinding", "qaSha256"], "f".repeat(64));
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toMatchObject({ code: "replay_mismatch" });
  });
  it.each(["patch.png", "native-visible.png", "context.png"])("rejects rewritten %s even when its claimed encoded hash is updated", async file => {
    const f = await fixture(), altered = await sharp({ create: { width: 40, height: 40, channels: 4, background: "red" } }).png().toBuffer();
    writeFileSync(path.join(f.caseDir, file), altered);
    mutate(f.manifest, ["imageFiles", file === "patch.png" ? "patchSha256" : file === "native-visible.png" ? "nativeSha256" : "contextSha256"], hash(altered));
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toMatchObject({ code: "replay_mismatch" });
  });
  it("uses the real bound foreground mask, not a declaration that one existed", async () => {
    const f = await fixture({ foreground: true });
    writeFileSync(f.foregroundFile!, await sharp({ create: { width: 400, height: 400, channels: 4, background: "transparent" } }).png().toBuffer());
    await expect(validateFixedPoseReviewCase(f.caseFile)).rejects.toBeInstanceOf(Error);
  });
});

const replayRoot = "work/fixed-sprite-pilot-20260908/standing-v1";
describe("optional private pilot replays — skipped when local child artifacts are absent", () => {
  for (const run of ["automatic-compact-solver-v1", "automatic-visual-solver-v1"]) {
    const file = path.join(replayRoot, run, "cargo-occlusion-floating", "judge-case.json");
    it.skipIf(!existsSync(file))(`${run}: validates real captured foreground evidence as a failed control only`, async () => {
      const result = await validateFixedPoseReviewCase(file, { allowGeometryFailure: true });
      expect(result.evidence.geometryPassed).toBe(false); expect(result.evidence.automaticRelease).toBe(false);
    });
  }
});
