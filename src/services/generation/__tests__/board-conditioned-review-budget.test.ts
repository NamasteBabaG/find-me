import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { finalReviewBudgetOptions } from "../../../../scripts/board-conditioned-review-budget";
import { GenerationBudget, writeGenerationBudgetContinuationApproval } from "../../../../scripts/generation-budget";
import { OPEN_WORLD_HARDENING_POLICY as policy } from "../../../../scripts/open-world-hardening-policy";

const dirs: string[] = [];
afterEach(() => {
  for (const directory of dirs.splice(0)) {
    const target = realpathSync(directory), parent = realpathSync(tmpdir());
    if (path.dirname(target) !== parent || !path.basename(target).startsWith("findme-review-budget-")) throw new Error("Unsafe temporary test cleanup");
    rmSync(target, { recursive: true });
  }
});
async function fixture() {
  const directory = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-review-budget-")); dirs.push(directory);
  const budget = new GenerationBudget(directory, policy.limitCents, policy);
  await budget.run("original-image-unknown", 20, async () => ({ costCents: 0, costUnknown: true }));
  const ledger = path.join(directory, "requests.json"), receipt = path.join(directory, "approval.json");
  const bytes = readFileSync(ledger, "utf8");
  writeGenerationBudgetContinuationApproval(ledger, receipt, { expectedLedgerSha256: createHash("sha256").update(bytes).digest("hex"),
    unknownEntryIds: [1], approvedBy: "test operator", approvedAt: "2026-09-09T10:00:00Z", reason: "Explicit continuation with the unknown20-cent reserve retained" });
  const options = finalReviewBudgetOptions([`--continuation-approval=${receipt}`]);
  return { directory, ledger, receipt, bytes, options };
}
describe("final visual-review continuation option", () => {
  it("is absent by default and refuses ambiguous or empty approvals", () => {
    expect(finalReviewBudgetOptions(["--run"])).toEqual({});
    for (const flags of [["--continuation-approval"], ["--continuation-approval="], ["--continuation-approval=a", "--continuation-approval=b"]]) expect(() => finalReviewBudgetOptions(flags)).toThrow("FINAL_REVIEW");
    expect(finalReviewBudgetOptions(["--continuation-approval=work/approved.json"])).toEqual({ continuationApprovalFile: path.resolve("work/approved.json") });
  });
  it("permits a distinct review only with the receipt and retains history, reserve and cap", async () => {
    const f = await fixture(), dispatch = vi.fn(async () => ({ costCents: 2.4, model: "gpt-5.6-sol" }));
    await expect(new GenerationBudget(f.directory, policy.limitCents, policy).run("blocked-review", 40, dispatch)).rejects.toThrow("BUDGET_STOP");
    expect(dispatch).not.toHaveBeenCalled();
    const budget = new GenerationBudget(f.directory, policy.limitCents, policy, f.options);
    await budget.run("distinct-final-review", 40, dispatch);
    expect(dispatch).toHaveBeenCalledTimes(1); expect(budget.spent).toBe(22.4);
    const current = JSON.parse(readFileSync(f.ledger, "utf8"));
    expect(current.entries[0]).toEqual(JSON.parse(f.bytes).entries[0]);
    expect(current.entries[0]).toMatchObject({ state: "unknown", reserve: 20, cents: 20 });
    expect(current.limit).toBe(400); expect(current.continuationApprovals).toHaveLength(1);
    await expect(budget.run("cannot-exceed-original-cap", 378, dispatch)).rejects.toThrow("insufficient");
    expect(new GenerationBudget(f.directory, policy.limitCents, policy).held).toBe(true);
  });
  it("rejects altered receipts and does not authorize a new unknown outcome", async () => {
    const f = await fixture();
    const budget = new GenerationBudget(f.directory, policy.limitCents, policy, f.options);
    await budget.run("new-review-unknown", 40, async () => ({ costCents: 0, costUnknown: true }));
    expect(budget.held).toBe(true); expect(budget.spent).toBe(60);
    expect(new GenerationBudget(f.directory, policy.limitCents, policy, f.options).held).toBe(true);
    const receipt = JSON.parse(readFileSync(f.receipt, "utf8")); receipt.ledgerSnapshot += " ";
    writeFileSync(f.receipt, JSON.stringify(receipt));
    expect(() => new GenerationBudget(f.directory, policy.limitCents, policy, f.options)).toThrow("CONTINUATION_STOP");
  });
});
