import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRejudgePlan, executeRejudge } from "../../../scripts/rejudge";
import type { PatchJudge, PatchJudgement } from "@/infra/generation/types";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    const real = realpathSync(dir);
    if (path.dirname(real) !== realpathSync(tmpdir()) || !path.basename(real).startsWith("findme-rejudge-")) throw new Error("unsafe test cleanup");
    rmSync(real, { recursive: true, force: true });
  }
});
function fixture(count = 2) {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-rejudge-")); dirs.push(root);
  const run = path.join(root, "run");
  const refDir = path.join(run, "arm-E", "repeat-1", "test"); mkdirSync(refDir, { recursive: true });
  const referenceFile = path.join(refDir, "reference.sheet.png"); writeFileSync(referenceFile, "full sheet bytes");
  const refHash = createHash("sha256").update(readFileSync(referenceFile)).digest("hex");
  const referenceManifest = path.join(refDir, "..", "manifest.json");
  writeFileSync(referenceManifest, JSON.stringify({ config: { reference: "sheet" }, referenceHashes: { test: refHash } }));
  for (let i = 0; i < count; i++) {
    const dir = path.join(run, "arm-F", "repeat-1", "test", `cell-${i}`); mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "patch.webp"), `patch-${i}`);
    writeFileSync(path.join(dir, "cell.json"), JSON.stringify({ id: `test/cell-${i}`, board: "board", target: "target", shapeProblem: null, files: { patch: "patch.webp" }, judge: { verdict: "bad" } }));
  }
  const plan = buildRejudgePlan({ run, arm: "F", referenceManifest, commit: "test-commit" });
  return { root, run, plan, referenceFile, out: path.join(root, "evaluation") };
}
function judged(extra: Partial<PatchJudgement> = {}): PatchJudgement {
  return { verdict: "ok", reason: "test", costCents: 0.26, costUnknown: false, model: "gpt-4o-mini-2024-07-18", attempts: [{ requestId: "req_test", model: "gpt-4o-mini-2024-07-18", usage: {}, costCents: 0.26, costUnknown: false, status: 200 }], ...extra };
}
function provider(impl = async () => judged()) { return { id: "test", judge: vi.fn(impl) } satisfies PatchJudge; }

describe("the budgeted rejudge runner", () => {
  it("dry-runs with no provider and no mutation of historical cells", async () => {
    const f = fixture(); const before = readFileSync(f.plan.rows[0]!.sourceCell);
    const r = await executeRejudge(f.plan, { out: f.out });
    expect(r.state.verdicts).toHaveLength(0);
    expect(existsSync(path.join(f.out, "results.json"))).toBe(false);
    expect(readFileSync(f.plan.rows[0]!.sourceCell)).toEqual(before);
  });
  it("writes the reservation before calling, then accounts known charges", async () => {
    const f = fixture();
    const p = provider(async () => {
      const disk = JSON.parse(readFileSync(path.join(f.out, "results.json"), "utf8"));
      expect(disk.pending.reservedCents).toBeGreaterThan(0.26);
      expect(disk.accountedCents).toBeGreaterThanOrEqual(disk.pending.reservedCents);
      return judged();
    });
    const r = await executeRejudge(f.plan, { out: f.out, budgetCents: 4, judge: p });
    expect(r.state.accountedCents).toBe(0.52);
    expect(r.state.pending).toBeNull();
    expect(p.judge).toHaveBeenCalledTimes(2);
  });
  it("makes zero calls when the first reservation does not fit", async () => {
    const f = fixture(); const p = provider();
    const r = await executeRejudge(f.plan, { out: f.out, budgetCents: 0.1, judge: p });
    expect(r.state.stopped).toMatch(/budget/); expect(p.judge).not.toHaveBeenCalled();
  });
  it("retains an unknown charge as a reservation and stops before another call", async () => {
    const f = fixture(); const p = provider(async () => judged({ costCents: 0, costUnknown: true }));
    const r = await executeRejudge(f.plan, { out: f.out, budgetCents: 4, judge: p });
    expect(r.state.accountedCents).toBe(f.plan.rows[0]!.reserveCents);
    expect(r.state.stopped).toMatch(/unknown charge/); expect(p.judge).toHaveBeenCalledTimes(1);
  });
  it("treats an exception as unknown spend rather than continuing for free", async () => {
    const f = fixture(); const p = provider(async () => { throw new Error("lost response"); });
    const r = await executeRejudge(f.plan, { out: f.out, budgetCents: 4, judge: p });
    expect(r.state.accountedCents).toBeGreaterThan(0);
    expect(p.judge).toHaveBeenCalledTimes(1);
  });
  it("never overwrites a previous evaluation or resets its spend", async () => {
    const f = fixture(); await executeRejudge(f.plan, { out: f.out });
    const before = readFileSync(path.join(f.out, "plan.json")); const p = provider();
    await expect(executeRejudge(f.plan, { out: f.out, budgetCents: 4, judge: p })).rejects.toThrow();
    expect(p.judge).not.toHaveBeenCalled(); expect(readFileSync(path.join(f.out, "plan.json"))).toEqual(before);
  });
  it.each(["patch", "judgeReference", "sourceCell"] as const)("refuses changed %s before any write or call", async (key) => {
    const f = fixture(); writeFileSync(f.plan.rows[0]![key], "changed"); const p = provider();
    await expect(executeRejudge(f.plan, { out: f.out, budgetCents: 4, judge: p })).rejects.toThrow(/changed/);
    expect(p.judge).not.toHaveBeenCalled(); expect(existsSync(f.out)).toBe(false);
  });
  it("rejects an output directory inside the historical run", async () => {
    const f = fixture(); const p = provider(); const out = path.join(f.run, "evaluation");
    await expect(executeRejudge(f.plan, { out, budgetCents: 4, judge: p })).rejects.toThrow(/separate/);
    expect(existsSync(out)).toBe(false); expect(p.judge).not.toHaveBeenCalled();
  });
  it("does not accept infinity as a spend limit", async () => {
    const f = fixture();
    await expect(executeRejudge(f.plan, { out: f.out, budgetCents: Infinity, judge: provider() })).rejects.toThrow(/finite/);
    expect(existsSync(f.out)).toBe(false);
  });
  it("can complete fifteen recorded-size calls within four cents", async () => {
    const f = fixture(15); const p = provider();
    const r = await executeRejudge(f.plan, { out: f.out, budgetCents: 4, judge: p });
    expect(r.state.accountedCents).toBe(3.9); expect(r.state.verdicts).toHaveLength(15);
  });
});
