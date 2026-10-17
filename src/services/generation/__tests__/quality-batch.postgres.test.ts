import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { performance } from "node:perf_hooks";
import sharp from "sharp";
import type { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DbStorage } from "../../../infra/storage/db";
import type { QualityBatchFound, QualityBatchResult, QualityBatchStatus, QualityBatchTransport } from "../../../infra/generation/types";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { cropOf, maskForHide } from "../../../domain/scene/local-patch-hides";
import { QUALITY_BATCH_CREATE_GRACE_MS } from "../../../domain/generation/quality-batch-round";
import type { Container } from "../../container";
import { boardsOfWorlds } from "../../world-catalog.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { reviewLocalPatchBoard } from "../local-patch-board-review";
import { runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import { localPatchHideEvidenceIds } from "../local-patch-judge";
import { LOCAL_PATCH_STYLE } from "../local-patch-world";
import { DUAL_VISUAL_REVIEW_V3, pinVisualReviewRelease } from "../visual-review-release";
import { QUALITY_BATCH_CHANNEL, pinQualityChannel } from "../quality-channel";
import { QUALITY_BATCH_ACTION, advanceQualityBatches } from "../quality-batch";
import { sha256Bytes } from "../fixed-sprite";
import { bill, paintedCrop, paintedOk, seedApprovedGame } from "./local-patch-fixtures";
import { GOOD_V12_VERDICT, boundHide, dualReviewer, longAnswer } from "./local-patch-dual-fixtures";

/**
 * The round lock on PostgreSQL itself (doc §6, item 21). SQLite serializes its writers on its own, so the race tests in
 * quality-batch.test.ts cannot tell the round lock from SQLite's writer lock. Here two connections, each a client of one
 * connection as in production, write the same round at once: Codex's seventeenth-pass schedule, with the first writer
 * holding the round's intent row while the second asks for it.
 *
 * Runs only with FINDME_PG_LOCK_URL: a disposable PostgreSQL database on this machine, never a deployment's. Everything
 * the file writes is in a schema of its own, dropped at the end. It generates its own PostgreSQL client
 * (node_modules/.prisma-pg, on the product's own Prisma runtime) and pushes the schema; every provider is a scripted fake.
 *
 *   docker run --rm -d --name findme-pg-lock -e POSTGRES_PASSWORD=<any> -p 127.0.0.1:55432:5432 postgres:16
 *   FINDME_PG_LOCK_URL=postgresql://postgres:<any>@127.0.0.1:55432/postgres npx vitest run src/services/generation/__tests__/quality-batch.postgres.test.ts
 */
const fakes = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0, LOCAL_PATCH_PLAYER_REVIEW: "on",
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", LOCAL_PATCH_PROMPT_RELEASE: "v15" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: fakes.testers }), flag: () => false, adminEmails: () => [] }));

const DATABASE = process.env.FINDME_PG_LOCK_URL;
const journeySlugs = new Set(boardsOfWorlds(["journey"]));
const BOARDS = localPatchBoardsForVersion(12).filter(board => journeySlugs.has(board.board)), HIDES = BOARDS.flatMap(board => board.hides);

describe.skipIf(!DATABASE)("a round's writes on PostgreSQL, two connections at once (FINDME_PG_LOCK_URL)", () => {
  let schema = "", setup: PrismaClient, c: Container, PgClient: new (options: object) => PrismaClient;
  const clients: PrismaClient[] = [];
  const urlFor = (name: string, connections: number, pooled: boolean) => {
    const url = new URL(DATABASE!);
    url.searchParams.set("schema", schema);
    url.searchParams.set("application_name", `findme_lock_${name}`);
    url.searchParams.set("connection_limit", String(connections));
    url.searchParams.set("pool_timeout", "10");
    // Production's runtime client: one connection, through a transaction pooler (prisma/DATABASE_TLS.md).
    if (pooled) url.searchParams.set("pgbouncer", "true");
    return url.toString();
  };
  const client = (name: string, connections = 1, pooled = true) => {
    const made = new PgClient({ datasources: { db: { url: urlFor(name, connections, pooled) } } });
    clients.push(made);
    return made;
  };

  beforeAll(async () => {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(DATABASE!).hostname))
      throw Error("FINDME_PG_LOCK_URL must name a disposable database on this machine, never a deployment's");
    schema = `findme_lock_${randomBytes(6).toString("hex")}`;
    const dir = path.join("node_modules", ".prisma-pg"), schemaFile = path.join(dir, "schema.prisma"), index = path.resolve(dir, "client", "index.js");
    mkdirSync(dir, { recursive: true });
    writeFileSync(schemaFile, readFileSync(path.join("prisma", "schema.prisma"), "utf8")
      .replace(/generator client \{[^}]*\}/, 'generator client {\n  provider = "prisma-client-js"\n  output   = "./client"\n}')
      .replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"').replace('env("DATABASE_URL")', 'env("FINDME_PG_LOCK_SCHEMA_URL")'));
    const prisma = (...args: string[]) => execFileSync("npx", ["prisma", ...args, "--schema", schemaFile], { stdio: "pipe", shell: process.platform === "win32",
      env: { ...process.env, FINDME_PG_LOCK_SCHEMA_URL: urlFor("schema", 1, false), CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1" } });
    prisma("generate");
    // The product's own Prisma runtime, as a client generated in place requires it: its errors are the classes the product
    // checks (a write that lost its slot is a P2002 the product must recognise).
    writeFileSync(index, readFileSync(index, "utf8").replaceAll("require('./runtime/library.js')", "require('@prisma/client/runtime/library.js')"));
    prisma("db", "push", "--skip-generate");
    PgClient = (createRequire(index)(index) as { PrismaClient: new (options: object) => PrismaClient }).PrismaClient;
    setup = client("setup", 4, false);
    c = { db: setup, storage: new DbStorage(setup), appUrl: "http://localhost:3000", secret: "synthetic-quality-batch", analytics: { track: vi.fn() }, adminEmails: [],
      email: { id: "console", send: async () => ({ id: "synthetic-mail" }) }, emailFallbackTo: null } as unknown as Container;
    vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live requests forbidden in the batch channel tests"); }));
  }, 300_000);
  afterEach(() => { vi.useRealTimers(); });
  afterAll(async () => {
    vi.unstubAllGlobals();
    // Everything this file wrote is in its own schema.
    if (setup && schema) await setup.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    for (const made of clients) await made.$disconnect();
  });

  /** A paid nine-board v12 journey, pinned to dual review v3 and to Message Batches (as in quality-batch.test.ts). */
  async function world(gameId: string) {
    const seeded = await seedApprovedGame(c, setup, { gameId, approved: false, styleVersion: LOCAL_PATCH_STYLE, status: "DRAFT",
      scenes: BOARDS.map(board => ({ slug: board.board, version: 12 })) });
    fakes.testers.push(seeded.email);
    await setup.$transaction(async tx => {
      await pinVisualReviewRelease(tx, gameId, DUAL_VISUAL_REVIEW_V3);
      await pinQualityChannel(tx, gameId, QUALITY_BATCH_CHANNEL);
    });
    await setup.game.update({ where: { id: gameId }, data: { status: "TARGETS_GENERATING", paidAt: new Date() } });
    await setup.generationJob.create({ data: { id: `job_${gameId}`, gameId, status: "QUEUED" } });
    await setup.order.create({ data: { id: `ord-${gameId}`, gameId, userId: seeded.userId, provider: "mock", packageTier: "ONE_WORLD",
      amountAgorot: 3900, paymentStatus: "PAID", paidAt: new Date() } });
    const avatar = await sharp(seeded.sheet).resize(256, 256).png().toBuffer(), avatarId = `ast-avatar-${gameId}`;
    await c.storage.put(`game/${avatarId}.png`, avatar, "image/png");
    await setup.asset.create({ data: { id: avatarId, ownerId: seeded.userId, type: "AVATAR", visibility: "GAME", status: "READY",
      storagePath: `game/${avatarId}.png`, mimeType: "image/png", bytes: avatar.length, width: 256, height: 256, provider: "openai" } });
    await setup.childProfile.update({ where: { id: `chl-${gameId}` }, data: { avatarAssetId: avatarId } });
    await c.storage.put(`private/photo-${gameId}.jpg`, seeded.sheet, "image/png");
    const catalog = await readBoardConditionedCatalog();
    await reviewBoardWizardIdentity({ db: setup, apiKey: "synthetic", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {},
      write: work => setup.$transaction(work), reviewer: { review: async () => ({ httpOk: true, requestId: `req-identity-${gameId}`,
        body: { model: "gpt-5.6-luna", usage: { prompt_tokens: 1500, completion_tokens: 150 }, choices: [{ finish_reason: "stop", message: {
          content: JSON.stringify({ checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Controlled identity" }) } }] } }) } },
    { gameId, identityAssetId: `ast-sheet-${gameId}`, sheet: seeded.sheet, photo: seeded.sheet, atlas: seeded.sheet, contentVersion: 12,
      provenance: { promptVersion: "character-v6-painted-identity-geometry", quality: "medium", photoAssetId: `ast-photo-${gameId}`,
        photoSha256: sha256Bytes(seeded.sheet), ageYears: 8, crop: null,
        style: { version: "board-matched-identity/v4", catalogSha256: catalog.sha256, atlasSha256: sha256Bytes(seeded.sheet) } } });
    return { worldId: boardWizardWorldId(gameId), budget: boardWizardBudgetOf(c) };
  }
  const painter = (gameId: string): LocalPatchHideDeps => ({ renderPolicySha256: "f".repeat(64), judge: async () => { throw Error("Per-hide judge forbidden"); },
    render: async ({ requestKey, stylePng }) => {
      const hide = HIDES.find(h => requestKey.startsWith(`${h.id}:`));
      if (!hide) throw Error(`Unexpected synthetic request ${requestKey}`);
      const attempt = Number(requestKey.split(":").at(-1)), mask = maskForHide(hide), crop = cropOf(hide);
      const png = await sharp(await paintedCrop(stylePng, hide)).composite([{ input: { create: { width: 6, height: 6, channels: 4,
        background: { r: 40 * attempt, g: 40, b: 180, alpha: 1 } } }, left: mask.left - crop.left + Math.floor(mask.width / 2),
        top: mask.top - crop.top + Math.floor(mask.height / 2) }]).png().toBuffer();
      return paintedOk(png, bill(`paint-${gameId}-${requestKey}`));
    } });
  const paintFirst = (gameId: string) => runLocalPatchHide(c, painter(gameId), { gameId, board: BOARDS[0]!, hide: BOARDS[0]!.hides[0]! });
  const review = (container: Container, gameId: string) => reviewLocalPatchBoard(container,
    { gameId, sceneId: `gsc-${gameId}-${BOARDS[0]!.board}`, deadlineAt: Date.now() + 270_000 }, { fence: async () => {} });
  const sol = (gameId: string) => dualReviewer(gameId, hideId => longAnswer(hideId, 300, 300, 0));
  const qualityCalls = (request: ReturnType<typeof dualReviewer>) => request.mock.calls.filter(([question]) => question.role === "scene-quality").length;
  const events = (gameId: string) => setup.auditLog.findMany({ where: { entityId: gameId, action: QUALITY_BATCH_ACTION }, orderBy: { id: "asc" } });
  const eventOf = async (gameId: string, name: string) => JSON.parse((await events(gameId)).find(row => row.id.endsWith(`_${name}`))?.metaJson ?? "null");
  /** A batch's reading's event name, spelled out apart from the code under test: the batch id in hex. */
  const readingName = (batchId: string) => `reading-${Buffer.from(batchId, "utf8").toString("hex")}`;
  const decisionsOf = async (gameId: string) => (await events(gameId)).map(row => JSON.parse(row.metaJson!) as { kind: string; decision?: unknown })
    .filter(event => event.kind === "submitted" || event.kind === "presumed" || event.decision);
  async function syncKeyOf(gameId: string) {
    const intent = (await events(gameId)).map(row => JSON.parse(row.metaJson!)).find(e => e.kind === "intent");
    return intent.intent as { syncKey: string; batchKey: string };
  }

  /** Opus's passing answer to a batched question, as Message Batches returns it. */
  let messages = 0;
  const opus = (params: Record<string, unknown>, customId: string): QualityBatchResult => {
    const hideId = boundHide(((params.messages as { content: { text?: string }[] }[])[0]!.content[0]!.text)!).hideId;
    return { customId, type: "succeeded", message: { id: `msg_synthetic_pg_${++messages}`, type: "message", role: "assistant", model: "claude-opus-5-5",
      content: [{ type: "text", text: "```json\n" + JSON.stringify({ hides: [{ hideId, evidenceIds: localPatchHideEvidenceIds(hideId), verdict: GOOD_V12_VERDICT }] }) + "\n```" }],
      stop_reason: "end_turn", usage: { input_tokens: 2000, output_tokens: 500, service_tier: "batch" } } };
  };
  type FakeBatch = { id: string; createdAt: number; requests: { customId: string; params: Record<string, unknown> }[];
    status: "in_progress" | "ended"; results: QualityBatchResult[] | null; deleted: boolean };
  /** Message Batches, scripted (the same contract as quality-batch.test.ts's fake): one create, whose answer can be lost. */
  class FakeBatches implements QualityBatchTransport {
    readonly namespace = "anthropic:find-me-existing";
    readonly batches: FakeBatch[] = [];
    creates = 0;
    loseNextCreate = false;
    constructor(private readonly name: string) {}
    private batch(id: string) { const found = this.batches.find(b => b.id === id); if (!found || found.deleted) throw Error(`no such batch ${id}`); return found; }
    async create(requests: readonly { customId: string; params: Record<string, unknown> }[]) {
      this.creates++;
      const batch: FakeBatch = { id: `msgbatch_${this.name}${this.batches.length + 1}`, createdAt: Date.now(), requests: structuredClone([...requests]),
        status: "in_progress", results: null, deleted: false };
      this.batches.push(batch);
      if (this.loseNextCreate) { this.loseNextCreate = false; throw Error("socket hang up after the batch was created"); }
      return { batchId: batch.id };
    }
    async find(customId: string, sinceMs: number, _deadlineAt?: number, untilMs?: number, known?: ReadonlySet<string>, watch?: ReadonlySet<string>): Promise<QualityBatchFound> {
      const listed = this.batches.filter(b => !b.deleted && b.createdAt >= sinceMs - 5 * 60_000 && (untilMs === undefined || b.createdAt <= untilMs + 5 * 60_000));
      const candidates = listed.filter(b => !known?.has(b.id)), carries = (b: FakeBatch) => b.results!.some(r => r.customId === customId);
      const proven = candidates.filter(b => b.status === "ended" && carries(b)), running = candidates.filter(b => b.status !== "ended").map(b => b.id);
      const cleared = [...watch ?? []].filter(id => { const b = listed.find(item => item.id === id); return !b || b.status === "ended" && !carries(b); });
      return { proven: proven.map(b => b.id), undecided: running.length > 0, results: Object.fromEntries(proven.map(b => [b.id, b.results!])), pending: running, cleared };
    }
    async status(id: string): Promise<QualityBatchStatus> {
      const b = this.batch(id);
      if (b.status !== "ended") return { status: b.status, counts: null };
      return { status: "ended", counts: { processing: 0, succeeded: b.results!.length, errored: 0, canceled: 0, expired: 0 } };
    }
    async results(id: string) { const b = this.batch(id); if (b.status !== "ended") throw Error("not ended"); return b.results!; }
    async cancel() { throw Error("No cancel in this schedule"); }
    async remove(id: string) { const b = this.batch(id); if (b.status !== "ended") throw Error("cancel first"); b.deleted = true; }
  }
  /** The same provider, as a search that is not shown `hidden` sees it (its list left that batch out). */
  const hiding = (fake: FakeBatches, hidden: FakeBatch): QualityBatchTransport => ({ namespace: fake.namespace, create: fake.create.bind(fake),
    status: fake.status.bind(fake), results: fake.results.bind(fake), cancel: fake.cancel.bind(fake), remove: fake.remove.bind(fake),
    find: async (...args: Parameters<FakeBatches["find"]>) => { hidden.deleted = true; try { return await fake.find(...args); } finally { hidden.deleted = false; } } });

  type Write = (args: { data?: { id?: string }; where?: { id?: string } }, write: () => Promise<unknown>) => Promise<unknown>;
  /** `base`, its interactive transactions' `auditLog.create` and `auditLog.updateMany` passed through `around`, and each
   * transaction it starts first through `starting` (which may refuse it: the worker stopped). */
  function intercepted(base: PrismaClient, around: { create?: Write; updateMany?: Write }, starting: () => void = () => {}): PrismaClient {
    const auditOf = (tx: Prisma.TransactionClient) => new Proxy(tx.auditLog, { get(model, method) {
      const fn = Reflect.get(model, method) as unknown, hook = method === "create" ? around.create : method === "updateMany" ? around.updateMany : undefined;
      if (typeof fn !== "function") return fn;
      const call = (fn as (args: unknown) => Promise<unknown>).bind(model);
      return hook ? (args: Parameters<Write>[0]) => hook(args, () => call(args)) : call;
    } });
    return new Proxy(base, { get(target, prop) {
      const value = Reflect.get(target, prop) as unknown;
      if (typeof value !== "function") return value;
      const fn = (value as (...args: unknown[]) => unknown).bind(target);
      if (prop !== "$transaction") return fn;
      return (work: unknown, options?: unknown) => {
        if (typeof work !== "function") return fn(work, options);
        try { starting(); } catch (error) { return Promise.reject(error); }
        return fn((tx: Prisma.TransactionClient) => (work as (tx: unknown) => unknown)(new Proxy(tx, { get(inner, key) {
          if (key === "auditLog") return auditOf(inner);
          const member = Reflect.get(inner, key) as unknown;
          return typeof member === "function" ? (member as (...args: unknown[]) => unknown).bind(inner) : member;
        } })), options);
      };
    } });
  }
  const isRoundLock = (args: Parameters<Write>[0]) => { const id = args.where?.id; return !!id && id.startsWith("aud_qb_") && id.endsWith("_intent"); };
  const pidOf = async (db: PrismaClient) => (await db.$queryRawUnsafe<{ pid: number }[]>("SELECT pg_backend_pid() AS pid"))[0]!.pid;
  type Backend = { pid: number; application_name: string; state: string | null; wait_event_type: string | null; wait_event: string | null; query: string; blocked_by: number[] };
  const backends = (observer: PrismaClient, pids: readonly number[]) => observer.$queryRawUnsafe<Backend[]>(`SELECT pid, application_name, state, wait_event_type,
    wait_event, query, pg_blocking_pids(pid) AS blocked_by FROM pg_stat_activity WHERE pid IN (${pids.map(Number).join(",")}) ORDER BY pid`);
  const locksOf = (observer: PrismaClient, pids: readonly number[]) => observer.$queryRawUnsafe<{ pid: number; locktype: string; mode: string; granted: boolean; relation: string | null }[]>(
    `SELECT l.pid, l.locktype, l.mode, l.granted, c.relname AS relation FROM pg_locks l LEFT JOIN pg_class c ON c.oid = l.relation
     WHERE l.pid IN (${pids.map(Number).join(",")}) AND (l.locktype IN ('transactionid', 'tuple') OR c.relname = 'AuditLog') ORDER BY l.pid, l.locktype, l.mode`);
  /** How long W1 keeps the round once the evidence is read (well inside an interactive transaction's 5 s). */
  const HOLD_MS = 500;
  /** What the database showed, kept with the run: printed, and appended to FINDME_PG_LOCK_EVIDENCE when it names a file. */
  const record = (label: string, evidence: object) => {
    const line = JSON.stringify({ label, ...evidence });
    console.info(`[pg-lock] ${line}`);
    if (process.env.FINDME_PG_LOCK_EVIDENCE) appendFileSync(process.env.FINDME_PG_LOCK_EVIDENCE, `${line}\n`);
  };
  async function until<T>(read: () => Promise<T | undefined | null | false>, ms: number, what: string): Promise<T> {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      const value = await read();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw Error(`Not within ${ms} ms: ${what}`);
  }

  /** Codex's seventeenth-pass round: the create's answer was lost, and the batch it made has ended with its answer. The
   * search is due. */
  async function lostCreateRound(gameId: string, name: string) {
    const w = await world(gameId); await paintFirst(gameId);
    const fake = new FakeBatches(name), request = sol(gameId), container = { ...c, visualReview: { request }, qualityBatch: fake } as Container;
    fake.loseNextCreate = true;
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await review(container, gameId);
    const [batch] = fake.batches as [FakeBatch];
    batch.status = "ended"; batch.results = batch.requests.map(r => opus(r.params, r.customId));
    vi.setSystemTime(start + QUALITY_BATCH_CREATE_GRACE_MS);
    return { w, fake, request, container, batch };
  }

  /**
   * The schedule, on two connections. W1 proves the batch: it records the batch's first reading, then what it found,
   * deciding the round's batch. It is held inside one of those writes (`holdIn`), the round's intent row taken and its
   * event written but not committed, and stops at its next write once let go (as the SQLite test's trigger stops it).
   * W2's complete search was shown no batch at all; its write records that and decides what the round's batch is.
   * `lock: false` leaves W2's round lock out, as the code did before 57b17f9a; W2 then also stops at its next write.
   */
  async function race(gameId: string, round: Awaited<ReturnType<typeof lostCreateRound>>, lock: boolean, holdIn: "reading" | "decision") {
    const w1 = client("w1"), w2 = client("w2"), observer = client("observer", 1, false);
    const w1Pid = await pidOf(w1), w2Pid = await pidOf(w2);
    const reading = readingName(round.batch.id), at: Record<string, number> = {};
    const held = (id: string) => holdIn === "reading" ? id.endsWith(`_${reading}`) : id.includes("_found-");
    let letGo!: () => void, w1Wrote = false, w2Decided = false;
    const gate = new Promise<void>(resolve => { letGo = resolve; });
    const w1db = intercepted(w1, { create: async (args, write) => {
      const row = await write();
      if (held(args.data?.id ?? "")) { w1Wrote = true; at.w1Holding = performance.now(); await gate; }
      return row;
    } }, () => { if (w1Wrote) throw Error("W1 stopped"); });
    // W2's first write of the round is its deciding write: the times are that write's, not those of the writes after it.
    const w2db = intercepted(w2, {
      updateMany: async (args, write) => {
        if (!isRoundLock(args)) return write();
        const first = at.w2LockAsked === undefined;
        if (first) at.w2LockAsked = performance.now();
        if (!lock) return { count: 1 };
        const done = await write();
        if (first) at.w2LockTaken = performance.now();
        return done;
      },
      create: async (args, write) => {
        const row = await write();
        if (args.data?.id?.includes("_found-")) w2Decided = true;
        return row;
      },
    }, () => { if (!lock && w2Decided) throw Error("W2 stopped"); });
    const fence = async () => {};
    const pass1 = advanceQualityBatches({ ...round.container, db: w1db } as Container, gameId, fence).then(() => "finished", (error: Error) => error.message);
    await until(async () => w1Wrote, 20_000, `W1 holding the round inside its ${holdIn}'s write`);
    const pass2 = advanceQualityBatches({ ...round.container, db: w2db, qualityBatch: hiding(round.fake, round.batch) } as Container, gameId, fence)
      .then(() => "finished", (error: Error) => error.message);
    const seen = lock
      ? await until(async () => (await backends(observer, [w2Pid])).find(b => b.wait_event_type === "Lock" && b.blocked_by.includes(w1Pid)), 3_000,
        "W2 waiting on a lock W1 holds")
      : null;
    // W2's own record is committed while W1 holds the round only if W2 did not wait for it.
    const committedWhileHeld = lock ? null : await until(async () => await eventOf(gameId, "found-1"), 3_000, "W2's record committed while W1 holds the round");
    const evidence = { w1Pid, w2Pid, backends: await backends(observer, [w1Pid, w2Pid]), locks: await locksOf(observer, [w1Pid, w2Pid]),
      foundWhileHeld: lock ? await eventOf(gameId, "found-1") : committedWhileHeld };
    // W1 keeps the round a while longer: a wait that lasts as long as the hold is not a round trip's latency.
    await new Promise(resolve => setTimeout(resolve, HOLD_MS));
    at.letGo = performance.now();
    letGo();
    const outcomes = { w1: await pass1, w2: await pass2 };
    return { seen, evidence, at, outcomes, reading };
  }

  it("makes the second connection wait for the round's intent row, then decide from what the first committed", async () => {
    const gameId = "pg-lock-reading-before-decision", round = await lostCreateRound(gameId, "pglock");
    const intent = await syncKeyOf(gameId);
    const { seen, evidence, at, outcomes, reading } = await race(gameId, round, true, "reading");
    record("round lock", { seen, ...evidence, waitedMs: Math.round(at.w2LockTaken! - at.w2LockAsked!),
      askedAfterHoldMs: Math.round(at.w2LockAsked! - at.w1Holding!), takenAfterLetGoMs: Math.round(at.w2LockTaken! - at.letGo!), outcomes });
    // W2 asked for the round while W1 held it, waited on W1's transaction, and had it only once W1 was let go.
    expect(seen).toMatchObject({ state: "active", wait_event_type: "Lock", blocked_by: [evidence.w1Pid], query: expect.stringMatching(/^UPDATE .*"AuditLog"/) });
    expect(evidence.backends.find(b => b.pid === evidence.w1Pid)).toMatchObject({ state: "idle in transaction", query: expect.stringMatching(/^INSERT INTO .*"AuditLog"/) });
    expect(evidence.locks).toContainEqual(expect.objectContaining({ pid: evidence.w2Pid, locktype: "transactionid", mode: "ShareLock", granted: false }));
    expect(evidence.foundWhileHeld).toBeNull();
    expect(at.w2LockAsked).toBeGreaterThan(at.w1Holding!);
    expect(at.w2LockAsked).toBeLessThan(at.letGo!);
    expect(at.w2LockTaken).toBeGreaterThan(at.letGo!);
    expect(at.w2LockTaken! - at.w2LockAsked!).toBeGreaterThanOrEqual(HOLD_MS);
    expect(outcomes).toEqual({ w1: "W1 stopped", w2: "finished" });
    // W2's record, built after the wait, carries the batch W1's reading proved: the round's batch, and nothing presumed lost.
    expect((await events(gameId)).some(row => row.id.endsWith(`_${reading}`))).toBe(true);
    expect(await eventOf(gameId, "found-1")).toMatchObject({ batchIds: [round.batch.id], complete: true, decision: { kind: "submitted", claim: 1, batchId: round.batch.id } });
    expect(await decisionsOf(gameId)).toHaveLength(1);
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "answered", batchId: round.batch.id, amountMicroUsd: 9_000 });
    expect(await round.w.budget.readRequest(round.w.worldId, intent.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 9_000 } });
    // The answer is delivered as paid for: nothing of Opus asked synchronously, one create.
    await review(round.container, gameId);
    expect(await round.w.budget.readRequest(round.w.worldId, intent.syncKey)).toMatchObject({ state: "linked", evidence: { amountMicroUsd: 9_000 } });
    expect(round.fake.creates).toBe(1); expect(qualityCalls(round.request)).toBe(0);
  }, 300_000);

  it("makes the second connection wait while the first decides, then decide nothing against what the first decided", async () => {
    const gameId = "pg-lock-decision-against-decision", round = await lostCreateRound(gameId, "pgdecide");
    const intent = await syncKeyOf(gameId);
    const { seen, evidence, at, outcomes } = await race(gameId, round, true, "decision");
    record("decision against decision", { seen, ...evidence, waitedMs: Math.round(at.w2LockTaken! - at.w2LockAsked!),
      askedAfterHoldMs: Math.round(at.w2LockAsked! - at.w1Holding!), takenAfterLetGoMs: Math.round(at.w2LockTaken! - at.letGo!), outcomes });
    expect(seen).toMatchObject({ state: "active", wait_event_type: "Lock", blocked_by: [evidence.w1Pid], query: expect.stringMatching(/^UPDATE .*"AuditLog"/) });
    expect(evidence.foundWhileHeld).toBeNull();
    expect(at.w2LockAsked).toBeGreaterThan(at.w1Holding!);
    expect(at.w2LockAsked).toBeLessThan(at.letGo!);
    expect(at.w2LockTaken).toBeGreaterThan(at.letGo!);
    expect(at.w2LockTaken! - at.w2LockAsked!).toBeGreaterThanOrEqual(HOLD_MS);
    expect(outcomes).toEqual({ w1: "W1 stopped", w2: "finished" });
    // W2 read W1's decision after the wait: W1's record is the round's only decision, and W2, shown no batch, records
    // nothing against it (no second record, no presumption).
    const finds = (await events(gameId)).map(row => JSON.parse(row.metaJson!) as { kind: string }).filter(event => event.kind === "found");
    expect(finds).toEqual([expect.objectContaining({ n: 1, batchIds: [round.batch.id], complete: true, decision: { kind: "submitted", claim: 1, batchId: round.batch.id } })]);
    expect(await decisionsOf(gameId)).toHaveLength(1);
    expect(await eventOf(gameId, "terminal")).toMatchObject({ kind: "answered", batchId: round.batch.id, amountMicroUsd: 9_000 });
    expect(await round.w.budget.readRequest(round.w.worldId, intent.batchKey)).toMatchObject({ state: "settled", evidence: { amountMicroUsd: 9_000 } });
    expect(round.fake.creates).toBe(1); expect(qualityCalls(round.request)).toBe(0);
  }, 300_000);

  it("control: the same schedule without W2's round lock, as before 57b17f9a - W2 does not wait, and presumes the create lost beside the batch's reading", async () => {
    const gameId = "pg-lock-control-no-lock", round = await lostCreateRound(gameId, "pgnolock");
    const { evidence, at, outcomes, reading } = await race(gameId, round, false, "reading");
    record("control without the round lock", { ...evidence, outcomes });
    // W2's record committed while W1 still held its write: nothing made it wait, and it decided from the round without W1's reading.
    expect(evidence.foundWhileHeld).toMatchObject({ batchIds: [], complete: true, decision: { kind: "presumed", claim: 1 } });
    expect(evidence.backends.find(b => b.pid === evidence.w2Pid)?.wait_event_type).not.toBe("Lock");
    expect(at.w2LockAsked).toBeLessThan(at.letGo!);
    expect(outcomes).toEqual({ w1: "W1 stopped", w2: "W2 stopped" });
    // The contradiction the round lock prevents: a batch's reading carrying the answer, and the round decided as presumed lost.
    expect((await events(gameId)).some(row => row.id.endsWith(`_${reading}`))).toBe(true);
    expect(await decisionsOf(gameId)).toEqual([expect.objectContaining({ decision: { kind: "presumed", claim: 1 } })]);
  }, 300_000);
});
