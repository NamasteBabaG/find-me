import sharp from "sharp";
import type { Prisma } from "@prisma/client";
import { OpenAiPatchJudge, judgementForJson, judgeCharge } from "../../infra/generation/judge";
import { BOARD_JUDGE_MODEL, BOARD_JUDGE_EFFORT, BOARD_JUDGE_VERSION, BOARD_CHECKS, boardJudgePrompt } from "../../infra/generation/board-verdict";
import type { PatchJudge, PatchJudgeInput, PatchJudgement } from "../../infra/generation/types";
import type { WorldBudget, BudgetJson } from "./world-budget";
import { boardConditioningHash } from "./board-conditioned-source";
import { sha256Bytes } from "./fixed-sprite";

type BlobDb = Pick<Prisma.TransactionClient, "fileBlob">;
const CONTENT_TYPE = "application/vnd.findme.board-wizard-visual+json";
/** Names the effort it actually runs at, so a retained receipt from the HIGH
 * judge can never be mistaken for one of these. */
export const BOARD_WIZARD_VISUAL_VERSION = "board-wizard-final-composite-sol-low/v1";
export function boardWizardVisualKeys(worldId: string, boardId: string, slotId: string, attempt: number) {
  const base = `private:board-wizard-visual:${boardConditioningHash([worldId, boardId, slotId, attempt])}`;
  return { receipt: `${base}:receipt`, wire0: `${base}:wire0`, wire1: `${base}:wire1` };
}
const demand = (ok: unknown, message: string) => { if (!ok) throw new Error(`BOARD_VISUAL: ${message}`); };
async function immutable(db: BlobDb, key: string, bytes: Buffer, contentType: string) {
  const old = await db.fileBlob.findUnique({ where: { key } });
  if (old) { demand(old.contentType === contentType && Buffer.from(old.data).equals(bytes), "Immutable visual receipt or wire evidence changed"); return; }
  await db.fileBlob.create({ data: { key, contentType, data: new Uint8Array(bytes) } });
}
export async function judgeBoardWizardAppearance(deps: {
  db: BlobDb; budget: WorldBudget; apiKey: string;
  write<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
  beforeDispatch(): Promise<void>;
  /** Dependency injection for free tests; production constructs only Sol HIGH. */
  judge?: PatchJudge;
}, request: { worldId: string; boardId: string; slotId: string; attempt: number; playerBindingSha256: string; input: PatchJudgeInput }) {
  demand(request.input.boardCrop && request.attempt >= 1 && request.attempt <= 2, "Final composed board and bounded attempt are required");
  const input = request.input;
  const images = [
    await sharp(input.boardCrop!).resize(1024, 1024, { fit: "inside" }).png().toBuffer(),
    await sharp(input.patchPng).resize(512, 512, { fit: "contain", background: { r: 130, g: 130, b: 130, alpha: 1 } }).flatten({ background: { r: 130, g: 130, b: 130 } }).png().toBuffer(),
    await sharp(input.reference).resize(512, 512, { fit: "inside" }).png().toBuffer(),
  ];
  const imageHashes = images.map(sha256Bytes), prompt = boardJudgePrompt(input.childName, input.ageYears, input.recipe);
  // The effort comes from the judge's own constant. Writing it again here is how
  // the fingerprint could claim one effort while the request sent another.
  const fingerprint = boardConditioningHash({ version: BOARD_WIZARD_VISUAL_VERSION, model: BOARD_JUDGE_MODEL, effort: BOARD_JUDGE_EFFORT, tries: 1, policy: "strong", playerBindingSha256: request.playerBindingSha256, prompt, imageHashes });
  const keys = boardWizardVisualKeys(request.worldId, request.boardId, request.slotId, request.attempt), requestKey = `board:${request.boardId}:visual:${request.slotId}:1`;
  const saved = await deps.db.fileBlob.findUnique({ where: { key: keys.receipt } });
  if (saved) {
    demand(saved.contentType === CONTENT_TYPE && saved.data.byteLength < 200_000, "Invalid visual checkpoint");
    const record = JSON.parse(Buffer.from(saved.data).toString()) as { fingerprint: string; judgement: PatchJudgement; imageHashes: string[] };
    demand(record.fingerprint === fingerprint && boardConditioningHash(record.imageHashes) === boardConditioningHash(imageHashes), "Visual receipt belongs to different composed pixels or policy");
    const charge = await deps.budget.readRequest(request.worldId, requestKey);
    demand(charge && charge.operationFingerprint === fingerprint, "Visual checkpoint has no matching durable reservation");
    const receipt = record.judgement.attempts?.[0];
    if (charge?.state === "settled" || charge?.state === "linked") demand(receipt && charge.evidence.providerRequestId === receipt.requestId && charge.evidence.amountMicroUsd === Math.ceil(record.judgement.costCents * 10_000) && charge.evidence.usageId === boardConditioningHash(receipt.usage), "Retained visual bill differs from its request receipt");
    else demand(charge?.state === "unknown" && record.judgement.verdict !== "ok", "Unsettled visual review cannot approve a target");
    for (const [i, key] of [keys.wire0, keys.wire1].entries()) {
      const blob = await deps.db.fileBlob.findUnique({ where: { key } });
      demand(blob && blob.contentType === "image/png" && sha256Bytes(blob.data) === imageHashes[i], "Private visual wire evidence changed or disappeared");
    }
    return { judgement: record.judgement, receiptKey: keys.receipt, fingerprint, reused: true };
  }
  await deps.beforeDispatch();
  const reservation = await deps.budget.reserve(request.worldId, { requestKey, scope: "judge", operationFingerprint: fingerprint, reserveMicroUsd: 400_000 });
  demand(reservation.acquired, "Paid visual request has no retained response; reconcile instead of buying it again");
  const judge = deps.judge ?? new OpenAiPatchJudge(deps.apiKey, { model: BOARD_JUDGE_MODEL, policy: "strong", tries: 1, timeoutMs: 90_000 });
  let result: PatchJudgement;
  try { result = await judge.judge(input); }
  catch { await deps.budget.markUnknown(request.worldId, requestKey, "Visual reviewer transport threw before a trustworthy receipt"); throw new Error("BOARD_VISUAL: unknown paid response retained as a hold"); }
  const attempt = result.attempts?.length === 1 ? result.attempts[0]! : null;
  const charge = attempt?.model ? judgeCharge(attempt.model, attempt.usage ?? undefined) : { costUnknown: true, costCents: 0 };
  const known = attempt && attempt.requestId && attempt.usage && !result.costUnknown && !attempt.costUnknown && !charge.costUnknown && charge.costCents === result.costCents;
  const evidenceMatches = result.policy === "strong" && result.model === BOARD_JUDGE_MODEL && attempt?.model === BOARD_JUDGE_MODEL && result.version === BOARD_JUDGE_VERSION && result.promptSent === prompt
    && boardConditioningHash(result.imageHashes ?? []) === boardConditioningHash(imageHashes)
    && result.wireImages?.length === 2 && result.wireImages.every((png, i) => sha256Bytes(png) === imageHashes[i]);
  if (!evidenceMatches) result = { ...result, verdict: "unknown", reason: `Visual wire/policy receipt could not be verified. ${result.reason}` };
  if (result.verdict === "ok" && (!known || !BOARD_CHECKS.every(key => result.checks?.[key] === "pass"))) result = { ...result, verdict: "unknown", reason: `Complete trustworthy checks and billing are required for a pass. ${result.reason}` };
  if (known) await deps.budget.settle(request.worldId, requestKey, { providerNamespace: "openai:find-me-existing", providerRequestId: attempt.requestId!, usageId: boardConditioningHash(attempt.usage), rawUsage: attempt.usage as BudgetJson,
    model: attempt.model!, amountMicroUsd: Math.ceil(charge.costCents * 10_000), costBasis: "conservative-upper-estimate" });
  else await deps.budget.markUnknown(request.worldId, requestKey, "Final visual review has missing or uncertain request-level usage");
  const judgement = judgementForJson(result);
  const bytes = Buffer.from(JSON.stringify({ version: BOARD_WIZARD_VISUAL_VERSION, fingerprint, imageHashes, playerBindingSha256: request.playerBindingSha256, judgement, automaticRelease: false }));
  await deps.write(async tx => {
    await immutable(tx, keys.wire0, images[0]!, "image/png"); await immutable(tx, keys.wire1, images[1]!, "image/png");
    await immutable(tx, keys.receipt, bytes, CONTENT_TYPE);
  });
  return { judgement, receiptKey: keys.receipt, fingerprint, reused: false };
}
