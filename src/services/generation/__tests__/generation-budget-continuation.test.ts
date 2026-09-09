import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { GenerationBudget, writeGenerationBudgetContinuationApproval } from "../../../../scripts/generation-budget";

const config = { quality: "low", model: "gpt-image-2", noAutomaticRetries: true };
const directories: string[] = [];
const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

async function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "findme-budget-continuation-")); directories.push(dir);
  const budget = new GenerationBudget(dir, 200, config);
  await expect(budget.run("image:503", 28.2235, async () => { throw new Error("HTTP 503"); })).rejects.toThrow("HTTP 503");
  const ledger = path.join(dir, "requests.json");
  const receipt = path.join(dir, "approval.json");
  const originalBytes = readFileSync(ledger, "utf8");
  const approve = (overrides: Partial<Parameters<typeof writeGenerationBudgetContinuationApproval>[2]> = {}) => {
    writeGenerationBudgetContinuationApproval(ledger, receipt, {
      expectedLedgerSha256: hash(originalBytes), unknownEntryIds: [1], approvedBy: "Guy",
      approvedAt: "2026-09-08T12:00:00.000Z", reason: "Explicitly continue LOW; preserve the unresolved 503 reserve.", ...overrides,
    });
  };
  const reopen = () => new GenerationBudget(dir, 200, config, { continuationApprovalFile: receipt });
  return { dir, budget, ledger, receipt, originalBytes, approve, reopen };
}

describe("explicit authoring budget continuation", () => {
  it("keeps long historical prompt truncation idempotent across two sequential paid-result saves and restarts", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "findme-budget-long-prompt-")); directories.push(dir);
    const ledger = path.join(dir, "requests.json"), receipt = path.join(dir, "approval.json");
    const budget = new GenerationBudget(dir, 200, config);
    const prompt = "Detailed painted child style, pose and compositing instructions. ".repeat(110);
    await budget.run("old-unknown-judge", 28.2235, async () => ({ costCents: 0, costUnknown: true, promptSent: prompt }));
    const originalBytes = readFileSync(ledger, "utf8"), original = JSON.parse(originalBytes);
    const originalPrompt = `${prompt.slice(0, 4000)}…[${prompt.length} chars]`;
    expect(original.entries[0].response.promptSent).toBe(originalPrompt);
    writeGenerationBudgetContinuationApproval(ledger, receipt, {
      expectedLedgerSha256: hash(originalBytes), unknownEntryIds: [1], approvedBy: "Guy",
      approvedAt: "2026-09-08", reason: "Continue LOW with unresolved reserve retained.",
    });
    for (let i = 0; i < 2; i++) {
      const reopened = new GenerationBudget(dir, 200, config, { continuationApprovalFile: receipt });
      expect(reopened.held).toBe(false);
      await reopened.run(`new-pose-${i}`, 20, async () => ({ costCents: 1.824, promptSent: `${prompt} extra` }));
      const after = JSON.parse(readFileSync(ledger, "utf8"));
      expect(after.entries[0]).toEqual(original.entries[0]);
      expect(after.entries[0].response.promptSent).toBe(originalPrompt);
      expect(after.entries.at(-1).response.promptSent).toBe(`${prompt.slice(0, 4000)}…[${prompt.length + 6} chars]`);
    }
    expect(new GenerationBudget(dir, 200, config, { continuationApprovalFile: receipt }).held).toBe(false);
    expect(JSON.parse(readFileSync(ledger, "utf8")).entries.map((entry: { cents: number }) => entry.cents)).toEqual([28.2235, 1.824, 1.824]);
  });

  it("remains held by default and does not dispatch an automatic retry", async () => {
    const f = await fixture();
    const request = vi.fn(async () => ({ costCents: 3 }));
    expect(new GenerationBudget(f.dir, 200, config).held).toBe(true);
    await expect(f.budget.run("retry", 4, request)).rejects.toThrow("BUDGET_STOP");
    expect(request).not.toHaveBeenCalled();
  });

  it("writes an immutable approval receipt without modifying the ledger", async () => {
    const f = await fixture(); f.approve();
    expect(readFileSync(f.ledger, "utf8")).toBe(f.originalBytes);
    const receipt = JSON.parse(readFileSync(f.receipt, "utf8"));
    expect(hash(receipt.ledgerSnapshot)).toBe(receipt.ledgerSha256);
    expect(receipt.unknownEntryIds).toEqual([1]);
    expect(() => f.approve()).toThrow();
  });

  it("keeps the unknown entry and 28.2235-cent reserve unchanged while allowing a distinct request", async () => {
    const f = await fixture(); f.approve();
    const budget = f.reopen();
    expect(budget.held).toBe(false); expect(budget.spent).toBe(28.2235);
    await budget.run("new-low-pose", 10, async () => ({ costCents: 3.25 }));
    expect(budget.spent).toBe(31.4735);
    const current = JSON.parse(readFileSync(f.ledger, "utf8"));
    expect(current.entries[0]).toEqual(JSON.parse(f.originalBytes).entries[0]);
    expect(current.entries[0]).toMatchObject({ state: "unknown", reserve: 28.2235, cents: 28.2235 });
    expect(current.continuationApprovals).toHaveLength(1);
    expect(f.reopen().held).toBe(false);
    expect(JSON.parse(readFileSync(f.ledger, "utf8")).continuationApprovals).toHaveLength(1);
    // The receipt must be selected explicitly on every process invocation.
    expect(new GenerationBudget(f.dir, 200, config).held).toBe(true);
    expect(JSON.parse(readFileSync(f.ledger, "utf8")).continuationApprovals).toHaveLength(1);
  });

  it("does not release the reserve or raise the existing 200-cent ceiling", async () => {
    const f = await fixture(); f.approve();
    const request = vi.fn(async () => ({ costCents: 1 }));
    await expect(f.reopen().run("too-large", 172, request)).rejects.toThrow("insufficient remaining allowance");
    expect(request).not.toHaveBeenCalled();
    expect(() => new GenerationBudget(f.dir, 500, config, { continuationApprovalFile: f.receipt })).toThrow("budget changed");
  });

  it.each(["throws", "missing-usage"])("a new %s outcome creates a new hold, including after restart", async mode => {
    const f = await fixture(); f.approve(); const budget = f.reopen();
    if (mode === "throws") await expect(budget.run("new-pose", 10, async () => { throw new Error("503 again"); })).rejects.toThrow("503 again");
    else await budget.run("new-pose", 10, async () => ({ costCents: 0, costUnknown: true }));
    expect(budget.held).toBe(true); expect(budget.spent).toBe(38.2235);
    expect(f.reopen().held).toBe(true);
    const request = vi.fn(async () => ({ costCents: 1 }));
    await expect(budget.run("another", 1, request)).rejects.toThrow("BUDGET_STOP");
    expect(request).not.toHaveBeenCalled();
  });

  it("a crashed new pending request is not covered by the historical approval", async () => {
    const f = await fixture(); f.approve();
    const ledger = JSON.parse(readFileSync(f.ledger, "utf8"));
    ledger.entries.push({ id: 2, kind: "new-pose", reserve: 10, state: "pending", cents: 10 });
    writeFileSync(f.ledger, JSON.stringify(ledger));
    expect(f.reopen().held).toBe(true);
    const pendingHash = hash(readFileSync(f.ledger, "utf8"));
    expect(() => writeGenerationBudgetContinuationApproval(f.ledger, path.join(f.dir, "pending-approval.json"), {
      expectedLedgerSha256: pendingHash, unknownEntryIds: [2], approvedBy: "Guy", approvedAt: "2026-09-08", reason: "Do not approve pending",
    })).toThrow("CONTINUATION_STOP");
  });

  it("refuses a stale operator hash and unknown entry IDs not present in that exact snapshot", async () => {
    const f = await fixture();
    expect(() => f.approve({ expectedLedgerSha256: "0".repeat(64) })).toThrow("ledger changed");
    for (const unknownEntryIds of [[], [2], [1, 1], [1.5]]) expect(() => f.approve({ unknownEntryIds })).toThrow("CONTINUATION_STOP");
  });

  it.each(["cents", "reserve", "state", "error"])("rejects changed historical %s without overwriting the ledger", async field => {
    const f = await fixture(); f.approve();
    const ledger = JSON.parse(f.originalBytes);
    ledger.entries[0][field] = field === "cents" || field === "reserve" ? 0 : field === "state" ? "known" : "different error";
    const changed = JSON.stringify(ledger); writeFileSync(f.ledger, changed);
    expect(() => f.reopen()).toThrow("CONTINUATION_STOP");
    expect(readFileSync(f.ledger, "utf8")).toBe(changed);
  });

  it("rejects a modified receipt snapshot and changed configuration", async () => {
    const f = await fixture(); f.approve();
    const receipt = JSON.parse(readFileSync(f.receipt, "utf8")); receipt.ledgerSnapshot += " ";
    writeFileSync(f.receipt, JSON.stringify(receipt));
    expect(() => f.reopen()).toThrow("CONTINUATION_STOP");
    expect(() => new GenerationBudget(f.dir, 200, { ...config, quality: "high" }, { continuationApprovalFile: f.receipt })).toThrow("inputs or budget changed");
  });
});
