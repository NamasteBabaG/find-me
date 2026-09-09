/** Free, private cross-child robustness audit. Does not rewrite source or slot contracts. */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";
import { writeImmutableBytes } from "./board-conditioned-probe-replay";
import { chooseRobustPeekCut, ROBUST_PEEK_CUT_VERSION } from "../src/services/generation/robust-peek-cut";
import type { SimplePeekUncutInput } from "../src/services/generation/simple-peek";
import { sha256Bytes } from "../src/services/generation/fixed-sprite";

const ENGINE = "work/board-conditioned-engine-20260909";
const ROOT = "work/open-placement-20260909/robust-cut-audit-v2";
const RUNS: Record<string, string[]> = {
  paris: ["world-paris-v2", "noa-paris"], sydney: ["world-sydney", "noa-sydney"], antarctica: ["world-antarctica", "noa-antarctica"],
};
const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
async function main() {
  for (const boardId of (process.argv[2] ?? "paris,sydney,antarctica").split(",")) {
    if (!RUNS[boardId]) throw new Error(`No original paid run inventory for ${boardId}`);
    const input = (await loadBoardConditioningInputs(read(`${ENGINE}/world-${boardId}-spec.json`)))[0]!;
    const sources: { run: string; index: number; slotId: string; source: SimplePeekUncutInput["source"] }[] = [];
    for (const run of RUNS[boardId]!) {
      const result = read(`${ENGINE}/${run}/result.json`);
      for (const [index, direction] of input.slots.entries()) {
        const metadata = result.extracted?.sprites?.find((s: { slotId: string }) => s.slotId === direction.slot.id);
        const file = `${ENGINE}/${run}/sprite-${index + 1}.png`;
        if (!metadata || !existsSync(file)) continue;
        sources.push({ run, index: index + 1, slotId: direction.slot.id, source: {
          png: readFileSync(file), sha256: metadata.sha256, eye: metadata.eye, chin: metadata.chin,
          protectedFacePolygon: metadata.protectedFacePolygon, measurement: metadata.measurement,
        } });
      }
    }
    const dir = `${ROOT}/${boardId}`; mkdirSync(dir, { recursive: true });
    const rows = [], boardPatches = new Map<string, Buffer[]>();
    for (const direction of input.slots) {
      if (direction.slot.pose === "standing") throw new Error("Original clipped audit cannot include a standing slot");
      const results = [];
      for (const s of sources) {
        const face = Math.hypot(s.source.chin.x - s.source.eye.x, s.source.chin.y - s.source.eye.y);
        let bestCoveredMarginPx: number | null = null;
        const failedChecks = new Set<string>();
        const selected = await chooseRobustPeekCut({ board: input.board, foreground: direction.foreground,
          slot: { ...direction.slot, pose: direction.slot.pose }, source: s.source }, { minCutY: Math.ceil(s.source.chin.y + face),
          onCandidate: candidate => {
            if (candidate.worstSideMarginPx !== null) bestCoveredMarginPx = Math.max(bestCoveredMarginPx ?? 0, candidate.worstSideMarginPx);
            candidate.failedChecks?.forEach(key => failedChecks.add(key));
          } });
        results.push({ run: s.run, sourceIndex: s.index, sourceSlotId: s.slotId, sourceSha256: s.source.sha256,
          passed: selected !== null, lowerCutY: selected?.lowerCutY ?? null, firstHiddenCut: selected?.firstHiddenCut ?? null,
          margin: selected?.margin ?? null, bestCoveredMarginPx, failedChecks: [...failedChecks] });
        if (selected && s.slotId === direction.slot.id) {
          writeImmutableBytes(`${dir}/${s.run}-${s.index}-context.png`, selected.composite.contextPng);
          const patches = boardPatches.get(s.run) ?? []; patches.push(selected.composite.patchPng); boardPatches.set(s.run, patches);
        }
      }
      const passed = sources.length === 6 && results.every(r => r.passed);
      const worstMargin = passed ? Math.min(...results.map(r => r.margin!.worstSideMarginPx)) : null;
      rows.push({ slotId: direction.slot.id, slot: direction.slot, foregroundSha256: direction.foreground.sha256,
        sourceCount: sources.length, passed, geometricallyPassed: results.filter(r => r.passed).length, worstMargin, results });
      console.log(JSON.stringify({ boardId, slotId: direction.slot.id, passed: results.filter(r => r.passed).length,
        total: sources.length, worstMargin, requiredMarginPx: Math.ceil(direction.slot.faceHeightPx) }));
    }
    for (const [run, patches] of boardPatches) {
      const png = await sharp(input.board.png).composite(patches.map(input => ({ input, left: 0, top: 0 }))).png().toBuffer();
      writeImmutableBytes(`${dir}/${run}-board-diagnostic.png`, png);
    }
    writeImmutableBytes(`${dir}/audit.json`, JSON.stringify({ version: ROBUST_PEEK_CUT_VERSION, boardId,
      boardSha256: input.board.sha256, sourceSpecSha256: sha256Bytes(readFileSync(`${ENGINE}/world-${boardId}-spec.json`)),
      newApiCalls: 0, incrementalCostMicroUsd: 0, semanticStatus: "pending", automaticRelease: false,
      fixedGeometryAndMasksUnchanged: true, allSixSilhouettesPassed: rows.every(r => r.passed), rows }, null, 2));
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
