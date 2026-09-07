/**
 * Re-extract paid renders of a harness run at several diff thresholds and say,
 * for each, how the main blob compares with the child the prompt asked for.
 * Free: nothing is generated. Evidence for choosing (or adapting) the threshold
 * when the model re-synthesises the background inside the mask.
 *
 *   npx tsx scripts/threshold-sweep.ts work/placement/proof-1 [28,40,56,72,96,128]
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { childProblem, diffToPatch } from "../src/services/generation/patch";
import { sceneBySlug } from "../src/services/scene-catalog.service";

const root = process.argv[2] ?? "";
if (!root) throw new Error("usage: threshold-sweep <run dir> [thresholds]");
const thresholds = (process.argv[3] ?? "28,40,56,72,96,128").split(",").map(Number);

async function main() {
  const out = path.join(root, "sweep");
  mkdirSync(out, { recursive: true });
  for (const identity of readdirSync(root).filter((d) => statSync(path.join(root, d)).isDirectory() && !["sweep", "triptych"].includes(d))) {
    for (const cellName of readdirSync(path.join(root, identity)).filter((d) => statSync(path.join(root, identity, d)).isDirectory())) {
      const dir = path.join(root, identity, cellName);
      if (!existsSync(path.join(dir, "raw-crop.png"))) continue;
      const cell = JSON.parse(readFileSync(path.join(dir, "cell.json"), "utf8")) as { board: string; slot: { x: number; y: number; scale: number }; window: { x: number; y: number; w: number; h: number; factor: number }; childPx: number };
      const scene = sceneBySlug(cell.board);
      const art = { width: scene.art.width, height: scene.art.height };
      const ctx = { rect: { x: cell.window.x, y: cell.window.y, w: cell.window.w, h: cell.window.h }, childPx: cell.childPx, windowFactor: cell.window.factor };
      const originalCrop = readFileSync(path.join(dir, "crop.png"));
      const editedCrop = readFileSync(path.join(dir, "raw-crop.png"));
      const rows: string[] = [];
      for (const threshold of thresholds) {
        const patch = await diffToPatch({ originalCrop, editedCrop, ctx, art, slot: cell.slot as never, options: { threshold } });
        const shape = childProblem(patch);
        const s = patch.shape;
        rows.push(`t=${String(threshold).padStart(3)}  blob ${String(s.width).padStart(3)}x${String(s.height).padStart(3)} (child ~${cell.childPx})  painted ${String(patch.painted).padStart(6)}  ${shape ? "✗ " + shape.slice(0, 70) : "✓ passes shape"}`);
        if (patch.width > 0) {
          const alpha = await sharp(patch.webp).ensureAlpha().extractChannel(3).png().toBuffer();
          writeFileSync(path.join(out, `${cellName}-t${threshold}.alpha.png`), alpha);
          writeFileSync(path.join(out, `${cellName}-t${threshold}.webp`), patch.webp);
        }
      }
      console.log(`\n${identity}/${cellName}`);
      for (const r of rows) console.log("  " + r);
    }
  }
}
main().catch((err) => { console.error(err); process.exitCode = 1; });
