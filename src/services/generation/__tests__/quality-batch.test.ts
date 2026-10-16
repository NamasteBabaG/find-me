import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { PrismaRetainedPurchaseStore, retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { QualityBatchRefused, type QualityBatchResult, type QualityBatchTransport } from "../../../infra/generation/types";
import { AnthropicMessageBatches } from "../../../infra/generation/anthropic-message-batches";
import { GameConfigSchema } from "../../../domain/game/config";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { cropOf, maskForHide } from "../../../domain/scene/local-patch-hides";
import { QUALITY_BATCH_CREATE_GRACE_MS, QUALITY_BATCH_REFUSAL_BACKOFF_MS } from "../../../domain/generation/quality-batch-round";
import type { Container } from "../../container";
import { boardsOfWorlds } from "../../world-catalog.service";
import { deleteGame } from "../../game.service";
import { createDraft } from "../../create-flow.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
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
import { QUALITY_BATCH_ACTION, QUALITY_BATCH_SWEEP_ROUND_MS, advanceQualityBatches, qualityBatchKeyOf, sweepQualityBatches } from "../quality-batch";
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
  /** `name` keeps one test's batch ids apart from the rounds earlier tests left in the shared database. */
  constructor(public answer: (params: Record<string, unknown>, customId: string) => QualityBatchResult, private readonly name = "fake") {}
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
  async find(customId: string, sinceMs: number) {
    this.calls.push("find");
    const candidates = this.batches.filter(b => !b.deleted && b.createdAt >= sinceMs - 5 * 60_000);
    return { proven: candidates.filter(b => b.status === "ended" && b.results!.some(r => r.customId === customId)).map(b => b.id),
      undecided: candidates.some(b => b.status !== "ended") };
  }
  async status(id: string) { this.calls.push("status"); return this.batch(id).status; }
  async results(id: string) { this.calls.push("results"); const b = this.batch(id); if (b.status !== "ended") throw Error("not ended"); return b.results!; }
  async cancel(id: string) {
    this.calls.push("cancel");
    const b = this.batch(id);
    b.cancelled = true;
    if (b.status === "in_progress") { b.status = "ended"; b.results = b.requests.map(r => ({ customId: r.customId, type: "canceled" as const })); }
  }
  async remove(id: string) { this.calls.push("remove"); const b = this.batch(id); if (b.status !== "ended") throw Error("cancel first"); b.deleted = true; }
}

const scene = (gameId: string, board = BOARDS[0]!) => ({ gameId, sceneId: `gsc-${gameId}-${board.board}` });
const review = (container: Container, gameId: string, board = BOARDS[0]!, deadlineMs = 270_000) =>
  reviewLocalPatchBoard(container, { ...scene(gameId, board), deadlineAt: Date.now() + deadlineMs }, { fence: async () => {} });
const rows = (gameId: string) => db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, orderBy: { id: "asc" } });
const events = (gameId: string) => db.auditLog.findMany({ where: { entityId: gameId, action: QUALITY_BATCH_ACTION }, orderBy: { id: "asc" } });
const eventNames = async (gameId: string) => (await events(gameId)).map(row => row.id.replace(/^aud_qb_qb[a-f0-9]{30}_/, "")).sort();
/** Every batch the round's searches kept, in the order kept. */
const foundOf = async (gameId: string) => (await events(gameId)).map(row => JSON.parse(row.metaJson!) as { kind: string; n: number; batchIds: string[] })
  .filter(event => event.kind === "found").sort((a, b) => a.n - b.n).flatMap(event => event.batchIds);
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
    expect(await eventNames(gameId)).toEqual(["cancel", "claim-1", "intent", "submitted", "terminal"]);
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
    // The sweep's search does not see the batch yet; right after it last reads the round, another pass records it.
    fake.find = async () => ({ proven: [], undecided: false });
    const intent = await syncKeyOf(gameId), roundId = /^aud_qb_(qb[a-f0-9]{30})_intent$/.exec((await events(gameId)).find(row => row.id.endsWith("_intent"))!.id)![1]!;
    let reads = 0;
    const container = { ...c, qualityBatch: fake, db: dbAround({ "auditLog.findMany": async (read, args) => {
      const rows = await read();
      if ((args[0] as { where?: { entityId?: string } } | undefined)?.where?.entityId === gameId && ++reads === 2) {
        for (const [name, event] of [["found-1", { kind: "found", n: 1, batchIds: [batch.id], complete: true, at: Date.now() }],
          ["submitted", { kind: "submitted", n: 1, batchId: batch.id, at: Date.now() }]] as const)
          await db.auditLog.create({ data: { id: `aud_qb_${roundId}_${name}`, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game",
            entityId: gameId, metaJson: JSON.stringify(event) } });
      }
      return rows;
    } }) } as Container;
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    // The presumption lost the slot: the round's batch is the recorded one (cancelled, as the game is stopped), nothing counted as lost.
    expect(reads).toBeGreaterThanOrEqual(2);
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
    // The proven copy is kept, but nothing is decided, released or asked: the running one may still bill the question.
    const intent = await syncKeyOf(gameId);
    expect(await eventNames(gameId)).toEqual(["claim-1", "found-1", "intent"]);
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
    // Held at once and for good, with both copies kept; the search for the third goes on.
    const intent = await syncKeyOf(gameId);
    expect((await w.budget.audit(w.worldId)).unknownRequestKeys).toEqual([intent.batchKey]);
    expect(await eventNames(gameId)).toEqual(["claim-1", "found-1", "intent", "terminal"]);
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
    expect(await eventNames(gameId)).toEqual(["claim-1", "found-1", "intent", "submitted"]);
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
    expect(fake.batches.map(batch => batch.deleted)).toEqual([true, true, true, false]);
    expect((await eventNames(gameId)).filter(name => name.startsWith("deleted"))).toEqual(["deleted-1"]);
    vi.setSystemTime(Date.now() + 60_000);
    await sweepQualityBatches(container, { deadlineAt: Date.now() + 230_000 });
    expect(fake.batches.map(batch => batch.deleted)).toEqual([true, true, true, true]);
    expect((await eventNames(gameId)).filter(name => name.startsWith("deleted"))).toEqual(["deleted-1", "deleted-2"]);
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
    // Codex's case: the held review parks the job; the game stays generating, and only the scheduled sweep runs.
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
