/** Free, local recovery helpers. No API providers, credentials, or outer budget. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { BoardConditionedCheckpointStore, BoardGenerationDependencies } from "../src/services/generation/board-conditioned-generation";
import { CasWorldBudgetRepository, type AtomicWorldBudgetStore } from "../src/infra/db/world-budget-repository";
import { WorldBudget } from "../src/services/generation/world-budget";

/** Resume a partial export, but never replace a historical artifact. */
export function writeImmutableBytes(file: string, value: Buffer | string): void {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  const check = () => {
    if (!readFileSync(file).equals(bytes)) throw new Error(`Immutable artifact differs: ${file}`);
  };
  if (existsSync(file)) { check(); return; }
  try { writeFileSync(file, bytes, { flag: "wx" }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    check(); // Another identical exporter may have won the create race.
  }
}

export function cachedOnlyDependencies(args: {
  sourcePolicy: BoardGenerationDependencies["sourcePolicy"];
  observerPolicy: BoardGenerationDependencies["observerPolicy"];
  store: AtomicWorldBudgetStore;
  checkpoints: BoardConditionedCheckpointStore;
}): BoardGenerationDependencies {
  const forbidden = async (): Promise<never> => { throw new Error("FREE_REPLAY: cached-only; no dispatch or checkpoint/ledger writes are permitted"); };
  return {
    sourcePolicy: args.sourcePolicy,
    observerPolicy: args.observerPolicy,
    budget: new WorldBudget(new CasWorldBudgetRepository({
      read: id => args.store.read(id), insertIfAbsent: forbidden, compareAndSwap: forbidden,
    })),
    checkpoints: {
      getSource: (world, board) => args.checkpoints.getSource(world, board),
      getMeasurement: (world, board, attempt) => args.checkpoints.getMeasurement(world, board, attempt),
      putSource: forbidden, putMeasurement: forbidden,
    },
    sources: { generate: forbidden }, measure: forbidden,
  };
}

/** Only implementation hashes may change; child/art/geometry/policies remain frozen. */
export function assertReplayPlan(original: Record<string, unknown>, current: Record<string, unknown>): void {
  if (original.version !== "board-conditioned-engine-probe/v1") throw new Error("FREE_REPLAY: unsupported original probe plan");
  for (const field of ["version", "specSha256", "contract", "contractSha256", "sourceFingerprint", "sourcePolicy", "observerPolicy", "settings"]) {
    if (original[field] === undefined || JSON.stringify(original[field]) !== JSON.stringify(current[field])) {
      throw new Error(`FREE_REPLAY: frozen ${field} changed; no replay`);
    }
  }
}
