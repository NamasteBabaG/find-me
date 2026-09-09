import { readFileSync } from "node:fs";
import sharp from "sharp";
import { decideBoardPoseObservation } from "../src/infra/generation/board-pose-observer";
const root = process.argv[2];
if (!root || !root.startsWith("work/")) throw new Error("Explicit private work directory required");
async function main() {
  const r = JSON.parse(readFileSync(`${root}/observation-receipt.json`, "utf8"));
  const pixels = await sharp(readFileSync(`${root}/sheet.png`)).ensureAlpha().raw().toBuffer();
  let clear = 0, opaque = 0;
  for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] === 0) clear++; if (pixels[i]! >= 224) opaque++; }
  const d = decideBoardPoseObservation(JSON.parse(r.responseText), r.slots, pixels);
  const answer = JSON.parse(r.responseText);
  const points = answer.cells.map((c: { slotId: string; standing?: Record<string, { point?: { x: number; y: number } }> }) => ({ slot: c.slotId,
    points: Object.entries(c.standing ?? {}).filter(([,v]) => v?.point).map(([name, v]) => {
      let nearest: { x: number; y: number; distance: number } | null = null;
      for (let y = Math.floor(v.point!.y) - 4; y <= Math.floor(v.point!.y) + 4; y++) for (let x = Math.floor(v.point!.x) - 4; x <= Math.floor(v.point!.x) + 4; x++) {
        const distance = Math.hypot(x - v.point!.x, y - v.point!.y);
        if (x >= 0 && y >= 0 && x < 1024 && y < 1024 && pixels[(y * 1024 + x) * 4 + 3]! >= 224 && (!nearest || distance < nearest.distance)) nearest = { x, y, distance };
      }
      return { name, ...v.point, alpha: pixels[(Math.floor(v.point!.y) * 1024 + Math.floor(v.point!.x)) * 4 + 3], nearest };
    }) }));
  console.log(JSON.stringify({ status: d.status, reason: d.reason, points, clearFraction: clear / (pixels.length / 4), opaqueFraction: opaque / (pixels.length / 4) }));
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
