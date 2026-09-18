/** One retained grouped review of THREE serial appearances, not a collage.
 * Uses the product's judge, parser, quality policy and shared $2 pilot ledger.
 * No publication. Re-running the same evidence replays the paid receipt.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { MAGIC_PILOT_PATCH_BOARDS } from "../content/adventures/magic-pilot";
import { cropOf, maskForHide } from "../src/domain/scene/local-patch-hides";
import { PrismaWorldBudgetStore } from "../src/infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../src/infra/db/world-budget-repository";
import { PrismaRetainedPurchaseStore } from "../src/infra/db/prisma-retained-purchase-store";
import { WorldBudget, WorldBudgetError, auditWorldBudget, type WorldBudgetRepository, type BudgetJson } from "../src/services/generation/world-budget";
import { purchaseOnce } from "../src/services/generation/paid-operation";
import { judgeCharge, CURRENT_JUDGE_PRICING_VERSION } from "../src/infra/generation/judge";
import { judgeLocalPatchBoard, localPatchBoardJudgeSettings, localPatchBoardJudgeImages, localPatchBoardJudgeImageLabels,
  localPatchBoardJudgePrompt, parseLocalPatchBoardVerdicts, localPatchQualityDisposition, isTheModelWeAsked,
  type LocalPatchBoardJudgeRequest } from "../src/services/generation/local-patch-judge";

const hash = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
async function main() {
  const [slug, vector, ...extra] = process.argv.slice(2), attempts = vector?.split(",").map(Number);
  const board = MAGIC_PILOT_PATCH_BOARDS.find(b => b.board === slug);
  if (!board || extra.length || attempts?.length !== 3 || attempts.some(a => ![1, 2, 3].includes(a))) throw Error("Use <board-slug> <attempt1,attempt2,attempt3>");
  const dir = path.resolve("storage/magic-bar-20260918"), inputBytes = readFileSync(path.join(dir, "inputs.json"));
  const inputs = JSON.parse(inputBytes.toString()), inputsSha256 = hash(inputBytes);
  const pinned = inputs.boards.find((b: { board: { board: string } }) => b.board.board === slug);
  const original = readFileSync(board.art), identity = readFileSync(path.join(dir, "identity-normalized.png"));
  if (inputs.capMicroUsd !== 2_000_000 || inputs.version !== "magic-bar-three-20260918-v1" || !pinned
    || JSON.stringify(pinned.board) !== JSON.stringify(board) || hash(original) !== pinned.sourceSha256
    || hash(identity) !== inputs.identitySha256) throw Error("Pinned pilot evidence changed");
  const key = process.env.OPENAI_API_KEY;
  if (!key?.trim()) throw Error("Existing authorized key is required, never print it");
  const patches: Record<string, string> = {};
  const hides = await Promise.all(board.hides.map(async (hide, i) => {
    const prefix = path.join(dir, `${hide.id}-attempt-${attempts[i]}`);
    const technical = JSON.parse(readFileSync(`${prefix}.json`, "utf8")), bytes = readFileSync(`${prefix}.png`);
    if (!technical.accepted || technical.costUnknown || technical.inputsSha256 !== inputsSha256 || technical.sha256 !== hash(bytes)) throw Error(`Unusable candidate: ${hide.id}`);
    patches[hide.id] = hash(bytes);
    const crop = cropOf(hide), left = Math.max(0, crop.left - 64), top = Math.max(0, crop.top - 64);
    const context = { left, top, width: Math.min(3840, crop.left + crop.width + 64) - left, height: Math.min(2160, crop.top + crop.height + 64) - top };
    const beforePng = await sharp(original).extract(context).png().toBuffer();
    const afterPng = await sharp(beforePng).composite([{ input: bytes, left: crop.left - left, top: crop.top - top }]).png().toBuffer();
    const mask = maskForHide(hide), dx = Math.max(0, mask.left - 120), dy = Math.max(0, mask.top - 120);
    const detail = { left: dx, top: dy, width: Math.min(512, mask.left + mask.width + 120) - dx, height: Math.min(768, mask.top + mask.height + 120) - dy };
    const closeupPng = await sharp(bytes).extract(detail).png().toBuffer();
    const afterEvidencePng = await sharp({ create: { width: context.width + 24 + detail.width, height: Math.max(context.height, detail.height), channels: 4, background: "white" } }).composite([
      { input: afterPng, left: 0, top: 0 }, { input: closeupPng, left: context.width + 24, top: 0 },
    ]).png().toBuffer();
    writeFileSync(`${prefix}-context.png`, afterPng);
    return { hideId: hide.id, beforePng, afterPng, closeupPng, afterEvidencePng, expectation: { ageYears: 5, support: `${hide.pose} on ${board.ground}` } };
  }));
  const request: LocalPatchBoardJudgeRequest = { boardId: board.board, contentVersion: 10, hides,
    boardPng: await sharp(original).resize(1536, 1024, { fit: "inside" }).png().toBuffer(),
    identityPng: await sharp(identity).resize(256, 256, { fit: "inside" }).png().toBuffer() };
  const settings = localPatchBoardJudgeSettings(10), wireHashes = localPatchBoardJudgeImages(request).map(hash);
  const fingerprint = hash(JSON.stringify({ inputsSha256, patches, settings, prompt: localPatchBoardJudgePrompt(request), labels: localPatchBoardJudgeImageLabels(request), wireHashes }));
  const db = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, "purchases.sqlite").replaceAll("\\", "/")}` } } });
  try {
    const repo = new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db));
    const bounded: WorldBudgetRepository = { transactWorld: (id, work) => repo.transactWorld(id, tx => work({ ...tx, createRequest: async row => {
      if (id !== inputs.version || auditWorldBudget(tx.snapshot).committedMicroUsd + row.reserveMicroUsd > inputs.capMicroUsd) throw new WorldBudgetError("cap_exceeded", "Pilot $2 ceiling reached");
      return tx.createRequest(row);
    } })) };
    const ledger = new WorldBudget(bounded), store = new PrismaRetainedPurchaseStore(db);
    const requestKey = `pilot-board-review:${board.board}:${attempts.join("-")}:v1`;
    const bought = await purchaseOnce({ ledger, store }, { worldId: inputs.version, requestKey, scope: "judge", operationFingerprint: fingerprint, reserveMicroUsd: 30_000,
      buy: async () => {
        const reply = await judgeLocalPatchBoard(key, request);
        const keep = { raw: reply.raw, usage: reply.usage, requestId: reply.requestId, model: reply.model, finishReason: reply.finishReason, wireFault: reply.wireFault, costUnknown: reply.costUnknown };
        const bytes = Buffer.from(JSON.stringify(keep)), charge = judgeCharge(reply.model ?? "", reply.usage ?? undefined, CURRENT_JUDGE_PRICING_VERSION);
        if (reply.costUnknown || charge.costUnknown || !reply.requestId) return { bytes, unknownReason: "Pilot review charge cannot be established" };
        return { bytes, evidence: { providerNamespace: "openai:find-me-existing", providerRequestId: reply.requestId,
          usageId: hash(JSON.stringify(reply.usage)), rawUsage: reply.usage as BudgetJson, model: reply.model!,
          amountMicroUsd: Math.ceil(charge.costCents * 10_000), costBasis: "conservative-upper-estimate" as const } };
      } });
    writeFileSync(path.join(dir, "budget.json"), JSON.stringify(await ledger.audit(inputs.version), null, 2));
    if (bought.kind !== "bought") throw Error(`Review stopped: ${bought.kind}: ${bought.reason}`);
    const keep = JSON.parse(bought.bytes.toString());
    const raw = !keep.wireFault && keep.finishReason === "stop" && isTheModelWeAsked(keep.model, settings.model) ? keep.raw : null;
    const verdicts = parseLocalPatchBoardVerdicts(raw, board.hides.map(h => h.id), 10);
    const dispositions = Object.fromEntries(board.hides.map(h => [h.id, localPatchQualityDisposition(verdicts[h.id] ?? null, 10, { hideId: h.id })]));
    const result = { inputsSha256, fingerprint, requestKey, board: board.board, attempts, patches, wireHashes, keep, verdicts, dispositions, costMicroUsd: bought.evidence.amountMicroUsd, replayed: bought.replayed };
    writeFileSync(path.join(dir, `${board.board}-review-${attempts.join("-")}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ board: board.board, dispositions, costMicroUsd: result.costMicroUsd, replayed: result.replayed }));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Review stopped"); process.exitCode = 1; });
