import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertReplayPlan, cachedOnlyDependencies, writeImmutableBytes } from "../../../../scripts/board-conditioned-probe-replay";
import type { BoardConditionedCheckpointStore, BoardGenerationDependencies } from "../board-conditioned-generation";
import type { AtomicWorldBudgetStore } from "../../../infra/db/world-budget-repository";

const folders: string[] = [];
afterEach(() => { for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true }); });
describe("operator cached-only board replay", () => {
  it("resumes partial immutable exports only when bytes are identical", () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), "board-replay-test-")); folders.push(folder);
    const file = path.join(folder, "sheet.png");
    writeImmutableBytes(file, Buffer.from([1, 2, 3]));
    expect(() => writeImmutableBytes(file, Buffer.from([1, 2, 3]))).not.toThrow();
    expect(() => writeImmutableBytes(file, Buffer.from([1, 2, 4]))).toThrow("Immutable artifact differs");
    expect([...readFileSync(file)]).toEqual([1, 2, 3]);
    writeImmutableBytes(path.join(folder, "result.json"), "{\"same\":true}");
    expect(() => writeImmutableBytes(path.join(folder, "result.json"), "{\"same\":true}")).not.toThrow();
  });

  it("allows explicit implementation recovery but not any frozen child/art/pose/policy change", () => {
    const original = { version: "board-conditioned-engine-probe/v1", specSha256: "spec", contract: { child: "child-a", slot: "slot-a" },
      contractSha256: "contract", sourceFingerprint: "source", sourcePolicy: { reserveMicroUsd: 200000 }, observerPolicy: { reserveMicroUsd: 400000 },
      settings: { quality: "low" }, sourceFiles: [{ file: "extractor.ts", sha256: "old" }] };
    const current = { ...original, sourceFiles: [{ file: "extractor.ts", sha256: "fixed" }] };
    expect(() => assertReplayPlan(original, current)).not.toThrow();
    for (const field of ["specSha256", "contract", "contractSha256", "sourceFingerprint", "sourcePolicy", "observerPolicy", "settings"]) {
      expect(() => assertReplayPlan(original, { ...current, [field]: "changed" })).toThrow(`frozen ${field} changed`);
      const missing = { ...original } as Record<string, unknown>; delete missing[field];
      expect(() => assertReplayPlan(missing, current)).toThrow(`frozen ${field} changed`);
    }
    expect(() => assertReplayPlan({ ...original, version: "other" }, current)).toThrow("unsupported original");
  });

  it("reads original cache/ledger only; missing cache cannot invoke network or persist a new charge", async () => {
    const store: AtomicWorldBudgetStore = { read: vi.fn(async worldId => ({ revision: 2, snapshot: { worldId, requests: [] } })),
      insertIfAbsent: vi.fn(), compareAndSwap: vi.fn() };
    const checkpoints: BoardConditionedCheckpointStore = { getSource: vi.fn(async () => null), getMeasurement: vi.fn(async () => null), putSource: vi.fn(), putMeasurement: vi.fn() };
    const sourcePolicy: BoardGenerationDependencies["sourcePolicy"] = { reserveMicroUsd: 200000, providerNamespace: "test", timeoutMs: 1000, rateCard: { id: "test", textInput: 5, imageInput: 8, imageOutput: 30 } };
    const observerPolicy = { reserveMicroUsd: 400000, providerNamespace: "test", timeoutMs: 1000 };
    const deps = cachedOnlyDependencies({ sourcePolicy, observerPolicy, store, checkpoints });
    expect(await deps.checkpoints.getSource("probe:original", "tokyo")).toBeNull();
    expect(await deps.checkpoints.getMeasurement("probe:original", "tokyo")).toBeNull();
    expect(await deps.budget.readRequest("probe:original", "board:tokyo:source:1")).toBeNull();
    expect((await deps.budget.audit("probe:original")).settledMicroUsd).toBe(0);
    await expect(deps.sources.generate({} as Parameters<typeof deps.sources.generate>[0])).rejects.toThrow("cached-only");
    await expect(deps.measure({} as Parameters<typeof deps.measure>[0])).rejects.toThrow("cached-only");
    await expect(deps.checkpoints.putSource("probe:original", "tokyo", {} as Parameters<typeof deps.checkpoints.putSource>[2])).rejects.toThrow("cached-only");
    await expect(deps.checkpoints.putMeasurement("probe:original", "tokyo", {} as Parameters<typeof deps.checkpoints.putMeasurement>[2])).rejects.toThrow("cached-only");
    await expect(deps.budget.reserve("probe:original", { requestKey: "unexpected", operationFingerprint: "same", reserveMicroUsd: 1, scope: "sheet" })).rejects.toThrow("cached-only");
    expect(store.insertIfAbsent).not.toHaveBeenCalled(); expect(store.compareAndSwap).not.toHaveBeenCalled();
    expect(checkpoints.putSource).not.toHaveBeenCalled(); expect(checkpoints.putMeasurement).not.toHaveBeenCalled();
    expect(checkpoints.getSource).toHaveBeenCalledWith("probe:original", "tokyo");
  });
});
