/**
 * FREE geometry-only revision of paid board-conditioned sources. No API key,
 * provider, budget reservation, ledger mutation, or source checkpoint write.
 *
 * npx tsx scripts/board-conditioned-reposition.ts --run=open-newyork-v2 \
 *   --source-spec=work/open-placement-20260909/newyork-v2/spec.json \
 *   --destination-spec=work/.../revised-spec.json --revision=shade-v1
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";
import { cachedOnlyDependencies, writeImmutableBytes } from "./board-conditioned-probe-replay";
import { PrismaBoardConditionedCheckpointStore } from "../src/infra/db/board-conditioned-checkpoints";
import { PrismaWorldBudgetStore } from "../src/infra/db/prisma-world-budget-store";
import { repositionBoardConditionedAppearances, type BoardRepositionMapping } from "../src/services/generation/board-conditioned-reposition";
import { sha256Bytes } from "../src/services/generation/fixed-sprite";

const flag = (name: string, fallback = "") => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
async function main() {
  const runId = flag("run"), revision = flag("revision");
  const sourceMeasurementAttemptText = flag("source-measurement-attempt", "1");
  if (sourceMeasurementAttemptText !== "1" && sourceMeasurementAttemptText !== "2") throw new Error("--source-measurement-attempt must be 1 or 2");
  if (!/^[a-z0-9-]{3,70}$/.test(runId) || !/^[A-Za-z0-9_-]{1,120}$/.test(revision)) throw new Error("Safe --run and --revision are required");
  const root = path.resolve("work/board-conditioned-engine-20260909", runId);
  const plan = JSON.parse(readFileSync(path.join(root, "plan.json"), "utf8"));
  const sourceSpecPath = flag("source-spec"), targetSpecPath = flag("destination-spec");
  if (!sourceSpecPath || !targetSpecPath) throw new Error("Explicit --source-spec and --destination-spec are required");
  const sourceSpecBytes = readFileSync(sourceSpecPath), targetSpecBytes = readFileSync(targetSpecPath);
  if (sha256Bytes(sourceSpecBytes) !== plan.specSha256) throw new Error("Source spec differs from the original immutable paid plan");
  const sourceInputs = await loadBoardConditioningInputs(JSON.parse(sourceSpecBytes.toString("utf8")));
  const destinationInputs = await loadBoardConditioningInputs(JSON.parse(targetSpecBytes.toString("utf8")));
  if (sourceInputs.length !== 1 || destinationInputs.length !== 1) throw new Error("One board per reuse revision");
  const mapping: BoardRepositionMapping[] | undefined = flag("mapping") ? JSON.parse(readFileSync(flag("mapping"), "utf8")) : undefined;
  const dbFile = path.join(root, "engine.sqlite");
  if (!existsSync(dbFile)) throw new Error("Original paid checkpoint database missing; never create one for reuse");
  const out = path.resolve(flag("out", path.join(root, "destinations", revision)));
  const workRoot = path.resolve("work"), relative = path.relative(workRoot, out);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Private export must be inside workspace work/");
  const db = new PrismaClient({ datasources: { db: { url: `file:${dbFile.replace(/\\/g, "/")}` } } });
  try {
    const deps = cachedOnlyDependencies({ sourcePolicy: plan.sourcePolicy, observerPolicy: plan.observerPolicy,
      store: new PrismaWorldBudgetStore(db), checkpoints: new PrismaBoardConditionedCheckpointStore(db) });
    const result = await repositionBoardConditionedAppearances(deps, {
      sourceWorldId: `probe:${runId}`, sourceExpectedContractSha256: plan.contractSha256,
      sourceInput: sourceInputs[0]!, destinationInput: destinationInputs[0]!, destinationRevisionId: revision, mapping,
      ...(sourceMeasurementAttemptText === "2" ? { sourceMeasurementAttempt: 2 as const } : {}),
    });
    mkdirSync(out, { recursive: true });
    writeImmutableBytes(path.join(out, "destination-spec.json"), targetSpecBytes);
    writeImmutableBytes(path.join(out, "board-all-three.png"), result.boardPreviewPng);
    const appearances = result.appearances.map((a, i) => {
      writeImmutableBytes(path.join(out, `sprite-${i + 1}.png`), a.sprite.png);
      if (a.composite) {
        writeImmutableBytes(path.join(out, `slot-${i + 1}-composite.png`), a.composite.compositePng);
        writeImmutableBytes(path.join(out, `slot-${i + 1}-context.png`), a.composite.contextPng);
        writeImmutableBytes(path.join(out, `slot-${i + 1}-patch.png`), a.composite.patchPng);
      }
      const { png: _png, ...sprite } = a.sprite;
      const composite = a.composite ? (({ patchPng: _p, compositePng: _c, contextPng: _x, ...rest }) => rest)(a.composite) : null;
      return { ...a, sprite, composite };
    });
    writeImmutableBytes(path.join(out, "result.json"), JSON.stringify({ version: result.version, state: result.state,
      boardId: result.boardId, provenance: result.provenance, provenanceSha256: result.provenanceSha256,
      previewIsDiagnostic: result.previewIsDiagnostic, semanticStatus: result.semanticStatus,
      automaticRelease: result.automaticRelease, appearances }, null, 2));
    console.log(JSON.stringify({ out, boardId: result.boardId, newApiCalls: 0, incrementalCostCents: 0,
      geometricallyPassed: result.appearances.filter(a => a.state === "visual-review-required").length,
      total: result.appearances.length, semanticStatus: "pending", generatedForDestination: false }));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
