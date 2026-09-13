import sharp from "sharp";
import type { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { CURRENT_JUDGE_PRICING_VERSION, judgeCharge } from "../../infra/generation/judge";
import { assertGenerationSpendAllowed, boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { LocalPatchRetainedPurchaseStore, fenceLocalPatchImages } from "./local-patch-lifecycle";
import { purchaseOnce } from "./paid-operation";
import { sha256Bytes } from "./fixed-sprite";
import { LOCAL_PATCH_JUDGE, isTheModelWeAsked, localPatchBoardJudgeImages, localPatchBoardJudgePrompt,
  localPatchQualityDisposition, parseLocalPatchBoardVerdicts, requestJudgeWire,
  type LocalPatchBoardJudgeRequest, type LocalPatchJudgeResult } from "./local-patch-judge";
import type { BudgetJson, WorldChargeEvidence } from "./world-budget";

export const LOCAL_PATCH_REPAIR_REVIEW_VERSION = "paid-repair-canonical-face-sol-low/v1";
/** Conservative reservation, NOT a provider invoice or a promised actual price.
 * Two bounded reviews reserve $1 in the SAME existing $4 world. An unexpected
 * provider overrun is recorded by the ledger and holds publication as usual. */
export const LOCAL_PATCH_REPAIR_REVIEW_RESERVE_MICRO_USD = 500_000;
export const LOCAL_PATCH_REPAIR_REVIEW_SETTINGS = Object.freeze({ ...LOCAL_PATCH_JUDGE,
  model: "gpt-5.6-sol", effort: "low" as const, maxOutputTokens: 3000 });
const hash = (value: unknown) => sha256Bytes(Buffer.from(JSON.stringify(value)));
const demand: (value: unknown, message: string) => asserts value = (value, message) => {
  if (!value) throw new Error(`LOCAL_PATCH_REPAIR_REVIEW: ${message}`);
};
export type LocalPatchRepairFaceRoi = {
  hideId: string; rect: { left: number; top: number; width: number; height: number };
};
export type LocalPatchRepairReviewInput = {
  gameId: string; batchId: string; batchSha256: string; request: LocalPatchBoardJudgeRequest;
  /** Native coordinates in that hide's serial AFTER context, never resized. */
  faceRois: readonly LocalPatchRepairFaceRoi[];
};
export type PreparedLocalPatchRepairReview = {
  gameId: string; batchId: string; batchSha256: string; boardId: string;
  requestKey: string; operationFingerprint: string; prompt: string;
  images: readonly Buffer[]; wireHashes: readonly string[]; hideIds: readonly string[];
  faceRois: readonly LocalPatchRepairFaceRoi[];
};

/** Pure preparation: the caller freezes this key in its authenticated repair
 * batch/inventory BEFORE permitting any purchase. No image or judge is called. */
export async function prepareLocalPatchRepairReview(input: LocalPatchRepairReviewInput): Promise<PreparedLocalPatchRepairReview> {
  demand(/^[a-zA-Z0-9_-]{1,100}$/.test(input.gameId) && /^[a-zA-Z0-9_-]{1,100}$/.test(input.batchId)
    && /^[a-f0-9]{64}$/.test(input.batchSha256), "Invalid immutable repair batch identity");
  demand(input.request.contentVersion === 8 && /^[a-z0-9-]{1,50}$/.test(input.request.boardId), "Only strict v8 repair review is supported");
  demand(input.faceRois.length === 1, "Exactly one selected corrected face is required per board");
  const roi = input.faceRois[0]!, chosen = input.request.hides.find(hide => hide.hideId === roi.hideId);
  demand(chosen, "Selected corrected face is not one of the five reviewed hides");
  const r = roi.rect;
  demand(Object.values(r).every(Number.isSafeInteger) && r.left >= 0 && r.top >= 0 && r.width >= 30 && r.height >= 30,
    "Selected face must have at least 30 by 30 native pixels");
  const meta = await sharp(chosen.afterPng, { limitInputPixels: 4_194_304 }).metadata();
  demand(meta.format === "png" && (meta.pages ?? 1) === 1 && meta.width && meta.height
    && r.left + r.width <= meta.width && r.top + r.height <= meta.height, "Face ROI is outside the actual serial AFTER image");
  const nativeFace = await sharp(chosen.afterPng).extract(r).png().toBuffer();
  demand(chosen.afterEvidencePng?.length, "Existing context and head evidence is missing");
  const evidenceMeta = await sharp(chosen.afterEvidencePng, { limitInputPixels: 4_194_304 }).metadata();
  demand(evidenceMeta.width && evidenceMeta.height, "Invalid native AFTER evidence");
  const expanded = await sharp({ create: { width: evidenceMeta.width + 24 + r.width,
    height: Math.max(evidenceMeta.height, r.height), channels: 4, background: "white" } }).composite([
    { input: chosen.afterEvidencePng, left: 0, top: 0 }, { input: nativeFace, left: evidenceMeta.width + 24, top: 0 },
  ]).png().toBuffer();
  const request = { ...input.request, hides: input.request.hides.map(hide => hide.hideId === roi.hideId ? { ...hide, afterEvidencePng: expanded } : hide) };
  const images = localPatchBoardJudgeImages(request).map(image => Buffer.from(image));
  demand(images.length === 12, "Exactly twelve images are required");
  let pixels = 0, bytes = 0;
  for (const image of images) {
    const m = await sharp(image, { limitInputPixels: 4_194_304 }).metadata();
    demand(m.format === "png" && (m.pages ?? 1) === 1 && m.width && m.height && m.width <= 2048 && m.height <= 2048,
      "Repair evidence exceeds its bounded native raster contract");
    pixels += m.width * m.height; bytes += image.length;
  }
  demand(pixels <= 24_000_000 && bytes <= 24_000_000, "Repair evidence exceeds its total input bound");
  const prompt = `${localPatchBoardJudgePrompt(request)} REPAIR REVIEW ${LOCAL_PATCH_REPAIR_REVIEW_VERSION}. `
    + `The selected corrected hide is ${roi.hideId}. Its AFTER has an additional FAR-RIGHT native face-only panel, ${r.width} by ${r.height} source pixels, without upsampling; this repeats the same face, not another child. `
    + "A coherent generic child is NOT sufficient. Require recognizably the SAME canonical illustrated child: compare eye spacing/shape, nose and mouth proportions, cheek/jaw silhouette, hairline and curl silhouette. "
    + "A readable but clearly different generic face fails faceLikeness. If the pixels cannot establish that this is recognizably the canonical child, use faceLikeness unsure, never pass merely because a child is present. "
    + "Judge face readability at native scale and ordinary game zoom, not imagined detail. Preserve clothing/light/pose freedom. Inspect the entire join around the child's hair/body as well as the face panel. "
    + "All three severe checks must explicitly pass for ALL FIVE hides. A sibling failure or uncertainty blocks this repair batch too; never request an image purchase or assume an operator approved these images.";
  demand(prompt.length <= 16_000, "Repair prompt exceeds its input bound");
  const wireHashes = images.map(sha256Bytes), faceRois = input.faceRois.map(face => ({ hideId: face.hideId, rect: { ...face.rect } }));
  const operationFingerprint = hash({ version: LOCAL_PATCH_REPAIR_REVIEW_VERSION, gameId: input.gameId, batchId: input.batchId,
    batchSha256: input.batchSha256, boardId: request.boardId, settings: LOCAL_PATCH_REPAIR_REVIEW_SETTINGS,
    pricingVersion: CURRENT_JUDGE_PRICING_VERSION, prompt, wireHashes, faceRois, hideIds: request.hides.map(hide => hide.hideId) });
  return { gameId: input.gameId, batchId: input.batchId, batchSha256: input.batchSha256, boardId: request.boardId,
    requestKey: `repair:${input.batchId}:${request.boardId}:${operationFingerprint}`, operationFingerprint,
    prompt, images, wireHashes, hideIds: request.hides.map(hide => hide.hideId), faceRois };
}

export type LocalPatchRepairReviewOutcome = {
  state: "pass" | "blocked" | "pending" | "held"; reason: string | null; replayed: boolean;
  version: typeof LOCAL_PATCH_REPAIR_REVIEW_VERSION; requestKey: string; operationFingerprint: string;
  wireHashes: readonly string[]; raw: string | null; wireFault: string | null;
  verdicts: ReturnType<typeof parseLocalPatchBoardVerdicts> | null; evidence: WorldChargeEvidence | null;
};
export type LocalPatchRepairReviewDeps = {
  /** Must authenticate the immutable staged batch AND the current worker lease. */
  fence(tx: Prisma.TransactionClient): Promise<void>;
  apiKey?: string; deadlineAt?: number;
  judge?(request: { prompt: string; images: readonly Buffer[]; settings: typeof LOCAL_PATCH_REPAIR_REVIEW_SETTINGS; timeoutMs: number }): Promise<LocalPatchJudgeResult>;
};

/** Review-only: no target/scene/publication writes and no image provider exists
 * in this function. All five answers return to the caller's atomic batch gate. */
export async function reviewLocalPatchRepair(c: Container, prepared: PreparedLocalPatchRepairReview,
  deps: LocalPatchRepairReviewDeps): Promise<LocalPatchRepairReviewOutcome> {
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "Durable QA repair storage is required");
  demand(deps.judge || deps.apiKey?.trim(), "Existing judge credential required");
  demand(prepared.images.length === 12 && prepared.images.every((image, index) => sha256Bytes(image) === prepared.wireHashes[index]), "Prepared wire evidence changed");
  const fingerprint = hash({ version: LOCAL_PATCH_REPAIR_REVIEW_VERSION, gameId: prepared.gameId, batchId: prepared.batchId,
    batchSha256: prepared.batchSha256, boardId: prepared.boardId, settings: LOCAL_PATCH_REPAIR_REVIEW_SETTINGS,
    pricingVersion: CURRENT_JUDGE_PRICING_VERSION, prompt: prepared.prompt, wireHashes: prepared.wireHashes,
    faceRois: prepared.faceRois, hideIds: prepared.hideIds });
  demand(fingerprint === prepared.operationFingerprint && prepared.requestKey === `repair:${prepared.batchId}:${prepared.boardId}:${fingerprint}`, "Prepared repair question changed");
  const game = await c.db.game.findUniqueOrThrow({ where: { id: prepared.gameId } });
  demand(game.ownerId && !game.deletedAt && game.styleVersion === "local-patch-world-v1"
    && ["GENERATION_FAILED", "TARGETS_GENERATING"].includes(game.status), "Repair game is not live and unpublished");
  const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(game.id);
  const fenced = () => c.db.$transaction(async tx => { await fenceLocalPatchImages(tx, game.id); await deps.fence(tx); });
  await fenced();
  await assertGenerationSpendAllowed(c, game.ownerId);
  const deadlineAt = deps.deadlineAt ?? Date.now() + 270_000;
  const bought = await purchaseOnce({ ledger: budget, store: new LocalPatchRetainedPurchaseStore(c, game.id, budget) }, {
    worldId, requestKey: prepared.requestKey, scope: "judge", operationFingerprint: fingerprint,
    reserveMicroUsd: LOCAL_PATCH_REPAIR_REVIEW_RESERVE_MICRO_USD,
    dispatchWindow: { deadlineAt, needMs: 20_000, retainMs: 10_000 },
    buy: async ({ timeoutMs }) => {
      const remainingMs = deadlineAt - Date.now() - 10_000;
      demand(remainingMs > 0, "Repair dispatch deadline expired after its ownership fence; reservation needs reconciliation");
      const request = { prompt: prepared.prompt, images: prepared.images, settings: LOCAL_PATCH_REPAIR_REVIEW_SETTINGS,
        timeoutMs: Math.min(timeoutMs ?? LOCAL_PATCH_REPAIR_REVIEW_SETTINGS.timeoutMs, LOCAL_PATCH_REPAIR_REVIEW_SETTINGS.timeoutMs, remainingMs) };
      const reply = await (deps.judge ?? (wire => { demand(deps.apiKey?.trim(), "Existing judge credential required"); return requestJudgeWire(deps.apiKey!, wire, fetch); }))(request);
      const keep = { raw: reply.raw, usage: reply.usage, requestId: reply.requestId, model: reply.model,
        finishReason: reply.finishReason, wireFault: reply.wireFault, costUnknown: reply.costUnknown };
      const bytes = Buffer.from(JSON.stringify(keep)), charge = judgeCharge(reply.model ?? "", reply.usage ?? undefined, CURRENT_JUDGE_PRICING_VERSION);
      if (reply.costUnknown || charge.costUnknown || !reply.requestId) return { bytes, unknownReason: "Repair review charge cannot be verified" };
      return { bytes, evidence: { providerNamespace: "openai:find-me-existing", providerRequestId: reply.requestId,
        usageId: hash(reply.usage), rawUsage: reply.usage as BudgetJson, model: reply.model!, amountMicroUsd: Math.ceil(charge.costCents * 10_000),
        costBasis: "conservative-upper-estimate" as const } };
    },
  });
  const base = { version: LOCAL_PATCH_REPAIR_REVIEW_VERSION, requestKey: prepared.requestKey, operationFingerprint: fingerprint,
    wireHashes: prepared.wireHashes, raw: null, wireFault: null, verdicts: null, evidence: null } as const;
  if (bought.kind !== "bought") return { ...base, state: bought.kind === "unresolved" || bought.kind === "deferred" && bought.reserved ? "held" : "pending",
    reason: bought.reason, replayed: false };
  await fenced();
  const keep = JSON.parse(bought.bytes.toString()) as Pick<LocalPatchJudgeResult, "raw" | "wireFault" | "model" | "finishReason">;
  const wireFault = keep.wireFault ?? (!isTheModelWeAsked(keep.model, LOCAL_PATCH_REPAIR_REVIEW_SETTINGS.model) ? "wrong-model" : keep.finishReason !== "stop" ? "truncated" : null);
  const verdicts = parseLocalPatchBoardVerdicts(wireFault ? null : keep.raw, prepared.hideIds, 8);
  const passed = !wireFault && prepared.hideIds.every(id => localPatchQualityDisposition(verdicts[id] ?? null).state === "acceptable");
  return { ...base, state: passed ? "pass" : "blocked", reason: passed ? null : "Canonical identity, readable face or seamless join was not established for every appearance",
    replayed: bought.replayed, raw: keep.raw, wireFault, verdicts, evidence: bought.evidence };
}
