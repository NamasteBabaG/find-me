/** One explicit second measurement of an already-paid sheet. No image provider
 * exists in this command. Original plan/source/observation remain immutable. */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaWorldBudgetStore } from "../src/infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../src/infra/db/world-budget-repository";
import { PrismaBoardConditionedCheckpointStore } from "../src/infra/db/board-conditioned-checkpoints";
import { BudgetedBoardPoseObserver, BoardPoseObservationError, decideBoardPoseObservation, prepareBoardPoseObservation,
  type BoardPoseObservationReceipt } from "../src/infra/generation/board-pose-observer";
import { generateBoardConditionedAppearances, type BoardMeasurement } from "../src/services/generation/board-conditioned-generation";
import { boardConditioningHash } from "../src/services/generation/board-conditioned-source";
import { sha256Bytes } from "../src/services/generation/fixed-sprite";
import { WorldBudget } from "../src/services/generation/world-budget";
import { cachedOnlyDependencies, writeImmutableBytes } from "./board-conditioned-probe-replay";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";
import { GenerationBudget } from "./generation-budget";
import { finalReviewBudgetOptions } from "./board-conditioned-review-budget";
import { OPEN_WORLD_HARDENING_POLICY as POLICY, OPEN_WORLD_HARDENING_ROOT as ROOT,
  OPEN_WORLD_HARDENING_CUMULATIVE_CENTS, OPEN_WORLD_HARDENING_PRIOR_LEDGER } from "./open-world-hardening-policy";

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const json = (file: string, value: unknown) => writeImmutableBytes(file, JSON.stringify(value, null, 2));
const imageFree = (value: unknown) => JSON.parse(JSON.stringify(value, (_key, item) => item?.type === "Buffer" && Array.isArray(item.data) ? undefined : item));
async function main() {
  const rootArg = arg("result"), specFile = arg("spec");
  if (!rootArg || !specFile) throw new Error("Existing --result original run and --spec required");
  const base = path.resolve("work/board-conditioned-engine-20260909"), root = path.resolve(rootArg), id = path.relative(base, root);
  if (!/^[a-z0-9-]{3,70}$/.test(id) || path.dirname(root) !== base) throw new Error("Select exactly one existing original private run");
  const dbFile = path.join(root, "engine.sqlite"), planBytes = readFileSync(path.join(root, "plan.json")), plan = JSON.parse(planBytes.toString("utf8"));
  if (!existsSync(dbFile) || plan.version !== "board-conditioned-engine-probe/v1") throw new Error("Existing immutable source plan and checkpoint DB required");
  const specBytes = readFileSync(specFile);
  if (sha256Bytes(specBytes) !== plan.specSha256) throw new Error("Use the exact original paid-source spec, not a changed destination");
  const inputs = await loadBoardConditioningInputs(JSON.parse(specBytes.toString("utf8")));
  if (inputs.length !== 1) throw new Error("One original board required");
  const input = inputs[0]!, worldId = `probe:${id}`, measurementKey = `board:${input.boardId}:measure:2`;
  const out = path.join(root, "measurements/second-observation-v1"), budgetOptions = finalReviewBudgetOptions(process.argv);
  const db = new PrismaClient({ datasources: { db: { url: `file:${dbFile.replace(/\\/g, "/")}` } } });
  try {
    const store = new PrismaWorldBudgetStore(db), checkpoints = new PrismaBoardConditionedCheckpointStore(db);
    const firstDeps = cachedOnlyDependencies({ sourcePolicy: plan.sourcePolicy, observerPolicy: plan.observerPolicy, store, checkpoints });
    const before = boardConditioningHash(await store.read(worldId));
    const original = await generateBoardConditionedAppearances(firstDeps, { worldId, input, expectedContractSha256: plan.contractSha256 });
    if (!("source" in original) || !original.source || !("measurement" in original) || !original.measurement?.receipt?.responseText) throw new Error("A retained original source and known raw measurement are required");
    if (before !== boardConditioningHash(await store.read(worldId))) throw new Error("Free original replay mutated billing");
    mkdirSync(out, { recursive: true });
    const reserveCents = Math.max(40, plan.observerPolicy.reserveMicroUsd / 10_000);
    json(path.join(out, "remeasure-plan.json"), { version: "same-sheet-second-observation/v1", originalPlanSha256: sha256Bytes(planBytes),
      specSha256: plan.specSha256, contractSha256: plan.contractSha256, worldId, boardId: input.boardId,
      sourceSha256: original.source.pngSha256, sourceFingerprint: original.source.fingerprint,
      originalMeasurementSha256: boardConditioningHash(original.measurement), originalMeasurementRequestId: original.measurement.evidence.providerRequestId,
      requestKey: measurementKey, measurementAttempt: 2, maximumNewImageCalls: 0, maximumNewObserverCalls: 1,
      model: "gpt-5.6-sol", effort: "high", reserveCents, previousObserverCostCents: original.measurement.receipt.costCents,
      originalCheckpointPreserved: true, manualPoints: false, automaticRelease: false });
    if (!process.argv.includes("--run")) {
      console.log(JSON.stringify({ status: "prepared-no-spend", out, reserveCents, maximumNewImageCalls: 0, maximumNewObserverCalls: 1 })); return;
    }
    if (existsSync(path.join(out, "result.json"))) throw new Error("Second observation already exported; replay it, never buy a third");
    if (!process.env.OPENAI_API_KEY && existsSync(".env")) {
      const match = /^OPENAI_API_KEY\s*=\s*["']?([^\s"']+)/m.exec(readFileSync(".env", "utf8"));
      if (match?.[1]) process.env.OPENAI_API_KEY = match[1];
    }
    if (!process.env.OPENAI_API_KEY) throw new Error("Existing authorized credential unavailable");
    mkdirSync(ROOT, { recursive: true }); const lock = path.join(ROOT, "paid.lock");
    writeFileSync(lock, JSON.stringify({ pid: process.pid, purpose: `${id}:same-sheet-measure-2` }), { flag: "wx" });
    try {
      const budget = new WorldBudget(new CasWorldBudgetRepository(store));
      const outer = new GenerationBudget(`${ROOT}/budget`, POLICY.limitCents, POLICY, budgetOptions);
      const prior = Number(JSON.parse(readFileSync(OPEN_WORLD_HARDENING_PRIOR_LEDGER, "utf8")).spentCents);
      if (!Number.isFinite(prior) || prior < 0 || outer.held || prior + outer.spent + reserveCents > OPEN_WORLD_HARDENING_CUMULATIVE_CENTS) throw new Error("Existing ledger held or insufficient cumulative measurement reserve");
      const observer = new BudgetedBoardPoseObserver(process.env.OPENAI_API_KEY, budget, plan.observerPolicy);
      const receiptFile = path.join(out, "observation-receipt.json");
      const measure = async (request: Parameters<typeof firstDeps.measure>[0]): Promise<BoardMeasurement | null> => {
        if (request.requestKey !== measurementKey) throw new Error("Only the explicit second observer request is permitted");
        const capture = await prepareBoardPoseObservation(request, plan.observerPolicy);
        const perform = async () => {
          try {
            const answer = await observer.observe({ ...request, expectedFingerprint: capture.fingerprint });
            if (answer.kind === "observed") json(receiptFile, answer.receipt);
            return answer;
          } catch (error) {
            if (error instanceof BoardPoseObservationError && error.receipt) json(receiptFile, error.receipt);
            throw error;
          }
        };
        const priorRequest = await budget.readRequest(worldId, measurementKey);
        let answer;
        if (priorRequest) answer = await perform(); // Durable key cannot redispatch.
        else {
          const accounted = await outer.run(`board-engine:${id}:${measurementKey}`, reserveCents, async () => {
            let value: Awaited<ReturnType<typeof perform>> | undefined, failed = false;
            try { value = await perform(); } catch { failed = true; }
            const row = await budget.readRequest(worldId, measurementKey), known = row && (row.state === "settled" || row.state === "linked");
            return { costCents: known ? row.evidence.amountMicroUsd / 10_000 : 0, costUnknown: !known, evidence: known ? row.evidence : null, value, failed };
          });
          if (accounted.failed || !accounted.value) throw new Error("Second observer outcome retained; reconcile without automatic retry");
          answer = accounted.value;
        }
        if (answer.kind === "observed") return { sheetSha256: answer.receipt.sourceImageSha256, fingerprint: answer.receipt.fingerprint,
          status: answer.status, sources: answer.sources, evidence: answer.evidence, receipt: answer.receipt, completenessDeferred: answer.completenessDeferred };
        if (!existsSync(receiptFile)) return null;
        const retained = JSON.parse(readFileSync(receiptFile, "utf8")) as BoardPoseObservationReceipt;
        const row = await budget.readRequest(worldId, measurementKey);
        if (!row || (row.state !== "settled" && row.state !== "linked") || retained.costUnknown || !retained.responseText
          || retained.fingerprint !== capture.fingerprint || retained.sourceImageSha256 !== original.source.pngSha256
          || retained.requestId !== row.evidence.providerRequestId) return null;
        const decision = decideBoardPoseObservation(JSON.parse(retained.responseText), request.slots, capture.rgba);
        return { sheetSha256: retained.sourceImageSha256, fingerprint: retained.fingerprint, status: decision.status,
          sources: decision.sources, evidence: row.evidence, receipt: retained, completenessDeferred: decision.completenessDeferred };
      };
      const result = await generateBoardConditionedAppearances({ sourcePolicy: plan.sourcePolicy, observerPolicy: plan.observerPolicy, budget, checkpoints,
        sources: { generate: async () => { throw new Error("Image generation is unavailable in measurement-only recovery"); } }, measure },
      { worldId, input, expectedContractSha256: plan.contractSha256, measurementAttempt: 2 });
      if ("source" in result && result.source) writeImmutableBytes(path.join(out, "sheet.png"), result.source.png);
      if (result.state === "review-required") {
        writeImmutableBytes(path.join(out, "board-all-three.png"), result.boardPreviewPng);
        for (const [i, appearance] of result.appearances.entries()) {
          writeImmutableBytes(path.join(out, `sprite-${i + 1}.png`), appearance.sprite.png);
          if ("composite" in appearance && appearance.composite) {
            writeImmutableBytes(path.join(out, `board-${i + 1}.png`), appearance.composite.compositePng);
            writeImmutableBytes(path.join(out, `context-${i + 1}.png`), appearance.composite.contextPng);
          }
        }
      }
      json(path.join(out, "result.json"), { ...imageFree(result), audit: await budget.audit(worldId), researchOnly: true, automaticRelease: false });
      console.log(JSON.stringify({ status: result.state, out, measurementAttempt: 2, newImageCalls: 0, outerSpentCents: outer.spent }));
    } finally { unlinkSync(lock); }
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Measurement-only recovery failed"); process.exitCode = 1; });
