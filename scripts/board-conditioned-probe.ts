/** Operator-only verification of the SAME board engine used by the QA job.
 * Dry-run by default. Real dispatch requires --run and the existing LOW
 * continuation approval; never reads/writes the configured application DB.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";
import { GenerationBudget } from "./generation-budget";
// Guy raised the pilot ceiling to 300 cents on 9 September 2026. The v1 ledger
// stays closed and unedited; this run records against its own v2 ledger, and the
// real total is the sum of both.
import { LOW_CONTINUATION_POLICY_V2 as LOW_CONTINUATION_POLICY, LOW_CONTINUATION_ROOT_V2 as LOW_CONTINUATION_ROOT,
  LOW_CONTINUATION_CUMULATIVE_CEILING_CENTS, LOW_CONTINUATION_PRIOR_LEDGERS } from "./fixed-low-continuation-policy";
import { WORLD_PRODUCTION_POLICY, WORLD_PRODUCTION_ROOT, WORLD_PRODUCTION_RESERVES } from "./world-production-policy";
import { OPEN_WORLD_HARDENING_POLICY, OPEN_WORLD_HARDENING_ROOT, OPEN_WORLD_HARDENING_CUMULATIVE_CENTS, OPEN_WORLD_HARDENING_PRIOR_LEDGER } from "./open-world-hardening-policy";
/** Production runs bill a separate ledger under a separate ceiling. */
const production = process.argv.includes("--production");
const hardening = process.argv.includes("--hardening");
if (production && hardening) throw new Error("Choose one billing scope, never both");
const POLICY = hardening ? OPEN_WORLD_HARDENING_POLICY : production ? WORLD_PRODUCTION_POLICY : LOW_CONTINUATION_POLICY;
const LEDGER_ROOT = hardening ? OPEN_WORLD_HARDENING_ROOT : production ? WORLD_PRODUCTION_ROOT : LOW_CONTINUATION_ROOT;
import { prepareBoardConditionedSource } from "../src/services/generation/board-conditioned-source";
import { generateBoardConditionedAppearances } from "../src/services/generation/board-conditioned-generation";
import { BudgetedOpenAiFixedSourceProvider } from "../src/infra/generation/openai-fixed-source";
import { BudgetedBoardPoseObserver, prepareBoardPoseObservation, decideBoardPoseObservation, type BoardPoseObservationReceipt } from "../src/infra/generation/board-pose-observer";
import { PrismaWorldBudgetStore } from "../src/infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../src/infra/db/world-budget-repository";
import { PrismaBoardConditionedCheckpointStore } from "../src/infra/db/board-conditioned-checkpoints";
import { WorldBudget } from "../src/services/generation/world-budget";
import { applyTestSchema } from "../src/lib/test-schema";
import { assertReplayPlan, cachedOnlyDependencies, writeImmutableBytes } from "./board-conditioned-probe-replay";
import type { BoardGenerationDependencies } from "../src/services/generation/board-conditioned-generation";

const flag = (name: string) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const digest = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const json = (file: string, value: unknown) => writeImmutableBytes(file, JSON.stringify(value, null, 2));
type ProbeResult = Awaited<ReturnType<typeof generateBoardConditionedAppearances>>;
function exportImages(root: string, result: ProbeResult) {
  if ("source" in result && result.source) writeImmutableBytes(path.join(root, "sheet.png"), result.source.png);
  if (result.state !== "review-required") return;
  writeImmutableBytes(path.join(root, "board-all-three.png"), result.boardPreviewPng);
  for (const [index, appearance] of result.appearances.entries()) {
    writeImmutableBytes(path.join(root, `sprite-${index + 1}.png`), appearance.sprite.png);
    if ("composite" in appearance && appearance.composite) {
      writeImmutableBytes(path.join(root, `context-${index + 1}.png`), appearance.composite.contextPng);
      writeImmutableBytes(path.join(root, `board-${index + 1}.png`), appearance.composite.compositePng);
    }
  }
}
const withoutImageBytes = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, item) => item?.type === "Buffer" && Array.isArray(item.data) ? undefined : item));
async function main() {
const id = flag("id"), specPath = flag("spec");
if (!id || !/^[a-z0-9-]{3,70}$/.test(id) || !specPath) throw new Error("Safe --id and --spec JSON required");
const root = path.resolve("work/board-conditioned-engine-20260909", id);
const replay = process.argv.includes("--replay"), replayId = flag("replay-id");
if (replay && (process.argv.includes("--run") || flag("continuation-approval"))) throw new Error("FREE_REPLAY: cannot combine --replay with paid dispatch flags");
if (replay && (!replayId || !/^[a-z0-9-]{3,70}$/.test(replayId))) throw new Error("FREE_REPLAY: safe versioned --replay-id required");
if (!replay && replayId) throw new Error("--replay-id requires --replay");
const originalPlanPath = path.join(root, "plan.json"), dbFile = path.join(root, "engine.sqlite");
if (replay && (!existsSync(originalPlanPath) || !existsSync(dbFile))) throw new Error("FREE_REPLAY: original immutable plan and paid checkpoint database required");
const originalPlan = replay ? JSON.parse(readFileSync(originalPlanPath, "utf8")) as Record<string, unknown> : null;
const specBytes = readFileSync(path.resolve(specPath)), spec = JSON.parse(specBytes.toString("utf8"));
const inputs = await loadBoardConditioningInputs(spec);
if (inputs.length !== 1) throw new Error("Probe is exactly one board; no automatic paid expansion");
const input = inputs[0]!;
// Opt-in MEDIUM is checkpoint-supported; omission preserves historical LOW hashes.
const requestedQuality = flag("quality");
if (requestedQuality && !["low", "medium"].includes(requestedQuality)) throw new Error("Only low or medium quality is allowed");
if (hardening && !replay && requestedQuality !== "medium") throw new Error("Hardening uses explicitly requested GPT Image 2 MEDIUM");
if (replay && requestedQuality) throw new Error("Replay uses the original quality policy");
const sourcePolicy: BoardGenerationDependencies["sourcePolicy"] = originalPlan ? originalPlan.sourcePolicy as BoardGenerationDependencies["sourcePolicy"] : { reserveMicroUsd: 200_000, providerNamespace: "openai:find-me-existing", timeoutMs: 240_000,
  rateCard: { id: "existing-reviewed-image2-5-8-30-microusd-v1", textInput: 5, imageInput: 8, imageOutput: 30 }, ...(requestedQuality === "medium" ? { quality: "medium" as const } : {}) };
const observerPolicy: BoardGenerationDependencies["observerPolicy"] = originalPlan ? originalPlan.observerPolicy as BoardGenerationDependencies["observerPolicy"] : { reserveMicroUsd: 400_000, providerNamespace: "openai:find-me-existing", timeoutMs: 240_000 };
const prepared = await prepareBoardConditionedSource(input, sourcePolicy);
const plan = { version: "board-conditioned-engine-probe/v1", specSha256: digest(specBytes), contract: prepared.contract,
  contractSha256: prepared.contractSha256, sourceFingerprint: prepared.prepared.fingerprint, sourcePolicy, observerPolicy,
  settings: prepared.prepared.capture.settings, sourceFiles: ["src/services/generation/board-conditioned-source.ts", "src/services/generation/board-conditioned-generation.ts", "src/services/generation/board-sprite-extraction.ts", "src/services/generation/board-placement.ts", "src/services/generation/board-conditioned-reposition.ts", "src/services/generation/robust-peek-cut.ts", "src/services/generation/compositing-tone.ts", "src/services/generation/open-placement.ts", "src/services/generation/standing-pixels.ts", "src/infra/db/board-conditioned-checkpoints.ts", "src/infra/generation/openai-fixed-source.ts", "src/infra/generation/fixed-source-diagnostics.ts", "src/infra/generation/board-pose-observer.ts"].map(file => ({ file, sha256: digest(readFileSync(file)) })),
  paid: false, maximumNewCalls: 2, maximumReservedCents: 60, automaticRelease: false };
if (replay) {
  assertReplayPlan(originalPlan!, plan);
  const worldId = `probe:${id}`, outputRoot = path.join(root, "replays", replayId!);
  const db = new PrismaClient({ datasources: { db: { url: `file:${dbFile.replace(/\\/g, "/")}` } } });
  try {
    const store = new PrismaWorldBudgetStore(db), checkpoints = new PrismaBoardConditionedCheckpointStore(db);
    const deps = cachedOnlyDependencies({ sourcePolicy, observerPolicy, store, checkpoints });
    const ledgerBefore = await store.read(worldId);
    const source = await checkpoints.getSource(worldId, input.boardId), measurement = await checkpoints.getMeasurement(worldId, input.boardId);
    if (!ledgerBefore || !source || !measurement) throw new Error("FREE_REPLAY: paid source, automatic measurement, and ledger must all exist; no regeneration");
    const replayPlan = { version: "board-conditioned-free-replay/v1", mode: "cached-only-replay", worldId,
      originalPlanSha256: digest(readFileSync(originalPlanPath)), specSha256: plan.specSha256,
      contractSha256: prepared.contractSha256, sourceSha256: source.pngSha256, sourceFingerprint: source.fingerprint,
      measurementSha256: digest(JSON.stringify(measurement)), measurementFingerprint: measurement.fingerprint,
      ledgerSha256: digest(JSON.stringify(ledgerBefore)), sourcePolicy, observerPolicy,
      originalSourceFiles: originalPlan!.sourceFiles, currentSourceFiles: plan.sourceFiles,
      maximumNewCalls: 0, maximumReservedCents: 0, automaticRelease: false };
    mkdirSync(outputRoot, { recursive: true });
    json(path.join(outputRoot, "plan.json"), replayPlan);
    const result = await generateBoardConditionedAppearances(deps, { worldId, input, expectedContractSha256: prepared.contractSha256 });
    const ledgerAfter = await store.read(worldId);
    if (JSON.stringify(ledgerBefore) !== JSON.stringify(ledgerAfter)) throw new Error("FREE_REPLAY: ledger changed concurrently; inspect before exporting");
    exportImages(outputRoot, result);
    const audit = await deps.budget.audit(worldId);
    json(path.join(outputRoot, "result.json"), { ...withoutImageBytes(result), audit, replay: replayPlan, newCalls: 0, newCostMicroUsd: 0, researchOnly: true, automaticRelease: false });
    console.log(JSON.stringify({ status: result.state, root: outputRoot, mode: "cached-only-replay", newCalls: 0, newCostCents: 0, historicalKnownCents: audit.settledMicroUsd / 10_000, held: audit.held }));
  } finally { await db.$disconnect(); }
  return;
}
if (!existsSync(root)) mkdirSync(root, { recursive: true });
if (!existsSync(path.join(root, "plan.json"))) {
  json(path.join(root, "plan.json"), plan);
} else {
  const dispatched = JSON.parse(readFileSync(path.join(root, "plan.json"), "utf8")) as typeof plan;
  const withoutImplementation = (p: typeof plan) => JSON.stringify({ ...p, sourceFiles: null });
  if (withoutImplementation(dispatched) !== withoutImplementation(plan)) throw new Error("Immutable probe inputs changed; no dispatch");
  if (JSON.stringify(dispatched.sourceFiles) !== JSON.stringify(plan.sourceFiles)) {
    // Every frozen input is identical and only this repository's implementation
    // moved. What protects the money is the durable world ledger, not this file:
    // an already settled request is never dispatched twice. So a resumed run may
    // proceed, the original dispatch plan is never overwritten, and the changed
    // implementation is recorded beside it (9 September 2026: the sydney source
    // and measurement were paid for, then a checkpoint schema gap lost the save).
    // The immutable record identifies an IMPLEMENTATION, so its bytes must be a
    // function of that implementation alone. Embedding the resume time made a
    // second resume on the same code try to rewrite the same name with different
    // content, which would have thrown before the measurement could be
    // recovered. Timing is kept separately, append-only.
    writeImmutableBytes(path.join(root, `plan-implementation-${digest(Buffer.from(JSON.stringify(plan.sourceFiles))).slice(0, 16)}.json`),
      JSON.stringify({ originalSourceFiles: dispatched.sourceFiles, currentSourceFiles: plan.sourceFiles }, null, 2));
    appendFileSync(path.join(root, "resume-events.jsonl"),
      `${JSON.stringify({ resumedAt: new Date().toISOString(), implementationSha256: digest(Buffer.from(JSON.stringify(plan.sourceFiles))) })}\n`);
  }
}
writeImmutableBytes(path.join(root, "prompt.txt"), prepared.prepared.prompt);
writeImmutableBytes(path.join(root, "conditioning-atlas.png"), prepared.prepared.stylePng);
writeImmutableBytes(path.join(root, "illustrated-identity.png"), prepared.prepared.identityPng);
if (!process.argv.includes("--run")) {
  console.log(JSON.stringify({ status: "prepared-no-spend", root, board: input.boardId, contractSha256: prepared.contractSha256 }));
} else {
  // A continuation approval exists to authorise spending PAST an unresolved
  // charge. A ledger with nothing unresolved has no such receipt to produce and
  // cannot manufacture one, so the file is demanded only when it is meaningful.
  const approval = flag("continuation-approval");
  if (existsSync(path.join(root, "result.json"))) throw new Error("Probe already finished; inspect it, do not buy another");
  // Existing explicit user authorization to reuse the key. No environment value is printed.
  if (!process.env.OPENAI_API_KEY && existsSync(".env")) {
    const match = /^OPENAI_API_KEY\s*=\s*["']?([^\s"']+)/m.exec(readFileSync(".env", "utf8"));
    if (match?.[1]) process.env.OPENAI_API_KEY = match[1];
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("Existing API credential unavailable");
  const lock = path.resolve(LEDGER_ROOT, "paid.lock");
  mkdirSync(path.dirname(lock), { recursive: true });
  writeFileSync(lock, JSON.stringify({ pid: process.pid, purpose: id }), { flag: "wx" });
  const fresh = !existsSync(dbFile);
  const db = new PrismaClient({ datasources: { db: { url: `file:${dbFile.replace(/\\/g, "/")}` } } });
  try {
    if (fresh) await applyTestSchema(db);
    const budget = new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db))), worldId = `probe:${id}`;
    const outer = new GenerationBudget(path.resolve(LEDGER_ROOT, "budget"), POLICY.limitCents, POLICY,
      approval ? { continuationApprovalFile: path.resolve(approval) } : {});
    if (outer.held && !approval) throw new Error("This ledger has an unresolved charge; --continuation-approval is required to spend past it");
    // The approved ceiling is cumulative across every pilot ledger, so the older
    // ledger's spend counts here too. Without this, splitting the bookkeeping
    // into a v2 file would silently authorise 300 cents on top of the first 200.
    const priorSpent = production ? 0 : (hardening ? [OPEN_WORLD_HARDENING_PRIOR_LEDGER] : LOW_CONTINUATION_PRIOR_LEDGERS).reduce((total, file) => {
      if (!existsSync(file)) return total;
      const led = JSON.parse(readFileSync(file, "utf8")) as { spentCents?: number };
      return total + (Number(led.spentCents) || 0);
    }, 0);
    // Outer dispatch must reserve at least as much as the inner provider ledger.
    const sourceReserve = Math.max(production ? WORLD_PRODUCTION_RESERVES.sourceCents : 20, sourcePolicy.reserveMicroUsd / 10_000);
    const measureReserve = Math.max(production ? WORLD_PRODUCTION_RESERVES.measureCents : 40, observerPolicy.reserveMicroUsd / 10_000);
    const worstCaseReserve = sourceReserve + measureReserve;
    const committed = priorSpent + outer.spent;
    const ceiling = hardening ? OPEN_WORLD_HARDENING_CUMULATIVE_CENTS : production ? POLICY.limitCents : LOW_CONTINUATION_CUMULATIVE_CEILING_CENTS;
    if (committed + worstCaseReserve > ceiling) {
      throw new Error(`CUMULATIVE_STOP: ${committed.toFixed(4)} of ${ceiling} cents already committed; ${worstCaseReserve} more would exceed the approved ceiling`);
    }
    console.log(JSON.stringify({ ledger: hardening ? "additional-hardening" : production ? "production" : "development", committedCents: Number(committed.toFixed(4)),
      ceilingCents: ceiling, remainingCents: Number((ceiling - committed).toFixed(4)) }));
    const provider = new BudgetedOpenAiFixedSourceProvider(process.env.OPENAI_API_KEY, budget, sourcePolicy, fetch, async receipt => {
      // Independent immutable local + DB copies; neither is a billing authority.
      writeImmutableBytes(path.join(root, "source-failure-receipt.json"), JSON.stringify(receipt, null, 2));
      await new PrismaBoardConditionedCheckpointStore(db).putSourceFailure(worldId, input.boardId, receipt);
    });
    const observer = new BudgetedBoardPoseObserver(process.env.OPENAI_API_KEY, budget, observerPolicy);
    const account = async <T>(key: string, reserveCents: number, fn: () => Promise<T>): Promise<T> => {
      const prior = await budget.readRequest(worldId, key);
      if (prior) return fn(); // Inner durable ledger is authoritative about no redispatch.
      const result = await outer.run(`board-engine:${id}:${key}`, reserveCents, async () => {
        let value: T | undefined, failure: unknown;
        try { value = await fn(); } catch (error) { failure = error; }
        const row = await budget.readRequest(worldId, key);
        const known = row && (row.state === "settled" || row.state === "linked");
        return { costCents: known ? row.evidence.amountMicroUsd / 10_000 : 0, costUnknown: !known,
          evidence: known ? row.evidence : null, value, errorCode: failure instanceof Error ? failure.name : failure ? "failed" : null,
          // No error objects, prompts or image bytes are leaked into the outer ledger.
        };
      });
      if (result.errorCode || result.value === undefined) throw new Error(`Recorded provider outcome: ${result.errorCode ?? "unknown"}; inspect durable ledger, no automatic retry`);
      return result.value;
    };
    const result = await generateBoardConditionedAppearances({ sourcePolicy, observerPolicy, budget, checkpoints: new PrismaBoardConditionedCheckpointStore(db),
      sources: { generate: args => account(args.requestKey, sourceReserve, () => provider.generate(args)) },
      measure: async args => {
        const capture = await prepareBoardPoseObservation(args, observerPolicy);
        const answer = await account(args.requestKey, measureReserve, () => observer.observe({ ...args, expectedFingerprint: capture.fingerprint }));
        if (answer.kind === "already-recorded") {
          // The charge is settled but no measurement was checkpointed - a crash
          // between paying and saving. The paid answer is retained on disk, so
          // re-derive it through the same decision rather than buying a second
          // opinion. Everything must still bind: same frozen fingerprint, a
          // known cost, and a settled durable row supplying the evidence.
          const file = path.join(root, "observation-receipt.json");
          if (!existsSync(file)) return null;
          const retained = JSON.parse(readFileSync(file, "utf8")) as BoardPoseObservationReceipt;
          const row = await budget.readRequest(worldId, args.requestKey);
          if (retained.fingerprint !== capture.fingerprint || retained.costUnknown || !retained.responseText
            || !row || (row.state !== "settled" && row.state !== "linked")) return null;
          const decision = decideBoardPoseObservation(JSON.parse(retained.responseText), capture.capture.slots, capture.rgba);
          return { sheetSha256: retained.sourceImageSha256, fingerprint: retained.fingerprint, status: decision.status,
            sources: decision.sources, evidence: row.evidence, receipt: retained, completenessDeferred: decision.completenessDeferred };
        }
        json(path.join(root, "observation-receipt.json"), answer.receipt);
        return { sheetSha256: answer.receipt.sourceImageSha256, fingerprint: answer.receipt.fingerprint, status: answer.status, sources: answer.sources, evidence: answer.evidence, receipt: answer.receipt,
          completenessDeferred: answer.completenessDeferred };
      },
    }, { worldId, input, expectedContractSha256: prepared.contractSha256 });
    exportImages(root, result);
    const clean = withoutImageBytes(result);
    const audit = await budget.audit(worldId);
    json(path.join(root, "result.json"), { ...clean, audit, researchOnly: true, automaticRelease: false });
    console.log(JSON.stringify({ status: result.state, root, newWorldKnownCents: audit.settledMicroUsd / 10_000, held: audit.held }));
  } finally { await db.$disconnect(); unlinkSync(lock); }
}
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Board engine probe failed"); process.exitCode = 1; });
