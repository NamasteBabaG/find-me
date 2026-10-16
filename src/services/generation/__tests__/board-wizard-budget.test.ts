import { describe, it, expect } from "vitest";
import { CasWorldBudgetRepository, type AtomicWorldBudgetStore } from "../../../infra/db/world-budget-repository";
import { boardWizardBudget } from "../board-wizard-budget";
import type { WorldBudgetSnapshot } from "../world-budget";

function repository() {
  let saved: { revision: number; snapshot: WorldBudgetSnapshot } | null = null;
  const store: AtomicWorldBudgetStore = {
    read: async () => structuredClone(saved),
    insertIfAbsent: async (_id, snapshot) => { if (saved) return false; saved = { revision: 0, snapshot: structuredClone(snapshot) }; return true; },
    compareAndSwap: async (_id, revision, snapshot) => { if (!saved || saved.revision !== revision) return false; saved = { revision: revision + 1, snapshot: structuredClone(snapshot) }; return true; },
  };
  return new CasWorldBudgetRepository(store);
}
const evidence = (id: string, amountMicroUsd: number) => ({ providerNamespace: "fixture", providerRequestId: id, usageId: id, rawUsage: { tokens: 1 }, model: "gpt-image-2", amountMicroUsd, costBasis: "conservative-upper-estimate" as const });
const reserve = (key: string, cents: number) => ({ requestKey: key, scope: "image" as const, operationFingerprint: key, reserveMicroUsd: cents * 10_000 });
describe("QA wizard four-dollar budget", () => {
  it("includes earlier identity cost and atomically refuses any reservation above $4", async () => {
    const b = boardWizardBudget(repository());
    await b.importSettled("w", { scope: "identity", operationFingerprint: "identity", evidence: evidence("identity", 500_000) });
    await b.reserve("w", reserve("sheet", 350));
    await expect(b.reserve("w", reserve("too-much", 1))).rejects.toMatchObject({ code: "cap_exceeded" });
    expect((await b.audit("w")).committedMicroUsd).toBe(4_000_000);
  });
  it("retains the full provider bill even if it overruns its reservation", async () => {
    const b = boardWizardBudget(repository());
    await b.reserve("w", reserve("sheet", 390));
    await b.settle("w", "sheet", evidence("overspend", 4_100_000));
    expect((await b.audit("w")).settledMicroUsd).toBe(4_100_000);
    await expect(b.reserve("w", reserve("again", 1))).rejects.toMatchObject({ code: "world_held" });
  });
  it("links a paid answer at the ceiling without new room, under its attempt's keys", async () => {
    const repo = repository(), first = boardWizardBudget(repo), second = boardWizardBudget(repo, 2);
    const question = (key: string, reserveMicroUsd: number) => ({ requestKey: key, scope: "judge" as const, operationFingerprint: "question", reserveMicroUsd });
    await first.importSettled("w", { scope: "image", operationFingerprint: "earlier", evidence: evidence("earlier", 3_800_000) });
    await first.reserve("w", question("batch", 125_000));
    await first.settle("w", "batch", evidence("batch-answer", 9_000));
    // 191,000 left: the synchronous reservation no longer fits, the next question does.
    await expect(first.reserve("w", question("sync", 250_000))).rejects.toMatchObject({ code: "cap_exceeded" });
    const linked = await first.link("w", { ...question("sync", 250_000), canonicalRequestKey: "batch" });
    expect(linked.audit).toMatchObject({ committedMicroUsd: 3_809_000, linkedRequestKeys: ["sync"], held: false });
    expect((await first.reserve("w", { ...question("sol", 66_000), operationFingerprint: "sol" })).acquired).toBe(true);
    await second.reserve("w", question("batch", 1_000)); await second.settle("w", "batch", evidence("batch-answer-2", 900));
    await second.link("w", { ...question("sync", 2_000), canonicalRequestKey: "batch" });
    expect(await second.readRequest("w", "sync")).toMatchObject({ requestKey: "attempt-2:sync", canonicalRequestKey: "attempt-2:batch", state: "linked" });
    expect(await first.readRequest("w", "sync")).toMatchObject({ canonicalRequestKey: "batch", reserveMicroUsd: 250_000 });
  });
  it("records an unknown charge already spent above the ceiling, where a new reservation is refused, under its attempt's keys", async () => {
    const repo = repository(), first = boardWizardBudget(repo), second = boardWizardBudget(repo, 2);
    await first.importSettled("w", { scope: "image", operationFingerprint: "earlier", evidence: evidence("earlier", 3_900_000) });
    const copy = { requestKey: "batch:copy:b", scope: "judge" as const, operationFingerprint: "question", reserveMicroUsd: 250_000, reason: "a copy that cannot be priced" };
    await expect(first.reserve("w", copy)).rejects.toMatchObject({ code: "cap_exceeded" });
    const recorded = await first.recordUnknown("w", copy);
    expect(recorded.audit).toMatchObject({ committedMicroUsd: 4_150_000, unknownRequestKeys: ["batch:copy:b"], held: true });
    await second.recordUnknown("w", { ...copy, reserveMicroUsd: 1_000 });
    expect(await second.readRequest("w", "batch:copy:b")).toMatchObject({ requestKey: "attempt-2:batch:copy:b", state: "unknown" });
  });
  it("isolates attempt2 request keys without resetting the cumulative ledger", async () => {
    const repo = repository(), first = boardWizardBudget(repo), second = boardWizardBudget(repo, 2);
    await first.reserve("w", reserve("board:source:1", 20));
    await first.settle("w", "board:source:1", evidence("r1", 100_000));
    await second.reserve("w", reserve("board:source:1", 20));
    await second.settle("w", "board:source:1", evidence("r2", 100_000));
    expect((await second.readRequest("w", "board:source:1"))?.requestKey).toBe("attempt-2:board:source:1");
    expect((await second.audit("w")).settledMicroUsd).toBe(200_000);
    expect(() => boardWizardBudget(repo, 3)).toThrow("two board attempts");
  });
});
