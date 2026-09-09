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
