/** Read-only paid-source replay, at most two private board buffers/processes. */
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { writeImmutableBytes } from "./board-conditioned-probe-replay";
async function main() {
  const root = "work/open-placement-20260909/world-runtime-v2";
  const plan = JSON.parse(await readFile(`${root}/replay-plan.json`, "utf8"));
  if (plan.maximumConcurrency !== 2 || plan.boards.length !== 8 || plan.paidCalls !== 0) throw new Error("Expected bounded eight-board free replay plan");
  let next = 0; const results: unknown[] = new Array(plan.boards.length);
  const worker = async () => {
    while (next < plan.boards.length) {
      const index = next++, board = plan.boards[index];
      const args = ["--import", "tsx", "scripts/board-conditioned-reposition.ts", `--run=${board.runId}`,
        `--source-spec=${board.sourceSpec}`, `--destination-spec=${board.destinationSpec}`,
        `--mapping=${board.mappingPath}`, `--revision=${board.revision}`];
      console.log(JSON.stringify({ boardId: board.boardId, state: "replaying", paidCalls: 0 }));
      const execution = await new Promise<{ error: string | null; stdout: string; stderr: string }>(resolve => {
        execFile(process.execPath, args, { windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) =>
          resolve({ error: error?.message ?? null, stdout, stderr }));
      });
      if (execution.error) {
        results[index] = { boardId: board.boardId, state: "replay-failed", ...execution, paidCalls: 0 };
      } else {
        const resultPath = `work/board-conditioned-engine-20260909/${board.runId}/destinations/${board.revision}/result.json`;
        const result = JSON.parse(await readFile(resultPath, "utf8"));
        results[index] = { boardId: board.boardId, state: result.state, resultPath,
          geometricallyPassed: result.appearances.filter((a: { state: string }) => a.state === "visual-review-required").length,
          appearances: result.appearances.map((a: { slotId: string; state: string; composite: { checks: unknown }; reason: string }) =>
            ({ slotId: a.slotId, state: a.state, checks: a.composite?.checks ?? null, reason: a.reason })),
          semanticStatus: "pending", automaticRelease: false, paidCalls: 0, incrementalCostCents: 0 };
      }
      console.log(JSON.stringify(results[index]));
    }
  };
  await Promise.all([worker(), worker()]);
  writeImmutableBytes(`${root}/replay-summary.json`, JSON.stringify({ maximumConcurrency: 2, paidCalls: 0,
    incrementalCostCents: 0, antarctica: "prepared-only-no-paid-source-replay", results }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
