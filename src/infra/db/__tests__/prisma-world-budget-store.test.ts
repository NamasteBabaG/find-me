import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { WorldBudget, type WorldBudgetRequest, type WorldBudgetSnapshot, type WorldChargeEvidence } from "../../../services/generation/world-budget";
import { CasWorldBudgetRepository } from "../world-budget-repository";
import { PrismaWorldBudgetStore, WORLD_BUDGET_LEDGER_MAX_REVISION } from "../prisma-world-budget-store";

// REAL SQLite, never DATABASE_URL or the application singleton. Every client
// uses this newly-created absolute file and tests use distinct world IDs.
let scratch: string, databaseUrl: string, db: PrismaClient;
const clients: PrismaClient[] = [];
let sequence = 0;
function world() { return `sqlite-budget-${++sequence}`; }
function client() {
  if (!databaseUrl?.startsWith("file:") || !scratch) throw new Error("Disposable SQLite database has not been initialized");
  const result = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  clients.push(result); return result;
}
beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-world-budget-"));
  databaseUrl = `file:${path.join(scratch, "ledger-test.db").replace(/\\/g, "/")}`;
  db = client();
  await applyTestSchema(db);
});
afterAll(async () => {
  await Promise.all(clients.map(item => item.$disconnect()));
  if (scratch) {
    const resolved = realpathSync(scratch);
    if (path.dirname(resolved) !== realpathSync(tmpdir()) || !path.basename(resolved).startsWith("findme-world-budget-")) throw new Error("Refusing cleanup outside the isolated world-budget test directory");
    rmSync(resolved, { recursive: true, force: true });
  }
});

function input(requestKey = "request", reserveMicroUsd = 100_000) { return { requestKey, scope: "image" as const, operationFingerprint: `inputs:${requestKey}`, reserveMicroUsd }; }
function pending(requestKey = "request", reserveMicroUsd = 100_000): WorldBudgetRequest { return { ...input(requestKey, reserveMicroUsd), state: "pending", origin: "reserved", unknownReasons: [], conflicts: [] }; }
function snapshot(worldId: string, requests: WorldBudgetRequest[] = []): WorldBudgetSnapshot { return { worldId, requests }; }
function charge(providerRequestId = "provider", amountMicroUsd = 80_000): WorldChargeEvidence { return { providerNamespace: "openai:project-a", providerRequestId, usageId: `usage:${providerRequestId}`, rawUsage: { input_tokens: 2000, output_tokens: 1756 }, model: "gpt-image-2", amountMicroUsd, costBasis: "conservative-upper-estimate" }; }
function worker(connection = client()) {
  const store = new PrismaWorldBudgetStore(connection), repository = new CasWorldBudgetRepository(store);
  return { connection, store, repository, budget: new WorldBudget(repository) };
}
function barrier(parties = 2) {
  let arrived = 0, release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  return async () => { if (++arrived <= parties) { if (arrived === parties) release(); await waiting; } };
}
function raceReads(...stores: PrismaWorldBudgetStore[]) {
  const wait = barrier(stores.length);
  for (const store of stores) {
    const read = store.read.bind(store);
    vi.spyOn(store, "read").mockImplementation(async id => { const result = await read(id); await wait(); return result; });
  }
}

describe("Prisma world budget with actual disposable SQLite", () => {
  it("persists a whole versioned snapshot and performs one exact revision CAS", async () => {
    const id = world(), { store } = worker();
    expect(await store.read(id)).toBeNull();
    expect(await store.insertIfAbsent(id, snapshot(id, [pending()]))).toBe(true);
    expect(await store.insertIfAbsent(id, snapshot(id))).toBe(false); // actual Prisma P2002
    expect(await store.compareAndSwap(id, 1, snapshot(id))).toBe(false);
    expect(await store.read(id)).toEqual({ revision: 0, snapshot: snapshot(id, [pending()]) });
    expect(await store.compareAndSwap(id, 0, snapshot(id, [pending(), pending("two")]))).toBe(true);
    const row = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: id } });
    expect(row.schemaVersion).toBe(1); expect(row.revision).toBe(1);
    expect(JSON.parse(row.snapshotJson).requests).toHaveLength(2);
    const absent = world();
    expect(await store.compareAndSwap(absent, 0, snapshot(absent))).toBe(false);
  });

  it.each([false, true])("independent clients serialize competing 3-USD reservations, existing row=%s", async existing => {
    const id = world(), a = worker(), b = worker();
    if (existing) await a.store.insertIfAbsent(id, snapshot(id));
    raceReads(a.store, b.store);
    const results = await Promise.allSettled([a.budget.reserve(id, input("a", 3_000_000)), b.budget.reserve(id, input("b", 3_000_000))]);
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(item => item.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: { code: "cap_exceeded" } });
    expect((await worker().budget.audit(id)).committedMicroUsd).toBe(3_000_000);
    expect((await a.store.read(id))?.snapshot.requests).toHaveLength(1);
  });

  it("grants one dispatch permission across an actual row-initialization race", async () => {
    const id = world(), a = worker(), b = worker(); raceReads(a.store, b.store);
    const results = await Promise.all([a.budget.reserve(id, input()), b.budget.reserve(id, input())]);
    expect(results.map(item => item.acquired).sort()).toEqual([false, true]);
    expect((await a.store.read(id))?.revision).toBe(0);
    expect(await db.worldBudgetLedger.count({ where: { worldId: id } })).toBe(1);
  });

  it("gives exactly one winner for two clients swapping the same persisted revision", async () => {
    const id = world(), a = worker(), b = worker(); await a.store.insertIfAbsent(id, snapshot(id));
    const results = await Promise.all([
      a.store.compareAndSwap(id, 0, snapshot(id, [pending("a")])),
      b.store.compareAndSwap(id, 0, snapshot(id, [pending("b")])),
    ]);
    expect(results.sort()).toEqual([false, true]);
    const stored = await worker().store.read(id);
    expect(stored?.revision).toBe(1); expect(stored?.snapshot.requests).toHaveLength(1);
  });

  it("returns acquired only after another connection can read the reservation", async () => {
    const id = world(), a = worker(), observer = worker();
    const permission = await a.budget.reserve(id, input());
    expect(permission.acquired).toBe(true);
    expect((await observer.store.read(id))?.snapshot.requests).toEqual([pending()]);
  });

  it("reopens the same file with pending/unknown reservations intact and never reacquires", async () => {
    const id = world(), a = worker();
    await a.budget.reserve(id, input());
    await a.budget.markUnknown(id, "request", "response timeout; reconcile provider receipt");
    await a.connection.$disconnect();
    const b = worker();
    expect(await b.budget.reserve(id, input())).toMatchObject({ acquired: false, request: { state: "unknown" }, audit: { reservedMicroUsd: 100_000, held: true } });
    await expect(b.budget.reserve(id, input("other"))).rejects.toMatchObject({ code: "world_held" });
    await b.budget.settle(id, "request", charge());
    await b.connection.$disconnect();
    expect(await worker().budget.audit(id)).toMatchObject({ held: false, settledMicroUsd: 80_000, reservedMicroUsd: 0 });
  });

  it("durably counts one provider request when settlement races an atlas import", async () => {
    const id = world(), a = worker(), b = worker();
    await a.budget.reserve(id, input()); raceReads(a.store, b.store);
    await Promise.all([
      a.budget.settle(id, "request", charge()),
      b.budget.importSettled(id, { scope: "image", operationFingerprint: "inputs:request", evidence: charge() }),
    ]);
    const reopened = worker();
    expect(await reopened.budget.audit(id)).toMatchObject({ settledMicroUsd: 80_000, reservedMicroUsd: 0, held: false });
    expect((await reopened.store.read(id))!.snapshot.requests.filter(item => item.state === "settled")).toHaveLength(1);
    await reopened.budget.importSettled(id, { scope: "image", operationFingerprint: "inputs:request", evidence: charge() });
    expect((await reopened.budget.audit(id)).settledMicroUsd).toBe(80_000);
  });

  it("keeps conflicting settlement evidence and the world hold after reopening", async () => {
    const id = world(), a = worker(); await a.budget.reserve(id, input()); await a.budget.settle(id, "request", charge());
    await expect(a.budget.settle(id, "request", charge("provider", 90_000))).rejects.toMatchObject({ code: "evidence_conflict" });
    const reopened = worker();
    expect(await reopened.budget.audit(id)).toMatchObject({ settledMicroUsd: 80_000, held: true, conflictRequestKeys: ["request"] });
    expect((await reopened.store.read(id))!.snapshot.requests[0]!.conflicts[0]!.evidence.amountMicroUsd).toBe(90_000);
  });

  it("keeps the full external bill over reserve and cap, then prevents more work", async () => {
    const id = world(), { budget } = worker(); await budget.reserve(id, input());
    await budget.settle(id, "request", charge("provider", 6_000_000));
    const reopened = worker();
    expect(await reopened.budget.audit(id)).toMatchObject({ settledMicroUsd: 6_000_000, held: true, overCapMicroUsd: 1_000_000 });
    await expect(reopened.budget.reserve(id, input("next"))).rejects.toMatchObject({ code: "world_held" });
  });

  it("preserves safe individual external bills whose aggregate overflows", async () => {
    const id = world(), { budget } = worker();
    await budget.importSettled(id, { scope: "image", operationFingerprint: "a", evidence: charge("a", Number.MAX_SAFE_INTEGER) });
    await expect(budget.importSettled(id, { scope: "judge", operationFingerprint: "b", evidence: charge("b", 1) })).rejects.toMatchObject({ code: "arithmetic_overflow" });
    const reopened = worker(), stored = await reopened.store.read(id);
    expect(stored!.snapshot.requests.map(row => row.state === "settled" && row.evidence.amountMicroUsd)).toEqual([Number.MAX_SAFE_INTEGER, 1]);
    await expect(reopened.budget.audit(id)).rejects.toMatchObject({ code: "arithmetic_overflow" });
    await expect(reopened.budget.reserve(id, input())).rejects.toMatchObject({ code: "arithmetic_overflow" });
  });

  it.each([false, true])("callback throw leaves no partial persisted snapshot, existing=%s", async existing => {
    const id = world(), { repository, store } = worker(); if (existing) await store.insertIfAbsent(id, snapshot(id));
    await expect(repository.transactWorld(id, async tx => { await tx.createRequest(pending()); throw new Error("callback rolled back"); })).rejects.toThrow("callback rolled back");
    expect(await store.read(id)).toEqual(existing ? { revision: 0, snapshot: snapshot(id) } : null);
  });

  it("retains pending permission after a simulated lost commit acknowledgement", async () => {
    const id = world(), a = worker();
    const insert = a.store.insertIfAbsent.bind(a.store);
    const writes = vi.spyOn(a.store, "insertIfAbsent").mockImplementation(async (...args) => { await insert(...args); throw new Error("lost acknowledgement"); });
    await expect(a.budget.reserve(id, input())).rejects.toThrow("lost acknowledgement");
    expect(writes).toHaveBeenCalledTimes(1);
    expect(await worker().budget.reserve(id, input())).toMatchObject({ acquired: false, request: { state: "pending" } });
  });

  it("reads no default DB and rejects unsupported versions instead of replacing them", async () => {
    const id = world(), { store } = worker();
    await db.worldBudgetLedger.create({ data: { worldId: id, schemaVersion: 2, snapshotJson: JSON.stringify(snapshot(id)) } });
    await expect(store.read(id)).rejects.toMatchObject({ code: "unsupported_version" });
    expect(await store.compareAndSwap(id, 0, snapshot(id, [pending()]))).toBe(false);
    expect((await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: id } })).schemaVersion).toBe(2);
  });

  it("fails closed on corrupt JSON, wrong world binding and unsafe revision", async () => {
    const id = world(), { store } = worker(); await store.insertIfAbsent(id, snapshot(id));
    for (const snapshotJson of ["{bad-json", JSON.stringify(snapshot("wrong-world")), JSON.stringify({ worldId: id, requests: [], secret: "not allowed" })]) {
      await db.worldBudgetLedger.update({ where: { worldId: id }, data: { snapshotJson } });
      await expect(store.read(id)).rejects.toMatchObject({ code: "invalid_ledger" });
    }
    await db.worldBudgetLedger.update({ where: { worldId: id }, data: { snapshotJson: JSON.stringify(snapshot(id)), revision: -1 } });
    await expect(store.read(id)).rejects.toMatchObject({ code: "invalid_ledger" });
  });

  it("validates corrupted stored usage as strictly as incoming writes", async () => {
    const id = world(), { store } = worker();
    const row = { ...pending(), state: "settled", evidence: { ...charge(), rawUsage: { api_key: "synthetic-only-value" } } };
    await db.worldBudgetLedger.create({ data: { worldId: id, snapshotJson: JSON.stringify({ worldId: id, requests: [row] }) } });
    await expect(store.read(id)).rejects.toMatchObject({ code: "invalid_ledger" });
  });

  it("does not reset or wrap the database Int revision", async () => {
    const id = world(), { store } = worker(); await store.insertIfAbsent(id, snapshot(id));
    await db.worldBudgetLedger.update({ where: { worldId: id }, data: { revision: WORLD_BUDGET_LEDGER_MAX_REVISION } });
    await expect(store.compareAndSwap(id, WORLD_BUDGET_LEDGER_MAX_REVISION, snapshot(id))).rejects.toMatchObject({ code: "revision_exhausted" });
    expect((await store.read(id))?.revision).toBe(WORLD_BUDGET_LEDGER_MAX_REVISION);
  });
});

function fakeDb(overrides: Record<string, unknown> = {}) {
  const delegate = { findUnique: vi.fn(async (_args: unknown) => null), create: vi.fn(async (_args: unknown) => ({ worldId: "world" })), updateMany: vi.fn(async (_args: unknown) => ({ count: 1 })), ...overrides };
  return { delegate, store: new PrismaWorldBudgetStore({ worldBudgetLedger: delegate } as unknown as PrismaClient) };
}
function knownError(code: string, meta?: Record<string, unknown>) { return new Prisma.PrismaClientKnownRequestError("synthetic test failure", { code, clientVersion: "6.19.3", meta }); }

describe("strict Prisma boundary and ambiguous failures", () => {
  it("issues a single conditional update with snapshot and revision increment together", async () => {
    const { delegate, store } = fakeDb(); await store.compareAndSwap("world", 7, snapshot("world", [pending()]));
    expect(delegate.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { worldId: "world", revision: 7, schemaVersion: 1 },
      data: { revision: { increment: 1 }, snapshotJson: expect.any(String) },
    });
    const args = delegate.updateMany.mock.calls[0]![0] as { data: { snapshotJson: string } };
    expect(JSON.parse(args.data.snapshotJson)).toEqual(snapshot("world", [pending()]));
  });

  it.each([
    knownError("P2002", { modelName: "OtherModel", target: ["worldId"] }),
    knownError("P2002", { modelName: "WorldBudgetLedger", target: ["other"] }),
    knownError("P2002", { modelName: "WorldBudgetLedger", target: ["worldId", "other"] }),
    knownError("P2002", { modelName: "WorldBudgetLedger", target: "WorldBudgetLedger_pkey" }),
    knownError("P2002"), knownError("P2028"), new Error("connection failed after possible commit"),
    { code: "P2002", meta: { modelName: "WorldBudgetLedger", target: ["worldId"] } },
  ])("does not reinterpret uncertain or unrelated insert failures as conflicts %#", async error => {
    const create = vi.fn(async () => { throw error; }), { store } = fakeDb({ create });
    await expect(store.insertIfAbsent("world", snapshot("world"))).rejects.toBe(error);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("accepts only a known single worldId uniqueness failure as false", async () => {
    const { store } = fakeDb({ create: vi.fn(async () => { throw knownError("P2002", { modelName: "WorldBudgetLedger", target: ["worldId"] }); }) });
    expect(await store.insertIfAbsent("world", snapshot("world"))).toBe(false);
  });

  it.each(["findUnique", "updateMany"])("propagates %s database exceptions without retries", async method => {
    const error = new Error("database unavailable"), call = vi.fn(async () => { throw error; }), { store } = fakeDb({ [method]: call });
    await expect(method === "findUnique" ? store.read("world") : store.compareAndSwap("world", 0, snapshot("world"))).rejects.toBe(error);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it.each([-1, 2, undefined, "1"])("rejects impossible update count %s", async count => {
    const { store } = fakeDb({ updateMany: vi.fn(async () => ({ count })) });
    await expect(store.compareAndSwap("world", 0, snapshot("world"))).rejects.toMatchObject({ code: "invalid_ledger" });
  });

  it.each([
    { worldId: "world", requests: [pending("a", 0.1)] },
    { worldId: "world", requests: [pending("a", Number.NaN)] },
    { worldId: "world", requests: [pending("a"), pending("a")] },
    { worldId: "world", requests: [{ ...pending(), state: "unknown" }] },
    { worldId: "world", requests: [{ ...pending(), state: "pending", evidence: charge() }] },
    { worldId: "world", requests: [{ ...pending(), scope: "free-untracked" }] },
    { worldId: "world", requests: [], authorization: "not-persisted" },
  ])("rejects malformed snapshot before any write %#", async malformed => {
    const { store, delegate } = fakeDb();
    await expect(store.insertIfAbsent("world", malformed as WorldBudgetSnapshot)).rejects.toMatchObject({ code: "invalid_ledger" });
    expect(delegate.create).not.toHaveBeenCalled();
  });

  it.each([
    { api_key: "synthetic credential" }, { nested: { Authorization: "synthetic credential" } },
    { output_tokens: 1, messages: [] }, { output_tokens: 1, value: "sk" + "-test-only-synthetic-secret" },
    { output_tokens: 1, value: "Bearer synthetic-test-token" },
  ])("rejects credential/input data inside usage without echoing it %#", async rawUsage => {
    const { store, delegate } = fakeDb(), row = { ...pending(), state: "settled", evidence: { ...charge(), rawUsage } };
    const call = store.insertIfAbsent("world", snapshot("world", [row as WorldBudgetRequest]));
    await expect(call).rejects.toMatchObject({ code: "invalid_ledger" });
    await expect(call).rejects.not.toThrow("synthetic");
    expect(delegate.create).not.toHaveBeenCalled();
  });

  it("validates later rows/links even after an overflowing aggregate", async () => {
    const { store, delegate } = fakeDb();
    const settled = (key: string, amount: number): WorldBudgetRequest => ({ ...pending(key), state: "settled", evidence: charge(key, amount) });
    const prefix = [settled("a", Number.MAX_SAFE_INTEGER), settled("b", 1)];
    const duplicateCharge = { ...settled("c", 1), evidence: charge("b", 1) };
    const brokenLink: WorldBudgetRequest = { ...pending("c"), state: "linked", canonicalRequestKey: "absent", evidence: charge("c") };
    for (const later of [pending("c", 0), duplicateCharge, brokenLink]) {
      await expect(store.insertIfAbsent("world", snapshot("world", [...prefix, later]))).rejects.toMatchObject({ code: "invalid_ledger" });
    }
    expect(delegate.create).not.toHaveBeenCalled();
  });

  it("does not permit a linked charge to hide a different operation", async () => {
    const { store, delegate } = fakeDb();
    const canonical: WorldBudgetRequest = { ...pending("canonical"), state: "settled", evidence: charge() };
    const linked: WorldBudgetRequest = { ...pending("other"), state: "linked", canonicalRequestKey: "canonical", evidence: charge() };
    await expect(store.insertIfAbsent("world", snapshot("world", [canonical, linked]))).rejects.toMatchObject({ code: "invalid_ledger" });
    expect(delegate.create).not.toHaveBeenCalled();
  });

  it("rejects cyclic or class-instance usage before JSON serialization", async () => {
    const cyclic: Record<string, unknown> = {}; cyclic.self = cyclic;
    for (const rawUsage of [cyclic, new Date()]) {
      const { store, delegate } = fakeDb();
      const row = { ...pending(), state: "settled", evidence: { ...charge(), rawUsage } } as unknown as WorldBudgetRequest;
      await expect(store.insertIfAbsent("world", snapshot("world", [row]))).rejects.toMatchObject({ code: "invalid_ledger" });
      expect(delegate.create).not.toHaveBeenCalled();
    }
  });
});
