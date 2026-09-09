/** Isolated, budgeted pilot. Does not mutate games, scenes or Claude's experiments. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { GenerationBudget } from "./generation-budget";
import { LOW_CONTINUATION_POLICY, LOW_CONTINUATION_ROOT, validateLowContinuationRequest } from "./fixed-low-continuation-policy";

const PAIRED_LOW = process.argv.includes("--paired-low");
const LOW_CONTINUATION = process.argv.includes("--low-pilot");
if (PAIRED_LOW && LOW_CONTINUATION) throw new Error("Choose paired comparison OR LOW continuation, never both");
const ROOT = LOW_CONTINUATION ? path.resolve(LOW_CONTINUATION_ROOT) : path.resolve("work/fixed-sprite-pilot-20260908", ...(PAIRED_LOW ? ["quality-low-v1"] : []));
// New LOW ledger; never relabel or change the historical MEDIUM fingerprint.
const POLICY = LOW_CONTINUATION ? LOW_CONTINUATION_POLICY : { id: PAIRED_LOW ? "fixed-medium-low-pair-20260908" : "fixed-sprite-pilot-20260908", limitCents: PAIRED_LOW ? 100 : 500, imageModel: "gpt-image-2", imageQuality: PAIRED_LOW ? "low" : "medium", judgeModel: "gpt-5.6-sol", judgeEffort: "high", noAutomaticRetries: true } as const;
const hash = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const flag = (key: string, fallback = "") => process.argv.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3) ?? fallback;
const writeJson = (file: string, data: unknown) => writeFileSync(file, JSON.stringify(data, null, 2), { flag: "wx" });

function knownImageEvidence(file: string) {
  const bytes = readFileSync(file);
  const receiptBytes = readFileSync(path.join(path.dirname(file), "result.json"));
  const requestBytes = readFileSync(path.join(path.dirname(file), "request.json"));
  const receipt = JSON.parse(receiptBytes.toString("utf8")), request = JSON.parse(requestBytes.toString("utf8"));
  const u = receipt.usage;
  if (receipt.outputSha256 !== hash(bytes) || receipt.costUnknown !== false || receipt.model !== POLICY.imageModel
      || typeof receipt.providerRequestId !== "string" || !receipt.providerRequestId.startsWith("req_")
      || !Number.isFinite(receipt.costCents) || receipt.costCents <= 0 || receipt.attempts !== 1
      || request.settings.modelRequested !== POLICY.imageModel || request.settings.quality !== POLICY.imageQuality || request.policy?.imageQuality !== POLICY.imageQuality
      || !u || !["inputTokens", "outputTokens", "textInputTokens", "imageInputTokens"].every(k => Number.isSafeInteger(u[k]) && u[k] >= 0)
      || u.inputTokens !== u.textInputTokens + u.imageInputTokens || u.outputTokens <= 0) throw new Error("Source is not hash-bound to a known single approved-quality request and usage receipt");
  return { bytes, receipt, receiptBytes, requestBytes };
}

function localEnv() {
  // Existing user-authorized key only; never print or persist credentials.
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*(#.*)?$/.exec(line);
    if (m?.[1] && process.env[m[1]] === undefined) process.env[m[1]] = (m[2] ?? "").trim();
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("Existing API key is unavailable");
}

function assertId(id: string) {
  if (!/^[a-z0-9][a-z0-9-]{2,70}$/.test(id)) throw new Error("A safe unique --id is required");
}
function stageDir(id: string) {
  assertId(id);
  const dir = path.join(ROOT, "stages", id);
  if (existsSync(dir)) throw new Error(`Immutable stage already exists: ${id}; inspect it, do not re-buy it`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function withBudget<T>(f: (b: GenerationBudget) => Promise<T>) {
  mkdirSync(ROOT, { recursive: true });
  const lock = path.join(ROOT, "paid.lock");
  writeFileSync(lock, JSON.stringify({ pid: process.pid, time: new Date().toISOString() }), { flag: "wx" });
  try { return await f(new GenerationBudget(path.join(ROOT, "budget"), POLICY.limitCents, POLICY,
    flag("continuation-approval") ? { continuationApprovalFile: flag("continuation-approval") } : {})); }
  finally { unlinkSync(lock); }
}

function recordInputs(dir: string, prompt: string, files: Array<{ name: string; bytes: Buffer }>, extra: unknown) {
  writeFileSync(path.join(dir, "prompt.txt"), prompt, { flag: "wx" });
  const inputs = files.map(f => {
    writeFileSync(path.join(dir, f.name), f.bytes, { flag: "wx" });
    return { file: f.name, sha256: hash(f.bytes), bytes: f.bytes.length };
  });
  const sourceFiles = ["scripts/fixed-sprite-pilot.ts", "scripts/fixed-sprite-seat-pilot.ts", "scripts/fixed-quality-policy.ts", "scripts/fixed-pose-evidence.ts", "scripts/generation-budget.ts", "src/infra/generation/openai.ts", "src/infra/generation/judge.ts", "src/infra/generation/board-verdict.ts", "src/infra/generation/sprite-landmarks.ts", "src/services/generation/fixed-sprite.ts", "src/services/generation/fixed-template.ts"].map(file => ({ file, sha256: hash(readFileSync(file)) }));
  if (LOW_CONTINUATION) sourceFiles.push({ file: "scripts/fixed-low-continuation-policy.ts", sha256: hash(readFileSync("scripts/fixed-low-continuation-policy.ts")) });
  writeJson(path.join(dir, "request.json"), { version: 1, createdAt: new Date().toISOString(), commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), policy: POLICY, promptSha256: hash(prompt), inputs, sourceFiles, settings: extra });
}

async function prepare() {
  const dir = stageDir(flag("id"));
  const board = flag("board", "antarctica");
  if (!["antarctica", "sydney"].includes(board)) throw new Error("Pilot is limited to two boards");
  const base = readFileSync(`public/scenes/${board}/refresh-20260907/base.webp`);
  const originalIdentity = readFileSync(flag("identity", "work/codex-judge-audit-20260908/pilot/sheet.png"));
  // Identity uses the face only; whole-body rendering/proportions are not a second style guide.
  const identity = await sharp(originalIdentity).extract({ left: 0, top: 0, width: 512, height: 512 }).resize(512, 512).png().toBuffer();
  const styleRects = board === "antarctica"
    ? [{ left: 1690, top: 1430, width: 300, height: 320 }, { left: 1960, top: 1560, width: 280, height: 420 }]
    : [{ left: 600, top: 1120, width: 310, height: 470 }, { left: 1300, top: 1530, width: 310, height: 470 }];
  const crops = await Promise.all(styleRects.map(r => sharp(base).extract(r).resize(480, 560, { fit: "contain", background: "#eee9df" }).png().toBuffer()));
  const style = await sharp({ create: { width: 1024, height: 640, channels: 4, background: "#eee9df" } }).composite(crops.map((input, i) => ({ input, left: 24 + i * 504, top: 40 }))).png().toBuffer();
  writeFileSync(path.join(dir, "style.png"), style, { flag: "wx" });
  writeFileSync(path.join(dir, "identity.png"), identity, { flag: "wx" });
  writeJson(path.join(dir, "sources.json"), { board, boardSha256: hash(base), boardDimensions: { width: 3072, height: 2048 }, identityOriginalSha256: hash(originalIdentity), identityCrop: { left: 0, top: 0, width: 512, height: 512 }, styleRects, warning: "Reference crops must be visually inspected before payment" });
  console.log(JSON.stringify({ prepared: dir }));
}

async function generate() {
  assertId(flag("id"));
  if (flag("quality", POLICY.imageQuality) !== POLICY.imageQuality) throw new Error("Quality must match the explicit experiment policy; HIGH/AUTO are forbidden");
  if (!process.argv.includes("--run")) throw new Error("Paid step requires --run");
  const promptFile = flag("prompt"), styleFile = flag("style"), identityFile = flag("identity");
  if (!promptFile || !styleFile || !identityFile) throw new Error("Explicit --prompt, --style, --identity required");
  const prompt = readFileSync(promptFile, "utf8");
  const images = [{ name: "style.png", bytes: readFileSync(styleFile) }, { name: "identity.png", bytes: readFileSync(identityFile) }];
  let pairedMediumBaseline: Awaited<ReturnType<typeof import("./fixed-quality-policy").successfulMediumPair>>["proof"] | undefined;
  if (PAIRED_LOW) {
    const pair = flag("pair", "yuval");
    if (pair !== "yuval" && pair !== "noa") throw new Error("Unknown approved LOW pair");
    if (flag("id") !== (pair === "yuval" ? "paired-low-image-v1" : "paired-low-noa-image-v1")) throw new Error("Each authorized LOW pair allows one immutable image attempt");
    const { successfulMediumPair } = await import("./fixed-quality-policy");
    const baseline = await successfulMediumPair(pair);
    if (!Buffer.from(prompt).equals(baseline.prompt) || !images[0]!.bytes.equals(baseline.style) || !images[1]!.bytes.equals(baseline.identity)) throw new Error("LOW pair must use exact MEDIUM prompt and reference bytes");
    pairedMediumBaseline = baseline.proof;
  }
  const imageSettings = { kind: "image", modelRequested: POLICY.imageModel, quality: POLICY.imageQuality, size: "1024x1024", background: "transparent", inputOrder: ["style", "identity"], timeoutMs: 240000, ...(pairedMediumBaseline ? { pairedMediumBaseline } : {}) };
  if (LOW_CONTINUATION) await validateLowContinuationRequest({ version: 1, policy: POLICY, settings: imageSettings, promptSha256: hash(prompt),
    inputs: images.map(f => ({ file: f.name, sha256: hash(f.bytes), bytes: f.bytes.length })) }, { prompt: Buffer.from(prompt), style: images[0]!.bytes, identity: images[1]!.bytes });
  localEnv();
  await withBudget(async budget => {
    if (budget.held) throw new Error("Unresolved prior charge: no retries or further spending");
    const dir = stageDir(flag("id"));
    recordInputs(dir, prompt, images, imageSettings);
    const { OpenAiAvatarProvider } = await import("../src/infra/generation/openai");
    const provider = new OpenAiAvatarProvider(process.env.OPENAI_API_KEY!, { model: POLICY.imageModel, quality: POLICY.imageQuality, tries: 1, timeoutMs: 240000, budgetMs: 270000 });
    const answer = await budget.run(`image:${flag("id")}`, 20, async () => {
      // Reuse the production adapter's wire and accounting; no alternative SDK or endpoint.
      const result = await (provider as unknown as { call: (p: Record<string, unknown>) => Promise<{ png: Buffer; costCents: number; model: string; providerRequestId?: string; usage?: Record<string, number>; costUnknown?: boolean }> }).call({ images: images.map(f => ({ name: f.name, buffer: f.bytes })), prompt, size: "1024x1024", quality: POLICY.imageQuality, background: "transparent", outputFormat: "png", label: flag("id") });
      const u = result.usage;
      const required = ["inputTokens", "outputTokens", "textInputTokens", "imageInputTokens"];
      const verifiedUsage = Boolean(u && required.every(k => Number.isInteger(u[k]) && u[k]! >= 0) && u.inputTokens === u.textInputTokens! + u.imageInputTokens!);
      return { ...result, costUnknown: Boolean(result.costUnknown || !verifiedUsage) };
    });
    writeFileSync(path.join(dir, "sheet.png"), answer.png, { flag: "wx" });
    await sharp(answer.png).flatten({ background: "#8a8a8a" }).png().toFile(path.join(dir, "on-grey.png"));
    const { png: _png, ...bill } = answer;
    writeJson(path.join(dir, "result.json"), { ...bill, outputSha256: hash(answer.png), modelProvenance: "Production image adapter reports requested model; response model is not independently exposed", spentCents: budget.spent, held: budget.held });
    console.log(JSON.stringify({ dir, costCents: answer.costCents, costUnknown: answer.costUnknown, spentCents: budget.spent, held: budget.held }));
  });
}

/** One-time static authoring: source pixels outside the actual edit mask are immutable. */
async function staticEdit() {
  assertId(flag("id"));
  if (!LOW_CONTINUATION || PAIRED_LOW || POLICY.imageModel !== "gpt-image-2" || POLICY.imageQuality !== "low"
    || flag("quality", "low") !== "low") throw new Error("Static edits require the approved --low-pilot Image2 LOW policy");
  const bundle = flag("static-input");
  if (!bundle) throw new Error("Explicit --static-input bundle required");
  const bundleDir = path.resolve(bundle);
  const placementBytes = readFileSync(path.join(bundleDir, "placement.json"));
  const placement = JSON.parse(placementBytes.toString("utf8"));
  if (placement.schema !== "fixed-static-edit-input/v1" || placement.status !== "prepared-not-generated"
    || !/^[a-z0-9-]+$/.test(placement.board ?? "") || placement.input?.file !== "input.png" || placement.mask?.file !== "mask.png") {
    throw new Error("Unsupported static input bundle");
  }
  const originalFile = path.resolve("public/scenes", placement.board, "refresh-20260907/base.webp");
  if (path.resolve(placement.originalBoardFile) !== originalFile) throw new Error("Static edit must reference its original catalog board");
  const original = readFileSync(originalFile), input = readFileSync(path.join(bundleDir, "input.png"));
  const mask = readFileSync(path.join(bundleDir, "mask.png")), prompt = readFileSync(path.join(bundleDir, "prompt.txt"), "utf8");
  if (hash(original) !== placement.originalBoardSha256 || hash(input) !== placement.input.sha256
    || hash(mask) !== placement.mask.sha256 || hash(prompt) !== placement.promptSha256) throw new Error("Changed static input/hash: refusing payment");
  const frame = placement.crop as { left: number; top: number; width: number; height: number };
  const rect = placement.editRectCrop as number[];
  const boardRect = placement.editRectBoard as number[];
  if (!frame || ![frame.left, frame.top, frame.width, frame.height].every(Number.isSafeInteger)
    || frame.left < 0 || frame.top < 0 || frame.width !== 512 || frame.height !== 512
    || !Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isSafeInteger)
    || rect[0]! < 0 || rect[1]! < 0 || rect[2]! <= 0 || rect[3]! <= 0
    || rect[0]! + rect[2]! > 512 || rect[1]! + rect[3]! > 512
    || !Array.isArray(boardRect) || JSON.stringify(boardRect) !== JSON.stringify([rect[0]! + frame.left, rect[1]! + frame.top, rect[2], rect[3]])) {
    throw new Error("Invalid native crop/edit rectangle");
  }
  const originalMetadata = await sharp(original).metadata();
  if (originalMetadata.width !== 3072 || originalMetadata.height !== 2048
    || JSON.stringify(placement.originalDimensions) !== JSON.stringify([3072, 2048])
    || frame.left + 512 > 3072 || frame.top + 512 > 2048) throw new Error("Static board dimensions changed");
  const inputMetadata = await sharp(input).metadata(), maskMetadata = await sharp(mask).metadata();
  if ([inputMetadata, maskMetadata].some(m => m.format !== "png" || m.width !== 512 || m.height !== 512)) throw new Error("Native512 PNG input/mask required");
  const sourceRgba = await sharp(input).ensureAlpha().raw().toBuffer();
  const originalCropRgba = await sharp(original).extract(frame).ensureAlpha().raw().toBuffer();
  if (!sourceRgba.equals(originalCropRgba)) throw new Error("Input crop differs from original board pixels");
  const maskRgba = await sharp(mask).ensureAlpha().raw().toBuffer();
  let editablePixels = 0;
  for (let p = 0; p < 512 * 512; p++) {
    const x = p % 512, y = Math.floor(p / 512), alpha = maskRgba[p * 4 + 3];
    const editable = x >= rect[0]! && x < rect[0]! + rect[2]! && y >= rect[1]! && y < rect[1]! + rect[3]!;
    if ((alpha !== 0 && alpha !== 255) || (!editable && alpha !== 255) || sourceRgba[p * 4 + 3] !== 255) throw new Error("Mask must be binary and locked outside its bounding rectangle; source must be opaque");
    if (alpha === 0) editablePixels++;
  }
  if (editablePixels !== placement.mask.transparentEditablePixels || 512 * 512 - editablePixels !== placement.mask.opaqueLockedPixels) throw new Error("Static mask counts changed");
  if (!process.argv.includes("--run")) {
    console.log(JSON.stringify({ dryRun: true, bundle: bundleDir, originalBoardSha256: hash(original), editablePixels, reserveCents: 20, model: "gpt-image-2", quality: "low", paidCalls: 0 }));
    return;
  }
  const approval = flag("continuation-approval");
  if (!approval) throw new Error("Static paid continuation requires --continuation-approval");
  const approvalBytes = readFileSync(approval);
  localEnv();
  await withBudget(async budget => {
    if (budget.held) throw new Error("Unresolved unapproved charge: no static spending");
    const dir = stageDir(flag("id"));
    recordInputs(dir, prompt, [
      { name: "input.png", bytes: input }, { name: "mask.png", bytes: mask },
      { name: "placement.json", bytes: placementBytes }, { name: "continuation-approval.json", bytes: approvalBytes },
    ], { kind: "one-time-static-board-edit", modelRequested: "gpt-image-2", quality: "low", size: "1024x1024", background: "opaque",
      originalBoardFile: originalFile, originalBoardSha256: hash(original), crop: frame, editablePixels, editRectCrop: rect,
      reserveCents: 20, attempts: 1, oneTimeAuthoringNotRecurringWorldCost: true, deterministicRestoreRequired: true });
    const { OpenAiAvatarProvider } = await import("../src/infra/generation/openai");
    const provider = new OpenAiAvatarProvider(process.env.OPENAI_API_KEY!, { model: "gpt-image-2", quality: "low", tries: 1, timeoutMs: 240000, budgetMs: 270000 });
    const answer = await budget.run(`static-edit:${flag("id")}`, 20, async () => {
      const result = await (provider as unknown as { call: (p: Record<string, unknown>) => Promise<{ png: Buffer; costCents: number; model: string; providerRequestId?: string; usage?: Record<string, number>; costUnknown?: boolean }> }).call({
        images: [{ name: "input.png", buffer: input }], mask, prompt, size: "1024x1024", quality: "low", background: "opaque", outputFormat: "png", label: flag("id"),
      });
      const u = result.usage;
      const usageValid = Boolean(u && ["inputTokens", "outputTokens", "textInputTokens", "imageInputTokens"].every(k => Number.isSafeInteger(u[k]) && u[k]! >= 0)
        && u.inputTokens === u.textInputTokens! + u.imageInputTokens! && u.outputTokens! > 0);
      return { ...result, costUnknown: Boolean(result.costUnknown || !usageValid || result.model !== "gpt-image-2") };
    });
    // Persist the paid response and bill before decoding/compositing can fail.
    writeFileSync(path.join(dir, "model-raw.png"), answer.png, { flag: "wx" });
    const { png: _png, ...bill } = answer;
    writeJson(path.join(dir, "provider-result.json"), { ...bill, outputSha256: hash(answer.png), spentCents: budget.spent, held: budget.held,
      modelProvenance: "Production adapter reports requested model, not independently exposed response model" });
    const rawMetadata = await sharp(answer.png).metadata();
    if (rawMetadata.format !== "png" || rawMetadata.width !== 1024 || rawMetadata.height !== 1024) throw new Error("Paid output persisted but has an unexpected PNG frame; do not retry automatically");
    const generatedRgba = await sharp(answer.png).resize(512, 512).ensureAlpha().raw().toBuffer();
    const restoredRgba = Buffer.from(sourceRgba);
    for (let p = 0; p < 512 * 512; p++) {
      if (maskRgba[p * 4 + 3] !== 0) continue;
      if (generatedRgba[p * 4 + 3] !== 255) throw new Error("Paid output persisted but editable pixels are transparent; no automatic promotion");
      generatedRgba.copy(restoredRgba, p * 4, p * 4, p * 4 + 4);
    }
    let changedLockedPixels = 0;
    for (let p = 0; p < 512 * 512; p++) if (maskRgba[p * 4 + 3] === 255
      && !restoredRgba.subarray(p * 4, p * 4 + 4).equals(sourceRgba.subarray(p * 4, p * 4 + 4))) changedLockedPixels++;
    if (changedLockedPixels !== 0) throw new Error("Deterministic restoration changed immutable pixels");
    const editedCrop = await sharp(restoredRgba, { raw: { width: 512, height: 512, channels: 4 } }).png().toBuffer();
    writeFileSync(path.join(dir, "edited-crop.png"), editedCrop, { flag: "wx" });
    writeJson(path.join(dir, "result.json"), { ...bill, outputSha256: hash(answer.png), editedCropSha256: hash(editedCrop), restoredRgbaSha256: hash(restoredRgba),
      originalBoardSha256: hash(original), crop: frame, editRectCrop: rect, editablePixels, changedLockedPixels,
      status: "rendered-static-crop-awaiting-visual-review", automaticRelease: false, oneTimeAuthoringNotRecurringWorldCost: true,
      spentCents: budget.spent, held: budget.held });
    console.log(JSON.stringify({ dir, costCents: answer.costCents, costUnknown: answer.costUnknown, editablePixels, changedLockedPixels, spentCents: budget.spent, held: budget.held }));
  });
}

/** Mask is guidance only. A separate deterministic compositor restores immutable pixels. */
async function personalize() {
  assertId(flag("id"));
  if (flag("quality", "medium") !== "medium") throw new Error("User policy: MEDIUM only");
  if (!process.argv.includes("--run")) throw new Error("Paid step requires --run");
  const planFile = flag("plan");
  if (!planFile) throw new Error("Explicit frozen --plan required");
  const planBytes = readFileSync(planFile);
  const plan = JSON.parse(planBytes.toString("utf8"));
  const { fixedTemplateRecipeSchema, fixedTemplateRecipeSha256, sha256TemplateMask } = await import("../src/services/generation/fixed-template");
  const { sha256Rgba } = await import("../src/services/generation/fixed-sprite");
  const template = readFileSync(plan.templateFile), mask = readFileSync(plan.maskFile);
  const decoded = await sharp(template).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const maskDecoded = await sharp(mask).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const recipe = fixedTemplateRecipeSchema.parse(plan.recipe);
  const boardMetadata = await sharp(readFileSync(plan.boardFile)).metadata();
  if (decoded.info.width !== 1024 || decoded.info.height !== 1024 || maskDecoded.info.width !== 1024 || maskDecoded.info.height !== 1024) throw new Error("Expected original 1024 square template/mask");
  if (recipe.template.width !== decoded.info.width || recipe.template.height !== decoded.info.height
      || recipe.editableMask.width !== maskDecoded.info.width || recipe.editableMask.height !== maskDecoded.info.height
      || recipe.board.width !== boardMetadata.width || recipe.board.height !== boardMetadata.height) throw new Error("Frozen recipe frame does not match decoded inputs: refusing payment");
  const binary = new Uint8Array(1024 * 1024);
  for (let p = 0; p < binary.length; p++) {
    const alpha = maskDecoded.data[p * 4 + 3];
    if (alpha !== 0 && alpha !== 255) throw new Error("API mask must have binary alpha");
    binary[p] = alpha === 0 ? 1 : 0;
  }
  if (fixedTemplateRecipeSha256(plan.recipe) !== plan.recipeSha256
      || sha256Rgba(decoded.data, 1024, 1024) !== plan.recipe.template.rgbaSha256
      || sha256TemplateMask({ data: binary, width: 1024, height: 1024 }) !== plan.recipe.editableMask.sha256
      || hash(readFileSync(plan.boardFile)) !== plan.recipe.board.sha256) throw new Error("Frozen template inputs changed: refusing payment");
  const prompt = readFileSync(plan.promptFile, "utf8");
  const images = [{ name: "template.png", bytes: template }, { name: "identity.png", bytes: readFileSync(plan.identityFile) }, { name: "style.png", bytes: readFileSync(plan.styleFile) }];
  for (const item of images) if (hash(item.bytes) !== plan.inputHashes[item.name]) throw new Error(`Changed input: ${item.name}`);
  if (hash(prompt) !== plan.promptSha256) throw new Error("Changed frozen prompt");
  localEnv();
  await withBudget(async budget => {
    if (budget.held) throw new Error("Unresolved prior charge: no further spending");
    const dir = stageDir(flag("id"));
    recordInputs(dir, prompt, [...images, { name: "mask.png", bytes: mask }, { name: "plan.json", bytes: planBytes }], { kind: "fixed-template-personalization", modelRequested: POLICY.imageModel, quality: "medium", size: "1024x1024", background: "transparent", inputOrder: ["template", "identity", "board-style"], maskAppliesTo: "template", planSha256: hash(planBytes), deterministicRestoreRequired: true, reserveCents: 25 });
    const { OpenAiAvatarProvider } = await import("../src/infra/generation/openai");
    const provider = new OpenAiAvatarProvider(process.env.OPENAI_API_KEY!, { model: POLICY.imageModel, quality: "medium", tries: 1, timeoutMs: 240000, budgetMs: 270000 });
    const answer = await budget.run(`personalize:${flag("id")}`, 25, async () => {
      const result = await (provider as unknown as { call: (p: Record<string, unknown>) => Promise<{ png: Buffer; costCents: number; model: string; providerRequestId?: string; usage?: Record<string, number>; costUnknown?: boolean }> }).call({ images: images.map(f => ({ name: f.name, buffer: f.bytes })), mask, prompt, size: "1024x1024", quality: "medium", background: "transparent", outputFormat: "png", label: flag("id") });
      const u = result.usage;
      const valid = Boolean(u && ["inputTokens", "outputTokens", "textInputTokens", "imageInputTokens"].every(k => Number.isInteger(u[k]) && u[k]! >= 0) && u.inputTokens === u.textInputTokens! + u.imageInputTokens!);
      return { ...result, costUnknown: Boolean(result.costUnknown || !valid) };
    });
    writeFileSync(path.join(dir, "sheet.png"), answer.png, { flag: "wx" });
    await sharp(answer.png).flatten({ background: "#8a8a8a" }).png().toFile(path.join(dir, "on-grey.png"));
    const { png: _png, ...bill } = answer;
    writeJson(path.join(dir, "result.json"), { ...bill, outputSha256: hash(answer.png), modelProvenance: "Production adapter reports requested model, not independently exposed response model", spentCents: budget.spent, held: budget.held });
    console.log(JSON.stringify({ dir, costCents: answer.costCents, costUnknown: answer.costUnknown, spentCents: budget.spent, held: budget.held }));
  });
}

async function judge() {
  if (!process.argv.includes("--run")) throw new Error("Paid step requires --run");
  const caseFile = flag("case");
  const c = JSON.parse(readFileSync(caseFile, "utf8")) as { patch: string; composite: string; identity: string; childName: string; ageYears: number; recipe: import("../src/infra/generation/types").JudgeRecipe; expectedChecks?: Record<string, string>; provenance: { manifestFile: string; contractHash: string; contextSha256: string } };
  if (!c.patch || !c.composite || !c.identity || !c.recipe || !c.provenance) throw new Error("Complete final-composite case and provenance required");
  const manifest = JSON.parse(readFileSync(c.provenance.manifestFile, "utf8"));
  const planPath = path.join(path.dirname(path.dirname(c.provenance.manifestFile)), "plan.json");
  const planBytes = readFileSync(planPath), plan = JSON.parse(planBytes.toString());
  const { sha256Rgba } = await import("../src/services/generation/fixed-sprite");
  const patchRaw = await sharp(c.patch).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (hash(readFileSync(c.composite)) !== c.provenance.contextSha256
    || hash(JSON.stringify(manifest.contract)) !== c.provenance.contractHash
    || manifest.contractSha256 !== c.provenance.contractHash
    || hash(planBytes) !== manifest.planSha256
    || hash(JSON.stringify(plan.contract)) !== c.provenance.contractHash
    || hash(readFileSync(plan.boardFile)) !== manifest.contract.board.sha256
    || hash(readFileSync(plan.spriteFile)) !== manifest.sourceFileSha256
    || sha256Rgba(patchRaw.data, patchRaw.info.width, patchRaw.info.height) !== manifest.composite.rgbaSha256) {
    throw new Error("Judge evidence differs from its frozen plan/manifest; refusing payment");
  }
  localEnv();
  await withBudget(async budget => {
    if (budget.held) throw new Error("Unresolved prior charge: no retries or further spending");
    const dir = stageDir(flag("id"));
    const { OpenAiPatchJudge } = await import("../src/infra/generation/judge");
    const { boardJudgePrompt, boardJudgeReserveCents, BOARD_JUDGE_MODEL } = await import("../src/infra/generation/board-verdict");
    if (BOARD_JUDGE_MODEL !== POLICY.judgeModel) throw new Error("Pinned judge model changed");
    const patchPng = readFileSync(c.patch), boardCrop = readFileSync(c.composite), reference = readFileSync(c.identity);
    const wireIdentity = await sharp(reference).resize(512, 512, { fit: "inside" }).png().toBuffer();
    const prompt = boardJudgePrompt(c.childName, c.ageYears, c.recipe);
    recordInputs(dir, prompt, [{ name: "patch.png", bytes: patchPng }, { name: "composite.png", bytes: boardCrop }, { name: "identity-wire.png", bytes: wireIdentity }], { kind: "judge", case: c, caseSha256: hash(readFileSync(caseFile)), expectedChecksNotSentToJudge: c.expectedChecks });
    const reviewer = new OpenAiPatchJudge(process.env.OPENAI_API_KEY!, { policy: "strong", tries: 1, timeoutMs: 240000 });
    const extra = Math.max(0, Buffer.byteLength(prompt) - Buffer.byteLength(boardJudgePrompt(c.childName))) * 500 / 1_000_000;
    const result = await budget.run(`judge:${flag("id")}`, boardJudgeReserveCents(c.childName) + extra, async () => {
      const r = await reviewer.reviewWith({ patchPng, boardCrop, reference, childName: c.childName, ageYears: c.ageYears, label: flag("id"), recipe: c.recipe }, POLICY.judgeModel);
      for (const [i, image] of (r.wireImages ?? []).entries()) writeFileSync(path.join(dir, `wire-${i + 1}.png`), image, { flag: "wx" });
      const { wireImages: _wire, ...compact } = r;
      return compact;
    });
    writeJson(path.join(dir, "result.json"), { ...result, visualChecksPassed: result.verdict === "ok" && Object.values(result.checks ?? {}).length === 7 && Object.values(result.checks ?? {}).every(v => v === "pass") && !result.costUnknown, geometryPassed: manifest.ok === true, automaticRelease: false, releasePolicy: "Research only: a visual verdict never overrides geometry or releases a game", spentCents: budget.spent, held: budget.held });
    console.log(JSON.stringify({ dir, verdict: result.verdict, checks: result.checks, reason: result.reason, costCents: result.costCents, spentCents: budget.spent, held: budget.held }));
  });
}

async function observe() {
  if (!process.argv.includes("--run")) throw new Error("Paid step requires --run");
  const sourceFile = flag("source");
  if (!sourceFile) throw new Error("Explicit --source required");
  const source = readFileSync(sourceFile);
  const m = await sharp(source).metadata();
  if (m.width !== 1024 || m.height !== 1024 || m.format !== "png") throw new Error("Observer accepts the original 1024x1024 PNG only");
  const { OpenAiSpriteLandmarkObserver, spriteLandmarkPrompt, SPRITE_LANDMARK_MODEL } = await import("../src/infra/generation/sprite-landmarks");
  if (SPRITE_LANDMARK_MODEL !== POLICY.judgeModel) throw new Error("Observer model pin differs from approved policy");
  const wire = await sharp(source).flatten({ background: { r: 130, g: 130, b: 130 } }).png().toBuffer();
  localEnv();
  await withBudget(async budget => {
    if (budget.held) throw new Error("Unresolved prior charge: no further spending");
    const dir = stageDir(flag("id"));
    recordInputs(dir, spriteLandmarkPrompt("seated"), [{ name: "source.png", bytes: source }, { name: "wire.png", bytes: wire }], { kind: "source-landmarks", model: POLICY.judgeModel, effort: POLICY.judgeEffort, sourceFile, noBoardOrManualCoordinatesSent: true, reserveCents: 30 });
    const observer = new OpenAiSpriteLandmarkObserver(process.env.OPENAI_API_KEY!);
    const result = await budget.run(`observe:${flag("id")}`, 30, () => observer.observe(source, "seated"));
    const { wirePng: _wire, ...compact } = result;
    writeJson(path.join(dir, "result.json"), { ...compact, wireMatchesRecordedInput: result.wireImage.sha256 === hash(wire), spentCents: budget.spent, held: budget.held });
    console.log(JSON.stringify({ dir, status: result.status, approved: result.approved, reason: result.reason, costCents: result.costCents, costUnknown: result.costUnknown, spentCents: budget.spent, held: budget.held }));
  });
}

async function observePose() {
  assertId(flag("id"));
  if (!process.argv.includes("--run")) throw new Error("Paid step requires --run");
  const sourceFile = flag("source");
  if (!sourceFile) throw new Error("Explicit original --source required");
  const evidence = knownImageEvidence(sourceFile), source = evidence.bytes;
  if (PAIRED_LOW) {
    const { validateLowPairRequest } = await import("./fixed-quality-policy");
    const d = path.dirname(sourceFile);
    await validateLowPairRequest(JSON.parse(evidence.requestBytes.toString("utf8")), { prompt: readFileSync(path.join(d, "prompt.txt")), style: readFileSync(path.join(d, "style.png")), identity: readFileSync(path.join(d, "identity.png")) });
  }
  if (LOW_CONTINUATION) {
    const d = path.dirname(sourceFile);
    await validateLowContinuationRequest(JSON.parse(evidence.requestBytes.toString("utf8")), { prompt: readFileSync(path.join(d, "prompt.txt")), style: readFileSync(path.join(d, "style.png")), identity: readFileSync(path.join(d, "identity.png")) });
  }
  const m = await sharp(source).metadata();
  if (m.width !== 1024 || m.height !== 1024 || m.format !== "png") throw new Error("Original 1024 square source required");
  const { OpenAiPoseObserver, poseObserverPrompt, POSE_OBSERVER_MODEL } = await import("../src/infra/generation/pose-observer");
  if (POSE_OBSERVER_MODEL !== POLICY.judgeModel) throw new Error("Observer pin differs from approved policy");
  const wire = await sharp(source).flatten({ background: { r: 130, g: 130, b: 130 } }).png().toBuffer();
  localEnv();
  await withBudget(async budget => {
    if (budget.held) throw new Error("Unresolved prior charge: no further spending");
    const dir = stageDir(flag("id"));
    recordInputs(dir, poseObserverPrompt("standing"), [{ name: "source.png", bytes: source }, { name: "wire.png", bytes: wire }, { name: "source-receipt.json", bytes: evidence.receiptBytes }, { name: "source-request.json", bytes: evidence.requestBytes }], { kind: "visible-pose-observation", model: POLICY.judgeModel, effort: "high", sourceFile, sourceReceiptSha256: hash(evidence.receiptBytes), noBoardIdentityOrManualCoordinatesSent: true, reserveCents: 30, observerCodeSha256: hash(readFileSync("src/infra/generation/pose-observer.ts")) });
    const result = await budget.run(`observe-pose:${flag("id")}`, 30, () => new OpenAiPoseObserver(process.env.OPENAI_API_KEY!).observe(source, "standing"));
    const { wirePng: _wire, ...compact } = result;
    writeJson(path.join(dir, "result.json"), { ...compact, wireMatchesRecordedInput: result.wireImage.sha256 === hash(wire), spentCents: budget.spent, held: budget.held });
    console.log(JSON.stringify({ dir, status: result.status, measurementApproved: result.approved, reason: result.reason, derived: result.derived, costCents: result.costCents, costUnknown: result.costUnknown, spentCents: budget.spent, held: budget.held }));
  });
}

/** New v3 review protocol: replay frozen evidence for free before any dispatch. */
async function judgePose() {
  const { validateFixedPoseReviewCase } = await import("./fixed-pose-evidence");
  const verified = await validateFixedPoseReviewCase(flag("case"), { allowGeometryFailure: process.argv.includes("--allow-geometry-failure") });
  if (verified.sourceImageQuality !== POLICY.imageQuality || verified.researchMode !== (LOW_CONTINUATION ? "low-continuation" : PAIRED_LOW ? "paired-low" : "medium")) throw new Error("Review run policy/ledger differs from reconstructed source and experiment context");
  if (!process.argv.includes("--run")) {
    console.log(JSON.stringify({ dryRun: true, geometryPassed: verified.manifest.ok, evidence: verified.evidence, paidCalls: 0 }));
    return;
  }
  assertId(flag("id"));
  const c = verified.caseData;
  const { OpenAiPatchJudge } = await import("../src/infra/generation/judge");
  const { boardJudgePrompt, boardJudgeReserveCents, BOARD_JUDGE_MODEL } = await import("../src/infra/generation/board-verdict");
  if (BOARD_JUDGE_MODEL !== POLICY.judgeModel) throw new Error("Pinned judge changed");
  const prompt = boardJudgePrompt(c.childName, c.ageYears, c.recipe);
  const reserve = boardJudgeReserveCents(c.childName) + Math.max(0, Buffer.byteLength(prompt) - Buffer.byteLength(boardJudgePrompt(c.childName))) * 500 / 1_000_000;
  localEnv();
  await withBudget(async budget => {
    if (budget.held) throw new Error("Unresolved prior charge: no retries or further spending");
    const dir = stageDir(flag("id"));
    recordInputs(dir, prompt, [
      { name: "native-visible.png", bytes: verified.nativePng },
      { name: "board-patch.png", bytes: verified.patchPng },
      { name: "context.png", bytes: verified.boardCrop },
      { name: "identity.png", bytes: verified.reference },
      { name: "evidence.json", bytes: Buffer.from(JSON.stringify(verified.evidence, null, 2)) },
    ], { kind: "fixed-pose-final-composite-review", protocol: "fixed-pose-review/v1", sourceCase: c, reserveCents: reserve,
      wirePolicy: "final-board-context plus native-foreground-masked-player-sprite plus full-identity-sheet; provider resizing recorded in wire files",
      changeFromHistoricalSeatReview: "detail image is native player asset, not an upsampled board-resolution patch; do not pool verdict rates across protocols",
      expectedChecksAndControlLabelsNotSent: true,
      validationCodeSha256: hash(readFileSync("scripts/fixed-pose-evidence.ts")),
    });
    const reviewer = new OpenAiPatchJudge(process.env.OPENAI_API_KEY!, { policy: "strong", tries: 1, timeoutMs: 240000 });
    const result = await budget.run(`judge-pose:${flag("id")}`, reserve, async () => {
      const r = await reviewer.reviewWith({ patchPng: verified.nativePng, boardCrop: verified.boardCrop, reference: verified.reference,
        childName: c.childName, ageYears: c.ageYears, label: flag("id"), recipe: c.recipe }, POLICY.judgeModel);
      for (const [i, bytes] of (r.wireImages ?? []).entries()) writeFileSync(path.join(dir, `wire-${i + 1}.png`), bytes, { flag: "wx" });
      const { wireImages: _wire, ...rest } = r;
      return rest;
    });
    const allVisualChecksPassed = result.costUnknown === false && result.verdict === "ok" && Object.keys(result.checks ?? {}).length === 7 && Object.values(result.checks ?? {}).every(v => v === "pass");
    writeJson(path.join(dir, "result.json"), { ...result, visualChecksPassed: allVisualChecksPassed, geometryPassed: verified.manifest.ok,
      automaticRelease: false, releasePolicy: "Research only. Neither a model verdict nor geometry alone releases a game.",
      evidence: verified.evidence, spentCents: budget.spent, held: budget.held });
    console.log(JSON.stringify({ dir, verdict: result.verdict, checks: result.checks, reason: result.reason, geometryPassed: verified.manifest.ok,
      costCents: result.costCents, costUnknown: result.costUnknown, spentCents: budget.spent, held: budget.held }));
  });
}

/** One-time source-blind board calibration, not recurring child generation or an approval judge. */
async function measureBoard() {
  assertId(flag("id"));
  if (!process.argv.includes("--run")) throw new Error("Paid step requires --run");
  const boardPath = "public/scenes/antarctica/refresh-20260907/base.webp";
  const board = readFileSync(boardPath);
  const windows = [{ id: "snow-ground", left: 780, top: 850, width: 600, height: 530 }, { id: "cargo", left: 1160, top: 430, width: 440, height: 430 }];
  const files = [{ name: "board.png", bytes: await sharp(board).resize(1536, 1024).png().toBuffer() }, ...await Promise.all(windows.map(async w => ({ name: `${w.id}.png`, bytes: await sharp(board).extract({ left: w.left, top: w.top, width: w.width, height: w.height }).png().toBuffer() })))];
  const prompt = `One-time illustrated hidden-object BOARD measurement, NOT a render judge. You see ONLY original board artwork, no inserted child, desired dimensions, expected measurements or source sprite. Image1 is the full board reduced from3072x2048 to1536x1024 for context. Image2 is a native600x530 crop whose original board origin is(780,850); image3 is a native440x430 crop whose origin is(1160,430). Coordinates requested below are LOCAL PIXELS within image2 or image3, not normalized and not fullboard coordinates.

For each of image2 and image3, select up to THREE existing fully visible UPRIGHT STANDING children close to the depth of the central snow strip(image2) or the large wooden cargo stack(image3). Clearly distinguish children from adults and different depth planes. Do not use sitting, strongly crouching, airborne, cut-off or foot-occluded comparators. A mild natural lean or relaxed knees is acceptable only if you explicitly note it. You may return fewer or zero comparators rather than inventing anatomy.

For EACH comparator, describe its jacket/hat/location so it is unambiguously findable. Measure the midpoint of its two visible pupil centres, the visible underside of its chin(excluding neck/collar), and the TWO lowest visible supporting boot/foot sole contacts. For flat sole edges use their midpoint. Give each point an independent confidence0..1 and reason. Hidden/ambiguous points must have point:null; never infer skull top or hidden legs. Do not use an exaggerated hat or hairstyle to measure face size. The body extent for later calculation is eye-midpoint to the midpoint of the two soles. Do NOT calculate a desired inserted-child size, move a slot or approve any game. We will calculate all distances independently from your coordinates and inspect them.

Return JSON with {regions:[{image:2|3, comparators:[{id:string, description:string, ageClass:'child'|'adult'|'uncertain', sameDepthConfidence:number, posture:string, uprightSuitable:boolean, points:{eyeMidpoint:{point:{x:number,y:number}|null,confidence:number,reason:string},chin:{point:{x:number,y:number}|null,confidence:number,reason:string},leftSole:{point:{x:number,y:number}|null,confidence:number,reason:string},rightSole:{point:{x:number,y:number}|null,confidence:number,reason:string}},notes:string}],uncertainties:string}],summary:string}. No figures invented or added. Pixel coordinates must lie within the respective crop. Names left/right refer to the depicted person's anatomical sides. This is source-blind measurement evidence only; self-confidence is not calibrated correctness.`;
  localEnv();
  await withBudget(async budget => {
    if (budget.held) throw new Error("Unresolved prior cost");
    const dir = stageDir(flag("id"));
    recordInputs(dir, prompt, files, { kind: "one-time-original-board-measurement", model: POLICY.judgeModel, effort: "high", boardPath, boardSha256: hash(board), windows, noChildSourceOrDesiredMeasurementsSent: true, reserveCents: 35 });
    const { judgeCharge } = await import("../src/infra/generation/judge");
    const answer = await budget.run(`board-measure:${flag("id")}`, 35, async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 240000);
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", redirect: "error", signal: controller.signal, headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: POLICY.judgeModel, reasoning_effort: "high", max_completion_tokens: 8000, service_tier: "default", store: false, response_format: { type: "json_object" }, messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...files.map(f => ({ type: "image_url", image_url: { url: `data:image/png;base64,${f.bytes.toString("base64")}`, detail: "high" } }))] }] }) });
        const wire = await response.text();
        let data;
        try { data = JSON.parse(wire); } catch { return { costCents: 0, costUnknown: true, status: "unreadable-response", httpStatus: response.status, requestId: response.headers.get("x-request-id") }; }
        const bill = judgeCharge(data.model ?? "", data.usage);
        const usageValid = data.usage && Number.isSafeInteger(data.usage.prompt_tokens) && data.usage.prompt_tokens > 0 && Number.isSafeInteger(data.usage.completion_tokens) && data.usage.completion_tokens > 0 && data.usage.total_tokens === data.usage.prompt_tokens + data.usage.completion_tokens;
        const known = !bill.costUnknown && usageValid && data.model === POLICY.judgeModel && (!data.service_tier || data.service_tier === "default");
        const content = data.choices?.[0]?.message?.content;
        let measurement = null;
        try { measurement = JSON.parse(content ?? ""); } catch { /* Keep bill; invalid semantic response is not free. */ }
        return { ...bill, costUnknown: !known, status: response.ok && data.choices?.length === 1 && data.choices[0].finish_reason === "stop" && !data.choices[0].message?.refusal && measurement ? "measured-not-approved" : "invalid-response", requestId: response.headers.get("x-request-id"), responseId: data.id, httpStatus: response.status, model: data.model, serviceTier: data.service_tier, rawUsage: data.usage, responseText: content, measurement, costBasis: "conservative-upper-estimate", attempts: 1 };
      } finally { clearTimeout(timer); }
    });
    writeJson(path.join(dir, "result.json"), { ...answer, spentCents: budget.spent, held: budget.held, automaticRelease: false });
    console.log(JSON.stringify({ dir, status: answer.status, costCents: answer.costCents, costUnknown: answer.costUnknown, spentCents: budget.spent, held: budget.held }));
  });
}

const command = process.argv[2];
if ((PAIRED_LOW || LOW_CONTINUATION) && !["generate", "observe-pose", "judge-pose", ...(LOW_CONTINUATION ? ["static-edit"] : [])].includes(command ?? "")) throw new Error("LOW authorization is limited to image, source observation, final-composite review and approved one-time static edit");
({ prepare, generate, personalize, judge, observe, "static-edit": staticEdit, "observe-pose": observePose, "judge-pose": judgePose, "measure-board": measureBoard }[command ?? ""] as (() => Promise<void>) | undefined)?.().catch(err => { console.error(err instanceof Error ? err.message : String(err)); process.exitCode = 1; });
if (!["prepare", "generate", "personalize", "judge", "observe", "static-edit", "observe-pose", "judge-pose", "measure-board"].includes(command ?? "")) { console.error("Commands: prepare | generate --run | static-edit --low-pilot [--run] | personalize --run | judge --run | observe --run | observe-pose --run | judge-pose [--run] | measure-board --run"); process.exitCode = 1; }
