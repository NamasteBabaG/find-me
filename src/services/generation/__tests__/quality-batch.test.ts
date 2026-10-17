import { createHash } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { PrismaRetainedPurchaseStore, retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { QualityBatchRefused, type QualityBatchFound, type QualityBatchResult, type QualityBatchStatus, type QualityBatchTransport } from "../../../infra/generation/types";
import { AnthropicMessageBatches } from "../../../infra/generation/anthropic-message-batches";
import { GameConfigSchema } from "../../../domain/game/config";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { cropOf, maskForHide } from "../../../domain/scene/local-patch-hides";
import { QUALITY_BATCH_CREATE_GRACE_MS, QUALITY_BATCH_LATE_SEARCH_MS, QUALITY_BATCH_REFUSAL_BACKOFF_MS, qualityBatchCopyStart } from "../../../domain/generation/quality-batch-round";
import type { Container } from "../../container";
import { boardsOfWorlds } from "../../world-catalog.service";
import { deleteGame } from "../../game.service";
import { createDraft } from "../../create-flow.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import type { WorldChargeEvidence } from "../world-budget";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { reviewLocalPatchBoard } from "../local-patch-board-review";
import { runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import { localPatchHideEvidenceIds } from "../local-patch-judge";
import { LOCAL_PATCH_PUBLICATION_ACTION } from "../local-patch-publication-policy";
import { LOCAL_PATCH_STYLE, runLocalPatchWorldSlice } from "../local-patch-world";
import { verifiedDualStage } from "../local-patch-dual-evidence";
import { DUAL_VISUAL_REVIEW_V3, DUAL_VISUAL_REVIEW_VERSION, pinVisualReviewRelease } from "../visual-review-release";
import { QUALITY_BATCH_CHANNEL, QUALITY_BATCH_DEADLINE_MS, pinQualityChannel, qualityChannelAuditId, qualityChannelOf } from "../quality-channel";
import { QUALITY_BATCH_ACTION, QUALITY_BATCH_SWEEP_ROUND_MS, advanceQualityBatches, qualityBatchCopyKeyOf, qualityBatchKeyOf, sweepQualityBatches } from "../quality-batch";
import { sha256Bytes } from "../fixed-sprite";
import { SELF_REPAIR_REQUEST_ACTION } from "../local-patch-self-repair";
import { planLocalPatchEvidenceRecovery } from "../local-patch-evidence-plan";
import { bill, paintedCrop, paintedOk, seedApprovedGame } from "./local-patch-fixtures";
import { GOOD_V12_VERDICT, boundHide, dualReviewer, longAnswer } from "./local-patch-dual-fixtures";

/**
 * The Opus scene-quality question delivered by Message Batches, end to end, on
 * the real ledger, retained store, dual review and world slice. The provider is a
 * scripted fake behind the transport interface; no request leaves the process.
 */
const fakes = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0, LOCAL_PATCH_PLAYER_REVIEW: "on",
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", LOCAL_PATCH_PROMPT_RELEASE: "v15" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: fakes.testers }), flag: () => false, adminEmails: () => [] }));

const journeySlugs = new Set(boardsOfWorlds(["journey"]));
const BOARDS = localPatchBoardsForVersion(12).filter(board => journeySlugs.has(board.board)), HIDES = BOARDS.flatMap(board => board.hides);
const HOUR = 60 * 60_000;
let directory: string, db: PrismaClient, c: Container;
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-quality-batch-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-quality-batch", analytics: { track: vi.fn() }, adminEmails: [],
    email: { id: "console", send: async () => ({ id: "synthetic-mail" }) }, emailFallbackTo: null } as unknown as Container;
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live requests forbidden in the batch channel tests"); }));
}, 180_000);
afterEach(() => { vi.useRealTimers(); });
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-quality-batch-")) rmSync(directory, { recursive: true });
});

/** A paid nine-board v12 journey whose draft was pinned to dual review v3 and, unless asked otherwise, to Message Batches. */
async function world(gameId: string, options: { pinned?: boolean } = {}) {
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: LOCAL_PATCH_STYLE, status: "DRAFT",
    scenes: BOARDS.map(board => ({ slug: board.board, version: 12 })) });
  fakes.testers.push(seeded.email);
  await db.$transaction(async tx => {
    await pinVisualReviewRelease(tx, gameId, DUAL_VISUAL_REVIEW_V3);
    if (options.pinned !== false) await pinQualityChannel(tx, gameId, QUALITY_BATCH_CHANNEL);
  });
  await db.game.update({ where: { id: gameId }, data: { status: "TARGETS_GENERATING", paidAt: new Date() } });
  await db.generationJob.create({ data: { id: `job_${gameId}`, gameId, status: "QUEUED" } });
  await db.order.create({ data: { id: `ord-${gameId}`, gameId, userId: seeded.userId, provider: "mock", packageTier: "ONE_WORLD",
    amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
  const avatar = await sharp(seeded.sheet).resize(256, 256).png().toBuffer(), avatarId = `ast-avatar-${gameId}`;
  await c.storage.put(`game/${avatarId}.png`, avatar, "image/png");
  await db.asset.create({ data: { id: avatarId, ownerId: seeded.userId, type: "AVATAR", visibility: "GAME", status: "READY",
    storagePath: `game/${avatarId}.png`, mimeType: "image/png", bytes: avatar.length, width: 256, height: 256, provider: "openai" } });
  await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { avatarAssetId: avatarId } });
  await c.storage.put(`private/photo-${gameId}.jpg`, seeded.sheet, "image/png");
  const catalog = await readBoardConditionedCatalog();
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {},
    write: work => db.$transaction(work), reviewer: { review: async () => ({ httpOk: true, requestId: `req-identity-${gameId}`,
      body: { model: "gpt-5.6-luna", usage: { prompt_tokens: 1500, completion_tokens: 150 }, choices: [{ finish_reason: "stop", message: {
        content: JSON.stringify({ checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Controlled identity" }) } }] } }) } },
  { gameId, identityAssetId: `ast-sheet-${gameId}`, sheet: seeded.sheet, photo: seeded.sheet, atlas: seeded.sheet, contentVersion: 12,
    provenance: { promptVersion: "character-v6-painted-identity-geometry", quality: "medium", photoAssetId: `ast-photo-${gameId}`,
      photoSha256: sha256Bytes(seeded.sheet), ageYears: 8, crop: null,
      style: { version: "board-matched-identity/v4", catalogSha256: catalog.sha256, atlasSha256: sha256Bytes(seeded.sheet) } } });
  return { ...seeded, worldId: boardWizardWorldId(gameId), budget: boardWizardBudgetOf(c) };
}
/** A synthetic painter for every journey appearance; each paid attempt differs. */
function painter(gameId: string, renders: string[] = []): LocalPatchHideDeps {
  return { renderPolicySha256: "f".repeat(64), judge: async () => { throw Error("Per-hide judge forbidden"); },
    render: async ({ requestKey, stylePng }) => {
      const hide = HIDES.find(h => requestKey.startsWith(`${h.id}:`));
      if (!hide) throw Error(`Unexpected synthetic request ${requestKey}`);
      renders.push(requestKey);
      const attempt = Number(requestKey.split(":").at(-1)), mask = maskForHide(hide), crop = cropOf(hide);
      const png = await sharp(await paintedCrop(stylePng, hide)).composite([{ input: { create: { width: 6, height: 6, channels: 4,
        background: { r: 40 * attempt, g: 40, b: 180, alpha: 1 } } }, left: mask.left - crop.left + Math.floor(mask.width / 2),
        top: mask.top - crop.top + Math.floor(mask.height / 2) }]).png().toBuffer();
      return paintedOk(png, bill(`paint-${gameId}-${requestKey}`));
    } };
}

/** The question a batch request asks, read back from its own params. */
const promptOf = (params: Record<string, unknown>) => ((params.messages as { content: { text?: string }[] }[])[0]!.content[0]!.text)!;
let messages = 0;
/** Opus's passing answer to a batched question, as Message Batches returns it. */
const opus = (over: (hideId: string) => Record<string, unknown> = () => ({})) => (params: Record<string, unknown>, customId: string): QualityBatchResult => {
  const hideId = boundHide(promptOf(params)).hideId;
  return { customId, type: "succeeded", message: { id: `msg_synthetic_${++messages}`, type: "message", role: "assistant", model: "claude-opus-5-5",
    content: [{ type: "text", text: "```json\n" + JSON.stringify({ hides: [{ hideId, evidenceIds: localPatchHideEvidenceIds(hideId), verdict: GOOD_V12_VERDICT }] }) + "\n```" }],
    stop_reason: "end_turn", usage: { input_tokens: 2000, output_tokens: 500, service_tier: "batch" }, ...over(hideId) } };
};
type FakeBatch = { id: string; createdAt: number; requests: { customId: string; params: Record<string, unknown> }[];
  status: "in_progress" | "ended"; results: QualityBatchResult[] | null; cancelled: boolean; deleted: boolean };
/** Message Batches, scripted: a batch runs until the test ends it; a cancel ends what has not run as canceled. */
class FakeBatches implements QualityBatchTransport {
  readonly namespace = "anthropic:find-me-existing";
  readonly batches: FakeBatch[] = [];
  readonly calls: string[] = [];
  createPlan: ("ok" | "lost-after-create" | "lost-before-create" | QualityBatchRefused)[] = [];
  private static made = 0;
  /** `name` keeps this fake's batch ids apart from those of every other: the rounds earlier tests left in the
   * shared database are swept too, and a provider's ids are its own. */
  constructor(public answer: (params: Record<string, unknown>, customId: string) => QualityBatchResult, private readonly name = `fake${++FakeBatches.made}x`) {}
  get creates() { return this.calls.filter(call => call === "create").length; }
  private batch(id: string) { const found = this.batches.find(b => b.id === id); if (!found || found.deleted) throw Error(`no such batch ${id}`); return found; }
  async create(requests: readonly { customId: string; params: Record<string, unknown> }[]) {
    this.calls.push("create");
    const plan = this.createPlan.shift() ?? "ok";
    if (plan instanceof QualityBatchRefused) throw plan;
    if (plan === "lost-before-create") throw Error("socket hang up before the request was sent");
    const batch: FakeBatch = { id: `msgbatch_${this.name}${this.batches.length + 1}`, createdAt: Date.now(), requests: structuredClone([...requests]),
      status: "in_progress", results: null, cancelled: false, deleted: false };
    this.batches.push(batch);
    if (plan === "lost-after-create") throw Error("socket hang up after the batch was created");
    return { batchId: batch.id };
  }
  /** The provider finishes every running batch. */
  end() { for (const b of this.batches) if (b.status === "in_progress") { b.status = "ended"; b.results = b.requests.map(r => this.answer(r.params, r.customId)); } }
  async find(customId: string, sinceMs: number, _deadlineAt?: number, untilMs?: number, known?: ReadonlySet<string>): Promise<QualityBatchFound> {
    this.calls.push("find");
    const candidates = this.batches.filter(b => !b.deleted && !known?.has(b.id) && b.createdAt >= sinceMs - 5 * 60_000 && (untilMs === undefined || b.createdAt <= untilMs + 5 * 60_000));
    const proven = candidates.filter(b => b.status === "ended" && b.results!.some(r => r.customId === customId));
    // Each proven batch with the results that proved it, as the provider's own search returns them.
    return { proven: proven.map(b => b.id), undecided: candidates.some(b => b.status !== "ended"), results: Object.fromEntries(proven.map(b => [b.id, b.results!])) };
  }
  async status(id: string): Promise<QualityBatchStatus> {
    this.calls.push("status");
    const b = this.batch(id);
    if (b.status !== "ended") return { status: b.status, counts: null };
    const counts: Record<string, number> = { processing: 0, succeeded: 0, errored: 0, canceled: 0, expired: 0 };
    for (const r of b.results!) { const type = r.type === "unrecognized" ? String(r.resultType) : r.type; counts[type] = (counts[type] ?? 0) + 1; }
    return { status: "ended", counts };
  }
  async results(id: string) { this.calls.push("results"); const b = this.batch(id); if (b.status !== "ended") throw Error("not ended"); return b.results!; }
  async cancel(id: string) {
    this.calls.push("cancel");
    const b = this.batch(id);
    b.cancelled = true;
    if (b.status === "in_progress") { b.status = "ended"; b.results = b.requests.map(r => ({ customId: r.customId, type: "canceled" as const })); }
  }
  async remove(id: string) { this.calls.push("remove"); const b = this.batch(id); if (b.status !== "ended") throw Error("cancel first"); b.deleted = true; }
}
/** Opus's answer served by a tier with no rate: its charge cannot be stated. */
const unpricedOpus = opus(() => ({ usage: { input_tokens: 2000, output_tokens: 500, service_tier: "priority" } }));
/** A person's reconciliation of a charge at zero, citing the receipt it read. */
const zeroEvidence = (receipt: string): WorldChargeEvidence => ({ providerNamespace: "anthropic:find-me-existing", providerRequestId: receipt, usageId: "u",
  rawUsage: { basis: "the copy's receipt, priced by a person" }, model: "claude-opus-5-5", amountMicroUsd: 0, costBasis: "conservative-upper-estimate" });
/** The first read of `batchId`'s results waits until released and then gets `first`; every later read gets `later`. */
function raceReads(fake: FakeBatches, batchId: string, first: QualityBatchResult[], later: QualityBatchResult[]) {
  const results = fake.results.bind(fake);
  let reads = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  fake.results = async (id: string) => {
    if (id !== batchId) return results(id);
    if (++reads === 1) { await gate; return first; }
    return later;
  };
  return { release: () => release(), started: async () => { while (reads < 1) await new Promise(resolve => setTimeout(resolve, 5)); } };
}
/** A reading's canonical text, written out apart from the code under test: object keys sorted at every depth. */
const canonical = (value: unknown) => JSON.stringify(value, (_key, inner: unknown) => inner && typeof inner === "object" && !Array.isArray(inner)
  ? Object.fromEntries(Object.keys(inner).sort().map(key => [key, (inner as Record<string, unknown>)[key]])) : inner);
const receiptOf = (results: readonly QualityBatchResult[]) => (results[0] as { message: { id: string } }).message.id;
/** A search that proves batches without keeping the results that proved them (§6, item 16): the round knows them with no
 * recorded reading, so their bills are read from the provider, the path whose rotation, room checks and turns a test exercises. */
function searchKeepingNoReadings(fake: FakeBatches) {
  const proving = fake.find.bind(fake);
  fake.find = async (...args: Parameters<FakeBatches["find"]>) => ({ ...(await proving(...args)), results: undefined });
}

const scene = (gameId: string, board = BOARDS[0]!) => ({ gameId, sceneId: `gsc-${gameId}-${board.board}` });
const review = (container: Container, gameId: string, board = BOARDS[0]!, deadlineMs = 270_000) =>
  reviewLocalPatchBoard(container, { ...scene(gameId, board), deadlineAt: Date.now() + deadlineMs }, { fence: async () => {} });
const rows = (gameId: string) => db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, orderBy: { id: "asc" } });
const events = (gameId: string) => db.auditLog.findMany({ where: { entityId: gameId, action: QUALITY_BATCH_ACTION }, orderBy: { id: "asc" } });
const eventNames = async (gameId: string) => (await events(gameId)).map(row => row.id.replace(/^aud_qb_qb[a-f0-9]{30}_/, "")).sort();
/** A batch's reading's event name, spelled out apart from the code under test: the batch id in hex. */
const readingName = (batchId: string) => `reading-${Buffer.from(batchId, "utf8").toString("hex")}`;
/** Every batch the round's searches kept, in the order kept. */
const foundOf = async (gameId: string) => (await events(gameId)).map(row => JSON.parse(row.metaJson!) as { kind: string; n: number; batchIds: string[] })
  .filter(event => event.kind === "found").sort((a, b) => a.n - b.n).flatMap(event => event.batchIds);
/** The bills read of a finished round's other copies, in order, with what the provider returned for each. */
type LateBill = { kind: string; n: number; batchId: string; amountMicroUsd: number | null;
  results: { type: string; errorType: string | null; requestId: string | null; model: string | null; usage: unknown }[] };
const latesOf = async (gameId: string) => (await events(gameId)).map(row => JSON.parse(row.metaJson!) as LateBill)
  .filter(event => event.kind === "late").sort((a, b) => a.n - b.n);
const eventOf = async (gameId: string, name: string) => JSON.parse((await events(gameId)).find(row => row.id.endsWith(`_${name}`))!.metaJson!);
const qualityCalls = (request: ReturnType<typeof dualReviewer>) => request.mock.calls.filter(([question]) => question.role === "scene-quality").length;
async function paintFirst(gameId: string, board = BOARDS[0]!) { await runLocalPatchHide(c, painter(gameId), { gameId, board, hide: board.hides[0]! }); }
const sol = (gameId: string) => dualReviewer(gameId, hideId => longAnswer(hideId, 300, 300, 0));
/** The recorded intent of a board's batched question. */
async function syncKeyOf(gameId: string, board = BOARDS[0]!) {
  const intent = (await events(gameId)).map(row => JSON.parse(row.metaJson!)).find(e => e.kind === "intent" && e.intent.board === board.board);
  return intent.intent as { syncKey: string; batchKey: string; customId: string; fingerprint: string; syncReserveMicroUsd: number;
    batchReserveMicroUsd: number; deadlineAt: number; intentAt: number };
}

describe("Opus scene-quality questions through Message Batches", () => {
  it("delivers a whole 27-appearance world at the batch price, with no Opus question asked synchronously and every bill counted once", async () => {
    const gameId = "batch-world-full", w = await world(gameId), seeded = (await w.budget.audit(w.worldId)).settledMicroUsd;
    const fake = new FakeBatches(opus()), request = sol(gameId), renders: string[] = [];
    const container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    let ticks = 0, status = "";
    for (; ticks < 400; ticks++) {
      const result = await runLocalPatchWorldSlice(container, painter(gameId, renders), gameId, { hardDeadlineAt: Date.now() + 270_000 });
      expect(result.attention).toBeNull();
      // The provider answers in its own time, between the worker's slices.
      if (ticks % 2) fake.end();
      status = (await db.game.findUniqueOrThrow({ where: { id: gameId } })).status;
      if (["READY", "DELIVERED"].includes(status)) break;
    }
    expect(["READY", "DELIVERED"]).toContain(status);
    const game = await db.game.findUniqueOrThrow({ where: { id: gameId } });
    expect(GameConfigSchema.parse(JSON.parse(game.configJson!)).scenes.flatMap(s => s.targets)).toHaveLength(27);
    expect(await db.auditLog.count({ where: { entityId: gameId, action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(27);
    // Every Opus question went by batch, once, one question per batch; Sol stayed synchronous.
    expect(qualityCalls(request)).toBe(0);
    expect(request.mock.calls.filter(([question]) => question.role === "head-continuity")).toHaveLength(27);
    expect(fake.creates).toBe(27); expect(fake.batches.every(b => b.requests.length === 1 && !b.cancelled)).toBe(true);
    expect(renders).toHaveLength(27);
    // Money: renders, Opus at half its standard 18,000, Sol at its own 10,000; each Opus bill once, its review key a linked alias.
    const audit = await w.budget.audit(w.worldId);
    expect(audit).toMatchObject({ held: false, reservedMicroUsd: 0, pendingRequestKeys: [], unknownRequestKeys: [] });
    expect(audit.linkedRequestKeys).toHaveLength(27);
    expect(audit.linkedRequestKeys.every(key => key.startsWith("self-repair:board:"))).toBe(true);
    expect(audit.settledMicroUsd - seeded).toBe(27 * 48_800 + 27 * 9_000 + 27 * 10_000);
    // Each published appearance's quality stage proves its own settled bill, as for a synchronous answer.
    for (const row of await rows(gameId)) {
      const stage = JSON.parse(row.judgeJson!).boardReview.dual.quality;
      expect(stage).toMatchObject({ costMicroUsd: 9_000, model: "claude-opus-5-5" });
      expect(await verifiedDualStage(db, w.worldId, stage, "scene-quality")).not.toBeNull();
    }
    // The provider's copies are deleted once kept: by the slices, and the last ones by the scheduled sweep.
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 270_000 });
    expect(fake.batches.every(b => b.deleted)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  }, 900_000);

  it("sends a board's three questions before any answer, buys nothing while they wait, then decides each at its own price", async () => {
    const gameId = "batch-board", w = await world(gameId), board = BOARDS[0]!;
    for (const hide of board.hides) await runLocalPatchHide(c, painter(gameId), { gameId, board, hide });
    const fake = new FakeBatches(opus()), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    for (let i = 0; i < 3; i++) expect(await review(container, gameId)).toMatchObject({ state: "pending", costCents: 0 });
    expect(fake.batches).toHaveLength(3);
    expect(new Set(fake.batches.map(b => boundHide(promptOf(b.requests[0]!.params)).hideId))).toEqual(new Set(board.hides.map(h => h.id)));
    // Waiting buys nothing and creates nothing more.
    for (let i = 0; i < 2; i++) expect(await review(container, gameId)).toMatchObject({ state: "pending", costCents: 0 });
    expect(fake.creates).toBe(3); expect(request).not.toHaveBeenCalled();
    const before = await w.budget.audit(w.worldId);
    expect(before.pendingRequestKeys.filter(key => key.startsWith("self-repair:batch:"))).toHaveLength(3);
    expect(before.pendingRequestKeys.filter(key => key.startsWith("self-repair:board:"))).toHaveLength(0);
    // Each holds half the synchronous reservation: every batch rate is half.
    const waitingIntent = await syncKeyOf(gameId);
    expect([waitingIntent.syncReserveMicroUsd, waitingIntent.batchReserveMicroUsd]).toEqual([250_000, 125_000]);
    expect(await w.budget.readRequest(w.worldId, waitingIntent.batchKey)).toMatchObject({ state: "pending", reserveMicroUsd: 125_000 });
    // The plan reports what is already reserved, not a new question.
    const plan = await planLocalPatchEvidenceRecovery(container, gameId);
    expect(plan.nextQuestions.find(q => q.boardId === board.board)).toMatchObject({ existing: "pending", requestKey: expect.stringMatching(/^self-repair:batch:/) });
    // The scheduled sweep leaves a generating game's rounds to its own slices.
    const calls = fake.calls.length;
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 270_000 });
    expect(fake.calls).toHaveLength(calls);
    fake.end();
    await advanceQualityBatches(container, gameId, async () => {});
    for (let i = 0; i < 6; i++) await review(container, gameId);
    expect(qualityCalls(request)).toBe(0);
    expect(request.mock.calls.filter(([question]) => question.role === "head-continuity")).toHaveLength(3);
    const reviewed = await rows(gameId);
    expect(reviewed.filter(row => JSON.parse(row.judgeJson!).reviewState === "board-review-complete" && row.status === "GENERATED")).toHaveLength(3);
    const audit = await w.budget.audit(w.worldId);
    expect(audit).toMatchObject({ held: false, unknownRequestKeys: [] });
    expect(audit.linkedRequestKeys).toHaveLength(3);
    // Kept twice, once per key, as the same bytes and the same bill.
    const intent = await syncKeyOf(gameId), store = new PrismaRetainedPurchaseStore(db);
    const [batch, sync] = [await store.get(w.worldId, intent.batchKey), await store.get(w.worldId, intent.syncKey)];
    expect(batch!.evidence).toEqual(sync!.evidence); expect(batch!.bytes.equals(sync!.bytes)).toBe(true);
    expect(JSON.parse(batch!.bytes.toString())).toMatchObject({ channel: "anthropic-message-batches", costUnknown: false, model: "claude-opus-5-5" });
    expect(batch!.evidence).toMatchObject({ amountMicroUsd: 9_000, providerNamespace: "anthropic:find-me-existing", rawUsage: { service_tier: "batch" } });
  }, 300_000);

  it("cancels a question still running at its deadline, and asks it synchronously only after the provider reports it unbilled", async () => {
    const gameId = "batch-deadline", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus()), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    expect(await review(container, gameId)).toMatchObject({ state: "pending" });
    const intent = await syncKeyOf(gameId);
    expect(intent.deadlineAt - intent.intentAt).toBe(QUALITY_BATCH_DEADLINE_MS);
    vi.setSystemTime(start + QUALITY_BATCH_DEADLINE_MS - 60_000);
    expect(await review(container, gameId)).toMatchObject({ state: "pending" });
    expect(fake.calls).not.toContain("cancel");
    vi.setSystemTime(start + QUALITY_BATCH_DEADLINE_MS + 1);
    expect(await review(container, gameId)).toMatchObject({ state: "pending", reason: expect.stringContaining("cancelled at its deadline") });
    expect(fake.batches[0]!.cancelled).toBe(true);
    expect(qualityCalls(request)).toBe(0);
    await review(container, gameId);
    // Canceled is documented as unbilled: the batch key settles at zero and the question is asked as for any game.
    expect(qualityCalls(request)).toBe(1);
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 0, rawUsage: { resultType: "canceled" } } });
    expect(await w.budget.readRequest(w.worldId, intent.syncKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 18_000 } });
    // The batch's reading was recorded before its outcome was decided from it (rule 6).
    expect(await eventNames(gameId)).toEqual(["cancel", "claim-1", "intent", readingName(fake.batches[0]!.id), "submitted", "terminal"]);
    expect(JSON.parse((await events(gameId)).find(row => row.id.endsWith("_terminal"))!.metaJson!)).toMatchObject({ kind: "fallback", resultType: "canceled" });
  }, 300_000);

  it("never creates twice: a create whose answer was lost waits out its grace, and a search records the batch it made", async () => {
    const gameId = "batch-lost-after", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus()), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    expect(await review(container, gameId)).toMatchObject({ state: "pending", reason: expect.stringContaining("answer was lost") });
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS - 1);
    expect(await review(container, gameId)).toMatchObject({ state: "pending", reason: expect.stringContaining("may still be in flight") });
    expect(fake.calls).toEqual(["create"]);
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    // The batch it made is still running: the search cannot rule it out, so nothing is created.
    expect(await review(container, gameId)).toMatchObject({ state: "pending", reason: expect.stringContaining("has not ended") });
    fake.end();
    await review(container, gameId);
    expect(fake.creates).toBe(1); expect(fake.batches).toHaveLength(1);
    const intent = await syncKeyOf(gameId);
    expect(await w.budget.readRequest(w.worldId, intent.syncKey)).toMatchObject({ state: "linked", evidence: { amountMicroUsd: 9_000 } });
    expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("never sends a lost create again: one no complete search finds is presumed lost, counted at the most, and asked synchronously", async () => {
    const gameId = "batch-lost-before", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus()), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-before-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    await review(container, gameId);
    // One create, ever: the search found nothing, and nothing is sent again.
    expect(fake.calls).toEqual(["create", "find"]); expect(fake.batches).toHaveLength(0);
    expect(await eventNames(gameId)).toEqual(["claim-1", "intent", "submitted", "terminal"]);
    expect(JSON.parse((await events(gameId)).find(row => row.id.endsWith("_submitted"))!.metaJson!)).toMatchObject({ kind: "presumed", n: 1 });
    expect(JSON.parse((await events(gameId)).find(row => row.id.endsWith("_terminal"))!.metaJson!)).toMatchObject({ kind: "fallback", batchId: null, resultType: "presumed-lost" });
    // Its charge is counted at the most it could be, never released; the question is asked synchronously.
    const intent = await syncKeyOf(gameId);
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "settled",
      evidence: { amountMicroUsd: intent.batchReserveMicroUsd, costBasis: "conservative-upper-estimate" } });
    expect(qualityCalls(request)).toBe(1);
    // A day later it is searched for once more, and a complete search that finds nothing ends the search.
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS + QUALITY_BATCH_LATE_SEARCH_MS);
    for (let i = 0; i < 2; i++) await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    expect(await eventNames(gameId)).toEqual(["claim-1", "found-1", "intent", "submitted", "terminal"]);
    expect(await eventOf(gameId, "found-1")).toMatchObject({ batchIds: [], complete: true, at: Date.now() });
  }, 300_000);

  it("decides a round's batch once: a stale search that found nothing stands down when another recorded the batch", async () => {
    const gameId = "batch-one-decision", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "onedecision"), request = sol(gameId);
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review({ ...c, visualReview: { request }, qualityBatch: fake } as Container, gameId);
    const [batch] = fake.batches as [FakeBatch];
    await db.game.update({ where: { id: gameId }, data: { status: "GENERATION_FAILED" } });
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    // The sweep's search does not see the batch yet; right after it last reads the round (its third read: the step's, the
    // search's, and the one recording what it found), another pass records it.
    fake.find = async () => ({ proven: [], undecided: false });
    const intent = await syncKeyOf(gameId), roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    let reads = 0;
    const container = { ...c, qualityBatch: fake, db: dbAround({ "auditLog.findMany": async (read, args) => {
      const rows = await read();
      if ((args[0] as { where?: { entityId?: string } } | undefined)?.where?.entityId === gameId && ++reads === 3) {
        for (const [name, event] of [["found-1", { kind: "found", n: 1, batchIds: [batch.id], complete: true, at: Date.now() }],
          ["submitted", { kind: "submitted", n: 1, batchId: batch.id, at: Date.now() }]] as const)
          await db.auditLog.create({ data: { id: `aud_qb_${roundId}_${name}`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game",
            entityId: gameId, metaJson: JSON.stringify(event) } });
      }
      return rows;
    } }) } as Container;
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    // The presumption lost the slot: the round's batch is the recorded one (cancelled, as the game is stopped), nothing counted as lost.
    expect(reads).toBeGreaterThanOrEqual(3);
    expect(await eventNames(gameId)).toEqual(["cancel", "claim-1", "found-1", "intent", "submitted"]);
    expect(JSON.parse((await events(gameId)).find(row => row.id.endsWith("_submitted"))!.metaJson!)).toMatchObject({ kind: "submitted", batchId: batch.id });
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).not.toMatchObject({ evidence: { costBasis: "conservative-upper-estimate" } });
    expect(fake.creates).toBe(1); expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("holds, with its charge unknown, a question two batches carry", async () => {
    const gameId = "batch-two", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus()), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    // Another batch carrying the same request, as a duplicated create would leave.
    fake.batches.push({ ...structuredClone(fake.batches[0]!), id: "msgbatch_duplicate" });
    fake.end();
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    expect(await review(container, gameId)).toMatchObject({ state: "held", reason: expect.stringContaining("2 batches carry this one question") });
    const intent = await syncKeyOf(gameId), audit = await w.budget.audit(w.worldId);
    expect(audit.held).toBe(true); expect(audit.unknownRequestKeys).toEqual([intent.batchKey]);
    expect(await w.budget.readRequest(w.worldId, intent.syncKey)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("waits out a rate-limited create, and holds one refused for good at zero rather than as an unknown charge", async () => {
    const gameId = "batch-refused", w = await world(gameId); await paintFirst(gameId); await paintFirst(gameId, BOARDS[1]!);
    const fake = new FakeBatches(opus()), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = [new QualityBatchRefused(429, "rate_limit_error", true), "ok", new QualityBatchRefused(400, "invalid_request_error", false)];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    expect(await review(container, gameId)).toMatchObject({ state: "pending", reason: expect.stringContaining("backoff") });
    vi.setSystemTime(start + QUALITY_BATCH_REFUSAL_BACKOFF_MS);
    expect(await review(container, gameId)).toMatchObject({ state: "pending" });
    expect(fake.batches).toHaveLength(1);
    // The other board's question is refused as invalid: zero, held for a person.
    expect(await review(container, gameId, BOARDS[1]!)).toMatchObject({ state: "held", reason: expect.stringContaining("400 invalid_request_error") });
    const refused = await syncKeyOf(gameId, BOARDS[1]!);
    expect(await w.budget.readRequest(w.worldId, refused.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 0 } });
    expect((await w.budget.audit(w.worldId)).held).toBe(false);
    expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("falls back to the synchronous question when every create was refused until the deadline", async () => {
    const gameId = "batch-refused-out", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus()), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = Array.from({ length: 10 }, () => new QualityBatchRefused(429, "rate_limit_error", true));
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    vi.setSystemTime(start + QUALITY_BATCH_DEADLINE_MS);
    await review(container, gameId);
    expect(qualityCalls(request)).toBe(1);
    const intent = await syncKeyOf(gameId);
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 0, rawUsage: { resultType: "never-created" } } });
    expect(fake.batches).toHaveLength(0);
  }, 300_000);

  it.each([
    ["an unpriced tier", { usage: { input_tokens: 2000, output_tokens: 500, service_tier: "priority" } }],
    ["no tier at all", { usage: { input_tokens: 2000, output_tokens: 500 } }],
    ["another model", { model: "claude-sonnet-5-5" }],
  ])("holds an answer from %s, keeping it with its charge unknown and asking nothing again", async (_label, over) => {
    const gameId = `batch-unpriced-${_label.replaceAll(" ", "-")}`, w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(() => over)), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId);
    fake.end();
    expect(await review(container, gameId)).toMatchObject({ state: "held", reason: expect.stringContaining("cannot be stated") });
    const intent = await syncKeyOf(gameId), audit = await w.budget.audit(w.worldId);
    expect(audit.unknownRequestKeys).toEqual([intent.batchKey]); expect(audit.held).toBe(true);
    const kept = await new PrismaRetainedPurchaseStore(db).get(w.worldId, intent.batchKey);
    expect(kept).toMatchObject({ evidence: null, unknownReason: expect.stringContaining("cannot be stated") });
    expect(await w.budget.readRequest(w.worldId, intent.syncKey)).toBeNull();
    expect(request).not.toHaveBeenCalled();
    for (let i = 0; i < 2; i++) expect(await review(container, gameId)).toMatchObject({ state: "held" });
    expect(fake.creates).toBe(1);
  }, 300_000);

  it("holds an invalid question at zero, and asks a server-errored one again synchronously", async () => {
    const gameId = "batch-errored", w = await world(gameId); await paintFirst(gameId); await paintFirst(gameId, BOARDS[1]!);
    const errored = (errorType: string) => (_params: Record<string, unknown>, customId: string): QualityBatchResult => ({ customId, type: "errored", errorType });
    const fake = new FakeBatches(errored("invalid_request_error")), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId);
    fake.end();
    expect(await review(container, gameId)).toMatchObject({ state: "held", reason: expect.stringContaining("refused as invalid") });
    expect(await w.budget.readRequest(w.worldId, (await syncKeyOf(gameId)).batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 0 } });
    fake.answer = errored("api_error");
    await review(container, gameId, BOARDS[1]!);
    fake.end();
    await review(container, gameId, BOARDS[1]!);
    expect(qualityCalls(request)).toBe(1);
    expect((await w.budget.audit(w.worldId)).held).toBe(false);
  }, 300_000);

  it("finishes a round interrupted after its bill or during its alias, with each bill recorded once", async () => {
    const gameId = "batch-resume", w = await world(gameId); await paintFirst(gameId); await paintFirst(gameId, BOARDS[1]!);
    const fake = new FakeBatches(opus()), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId); await review(container, gameId, BOARDS[1]!);
    const first = await syncKeyOf(gameId), second = await syncKeyOf(gameId, BOARDS[1]!);
    // The second board's alias was reserved, then the worker stopped.
    await w.budget.reserve(w.worldId, { requestKey: second.syncKey, scope: "judge", operationFingerprint: second.fingerprint, reserveMicroUsd: second.syncReserveMicroUsd });
    fake.end();
    await advanceQualityBatches(container, gameId, async () => {});
    // The first board's terminal record was lost after its bill was settled and kept.
    await db.auditLog.deleteMany({ where: { entityId: gameId, action: QUALITY_BATCH_ACTION, id: { endsWith: "_terminal" }, metaJson: { contains: fake.batches[0]!.id } } });
    const entries = async () => {
      const snapshot = JSON.parse((await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: w.worldId } })).snapshotJson) as { requests: { requestKey: string }[] };
      return [first.batchKey, first.syncKey, second.batchKey, second.syncKey].map(key => snapshot.requests.find(r => r.requestKey === key));
    };
    const before = await entries();
    await review(container, gameId); await review(container, gameId, BOARDS[1]!);
    for (const keys of [first, second]) {
      expect(await w.budget.readRequest(w.worldId, keys.batchKey)).toMatchObject({ state: "settled", reserveMicroUsd: keys.batchReserveMicroUsd, evidence: { amountMicroUsd: 9_000 } });
      expect(await w.budget.readRequest(w.worldId, keys.syncKey)).toMatchObject({ state: "linked", canonicalRequestKey: keys.batchKey, reserveMicroUsd: keys.syncReserveMicroUsd });
    }
    // The replayed round wrote its terminal record again and changed no bill.
    expect(await entries()).toEqual(before);
    expect(await eventNames(gameId)).toContain("terminal");
    expect(await w.budget.audit(w.worldId)).toMatchObject({ held: false, conflictRequestKeys: [], unknownRequestKeys: [] });
    expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("delivers a paid answer at the edge of the world's budget without buying the question again", async () => {
    const gameId = "batch-edge", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus()), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    // Earlier work leaves 200,000 of the world: room for the batch reservation, not for a synchronous one.
    const before = await w.budget.audit(w.worldId);
    await w.budget.importSettled(w.worldId, { scope: "image", operationFingerprint: "synthetic-earlier-work", evidence: { providerNamespace: "openai:find-me-existing",
      providerRequestId: `req-earlier-${gameId}`, usageId: `usage-earlier-${gameId}`, rawUsage: { synthetic: 1 }, model: "gpt-image-2",
      amountMicroUsd: before.capMicroUsd - 200_000 - before.committedMicroUsd, costBasis: "provider-billed" } });
    expect(await review(container, gameId)).toMatchObject({ state: "pending" });
    fake.end();
    for (let i = 0; i < 3; i++) await review(container, gameId);
    const intent = await syncKeyOf(gameId), audit = await w.budget.audit(w.worldId);
    expect(audit).toMatchObject({ held: false, unknownRequestKeys: [], pendingRequestKeys: [] });
    expect(audit.remainingMicroUsd).toBeLessThan(intent.syncReserveMicroUsd);
    expect(await w.budget.readRequest(w.worldId, intent.syncKey)).toMatchObject({ state: "linked", canonicalRequestKey: intent.batchKey, reserveMicroUsd: intent.syncReserveMicroUsd });
    // The paid answer was replayed and the review went on to its continuity question.
    expect(qualityCalls(request)).toBe(0);
    expect(request.mock.calls.filter(([question]) => question.role === "head-continuity")).toHaveLength(1);
    expect((await rows(gameId)).filter(row => JSON.parse(row.judgeJson!).reviewState === "board-review-complete")).toHaveLength(1);
  }, 300_000);

  it("writes the alias's answer again when a worker stopped between the alias and its copy", async () => {
    const gameId = "batch-alias-copy", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "aliascopy"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId);
    const intent = await syncKeyOf(gameId), store = new PrismaRetainedPurchaseStore(db);
    await db.$executeRawUnsafe(`CREATE TRIGGER stop_before_copy BEFORE INSERT ON FileBlob WHEN NEW.key = '${retainedPurchaseKey(w.worldId, intent.syncKey)}' `
      + "BEGIN SELECT RAISE(ABORT, 'worker stopped'); END");
    fake.end();
    try { await expect(review(container, gameId)).rejects.toThrow(); }
    finally { await db.$executeRawUnsafe("DROP TRIGGER stop_before_copy"); }
    expect(await w.budget.readRequest(w.worldId, intent.syncKey)).toMatchObject({ state: "linked" });
    expect(await store.get(w.worldId, intent.syncKey)).toBeNull();
    for (let i = 0; i < 2; i++) await review(container, gameId);
    expect(await store.get(w.worldId, intent.syncKey)).not.toBeNull();
    expect(qualityCalls(request)).toBe(0);
    expect(request.mock.calls.filter(([question]) => question.role === "head-continuity")).toHaveLength(1);
    expect((await rows(gameId)).filter(row => JSON.parse(row.judgeJson!).reviewState === "board-review-complete")).toHaveLength(1);
  }, 300_000);

  it("creates one batch when two workers ask the same question at once", async () => {
    const gameId = "batch-race", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus()), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await Promise.all([review(container, gameId), review(container, gameId), review(container, gameId)]);
    expect(fake.creates).toBe(1); expect(fake.batches).toHaveLength(1);
    expect((await eventNames(gameId)).filter(name => name.startsWith("claim"))).toEqual(["claim-1"]);
    expect((await w.budget.audit(w.worldId)).pendingRequestKeys.filter(key => key.startsWith("self-repair:batch:"))).toHaveLength(1);
  }, 300_000);

  it("never also batches a question the synchronous route already bought", async () => {
    const gameId = "batch-sync-owned", w = await world(gameId, { pinned: false }); await paintFirst(gameId);
    const fake = new FakeBatches(opus()), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId);
    expect(qualityCalls(request)).toBe(1);
    // The same game as if its draft had been pinned: its bought question still replays, unbatched.
    const donor = await createDraft({ ...c, pinDualVisualReview: true, visualReview: { request: vi.fn() }, dualVisualReviewRelease: DUAL_VISUAL_REVIEW_V3,
      qualityChannel: QUALITY_BATCH_CHANNEL } as unknown as Container, null, "he");
    const pin = await db.auditLog.findUniqueOrThrow({ where: { id: qualityChannelAuditId(donor.gameId) } });
    await db.auditLog.create({ data: { id: qualityChannelAuditId(gameId), actorType: "SYSTEM", action: pin.action, entityType: "Game", entityId: gameId,
      metaJson: pin.metaJson!.replace(donor.gameId, gameId) } });
    expect(await qualityChannelOf(db, gameId)).not.toBeNull();
    await review(container, gameId);
    expect(fake.calls).toEqual([]); expect(await events(gameId)).toEqual([]);
    expect(qualityCalls(request)).toBe(1);
    expect((await w.budget.audit(w.worldId)).pendingRequestKeys.filter(key => key.startsWith("self-repair:batch:"))).toEqual([]);
  }, 300_000);

  it("leaves a game without the pin exactly as it was: its Opus questions are synchronous and no batch exists", async () => {
    const gameId = "batch-unpinned", w = await world(gameId, { pinned: false }); await paintFirst(gameId);
    const fake = new FakeBatches(opus()), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    expect(await qualityChannelOf(db, gameId)).toBeNull();
    await review(container, gameId); await review(container, gameId);
    expect(qualityCalls(request)).toBe(1);
    expect(fake.calls).toEqual([]);
    expect(await events(gameId)).toEqual([]);
    expect((await w.budget.audit(w.worldId)).linkedRequestKeys).toEqual([]);
  }, 300_000);

  it("refuses to buy for a pinned game on a box without the batch channel", async () => {
    const gameId = "batch-unconfigured"; await world(gameId); await paintFirst(gameId);
    const request = sol(gameId), container = { ...c, visualReview: { request } } as Container;
    await expect(review(container, gameId)).rejects.toThrow("not configured here");
    expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("for a deleted game: settles a late answer without keeping it, cancels what still runs, deletes the provider's copies", async () => {
    const gameId = "batch-deleted", w = await world(gameId); await paintFirst(gameId); await paintFirst(gameId, BOARDS[1]!);
    const fake = new FakeBatches(opus()), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId); await review(container, gameId, BOARDS[1]!);
    const answered = await syncKeyOf(gameId), running = await syncKeyOf(gameId, BOARDS[1]!);
    // The first board's batch has finished at the provider; nobody has read it yet. The second still runs.
    const [done] = fake.batches; done!.status = "ended"; done!.results = done!.requests.map(r => fake.answer(r.params, r.customId));
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    for (let i = 0; i < 3; i++) await sweepQualityBatches(container, { deadlineAt: Date.now() + 270_000 });
    expect(await w.budget.readRequest(w.worldId, answered.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 9_000 } });
    expect(await new PrismaRetainedPurchaseStore(db).get(w.worldId, answered.batchKey)).toBeNull();
    expect(fake.batches[1]!.cancelled).toBe(true);
    expect(await w.budget.readRequest(w.worldId, running.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 0, rawUsage: { resultType: "canceled" } } });
    for (const keys of [answered, running]) expect(await w.budget.readRequest(w.worldId, keys.syncKey)).toBeNull();
    expect(fake.batches.every(b => b.deleted)).toBe(true);
    expect(await w.budget.audit(w.worldId)).toMatchObject({ pendingRequestKeys: [], unknownRequestKeys: [] });
    expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("stops a slice at a round record it cannot read, with the reason on the job", async () => {
    const gameId = "batch-corrupt-slice"; await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus()), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId);
    await db.auditLog.updateMany({ where: { entityId: gameId, action: QUALITY_BATCH_ACTION, id: { endsWith: "_intent" } }, data: { metaJson: JSON.stringify({ kind: "intent" }) } });
    await expect(runLocalPatchWorldSlice(container, painter(gameId), gameId, { hardDeadlineAt: Date.now() + 270_000 })).rejects.toThrow("cannot be read");
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } })).toMatchObject({ status: "FAILED", lastError: expect.stringContaining("cannot be read") });
    expect(fake.creates).toBe(1); expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("sweeps past a game whose round record it cannot read", async () => {
    const broken = "batch-sweep-broken", deleted = "batch-sweep-deleted";
    await world(broken); await paintFirst(broken);
    const owner = await world(deleted); await paintFirst(deleted);
    const fake = new FakeBatches(opus()), request = sol(broken), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, broken); await review(container, deleted);
    expect(fake.batches).toHaveLength(2);
    await db.auditLog.updateMany({ where: { entityId: broken, action: QUALITY_BATCH_ACTION, id: { endsWith: "_intent" } }, data: { metaJson: JSON.stringify({ kind: "intent" }) } });
    await db.game.update({ where: { id: broken }, data: { status: "GENERATION_FAILED" } });
    expect(await deleteGame(c, deleted, { type: "USER", id: owner.userId }, owner.userId)).toBe(true);
    // (The sweep reads every game's records, so an earlier test's unreadable round is counted too.)
    expect((await sweepQualityBatches(container, { deadlineAt: Date.now() + 270_000 })).failed).toBeGreaterThanOrEqual(1);
    // Whatever order the games come in, the deleted game's running batch is cancelled.
    expect(fake.batches.map(b => b.cancelled)).toEqual([false, true]);
  }, 300_000);

  it("purges a delivered batch answer with the game that owned it", async () => {
    const gameId = "batch-purged", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus()), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId); fake.end(); await review(container, gameId);
    const intent = await syncKeyOf(gameId), store = new PrismaRetainedPurchaseStore(db);
    expect(await store.get(w.worldId, intent.batchKey)).not.toBeNull(); expect(await store.get(w.worldId, intent.syncKey)).not.toBeNull();
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    expect(await store.get(w.worldId, intent.batchKey)).toBeNull(); expect(await store.get(w.worldId, intent.syncKey)).toBeNull();
    // Accounting survives the deletion: both bills, counted once.
    expect(await w.budget.readRequest(w.worldId, intent.syncKey)).toMatchObject({ state: "linked" });
  }, 300_000);

  it("records a found batch only once no other that could carry the question still runs, and deletes every batch a hold names", async () => {
    const gameId = "batch-two-running", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "twofound"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    // A duplicate of the lost create still runs; the first batch has ended, canceled (documented unbilled).
    fake.batches.push({ ...structuredClone(fake.batches[0]!), id: "msgbatch_twofound_duplicate" });
    const first = fake.batches[0]!;
    first.status = "ended"; first.results = first.requests.map(r => ({ customId: r.customId, type: "canceled" as const }));
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    for (let i = 0; i < 2; i++) expect(await review(container, gameId)).toMatchObject({ state: "pending", reason: expect.stringContaining("has not ended") });
    // The proven copy is kept, with what proved it, but nothing is decided, released or asked: the running one may still bill the question.
    const intent = await syncKeyOf(gameId);
    expect(await eventNames(gameId)).toEqual(["claim-1", "found-1", "intent", readingName(first.id)]);
    expect(await foundOf(gameId)).toEqual([first.id]);
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "pending", reserveMicroUsd: intent.batchReserveMicroUsd });
    expect(request).not.toHaveBeenCalled();
    // It ends carrying the question too: held, with both batches kept.
    fake.end();
    expect(await review(container, gameId)).toMatchObject({ state: "held", reason: expect.stringContaining("2 batches carry") });
    expect(await foundOf(gameId)).toEqual([first.id, "msgbatch_twofound_duplicate"]);
    expect(fake.creates).toBe(1); expect(request).not.toHaveBeenCalled();
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 270_000 });
    expect(fake.batches.map(b => b.deleted)).toEqual([true, true]);
  }, 300_000);

  it("deletes a held round's batch with its deleted game, keeping the unknown charge and buying nothing", async () => {
    const gameId = "batch-deleted-held", w = await world(gameId); await paintFirst(gameId);
    const unpriced = { usage: { input_tokens: 2000, output_tokens: 500, service_tier: "priority" } };
    const fake = new FakeBatches(opus(() => unpriced), "heldgone"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId); fake.end();
    expect(await review(container, gameId)).toMatchObject({ state: "held", reason: expect.stringContaining("cannot be stated") });
    // While the game lives, a held round keeps its batch for the person reconciling it.
    await advanceQualityBatches(container, gameId, async () => {});
    expect(fake.batches[0]!.deleted).toBe(false);
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    for (let i = 0; i < 3; i++) await sweepQualityBatches(container, { deadlineAt: Date.now() + 270_000 });
    expect(fake.batches[0]!.deleted).toBe(true);
    expect(await eventNames(gameId)).toContain("deleted-1");
    const intent = await syncKeyOf(gameId), audit = await w.budget.audit(w.worldId);
    expect(audit.unknownRequestKeys).toEqual([intent.batchKey]); expect(audit.held).toBe(true);
    // The deleted game kept no answer, but the hold keeps what the provider returned: its receipt and its usage.
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "held", charge: "unknown", batchId: fake.batches[0]!.id,
      results: [{ type: "succeeded", requestId: expect.stringMatching(/^msg_synthetic_/), usage: unpriced.usage }] });
    expect(fake.creates).toBe(1); expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("keeps the batch key in deletion's inventory when a worker stops right after the round's intent", async () => {
    const gameId = "batch-stopped-after-intent", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus()), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    // The worker stops after the intent: the next write it makes for the batch key never lands.
    await db.$executeRawUnsafe(`CREATE TRIGGER stop_after_intent BEFORE INSERT ON AuditLog WHEN NEW.action = '${SELF_REPAIR_REQUEST_ACTION}' `
      + "AND NEW.metaJson LIKE '%self-repair:batch:%' BEGIN SELECT RAISE(ABORT, 'worker stopped'); END");
    // (Prisma reports the trigger's abort under its own wording.)
    try { await expect(review(container, gameId)).rejects.toThrow("auditLog.upsert"); }
    finally { await db.$executeRawUnsafe("DROP TRIGGER stop_after_intent"); }
    expect(await eventNames(gameId)).toEqual(["intent"]);
    // Resumed, the round goes on to its answer and alias; both are kept.
    await review(container, gameId); fake.end(); await review(container, gameId);
    const intent = await syncKeyOf(gameId), store = new PrismaRetainedPurchaseStore(db);
    expect(await store.get(w.worldId, intent.batchKey)).not.toBeNull(); expect(await store.get(w.worldId, intent.syncKey)).not.toBeNull();
    expect(fake.creates).toBe(1);
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    expect(await store.get(w.worldId, intent.batchKey)).toBeNull(); expect(await store.get(w.worldId, intent.syncKey)).toBeNull();
  }, 300_000);

  it("reaches every stopped game's round even when one round is slow and failing on every tick", async () => {
    const slow = "batch-sweep-a-slow", later = "batch-sweep-b-later";
    const owners = [await world(slow), await world(later)]; await paintFirst(slow); await paintFirst(later);
    const fake = new FakeBatches(opus(), "rotation"), container = { ...c, visualReview: { request: sol(slow) }, qualityBatch: fake } as Container;
    await review(container, slow); await review(container, later);
    const [slowBatch, laterBatch] = fake.batches;
    for (const [gameId, owner] of [[slow, owners[0]!], [later, owners[1]!]] as const) expect(await deleteGame(c, gameId, { type: "USER", id: owner.userId }, owner.userId)).toBe(true);
    // The provider answers about the slow game's batch six seconds late, then fails, every time.
    vi.useFakeTimers({ toFake: ["Date"] });
    const status = fake.status.bind(fake);
    let slowReads = 0;
    fake.status = async (id: string) => {
      if (id !== slowBatch!.id) return status(id);
      slowReads++; vi.setSystemTime(Date.now() + 6_000); throw Error("timed out");
    };
    // One sweep a minute, each with the tick's forty seconds.
    const start = Date.now();
    for (let tick = 0; tick < 60 && !laterBatch!.cancelled; tick++) {
      vi.setSystemTime(start + tick * 60_000);
      await sweepQualityBatches(container, { deadlineAt: Date.now() + 40_000 });
    }
    expect(laterBatch!.cancelled).toBe(true);
    expect(slowReads).toBeGreaterThan(0); expect(slowBatch!.cancelled).toBe(false);
  }, 300_000);

  it("leaves the charge undecided when the provider's results contradict its own counts (the real transport, scripted)", async () => {
    const gameId = "batch-contradiction", w = await world(gameId); await paintFirst(gameId);
    // The batch's record counts one success; its results file calls that request canceled.
    let customId = "";
    const fetchOnce = vi.fn<typeof fetch>(async (url, init) => {
      const method = init?.method ?? "GET", path = new URL(String(url)).pathname, id = "msgbatch_contradiction";
      if (method === "POST" && path === "/v1/messages/batches") {
        customId = (JSON.parse(String(init!.body)) as { requests: { custom_id: string }[] }).requests[0]!.custom_id;
        return new Response(JSON.stringify({ id, processing_status: "in_progress" }), { status: 200 });
      }
      if (method === "GET" && path === `/v1/messages/batches/${id}`)
        return new Response(JSON.stringify({ id, processing_status: "ended", request_counts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 } }), { status: 200 });
      if (method === "GET" && path === `/v1/messages/batches/${id}/results`) return new Response(JSON.stringify({ custom_id: customId, result: { type: "canceled" } }), { status: 200 });
      throw Error(`unexpected ${method} ${path}`);
    });
    const request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: new AnthropicMessageBatches("synthetic", fetchOnce) } as Container;
    await review(container, gameId);
    for (let i = 0; i < 2; i++) expect(await review(container, gameId)).toMatchObject({ state: "pending", reason: expect.stringContaining("do not match its record") });
    const intent = await syncKeyOf(gameId);
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "pending", reserveMicroUsd: intent.batchReserveMicroUsd });
    expect(await eventNames(gameId)).toEqual(["claim-1", "intent", "submitted"]);
    expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("holds a question at its second copy for good, keeps searching for the rest, and deletes each copy of a deleted game as it is found", async () => {
    const gameId = "batch-three-copies", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "threecopies"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    // Codex's case: three copies of the lost create; two have ended carrying the question, the third still runs.
    for (const name of ["b", "c"]) fake.batches.push({ ...structuredClone(fake.batches[0]!), id: `msgbatch_threecopies_${name}` });
    const [first, second, third] = fake.batches as [FakeBatch, FakeBatch, FakeBatch];
    for (const batch of [first, second]) { batch.status = "ended"; batch.results = batch.requests.map(r => fake.answer(r.params, r.customId)); }
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    expect(await review(container, gameId)).toMatchObject({ state: "held", reason: expect.stringContaining("2 batches carry") });
    // Held at once and for good, with both copies kept, each with what proved it; the search for the third goes on.
    const intent = await syncKeyOf(gameId);
    expect((await w.budget.audit(w.worldId)).unknownRequestKeys).toEqual([intent.batchKey]);
    expect(await eventNames(gameId)).toEqual(["claim-1", "found-1", "intent", ...[first.id, second.id].map(readingName).sort(), "terminal"]);
    expect(await foundOf(gameId)).toEqual([first.id, second.id]);
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    // The deleted game's copies are deleted as they are known; the running third is still searched for.
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 270_000 });
    expect(fake.batches.map(batch => batch.deleted)).toEqual([true, true, false]);
    // The third ends carrying it too: found, and deleted in the same pass.
    third.status = "ended"; third.results = third.requests.map(r => fake.answer(r.params, r.customId));
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 270_000 });
    expect(await foundOf(gameId)).toEqual([first.id, second.id, third.id]);
    expect(fake.batches.map(batch => batch.deleted)).toEqual([true, true, true]);
    expect((await w.budget.audit(w.worldId)).unknownRequestKeys).toEqual([intent.batchKey]);
    expect(request).not.toHaveBeenCalled(); expect(fake.creates).toBe(1);
  }, 300_000);

  it("never forgets a proven copy: a later search that no longer sees it neither releases the charge nor creates again", async () => {
    const gameId = "batch-forgotten-copy", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "forgotten"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    // One copy has ended carrying the question while another batch that could carry it still runs.
    const [copy] = fake.batches as [FakeBatch];
    fake.batches.push({ ...structuredClone(copy), id: "msgbatch_forgotten_other", requests: [{ customId: "q-someone-else", params: {} }] });
    const other = fake.batches[1]!;
    copy.status = "ended"; copy.results = copy.requests.map(r => ({ customId: r.customId, type: "canceled" as const }));
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    expect(await review(container, gameId)).toMatchObject({ state: "pending", reason: expect.stringContaining("has not ended") });
    expect(await foundOf(gameId)).toEqual([copy.id]);
    // Codex's case: the copy then vanishes from the provider's list (deleted by someone else), and the other ends without it.
    copy.deleted = true; other.status = "ended"; other.results = [{ customId: "q-someone-else", type: "canceled" }];
    for (let i = 0; i < 3; i++) await review(container, gameId);
    // The kept copy stays the round's batch: it is never "proven absent", so nothing is created and nothing released.
    expect(fake.creates).toBe(1);
    const intent = await syncKeyOf(gameId);
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "pending" });
    expect(await eventNames(gameId)).toEqual(["claim-1", "found-1", "intent", readingName(copy.id), "submitted"]);
    expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("ends a deleted game's round that never reached the provider, with nothing billed and nothing left to sweep", async () => {
    const gameId = "batch-deleted-unsent", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "unsent"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    // Codex's crash window: the worker stops after the intent, before the reservation; the game is then deleted.
    await db.$executeRawUnsafe(`CREATE TRIGGER stop_before_reserve BEFORE INSERT ON AuditLog WHEN NEW.action = '${SELF_REPAIR_REQUEST_ACTION}' `
      + "AND NEW.metaJson LIKE '%self-repair:batch:%' BEGIN SELECT RAISE(ABORT, 'worker stopped'); END");
    try { await expect(review(container, gameId)).rejects.toThrow("auditLog.upsert"); }
    finally { await db.$executeRawUnsafe("DROP TRIGGER stop_before_reserve"); }
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 270_000 });
    // The close took the claim a create would have taken, then ended the round.
    expect(await eventNames(gameId)).toEqual(["claim-1", "intent", "terminal"]);
    expect(JSON.parse((await events(gameId)).find(row => row.id.endsWith("_claim-1"))!.metaJson!)).toMatchObject({ closing: true });
    expect(JSON.parse((await events(gameId)).find(row => row.id.endsWith("_terminal"))!.metaJson!)).toMatchObject({ kind: "fallback", batchId: null, resultType: "never-created" });
    const intent = await syncKeyOf(gameId);
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toBeNull();
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 270_000 });
    expect(await eventNames(gameId)).toEqual(["claim-1", "intent", "terminal"]);
    // (The sweep also reads rounds earlier tests left behind; this one never sent anything.)
    expect(fake.creates).toBe(0); expect(fake.batches).toEqual([]); expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("gives provider calls their window once the records are read, however long reading them took", async () => {
    const gameId = "batch-slow-records", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "slowrecords");
    await review({ ...c, visualReview: { request: sol(gameId) }, qualityBatch: fake } as Container, gameId);
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    vi.useFakeTimers({ toFake: ["Date"] });
    // Codex's case, made longer than the whole window: reading the records takes 42 seconds, 21 for the rounds and 21 for the games.
    const slowOnce = () => { let slow = true; return async (read: () => Promise<unknown>) => { if (slow) { slow = false; vi.setSystemTime(Date.now() + 21_000); } return read(); }; };
    const container = { ...c, db: dbAround({ "auditLog.findMany": slowOnce(), "game.findMany": slowOnce() }), qualityBatch: fake } as Container;
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    expect(fake.batches[0]!.cancelled).toBe(true);
  }, 300_000);

  it("leaves a game resumed after the sweep read its records to its own slices", async () => {
    const gameId = "batch-resumed", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "resumed");
    await review({ ...c, visualReview: { request: sol(gameId) }, qualityBatch: fake } as Container, gameId);
    await db.game.update({ where: { id: gameId }, data: { status: "GENERATION_FAILED" } });
    // Codex's case: the game is resumed just after the sweep has read the games' states.
    const container = { ...c, qualityBatch: fake, db: dbAround({ "game.findMany": async read => {
      const states = await read();
      await db.game.update({ where: { id: gameId }, data: { status: "TARGETS_GENERATING" } });
      return states;
    } }) } as Container;
    const [batch] = fake.batches as [FakeBatch], status = fake.status.bind(fake), polled: string[] = [];
    fake.status = async (id: string) => { if (id === batch.id) polled.push(id); return status(id); };
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    // Its round is not touched at all: not polled, let alone cancelled.
    expect(polled).toEqual([]);
    expect(batch.cancelled).toBe(false);
    expect(await w.budget.readRequest(w.worldId, (await syncKeyOf(gameId)).batchKey)).toMatchObject({ state: "pending" });
  }, 300_000);

  it("leaves a resumed game's batch running when the game resumed while its status was being read", async () => {
    const gameId = "batch-resumed-during-status", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "resumedstatus");
    await review({ ...c, visualReview: { request: sol(gameId) }, qualityBatch: fake } as Container, gameId);
    await db.game.update({ where: { id: gameId }, data: { status: "GENERATION_FAILED" } });
    // Codex's case: the game resumes while the sweep waits for this batch's status.
    const [batch] = fake.batches as [FakeBatch], status = fake.status.bind(fake);
    fake.status = async (id: string) => { if (id === batch.id) await db.game.update({ where: { id: gameId }, data: { status: "TARGETS_GENERATING" } }); return status(id); };
    await sweepQualityBatches({ ...c, qualityBatch: fake } as Container, { deadlineAt: Date.now() + 230_000 });
    expect(batch.cancelled).toBe(false);
    expect(await w.budget.readRequest(w.worldId, (await syncKeyOf(gameId)).batchKey)).toMatchObject({ state: "pending" });
  }, 300_000);

  it("stands a close down when a worker claimed the create after the close read the round", async () => {
    const gameId = "batch-close-race", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "closerace"), request = sol(gameId);
    // A worker reserved the batch key and stopped before its claim; the game then stopped generating.
    await db.$executeRawUnsafe(`CREATE TRIGGER stop_before_claim BEFORE INSERT ON AuditLog WHEN NEW.action = '${QUALITY_BATCH_ACTION}' `
      + "AND NEW.id LIKE '%claim-1' BEGIN SELECT RAISE(ABORT, 'worker stopped'); END");
    try { await expect(review({ ...c, visualReview: { request }, qualityBatch: fake } as Container, gameId)).rejects.toThrow(); }
    finally { await db.$executeRawUnsafe("DROP TRIGGER stop_before_claim"); }
    const intent = await syncKeyOf(gameId);
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "pending" });
    await db.game.update({ where: { id: gameId }, data: { status: "GENERATION_FAILED" } });
    // Codex's interleaving: right after the sweep reads this round, a resumed worker claims its create.
    const intentRow = (await events(gameId)).find(row => row.id.endsWith("_intent"))!, roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec(intentRow.id)![1]!;
    let claimed = false;
    const container = { ...c, qualityBatch: fake, db: dbAround({ "auditLog.findMany": async (read, args) => {
      const rows = await read();
      if (!claimed && (args[0] as { where?: { entityId?: string } } | undefined)?.where?.entityId === gameId) {
        claimed = true;
        await db.auditLog.create({ data: { id: `aud_qb_${roundId}_claim-1`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game",
          entityId: gameId, metaJson: JSON.stringify({ kind: "claim", n: 1, at: Date.now() }) } });
      }
      return rows;
    } }) } as Container;
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    // The close lost the claim and stood down: nothing is released and the round goes on.
    expect(claimed).toBe(true);
    expect(await eventNames(gameId)).toEqual(["claim-1", "intent"]);
    expect(JSON.parse((await events(gameId)).find(row => row.id.endsWith("_claim-1"))!.metaJson!)).not.toHaveProperty("closing");
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "pending" });
    expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("gives each sweep round room for the calls it needs: a status slow on every tick no longer keeps its cancel out", async () => {
    const gameId = "batch-slow-status", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "slowstatus");
    await review({ ...c, visualReview: { request: sol(gameId) }, qualityBatch: fake } as Container, gameId);
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    vi.useFakeTimers({ toFake: ["Date"] });
    // Codex's case: every status of this batch takes 29 seconds, on every tick.
    const [batch] = fake.batches as [FakeBatch], status = fake.status.bind(fake), cancel = fake.cancel.bind(fake), starts: number[] = [];
    fake.status = async (id: string) => { if (id === batch.id) { starts.push(Date.now()); vi.setSystemTime(Date.now() + 29_000); } return status(id); };
    fake.cancel = async (id: string) => { if (id === batch.id) starts.push(Date.now()); return cancel(id); };
    // A tick with 59 seconds left: after the status, 30 remain, too few to start the cancel.
    await sweepQualityBatches({ ...c, qualityBatch: fake } as Container, { deadlineAt: Date.now() + 59_000 });
    expect(batch.cancelled).toBe(false); expect(starts).toHaveLength(1);
    // A full tick: the round's own budget fits its status and its cancel, each started with room for its timeout.
    vi.setSystemTime(Date.now() + 60_000); starts.length = 0;
    const opened = Date.now(), deadlineAt = opened + 230_000;
    await sweepQualityBatches({ ...c, qualityBatch: fake } as Container, { deadlineAt });
    expect(batch.cancelled).toBe(true);
    expect(starts).toHaveLength(2);
    expect(starts.every(at => Math.min(deadlineAt, starts[0]! + QUALITY_BATCH_SWEEP_ROUND_MS) - at >= 30_000)).toBe(true);
  }, 300_000);

  it("deletes a deleted game's copies across ticks when the provider is slow, recording each deletion", async () => {
    const gameId = "batch-slow-removes", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "slowremoves"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    // Four copies of one question (which only the provider could make), all ended carrying it.
    for (const name of ["b", "c", "d"]) fake.batches.push({ ...structuredClone(fake.batches[0]!), id: `msgbatch_slowremoves_${name}` });
    fake.end();
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    expect(await review(container, gameId)).toMatchObject({ state: "held", reason: expect.stringContaining("4 batches carry") });
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    // Each deletion of this game's copies takes 29 seconds: three fit a round's budget, each starting with room.
    const remove = fake.remove.bind(fake), mine = new Set(fake.batches.map(batch => batch.id));
    fake.remove = async (id: string) => { if (mine.has(id)) vi.setSystemTime(Date.now() + 29_000); return remove(id); };
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    expect(fake.batches.filter(batch => batch.deleted)).toHaveLength(3);
    expect((await eventNames(gameId)).filter(name => name.startsWith("deleted"))).toEqual(["deleted-1"]);
    vi.setSystemTime(Date.now() + 60_000);
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    expect(fake.batches.map(batch => batch.deleted)).toEqual([true, true, true, true]);
    expect((await eventNames(gameId)).filter(name => name.startsWith("deleted"))).toEqual(["deleted-1", "deleted-2"]);
  }, 300_000);

  it("deletes a copy the provider will delete, though the others' slow refusals use up any tick that starts with all three", async () => {
    const gameId = "batch-slow-refusals", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "slowrefusals"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    for (const name of ["b", "c", "d"]) fake.batches.push({ ...structuredClone(fake.batches[0]!), id: `msgbatch_slowrefusals${name}` });
    fake.end();
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    expect(await review(container, gameId)).toMatchObject({ state: "held", reason: expect.stringContaining("4 batches carry") });
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    // Codex's case: three deletions each fail after their thirty-second timeout, every time; the fourth would go at once.
    // A different copy first each minute: only a tick that starts with the first of the three runs out of room.
    const deletable = fake.batches[3]!, refused = new Set(fake.batches.slice(0, 3).map(batch => batch.id)), remove = fake.remove.bind(fake);
    fake.remove = async (id: string) => { if (refused.has(id)) { vi.setSystemTime(Date.now() + 30_000); throw Error("deletion refused"); } return remove(id); };
    for (let tick = 1; tick <= 30 && !deletable.deleted; tick++) {
      vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS + tick * 60_000);
      await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    }
    expect(fake.batches.map(batch => batch.deleted)).toEqual([false, false, false, true]);
    expect(fake.creates).toBe(1); expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("sends a create only with room for its whole timeout, read again after the ledger's work and after the claim", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const started = async (gameId: string) => await db.auditLog.count({ where: { entityId: gameId, action: QUALITY_BATCH_ACTION } }) > 0;
    // Codex's probe: 101 seconds left on arrival, and the ledger's work then takes 11 of them. Nothing is claimed or sent.
    const ledger = "batch-room-ledger"; await world(ledger); await paintFirst(ledger);
    const fakeLedger = new FakeBatches(opus(), "roomledger");
    let slowLedger = false;
    const slowAtLedger = { ...c, visualReview: { request: sol(ledger) }, qualityBatch: fakeLedger, db: dbAround({ "worldBudgetLedger.findUnique": async read => {
      if (!slowLedger && await started(ledger)) { slowLedger = true; vi.setSystemTime(Date.now() + 11_000); }
      return read();
    } }) } as Container;
    expect(await review(slowAtLedger, ledger, BOARDS[0]!, 101_000)).toMatchObject({ state: "pending", reason: expect.stringContaining("too little") });
    expect(slowLedger).toBe(true);
    expect(await eventNames(ledger)).toEqual(["intent"]); expect(fakeLedger.creates).toBe(0);
    // The claim's own write takes 11 seconds: claimed, never sent, and recorded so.
    const claim = "batch-room-claim"; await world(claim); await paintFirst(claim);
    const fakeClaim = new FakeBatches(opus(), "roomclaim");
    const claims = () => db.auditLog.count({ where: { entityId: claim, action: QUALITY_BATCH_ACTION, id: { contains: "_claim-" } } });
    let slowClaim = false;
    const slowAtClaim = { ...c, visualReview: { request: sol(claim) }, qualityBatch: fakeClaim, db: dbAround({ "$transaction": async read => {
      const before = slowClaim ? 0 : await claims(), result = await read();
      if (!slowClaim && await claims() > before) { slowClaim = true; vi.setSystemTime(Date.now() + 11_000); }
      return result;
    } }) } as Container;
    expect(await review(slowAtClaim, claim, BOARDS[0]!, 100_000)).toMatchObject({ state: "pending", reason: expect.stringContaining("too little") });
    expect(slowClaim).toBe(true);
    expect(await eventNames(claim)).toEqual(["claim-1", "intent", "refused-1"]);
    expect(JSON.parse((await events(claim)).find(row => row.id.endsWith("_refused-1"))!.metaJson!)).toMatchObject({ errorType: "not-sent", transient: true });
    expect(fakeClaim.creates).toBe(0);
  }, 300_000);

  it("keeps searching a live game's held round for copies, though its parked job runs no slice", async () => {
    const gameId = "batch-parked-search", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "parked"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    for (const name of ["b", "c"]) fake.batches.push({ ...structuredClone(fake.batches[0]!), id: `msgbatch_parked_${name}` });
    const [first, second, third] = fake.batches as [FakeBatch, FakeBatch, FakeBatch];
    for (const batch of [first, second]) { batch.status = "ended"; batch.results = batch.requests.map(r => fake.answer(r.params, r.customId)); }
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    expect(await review(container, gameId)).toMatchObject({ state: "held" });
    // Codex's case: the held review parks the job; the game stays generating, and only the scheduled sweep runs. Its first
    // tick reads the two copies' bills for the person; the third still runs, so the search goes on.
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 270_000 });
    expect([await foundOf(gameId), (await latesOf(gameId)).map(bill => bill.batchId).sort()]).toEqual([[first.id, second.id], [first.id, second.id].sort()]);
    // With nothing left to read, only the search brings the round back to a tick, and it finds the third once it has ended.
    third.status = "ended"; third.results = third.requests.map(r => fake.answer(r.params, r.customId));
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 270_000 });
    expect(await foundOf(gameId)).toEqual([first.id, second.id, third.id]);
    // A live game's copies are kept for the person; nothing is bought, created or released.
    expect(fake.batches.map(batch => batch.deleted)).toEqual([false, false, false]);
    const intent = await syncKeyOf(gameId);
    expect((await w.budget.audit(w.worldId)).unknownRequestKeys).toEqual([intent.batchKey]);
    expect((await db.game.findUniqueOrThrow({ where: { id: gameId } })).status).toBe("TARGETS_GENERATING");
    expect(fake.creates).toBe(1); expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("searches once more a day after presuming a create lost, and reads the copy it finds for its bill before deleting it", async () => {
    const gameId = "batch-late-copy", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "latecopy"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    // Codex's case: the batch the lost create made is not listed yet when the search after the grace runs.
    const hidden = fake.batches.splice(0), [copy] = hidden as [FakeBatch];
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    await review(container, gameId);
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "fallback", resultType: "presumed-lost" });
    expect(qualityCalls(request)).toBe(1);
    // It is listed later, ended; the game is then deleted.
    fake.batches.push(...hidden); fake.end();
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    // Until a day has passed nothing looks for it: a batch the create made could still be running.
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    expect(await foundOf(gameId)).toEqual([]); expect(copy.deleted).toBe(false);
    // Then one more search finds it; its bill is read, and only then is it deleted. Unrelated batches keep running in the
    // workspace (Codex's sixth pass), every one created after the window its create could have used: the search ignores them.
    fake.batches.push({ id: "msgbatch_latecopyrolling", createdAt: start + 2 * HOUR, requests: [{ customId: "q-someone-else", params: {} }],
      status: "in_progress", results: null, cancelled: false, deleted: false });
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS + QUALITY_BATCH_LATE_SEARCH_MS);
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    expect(await foundOf(gameId)).toEqual([copy.id]);
    expect(await eventOf(gameId, "found-1")).toMatchObject({ complete: true });
    expect(await latesOf(gameId)).toMatchObject([{ batchId: copy.id, amountMicroUsd: 9_000 }]);
    expect(copy.deleted).toBe(true);
    // The presumption keeps its charge, without a conflict, and the copy is counted beside it by its own receipt: more than
    // was billed, never less, and nothing for a person to reconcile.
    const intent = await syncKeyOf(gameId), [bill] = await latesOf(gameId);
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "settled",
      evidence: { amountMicroUsd: intent.batchReserveMicroUsd, costBasis: "conservative-upper-estimate" }, conflicts: [] });
    expect(await w.budget.readRequest(w.worldId, `@import/${JSON.stringify([fake.namespace, bill!.results[0]!.requestId])}`))
      .toMatchObject({ state: "settled", origin: "imported", evidence: { amountMicroUsd: 9_000 } });
    // That search was complete: the round is not searched again.
    const recorded = await eventNames(gameId);
    expect(recorded).toEqual(["claim-1", "deleted-1", "found-1", "intent", "late-1", readingName(copy.id), "submitted", "terminal"]);
    vi.setSystemTime(Date.now() + 60_000);
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    expect(await eventNames(gameId)).toEqual(recorded);
    expect(fake.creates).toBe(1);
  }, 300_000);

  it("counts a copy found beside a presumption at its full bill, above the presumption too (the presumption won; the standard tier served)", async () => {
    const gameId = "batch-late-standard", w = await world(gameId); await paintFirst(gameId);
    // Codex's numbers: 1,000 tokens in and 6,500 out at the standard rate, 134,000 micro-USD.
    const standard = opus(() => ({ usage: { input_tokens: 1000, output_tokens: 6500, service_tier: "standard" } }));
    const fake = new FakeBatches(standard, "latestandard"), request = sol(gameId);
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review({ ...c, visualReview: { request }, qualityBatch: fake } as Container, gameId);
    const [copy] = fake.batches as [FakeBatch], intent = await syncKeyOf(gameId);
    expect(134_000).toBeGreaterThan(intent.batchReserveMicroUsd);
    fake.end();
    await db.game.update({ where: { id: gameId }, data: { status: "GENERATION_FAILED" } });
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    // Codex's interleaving: two searches at once. The sweep's sees nothing; the other proves the copy and records it just
    // after the sweep's last read of the round (its third: the step's, the search's, and the one recording what it found),
    // then loses the decision to the sweep's presumption.
    fake.find = async () => ({ proven: [], undecided: false });
    const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    let reads = 0;
    const container = { ...c, qualityBatch: fake, db: dbAround({ "auditLog.findMany": async (read, args) => {
      const rows = await read();
      if ((args[0] as { where?: { entityId?: string } } | undefined)?.where?.entityId === gameId && ++reads === 3)
        await db.auditLog.create({ data: { id: `aud_qb_${roundId}_found-1`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game",
          entityId: gameId, metaJson: JSON.stringify({ kind: "found", n: 1, batchIds: [copy.id], complete: true, at: Date.now() }) } });
      return rows;
    } }) } as Container;
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    expect(reads).toBeGreaterThanOrEqual(3);
    expect(await eventOf(gameId, "submitted")).toMatchObject({ kind: "presumed" });
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "fallback", resultType: "presumed-lost" });
    expect(await foundOf(gameId)).toEqual([copy.id]);
    // The next sweep reads the copy's bill before it deletes it, and counts it in full beside the presumption, by its own receipt.
    await sweepQualityBatches({ ...c, qualityBatch: fake } as Container, { deadlineAt: Date.now() + 230_000 });
    const [bill] = await latesOf(gameId);
    expect(bill).toMatchObject({ batchId: copy.id, amountMicroUsd: 134_000 });
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: intent.batchReserveMicroUsd }, conflicts: [] });
    expect(await w.budget.readRequest(w.worldId, `@import/${JSON.stringify([fake.namespace, bill!.results[0]!.requestId])}`))
      .toMatchObject({ state: "settled", origin: "imported", evidence: { amountMicroUsd: 134_000 } });
    expect(copy.deleted).toBe(true);
    expect(fake.creates).toBe(1); expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("holds the world when a late copy's bill cannot be stated, keeps what the provider returned, and deletes a parked game's copy by the scheduled tick alone", async () => {
    const gameId = "batch-late-unpriced", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(() => ({ usage: { input_tokens: 2000, output_tokens: 500, service_tier: "priority" } })), "lateunpriced");
    const request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    const hidden = fake.batches.splice(0), [copy] = hidden as [FakeBatch];
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    await review(container, gameId);
    fake.batches.push(...hidden); fake.end();
    // A day later the game is still generating, its job parked: only the scheduled sweep runs. With fifty seconds
    // left, the search runs but the copy's record and results, thirty seconds each at most, are not started (the search
    // here keeps no reading, so the copy's bill needs those two reads).
    searchKeepingNoReadings(fake);
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS + QUALITY_BATCH_LATE_SEARCH_MS);
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 50_000 });
    expect(await foundOf(gameId)).toEqual([copy.id]); expect(await latesOf(gameId)).toEqual([]);
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    // Served by a tier with no rate, its bill cannot be stated: recorded as its own unknown charge at the synchronous reservation,
    // which holds the world for a person, with what the provider returned for it (Codex's sixth pass) kept after the copy is gone.
    const intent = await syncKeyOf(gameId), [bill] = await latesOf(gameId);
    const usage = { input_tokens: 2000, output_tokens: 500, service_tier: "priority" };
    expect(bill).toMatchObject({ batchId: copy.id, amountMicroUsd: null, results: [{ type: "succeeded", requestId: expect.stringMatching(/^msg_synthetic_/), usage }] });
    // Its own row, bound to exactly what was read: the copy's id and the digest of what the provider returned for the question.
    const copyKey = `${intent.batchKey}:copy:${copy.id}:${createHash("sha256").update(canonical(bill!.results)).digest("hex")}`;
    expect(await w.budget.readRequest(w.worldId, copyKey)).toMatchObject({ state: "unknown", reserveMicroUsd: intent.syncReserveMicroUsd,
      unknownReasons: [expect.stringContaining(bill!.results[0]!.requestId!)] });
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: intent.batchReserveMicroUsd }, conflicts: [] });
    expect((await w.budget.audit(w.worldId)).held).toBe(true);
    // The game is still generating, its job parked: the scheduled tick deletes the copy once its bill is in the record.
    expect(copy.deleted).toBe(true);
    expect((await db.game.findUniqueOrThrow({ where: { id: gameId } })).status).toBe("TARGETS_GENERATING");
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(1);
  }, 300_000);

  it("counts every late copy of a presumed-lost create as a charge of its own, imported in full beside the presumption", async () => {
    const gameId = "batch-late-pair", w = await world(gameId); await paintFirst(gameId);
    // At the batch rate, 1,000 tokens in and 6,500 out are 67,000 micro-USD; two such copies, 134,000.
    const fake = new FakeBatches(opus(() => ({ usage: { input_tokens: 1000, output_tokens: 6500, service_tier: "batch" } })), "latepair");
    const request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    const hidden = fake.batches.splice(0);
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    await review(container, gameId);
    // Two copies of the lost create (which only the provider could make) are listed later, ended.
    fake.batches.push(...hidden, { ...structuredClone(hidden[0]!), id: "msgbatch_latepair_b" }); fake.end();
    const intent = await syncKeyOf(gameId);
    expect([67_000 <= intent.batchReserveMicroUsd, 134_000 > intent.batchReserveMicroUsd]).toEqual([true, true]);
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS + QUALITY_BATCH_LATE_SEARCH_MS);
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    const lates = await latesOf(gameId);
    expect(lates.map(late => late.amountMicroUsd)).toEqual([67_000, 67_000]);
    // Each copy is counted on its own, by its receipt, beside the presumption: 125,000 + 2 × 67,000 for 134,000 billed, never less.
    // Nothing is left for a person to reconcile.
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: intent.batchReserveMicroUsd }, conflicts: [] });
    for (const late of lates) expect(await w.budget.readRequest(w.worldId, `@import/${JSON.stringify([fake.namespace, late.results[0]!.requestId])}`))
      .toMatchObject({ state: "settled", origin: "imported", evidence: { amountMicroUsd: 67_000 } });
    expect((await w.budget.audit(w.worldId)).conflictRequestKeys).toEqual([]);
    expect(fake.batches.map(batch => batch.deleted)).toEqual([true, true]);
  }, 300_000);

  it("reads an ended batch in two calls, so slow records and slow reads fit one sweep round (the real transport, scripted)", async () => {
    const gameId = "batch-slow-ended", w = await world(gameId); await paintFirst(gameId);
    const id = "msgbatch_slowended", paths: string[] = [];
    let created: { custom_id: string; params: Record<string, unknown> } | null = null, slow = false;
    const fetchOnce = vi.fn<typeof fetch>(async (url, init) => {
      const method = init?.method ?? "GET", path = new URL(String(url)).pathname;
      if (method === "POST" && path === "/v1/messages/batches") {
        created = (JSON.parse(String(init!.body)) as { requests: { custom_id: string; params: Record<string, unknown> }[] }).requests[0]!;
        return new Response(JSON.stringify({ id, processing_status: "in_progress" }), { status: 200 });
      }
      if (!path.startsWith(`/v1/messages/batches/${id}`)) throw Error(`unexpected ${method} ${path}`);
      // Codex's case: the batch has ended, and every read of it takes 29 seconds, within its 30-second timeout.
      if (slow) { paths.push(`${method} ${path}`); vi.setSystemTime(Date.now() + 29_000); }
      if (method === "GET" && path === `/v1/messages/batches/${id}`)
        return new Response(JSON.stringify({ id, processing_status: slow ? "ended" : "in_progress",
          request_counts: { processing: slow ? 0 : 1, succeeded: slow ? 1 : 0, errored: 0, canceled: 0, expired: 0 } }), { status: 200 });
      if (method === "GET" && path === `/v1/messages/batches/${id}/results`) {
        const answer = opus()(created!.params, created!.custom_id) as Extract<QualityBatchResult, { type: "succeeded" }>;
        return new Response(JSON.stringify({ custom_id: created!.custom_id, result: { type: "succeeded", message: answer.message } }), { status: 200 });
      }
      throw Error(`unexpected ${method} ${path}`);
    });
    const transport = new AnthropicMessageBatches("synthetic", fetchOnce);
    await review({ ...c, visualReview: { request: sol(gameId) }, qualityBatch: transport } as Container, gameId);
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    vi.useFakeTimers({ toFake: ["Date"] });
    slow = true;
    // And every read of this game's round record takes eight seconds.
    const container = { ...c, qualityBatch: transport, db: dbAround({ "auditLog.findMany": async (read, args) => {
      if ((args[0] as { where?: { entityId?: string } } | undefined)?.where?.entityId === gameId) vi.setSystemTime(Date.now() + 8_000);
      return read();
    } }) } as Container;
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    // The status, then the results file: each started with room for its timeout, and the round settled in this one sweep.
    expect(paths).toEqual([`GET /v1/messages/batches/${id}`, `GET /v1/messages/batches/${id}/results`]);
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "answered", batchId: id });
    expect(await w.budget.readRequest(w.worldId, (await syncKeyOf(gameId)).batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 9_000 } });
  }, 300_000);

  it("settles at zero a reservation that committed after a close had ended its round unsent", async () => {
    const gameId = "batch-reserve-after-close", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "reserveclose"), request = sol(gameId);
    const inventoried = () => db.auditLog.count({ where: { entityId: gameId, action: SELF_REPAIR_REQUEST_ACTION, metaJson: { contains: "self-repair:batch:" } } });
    // Codex's interleaving: the worker has put the batch key in deletion's inventory and not yet reserved it when the game
    // stops; the sweep closes the round and finds no reservation to settle. The worker then reserves.
    let swept = false;
    const container = { ...c, visualReview: { request }, qualityBatch: fake, db: dbAround({ "$transaction": async run => {
      const result = await run();
      if (!swept && await inventoried() > 0) {
        swept = true;
        await db.game.update({ where: { id: gameId }, data: { status: "GENERATION_FAILED" } });
        await sweepQualityBatches({ ...c, qualityBatch: fake } as Container, { deadlineAt: Date.now() + 230_000 });
      }
      return result;
    } }) } as Container;
    // The worker's lease checks that its game is still generating, so its later writes are refused.
    const generating = async (tx: Prisma.TransactionClient) => {
      if ((await tx.game.findUniqueOrThrow({ where: { id: gameId } })).status !== "TARGETS_GENERATING") throw Error("stale generation fence");
    };
    await expect(reviewLocalPatchBoard(container, { ...scene(gameId), deadlineAt: Date.now() + 270_000 }, { fence: generating })).rejects.toThrow("stale generation fence");
    expect(swept).toBe(true);
    expect(await eventNames(gameId)).toEqual(["claim-1", "intent", "terminal"]);
    expect(await eventOf(gameId, "claim-1")).toMatchObject({ closing: true });
    // Nothing was or ever will be sent under the closed round, so the late reservation is settled at zero, not left pending.
    const intent = await syncKeyOf(gameId);
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 0 } });
    expect((await w.budget.audit(w.worldId)).pendingRequestKeys).toEqual([]);
    expect(fake.creates).toBe(0); expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("settles at zero, at the game's next slice, such a reservation when its worker stopped right after making it", async () => {
    const gameId = "batch-orphan-reserve", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "orphan"), request = sol(gameId);
    const inventoried = () => db.auditLog.count({ where: { entityId: gameId, action: SELF_REPAIR_REQUEST_ACTION, metaJson: { contains: "self-repair:batch:" } } });
    // The same interleaving, but the worker stops as soon as its reservation is written.
    let swept = false, stopped = false;
    const container = { ...c, visualReview: { request }, qualityBatch: fake, db: dbAround({
      "$transaction": async run => {
        const result = await run();
        if (!swept && await inventoried() > 0) {
          swept = true;
          await db.game.update({ where: { id: gameId }, data: { status: "GENERATION_FAILED" } });
          await sweepQualityBatches({ ...c, qualityBatch: fake } as Container, { deadlineAt: Date.now() + 230_000 });
        }
        return result;
      },
      "worldBudgetLedger.updateMany": async write => {
        const result = await write();
        if (swept && !stopped && (await w.budget.readRequest(w.worldId, (await syncKeyOf(gameId)).batchKey))?.state === "pending") { stopped = true; throw Error("worker stopped"); }
        return result;
      },
    }) } as Container;
    await expect(review(container, gameId)).rejects.toThrow("worker stopped");
    const intent = await syncKeyOf(gameId);
    expect(await eventNames(gameId)).toEqual(["claim-1", "intent", "terminal"]);
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "pending" });
    // The game resumes: its next slice's housekeeping settles the reservation at zero, as nothing was or will be sent under it.
    await db.game.update({ where: { id: gameId }, data: { status: "TARGETS_GENERATING" } });
    await advanceQualityBatches({ ...c, qualityBatch: fake } as Container, gameId, async () => {});
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 0 } });
    expect((await w.budget.audit(w.worldId)).pendingRequestKeys).toEqual([]);
    expect(fake.creates).toBe(0); expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("lets only the recorded outcome decide the charge: a stale hold that wins after the presumption holds it as unknown, and each copy is read before it goes", async () => {
    const gameId = "batch-stale-hold", w = await world(gameId); await paintFirst(gameId);
    // Two copies of one lost create (which only the provider could make), 67,000 micro-USD each at the batch rate: together above the presumption.
    const usage = { input_tokens: 1000, output_tokens: 6500, service_tier: "batch" };
    const fake = new FakeBatches(opus(() => ({ usage })), "stalehold"), request = sol(gameId);
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review({ ...c, visualReview: { request }, qualityBatch: fake } as Container, gameId);
    fake.batches.push({ ...structuredClone(fake.batches[0]!), id: "msgbatch_staleholdb" }); fake.end();
    const [first, second] = fake.batches as [FakeBatch, FakeBatch];
    await db.game.update({ where: { id: gameId }, data: { status: "GENERATION_FAILED" } });
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    // Codex's interleaving: the sweep's search sees nothing and presumes the create lost; another pass, deciding from a read taken
    // before that presumption, recorded both copies and holds the round, and its hold takes the outcome just before the presumption's.
    fake.find = async () => ({ proven: [], undecided: false });
    const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    const write = (name: string, event: unknown) => db.auditLog.create({ data: { id: `aud_qb_${roundId}_${name}`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION,
      entityType: "Game", entityId: gameId, metaJson: JSON.stringify(event) } });
    // (The sweep's reads of the round: the step's, the search's, the one recording what it found, then the next step's.)
    let reads = 0;
    const container = { ...c, qualityBatch: fake, db: dbAround({ "auditLog.findMany": async (read, args) => {
      const rows = await read();
      if ((args[0] as { where?: { entityId?: string } } | undefined)?.where?.entityId === gameId) {
        reads++;
        if (reads === 3) await write("found-1", { kind: "found", n: 1, batchIds: [first.id, second.id], complete: true, at: Date.now() });
        if (reads === 4) await write("terminal", { kind: "held", reason: "2 batches carry this one question", charge: "unknown", at: Date.now() });
      }
      return rows;
    } }) } as Container;
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    // The presumption lost the outcome, so it moved no money: the charge is held as unknown, in full, never settled at the presumption.
    const intent = await syncKeyOf(gameId);
    expect(reads).toBeGreaterThanOrEqual(5);
    expect(await eventOf(gameId, "submitted")).toMatchObject({ kind: "presumed" });
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "held", charge: "unknown" });
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "unknown" });
    expect((await w.budget.audit(w.worldId)).held).toBe(true);
    // The game is deleted: both copies are read, their receipts kept, before either is deleted.
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    await sweepQualityBatches({ ...c, qualityBatch: fake } as Container, { deadlineAt: Date.now() + 230_000 });
    const bills = await latesOf(gameId);
    expect(bills.map(bill => [bill.batchId, bill.amountMicroUsd, bill.results[0]?.usage]).sort()).toEqual([[first.id, 67_000, usage], [second.id, 67_000, usage]].sort());
    expect([first.deleted, second.deleted]).toEqual([true, true]);
    // The held key waits for a person; each copy's bill is already counted on its own, so whatever the person settles it at, nothing is lost.
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "unknown" });
    for (const bill of bills) expect(await w.budget.readRequest(w.worldId, `@import/${JSON.stringify([fake.namespace, bill.results[0]!.requestId])}`))
      .toMatchObject({ state: "settled", evidence: { amountMicroUsd: 67_000 } });
    expect(fake.creates).toBe(1); expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("moves a round's charge only once its outcome is recorded, a deleted game's answer included (rule 0)", async () => {
    const gameId = "batch-outcome-first", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "outcomefirst"), request = sol(gameId);
    await review({ ...c, visualReview: { request }, qualityBatch: fake } as Container, gameId); fake.end();
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    const intent = await syncKeyOf(gameId), outcomeRecorded = async () => (await db.auditLog.count({ where: { entityId: gameId, id: { endsWith: "_terminal" } } })) > 0;
    // Every ledger write: when it moves this question's charge out of its reservation, was the round's outcome already in the record?
    const moves: { state: string | undefined; outcomeRecorded: boolean }[] = [];
    const container = { ...c, qualityBatch: fake, db: dbAround({ "worldBudgetLedger.updateMany": async write => {
      const before = await w.budget.readRequest(w.worldId, intent.batchKey), recorded = await outcomeRecorded(), result = await write();
      const after = await w.budget.readRequest(w.worldId, intent.batchKey);
      if (before?.state === "pending" && after?.state !== "pending") moves.push({ state: after?.state, outcomeRecorded: recorded });
      return result;
    } }) } as Container;
    // The deleted game's store keeps no answer, and would record the bill itself; the bill is the outcome's to record.
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "answered", amountMicroUsd: 9_000 });
    expect(moves).toEqual([{ state: "settled", outcomeRecorded: true }]);
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 9_000 } });
    expect(await new PrismaRetainedPurchaseStore(db).get(w.worldId, intent.batchKey)).toBeNull();
  }, 300_000);

  it("reads a copy found beside an answered batch: billed again, it is counted as a charge of its own, and both go only after their bills", async () => {
    const gameId = "batch-answered-extra", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "answeredextra"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId); fake.end(); await review(container, gameId);
    const intent = await syncKeyOf(gameId), [batch] = fake.batches as [FakeBatch];
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "answered", batchId: batch.id, amountMicroUsd: 9_000 });
    // A stale search recorded a second copy (only the provider could make one) after the round was answered.
    const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    fake.batches.push({ ...structuredClone(batch), id: "msgbatch_answeredextrab", results: batch.requests.map(r => fake.answer(r.params, r.customId)) });
    await db.auditLog.create({ data: { id: `aud_qb_${roundId}_found-1`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ kind: "found", n: 1, batchIds: ["msgbatch_answeredextrab"], complete: true, at: Date.now() }) } });
    await advanceQualityBatches(container, gameId, async () => {});
    // The batch key holds the one answer; a second billed copy is a charge beside it, imported in full by its receipt.
    const [extra] = await latesOf(gameId);
    expect(extra).toMatchObject({ batchId: "msgbatch_answeredextrab", amountMicroUsd: 9_000 });
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 9_000 }, conflicts: [] });
    expect(await w.budget.readRequest(w.worldId, `@import/${JSON.stringify([fake.namespace, extra!.results[0]!.requestId])}`))
      .toMatchObject({ state: "settled", origin: "imported", evidence: { amountMicroUsd: 9_000 } });
    expect(fake.batches.map(b => b.deleted)).toEqual([true, true]);
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("holds the world when a copy repeats a receipt already counted with other usage, and still records the copy's bill and deletes it", async () => {
    const gameId = "batch-copy-conflict", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "copyconflict"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId); fake.end(); await review(container, gameId);
    const intent = await syncKeyOf(gameId), [batch] = fake.batches as [FakeBatch];
    const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    // A copy whose result repeats the answer's receipt with more output than the answer was billed for: 2,000 tokens in and
    // 900 out at the batch rate, 13,000 micro-USD.
    const results = batch.results!.map(r => ({ ...structuredClone(r), message: { ...(r as { message: Record<string, unknown> }).message,
      usage: { input_tokens: 2000, output_tokens: 900, service_tier: "batch" } } }));
    fake.batches.push({ ...structuredClone(batch), id: "msgbatch_copyconflictb", results });
    await db.auditLog.create({ data: { id: `aud_qb_${roundId}_found-1`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ kind: "found", n: 1, batchIds: ["msgbatch_copyconflictb"], complete: true, at: Date.now() }) } });
    await advanceQualityBatches(container, gameId, async () => {});
    // The receipt is counted once: the other usage is recorded against it as a conflict, which holds the world for a person.
    // The copy's bill is still recorded, and the copy deleted, rather than the pass failing on it at every tick.
    const [extra] = await latesOf(gameId);
    expect(extra).toMatchObject({ batchId: "msgbatch_copyconflictb", amountMicroUsd: 13_000 });
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 9_000 },
      conflicts: [{ evidence: { amountMicroUsd: 13_000 } }] });
    expect((await w.budget.audit(w.worldId)).held).toBe(true);
    expect(fake.batches.map(b => b.deleted)).toEqual([true, true]);
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("records a stopped copy's bill from its recorded reading, never from what the provider returns later: a person's settlement at zero stands", async () => {
    const r = await replayedCopy("batch-copy-replay", "copyreplay", "unpriced", "another", (w, key, receipt) => w.budget.settle(w.worldId, key, zeroEvidence(receipt)).then(() => {}));
    // Codex's ninth-pass sequence, under rule 6: the copy is read once, so the other receipt the provider returns later is never its bill.
    expect(r.reads).toBe(1);
    expect(r.laterReceipt).not.toBe(r.firstReceipt);
    expect(r.bill).toMatchObject({ batchId: r.copy.id, amountMicroUsd: null, results: [{ requestId: r.firstReceipt }] });
    expect(await r.w.budget.readRequest(r.w.worldId, r.first!)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 0 } });
    expect(await r.w.budget.audit(r.w.worldId)).toMatchObject({ held: false, unknownRequestKeys: [] });
    expect(r.fake.batches.map(b => b.deleted)).toEqual([true, true]);
  }, 300_000);

  it("records a stopped copy's bill from its recorded reading, never from what the provider returns later: a person's approval to continue stands", async () => {
    const approving = boardWizardBudgetOf(c, 1, { authorizeUnknownContinuation: async () => true });
    const r = await replayedCopy("batch-copy-replay-approved", "copyreplayapproved", "unpriced", "another", async (w, key) => {
      const row = (await w.budget.readRequest(w.worldId, key))!;
      await approving.authorizeUnknownContinuation(w.worldId, { approvalId: "approval-copy-replay", requestKey: key, scope: row.scope,
        operationFingerprint: row.operationFingerprint, reserveMicroUsd: row.reserveMicroUsd, unknownReasons: [...row.unknownReasons],
        operatorId: "synthetic-admin", authorizationSha256: "a".repeat(64), authorizedAt: new Date().toISOString() });
    });
    expect(r.reads).toBe(1);
    expect(r.bill).toMatchObject({ batchId: r.copy.id, amountMicroUsd: null, results: [{ requestId: r.firstReceipt }] });
    expect(await r.w.budget.audit(r.w.worldId)).toMatchObject({ held: false, unknownRequestKeys: [r.first] });
    expect(r.fake.batches.map(b => b.deleted)).toEqual([true, true]);
  }, 300_000);

  it("records the bill of a stopped copy a person reconciled into a linked alias, and deletes it", async () => {
    // Codex's ninth-pass case: the person settles the copy's row with a receipt the ledger already counts, which links it.
    const r = await replayedCopy("batch-copy-linked", "copylinked", "unpriced", "same", async (w, key, receipt) => {
      const evidence: WorldChargeEvidence = { providerNamespace: "anthropic:find-me-existing", providerRequestId: receipt, usageId: "u",
        rawUsage: { basis: "the copy's receipt, priced by a person" }, model: "claude-opus-5-5", amountMicroUsd: 103_500, costBasis: "conservative-upper-estimate" };
      const row = (await w.budget.readRequest(w.worldId, key))!;
      await w.budget.importSettled(w.worldId, { scope: row.scope, operationFingerprint: row.operationFingerprint, evidence });
      expect((await w.budget.settle(w.worldId, key, evidence)).request.state).toBe("linked");
    });
    expect(r.bill).toMatchObject({ batchId: r.copy.id, amountMicroUsd: null });
    expect(await r.w.budget.readRequest(r.w.worldId, r.first!)).toMatchObject({ state: "linked" });
    expect(await r.w.budget.audit(r.w.worldId)).toMatchObject({ held: false, unknownRequestKeys: [] });
    expect(r.fake.batches.map(b => b.deleted)).toEqual([true, true]);
  }, 300_000);

  it("records a stopped priced copy's bill once, with no conflict, however the provider serialises its answer later", async () => {
    // Codex's eleventh-pass case: the import commits, the bill's record does not, and the usage comes back in another key order.
    const r = await replayedCopy("batch-copy-reordered", "copyreordered", "priced", "reordered");
    expect(r.reads).toBe(1);
    expect(r.bill).toMatchObject({ batchId: r.copy.id, amountMicroUsd: 9_000, results: [{ requestId: r.firstReceipt }] });
    expect(await r.w.budget.readRequest(r.w.worldId, `@import/${JSON.stringify([r.fake.namespace, r.firstReceipt])}`))
      .toMatchObject({ state: "settled", evidence: { amountMicroUsd: 9_000 }, conflicts: [] });
    expect(await r.w.budget.audit(r.w.worldId)).toMatchObject({ held: false, unknownRequestKeys: [], conflictRequestKeys: [] });
    expect(r.fake.batches.map(b => b.deleted)).toEqual([true, true]);
  }, 300_000);

  it("answers a stopped round from its recorded reading however the provider serialises the answer when it is read again", async () => {
    // Codex's eleventh-pass case on the round's own batch: the answer is kept, the worker stops before the outcome, and the
    // next read returns the same answer with its usage keys in another order. The same retained answer, the same charge.
    const gameId = "batch-own-reordered", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "ownreordered"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId); fake.end();
    const intent = await syncKeyOf(gameId), [own] = fake.batches as [FakeBatch];
    let kept = false, stopped = false;
    const stopping = { ...container, db: dbAround({ $transaction: async (run, args) => {
      if (kept && !stopped) { stopped = true; throw Error("the worker stopped"); }
      const result = await run();
      if ((args[1] as { isolationLevel?: string } | undefined)?.isolationLevel === "Serializable") kept = true;
      return result;
    } }) } as Container;
    await expect(advanceQualityBatches(stopping, gameId, async () => {})).rejects.toThrow("the worker stopped");
    expect(await eventNames(gameId)).not.toContain("terminal");
    own.results = reordered(own.results!);
    await advanceQualityBatches(container, gameId, async () => {});
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "answered", amountMicroUsd: 9_000 });
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "settled", conflicts: [] });
    expect(await w.budget.audit(w.worldId)).toMatchObject({ held: false, unknownRequestKeys: [], conflictRequestKeys: [] });
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("deletes the copies whose bills it recorded though the ledger refuses another's, reading that one first, and raises the refusal", async () => {
    const gameId = "batch-copy-refused"; await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "copyrefused"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId); fake.end(); await review(container, gameId);
    const [own] = fake.batches as [FakeBatch];
    const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    // Two copies a stale search recorded, both billed; the ledger refuses the first one's bill on every write.
    const copies = ["a", "b"].map(name => ({ ...structuredClone(own), id: `msgbatch_copyrefused${name}`, deleted: false,
      results: own.requests.map(r => fake.answer(r.params, r.customId)) })) as [FakeBatch, FakeBatch];
    fake.batches.push(...copies);
    await db.auditLog.create({ data: { id: `aud_qb_${roundId}_found-1`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ kind: "found", n: 1, batchIds: copies.map(copy => copy.id), complete: true, at: Date.now() }) } });
    const refusing = { ...container, db: refusingBill(receiptOf(copies[0].results!)) } as Container;
    // In a minute whose order starts with the refused copy.
    vi.useFakeTimers({ toFake: ["Date"] });
    let at = Math.ceil(Date.now() / 60_000) * 60_000;
    while (qualityBatchCopyStart(roundId, 2, at) !== 0) at += 60_000;
    vi.setSystemTime(at);
    await expect(advanceQualityBatches(refusing, gameId, async () => {})).rejects.toThrow("the ledger refuses this bill");
    // The other copy was read regardless, its bill recorded, and deleted; the refused one stays unread, and so undeletable.
    expect((await latesOf(gameId)).map(bill => bill.batchId)).toEqual([copies[1].id]);
    expect(copies.map(copy => copy.deleted)).toEqual([false, true]);
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("raises every failure of a pass together: a refused bill, and a deletion record that failed after it (Codex's tenth pass)", async () => {
    const gameId = "batch-two-failures"; await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "twofailures"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId); fake.end(); await review(container, gameId);
    const [own] = fake.batches as [FakeBatch];
    const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    const copies = ["a", "b"].map(name => ({ ...structuredClone(own), id: `msgbatch_twofailures${name}`, deleted: false,
      results: own.requests.map(r => fake.answer(r.params, r.customId)) })) as [FakeBatch, FakeBatch];
    fake.batches.push(...copies);
    await db.auditLog.create({ data: { id: `aud_qb_${roundId}_found-1`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ kind: "found", n: 1, batchIds: copies.map(copy => copy.id), complete: true, at: Date.now() }) } });
    // The ledger refuses the first copy's bill; the provider deletes the others, and then the record of their deletion fails.
    let removed = false;
    const remove = fake.remove.bind(fake);
    fake.remove = async (id: string) => { await remove(id); removed = true; };
    const refusing = refusingBill(receiptOf(copies[0].results!));
    const failing = { ...container, db: new Proxy(refusing, { get(target, prop) {
      if (prop !== "$transaction") return Reflect.get(target, prop);
      return (...args: unknown[]) => { if (removed) throw Error("the deletion record failed"); return (target.$transaction as (...a: unknown[]) => unknown)(...args); };
    } }) } as Container;
    const failure = await advanceQualityBatches(failing, gameId, async () => {}).then(() => null, (error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).message).toContain("the ledger refuses this bill");
    expect((failure as AggregateError).message).toContain("the deletion record failed");
    expect((failure as AggregateError).errors).toHaveLength(2);
  }, 300_000);

  it("counts another reading of a copy by a pass that read it while another recorded its bill, as a charge of its own (Codex's tenth pass)", async () => {
    const r = await copyRace("batch-copy-race", "copyrace");
    // The held-up reading is another charge: an unknown row of its own beside the recorded reading's, holding the world,
    // though the copy was recorded and deleted.
    const audit = await r.w.budget.audit(r.w.worldId);
    expect(audit.unknownRequestKeys).toHaveLength(2);
    expect(audit.unknownRequestKeys.every(key => key.startsWith(`${r.intent.batchKey}:copy:${r.copy.id}:`))).toBe(true);
    const reasons = await Promise.all(audit.unknownRequestKeys.map(async key => (await r.w.budget.readRequest(r.w.worldId, key))!.unknownReasons[0]!));
    expect(reasons.some(reason => reason.includes(receiptOf(r.other)))).toBe(true);
    expect(reasons.some(reason => reason.includes(receiptOf(r.recorded)))).toBe(true);
    expect(audit.held).toBe(true);
  }, 300_000);

  it("counts a reread whose first count failed on a later tick, from the record alone (rule 6)", async () => {
    // The ledger refuses the held-up reading's row once: its reread is in the record, its charge not yet in the ledger.
    const r = await copyRace("batch-copy-race-retry", "copyraceretry", true);
    expect((await r.w.budget.audit(r.w.worldId)).unknownRequestKeys).toHaveLength(1);
    // Nothing else is due in the round (the copies are read and deleted): only the reread brings the round back to the tick.
    await sweepQualityBatches(r.container, { deadlineAt: Date.now() + 230_000 });
    const audit = await r.w.budget.audit(r.w.worldId);
    expect(audit.unknownRequestKeys).toHaveLength(2);
    expect((await Promise.all(audit.unknownRequestKeys.map(async key => (await r.w.budget.readRequest(r.w.worldId, key))!.unknownReasons[0]!)))
      .some(reason => reason.includes(receiptOf(r.other)))).toBe(true);
  }, 300_000);

  it("counts another reading of the round's own batch by a pass that lost the outcome to the first reading (Codex's tenth pass)", async () => {
    const gameId = "batch-own-race", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "ownrace"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId);
    const intent = await syncKeyOf(gameId), [own] = fake.batches as [FakeBatch];
    const priced = own.requests.map(r => fake.answer(r.params, r.customId)), other = own.requests.map(r => unpricedOpus(r.params, r.customId));
    own.status = "ended"; own.results = priced;
    // Two passes read the ended batch at once; the provider answers the first, held up, otherwise.
    const race = raceReads(fake, own.id, other, priced);
    const slow = advanceQualityBatches(container, gameId, async () => {});
    await race.started();
    await advanceQualityBatches(container, gameId, async () => {});
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "answered", batchId: own.id, amountMicroUsd: 9_000 });
    race.release(); await slow;
    // The answer stands; the losing pass's other reading is another charge, an unknown row of its own, and holds the world.
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 9_000 } });
    const audit = await w.budget.audit(w.worldId);
    expect(audit.unknownRequestKeys).toHaveLength(1);
    expect(audit.unknownRequestKeys[0]!.startsWith(`${intent.batchKey}:copy:${own.id}:`)).toBe(true);
    expect(audit.held).toBe(true);
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("reads the round's own batch in two passes at once with the same unpriced answer: one unknown charge, not two", async () => {
    const gameId = "batch-own-race-same", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "ownracesame"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId);
    const intent = await syncKeyOf(gameId), [own] = fake.batches as [FakeBatch];
    const same = own.requests.map(r => unpricedOpus(r.params, r.customId));
    own.status = "ended"; own.results = same;
    const race = raceReads(fake, own.id, same, same);
    const slow = advanceQualityBatches(container, gameId, async () => {});
    await race.started();
    await advanceQualityBatches(container, gameId, async () => {});
    race.release(); await slow;
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "held", charge: "unknown", batchId: own.id });
    expect(await w.budget.audit(w.worldId)).toMatchObject({ held: true, unknownRequestKeys: [intent.batchKey] });
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("searches on for further copies though the ledger keeps refusing one known copy's bill (Codex's tenth pass)", async () => {
    const gameId = "batch-refused-search", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "refusedsearch"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    // Three copies of the lost create: two have ended carrying the question, the third still runs, so the hold searches on.
    for (const name of ["b", "c"]) fake.batches.push({ ...structuredClone(fake.batches[0]!), id: `msgbatch_refusedsearch${name}` });
    const [first, second, third] = fake.batches as [FakeBatch, FakeBatch, FakeBatch];
    for (const batch of [first, second]) { batch.status = "ended"; batch.results = batch.requests.map(r => fake.answer(r.params, r.customId)); }
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    expect(await review(container, gameId)).toMatchObject({ state: "held", reason: expect.stringContaining("2 batches carry") });
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    // Codex's case: the ledger refuses the first copy's bill on every write; the third then ends, carrying the question too.
    const refusing = { ...container, db: refusingBill(receiptOf(first.results!)) } as Container;
    third.status = "ended"; third.results = third.requests.map(r => fake.answer(r.params, r.customId));
    // In minutes whose turn is the known copies' first: the search comes after their step fails.
    const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    let at = start + QUALITY_BATCH_CREATE_GRACE_MS;
    for (let tick = 1; tick <= 2; tick++) {
      do at += 60_000; while (qualityBatchCopyStart(`${roundId}:search`, 2, at) !== 0);
      vi.setSystemTime(at);
      await sweepQualityBatches(refusing, { deadlineAt: Date.now() + 230_000 });
    }
    // The search went on: the third copy was found, read and deleted, as was the second; the refused one stays, unread.
    expect(await foundOf(gameId)).toEqual([first.id, second.id, third.id]);
    expect((await latesOf(gameId)).map(bill => bill.batchId).sort()).toEqual([second.id, third.id].sort());
    expect(fake.batches.map(batch => batch.deleted)).toEqual([false, true, true]);
    expect(fake.creates).toBe(1); expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("holds a round whose own batch was read otherwise while the first reading's pass was still deciding, counting both readings (Codex's eleventh pass)", async () => {
    const gameId = "batch-own-otherwise", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "ownotherwise"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId); fake.end();
    const intent = await syncKeyOf(gameId), [own] = fake.batches as [FakeBatch], first = receiptOf(own.results!);
    // Codex's interleaving: the first pass keeps its priced answer and waits before writing the outcome...
    let kept = false, paused = false, release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const pausing = { ...container, db: dbAround({ $transaction: async (run, args) => {
      if (kept) { kept = false; paused = true; await gate; }
      const result = await run();
      if ((args[1] as { isolationLevel?: string } | undefined)?.isolationLevel === "Serializable") kept = true;
      return result;
    } }) } as Container;
    const slow = advanceQualityBatches(pausing, gameId, async () => {});
    while (!paused) await new Promise(resolve => setTimeout(resolve, 5));
    // ...while another pass reads the batch and the provider answers it otherwise, unpriced.
    own.results = own.requests.map(r => unpricedOpus(r.params, r.customId));
    await advanceQualityBatches(container, gameId, async () => {});
    release(); await slow;
    // The other reading decides nothing: it is counted as a charge of its own, and the round is held with its first reading.
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "held", charge: "unknown", batchId: own.id, results: [{ requestId: first }] });
    const audit = await w.budget.audit(w.worldId);
    expect(audit.held).toBe(true);
    expect(audit.unknownRequestKeys).toHaveLength(2);
    expect(audit.unknownRequestKeys).toContain(intent.batchKey);
    expect(audit.unknownRequestKeys.find(key => key !== intent.batchKey)!.startsWith(`${intent.batchKey}:copy:${own.id}:`)).toBe(true);
    expect((await eventNames(gameId)).filter(name => name.startsWith("reread-"))).toHaveLength(1);
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("never settles at zero a round whose first reading was billed when a later read of the batch says canceled (Codex's eleventh pass)", async () => {
    const gameId = "batch-billed-then-canceled", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "billedcanceled"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId); fake.end();
    const intent = await syncKeyOf(gameId), [own] = fake.batches as [FakeBatch], first = receiptOf(own.results!);
    // The first reading is priced, but keeping its answer fails once: no outcome is recorded.
    let failed = false;
    const failing = { ...container, db: dbAround({ $transaction: async (run, args) => {
      if (!failed && (args[1] as { isolationLevel?: string } | undefined)?.isolationLevel === "Serializable") { failed = true; throw Error("storage is down"); }
      return run();
    } }) } as Container;
    await expect(advanceQualityBatches(failing, gameId, async () => {})).rejects.toThrow("storage is down");
    // Codex's case: the next read of the same batch says canceled, which is documented as unbilled.
    own.results = own.requests.map(r => ({ customId: r.customId, type: "canceled" as const }));
    await advanceQualityBatches(container, gameId, async () => {});
    // Decided from the first reading: held with its charge unknown, never settled at zero, and nothing asked synchronously.
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "held", charge: "unknown", results: [{ requestId: first }] });
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "unknown" });
    expect((await w.budget.audit(w.worldId)).held).toBe(true);
    expect(await review(container, gameId)).toMatchObject({ state: "held" });
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("reads copies only once the outcome's charge is in the ledger, so a copy bearing the answer's own receipt leaves it deliverable (Codex's eleventh pass)", async () => {
    const gameId = "batch-outcome-applied", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "outcomeapplied"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId); fake.end();
    const intent = await syncKeyOf(gameId), [own] = fake.batches as [FakeBatch];
    const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    // The ledger refuses to settle the batch key for a while: the answer is recorded, its charge not yet applied.
    const unsettling = { ...container, db: dbAround({ "worldBudgetLedger.updateMany": async (write, args) => {
      const json = (args[0] as { data: { snapshotJson?: string } }).data.snapshotJson;
      const snapshot = json ? JSON.parse(json) as { requests: { requestKey: string; state: string }[] } : null;
      if (snapshot?.requests.some(r => r.requestKey === intent.batchKey && r.state === "settled")) throw Error("the ledger is unavailable");
      return write();
    } }) } as Container;
    await expect(advanceQualityBatches(unsettling, gameId, async () => {})).rejects.toThrow("the ledger is unavailable");
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "answered" });
    // Codex's case: a copy carrying the answer's own receipt and usage is found while the charge is still pending.
    const copy: FakeBatch = { ...structuredClone(own), id: "msgbatch_outcomeappliedb", deleted: false };
    fake.batches.push(copy);
    await db.auditLog.create({ data: { id: `aud_qb_${roundId}_found-1`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ kind: "found", n: 1, batchIds: [copy.id], complete: true, at: Date.now() }) } });
    await expect(advanceQualityBatches(unsettling, gameId, async () => {})).rejects.toThrow("the ledger is unavailable");
    expect(await latesOf(gameId)).toEqual([]);
    // Once the ledger settles the answer, the copy is read: its receipt is the answer's own charge, counted once.
    await advanceQualityBatches(container, gameId, async () => {});
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 9_000 } });
    expect(await w.budget.readRequest(w.worldId, `@import/${JSON.stringify([fake.namespace, receiptOf(own.results!)])}`)).toBeNull();
    expect(await latesOf(gameId)).toMatchObject([{ batchId: copy.id, amountMicroUsd: 9_000 }]);
    // The answer is delivered: the dual review replays it and goes on to its continuity question, and Opus is not asked again.
    for (let i = 0; i < 3; i++) await review(container, gameId);
    expect(await w.budget.readRequest(w.worldId, intent.syncKey)).toMatchObject({ state: "linked", canonicalRequestKey: intent.batchKey });
    expect(request.mock.calls.filter(([question]) => question.role === "head-continuity")).toHaveLength(1);
    expect((await rows(gameId)).filter(row => JSON.parse(row.judgeJson!).reviewState === "board-review-complete")).toHaveLength(1);
    expect(fake.batches.map(b => b.deleted)).toEqual([true, true]);
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("reads a copy once, so a slow provider and a bill the ledger keeps refusing leave the search its time (Codex's eleventh pass)", async () => {
    const gameId = "batch-slow-refused-search", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "slowrefusedsearch"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    // Three copies of the lost create: two have ended carrying the question, the third still runs, so the hold searches on.
    for (const name of ["b", "c"]) fake.batches.push({ ...structuredClone(fake.batches[0]!), id: `msgbatch_slowrefusedsearch${name}` });
    const [first, second, third] = fake.batches as [FakeBatch, FakeBatch, FakeBatch];
    for (const batch of [first, second]) { batch.status = "ended"; batch.results = batch.requests.map(r => fake.answer(r.params, r.customId)); }
    // The copies are known with no recorded reading, so each bill is read from the provider once.
    searchKeepingNoReadings(fake);
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    expect(await review(container, gameId)).toMatchObject({ state: "held", reason: expect.stringContaining("2 batches carry") });
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    third.status = "ended"; third.results = third.requests.map(r => fake.answer(r.params, r.customId));
    // Codex's case: every provider read takes 29.9 seconds (a copy's bill, its record and its results); a search lists (one
    // read) and reads each candidate it proves (one read each), starting no read without 31 seconds left; and the ledger
    // refuses the first copy's bill on every write.
    // (Only this game's batches and question are slow: the sweep also visits other tests' rounds.)
    const reads: string[] = [], slow = (what: string) => { reads.push(what); vi.setSystemTime(Date.now() + 29_900); };
    const mine = (id: string) => id.startsWith("msgbatch_slowrefusedsearch"), intent = await syncKeyOf(gameId);
    const results = fake.results.bind(fake), remove = fake.remove.bind(fake), find = fake.find.bind(fake);
    fake.results = async (id: string) => { if (mine(id)) { slow(id); slow(id); } return results(id); };
    fake.remove = async (id: string) => { if (mine(id)) slow(`remove ${id}`); return remove(id); };
    fake.find = async (customId: string, sinceMs: number, deadlineAt?: number, untilMs?: number, known?: ReadonlySet<string>) => {
      if (customId !== intent.customId) return find(customId, sinceMs, deadlineAt, untilMs, known);
      slow("list");
      const candidates = fake.batches.filter(b => !b.deleted && !known?.has(b.id) && b.status === "ended" && b.results!.some(r => r.customId === customId)
        && b.createdAt >= sinceMs - 5 * 60_000 && (untilMs === undefined || b.createdAt <= untilMs + 5 * 60_000));
      const proven: string[] = [];
      for (const batch of candidates) {
        if (deadlineAt !== undefined && deadlineAt - Date.now() < 31_000) return { proven, undecided: true, truncated: true };
        slow(`prove ${batch.id}`); proven.push(batch.id);
      }
      return { proven, undecided: false };
    };
    const refusing = { ...container, db: refusingBill(receiptOf(first.results!)) } as Container;
    // Twelve ticks, whatever happens: the refused copy stays due on every one of them.
    for (let tick = 1; tick <= 12; tick++) {
      vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS + tick * 60_000);
      await sweepQualityBatches(refusing, { deadlineAt: Date.now() + 230_000 });
    }
    // The refused copy was read from the provider once; the third was found, its bill read and recorded, and it was deleted.
    expect(reads.filter(read => read === first.id)).toHaveLength(2);
    expect(await foundOf(gameId)).toContain(third.id);
    expect((await latesOf(gameId)).map(bill => bill.batchId)).toContain(third.id);
    expect(third.deleted).toBe(true); expect(first.deleted).toBe(false);
    expect(fake.creates).toBe(1); expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("takes turns between the known copies and the search, so a copy whose reads always time out never keeps a further copy from being found (rule 5)", async () => {
    const gameId = "batch-timeout-search", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "timeoutsearch"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    for (const name of ["b", "c"]) fake.batches.push({ ...structuredClone(fake.batches[0]!), id: `msgbatch_timeoutsearch${name}` });
    const [first, second, third] = fake.batches as [FakeBatch, FakeBatch, FakeBatch];
    for (const batch of [first, second]) { batch.status = "ended"; batch.results = batch.requests.map(r => fake.answer(r.params, r.customId)); }
    // The copies are known with no recorded reading, so the first copy's bill needs reads that never come back.
    searchKeepingNoReadings(fake);
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    expect(await review(container, gameId)).toMatchObject({ state: "held", reason: expect.stringContaining("2 batches carry") });
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    third.status = "ended"; third.results = third.requests.map(r => fake.answer(r.params, r.customId));
    // The first copy's results never come back: its record read takes 29.9 seconds, then its results read times out at 30.
    // A search lists (29.9 seconds) and reads each candidate it proves (29.9 seconds each), each only with 31 seconds left.
    // (Only this game's batches and question are slow: the sweep also visits other tests' rounds.)
    const slow = () => vi.setSystemTime(Date.now() + 29_900), mine = (id: string) => id.startsWith("msgbatch_timeoutsearch"), intent = await syncKeyOf(gameId);
    const results = fake.results.bind(fake), remove = fake.remove.bind(fake), find = fake.find.bind(fake);
    fake.results = async (id: string) => {
      if (id === first.id) { slow(); vi.setSystemTime(Date.now() + 30_000); throw Error("timed out"); }
      if (mine(id)) { slow(); slow(); }
      return results(id);
    };
    fake.remove = async (id: string) => { if (mine(id)) slow(); return remove(id); };
    fake.find = async (customId: string, sinceMs: number, deadlineAt?: number, untilMs?: number, known?: ReadonlySet<string>) => {
      if (customId !== intent.customId) return find(customId, sinceMs, deadlineAt, untilMs, known);
      slow();
      const candidates = fake.batches.filter(b => !b.deleted && !known?.has(b.id) && b.status === "ended" && b.results!.some(r => r.customId === customId)
        && b.createdAt >= sinceMs - 5 * 60_000 && (untilMs === undefined || b.createdAt <= untilMs + 5 * 60_000));
      const proven: string[] = [];
      for (const batch of candidates) {
        if (deadlineAt !== undefined && deadlineAt - Date.now() < 31_000) return { proven, undecided: true, truncated: true };
        // A search that reads the first copy's results fails with it, as the provider's own does.
        if (batch.id === first.id) { slow(); throw Error("timed out"); }
        slow(); proven.push(batch.id);
      }
      return { proven, undecided: false };
    };
    for (let tick = 1; tick <= 24 && !third.deleted; tick++) {
      vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS + tick * 60_000);
      await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    }
    expect(await foundOf(gameId)).toContain(third.id);
    expect(third.deleted).toBe(true); expect(first.deleted).toBe(false);
    expect(fake.creates).toBe(1); expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("keeps what a search read as the batch's first reading: a later read that says canceled holds the round, never settles it at zero (Codex's twelfth pass)", async () => {
    const gameId = "batch-search-reading", w = await world(gameId); await paintFirst(gameId);
    // Codex's case: the standard tier served the answer the search read, 134,000 micro-USD.
    const standard = opus(() => ({ usage: { input_tokens: 1000, output_tokens: 6500, service_tier: "standard" } }));
    const fake = new FakeBatches(standard, "searchreading"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    const [batch] = fake.batches as [FakeBatch], intent = await syncKeyOf(gameId);
    fake.end();
    const priced = batch.results!;
    // The search after the grace proves the batch by its priced answer; the next read of the batch says canceled.
    const find = fake.find.bind(fake);
    fake.find = async (...args: Parameters<FakeBatches["find"]>) => {
      const found = await find(...args);
      batch.results = batch.requests.map(r => ({ customId: r.customId, type: "canceled" as const }));
      return found;
    };
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    expect(await review(container, gameId)).toMatchObject({ state: "held" });
    // Decided from the search's reading: held with its charge unknown, the canceled read counted as a reread (unbilled).
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "held", charge: "unknown", batchId: batch.id, results: [{ requestId: receiptOf(priced) }] });
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "unknown" });
    expect((await eventNames(gameId)).filter(name => name.startsWith("reread-"))).toHaveLength(1);
    expect(batch.deleted).toBe(false);
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("holds a round on a reread made before any outcome, before counting it, so a count that fails decides nothing (Codex's twelfth pass)", async () => {
    const gameId = "batch-reread-held-first", w = await world(gameId); await paintFirst(gameId);
    const standard = opus(() => ({ usage: { input_tokens: 1000, output_tokens: 6500, service_tier: "standard" } }));
    const fake = new FakeBatches(opus(), "rereadheldfirst"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId);
    const intent = await syncKeyOf(gameId), [own] = fake.batches as [FakeBatch];
    own.status = "ended";
    // Codex's interleaving: the first read says canceled; the second, by another pass, a priced answer.
    const canceled = own.requests.map(r => ({ customId: r.customId, type: "canceled" as const })), priced = own.requests.map(r => standard(r.params, r.customId));
    own.results = canceled;
    let reads = 0;
    const results = fake.results.bind(fake);
    fake.results = async (id: string) => id === own.id ? (++reads === 1 ? canceled : priced) : results(id);
    // The first pass records its reading and waits before writing its fallback...
    let paused = false, release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const pausing = { ...container, db: dbAround({ $transaction: async run => {
      const names = await eventNames(gameId);
      if (!paused && names.some(name => name.startsWith("reading-")) && !names.includes("terminal")) { paused = true; await gate; }
      return run();
    } }) } as Container;
    const first = advanceQualityBatches(pausing, gameId, async () => {});
    while (!paused) await new Promise(resolve => setTimeout(resolve, 5));
    // ...while the second reads the priced answer, holds the round, and fails to count it.
    const refusing = { ...container, db: refusingBill(receiptOf(priced)) } as Container;
    await expect(advanceQualityBatches(refusing, gameId, async () => {})).rejects.toThrow("the ledger refuses this bill");
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "held", charge: "unknown", results: [{ type: "canceled" }] });
    release(); await first;
    // The first pass's fallback lost: nothing settled at zero, nothing asked synchronously, and the reread counted when the record was applied.
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "unknown" });
    expect(await w.budget.readRequest(w.worldId, `@import/${JSON.stringify([fake.namespace, receiptOf(priced)])}`)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 134_000 } });
    expect(await review(container, gameId)).toMatchObject({ state: "held" });
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("counts a reread before the gate lets anything be bought, so no capacity is admitted ahead of it (Codex's twelfth pass)", async () => {
    const gameId = "batch-reread-before-gate", w = await world(gameId); await paintFirst(gameId);
    const standard = opus(() => ({ usage: { input_tokens: 1000, output_tokens: 6500, service_tier: "standard" } }));
    const fake = new FakeBatches(opus(), "rereadbeforegate"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId);
    const [own] = fake.batches as [FakeBatch];
    own.status = "ended";
    const canceled = own.requests.map(r => ({ customId: r.customId, type: "canceled" as const })), priced = own.requests.map(r => standard(r.params, r.customId));
    own.results = canceled;
    // Two passes read the batch at once: the one held up reads a priced answer, after the other has decided from canceled.
    const race = raceReads(fake, own.id, priced, canceled);
    const late = { ...container, db: refusingBill(receiptOf(priced)) } as Container;
    const slow = advanceQualityBatches(late, gameId, async () => {}).then(() => null, (error: unknown) => error);
    await race.started();
    await advanceQualityBatches(container, gameId, async () => {});
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "fallback", resultType: "canceled" });
    race.release();
    // The held-up pass records its reading as a reread, and fails to count it.
    expect(await slow).toBeInstanceOf(Error);
    // Codex's numbers: earlier work leaves 300,000 of the world; the reread's 134,000 must be counted before a 250,000 reservation.
    const before = await w.budget.audit(w.worldId);
    await w.budget.importSettled(w.worldId, { scope: "image", operationFingerprint: "synthetic-earlier-work", evidence: { providerNamespace: "openai:find-me-existing",
      providerRequestId: `req-earlier-${gameId}`, usageId: `usage-earlier-${gameId}`, rawUsage: { synthetic: 1 }, model: "gpt-image-2",
      amountMicroUsd: before.capMicroUsd - 300_000 - before.committedMicroUsd, costBasis: "provider-billed" } });
    // The gate applies the whole record first: the reread is counted, and the synchronous question no longer fits.
    await expect(review(container, gameId)).rejects.toMatchObject({ code: "cap_exceeded" });
    expect(await w.budget.readRequest(w.worldId, `@import/${JSON.stringify([fake.namespace, receiptOf(priced)])}`)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 134_000 } });
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("never imports a copy bearing the answer's own reading, so a held answer a person settles is delivered (Codex's twelfth pass)", async () => {
    const gameId = "batch-own-reading-copy", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "ownreadingcopy"), request = sol(gameId);
    await review({ ...c, visualReview: { request }, qualityBatch: fake } as Container, gameId); fake.end();
    const intent = await syncKeyOf(gameId), [own] = fake.batches as [FakeBatch];
    const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    // Codex's case: another writer holds the batch key right after the answer is recorded, before it is applied.
    const outcomeRecorded = async () => (await db.auditLog.count({ where: { entityId: gameId, id: { endsWith: "_terminal" } } })) > 0;
    let heldMeanwhile = false;
    const container = { ...c, visualReview: { request }, qualityBatch: fake, db: dbAround({ "worldBudgetLedger.findUnique": async read => {
      const rows = await read();
      if (!heldMeanwhile && await outcomeRecorded()) { heldMeanwhile = true; await w.budget.markUnknown(w.worldId, intent.batchKey, "held by another writer"); }
      return rows;
    } }) } as Container;
    expect(await review(container, gameId)).toMatchObject({ state: "held" });
    const answer = await eventOf(gameId, "terminal") as { kind: string; evidence: WorldChargeEvidence };
    expect(answer.kind).toBe("answered");
    // A copy carrying the same message as the answer is found; housekeeping reads it while the key is held.
    const copy: FakeBatch = { ...structuredClone(own), id: "msgbatch_ownreadingcopyb", deleted: false };
    fake.batches.push(copy);
    await db.auditLog.create({ data: { id: `aud_qb_${roundId}_found-1`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ kind: "found", n: 1, batchIds: [copy.id], complete: true, at: Date.now() }) } });
    const plain = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await advanceQualityBatches(plain, gameId, async () => {});
    expect(await latesOf(gameId)).toMatchObject([{ batchId: copy.id, amountMicroUsd: 9_000 }]);
    // It is the answer's own bill: nothing is imported for it, so the person's settlement of the key is a settlement, not a link.
    expect(await w.budget.readRequest(w.worldId, `@import/${JSON.stringify([fake.namespace, answer.evidence.providerRequestId])}`)).toBeNull();
    await w.budget.settle(w.worldId, intent.batchKey, answer.evidence);
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "settled" });
    // And the answer is delivered: replayed, with the review going on to its continuity question.
    for (let i = 0; i < 3; i++) await review(plain, gameId);
    expect(await w.budget.readRequest(w.worldId, intent.syncKey)).toMatchObject({ state: "linked", canonicalRequestKey: intent.batchKey });
    expect(request.mock.calls.filter(([question]) => question.role === "head-continuity")).toHaveLength(1);
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  for (const unreadable of [0, 1]) it(`reads a readable known copy though the copy ${unreadable === 0 ? "before" : "after"} it and the search keep failing slowly (Codex's twelfth pass)`, async () => {
    const gameId = `batch-coupled-${unreadable}`, w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), `coupled${unreadable}`), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    // Two known copies have ended and a third still runs, so the round is held and searching.
    for (const name of ["b", "c"]) fake.batches.push({ ...structuredClone(fake.batches[0]!), id: `msgbatch_coupled${unreadable}${name}` });
    const [first, second] = fake.batches as [FakeBatch, FakeBatch, FakeBatch];
    for (const batch of [first, second]) { batch.status = "ended"; batch.results = batch.requests.map(r => fake.answer(r.params, r.customId)); }
    // Copies known without a recorded reading (a search that keeps what proved them records it, and they are never read
    // again): here the proving search keeps nothing, so both copies' bills need reads from the provider.
    searchKeepingNoReadings(fake);
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    expect(await review(container, gameId)).toMatchObject({ state: "held", reason: expect.stringContaining("2 batches carry") });
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    // Codex's schedule: every read takes 29.9 seconds; one known copy's reads and the search's both fail after two of them.
    const failing = [first, second][unreadable]!, readable = [first, second][1 - unreadable]!, intent = await syncKeyOf(gameId);
    const slow = () => vi.setSystemTime(Date.now() + 29_900), results = fake.results.bind(fake), find = fake.find.bind(fake);
    fake.results = async (id: string) => {
      if (id === failing.id) { slow(); slow(); throw Error("timed out"); }
      if (id === readable.id) { slow(); slow(); }
      return results(id);
    };
    fake.find = async (customId: string, ...rest: [number, number?, number?, ReadonlySet<string>?]) => {
      if (customId !== intent.customId) return find(customId, ...rest);
      slow(); slow(); throw Error("timed out");
    };
    // A sweep comes back to the round every second minute.
    const first2 = Math.ceil((start + QUALITY_BATCH_CREATE_GRACE_MS) / 120_000) * 120_000;
    for (let visit = 1; visit <= 40 && !readable.deleted; visit++) {
      vi.setSystemTime(first2 + visit * 120_000);
      await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    }
    expect((await latesOf(gameId)).map(bill => bill.batchId)).toContain(readable.id);
    expect(readable.deleted).toBe(true); expect(failing.deleted).toBe(false);
    expect(fake.creates).toBe(1); expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("holds an open round at once when its search reads a batch otherwise than its recorded reading, though another copy still runs, and searches on for that copy (rule 6)", async () => {
    const gameId = "batch-search-fault", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "searchfault"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    const intent = await syncKeyOf(gameId), [batch] = fake.batches as [FakeBatch];
    batch.status = "ended"; batch.results = batch.requests.map(r => fake.answer(r.params, r.customId));
    // Another copy of the question still runs, so the search cannot tell which batch is the round's.
    fake.batches.push({ ...structuredClone(batch), id: "msgbatch_searchfaultother", status: "in_progress", results: null });
    // Another pass's search read the batch first, as canceled, and stopped before it recorded the batch.
    const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    await db.auditLog.create({ data: { id: `aud_qb_${roundId}_${readingName(batch.id)}`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ kind: "reading", batchId: batch.id, results: [{ type: "canceled", errorType: null, requestId: null, model: null, usage: null }], at: Date.now() }) } });
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    expect(await review(container, gameId)).toMatchObject({ state: "held" });
    // Held at once, by no batch (none is the round's yet), its charge unknown; the priced reading counted as a charge of its own.
    const held = await eventOf(gameId, "terminal");
    expect(held).toMatchObject({ kind: "held", charge: "unknown", reason: `the provider returned other results for ${batch.id} on another read` });
    expect(held.batchId).toBeUndefined();
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "unknown" });
    expect(await w.budget.readRequest(w.worldId, `@import/${JSON.stringify([fake.namespace, receiptOf(batch.results)])}`))
      .toMatchObject({ state: "settled", evidence: { amountMicroUsd: 9_000 } });
    // The other copy then ends carrying the question too. The hold was made while the search was undecided, so it searches on:
    // once the game is deleted, the tick finds that copy, reads its bill and deletes it, as it does the first.
    const other = fake.batches[1]!;
    other.status = "ended"; other.results = other.requests.map(r => fake.answer(r.params, r.customId));
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    expect(await foundOf(gameId)).toEqual([batch.id, other.id]);
    expect((await latesOf(gameId)).map(bill => bill.batchId).sort()).toEqual([batch.id, other.id].sort());
    expect([batch.deleted, other.deleted]).toEqual([true, true]);
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("holds by the scheduled tick a live game's open round left with a provider fault on record, counting it and polling nothing (rule 6)", async () => {
    const gameId = "batch-sweep-fault", w = await world(gameId); await paintFirst(gameId);
    const standard = opus(() => ({ usage: { input_tokens: 1000, output_tokens: 6500, service_tier: "standard" } }));
    const fake = new FakeBatches(opus(), "sweepfault"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId);
    const intent = await syncKeyOf(gameId), [own] = fake.batches as [FakeBatch];
    // A pass read the batch first, as canceled, and stopped before deciding from it.
    const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    const canceled = [{ type: "canceled", errorType: null, requestId: null, model: null, usage: null }];
    await db.auditLog.create({ data: { id: `aud_qb_${roundId}_${readingName(own.id)}`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ kind: "reading", batchId: own.id, results: canceled, at: Date.now() }) } });
    // The game's next slice reads a priced answer, records it as a reread, and stops before it can hold the round.
    own.status = "ended"; own.results = own.requests.map(r => standard(r.params, r.customId));
    const stopping = { ...container, db: dbAround({ $transaction: async run => {
      const names = await eventNames(gameId);
      if (names.some(name => name.startsWith("reread-")) && !names.includes("terminal")) throw Error("the worker stopped");
      return run();
    } }) } as Container;
    await expect(advanceQualityBatches(stopping, gameId, async () => {})).rejects.toThrow("the worker stopped");
    expect(await eventNames(gameId)).not.toContain("terminal");
    // The game is still generating; its job runs no slice. The tick holds the round and counts the reread, and reads no batch.
    const reads = [vi.spyOn(fake, "status"), vi.spyOn(fake, "results"), vi.spyOn(fake, "cancel"), vi.spyOn(fake, "remove")];
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "held", charge: "unknown", batchId: own.id, results: canceled });
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "unknown" });
    expect(await w.budget.readRequest(w.worldId, `@import/${JSON.stringify([fake.namespace, receiptOf(own.results)])}`))
      .toMatchObject({ state: "settled", evidence: { amountMicroUsd: 134_000 } });
    expect(reads.flatMap(spy => spy.mock.calls).filter(([id]) => id === own.id)).toEqual([]);
    expect(own.deleted).toBe(false); expect(own.cancelled).toBe(false);
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("counts at once a reread a finished round's search records, before the slice goes on to anything else (rule 6)", async () => {
    const gameId = "batch-search-reread-finished", w = await world(gameId); await paintFirst(gameId);
    const standard = opus(() => ({ usage: { input_tokens: 1000, output_tokens: 6500, service_tier: "standard" } }));
    const fake = new FakeBatches(opus(), "searchrereadfinished"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    // Two copies have ended and a third still runs: the round is held, and searches on.
    for (const name of ["b", "c"]) fake.batches.push({ ...structuredClone(fake.batches[0]!), id: `msgbatch_searchrereadfinished${name}` });
    const [first, second] = fake.batches as [FakeBatch, FakeBatch, FakeBatch];
    for (const batch of [first, second]) { batch.status = "ended"; batch.results = batch.requests.map(r => fake.answer(r.params, r.customId)); }
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    expect(await review(container, gameId)).toMatchObject({ state: "held", reason: expect.stringContaining("2 batches carry") });
    // A fourth copy has ended, priced at the standard tier; another pass's search read it first, as canceled, and stopped before recording it.
    const fourth: FakeBatch = { ...structuredClone(first), id: "msgbatch_searchrereadfinishedd" };
    fourth.results = fourth.requests.map(r => standard(r.params, r.customId));
    fake.batches.push(fourth);
    const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    await db.auditLog.create({ data: { id: `aud_qb_${roundId}_${readingName(fourth.id)}`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ kind: "reading", batchId: fourth.id, results: [{ type: "canceled", errorType: null, requestId: null, model: null, usage: null }], at: Date.now() }) } });
    // One slice of the live game: its housekeeping's search records the other reading, and counts it before the slice goes on.
    await advanceQualityBatches(container, gameId, async () => {});
    expect((await eventNames(gameId)).filter(name => name.startsWith("reread-"))).toHaveLength(1);
    expect(await foundOf(gameId)).toContain(fourth.id);
    expect(await w.budget.readRequest(w.worldId, `@import/${JSON.stringify([fake.namespace, receiptOf(fourth.results)])}`))
      .toMatchObject({ state: "settled", evidence: { amountMicroUsd: 134_000 } });
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("adds no unknown charge for a copy bearing a held unpriced answer's own reading (rule 6)", async () => {
    const gameId = "batch-own-unpriced-copy", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(unpricedOpus, "ownunpricedcopy"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId); fake.end();
    const intent = await syncKeyOf(gameId), [own] = fake.batches as [FakeBatch];
    // The answer's charge cannot be stated: the round is held, its key unknown.
    expect(await review(container, gameId)).toMatchObject({ state: "held" });
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "held", charge: "unknown", batchId: own.id });
    // A copy carrying the same message is found, and read for its bill.
    const copy: FakeBatch = { ...structuredClone(own), id: "msgbatch_ownunpricedcopyb", deleted: false };
    fake.batches.push(copy);
    const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    await db.auditLog.create({ data: { id: `aud_qb_${roundId}_found-1`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ kind: "found", n: 1, batchIds: [copy.id], complete: true, at: Date.now() }) } });
    await advanceQualityBatches(container, gameId, async () => {});
    expect(await latesOf(gameId)).toMatchObject([{ batchId: copy.id, amountMicroUsd: null }]);
    // It is the held answer's own bill, which the batch key holds as unknown already: no unknown charge of its own.
    expect((await w.budget.audit(w.worldId)).unknownRequestKeys).toEqual([intent.batchKey]);
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("keeps a batch the record read but no search recorded before holding its round on a fault, so it is billed and deleted with its game (rule 6)", async () => {
    const gameId = "batch-fault-unkept", w = await world(gameId); await paintFirst(gameId);
    const standard = opus(() => ({ usage: { input_tokens: 1000, output_tokens: 6500, service_tier: "standard" } }));
    const fake = new FakeBatches(opus(), "faultunkept"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    const [batch] = fake.batches as [FakeBatch];
    batch.status = "ended"; batch.results = batch.requests.map(r => standard(r.params, r.customId));
    // Two searches read the batch, differently, and each stopped before recording the batch it proved.
    const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    const write = (name: string, event: unknown) => db.auditLog.create({ data: { id: `aud_qb_${roundId}_${name}`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION,
      entityType: "Game", entityId: gameId, metaJson: JSON.stringify(event) } });
    const canceled = [{ type: "canceled", errorType: null, requestId: null, model: null, usage: null }];
    const priced = [{ type: "succeeded", errorType: null, requestId: receiptOf(batch.results), model: "claude-opus-5-5", usage: { input_tokens: 1000, output_tokens: 6500, service_tier: "standard" } }];
    await write(readingName(batch.id), { kind: "reading", batchId: batch.id, results: canceled, at: Date.now() });
    await write(`${readingName(batch.id).replace("reading", "reread")}-0123456789abcdef`, { kind: "reread", batchId: batch.id, digest: "0123456789abcdef", results: priced, at: Date.now() });
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    expect(await review(container, gameId)).toMatchObject({ state: "held", reason: expect.stringContaining("other results") });
    // The batch is kept before the hold: one of the round's batches, with the reread counted.
    expect(await foundOf(gameId)).toEqual([batch.id]);
    expect(await w.budget.readRequest(w.worldId, `@import/${JSON.stringify([fake.namespace, receiptOf(batch.results)])}`))
      .toMatchObject({ state: "settled", evidence: { amountMicroUsd: 134_000 } });
    // The game is deleted: the batch's bill is taken from its recorded reading, and the batch is deleted at the provider.
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    expect(await latesOf(gameId)).toMatchObject([{ batchId: batch.id, amountMicroUsd: 0 }]);
    expect(batch.deleted).toBe(true);
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("raises a failure to keep a batch's answer with nothing recorded, and answers on the next pass", async () => {
    const gameId = "batch-keep-fails", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "keepfails"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId); fake.end();
    const intent = await syncKeyOf(gameId);
    // The store of the answer (its one serialisable transaction after the results are read) is unavailable once:
    // nothing is decided from that reading, and the failure is raised.
    let resultsRead = false, failed = false;
    const results = fake.results.bind(fake);
    fake.results = async (id: string) => { const read = await results(id); resultsRead = true; return read; };
    const failing = { ...container, db: dbAround({ $transaction: async (run, args) => {
      if (resultsRead && !failed && (args[1] as { isolationLevel?: string } | undefined)?.isolationLevel === "Serializable") { failed = true; throw Error("storage is down"); }
      return run();
    } }) } as Container;
    await expect(advanceQualityBatches(failing, gameId, async () => {})).rejects.toThrow("storage is down");
    expect(failed).toBe(true);
    expect(await eventNames(gameId)).not.toContain("terminal");
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "pending" });
    await advanceQualityBatches(container, gameId, async () => {});
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "answered", amountMicroUsd: 9_000 });
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("counts copies found beside a held answer as charges of their own, read before or after a person settles the held one", async () => {
    const gameId = "batch-held-extras", w = await world(gameId); await paintFirst(gameId);
    // The round's own batch answers at a tier with no rate: held, its charge unknown, its receipts kept.
    const fake = new FakeBatches(opus(() => ({ usage: { input_tokens: 2000, output_tokens: 500, service_tier: "priority" } })), "heldextras");
    const request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    await review(container, gameId); fake.end();
    expect(await review(container, gameId)).toMatchObject({ state: "held" });
    const intent = await syncKeyOf(gameId), [own] = fake.batches as [FakeBatch], priced = opus();
    const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    // Copies the provider made, recorded by stale searches, each billed at the batch rate (9,000 micro-USD) unless said otherwise.
    const foundCopy = async (n: number, id: string, answer = priced) => {
      fake.batches.push({ ...structuredClone(own), id, results: own.requests.map(r => answer(r.params, r.customId)) });
      await db.auditLog.create({ data: { id: `aud_qb_${roundId}_found-${n}`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game", entityId: gameId,
        metaJson: JSON.stringify({ kind: "found", n, batchIds: [id], complete: true, at: Date.now() }) } });
    };
    const imported = async (id: string) => {
      const bill = (await latesOf(gameId)).find(late => late.batchId === id)!;
      return w.budget.readRequest(w.worldId, `@import/${JSON.stringify([fake.namespace, bill.results[0]!.requestId])}`);
    };
    // Codex's seventh-pass case: copies read while the held charge is unknown. A priced one is imported in full; one that cannot be
    // priced (Codex's eighth pass) is recorded as its own unknown charge at the synchronous reservation, held for a person.
    await foundCopy(1, "msgbatch_heldextrasb");
    await foundCopy(2, "msgbatch_heldextrasd", opus(() => ({ usage: { input_tokens: 2000, output_tokens: 500, service_tier: "priority" } })));
    await advanceQualityBatches(container, gameId, async () => {});
    expect(await imported("msgbatch_heldextrasb")).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 9_000 } });
    const unpriced = qualityBatchCopyKeyOf(intent.batchKey, "msgbatch_heldextrasd", (await latesOf(gameId)).find(late => late.batchId === "msgbatch_heldextrasd")!.results);
    expect(await w.budget.readRequest(w.worldId, unpriced)).toMatchObject({ state: "unknown", reserveMicroUsd: intent.syncReserveMicroUsd });
    // A person reconciles the held charge at its own batch's bill: that settles the one batch. Each copy stays as it was counted:
    // the priced one beside it, the unpriced one still unknown, the world still held for it.
    await w.budget.settle(w.worldId, intent.batchKey, { providerNamespace: fake.namespace, providerRequestId: "reconciled-by-a-person", usageId: "u",
      rawUsage: { basis: "the held answer's receipt, priced by a person" }, model: "claude-opus-5-5", amountMicroUsd: 9_000, costBasis: "conservative-upper-estimate" });
    await advanceQualityBatches(container, gameId, async () => {});
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    expect(await w.budget.readRequest(w.worldId, unpriced)).toMatchObject({ state: "unknown" });
    expect(await w.budget.audit(w.worldId)).toMatchObject({ held: true, unknownRequestKeys: [unpriced] });
    // Codex's other case: a copy read only after that settlement is not given the held batch's charge.
    await foundCopy(3, "msgbatch_heldextrasc");
    await advanceQualityBatches(container, gameId, async () => {});
    expect(await imported("msgbatch_heldextrasc")).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 9_000 } });
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 9_000 }, conflicts: [] });
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("counts a copy found after a presumption that another writer held before it applied: imported in full, never left to the held key", async () => {
    const gameId = "batch-presumed-held", w = await world(gameId); await paintFirst(gameId);
    // Codex's case: the copy's standard-tier bill, 134,000 micro-USD, is above the batch reservation.
    const fake = new FakeBatches(opus(() => ({ usage: { input_tokens: 1000, output_tokens: 6500, service_tier: "standard" } })), "presumedheld");
    const request = sol(gameId);
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review({ ...c, visualReview: { request }, qualityBatch: fake } as Container, gameId);
    const hidden = fake.batches.splice(0), [copy] = hidden as [FakeBatch], intent = await syncKeyOf(gameId);
    // Another writer holds the reservation as unknown right after the presumed-lost outcome is recorded, before it applies.
    const outcomeRecorded = async () => (await db.auditLog.count({ where: { entityId: gameId, id: { endsWith: "_terminal" } } })) > 0;
    let heldMeanwhile = false;
    const container = { ...c, visualReview: { request }, qualityBatch: fake, db: dbAround({ "worldBudgetLedger.findUnique": async read => {
      const rows = await read();
      if (!heldMeanwhile && await outcomeRecorded()) { heldMeanwhile = true; await w.budget.markUnknown(w.worldId, intent.batchKey, "held by another writer"); }
      return rows;
    } }) } as Container;
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    // The presumption falls back to the synchronous question, which a held world does not buy: the review stops there, as
    // any purchase in a held world does, until a person reconciles the held charge.
    await expect(review(container, gameId)).rejects.toMatchObject({ code: "world_held" });
    expect(heldMeanwhile).toBe(true);
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "fallback", resultType: "presumed-lost" });
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "unknown" });
    // The copy is listed a day later; the game is deleted. Its bill is counted in full by its own receipt before it goes.
    fake.batches.push(...hidden); fake.end();
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS + QUALITY_BATCH_LATE_SEARCH_MS);
    await sweepQualityBatches({ ...c, qualityBatch: fake } as Container, { deadlineAt: Date.now() + 230_000 });
    const [bill] = await latesOf(gameId);
    expect(bill).toMatchObject({ batchId: copy.id, amountMicroUsd: 134_000 });
    expect(await w.budget.readRequest(w.worldId, `@import/${JSON.stringify([fake.namespace, bill!.results[0]!.requestId])}`))
      .toMatchObject({ state: "settled", evidence: { amountMicroUsd: 134_000 } });
    expect(copy.deleted).toBe(true);
    expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("deletes a deleted game's other copies when the provider will not delete one of them", async () => {
    const gameId = "batch-remove-refused", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "removerefused"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    for (const name of ["b", "c"]) fake.batches.push({ ...structuredClone(fake.batches[0]!), id: `msgbatch_removerefused${name}` });
    fake.end();
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    expect(await review(container, gameId)).toMatchObject({ state: "held", reason: expect.stringContaining("3 batches carry") });
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    // The provider refuses to delete the first copy, every time; each of the others goes regardless, with its bill recorded first,
    // in a minute whose housekeeping starts with the refused one.
    const [refused] = fake.batches as [FakeBatch], remove = fake.remove.bind(fake);
    fake.remove = async (id: string) => { if (id === refused.id) throw Error("deletion refused"); return remove(id); };
    const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    let at = Math.ceil(Date.now() / 60_000) * 60_000;
    while (qualityBatchCopyStart(roundId, 3, at) !== 0) at += 60_000;
    vi.setSystemTime(at);
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    expect((await latesOf(gameId)).length).toBe(3);
    expect(fake.batches.map(batch => batch.deleted)).toEqual([false, true, true]);
    expect(fake.creates).toBe(1); expect(request).not.toHaveBeenCalled();
  }, 300_000);

  it("reads a copy whose bill can be read, though another's reads time out on every visit and the sweep comes back only every other minute", async () => {
    const gameId = "batch-unreadable-first", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "unreadable"), request = sol(gameId);
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review({ ...c, visualReview: { request }, qualityBatch: fake } as Container, gameId);
    fake.batches.push({ ...structuredClone(fake.batches[0]!), id: "msgbatch_unreadableb" }); fake.end();
    const [stuck, readable] = fake.batches as [FakeBatch, FakeBatch];
    // The copies are known with no recorded reading, so each bill needs reads from the provider.
    searchKeepingNoReadings(fake);
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    expect(await review({ ...c, visualReview: { request }, qualityBatch: fake } as Container, gameId)).toMatchObject({ state: "held" });
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    // Codex's case: reading the round takes eight seconds, and every read of the first copy times out after thirty.
    const results = fake.results.bind(fake);
    fake.results = async (id: string) => { if (id === stuck.id) { vi.setSystemTime(Date.now() + 30_000); throw Error("timed out"); } return results(id); };
    const container = { ...c, qualityBatch: fake, db: dbAround({ "auditLog.findMany": async (read, args) => {
      if ((args[0] as { where?: { entityId?: string } } | undefined)?.where?.entityId === gameId) vi.setSystemTime(Date.now() + 8_000);
      return read();
    } }) } as Container;
    // Codex's eighth-pass case: the sweep comes back to this round only every other minute (a second slow round takes the
    // window on the others). A visit that starts with the stuck copy has no room left for the other, and a start tied to
    // the minute alone would meet the stuck copy first on every visit.
    const first = Math.ceil((start + QUALITY_BATCH_CREATE_GRACE_MS) / 120_000) * 120_000;
    for (let visit = 1; visit <= 20 && !readable.deleted; visit++) {
      vi.setSystemTime(first + visit * 120_000);
      await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    }
    expect((await latesOf(gameId)).map(bill => bill.batchId)).toEqual([readable.id]);
    expect([stuck.deleted, readable.deleted]).toEqual([false, true]);
  }, 300_000);

  it("leaves standing a hold another writer made after the outcome's application read the charge as pending: the answer waits", async () => {
    const gameId = "batch-held-meanwhile", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "heldmeanwhile"), request = sol(gameId);
    await review({ ...c, visualReview: { request }, qualityBatch: fake } as Container, gameId); fake.end();
    const intent = await syncKeyOf(gameId);
    const outcomeRecorded = async () => (await db.auditLog.count({ where: { entityId: gameId, id: { endsWith: "_terminal" } } })) > 0;
    // Codex's case: right after the application reads the reservation as pending, another writer holds it as unknown.
    let heldMeanwhile = false;
    const container = { ...c, visualReview: { request }, qualityBatch: fake, db: dbAround({ "worldBudgetLedger.findUnique": async read => {
      const rows = await read();
      if (!heldMeanwhile && await outcomeRecorded()) { heldMeanwhile = true; await w.budget.markUnknown(w.worldId, intent.batchKey, "held by another writer"); }
      return rows;
    } }) } as Container;
    expect(await review(container, gameId)).toMatchObject({ state: "held", reason: expect.stringContaining("not settled") });
    expect(heldMeanwhile).toBe(true);
    // The hold stands: the outcome moved only a reservation still pending at its own write, and no alias was linked.
    expect(await w.budget.readRequest(w.worldId, intent.batchKey)).toMatchObject({ state: "unknown" });
    expect(await w.budget.readRequest(w.worldId, intent.syncKey)).toBeNull();
    expect(qualityCalls(request)).toBe(0);
  }, 300_000);

  it("reads and deletes the copies it knows before it searches for more in their turn: a search slow on every tick never starves them", async () => {
    const gameId = "batch-known-first", w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(opus(), "knownfirst"), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.createPlan = ["lost-after-create"];
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    // Three copies of the lost create (only the provider could make them): two have ended carrying the question, the third still runs.
    for (const name of ["b", "c"]) fake.batches.push({ ...structuredClone(fake.batches[0]!), id: `msgbatch_knownfirst${name}` });
    const [first, second] = fake.batches as [FakeBatch, FakeBatch, FakeBatch];
    for (const batch of [first, second]) { batch.status = "ended"; batch.results = batch.requests.map(r => fake.answer(r.params, r.customId)); }
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    expect(await review(container, gameId)).toMatchObject({ state: "held" });
    expect(await deleteGame(c, gameId, { type: "USER", id: w.userId }, w.userId)).toBe(true);
    // Codex's case: the search for this question takes 70 seconds on every tick, and stays undecided while the third runs.
    const intent = await syncKeyOf(gameId), find = fake.find.bind(fake);
    fake.find = async (customId, ...rest) => { if (customId === intent.customId) vi.setSystemTime(Date.now() + 70_000); return find(customId, ...rest); };
    // A minute whose turn is the known copies' (the search's turn comes in others).
    const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    let at = Math.ceil(Date.now() / 60_000) * 60_000;
    while (qualityBatchCopyStart(`${roundId}:search`, 2, at) !== 0) at += 60_000;
    vi.setSystemTime(at);
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    // In the one tick: both known copies read and deleted first, then the search; the running third waits for a later one.
    expect((await latesOf(gameId)).map(bill => bill.batchId).sort()).toEqual([first.id, second.id].sort());
    expect(fake.batches.map(batch => batch.deleted)).toEqual([true, true, false]);
    expect((await w.budget.audit(w.worldId)).unknownRequestKeys).toEqual([intent.batchKey]);
    expect(fake.creates).toBe(1); expect(request).not.toHaveBeenCalled();
  }, 300_000);
});

type Around = (read: () => Promise<unknown>, args: unknown[]) => Promise<unknown>;
/** The test database with some calls wrapped, named `model.method` or `$transaction`; each wrapper calls `read` for the real answer. */
function dbAround(wrap: Partial<Record<string, Around>>): PrismaClient {
  return new Proxy(db, { get(target, prop) {
    const value = Reflect.get(target, prop) as unknown;
    if (typeof prop !== "string") return value;
    if (typeof value === "function") {
      const fn = (value as (...args: unknown[]) => Promise<unknown>).bind(target), around = wrap[prop];
      return around ? (...args: unknown[]) => around(() => fn(...args), args) : fn;
    }
    if (!value || typeof value !== "object" || !Object.keys(wrap).some(key => key.startsWith(`${prop}.`))) return value;
    return new Proxy(value as object, { get(model, method) {
      const fn = Reflect.get(model, method) as unknown;
      if (typeof fn !== "function") return fn;
      const call = (fn as (...args: unknown[]) => Promise<unknown>).bind(model), around = wrap[`${prop}.${String(method)}`];
      return around ? (...args: unknown[]) => around(() => call(...args), args) : call;
    } });
  } });
}

/** The test database, with the ledger refusing every write that would count `receipt` (matched with its quotes). */
function refusingBill(receipt: string): PrismaClient {
  return dbAround({ "worldBudgetLedger.updateMany": async (write, args) => {
    if ((args[0] as { data: { snapshotJson?: string } }).data.snapshotJson?.includes(JSON.stringify(receipt))) throw Error("the ledger refuses this bill");
    return write();
  } });
}

/** The same results with each answer's usage serialised in reverse key order. */
const reordered = (results: readonly QualityBatchResult[]) => results.map(result => {
  const message = (result as { message: Record<string, unknown> }).message;
  return { ...result, message: { ...message, usage: Object.fromEntries(Object.entries(message.usage as Record<string, unknown>).reverse()) } } as QualityBatchResult;
});

/**
 * Codex's ninth-pass sequence. An answered round; a copy a stale search recorded later, answered `priced` or by a tier with
 * no rate. Its reading is recorded and its charge counted, and the worker stops before its bill is recorded; `reconcile`
 * then stands for a person acting on an unpriced copy's row; the provider then returns the same results, another receipt,
 * or the same answer serialised in another order; and the next pass records the copy's bill.
 */
async function replayedCopy(gameId: string, name: string, answer: "priced" | "unpriced", again: "same" | "another" | "reordered",
  reconcile: (w: Awaited<ReturnType<typeof world>>, key: string, receipt: string) => Promise<void> = async () => {}) {
  const w = await world(gameId); await paintFirst(gameId);
  const fake = new FakeBatches(opus(), name), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
  await review(container, gameId); fake.end(); await review(container, gameId);
  const intent = await syncKeyOf(gameId), [own] = fake.batches as [FakeBatch];
  const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
  const answering = answer === "priced" ? fake.answer : unpricedOpus;
  const copy: FakeBatch = { ...structuredClone(own), id: `msgbatch_${name}b`, deleted: false, results: own.requests.map(r => answering(r.params, r.customId)) };
  fake.batches.push(copy);
  // Every read of the copy's results, counted.
  let reads = 0;
  const results = fake.results.bind(fake);
  fake.results = async (id: string) => { if (id === copy.id) reads++; return results(id); };
  await db.auditLog.create({ data: { id: `aud_qb_${roundId}_found-1`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game", entityId: gameId,
    metaJson: JSON.stringify({ kind: "found", n: 1, batchIds: [copy.id], complete: true, at: Date.now() }) } });
  // The first transaction after the copy's charge commits is its bill's record: the worker stops there.
  const counted = (await w.budget.audit(w.worldId)).committedMicroUsd;
  let stopped = false;
  const stopping = { ...container, db: dbAround({ $transaction: async read => {
    if (!stopped && (await w.budget.audit(w.worldId)).committedMicroUsd > counted) { stopped = true; throw Error("the worker stopped"); }
    return read();
  } }) } as Container;
  await expect(advanceQualityBatches(stopping, gameId, async () => {})).rejects.toThrow("the worker stopped");
  expect(stopped).toBe(true); expect(await latesOf(gameId)).toEqual([]);
  const firstReceipt = receiptOf(copy.results!), [first] = (await w.budget.audit(w.worldId)).unknownRequestKeys;
  if (first) { await reconcile(w, first, firstReceipt); expect((await w.budget.audit(w.worldId)).held).toBe(false); }
  if (again === "another") copy.results = own.requests.map(r => answering(r.params, r.customId));
  if (again === "reordered") copy.results = reordered(copy.results!);
  await advanceQualityBatches(container, gameId, async () => {});
  const [bill] = await latesOf(gameId) as [LateBill];
  expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  return { w, fake, intent, copy, first: first ?? null, firstReceipt, laterReceipt: receiptOf(copy.results!), bill, reads };
}

/**
 * Codex's tenth-pass schedule. An answered round; a copy a stale search recorded later. One pass reads the copy and waits on
 * the provider; meanwhile another reads it, records its bill and deletes it; the held-up pass's read then returns another
 * answer, unpriced like the recorded one. `refuseOnce`: the ledger refuses the held-up reading's row once.
 */
async function copyRace(gameId: string, name: string, refuseOnce = false) {
  const w = await world(gameId); await paintFirst(gameId);
  const fake = new FakeBatches(opus(), name), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
  await review(container, gameId); fake.end(); await review(container, gameId);
  const intent = await syncKeyOf(gameId), [own] = fake.batches as [FakeBatch];
  const roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
  const copy: FakeBatch = { ...structuredClone(own), id: `msgbatch_${name}b`, deleted: false };
  fake.batches.push(copy);
  await db.auditLog.create({ data: { id: `aud_qb_${roundId}_found-1`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game", entityId: gameId,
    metaJson: JSON.stringify({ kind: "found", n: 1, batchIds: [copy.id], complete: true, at: Date.now() }) } });
  const other = own.requests.map(r => unpricedOpus(r.params, r.customId)), recorded = own.requests.map(r => unpricedOpus(r.params, r.customId));
  const race = raceReads(fake, copy.id, other, recorded);
  let refused = !refuseOnce;
  const held = refuseOnce ? { ...container, db: dbAround({ "worldBudgetLedger.updateMany": async (write, args) => {
    if (!refused && (args[0] as { data: { snapshotJson?: string } }).data.snapshotJson?.includes(`(${receiptOf(other)})`)) { refused = true; throw Error("the ledger refuses this bill"); }
    return write();
  } }) } as Container : container;
  const slow = advanceQualityBatches(held, gameId, async () => {}).then(() => null, (error: unknown) => error);
  await race.started();
  await advanceQualityBatches(container, gameId, async () => {});
  expect(await latesOf(gameId)).toMatchObject([{ batchId: copy.id, amountMicroUsd: null, results: [{ requestId: receiptOf(recorded) }] }]);
  expect(copy.deleted).toBe(true);
  race.release();
  const failure = await slow;
  if (refuseOnce) expect(failure).toBeInstanceOf(Error); else expect(failure).toBeNull();
  expect(await latesOf(gameId)).toHaveLength(1);
  expect(fake.creates).toBe(1); expect(qualityCalls(request)).toBe(0);
  return { w, fake, intent, copy, other, recorded, container };
}

describe("the per-game quality channel pin", () => {
  it("pins Message Batches only on a new QA draft under dual review v3, and refuses a changed pin", async () => {
    const container = { ...c, pinDualVisualReview: true, visualReview: { request: vi.fn() }, qualityChannel: QUALITY_BATCH_CHANNEL } as unknown as Container;
    const pinned = await createDraft({ ...container, dualVisualReviewRelease: DUAL_VISUAL_REVIEW_V3 } as Container, null, "he");
    expect(await qualityChannelOf(db, pinned.gameId)).toEqual({ channel: QUALITY_BATCH_CHANNEL, deadlineMs: QUALITY_BATCH_DEADLINE_MS });
    const before = await db.game.count();
    await expect(createDraft({ ...container, dualVisualReviewRelease: DUAL_VISUAL_REVIEW_VERSION } as Container, null, "he")).rejects.toThrow("dual review v3");
    await expect(createDraft({ ...container, pinDualVisualReview: false } as Container, null, "he")).rejects.toThrow("dual review v3");
    expect(await db.game.count()).toBe(before);
    const unpinned = await createDraft({ ...container, dualVisualReviewRelease: DUAL_VISUAL_REVIEW_V3, qualityChannel: undefined } as Container, null, "he");
    expect(await qualityChannelOf(db, unpinned.gameId)).toBeNull();
    const id = qualityChannelAuditId(pinned.gameId), receipt = JSON.parse((await db.auditLog.findUniqueOrThrow({ where: { id } })).metaJson!);
    await db.auditLog.update({ where: { id }, data: { metaJson: JSON.stringify({ ...receipt, deadlineMs: 24 * HOUR }) } });
    await expect(qualityChannelOf(db, pinned.gameId)).rejects.toThrow("refusing a fallback");
  });
  it("names the batch key so deletion's inventory accepts it and no recovery mistakes it for a synchronous review", () => {
    const key = qualityBatchKeyOf("giza", "a".repeat(64));
    expect(key.startsWith("self-repair:")).toBe(true);
    expect(/^self-repair:board:[a-z]+:[a-f0-9]{64}$/.test(key)).toBe(false);
  });
});
