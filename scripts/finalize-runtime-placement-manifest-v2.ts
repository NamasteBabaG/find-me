/** Free immutable runtime validation revision. No provider or deployment calls. */
import { readFile, mkdir } from "node:fs/promises";
import { writeImmutableBytes } from "./board-conditioned-probe-replay";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";
import { sha256Bytes } from "../src/services/generation/fixed-sprite";
import { CROWN_FRINGE_REFINEMENT_V3 } from "../src/services/generation/crown-fringe";

const root = "work/open-placement-20260909";
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));
async function main() {
  const manifest = await readJson(`${root}/world-runtime-manifest-v1.json`);
  const sourceManifest = await readJson(`${root}/world-final-manifest-v1.json`);
  const override: Record<string, string> = {
    amazon: `${root}/author-batch-v1/amazon/runtime-v4/spec.json`,
    paris: `${root}/paris-fixed-repair-v2/spec.json`,
    marrakech: `${root}/marrakech-shop-shade-v1/spec.json`,
    greatwall: `${root}/greatwall-counter-lantern-v4/spec.json`,
  };
  const originalOverride: Record<string, string> = {
    newyork: `${root}/newyork-v3/spec.json`,
    tokyo: `${root}/author-batch-v1/tokyo/final-layer-v3/spec.json`,
  };
  const replayPlan = [];
  for (let index = 0; index < manifest.boards.length; index++) {
    const entry = manifest.boards[index];
    const priorSpec = await readJson(entry.spec), boardId = priorSpec.boardIds[0];
    const spec = await readJson(override[boardId] ?? entry.spec);
    const catalogBytes = await readFile(spec.catalogPath), catalog = JSON.parse(catalogBytes.toString("utf8"));
    const board = catalog.boards.find((b: { boardId: string }) => b.boardId === boardId);
    if (!board || catalog.boards.length !== 1 || board.slots.length !== 3) throw new Error(`Expected one board and3slots:${boardId}`);
    const out = `${root}/world-runtime-v2/${boardId}`;
    await mkdir(out, { recursive: true });
    for (const s of board.slots) {
      const previousContract = s.placement.contract;
      const record = await readJson(previousContract.path);
      if (record.slot.mode !== "open") continue;
      if (record.slot.pose !== "standing") throw new Error(`Open nonstanding slot:${s.slotId}`);
      record.slot.pixelRefinement = CROWN_FRINGE_REFINEMENT_V3;
      record.semanticStatus = "pending";
      record.revision = { kind: "fixed-validation-policy-revision", version: "world-runtime-v2", sourceContract: previousContract,
        reason: "Connected antialiased crown validation retains original crown coordinates; feet retainv2one-native-pixel transform bound. Existing pose, wardrobe, light, tone, scale, mask, support and protected neighbors are unchanged.",
        rawPaidSourceUnchanged: true, paidCalls: 0 };
      const file = `${out}/${s.slotId}.json`, bytes = Buffer.from(JSON.stringify(record, null, 2));
      writeImmutableBytes(file, bytes);
      s.placement.contract = { path: file, sha256: sha256Bytes(bytes) };
      s.placement.priorResultMetadata = { ...s.placement.contract };
    }
    catalog.revision = `world-runtime-v2:${boardId}`;
    catalog.runtimePolicy.defaultQuality = "medium";
    catalog.status.productionQualified = false; catalog.status.humanApproved = false;
    catalog.provenance.previousAuthoringCatalog = { path: spec.catalogPath, sha256: sha256Bytes(catalogBytes) };
    spec.catalogPath = `${out}/catalog.json`;
    writeImmutableBytes(spec.catalogPath, JSON.stringify(catalog, null, 2));
    const destinationSpec = `${out}/spec.json`;
    writeImmutableBytes(destinationSpec, JSON.stringify(spec, null, 2));
    const [input] = await loadBoardConditioningInputs(spec);
    entry.spec = destinationSpec;
    if (boardId === "antarctica") { console.log(JSON.stringify({ boardId, preparedOnly: true, paidCalls: 0 })); continue; }
    const runId = boardId === "newyork" ? "open-newyork-shade-v3" : `world-final-${boardId}-v1`;
    const originalSpec = originalOverride[boardId] ?? sourceManifest.boards[index].spec;
    const plan = await readJson(`work/board-conditioned-engine-20260909/${runId}/plan.json`);
    if (sha256Bytes(await readFile(originalSpec)) !== plan.specSha256) throw new Error(`Original source spec hash differs:${boardId}`);
    const [sourceInput] = await loadBoardConditioningInputs(await readJson(originalSpec));
    const mapping = input!.slots.map((s, i) => ({ sourceSlotId: sourceInput!.slots[i]!.slot.id, destinationSlotId: s.slot.id }));
    const mappingPath = `${out}/replay-mapping.json`;
    writeImmutableBytes(mappingPath, JSON.stringify(mapping, null, 2));
    replayPlan.push({ boardId, runId, sourceSpec: originalSpec, sourceSpecSha256: plan.specSha256,
      destinationSpec, mappingPath, revision: "final-runtime-v2", semanticStatus: "pending", paidCalls: 0 });
    console.log(JSON.stringify({ boardId, destinationSpec, originalSpec, paidCalls: 0 }));
  }
  writeImmutableBytes(`${root}/world-runtime-manifest-v2.json`, JSON.stringify(manifest, null, 2));
  writeImmutableBytes(`${root}/world-runtime-v2/replay-plan.json`, JSON.stringify({ maximumConcurrency: 2, paidCalls: 0, boards: replayPlan }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
