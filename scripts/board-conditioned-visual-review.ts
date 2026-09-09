/** Paid only with --run. Free cached replay first, then one Sol HIGH review per
 * selected final composite. Never judge the unmasked/untreated source sprite. */
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { OpenAiPatchJudge } from "../src/infra/generation/judge";
import { PrismaBoardConditionedCheckpointStore } from "../src/infra/db/board-conditioned-checkpoints";
import { PrismaWorldBudgetStore } from "../src/infra/db/prisma-world-budget-store";
import { generateBoardConditionedAppearances } from "../src/services/generation/board-conditioned-generation";
import { repositionBoardConditionedAppearances } from "../src/services/generation/board-conditioned-reposition";
import { boardConditioningHash } from "../src/services/generation/board-conditioned-source";
import { sha256Bytes } from "../src/services/generation/fixed-sprite";
import { GenerationBudget } from "./generation-budget";
import { finalReviewBudgetOptions } from "./board-conditioned-review-budget";
import { cachedOnlyDependencies, writeImmutableBytes } from "./board-conditioned-probe-replay";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";
import { assertReviewImage, parseReviewSlots, prepareFinalReviewImages, restoreReviewSourceInput,
  reviewOcclusionMode, verifyReviewReplay, type ReviewReplay } from "./board-conditioned-review-evidence";
import { OPEN_WORLD_HARDENING_POLICY as POLICY, OPEN_WORLD_HARDENING_ROOT as ROOT,
  OPEN_WORLD_HARDENING_PRIOR_LEDGER, OPEN_WORLD_HARDENING_CUMULATIVE_CENTS } from "./open-world-hardening-policy";
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3);
async function main() {
  const budgetOptions = finalReviewBudgetOptions(process.argv);
  const run = arg("result"), spec = arg("spec"), revision = arg("revision");
  if (!run || !spec || !revision || !/^[a-z0-9-]+$/.test(revision)) throw new Error("Private --result directory, --spec and versioned --revision required");
  const selected = parseReviewSlots(arg("slots"));
  const runRoot = path.resolve("work/board-conditioned-engine-20260909");
  const relative = path.relative(runRoot, path.resolve(run));
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Result must be inside the private board-engine runs directory");
  const runId = relative.split(path.sep)[0]!;
  if (!/^[a-z0-9-]{3,70}$/.test(runId)) throw new Error("Unsafe original run ID");
  const originalRoot = path.join(runRoot, runId), worldId = `probe:${runId}`;
  const dbFile = path.join(originalRoot, "engine.sqlite"), planFile = path.join(originalRoot, "plan.json");
  if (!existsSync(dbFile) || !existsSync(planFile)) throw new Error("Original immutable plan and paid checkpoint DB required; never create them for review");
  const originalPlanBytes = readFileSync(planFile), originalPlan = JSON.parse(originalPlanBytes.toString("utf8"));
  const specBytes = readFileSync(spec), inputs = await loadBoardConditioningInputs(JSON.parse(specBytes.toString("utf8")));
  if (inputs.length !== 1) throw new Error("One board per final visual review");
  const input = inputs[0]!;
  const resultBytes = readFileSync(`${run}/result.json`), result = JSON.parse(resultBytes.toString("utf8"));
  const reuse = result.version === "board-conditioned-geometry-reuse/v1";
  if (reuse && (result.provenance?.source?.worldId !== worldId
    || result.provenanceSha256 !== boardConditioningHash(result.provenance)
    || result.provenance.source.contractSha256 !== originalPlan.contractSha256
    || boardConditioningHash(result.provenance.source.contract) !== boardConditioningHash(originalPlan.contract))) throw new Error("Original paid source provenance differs");

  // No provider, key, reservation, checkpoint write or ledger write is available
  // during this phase. Current code must reproduce every saved placement.
  const db = new PrismaClient({ datasources: { db: { url: `file:${dbFile.replace(/\\/g, "/")}` } } });
  let replay: ReviewReplay;
  let ledgerSha256: string;
  try {
    const store = new PrismaWorldBudgetStore(db);
    const before = await store.read(worldId);
    if (!before) throw new Error("Original durable world ledger missing");
    ledgerSha256 = boardConditioningHash(before);
    const deps = cachedOnlyDependencies({ sourcePolicy: originalPlan.sourcePolicy, observerPolicy: originalPlan.observerPolicy,
      store, checkpoints: new PrismaBoardConditionedCheckpointStore(db) });
    if (reuse) {
      const sourceSpec = arg("source-spec");
      let sourceInput;
      if (sourceSpec) {
        const bytes = readFileSync(sourceSpec);
        if (sha256Bytes(bytes) !== originalPlan.specSha256) throw new Error("Explicit source spec differs from original paid plan");
        const sources = await loadBoardConditioningInputs(JSON.parse(bytes.toString("utf8")));
        if (sources.length !== 1) throw new Error("Exactly one original source board required");
        sourceInput = sources[0]!;
      } else sourceInput = restoreReviewSourceInput(result.provenance.source.contract, input);
      replay = await repositionBoardConditionedAppearances(deps, { sourceWorldId: worldId,
        sourceExpectedContractSha256: originalPlan.contractSha256, sourceInput, destinationInput: input,
        sourceMeasurementAttempt: result.provenance.source.measurementAttempt ?? 1,
        destinationRevisionId: result.provenance.destination.revisionId, mapping: result.provenance.destination.mapping });
    } else {
      const fresh = await generateBoardConditionedAppearances(deps, { worldId, input, expectedContractSha256: originalPlan.contractSha256,
        measurementAttempt: result.measurementAttempt ?? 1 });
      if (fresh.state !== "review-required") throw new Error(`Cached source cannot be visually reviewed: ${fresh.state}`);
      replay = fresh;
    }
    if (ledgerSha256 !== boardConditioningHash(await store.read(worldId))) throw new Error("Paid ledger changed during free replay; inspect before review");
    verifyReviewReplay(result, replay);
  } finally { await db.$disconnect(); }

  assertReviewImage(readFileSync(`${run}/board-all-three.png`), replay.boardPreviewPng, "board preview");
  for (const [i, appearance] of replay.appearances.entries()) {
    assertReviewImage(readFileSync(`${run}/sprite-${i + 1}.png`), appearance.sprite.png, `original sprite ${i + 1}`);
    if ("composite" in appearance && appearance.composite) {
      const c = appearance.composite;
      assertReviewImage(readFileSync(reuse ? `${run}/slot-${i + 1}-composite.png` : `${run}/board-${i + 1}.png`), c.compositePng, `final composite ${i + 1}`);
      assertReviewImage(readFileSync(reuse ? `${run}/slot-${i + 1}-context.png` : `${run}/context-${i + 1}.png`), c.contextPng, `final context ${i + 1}`);
      if (reuse) assertReviewImage(readFileSync(`${run}/slot-${i + 1}-patch.png`), c.patchPng, `final premasked patch ${i + 1}`);
    }
  }
  const out = `${run}/visual-review-${revision}`;
  mkdirSync(out, { recursive: true });
  const ready = await Promise.all(selected.map(async number => {
    const index = number - 1, d = input.slots[index]!, appearance = replay.appearances[index]!;
    if (appearance.slotId !== d.slot.id) throw new Error("Replayed destination order differs");
    const c = "composite" in appearance ? appearance.composite : null;
    const images = c?.ok ? await prepareFinalReviewImages({ patchPng: c.patchPng, compositePng: c.compositePng, direction: d }) : null;
    if (images) {
      writeImmutableBytes(`${out}/slot-${number}-final-patch.png`, images.patchPng);
      writeImmutableBytes(`${out}/slot-${number}-final-board.png`, images.boardCrop);
    }
    return { number, d, images, occlusionMode: await reviewOcclusionMode(d) };
  }));
  const plan = { version: "board-conditioned-final-visual-review/v2", boardId: input.boardId,
    contractSha256: "provenance" in replay ? replay.provenance.destination.contractSha256 : replay.contractSha256,
    originalPlanSha256: sha256Bytes(originalPlanBytes), originalLedgerSha256: ledgerSha256,
    sourceProvenanceSha256: "provenance" in replay ? replay.provenanceSha256 : null,
    resultSha256: sha256Bytes(resultBytes), specSha256: sha256Bytes(specBytes),
    model: POLICY.judgeModel, effort: "high", maximumCalls: ready.filter(item => item.images).length,
    selectedSlots: selected, slots: ready.map(({ number, d, images }) => ({ number, slotId: d.slot.id, evidence: images?.evidence ?? null })),
    sourceSpec: spec, run, freeReplayVerified: true, newReplayCalls: 0, automaticRelease: false };
  writeImmutableBytes(`${out}/plan.json`, JSON.stringify(plan, null, 2));
  if (!process.argv.includes("--run")) { console.log(JSON.stringify({ out, status: "prepared-no-spend", slots: selected, maximumCalls: plan.maximumCalls })); return; }
  if (!process.env.OPENAI_API_KEY && existsSync(".env")) {
    const m = /^OPENAI_API_KEY\s*=\s*["']?([^\s"']+)/m.exec(readFileSync(".env", "utf8"));
    if (m?.[1]) process.env.OPENAI_API_KEY = m[1];
  }
  if (!process.env.OPENAI_API_KEY) throw new Error("Existing authorized key unavailable");
  mkdirSync(ROOT, { recursive: true }); const lock = path.join(ROOT, "paid.lock");
  writeFileSync(lock, JSON.stringify({ pid: process.pid, purpose: "final-composite-review" }), { flag: "wx" });
  try {
    const budget = new GenerationBudget(`${ROOT}/budget`, POLICY.limitCents, POLICY, budgetOptions);
    const prior = Number(JSON.parse(readFileSync(OPEN_WORLD_HARDENING_PRIOR_LEDGER, "utf8")).spentCents);
    const judge = new OpenAiPatchJudge(process.env.OPENAI_API_KEY, { policy: "strong", tries: 1, timeoutMs: 180_000 });
    for (const { number, d, images, occlusionMode } of ready) {
      const file = `${out}/slot-${number}.json`;
      if (existsSync(file)) {
        const previous = JSON.parse(readFileSync(file, "utf8"));
        if (previous.slotId !== d.slot.id || boardConditioningHash(previous.evidence ?? null) !== boardConditioningHash(images?.evidence ?? null)) throw new Error("Existing verdict does not bind these exact final pixels");
        continue;
      }
      if (!images) { writeImmutableBytes(file, JSON.stringify({ slotId: d.slot.id, verdict: "geometry-rejected", evidence: null, costCents: 0, automaticRelease: false })); continue; }
      // Operator pause is checked only BETWEEN paid requests: retain completed
      // receipts and never interrupt an in-flight charge to prioritize a repair.
      if (existsSync(path.join(ROOT, "PAUSE_PAID"))) throw new Error("Final reviews paused by operator before a new paid request");
      if (budget.held || prior + budget.spent + 40 > OPEN_WORLD_HARDENING_CUMULATIVE_CENTS) throw new Error("Visual-review budget held or insufficient cumulative reserve");
      const p = d.originalPeople, { left, top } = images.evidence.contextRect;
      const verdict = await budget.run(`visual:${run}:${revision}:${d.slot.id}`, 40, () => judge.judge({
        boardCrop: images.boardCrop, patchPng: images.patchPng, reference: input.child.illustratedIdentity.png,
        childName: "test child", ageYears: input.child.ageYears, label: d.slot.id,
        recipe: { pose: d.slot.pose, occlusionMode,
          support: `${d.poseDescription} Local light: ${d.lighting.key}. ${d.lighting.fill}. Exposure/saturation: ${d.lighting.exposure}. Check style ALSO for overly bright hair, skin, clothing, mismatched saturation or missing expected cast shadow in exposed sunlight. The separate patch is the EXACT final visible, scaled, colour-treated and foreground-masked child, not the raw source.`,
          occlusion: d.slot.mode === "open" ? "A complete source is grounded at its authored support; existing real foreground may naturally occlude it. Judge visible contact in the final board; no invented support or cast shadow."
            : "Real original foreground hides the lower body. Missing legs in the final visible patch are intentional if the original scene explains them; judge the actual final board and cut edge.",
          comparators: `Original people in native board rectangle x${p.left},y${p.top},width${p.width},height${p.height}. Crop origin is x${left},y${top}. Compare same-depth children and adults, not nearer foreground or distant figures.` } }));
      for (const [n, png] of (verdict.wireImages ?? []).entries()) writeImmutableBytes(`${out}/slot-${number}-wire-${n + 1}.png`, png);
      writeImmutableBytes(file, JSON.stringify({ ...verdict, wireImages: undefined, slotId: d.slot.id, evidence: images.evidence, automaticRelease: false }, null, 2));
      console.log(JSON.stringify({ slot: d.slot.id, verdict: verdict.verdict, checks: verdict.checks, cents: verdict.costCents, reason: verdict.reason }));
      if (verdict.costUnknown) throw new Error("Unknown billed outcome retained; no further paid review");
    }
  } finally { unlinkSync(lock); }
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
