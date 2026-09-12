/** Opt-in, isolated visual pilot. Default is FREE preflight; never creates a game. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { applyTestSchema } from "../src/lib/test-schema";
import { PrismaWorldBudgetStore } from "../src/infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../src/infra/db/world-budget-repository";
import { PrismaRetainedPurchaseStore } from "../src/infra/db/prisma-retained-purchase-store";
import { WorldBudget, WorldBudgetError, auditWorldBudget, type WorldBudgetRepository, type WorldChargeEvidence } from "../src/services/generation/world-budget";
import { purchaseOnce } from "../src/services/generation/paid-operation";
import { OpenAiAvatarProvider, costCentsFrom, prepareCharacterPhoto } from "../src/infra/generation/openai";
import { OpenAiIdentityStyleReviewer } from "../src/infra/generation/identity-style-reviewer";
import { CURRENT_JUDGE_PRICING_VERSION, judgeCharge } from "../src/infra/generation/judge";
import { buildBoardWizardIdentityStyle, buildBoardPeopleStyle } from "../src/services/generation/board-wizard-identity-style";
import { ADVISORY_IDENTITY_GATE_VERSION, identityGatePrompt } from "../src/services/generation/board-wizard-identity-gate";
import { normalizeBoardWizardIdentity } from "../src/services/generation/board-wizard-identity";
import { characterPrompt, QA_CHARACTER_PROMPT_VERSION } from "../src/infra/generation/character-prompt";
import { localPatchBoardForVersion } from "../src/domain/scene/local-patch-catalog";
import { cropOf } from "../src/domain/scene/local-patch-hides";
import { renderLocalPatchHide, poseMask } from "../src/services/generation/local-patch-render";
import { localPatchJudgePrompt, localPatchJudgeSettings, isTheModelWeAsked } from "../src/services/generation/local-patch-judge";
import { buyLocalPatch, LOCAL_PATCH_IMAGE_POLICY, localPatchRenderPolicySha256 } from "../src/infra/generation/openai-local-patch";

export const PILOT_CAP_MICRO_USD = 600_000;
export const PILOT_WORLD = "public-demo-style-pilot:v1";
const WORLD = PILOT_WORLD;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const fingerprint = (value: unknown) => hash(JSON.stringify(value));

/** Cap is checked inside the same CAS transaction as reservation, not beforehand.
 * Real settlements are always recorded, even a provider overrun. No reset path. */
export function pilotBudget(repository: WorldBudgetRepository) {
  return new WorldBudget({ transactWorld: (worldId, work) => repository.transactWorld(worldId, tx => work({ ...tx,
    createRequest: async request => {
      if (worldId !== WORLD) throw new Error("Pilot cannot spend in another world");
      if (auditWorldBudget(tx.snapshot).committedMicroUsd + request.reserveMicroUsd > PILOT_CAP_MICRO_USD) throw new WorldBudgetError("cap_exceeded", "Inclusive pilot reservation ceiling is $0.60");
      return tx.createRequest(request);
    },
  })) });
}

const rawImageSchema = z.object({ model: z.string().optional(), usage: z.object({
  input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().positive(),
  input_tokens_details: z.object({ text_tokens: z.number().int().nonnegative(), image_tokens: z.number().int().nonnegative() }),
  total_tokens: z.number().int().nonnegative().optional(),
}) }).passthrough();
const reviewUsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative().optional(),
  prompt_tokens_details: z.object({ cached_tokens: z.number().int().nonnegative().optional(), cache_write_tokens: z.number().int().nonnegative().optional() }).optional(),
});
type CapturedImage = { status: number; requestId: string | null; jsonBase64: string };

export function imageBill(captured: CapturedImage): WorldChargeEvidence | null {
  try {
    const raw = rawImageSchema.parse(JSON.parse(Buffer.from(captured.jsonBase64, "base64").toString()));
    if (raw.model !== undefined && raw.model !== "gpt-image-2") return null;
    if (!captured.requestId || !/^req[-_][A-Za-z0-9_-]+$/.test(captured.requestId) || captured.status !== 200) return null;
    if (raw.usage.input_tokens !== raw.usage.input_tokens_details.text_tokens + raw.usage.input_tokens_details.image_tokens) return null;
    if (raw.usage.total_tokens !== undefined && raw.usage.total_tokens !== raw.usage.input_tokens + raw.usage.output_tokens) return null;
    const usage = { input_tokens: raw.usage.input_tokens, output_tokens: raw.usage.output_tokens,
      input_tokens_details: raw.usage.input_tokens_details };
    return { providerNamespace: "openai:find-me-existing", providerRequestId: captured.requestId, usageId: fingerprint(raw.usage),
      rawUsage: usage, model: "gpt-image-2", amountMicroUsd: Math.ceil(costCentsFrom("gpt-image-2", raw.usage) * 10_000), costBasis: "conservative-upper-estimate" };
  } catch { return null; }
}

async function boundedResponse(response: Response): Promise<Buffer> {
  if (!response.body) throw new Error("Image response has no body");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    size += chunk.value.length;
    if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("Image response exceeds the pilot retention bound"); }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks);
}

/** Use the real identity request builder, but intercept its response BEFORE its
 * resize/avatar work. The raw answer goes through purchaseOnce first; processing
 * then replays the same transport locally. No second HTTP request is possible. */
export async function captureIdentity(invoke: () => Promise<unknown>, wire: typeof fetch): Promise<CapturedImage> {
  const original = globalThis.fetch; let capture: CapturedImage | null = null, calls = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url) !== "https://api.openai.com/v1/images/edits" || ++calls !== 1 || !(init?.body instanceof FormData)
      || init.body.get("model") !== "gpt-image-2" || init.body.get("quality") !== "medium" || init.body.get("n") !== "1") throw new Error("Unapproved pilot image dispatch");
    const response = await wire(url, init);
    capture = { status: response.status, requestId: response.headers.get("x-request-id"), jsonBase64: (await boundedResponse(response)).toString("base64") };
    // The real transport catches this and returns no processed picture. That is
    // intentional: no paid output is processed before its envelope is retained.
    throw new Error("Pilot raw identity captured before processing");
  };
  try { await invoke().catch(() => undefined); } finally { globalThis.fetch = original; }
  if (!capture) throw new Error("No bounded identity response; reconcile the reservation, never retry it");
  return capture;
}

async function replayIdentity<T>(captured: CapturedImage, invoke: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(Buffer.from(captured.jsonBase64, "base64"), { status: captured.status,
    headers: captured.requestId ? { "x-request-id": captured.requestId, "Content-Type": "application/json" } : {} });
  try { return await invoke(); } finally { globalThis.fetch = original; }
}

export async function runPilot(args: readonly string[], root = process.cwd()) {
  if (args.some(arg => !["--dry-run", "--spend"].includes(arg)) || args.includes("--dry-run") && args.includes("--spend")) throw new Error("Use --dry-run (default) OR explicit --spend; no reset/id/cap override exists");
  const spend = args.includes("--spend"), key = process.env.OPENAI_API_KEY;
  if (spend && !key?.trim()) throw new Error("Load the existing OPENAI_API_KEY explicitly in the calling process; no key is created or loaded automatically");
  const repo = realpathSync(root), dir = path.resolve(repo, "work/pilot/local-patch-style-v1");
  mkdirSync(dir, { recursive: true });
  if (!realpathSync(dir).startsWith(path.join(repo, "work", "pilot") + path.sep)) throw new Error("Pilot destination must stay inside work/pilot");
  const board = localPatchBoardForVersion("sydney", 7)!;
  const hide = board.hides[2]!;
  const photo = readFileSync(path.join(repo, "public/demo/example-photo.jpg"));
  const original = await sharp(readFileSync(path.join(repo, board.art))).png().toBuffer();
  const style = await buildBoardWizardIdentityStyle(repo), people = await buildBoardPeopleStyle(board.board, repo);
  const crop = await sharp(original).extract(cropOf(hide)).png().toBuffer(), mask = await poseMask(hide);
  const request = { originalPhoto: photo, mimeType: "image/jpeg", crop: null, childName: "Public demo", ageYears: 8,
    styleRef: style.png, qaStyleContract: { version: style.version, catalogSha256: style.catalogSha256, atlasSha256: style.atlasSha256 } };
  const manifest = { version: WORLD, capMicroUsd: PILOT_CAP_MICRO_USD, contentVersion: 7, board: board.board, hide,
    photoSha256: hash(photo), boardSha256: hash(original), atlasSha256: style.atlasSha256, peopleSha256: people.sha256,
    identityPromptVersion: QA_CHARACTER_PROMPT_VERSION, identityPrompt: characterPrompt({ styled: true, ageYears: 8, qaStyleContractVersion: style.version }),
    note: "Public synthetic demo age8 is a test parameter, not an inferred biographical claim.3images+3LunaLOWreviews maximum. No retries, game, queue or publication." };
  const manifestPath = path.join(dir, "inputs.json");
  if (existsSync(manifestPath) && readFileSync(manifestPath, "utf8") !== JSON.stringify(manifest, null, 2)) throw new Error("Pilot inputs changed. Existing paid keys/ledger may not be reset; reconcile deliberately");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  writeFileSync(path.join(dir, "photo.jpg"), photo); writeFileSync(path.join(dir, "board-people.png"), people.png);
  writeFileSync(path.join(dir, "identity-style-atlas.png"), style.png); writeFileSync(path.join(dir, "before.png"), crop); writeFileSync(path.join(dir, "mask.png"), mask);
  const tiles = await Promise.all(board.hides.map(h => sharp(original).extract(cropOf(h)).png().toBuffer()));
  await sharp({ create: { width: 1536, height: 1536, channels: 4, background: "#e4dfd5" } }).composite(tiles.map((input, index) => ({ input, left: (index % 3) * 512, top: Math.floor(index / 3) * 768 }))).png().toFile(path.join(dir, "five-context-feasibility.png"));
  writeFileSync(path.join(dir, "ATLAS_PLAN.md"), "# Free five-context feasibility\nFive native512x768context cells fit a1536x1536grid (sixth blank), without downscaling. This proves packing only. The current painter reference cap is1024square, so this atlas is NOT sent by this pilot. A future single-atlas edit must explicitly change reference transport/layout/extraction and test exact five outputs. Pixel count alone does not prove lower cost or acceptable facial detail. Compare against five independent768x1152outputs; do not roll out from this contact sheet.\n");
  if (!spend) return { dryRun: true, paidCalls: 0, dir, capUsd: 0.60, proposedImages: 3, proposedReviews: 3 };

  const dbPath = path.join(dir, "pilot.sqlite"), fresh = !existsSync(dbPath);
  if (!fresh && path.dirname(realpathSync(dbPath)) !== realpathSync(dir)) throw new Error("Pilot database must not resolve outside its isolated directory");
  const db = new PrismaClient({ datasources: { db: { url: `file:${dbPath.replaceAll("\\", "/")}` } } });
  try {
    if (fresh) await applyTestSchema(db, repo);
    const repository = new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db));
    const ledger = pilotBudget(repository), store = new PrismaRetainedPurchaseStore(db);
    const deps = { ledger, store }, provider = new OpenAiAvatarProvider(key!, { model: "gpt-image-2", quality: "medium", tries: 1 });
    const identity = await purchaseOnce(deps, { worldId: WORLD, requestKey: "identity:1", scope: "identity", operationFingerprint: fingerprint(manifest), reserveMicroUsd: 150_000,
      buy: async () => { const captured = await captureIdentity(() => provider.createCharacter(request), globalThis.fetch);
        const bytes = Buffer.from(JSON.stringify(captured)), evidence = imageBill(captured);
        return evidence ? { bytes, evidence } : { bytes, unknownReason: "Identity response model/usage/request cannot be priced reliably" };
      } });
    if (identity.kind !== "bought") throw new Error(`Identity ${identity.kind}; no subsequent purchase is allowed`);
    const character = await replayIdentity(JSON.parse(identity.bytes.toString()) as CapturedImage, () => provider.createCharacter(request));
    writeFileSync(path.join(dir, "identity.png"), character.sheetPng);
    const normalized = await normalizeBoardWizardIdentity(character.sheetPng);
    const judgeIdentityPng = await sharp(normalized.png).resize(256, 256, { fit: "inside" }).png().toBuffer();
    writeFileSync(path.join(dir, "identity-normalized.png"), normalized.png);
    const reviewSettings = localPatchJudgeSettings(7), reviewer = new OpenAiIdentityStyleReviewer(key!);
    async function review(name: string, prompt: string, images: Buffer[]) {
      const outcome = await purchaseOnce(deps, { worldId: WORLD, requestKey: `review:${name}:1`, scope: "judge", reserveMicroUsd: 40_000,
        operationFingerprint: fingerprint({ prompt, images: images.map(hash), settings: reviewSettings, pricing: CURRENT_JUDGE_PRICING_VERSION }),
        buy: async () => {
          const response = await reviewer.review({ prompt, images, settings: reviewSettings, timeoutMs: 90_000 });
          const bytes = Buffer.from(JSON.stringify(response)), raw = response.body as { model?: unknown; usage?: unknown; service_tier?: unknown };
          const parsedUsage = reviewUsageSchema.safeParse(raw?.usage);
          const checked = parsedUsage.success ? parsedUsage.data : undefined;
          const details = checked?.prompt_tokens_details;
          const usage = checked ? { prompt_tokens: checked.prompt_tokens, completion_tokens: checked.completion_tokens,
            ...(checked.total_tokens === undefined ? {} : { total_tokens: checked.total_tokens }),
            ...(details ? { prompt_tokens_details: {
              ...(details.cached_tokens === undefined ? {} : { cached_tokens: details.cached_tokens }),
              ...(details.cache_write_tokens === undefined ? {} : { cache_write_tokens: details.cache_write_tokens }),
            } } : {}) } : undefined;
          const consistent = usage && (usage.total_tokens === undefined || usage.total_tokens === usage.prompt_tokens + usage.completion_tokens);
          const charge = typeof raw?.model === "string" && consistent ? judgeCharge(raw.model, usage, CURRENT_JUDGE_PRICING_VERSION) : null;
          if (!response.httpOk || !response.requestId || typeof raw?.model !== "string" || !isTheModelWeAsked(raw.model, reviewSettings.model)
            || raw.service_tier != null && raw.service_tier !== "default" || !usage || !charge || charge.costUnknown || charge.costCents <= 0) return { bytes, unknownReason: "Review response model/usage/request cannot be priced reliably" };
          const evidence: WorldChargeEvidence = { providerNamespace: "openai:find-me-existing", providerRequestId: response.requestId,
            usageId: fingerprint(raw.usage), rawUsage: usage, model: raw.model,
            amountMicroUsd: Math.ceil(charge.costCents * 10_000), costBasis: "conservative-upper-estimate" };
          return { bytes, evidence };
        } });
      if (outcome.kind !== "bought") throw new Error(`Review ${name} ${outcome.kind}; stop without another purchase`);
      writeFileSync(path.join(dir, `${name}-review.json`), outcome.bytes);
    }
    await review("identity", identityGatePrompt(8, ADVISORY_IDENTITY_GATE_VERSION), [await prepareCharacterPhoto(photo, null, 512), character.sheetPng, style.png]);
    const outputs: Buffer[] = [];
    for (const [index, quality] of (["medium", "low"] as const).entries()) {
      const policy = { ...LOCAL_PATCH_IMAGE_POLICY, quality };
      const result = await renderLocalPatchHide({ ...deps, renderPolicySha256: localPatchRenderPolicySha256(policy), render: input => buyLocalPatch(key!, input, { policy }) }, {
        worldId: WORLD, contentVersion: 7, board, hide, composedPng: original, identityPng: normalized.png,
        boardPeoplePng: people.png, judgeIdentityPng, ageYears: 8, attempt: index + 1, apiKey: key!,
      });
      if (!result.accepted || !result.shippingPng || !result.composedPng || result.costUnknown) throw new Error(`${quality} technical purchase failure; retained evidence remains, no retry`);
      outputs.push(result.shippingPng); writeFileSync(path.join(dir, `${quality}.png`), result.shippingPng);
      writeFileSync(path.join(dir, `${quality}-board.png`), result.composedPng);
      await review(quality, localPatchJudgePrompt(hide.id, { ageYears: 8 }, 7), [crop, result.shippingPng, judgeIdentityPng]);
    }
    await sharp({ create: { width: 2048, height: 768, channels: 4, background: "#e4dfd5" } }).composite([
      { input: await sharp(character.sheetPng).resize(512, 768, { fit: "contain", background: "#e4dfd5" }).png().toBuffer(), left: 0, top: 0 },
      { input: crop, left: 512, top: 0 }, { input: outputs[0]!, left: 1024, top: 0 }, { input: outputs[1]!, left: 1536, top: 0 },
    ]).png().toFile(path.join(dir, "comparison-identity-before-medium-low.png"));
    const total = await ledger.audit(WORLD);
    const operations = await repository.transactWorld(WORLD, async tx => tx.snapshot.requests.map(row => ({
      requestKey: row.requestKey, operationFingerprint: row.operationFingerprint, scope: row.scope, state: row.state,
      evidence: row.state === "settled" || row.state === "linked" ? row.evidence : null, unknownReasons: row.unknownReasons,
    })));
    const report = { capMicroUsd: PILOT_CAP_MICRO_USD, settledMicroUsd: total.settledMicroUsd, reservedMicroUsd: total.reservedMicroUsd, held: total.held,
      byScope: total.byScope, operations, allAmountsAreRateCardEstimatesNotInvoices: true, qualityDecision: "Human visual comparison pending; LOW is not enabled in production" };
    writeFileSync(path.join(dir, "cost-report.json"), JSON.stringify(report, null, 2));
    return { dryRun: false, dir, ...report };
  } finally { await db.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void runPilot(process.argv.slice(2)).then(result => console.log(JSON.stringify(result, null, 2))).catch(() => {
    console.error("Pilot stopped safely. Inspect its isolated ledger/retained evidence. No automatic retry or ledger reset is permitted."); process.exitCode = 1;
  });
}
