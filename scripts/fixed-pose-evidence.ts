/** Free, read-only evidence replay. No CLI side effects, environment, key or API access. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { extractSpriteCell, evaluateFixedPlacement, fixedPlacementManifest, fixedSlotV3ContractSchema, visibleSpriteSourceSchema, sha256Rgba } from "../src/services/generation/fixed-sprite";
import { poseObservationSchema, POSE_OBSERVER_VERSION, POSE_OBSERVER_MIN_CONFIDENCE, POSE_OBSERVER_MAX_OUTPUT_TOKENS, poseObserverPrompt } from "../src/infra/generation/pose-observer";
import { judgeCharge } from "../src/infra/generation/judge";
import { costCentsFrom } from "../src/infra/generation/openai";

const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().trim().min(1);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const requestId = z.string().regex(/^req_[A-Za-z0-9_-]+$/);
const recipeSchema = z.object({ pose: text, support: text, occlusion: text, occlusionMode: z.enum(["open", "clipped", "layer"]), comparators: text.optional(), visibleFraction: z.number().min(0).max(1).optional() }).strict();
const caseSchema = z.object({
  protocol: z.literal("fixed-pose-review/v1"), manifest: text, inputs: text, slotId: text,
  patch: text, composite: text, identity: text, childName: text, ageYears: z.number().int().min(2).max(10),
  recipe: recipeSchema, control: z.boolean(), expectedGeometryPassed: z.boolean(),
}).strict();
export type FixedPoseReviewCase = z.infer<typeof caseSchema>;
const inputHash = z.object({ file: text, sha256: digest, bytes: integer });
const receiptSchema = z.object({
  model: z.literal("gpt-image-2"), attempts: z.literal(1), costUnknown: z.literal(false), costCents: z.number().finite().positive(),
  providerRequestId: requestId, outputSha256: digest,
  usage: z.object({ totalTokens: integer, inputTokens: integer, outputTokens: integer.positive(), textInputTokens: integer, imageInputTokens: integer }).strict(),
  modelProvenance: text.optional(),
}).passthrough();
const requestSchema = z.object({
  version: z.literal(1), promptSha256: digest, inputs: z.array(inputHash).min(1),
  policy: z.object({ imageModel: z.literal("gpt-image-2"), imageQuality: z.enum(["medium", "low"]), judgeModel: z.literal("gpt-5.6-sol"), judgeEffort: z.literal("high"), noAutomaticRetries: z.literal(true) }).passthrough(),
  settings: z.record(z.unknown()),
}).passthrough();
const imageIdentity = z.object({ sha256: digest, width: integer.positive(), height: integer.positive(), bytes: integer.positive() });
const observerSchema = z.object({
  status: z.literal("ok"), approved: z.literal(true), costUnknown: z.literal(false), costCents: z.number().finite().positive(), costBasis: z.literal("conservative-upper-estimate"), attempts: z.literal(1),
  modelRequested: z.literal("gpt-5.6-sol"), modelReturned: z.literal("gpt-5.6-sol"), requestId,
  httpStatus: z.literal(200), finishReason: z.literal("stop"), serviceTier: z.union([z.literal("default"), z.null()]),
  wireMatchesRecordedInput: z.literal(true), promptVersion: z.literal(POSE_OBSERVER_VERSION), promptSent: text, responseText: text,
  sourceImage: imageIdentity.extend({ rgbaSha256: digest }), wireImage: imageIdentity,
  observation: poseObservationSchema, source: visibleSpriteSourceSchema,
  rawUsage: z.object({ prompt_tokens: integer.positive(), completion_tokens: integer.positive().max(POSE_OBSERVER_MAX_OUTPUT_TOKENS), total_tokens: integer }).passthrough(),
}).passthrough();
const evidenceSchema = z.object({
  slotsFileSha256: digest, observationSha256: digest, observationRequestSha256: digest, sourceFileSha256: digest, sourceReceiptSha256: digest, sourceRequestSha256: digest,
  imageRequestId: requestId, observationRequestId: requestId,
  missingHistoricalCaptures: z.array(text).length(0), productionEvidenceEligible: z.literal(true),
  processorFiles: z.array(z.object({ file: text, sha256: digest })),
  lowContinuation: z.record(z.unknown()).optional(),
}).strip();
const slotSchema = z.object({
  id: text, contract: fixedSlotV3ContractSchema, foregroundFile: text.optional(),
  window: z.object({ left: integer, top: integer, width: integer.positive(), height: integer.positive() }).strict(),
  judgeRecipe: recipeSchema.optional(),
}).passthrough();
const slotsSchema = z.object({ boardFile: text, boardSha256: digest, slots: z.array(slotSchema).min(1) }).passthrough();
const inputsSchema = evidenceSchema.extend({ source: visibleSpriteSourceSchema, slotsFile: text, sourceFile: text, observationFile: text, slots: slotsSchema });
const manifestSchema = z.object({
  version: z.literal("fixed-sprite-manifest/v3"), ok: z.boolean(), contract: fixedSlotV3ContractSchema,
  transform: z.object({ scale: z.number().finite().positive(), translateX: z.number().finite(), translateY: z.number().finite() }).strict(),
  evidence: evidenceSchema, corruption: z.unknown(), automaticRelease: z.literal(false), semanticStatus: z.literal("pending"),
  imageFiles: z.object({ nativeSha256: digest, patchSha256: digest, contextSha256: digest, boardPreview: z.object({ sha256: digest, width: integer.positive(), height: integer.positive(), role: z.literal("downsampled-review-preview-not-player-master") }) }),
  scaleSearch: z.object({ provenance: z.object({ contractSha256: digest }).passthrough() }).passthrough().optional(),
}).passthrough();
type Manifest = ReturnType<typeof fixedPlacementManifest> & z.infer<typeof manifestSchema>;
export interface FixedPoseReviewEvidence {
  version: "fixed-pose-evidence/v1";
  caseSha256: string; manifestSha256: string; inputsSha256: string; contractSha256: string;
  geometryPassed: boolean; geometryFailureAllowed: boolean;
  imageRequestId: string; observationRequestId: string; imageCostCents: number; observationCostCents: number;
  costBasis: "recorded-conservative-estimates-not-provider-invoice"; imageModelProvenance: string;
  reference: { sha256: string; bytes: number; width: number | undefined; height: number | undefined; role: "full-identity-sheet-captured-not-identity-approved";
    generationCrop: { left: number; top: number; width: number; height: number }; generationCropRgbaSha256: string; capturedGenerationIdentitySha256: string };
  nativeSha256: string; patchSha256: string; contextSha256: string;
  replayProcessorFiles: Array<{ file: string; sha256: string }>;
  capturedFiles: Array<{ file: string; sha256: string; bytes: number }>;
  semanticStatus: "pending"; automaticRelease: false;
}
export interface ValidatedFixedPoseCase {
  caseData: FixedPoseReviewCase; manifest: Manifest; patchPng: Buffer; nativePng: Buffer; boardCrop: Buffer; reference: Buffer; evidence: FixedPoseReviewEvidence;
  sourceImageQuality: "low" | "medium";
  researchMode: "medium" | "paired-low" | "low-continuation";
}

export class FixedPoseEvidenceError extends Error {
  constructor(readonly code: "schema" | "missing_capture" | "hash_mismatch" | "provenance" | "replay_mismatch" | "geometry_failed", message: string) { super(message); this.name = "FixedPoseEvidenceError"; }
}
function requireThat(ok: unknown, code: FixedPoseEvidenceError["code"], message: string): asserts ok { if (!ok) throw new FixedPoseEvidenceError(code, message); }
function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  requireThat(result.success, "schema", `${label} is absent, malformed or ineligible`);
  return result.data;
}
function json(bytes: Buffer, label: string): unknown { try { return JSON.parse(bytes.toString("utf8")); } catch { throw new FixedPoseEvidenceError("schema", `${label} is not JSON`); } }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
function equal(a: unknown, b: unknown, label: string, code: FixedPoseEvidenceError["code"] = "provenance") { requireThat(canonical(a) === canonical(b), code, `${label} does not match recorded evidence`); }

/**
 * Case paths follow the pilot's convention: absolute or relative to process cwd.
 * Every file is captured ONCE before it is used; returned images are those same
 * bytes. Hashes prove internal file consistency, not provider authenticity or
 * human identity/style approval. Historical missing captures never qualify.
 */
export async function validateFixedPoseReviewCase(caseFile: string, options: { allowGeometryFailure?: boolean } = {}): Promise<ValidatedFixedPoseCase> {
  const captured = new Map<string, Buffer>();
  async function capture(file: string) {
    const resolved = path.resolve(file);
    const existing = captured.get(resolved); if (existing) return existing;
    let bytes: Buffer;
    try { bytes = await readFile(resolved); } catch { throw new FixedPoseEvidenceError("missing_capture", `Required evidence file unavailable: ${path.basename(resolved)}`); }
    captured.set(resolved, bytes); return bytes;
  }
  async function bound(file: string, expected: string) { const bytes = await capture(file); requireThat(sha(bytes) === expected, "hash_mismatch", `Evidence hash mismatch: ${path.basename(file)}`); return bytes; }
  async function capturedRequestInputs(request: z.infer<typeof requestSchema>, dir: string) {
    const names = new Set<string>();
    for (const input of request.inputs) {
      requireThat(path.basename(input.file) === input.file && !names.has(input.file), "provenance", "Captured request input names must be unique local basenames"); names.add(input.file);
      const bytes = await bound(path.join(dir, input.file), input.sha256);
      requireThat(bytes.length === input.bytes, "provenance", "Captured request input size mismatch");
    }
    await bound(path.join(dir, "prompt.txt"), request.promptSha256);
  }
  const caseBytes = await capture(caseFile), caseData = parse(caseSchema, json(caseBytes, "review case"), "review case");
  const manifestBytes = await capture(caseData.manifest), manifest = parse(manifestSchema, json(manifestBytes, "manifest"), "manifest");
  const inputsBytes = await capture(caseData.inputs), inputs = parse(inputsSchema, json(inputsBytes, "inputs"), "inputs");
  equal(manifest.evidence, parse(evidenceSchema, inputs, "input evidence"), "Manifest/input provenance");
  const slotsBytes = await bound(inputs.slotsFile, inputs.slotsFileSha256), slots = parse(slotsSchema, json(slotsBytes, "frozen slots"), "frozen slots");
  equal(slots, inputs.slots, "Frozen slots snapshot");
  const matchingSlots = slots.slots.filter(slot => slot.id === caseData.slotId);
  requireThat(matchingSlots.length === 1, "provenance", "Review case must select exactly one frozen slot");
  const slot = matchingSlots[0]!, contract = fixedSlotV3ContractSchema.parse(slot.contract);
  const contractSha256 = sha(JSON.stringify(contract));
  requireThat(sha(JSON.stringify(manifest.contract)) === contractSha256, "hash_mismatch", "Parsed manifest contract differs from frozen slot contract");
  if (manifest.scaleSearch) requireThat(manifest.scaleSearch.provenance.contractSha256 === contractSha256, "hash_mismatch", "Scale search contract hash differs from frozen contract");
  if (slot.judgeRecipe) equal(caseData.recipe, slot.judgeRecipe, "Frozen judge recipe");
  requireThat(caseData.recipe.pose === "standing" && (Boolean(slot.foregroundFile) === (caseData.recipe.occlusionMode !== "open")), "provenance", "Judge recipe disagrees with standing/foreground contract");
  requireThat(caseData.control === (manifest.corruption !== null && manifest.corruption !== undefined), "provenance", "Control label disagrees with recorded corruption");

  const sourceBytes = await bound(inputs.sourceFile, inputs.sourceFileSha256), sourceDir = path.dirname(inputs.sourceFile), observerDir = path.dirname(inputs.observationFile);
  const receiptBytes = await bound(path.join(sourceDir, "result.json"), inputs.sourceReceiptSha256);
  const sourceRequestBytes = await bound(path.join(sourceDir, "request.json"), inputs.sourceRequestSha256);
  const observerBytes = await bound(inputs.observationFile, inputs.observationSha256);
  const observerRequestBytes = await bound(path.join(observerDir, "request.json"), inputs.observationRequestSha256);
  const receipt = parse(receiptSchema, json(receiptBytes, "image receipt"), "image receipt");
  const rawSourceRequest = json(sourceRequestBytes, "image request");
  const sourceRequest = parse(requestSchema, rawSourceRequest, "image request");
  const observed = parse(observerSchema, json(observerBytes, "observer result"), "observer result");
  const observerRequest = parse(requestSchema, json(observerRequestBytes, "observer request"), "observer request");
  requireThat(sourceRequest.settings.kind === "image" && sourceRequest.settings.modelRequested === "gpt-image-2" && sourceRequest.settings.quality === sourceRequest.policy.imageQuality && sourceRequest.settings.size === "1024x1024" && sourceRequest.settings.background === "transparent", "provenance", "Source must be one known approved-quality 1024-square transparent image request");
  requireThat(observerRequest.policy.imageQuality === sourceRequest.policy.imageQuality, "provenance", "Source and observer experiment policies differ");
  const usage = receipt.usage;
  requireThat(usage.inputTokens === usage.textInputTokens + usage.imageInputTokens && usage.totalTokens === usage.inputTokens + usage.outputTokens, "provenance", "Image usage totals are inconsistent");
  equal(receipt.costCents, costCentsFrom("gpt-image-2", { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, input_tokens_details: { text_tokens: usage.textInputTokens, image_tokens: usage.imageInputTokens } }), "Image usage charge");
  requireThat(receipt.outputSha256 === sha(sourceBytes) && receipt.providerRequestId === inputs.imageRequestId && observed.requestId === inputs.observationRequestId, "provenance", "Source output/request IDs disagree");
  requireThat(observerRequest.settings.kind === "visible-pose-observation" && observerRequest.settings.model === "gpt-5.6-sol" && observerRequest.settings.effort === "high" && observerRequest.settings.noBoardIdentityOrManualCoordinatesSent === true && observerRequest.settings.sourceReceiptSha256 === sha(receiptBytes), "provenance", "Observer request is not source-only Sol HIGH with the captured image receipt");
  const observerUsage = observed.rawUsage;
  requireThat(observerUsage.total_tokens === observerUsage.prompt_tokens + observerUsage.completion_tokens, "provenance", "Observer usage totals are inconsistent");
  equal(observed.costCents, judgeCharge("gpt-5.6-sol", observerUsage).costCents, "Observer conservative usage charge");
  await capturedRequestInputs(sourceRequest, sourceDir);
  await capturedRequestInputs(observerRequest, observerDir);
  requireThat(!inputs.lowContinuation || sourceRequest.policy.imageQuality === "low", "provenance", "LOW continuation cannot relabel MEDIUM evidence");
  if (inputs.lowContinuation) {
    const { validateLowContinuationRequest } = await import("./fixed-low-continuation-policy");
    const continuation = await validateLowContinuationRequest(rawSourceRequest, {
      prompt: await capture(path.join(sourceDir, "prompt.txt")), style: await capture(path.join(sourceDir, "style.png")), identity: await capture(path.join(sourceDir, "identity.png")),
    });
    equal(inputs.lowContinuation, continuation, "Explicit LOW continuation context");
    requireThat(Boolean(manifest.scaleSearch), "provenance", "LOW continuation requires recorded bounded scale search");
  } else if (sourceRequest.policy.imageQuality === "low") {
    const { validateLowPairRequest } = await import("./fixed-quality-policy");
    const baseline = await validateLowPairRequest(sourceRequest, {
      prompt: await capture(path.join(sourceDir, "prompt.txt")), style: await capture(path.join(sourceDir, "style.png")), identity: await capture(path.join(sourceDir, "identity.png")),
    });
    requireThat(inputs.slotsFileSha256 === baseline.proof.slotsFileSha256 && contractSha256 === baseline.proof.contractSha256, "provenance", "LOW pair changed frozen placement recipe");
    equal(caseData.recipe, baseline.verified.caseData.recipe, "LOW paired judge recipe");
    requireThat(caseData.childName === baseline.verified.caseData.childName && caseData.ageYears === baseline.verified.caseData.ageYears, "provenance", "LOW pair changed child or age");
    const search = (manifest as unknown as { scaleSearch?: { search?: { policy?: { stepPx?: number } } } }).scaleSearch;
    requireThat(search?.search?.policy?.stepPx === baseline.proof.scaleStepPx, "provenance", "LOW pair changed scale search step");
  }
  equal(sourceRequest.inputs.map(item => item.file).sort(), ["style.png", "identity.png"].sort(), "Image input inventory");
  equal(sourceRequest.settings.inputOrder, ["style", "identity"], "Image reference order");
  equal(observerRequest.inputs.map(item => item.file).sort(), ["source.png", "wire.png", "source-receipt.json", "source-request.json"].sort(), "Observer input inventory");
  for (const [name, original] of [["source.png", sourceBytes], ["source-receipt.json", receiptBytes], ["source-request.json", sourceRequestBytes]] as const) {
    requireThat((await capture(path.join(observerDir, name))).equals(original), "hash_mismatch", `Observer captured ${name} differs from original evidence`);
  }
  equal(observed.promptSent, poseObserverPrompt(), "Pinned observer prompt");
  requireThat(sha(observed.promptSent) === observerRequest.promptSha256, "hash_mismatch", "Observer prompt hash mismatch");
  equal(parse(poseObservationSchema, JSON.parse(observed.responseText), "observer response text"), observed.observation, "Observer response/parsed measurements");
  const observation = observed.observation, readings = [...Object.values(observation.landmarks), observation.protectedFacePolygon];
  requireThat(observation.figureCount === 1 && observation.completeFigure === true && observation.extraProps === false && observation.poseMatches === true && readings.every(item => item.status === "observed" && item.confidence >= POSE_OBSERVER_MIN_CONFIDENCE), "provenance", "Observer measurements or semantic checks are uncertain");
  const source = visibleSpriteSourceSchema.parse(observed.source);
  equal(source, inputs.source, "Recorded source measurement");
  equal(source.landmarks, Object.fromEntries(Object.entries(observation.landmarks).map(([name, value]) => [name, value.point])), "Source/observer points");
  equal(source.protectedFacePolygon, observation.protectedFacePolygon.polygon, "Source/observer protected face");
  requireThat(source.landmarkTolerancePx === 2, "provenance", "Observer landmark tolerance must remain two pixels");
  const sourceMeta = await sharp(sourceBytes).metadata();
  requireThat(sourceMeta.format === "png" && (sourceMeta.pages ?? 1) === 1 && (sourceMeta.orientation ?? 1) === 1, "provenance", "Source must remain a single unrotated PNG");
  const raw = await sharp(sourceBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const sourceRgbaSha256 = sha256Rgba(raw.data, raw.info.width, raw.info.height);
  equal(observed.sourceImage, { sha256: sha(sourceBytes), rgbaSha256: sourceRgbaSha256, width: 1024, height: 1024, bytes: sourceBytes.length }, "Observed original image");
  equal(source.measurementFrame, { rgbaSha256: sourceRgbaSha256, width: 1024, height: 1024, cell: { id: "standing", left: 0, top: 0, width: 1024, height: 1024 }, coordinates: "cell-normalized-pixel-edges" }, "Full source measurement frame");
  requireThat(raw.info.width === 1024 && raw.info.height === 1024, "provenance", "Source canvas changed");
  const wire = await capture(path.join(observerDir, "wire.png"));
  const rebuiltWire = await sharp(sourceBytes).flatten({ background: { r: 130, g: 130, b: 130 } }).png().toBuffer();
  requireThat(wire.equals(rebuiltWire), "replay_mismatch", "Observer gray wire no longer reproduces from the original source");
  equal(observed.wireImage, { sha256: sha(wire), width: 1024, height: 1024, bytes: wire.length }, "Observer wire identity");
  const extracted = extractSpriteCell({ rgba: raw.data, width: raw.info.width, height: raw.info.height, grid: { cells: [source.measurementFrame.cell], clearancePx: 2 }, cellId: "standing", source,
    review: { sourceSha256: sourceRgbaSha256, cellId: "standing", figureCount: observation.figureCount, completeFigure: observation.completeFigure, extraProps: observation.extraProps, poseMatches: observation.poseMatches, reviewer: `${observed.modelReturned}:${observed.promptVersion}`, note: "One paid source-only semantic measurement; not identity/style approval" } });
  requireThat(extracted.ok, "provenance", "Current source extraction failed; controls cannot waive source integrity");
  const board = await bound(slots.boardFile, slots.boardSha256), boardMeta = await sharp(board).metadata();
  equal(contract.board, { sha256: sha(board), width: boardMeta.width, height: boardMeta.height }, "Frozen board identity");
  let foreground;
  if (slot.foregroundFile) { const f = await sharp(await capture(slot.foregroundFile)).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); foreground = { rgba: f.data, width: f.info.width, height: f.info.height }; }
  requireThat(Boolean(foreground) === Boolean(contract.foregroundMask), "provenance", "Frozen foreground input is missing or undeclared");
  if (inputs.lowContinuation) {
    const { solveFixedScale } = await import("../src/services/generation/fixed-scale-solver");
    const recorded = manifest.scaleSearch as unknown as { search?: { policy?: import("../src/services/generation/fixed-scale-solver").FixedScaleSolverPolicy } };
    requireThat(Boolean(recorded?.search?.policy), "provenance", "LOW continuation lacks a declared scale-search policy");
    const { placement: selected, ...reconstructedSearch } = solveFixedScale({ contract, board: contract.board, sprite: extracted, foreground, policy: recorded.search!.policy! });
    equal(manifest.scaleSearch, reconstructedSearch, "Replayed bounded scale search", "replay_mismatch");
    if (!caseData.control) {
      requireThat(selected !== null, "geometry_failed", "No tested feasible candidate exists for this LOW continuation");
      equal(manifest.transform, selected.transform, "Automatically selected continuation transform", "replay_mismatch");
    } else {
      // Continuation controls are deliberate reproducible corruptions of the
      // automatic candidate, not arbitrary transforms with a control label.
      const control = parse(z.union([
        z.object({ dy: z.literal(-35) }).strict(),
        z.object({ scaleFactor: z.literal(1.5), fixedAnchor: z.literal(contract.support.sourceLandmark) }).strict(),
      ]), manifest.corruption, "LOW continuation corruption");
      const base = selected?.transform ?? reconstructedSearch.targetAttempt.transform;
      let expectedTransform;
      if ("dy" in control) expectedTransform = { ...base, translateY: base.translateY + control.dy };
      else {
        const name = contract.support.sourceLandmark;
        const point = name === "soleMidpoint" ? extracted.derivedLandmarks!.soleMidpoint : source.landmarks[name];
        const scale = base.scale * control.scaleFactor;
        expectedTransform = { scale, translateX: contract.support.destination.x * contract.board.width - point.x * extracted.sourceWidth * scale,
          translateY: contract.support.destination.y * contract.board.height - point.y * extracted.sourceHeight * scale };
      }
      equal(manifest.transform, expectedTransform, "Declared LOW continuation corruption transform", "replay_mismatch");
    }
  }
  const replay = evaluateFixedPlacement({ contract, board: contract.board, sprite: extracted, foreground, transform: manifest.transform });
  const replayManifest = fixedPlacementManifest(replay, extracted);
  for (const [key, value] of Object.entries(replayManifest)) equal(manifest[key], value, `Replayed manifest ${key}`, "replay_mismatch");
  const patchPng = await bound(caseData.patch, manifest.imageFiles.patchSha256), boardCrop = await bound(caseData.composite, manifest.imageFiles.contextSha256);
  const nativePng = await bound(path.join(path.dirname(caseData.manifest), "native-visible.png"), manifest.imageFiles.nativeSha256);
  const patch = replay.composite, visible = replay.visibility!.sourceImage;
  const rebuiltPatch = await sharp(patch.rgba, { raw: { width: patch.width, height: patch.height, channels: 4 } }).png().toBuffer();
  const rebuiltNative = await sharp(visible.rgba, { raw: { width: visible.width, height: visible.height, channels: 4 } }).png().toBuffer();
  requireThat(patchPng.equals(rebuiltPatch) && nativePng.equals(rebuiltNative), "replay_mismatch", "Replayed encoded patch/native bytes differ");
  const composite = await sharp(board).composite([{ input: patchPng, left: patch.left, top: patch.top }]).png().toBuffer();
  const context = await sharp(composite).extract(slot.window).png().toBuffer();
  requireThat(boardCrop.equals(context), "replay_mismatch", "Context is not the replayed board/patch/frozen window composite");
  const preview = await bound(path.join(path.dirname(caseData.manifest), "board.png"), manifest.imageFiles.boardPreview.sha256);
  const previewMeta = manifest.imageFiles.boardPreview;
  requireThat(preview.equals(await sharp(composite).resize(previewMeta.width, previewMeta.height).png().toBuffer()), "replay_mismatch", "Board preview does not reproduce");
  requireThat(replay.ok || (options.allowGeometryFailure === true && caseData.control === true), "geometry_failed", "Geometry failed; only an explicitly allowed labelled control may proceed to visual review");
  const reference = await capture(caseData.identity), referenceMeta = await sharp(reference).metadata();
  requireThat(referenceMeta.width === 1024 && referenceMeta.height === 1024 && (referenceMeta.pages ?? 1) === 1 && (referenceMeta.orientation ?? 1) === 1, "provenance", "Protocol v1 requires the original unrotated 1024-square identity sheet");
  // Same fixed crop as fixed-sprite-pilot.prepare; compare decoded pixels so
  // PNG compression differences cannot masquerade as a different identity.
  const identityCrop = { left: 0, top: 0, width: 512, height: 512 };
  const fromFullSheet = await sharp(reference).extract(identityCrop).resize(512, 512).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const imageIdentityBytes = await capture(path.join(sourceDir, "identity.png"));
  const usedToGenerate = await sharp(imageIdentityBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  requireThat(usedToGenerate.info.width === 512 && usedToGenerate.info.height === 512 && usedToGenerate.data.equals(fromFullSheet.data), "provenance", "Judge identity sheet does not match the captured identity used to generate this source");
  const replayProcessorFiles = [];
  for (const file of ["scripts/fixed-pose-evidence.ts", "src/services/generation/fixed-sprite.ts"]) replayProcessorFiles.push({ file, sha256: sha(await capture(file)) });
  const evidence = {
    version: "fixed-pose-evidence/v1" as const, caseSha256: sha(caseBytes), manifestSha256: sha(manifestBytes), inputsSha256: sha(inputsBytes), contractSha256,
    geometryPassed: replay.ok, geometryFailureAllowed: !replay.ok && caseData.control && options.allowGeometryFailure === true,
    imageRequestId: receipt.providerRequestId, observationRequestId: observed.requestId,
    imageCostCents: receipt.costCents, observationCostCents: observed.costCents, costBasis: "recorded-conservative-estimates-not-provider-invoice" as const,
    imageModelProvenance: receipt.modelProvenance ?? "Recorded model is requested model; provider return is not independently exposed",
    reference: { sha256: sha(reference), bytes: reference.length, width: referenceMeta.width, height: referenceMeta.height, role: "full-identity-sheet-captured-not-identity-approved" as const,
      generationCrop: identityCrop, generationCropRgbaSha256: sha256Rgba(fromFullSheet.data, 512, 512), capturedGenerationIdentitySha256: sha(imageIdentityBytes) },
    nativeSha256: sha(nativePng), patchSha256: sha(patchPng), contextSha256: sha(boardCrop),
    replayProcessorFiles,
    capturedFiles: [...captured].map(([file, bytes]) => ({ file, sha256: sha(bytes), bytes: bytes.length })),
    semanticStatus: "pending" as const, automaticRelease: false as const,
  };
  // Explicitly separate board-resolution patch from the foreground-masked
  // native player asset. A caller choosing nativePng for judge detail changes
  // the wire policy; it must record that choice, not compare old costs blindly.
  return { caseData, manifest: manifest as Manifest, patchPng, nativePng, boardCrop, reference, evidence,
    sourceImageQuality: sourceRequest.policy.imageQuality, researchMode: inputs.lowContinuation ? "low-continuation" : sourceRequest.policy.imageQuality === "low" ? "paired-low" : "medium" };
}
