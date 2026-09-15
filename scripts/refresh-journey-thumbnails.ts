/** Reproducible derivatives from approved shared art. No paid calls or child data. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { ADVENTURE_DENSITY_BOARDS } from "../content/adventures/density-boards";

async function main() {
  for (const board of ADVENTURE_DENSITY_BOARDS.boards) {
    if (board.status !== "ready") throw new Error("Unapproved board");
    const source = readFileSync(`public${board.art.base}`);
    if (createHash("sha256").update(source).digest("hex") !== board.art.sha256) throw new Error(`Art changed: ${board.boardSlug}`);
    const thumb = await sharp(source).resize({ width: 960 }).webp({ quality: 82, effort: 6 }).toBuffer();
    const file = `public${board.art.base.replace("base.webp", "thumb.webp")}`;
    if (process.argv.includes("--apply")) writeFileSync(file, thumb);
    console.log(`${board.boardSlug}: ${file} (${thumb.length} bytes)`);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
