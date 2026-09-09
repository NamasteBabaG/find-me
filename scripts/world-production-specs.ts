/**
 * Free: one spec per board for the production world, from the frozen catalog.
 *
 * Every board uses the catalog's own authored pose, wardrobe, lighting and style
 * directions - they were written per slot against each board's local light - and
 * the same illustrated identity. Nothing here is a placement approval; it only
 * says which boards can be loaded at all.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadBoardConditioningInputs } from "./board-conditioned-inputs";

const CATALOG = "work/fixed-world-simple-20260908/board-conditioned-engine-v1/visual-directions-v4.json";
const IDENTITY = "work/board-conditioned-engine-20260909/illustrated-face-reference-v4.png";
const OUT = "work/board-conditioned-engine-20260909";
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

async function main() {
  const child = { profileId: process.argv.find(a => a.startsWith("--child="))?.slice(8) ?? "yuval-local-illustrated-pilot", ageYears: 8 };
  const identitySha = sha(readFileSync(IDENTITY));
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
  mkdirSync(OUT, { recursive: true });
  const report = [];
  for (const board of catalog.boards) {
    const spec = {
      catalogPath: CATALOG, sourcePresentation: "local-composite/v4" as const, boardIds: [board.boardId],
      child, illustratedIdentity: { path: IDENTITY, sha256: identitySha },
    };
    const file = path.join(OUT, `world-${board.boardId}-spec.json`);
    writeFileSync(file, JSON.stringify(spec, null, 2));
    try {
      const input = (await loadBoardConditioningInputs(spec))[0]!;
      report.push({ board: board.boardId, loads: true, slots: input.slots.map(s => s.slot.id) });
    } catch (error) {
      report.push({ board: board.boardId, loads: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const ok = report.filter(r => r.loads);
  console.log(JSON.stringify({ boards: report.length, loading: ok.length, report }, null, 2));
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
