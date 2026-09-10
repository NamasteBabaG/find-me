import { describe, expect, it } from "vitest";
import { WorldBudget, auditWorldBudget, getMatchingUnknownContinuationApproval, type WorldBudgetSnapshot, type WorldUnknownContinuationInput } from "../world-budget";
import { CasWorldBudgetRepository, type AtomicWorldBudgetStore, type VersionedWorldBudgetSnapshot } from "../../../infra/db/world-budget-repository";
import { boardWizardBudget } from "../board-wizard-budget";

function fixture() {
  const rows = new Map<string, VersionedWorldBudgetSnapshot>(); let loseAck = false;
  const store: AtomicWorldBudgetStore = {
    read: async id => structuredClone(rows.get(id) ?? null),
    insertIfAbsent: async (id, snapshot) => { if (rows.has(id)) return false; rows.set(id, { revision: 0, snapshot: structuredClone(snapshot) }); return true; },
    compareAndSwap: async (id, revision, snapshot) => {
      if (rows.get(id)?.revision !== revision) return false;
      rows.set(id, { revision: revision + 1, snapshot: structuredClone(snapshot) });
      if (loseAck) { loseAck = false; throw new Error("Lost acknowledgement"); }
      return true;
    },
  };
  const repository = new CasWorldBudgetRepository(store);
  const options = { authorizeUnknownContinuation: async (a: { operatorId: string; authorizationSha256: string }) => a.operatorId === "operator-qa" && a.authorizationSha256 === "a".repeat(64) };
  return { rows, repository, options, budget: new WorldBudget(repository, options), loseAcknowledgement: () => { loseAck = true; } };
}
const reserve = { requestKey: "board:newyork:measure:1", scope: "judge" as const, operationFingerprint: "f".repeat(64), reserveMicroUsd: 400_000 };
const approval = (): WorldUnknownContinuationInput => ({ ...reserve, approvalId: "approval-one", unknownReasons: ["transport-unresolved"], operatorId: "operator-qa", authorizationSha256: "a".repeat(64), authorizedAt: "2026-09-10T02:00:00.000Z" });
async function unknown(f: ReturnType<typeof fixture>, worldId = "world") { await f.budget.reserve(worldId, reserve); await f.budget.markUnknown(worldId, reserve.requestKey, "transport-unresolved"); }

describe("explicit unknown-charge continuation, no providers or live database", () => {
  it("preserves the complete unknown request/reservation/history while permitting only newly reserved operations", async () => {
    const f = fixture(); await unknown(f); const original = (await f.budget.readRequest("world", reserve.requestKey))!;
    const result = await f.budget.authorizeUnknownContinuation("world", approval());
    expect(result).toMatchObject({ acquired: true, audit: { held: false, unknownRequestKeys: [reserve.requestKey], reservedMicroUsd: 400_000, settledMicroUsd: 0 } });
    expect(await f.budget.readRequest("world", reserve.requestKey)).toEqual(original);
    expect(await f.budget.reserve("world", reserve)).toMatchObject({ acquired: false, request: { state: "unknown" } });
    expect(await f.budget.reserve("world", { ...reserve, requestKey: "board:newyork:measure:2" })).toMatchObject({ acquired: true });
    const saved = f.rows.get("world")!.snapshot;
    expect(getMatchingUnknownContinuationApproval(saved, reserve.requestKey)).toEqual(result.approval);
    expect(await new WorldBudget(f.repository).readContinuationApproval("world", reserve.requestKey)).toEqual(result.approval);
    expect((await f.budget.audit("world")).committedMicroUsd).toBe(800_000);
  });
  it("requires a trusted operator verifier, not a caller's self-declared operator identity", async () => {
    const f = fixture(); await unknown(f); const before = structuredClone(f.rows.get("world"));
    await expect(new WorldBudget(f.repository).authorizeUnknownContinuation("world", approval())).rejects.toMatchObject({ code: "invalid_input" });
    await expect(f.budget.authorizeUnknownContinuation("world", { ...approval(), operatorId: "ordinary-user" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(f.budget.authorizeUnknownContinuation("world", { ...approval(), authorizationSha256: "b".repeat(64) })).rejects.toMatchObject({ code: "invalid_input" });
    expect(f.rows.get("world")).toEqual(before);
  });
  it.each(["requestKey", "scope", "operationFingerprint", "reserveMicroUsd", "unknownReasons"] as const)("refuses an approval with changed %s", async key => {
    const f = fixture(); await unknown(f); const before = structuredClone(f.rows.get("world"));
    const bad = { ...approval(), [key]: key === "reserveMicroUsd" ? 1 : key === "scope" ? "image" : key === "unknownReasons" ? ["different"] : "different" };
    await expect(f.budget.authorizeUnknownContinuation("world", bad)).rejects.toMatchObject({ code: "key_conflict" });
    expect(f.rows.get("world")).toEqual(before);
  });
  it("cannot transfer an approval to another world or approve a pending request", async () => {
    const f = fixture(); await unknown(f); await f.budget.reserve("other", reserve);
    await expect(f.budget.authorizeUnknownContinuation("other", approval())).rejects.toMatchObject({ code: "key_conflict" });
    const approved = await f.budget.authorizeUnknownContinuation("world", approval());
    const forged = { ...f.rows.get("other")!.snapshot, unknownContinuationApprovals: [approved.approval] };
    expect(() => auditWorldBudget(forged)).toThrow();
    expect((await f.budget.audit("other")).pendingRequestKeys).toEqual([reserve.requestKey]);
  });
  it("is CAS-idempotent, retains lost-acknowledgement approvals, and rejects rewriting the same approval ID", async () => {
    const f = fixture(); await unknown(f);
    const results = await Promise.all([f.budget.authorizeUnknownContinuation("world", approval()), new WorldBudget(f.repository, f.options).authorizeUnknownContinuation("world", approval())]);
    expect(results.filter(r => r.acquired)).toHaveLength(1);
    expect(f.rows.get("world")!.snapshot.unknownContinuationApprovals).toHaveLength(1);
    await expect(f.budget.authorizeUnknownContinuation("world", { ...approval(), authorizedAt: "2026-09-10T02:01:00.000Z" })).rejects.toMatchObject({ code: "key_conflict" });
    f.loseAcknowledgement();
    await expect(f.budget.authorizeUnknownContinuation("world", { ...approval(), approvalId: "approval-two" })).rejects.toThrow("Lost acknowledgement");
    expect(await f.budget.authorizeUnknownContinuation("world", { ...approval(), approvalId: "approval-two" })).toMatchObject({ acquired: false });
    expect(f.rows.get("world")!.snapshot.unknownContinuationApprovals).toHaveLength(2);
  });
  it("new unknown requests and new reasons still hold; historical approvals are retained", async () => {
    const f = fixture(); await unknown(f); await f.budget.authorizeUnknownContinuation("world", approval());
    await f.budget.reserve("world", { ...reserve, requestKey: "second" }); await f.budget.markUnknown("world", "second", "another transport");
    expect((await f.budget.audit("world")).held).toBe(true);
    await expect(f.budget.reserve("world", { ...reserve, requestKey: "third" })).rejects.toMatchObject({ code: "world_held" });
    await f.budget.markUnknown("world", reserve.requestKey, "new evidence unresolved");
    expect(await f.budget.readContinuationApproval("world", reserve.requestKey)).toBeNull();
    expect(f.rows.get("world")!.snapshot.unknownContinuationApprovals).toHaveLength(1);
  });
  it("a later authentic bill keeps approval history but still holds if it overruns", async () => {
    const f = fixture(); await unknown(f); await f.budget.authorizeUnknownContinuation("world", approval());
    const history = structuredClone(f.rows.get("world")!.snapshot.unknownContinuationApprovals);
    await f.budget.settle("world", reserve.requestKey, { providerNamespace: "synthetic", providerRequestId: "req_real", usageId: "req_real", model: "gpt-5.6-sol",
      amountMicroUsd: 500_000, rawUsage: { tokens: 100 }, costBasis: "provider-billed" });
    expect((await f.budget.audit("world"))).toMatchObject({ held: true, reservedMicroUsd: 0, settledMicroUsd: 500_000, overrunRequestKeys: [reserve.requestKey] });
    expect(await f.budget.readContinuationApproval("world", reserve.requestKey)).toBeNull();
    expect(f.rows.get("world")!.snapshot.unknownContinuationApprovals).toEqual(history);
  });
  it("continues counting the entire unknown reserve inside the unchanged four-dollar wizard cap", async () => {
    const f = fixture(), b = boardWizardBudget(f.repository, 1, f.options); await b.reserve("world", reserve); await b.markUnknown("world", reserve.requestKey, "transport-unresolved");
    await b.authorizeUnknownContinuation("world", approval());
    await b.reserve("world", { ...reserve, requestKey: "remaining", reserveMicroUsd: 3_600_000 });
    await expect(b.reserve("world", { ...reserve, requestKey: "one-too-many", reserveMicroUsd: 1 })).rejects.toMatchObject({ code: "cap_exceeded" });
    expect((await b.audit("world")).committedMicroUsd).toBe(4_000_000);
  });
  it("preserves approval history across unrelated writes and attempts while keeping legacy snapshots unchanged", async () => {
    const f = fixture(); await unknown(f); expect(f.rows.get("world")!.snapshot).not.toHaveProperty("unknownContinuationApprovals");
    const second = boardWizardBudget(f.repository, 2, f.options); await f.budget.authorizeUnknownContinuation("world", approval());
    await second.reserve("world", reserve); await second.markUnknown("world", reserve.requestKey, "transport-unresolved");
    expect(await second.readContinuationApproval("world", reserve.requestKey)).toBeNull();
    const approved = await second.authorizeUnknownContinuation("world", { ...approval(), approvalId: "second-source-approval" });
    expect(approved.approval.requestKey).toBe(`attempt-2:${reserve.requestKey}`);
    expect(await second.readContinuationApproval("world", reserve.requestKey)).toEqual(approved.approval);
    expect(f.rows.get("world")!.snapshot.unknownContinuationApprovals).toHaveLength(2);
  });
});
