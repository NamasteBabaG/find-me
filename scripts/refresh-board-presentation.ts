/** Derive public previews from the 18 approved CHILD-FREE masters only.
 * No private patch, saved game, paid rendering or catalog activation.
 * npx tsx scripts/refresh-board-presentation.ts --apply
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { TWO_WORLD_RELEASE_CATALOG, TWO_WORLD_RELEASE_ROUTES } from "../content/adventures/two-worlds-release";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function main() {
  const apply = process.argv.includes("--apply");
  if (apply) mkdirSync("public/home/boards", { recursive: true });
  const rows = [];
  for (const route of TWO_WORLD_RELEASE_ROUTES) {
    const board = TWO_WORLD_RELEASE_CATALOG.boards.find(b => b.boardSlug === route.slug);
    if (!board || board.status !== "ready" || !/^\/scenes\/[a-z0-9-]+\/base\.webp$/.test(board.art.base)) throw Error(`Unapproved public source: ${route.slug}`);
    const source = readFileSync(`public${board.art.base}`);
    if (sha(source) !== board.art.sha256) throw Error(`Source changed: ${route.slug}`);
    const metadata = await sharp(source).metadata();
    if (metadata.width !== 3840 || metadata.height !== 2160) throw Error(`Unexpected master geometry: ${route.slug}`);
    const bytes = await sharp(source).resize(960, 540).webp({ quality: 85 }).toBuffer();
    const thumbnailSha256 = sha(bytes), thumbnail = `/home/boards/${thumbnailSha256}.webp`;
    if (apply) writeFileSync(`public${thumbnail}`, bytes);
    rows.push({ route: route.route, world: route.world, board: route.slug, name: board.name,
      base: board.art.base, sha256: board.art.sha256, version: board.sceneVersion,
      thumbnail, thumbnailSha256, discoveries: board.discoveries.map(d => ({ id: d.id, name: d.name })) });
  }
  if (apply) writeFileSync("content/home/board-presentation.json", JSON.stringify(rows, null, 2) + "\n");
  console.log(JSON.stringify({ applied: apply, boards: rows.length, worlds: [...new Set(rows.map(r => r.world))] }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
