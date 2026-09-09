import { describe, expect, it, vi } from "vitest";
import { WorldBudget, type WorldBudgetRequest, type WorldBudgetSnapshot, type WorldBudgetTransaction, type WorldChargeEvidence } from "../../../services/generation/world-budget";
import { CasWorldBudgetRepository, type AtomicWorldBudgetStore, type VersionedWorldBudgetSnapshot } from "../world-budget-repository";

/** TEST ONLY persisted image. No real DB, disk durability or process guarantees. */
class FakeBacking {
  rows = new Map<string, { revision: number; json: string }>();
  reads = 0; inserts = 0; swaps = 0; conflicts = 0;
}
class FakeAtomicStore implements AtomicWorldBudgetStore {
  afterRead?: () => Promise<void>;
  afterWrite?: () => Promise<void>;
  forceConflicts = 0;
  throwAfterCommit = false;
  constructor(readonly backing: FakeBacking) {}
  async read(worldId: string): Promise<VersionedWorldBudgetSnapshot | null> {
    this.backing.reads++;
    const row = this.backing.rows.get(worldId);
    const result = row ? { revision: row.revision, snapshot: JSON.parse(row.json) as WorldBudgetSnapshot } : null;
    await this.afterRead?.();
    return result;
  }
  private async acknowledged() {
    if (this.throwAfterCommit) { this.throwAfterCommit = false; throw new Error("Lost commit acknowledgement"); }
    await this.afterWrite?.();
    return true;
  }
  async insertIfAbsent(worldId: string, snapshot: WorldBudgetSnapshot) {
    this.backing.inserts++;
    if (this.forceConflicts-- > 0 || this.backing.rows.has(worldId)) { this.backing.conflicts++; return false; }
    // No await between comparison and whole-record write: atomic TEST primitive.
    this.backing.rows.set(worldId, { revision: 0, json: JSON.stringify(snapshot) });
    return this.acknowledged();
  }
  async compareAndSwap(worldId: string, expectedRevision: number, snapshot: WorldBudgetSnapshot) {
    this.backing.swaps++;
    const current = this.backing.rows.get(worldId);
    if (this.forceConflicts-- > 0 || !current || current.revision !== expectedRevision) { this.backing.conflicts++; return false; }
    this.backing.rows.set(worldId, { revision: expectedRevision + 1, json: JSON.stringify(snapshot) });
    return this.acknowledged();
  }
}
function barrier(parties: number) {
  let arrived = 0, release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  return async () => { if (++arrived <= parties) { if (arrived === parties) release(); await waiting; } };
}
function fixture() {
  const backing = new FakeBacking(), store = new FakeAtomicStore(backing), repository = new CasWorldBudgetRepository(store);
  return { backing, store, repository, budget: new WorldBudget(repository) };
}
function input(requestKey = "request", reserveMicroUsd = 100_000) { return { requestKey, scope: "image" as const, operationFingerprint: `inputs:${requestKey}`, reserveMicroUsd }; }
function pending(requestKey = "request", reserveMicroUsd = 100_000): WorldBudgetRequest { return { ...input(requestKey, reserveMicroUsd), state: "pending", origin: "reserved", unknownReasons: [], conflicts: [] }; }
function charge(providerRequestId = "provider", amountMicroUsd = 80_000): WorldChargeEvidence { return { providerNamespace: "openai:project-a", providerRequestId, usageId: `usage:${providerRequestId}`, rawUsage: { input_tokens: 2000, output_tokens: 1756 }, model: "gpt-image-2", amountMicroUsd, costBasis: "conservative-upper-estimate" }; }
function saved(backing: FakeBacking, worldId = "world"): WorldBudgetSnapshot | null { const row = backing.rows.get(worldId); return row ? JSON.parse(row.json) : null; }

describe("CAS world budget adapter races", () => {
  it.each([false, true])("serializes independent workers competing for budget; preexisting row=%s", async preexisting => {
    const { backing, store, budget } = fixture();
    if (preexisting) await store.insertIfAbsent("world", { worldId: "world", requests: [] });
    const otherStore = new FakeAtomicStore(backing), second = new WorldBudget(new CasWorldBudgetRepository(otherStore));
    store.afterRead = otherStore.afterRead = barrier(2);
    const results = await Promise.allSettled([budget.reserve("world", input("a", 3_000_000)), second.reserve("world", input("b", 3_000_000))]);
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(item => item.status === "rejected")).toHaveLength(1);
    expect(backing.conflicts).toBe(1);
    expect(saved(backing)?.requests).toHaveLength(1);
    expect((await budget.audit("world")).committedMicroUsd).toBe(3_000_000);
  });

  it("initializes once and gives one dispatch permission for racing identical keys", async () => {
    const { backing, store, budget } = fixture();
    const otherStore = new FakeAtomicStore(backing), second = new WorldBudget(new CasWorldBudgetRepository(otherStore));
    store.afterRead = otherStore.afterRead = barrier(2);
    const results = await Promise.all([budget.reserve("world", input()), second.reserve("world", input())]);
    expect(results.map(item => item.acquired).sort()).toEqual([false, true]);
    expect(saved(backing)?.requests).toHaveLength(1); expect(backing.rows.get("world")?.revision).toBe(0);
    expect(backing.inserts).toBe(2); expect(backing.conflicts).toBe(1);
  });

  it("replays from a fresh snapshot and never returns the losing callback result", async () => {
    const { backing, store, repository } = fixture();
    await store.insertIfAbsent("world", { worldId: "world", requests: [] });
    const secondStore = new FakeAtomicStore(backing), second = new CasWorldBudgetRepository(secondStore);
    store.afterRead = secondStore.afterRead = barrier(2);
    const calls = [0, 0];
    const reserve = (repo: CasWorldBudgetRepository, index: number) => repo.transactWorld("world", async tx => {
      calls[index] = calls[index]! + 1;
      const count = tx.snapshot.requests.length;
      await tx.createRequest(pending(`r${index}`));
      return { visibleRequestCount: count, call: calls[index] };
    });
    const results = await Promise.all([reserve(repository, 0), reserve(second, 1)]);
    expect(results.map(item => item.visibleRequestCount).sort()).toEqual([0, 1]);
    expect(calls.reduce((a, b) => a + b)).toBe(3);
    expect(saved(backing)?.requests).toHaveLength(2); expect(backing.rows.get("world")?.revision).toBe(2);
  });

  it("serializes settlement versus atlas import and counts one canonical receipt", async () => {
    const { backing, store, budget } = fixture(); await budget.reserve("world", input());
    const otherStore = new FakeAtomicStore(backing), second = new WorldBudget(new CasWorldBudgetRepository(otherStore));
    store.afterRead = otherStore.afterRead = barrier(2);
    await Promise.all([budget.settle("world", "request", charge()), second.importSettled("world", { scope: "image", operationFingerprint: input().operationFingerprint, evidence: charge() })]);
    expect(saved(backing)?.requests.filter(item => item.state === "settled")).toHaveLength(1);
    expect(await budget.audit("world")).toMatchObject({ settledMicroUsd: 80_000, reservedMicroUsd: 0, held: false });
  });

  it("persists conflict evidence/hold even though WorldBudget throws after commit", async () => {
    const { backing, store, budget } = fixture(); await budget.reserve("world", input());
    const otherStore = new FakeAtomicStore(backing), second = new WorldBudget(new CasWorldBudgetRepository(otherStore));
    store.afterRead = otherStore.afterRead = barrier(2);
    const results = await Promise.allSettled([budget.settle("world", "request", charge()), second.settle("world", "request", charge("provider", 90_000))]);
    expect(results.filter(item => item.status === "rejected")).toHaveLength(1);
    const rejected = results.find(item => item.status === "rejected");
    expect(rejected && rejected.status === "rejected" && rejected.reason.code).toBe("evidence_conflict");
    expect((await budget.audit("world")).held).toBe(true); expect(saved(backing)?.requests[0]!.conflicts).toHaveLength(1);
  });
});

describe("commit durability boundary and crash behavior", () => {
  it("does not return acquired:true before the store acknowledges durable commit", async () => {
    const { store, backing, budget } = fixture();
    let release!: () => void, committed!: () => void;
    const acknowledgement = new Promise<void>(resolve => { release = resolve; }), sawWrite = new Promise<void>(resolve => { committed = resolve; });
    store.afterWrite = async () => { committed(); await acknowledgement; };
    let returned = false;
    const result = budget.reserve("world", input()).then(value => { returned = true; return value; });
    await sawWrite;
    expect(saved(backing)?.requests[0]?.state).toBe("pending"); expect(returned).toBe(false);
    release(); expect((await result).acquired).toBe(true);
  });

  it("survives worker reopen without renewing permission or losing unknown reservations", async () => {
    const { backing, budget } = fixture(); await budget.reserve("world", input()); await budget.markUnknown("world", "request", "Worker crashed after dispatch");
    const reopened = new WorldBudget(new CasWorldBudgetRepository(new FakeAtomicStore(backing)));
    expect((await reopened.reserve("world", input())).acquired).toBe(false);
    expect(await reopened.audit("world")).toMatchObject({ held: true, reservedMicroUsd: 100_000, unknownRequestKeys: ["request"] });
    await expect(reopened.reserve("world", input("other"))).rejects.toMatchObject({ code: "world_held" });
  });

  it.each(["insert", "cas"])("never retries an ambiguous %s exception after commit", async method => {
    const { backing, store, budget } = fixture();
    if (method === "cas") await store.insertIfAbsent("world", { worldId: "world", requests: [] });
    store.throwAfterCommit = true;
    await expect(budget.reserve("world", input())).rejects.toThrow("Lost commit acknowledgement");
    expect(method === "insert" ? backing.inserts : backing.swaps).toBe(1);
    const reopened = new WorldBudget(new CasWorldBudgetRepository(new FakeAtomicStore(backing)));
    expect((await reopened.reserve("world", input())).acquired).toBe(false);
    expect(saved(backing)?.requests).toHaveLength(1);
  });

  it("does not retry read errors or manufacture an empty world", async () => {
    const { store, backing } = fixture(); const read = vi.spyOn(store, "read").mockRejectedValue(new Error("Storage unavailable"));
    await expect(new WorldBudget(new CasWorldBudgetRepository(store)).reserve("world", input())).rejects.toThrow("Storage unavailable");
    expect(read).toHaveBeenCalledTimes(1); expect(backing.inserts).toBe(0); expect(backing.swaps).toBe(0);
  });

  it.each(["insert", "cas"])("exhausts bounded confirmed %s conflicts without leaking permission or staged rows", async method => {
    const { backing, store } = fixture();
    if (method === "cas") await store.insertIfAbsent("world", { worldId: "world", requests: [] });
    store.forceConflicts = 100;
    const budget = new WorldBudget(new CasWorldBudgetRepository(store, { maxAttempts: 3 }));
    await expect(budget.reserve("world", input())).rejects.toMatchObject({ code: "conflict_exhausted" });
    expect(method === "insert" ? backing.inserts : backing.swaps).toBe(3);
    expect(backing.conflicts).toBe(3); expect(saved(backing)?.requests ?? []).toHaveLength(0);
  });
});

describe("staged transaction isolation and validation", () => {
  it.each([false, true])("rolls back a throwing callback; existing row=%s", async existing => {
    const { backing, store, repository } = fixture();
    if (existing) await store.insertIfAbsent("world", { worldId: "world", requests: [] });
    const inserts = backing.inserts;
    await expect(repository.transactWorld("world", async tx => { await tx.createRequest(pending()); throw new Error("Callback failed"); })).rejects.toThrow("Callback failed");
    expect(backing.inserts).toBe(inserts); expect(backing.swaps).toBe(0); expect(saved(backing)?.requests ?? []).toHaveLength(0);
    if (!existing) expect(saved(backing)).toBeNull();
  });

  it("clones request/store boundaries and rejects escaped transaction writes", async () => {
    const { backing, repository } = fixture(); const request = pending(); let escaped!: WorldBudgetTransaction;
    await repository.transactWorld("world", async tx => {
      escaped = tx;
      await tx.createRequest(request); request.reserveMicroUsd = 1;
      expect(tx.snapshot.requests).toHaveLength(0);
    });
    expect(saved(backing)?.requests[0]!.reserveMicroUsd).toBe(100_000);
    await expect(escaped.createRequest(pending("late"))).rejects.toMatchObject({ code: "transaction_closed" });
    await expect(escaped.updateRequest("request", pending())).rejects.toMatchObject({ code: "transaction_closed" });
    expect(saved(backing)?.requests).toHaveLength(1);
  });

  it("freezes callback snapshots and does not persist read-only transactions", async () => {
    const { budget, repository, backing } = fixture(); await budget.reserve("world", input());
    const revision = backing.rows.get("world")!.revision;
    await repository.transactWorld("world", async tx => {
      expect(Object.isFrozen(tx.snapshot)).toBe(true); expect(Object.isFrozen(tx.snapshot.requests)).toBe(true); expect(Object.isFrozen(tx.snapshot.requests[0])).toBe(true);
    });
    expect(backing.rows.get("world")!.revision).toBe(revision);
  });

  it("captures revision and snapshot independently of a mutable store-return object", async () => {
    const { store, backing, repository } = fixture(); await store.insertIfAbsent("world", { worldId: "world", requests: [] });
    const row = { revision: 0, snapshot: { worldId: "world", requests: [] as WorldBudgetRequest[] } };
    vi.spyOn(store, "read").mockResolvedValue(row);
    await repository.transactWorld("world", async tx => {
      row.revision = 123; row.snapshot.requests.push(pending("external-mutation"));
      expect(tx.snapshot.requests).toHaveLength(0);
      await tx.createRequest(pending());
    });
    expect(backing.rows.get("world")?.revision).toBe(1);
    expect(saved(backing)?.requests.map(item => item.requestKey)).toEqual(["request"]);
  });

  it.each(["duplicate-key", "missing-update", "changed-key", "changed-reserve", "invalid-money"])("rejects %s without committing", async kind => {
    const { repository, backing, budget } = fixture(); await budget.reserve("world", input()); const old = backing.rows.get("world");
    await expect(repository.transactWorld("world", async tx => {
      if (kind === "duplicate-key") await tx.createRequest(pending());
      if (kind === "missing-update") await tx.updateRequest("missing", pending("missing"));
      if (kind === "changed-key") await tx.updateRequest("request", pending("different"));
      if (kind === "changed-reserve") await tx.updateRequest("request", pending("request", 1));
      if (kind === "invalid-money") await tx.createRequest(pending("bad", -1));
    })).rejects.toBeDefined();
    expect(backing.rows.get("world")).toEqual(old);
  });

  it("rejects duplicate canonical provider charges even with distinct row keys", async () => {
    const { repository, backing } = fixture();
    await expect(repository.transactWorld("world", async tx => {
      await tx.createRequest({ ...pending("a"), state: "settled", evidence: charge() });
      await tx.createRequest({ ...pending("b"), state: "settled", evidence: charge() });
    })).rejects.toThrow("Duplicate canonical");
    expect(saved(backing)).toBeNull();
  });

  it("validates linked receipt equality without counting the linked charge twice", async () => {
    const { repository, backing, budget } = fixture();
    await repository.transactWorld("world", async tx => {
      await tx.createRequest({ ...pending("a"), state: "settled", evidence: charge() });
      await tx.createRequest({ ...pending("b"), operationFingerprint: input("a").operationFingerprint, state: "linked", canonicalRequestKey: "a", evidence: charge() });
    });
    expect((await budget.audit("world")).settledMicroUsd).toBe(80_000);
    const old = backing.rows.get("world");
    await expect(repository.transactWorld("world", async tx => { await tx.updateRequest("b", { ...pending("b"), operationFingerprint: input("a").operationFingerprint, state: "linked", canonicalRequestKey: "a", evidence: charge("other") }); })).rejects.toThrow("identical canonical");
    expect(backing.rows.get("world")).toEqual(old);
  });

  it.each(["settle", "import"])("persists exact %s overflow bills then fails closed instead of losing the external evidence", async method => {
    const { budget, backing } = fixture(); await budget.reserve("world", input("first")); await budget.settle("world", "first", charge("first"));
    if (method === "settle") {
      await budget.reserve("world", input("huge"));
      await expect(budget.settle("world", "huge", charge("huge", Number.MAX_SAFE_INTEGER))).rejects.toMatchObject({ code: "arithmetic_overflow" });
    } else {
      await expect(budget.importSettled("world", { scope: "identity", operationFingerprint: "historical-huge", evidence: charge("huge", Number.MAX_SAFE_INTEGER) })).rejects.toMatchObject({ code: "arithmetic_overflow" });
    }
    expect(saved(backing)?.requests.find(item => item.state === "settled" && item.evidence.providerRequestId === "huge")).toMatchObject({ state: "settled", evidence: { amountMicroUsd: Number.MAX_SAFE_INTEGER } });
    await expect(budget.reserve("world", input("next"))).rejects.toMatchObject({ code: "arithmetic_overflow" });
  });

  it("preserves valid linked evidence alongside overflowing canonical bills", async () => {
    const { repository, backing } = fixture();
    await repository.transactWorld("world", async tx => {
      await tx.createRequest({ ...pending("huge"), state: "settled", evidence: charge("huge", Number.MAX_SAFE_INTEGER) });
      await tx.createRequest({ ...pending("small"), state: "settled", evidence: charge("small") });
      await tx.createRequest({ ...pending("alias"), operationFingerprint: input("huge").operationFingerprint, state: "linked", canonicalRequestKey: "huge", evidence: charge("huge", Number.MAX_SAFE_INTEGER) });
    });
    expect(saved(backing)?.requests).toHaveLength(3);
    expect(saved(backing)?.requests[2]).toMatchObject({ state: "linked", canonicalRequestKey: "huge", evidence: { amountMicroUsd: Number.MAX_SAFE_INTEGER } });
  });

  it.each(["invalid-row", "duplicate-charge", "broken-link"])("does not let overflow hide a later %s", async kind => {
    const { repository, backing } = fixture();
    await expect(repository.transactWorld("world", async tx => {
      await tx.createRequest({ ...pending("huge"), state: "settled", evidence: charge("huge", Number.MAX_SAFE_INTEGER) });
      await tx.createRequest({ ...pending("small"), state: "settled", evidence: charge("small") });
      if (kind === "invalid-row") await tx.createRequest(pending("bad", -1));
      if (kind === "duplicate-charge") await tx.createRequest({ ...pending("duplicate"), state: "settled", evidence: charge("small") });
      if (kind === "broken-link") await tx.createRequest({ ...pending("link"), state: "linked", canonicalRequestKey: "absent", evidence: charge("small") });
    })).rejects.toBeDefined();
    expect(saved(backing)).toBeNull(); expect(backing.inserts).toBe(0);
  });
});

describe("store contract violations fail closed", () => {
  it.each([-1, 0.1, Number.NaN, Number.MAX_SAFE_INTEGER + 1])("rejects invalid revision %s before calling work", async revision => {
    const { store } = fixture(); vi.spyOn(store, "read").mockResolvedValue({ revision, snapshot: { worldId: "world", requests: [] } });
    const work = vi.fn(); await expect(new CasWorldBudgetRepository(store).transactWorld("world", work)).rejects.toMatchObject({ code: "invalid_store" }); expect(work).not.toHaveBeenCalled();
  });

  it("rejects a wrong-world snapshot and non-boolean write result", async () => {
    const { store, backing } = fixture();
    const read = vi.spyOn(store, "read").mockResolvedValue({ revision: 0, snapshot: { worldId: "other", requests: [] } });
    await expect(new WorldBudget(new CasWorldBudgetRepository(store)).reserve("world", input())).rejects.toMatchObject({ code: "invalid_store" });
    read.mockRestore(); vi.spyOn(store, "insertIfAbsent").mockResolvedValue(undefined as unknown as boolean);
    await expect(new WorldBudget(new CasWorldBudgetRepository(store)).reserve("world", input())).rejects.toMatchObject({ code: "invalid_store" }); expect(backing.inserts).toBe(0);
  });

  it("does not overflow a revision or allow an unbounded retry configuration", async () => {
    const { store, backing } = fixture(); backing.rows.set("world", { revision: Number.MAX_SAFE_INTEGER, json: JSON.stringify({ worldId: "world", requests: [] }) });
    await expect(new WorldBudget(new CasWorldBudgetRepository(store)).reserve("world", input())).rejects.toMatchObject({ code: "invalid_store" }); expect(backing.swaps).toBe(0);
    for (const maxAttempts of [0, -1, 1.5, 33, Number.POSITIVE_INFINITY]) expect(() => new CasWorldBudgetRepository(store, { maxAttempts })).toThrow("CAS attempts");
  });
});
