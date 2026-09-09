import { describe, expect, it } from "vitest";
import { auditWorldBudget, WorldBudget, WORLD_BUDGET_CAP_MICRO_USD, type WorldBudgetRepository, type WorldBudgetRequest, type WorldBudgetSnapshot, type WorldBudgetTransaction, type WorldChargeEvidence, type WorldReservationInput } from "../world-budget";

/** TEST ONLY. A queued process-local mutex is NOT a production DB adapter. */
class MemoryWorldRepository implements WorldBudgetRepository {
  private worlds = new Map<string, WorldBudgetRequest[]>();
  private queues = new Map<string, Promise<void>>();
  failNextCommit = false;
  async transactWorld<T>(worldId: string, work: (tx: WorldBudgetTransaction) => Promise<T>): Promise<T> {
    const previous = this.queues.get(worldId) ?? Promise.resolve();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    this.queues.set(worldId, previous.then(() => held));
    await previous;
    const records = structuredClone(this.worlds.get(worldId) ?? []);
    const snapshot: WorldBudgetSnapshot = { worldId, requests: structuredClone(records) };
    const assertUnique = () => {
      expect(new Set(records.map(item => item.requestKey)).size).toBe(records.length);
      const canonical = records.filter(item => item.state === "settled").map(item => item.state === "settled" && JSON.stringify([item.evidence.providerNamespace, item.evidence.providerRequestId]));
      expect(new Set(canonical).size).toBe(canonical.length);
    };
    try {
      const result = await work({
        snapshot,
        createRequest: async request => { await Promise.resolve(); records.push(structuredClone(request)); assertUnique(); },
        updateRequest: async (key, request) => {
          await Promise.resolve();
          const index = records.findIndex(item => item.requestKey === key);
          if (index < 0 || request.requestKey !== key) throw new Error("Missing row or changed primary key");
          records[index] = structuredClone(request); assertUnique();
        },
      });
      if (this.failNextCommit) { this.failNextCommit = false; throw new Error("Injected commit failure"); }
      this.worlds.set(worldId, records);
      return result;
    } finally { release(); }
  }
  async snapshot(worldId = "world"): Promise<WorldBudgetSnapshot> { return this.transactWorld(worldId, async tx => structuredClone(tx.snapshot)); }
}

function fixture() { const repository = new MemoryWorldRepository(); return { repository, budget: new WorldBudget(repository) }; }
function reservation(requestKey = "request-1", reserveMicroUsd = 100_000): WorldReservationInput { return { requestKey, scope: "image", operationFingerprint: `fingerprint:${requestKey}`, reserveMicroUsd }; }
function charge(providerRequestId = "provider-1", amountMicroUsd = 80_000): WorldChargeEvidence {
  return { providerNamespace: "openai:project-a", providerRequestId, usageId: `usage:${providerRequestId}`, rawUsage: { input_tokens: 2000, output_tokens: 1756 }, model: "gpt-image-2", amountMicroUsd, costBasis: "conservative-upper-estimate" };
}

describe("world request budget reservations", () => {
  it("uses an immutable five-dollar integer micro-USD cap and counts every required scope", async () => {
    const { budget } = fixture();
    expect(WORLD_BUDGET_CAP_MICRO_USD).toBe(5_000_000);
    for (const scope of ["identity", "sheet", "image", "judge", "repair"] as const) await budget.reserve("world", { ...reservation(scope, 1_000_000), scope });
    const audit = await budget.audit("world");
    expect(audit).toMatchObject({ reservedMicroUsd: 5_000_000, committedMicroUsd: 5_000_000, state: "exhausted", remainingMicroUsd: 0, canReserve: false });
    expect(audit.byScope.judge.reservedMicroUsd).toBe(1_000_000);
    await expect(budget.reserve("world", reservation("one-more", 1))).rejects.toMatchObject({ code: "cap_exceeded" });
  });

  it("serializes competing reservations at the boundary across service instances", async () => {
    const { repository, budget } = fixture();
    const secondWorker = new WorldBudget(repository);
    const results = await Promise.allSettled([budget.reserve("world", reservation("a", 3_000_000)), secondWorker.reserve("world", reservation("b", 3_000_000))]);
    expect(results.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(item => item.status === "rejected")).toHaveLength(1);
    expect((await budget.audit("world")).reservedMicroUsd).toBe(3_000_000);
  });

  it("allows exactly one dispatch for simultaneous identical keys, including after a restart", async () => {
    const { repository, budget } = fixture();
    const results = await Promise.all(Array.from({ length: 20 }, () => budget.reserve("world", reservation())));
    expect(results.filter(item => item.acquired)).toHaveLength(1);
    expect((await new WorldBudget(repository).reserve("world", reservation())).acquired).toBe(false);
    expect((await repository.snapshot()).requests).toHaveLength(1);
  });

  it.each(["operationFingerprint", "scope", "reserveMicroUsd"] as const)("rejects idempotency-key reuse with changed %s", async field => {
    const { budget } = fixture(); await budget.reserve("world", reservation());
    const changed = { ...reservation(), [field]: field === "scope" ? "repair" : field === "reserveMicroUsd" ? 200_000 : "different" };
    await expect(budget.reserve("world", changed)).rejects.toMatchObject({ code: "key_conflict" });
  });

  it.each([-1, 0, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])("rejects invalid reserve amount %s", async value => {
    const { budget, repository } = fixture();
    await expect(budget.reserve("world", reservation("bad", value))).rejects.toMatchObject({ code: "invalid_input" });
    expect((await repository.snapshot()).requests).toHaveLength(0);
  });

  it("does not return dispatch permission when persistence fails", async () => {
    const { budget, repository } = fixture(); repository.failNextCommit = true;
    await expect(budget.reserve("world", reservation())).rejects.toThrow("commit failure");
    expect((await repository.snapshot()).requests).toHaveLength(0);
    expect((await budget.reserve("world", reservation())).acquired).toBe(true);
  });

  it("isolates worlds and copies mutable caller/result objects", async () => {
    const { budget } = fixture(); const input = reservation();
    const pending = budget.reserve("world", input); input.reserveMicroUsd = 1;
    const first = await pending; first.request.reserveMicroUsd = 1;
    expect((await budget.audit("world")).reservedMicroUsd).toBe(100_000);
    expect((await budget.reserve("other", reservation())).acquired).toBe(true);
  });
});

describe("settlement, unknown spend and holds", () => {
  it("atomically replaces reservation with full known spend and settles only once", async () => {
    const { budget, repository } = fixture(); await budget.reserve("world", reservation());
    const results = await Promise.all(Array.from({ length: 12 }, () => budget.settle("world", "request-1", charge())));
    expect(results.every(item => item.audit.settledMicroUsd === 80_000 && item.audit.reservedMicroUsd === 0)).toBe(true);
    expect((await repository.snapshot()).requests).toHaveLength(1);
    expect((await budget.reserve("world", reservation())).acquired).toBe(false);
  });

  it("accepts zero only when accompanied by verified settlement evidence", async () => {
    const { budget } = fixture(); await budget.reserve("world", reservation());
    expect((await budget.settle("world", "request-1", charge("zero", 0))).audit).toMatchObject({ settledMicroUsd: 0, reservedMicroUsd: 0, held: false });
  });

  it("keeps pending plus unknown reservations and holds all new world dispatches", async () => {
    const { budget } = fixture(); await budget.reserve("world", reservation("a", 100_000)); await budget.reserve("world", reservation("b", 200_000));
    await budget.markUnknown("world", "a", "Timeout after dispatch");
    await budget.markUnknown("world", "a", "Timeout after dispatch");
    expect(await budget.audit("world")).toMatchObject({ held: true, reservedMicroUsd: 300_000, pendingRequestKeys: ["b"], unknownRequestKeys: ["a"] });
    await expect(budget.reserve("world", reservation("c", 1))).rejects.toMatchObject({ code: "world_held" });
    expect((await budget.reserve("world", reservation("a", 100_000))).acquired).toBe(false);
    await budget.markUnknown("world", "b", "Missing usage");
    expect((await budget.settle("world", "a", charge())).audit.held).toBe(true);
    const done = await budget.settle("world", "b", charge("b", 150_000));
    expect(done.audit).toMatchObject({ held: false, reservedMicroUsd: 0, settledMicroUsd: 230_000 });
  });

  it("does not reopen a settled request due to a late error", async () => {
    const { budget } = fixture(); await budget.reserve("world", reservation()); await budget.settle("world", "request-1", charge());
    expect((await budget.markUnknown("world", "request-1", "Late timeout")).request.state).toBe("settled");
    expect((await budget.audit("world")).held).toBe(false);
  });

  it("records an over-reserve bill without clamping even when total is still below cap", async () => {
    const { budget } = fixture(); await budget.reserve("world", reservation());
    const result = await budget.settle("world", "request-1", charge("overrun", 100_001));
    expect(result.audit).toMatchObject({ settledMicroUsd: 100_001, held: true, overCapMicroUsd: 0, overrunRequestKeys: ["request-1"] });
    expect((await budget.settle("world", "request-1", charge("overrun", 100_001))).audit.held).toBe(true);
    await expect(budget.reserve("world", reservation("next", 1))).rejects.toMatchObject({ code: "world_held" });
  });

  it("records external spend above the full world cap and never substitutes zero", async () => {
    const { budget } = fixture(); await budget.reserve("world", reservation("big", 5_000_000));
    expect((await budget.settle("world", "big", charge("big", 5_500_000))).audit).toMatchObject({ settledMicroUsd: 5_500_000, reservedMicroUsd: 0, overCapMicroUsd: 500_000, remainingMicroUsd: 0, held: true });
  });

  it("persists a hold on conflicting concurrent settlements without overwriting the first bill", async () => {
    const { budget, repository } = fixture(); await budget.reserve("world", reservation());
    const results = await Promise.allSettled([budget.settle("world", "request-1", charge()), budget.settle("world", "request-1", charge("provider-1", 90_000))]);
    expect(results.map(item => item.status).sort()).toEqual(["fulfilled", "rejected"]);
    const audit = await budget.audit("world");
    expect(audit).toMatchObject({ settledMicroUsd: 80_000, held: true, conflictRequestKeys: ["request-1"] });
    expect((await repository.snapshot()).requests[0]!.conflicts[0]!.evidence.amountMicroUsd).toBe(90_000);
    await expect(budget.reserve("world", reservation("blocked"))).rejects.toMatchObject({ code: "world_held" });
  });

  it("canonicalizes raw-usage object ordering but rejects differing usage or provenance", async () => {
    const { budget } = fixture(); await budget.reserve("world", reservation()); await budget.settle("world", "request-1", charge());
    await expect(budget.settle("world", "request-1", { ...charge(), rawUsage: { output_tokens: 1756, input_tokens: 2000 } })).resolves.toBeDefined();
    await expect(budget.settle("world", "request-1", { ...charge(), rawUsage: { output_tokens: 1757, input_tokens: 2000 } })).rejects.toMatchObject({ code: "evidence_conflict" });
  });

  it.each([-1, 0.01, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])("rejects invalid settlement amount %s without losing reservation", async value => {
    const { budget } = fixture(); await budget.reserve("world", reservation());
    await expect(budget.settle("world", "request-1", charge("bad", value))).rejects.toMatchObject({ code: "invalid_input" });
    expect((await budget.audit("world")).reservedMicroUsd).toBe(100_000);
  });

  it("requires usage evidence and a prior reservation for normal settlement", async () => {
    const { budget } = fixture();
    await expect(budget.settle("world", "missing", charge())).rejects.toMatchObject({ code: "request_missing" });
    await budget.reserve("world", reservation());
    await expect(budget.settle("world", "request-1", { ...charge(), rawUsage: {} })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(budget.markUnknown("world", "missing", "timeout")).rejects.toMatchObject({ code: "request_missing" });
  });

  it("preserves atomic accounting while settlement and new reservations race", async () => {
    const { budget } = fixture(); await budget.reserve("world", reservation("a", 4_000_000));
    const results = await Promise.allSettled([budget.settle("world", "a", charge("a", 3_000_000)), budget.reserve("world", reservation("b", 2_000_000))]);
    expect(results.every(item => item.status === "fulfilled")).toBe(true);
    expect((await budget.audit("world")).committedMicroUsd).toBe(5_000_000);
  });
});

describe("imports and provider-request de-duplication", () => {
  it("charges a three-cell atlas once even under concurrent repeated imports", async () => {
    const { budget, repository } = fixture();
    const input = { scope: "sheet" as const, operationFingerprint: "atlas-input", evidence: charge("atlas") };
    const results = await Promise.all(Array.from({ length: 27 }, () => budget.importSettled("world", input)));
    expect(new Set(results.map(item => item.request.requestKey)).size).toBe(1);
    expect((await repository.snapshot()).requests).toHaveLength(1);
    expect((await budget.audit("world")).settledMicroUsd).toBe(80_000);
    expect((await budget.audit("world")).byScope.sheet.settledMicroUsd).toBe(80_000);
  });

  it.each(["import-first", "settle-first"])("deduplicates import racing live settlement: %s", async order => {
    const { budget, repository } = fixture(); const reserved = { ...reservation(), scope: "sheet" as const };
    await budget.reserve("world", reserved);
    const imported = () => budget.importSettled("world", { scope: "sheet", operationFingerprint: reserved.operationFingerprint, evidence: charge() });
    const settled = () => budget.settle("world", reserved.requestKey, charge());
    await Promise.all(order === "import-first" ? [imported(), settled()] : [settled(), imported()]);
    const audit = await budget.audit("world");
    expect(audit).toMatchObject({ settledMicroUsd: 80_000, reservedMicroUsd: 0, held: false });
    expect((await repository.snapshot()).requests.filter(item => item.state === "settled")).toHaveLength(1);
  });

  it("links two reservations with one provider response without erasing actual evidence", async () => {
    const { budget } = fixture(); await budget.reserve("world", reservation("a")); await budget.reserve("world", { ...reservation("b"), operationFingerprint: reservation("a").operationFingerprint });
    await budget.settle("world", "a", charge());
    const linked = await budget.settle("world", "b", charge());
    expect(linked.request).toMatchObject({ state: "linked", canonicalRequestKey: "a", evidence: { amountMicroUsd: 80_000 } });
    expect(linked.audit).toMatchObject({ settledMicroUsd: 80_000, reservedMicroUsd: 0, linkedRequestKeys: ["b"] });
  });

  it("does not deduplicate the same opaque request ID across different billing namespaces", async () => {
    const { budget } = fixture();
    for (const providerNamespace of ["openai:project-a", "openai:project-b"]) await budget.importSettled("world", { scope: "identity", operationFingerprint: "same", evidence: { ...charge(), providerNamespace } });
    expect((await budget.audit("world")).settledMicroUsd).toBe(160_000);
  });

  it("records external imports above cap even while held, without dispatch authority", async () => {
    const { budget } = fixture(); await budget.reserve("world", reservation()); await budget.markUnknown("world", "request-1", "timeout");
    const result = await budget.importSettled("world", { scope: "identity", operationFingerprint: "historical", evidence: charge("import", 5_500_000) });
    expect(result.audit).toMatchObject({ settledMicroUsd: 5_500_000, reservedMicroUsd: 100_000, overCapMicroUsd: 600_000, held: true });
    expect(result).not.toHaveProperty("acquired");
  });

  it("rejects conflicting imported usage and holds the world with its original bill intact", async () => {
    const { budget } = fixture(); const input = { scope: "sheet" as const, operationFingerprint: "atlas", evidence: charge() };
    await budget.importSettled("world", input);
    await expect(budget.importSettled("world", { ...input, evidence: charge("provider-1", 81_000) })).rejects.toMatchObject({ code: "evidence_conflict" });
    expect(await budget.audit("world")).toMatchObject({ settledMicroUsd: 80_000, held: true });
  });

  it("preserves another reservation on a conflicting provider-ID collision", async () => {
    const { budget } = fixture(); await budget.reserve("world", reservation("a")); await budget.reserve("world", reservation("b"));
    await budget.settle("world", "a", charge());
    await expect(budget.settle("world", "b", charge("provider-1", 81_000))).rejects.toMatchObject({ code: "evidence_conflict" });
    expect(await budget.audit("world")).toMatchObject({ settledMicroUsd: 80_000, reservedMicroUsd: 100_000, held: true, conflictRequestKeys: ["b"] });
  });

  it.each([
    ["import-first", "scope"], ["settle-first", "scope"],
    ["import-first", "operationFingerprint"], ["settle-first", "operationFingerprint"],
  ] as const)("holds on mismatched operation metadata in either race order: %s %s", async (order, field) => {
    const { budget, repository } = fixture(); await budget.reserve("world", reservation());
    const input = { scope: field === "scope" ? "sheet" as const : "image" as const, operationFingerprint: field === "operationFingerprint" ? "different-input" : reservation().operationFingerprint, evidence: charge() };
    if (order === "import-first") {
      await budget.importSettled("world", input);
      await expect(budget.settle("world", "request-1", charge())).rejects.toMatchObject({ code: "evidence_conflict" });
      expect((await budget.audit("world")).reservedMicroUsd).toBe(100_000);
    } else {
      await budget.settle("world", "request-1", charge());
      await expect(budget.importSettled("world", input)).rejects.toMatchObject({ code: "evidence_conflict" });
    }
    expect((await budget.audit("world")).held).toBe(true);
    expect((await repository.snapshot()).requests.filter(item => item.state === "settled")).toHaveLength(1);
  });
});

describe("adapter and audit fail-closed checks", () => {
  it("rejects duplicate canonical charges, broken links and unsafe summed arithmetic", () => {
    const known: WorldBudgetRequest = { ...reservation(), origin: "reserved", state: "settled", evidence: charge(), unknownReasons: [], conflicts: [] };
    expect(() => auditWorldBudget({ worldId: "world", requests: [known, { ...known, requestKey: "duplicate" }] })).toThrow("Duplicate canonical");
    expect(() => auditWorldBudget({ worldId: "world", requests: [{ ...known, state: "linked", canonicalRequestKey: "missing" }] })).toThrow("Linked request");
    const pending: WorldBudgetRequest = { ...reservation(), reserveMicroUsd: Number.MAX_SAFE_INTEGER, origin: "reserved", state: "pending", unknownReasons: [], conflicts: [] };
    expect(() => auditWorldBudget({ worldId: "world", requests: [pending, { ...pending, requestKey: "second" }] })).toThrow("safe integer precision");
  });

  it("rejects a repository snapshot for a different world", async () => {
    const wrong: WorldBudgetRepository = { transactWorld: async (_worldId, work) => work({ snapshot: { worldId: "other", requests: [] }, createRequest: async () => {}, updateRequest: async () => {} }) };
    await expect(new WorldBudget(wrong).reserve("world", reservation())).rejects.toMatchObject({ code: "invalid_snapshot" });
  });

  it("retains reservations on failed settlement commit and permits evidence-only reconciliation", async () => {
    const { repository, budget } = fixture(); await budget.reserve("world", reservation()); repository.failNextCommit = true;
    await expect(budget.settle("world", "request-1", charge())).rejects.toThrow("commit failure");
    expect((await budget.audit("world")).reservedMicroUsd).toBe(100_000);
    expect((await budget.reserve("world", reservation())).acquired).toBe(false);
    expect((await budget.settle("world", "request-1", charge())).audit.settledMicroUsd).toBe(80_000);
  });

  it.each(["settlement", "import"])("persists an external %s bill even if aggregate precision overflows, then fails closed", async method => {
    const { repository, budget } = fixture();
    await budget.reserve("world", reservation("first")); await budget.settle("world", "first", charge("first"));
    if (method === "settlement") {
      await budget.reserve("world", reservation("huge"));
      await expect(budget.settle("world", "huge", charge("huge", Number.MAX_SAFE_INTEGER))).rejects.toMatchObject({ code: "arithmetic_overflow" });
    } else {
      await expect(budget.importSettled("world", { scope: "identity", operationFingerprint: "huge", evidence: charge("huge", Number.MAX_SAFE_INTEGER) })).rejects.toMatchObject({ code: "arithmetic_overflow" });
    }
    const saved = (await repository.snapshot()).requests.find(item => item.state === "settled" && item.evidence.providerRequestId === "huge");
    expect(saved).toMatchObject({ state: "settled", evidence: { amountMicroUsd: Number.MAX_SAFE_INTEGER } });
    await expect(budget.audit("world")).rejects.toMatchObject({ code: "arithmetic_overflow" });
    await expect(budget.reserve("world", reservation("next", 1))).rejects.toMatchObject({ code: "arithmetic_overflow" });
  });
});
