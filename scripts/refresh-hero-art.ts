/** Rebuild the three marketing copies from the CURRENT catalog (no paid calls).
 * Both ghost/torch layers use this manifest. Original names are overwritten;
 * the content hash in their URL invalidates previously cached hero images.
 * npx tsx scripts/refresh-hero-art.ts --apply
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";

const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
async function main() {
  const rows = [];
  for (const slug of ["newyork", "dragoncave", "futurecity"]) {
    const scene = JSON.parse(readFileSync(`content/scenes/${slug}/scene.json`, "utf8"));
    const source = readFileSync(path.join("public", scene.art.base));
    if (hash(source) !== scene.art.sha256) throw new Error(`Source hash mismatch: ${slug}`);
    // Match the board's aspect ratio: no attention crop can move a character.
    const bytes = await sharp(source).resize({ width: 1400 }).webp({ quality: 82, effort: 6 }).toBuffer();
    const assetPath = `/home/hero-${slug}.webp`;
    const assetSha256 = hash(bytes);
    rows.push({ slug, src: `${assetPath}?v=${assetSha256.slice(0, 16)}`, assetPath,
      assetSha256, bytes: bytes.length, source: scene.art.base, sourceSha256: scene.art.sha256, sceneVersion: scene.version });
    if (process.argv.includes("--apply")) writeFileSync(path.join("public", assetPath), bytes);
  }
  if (process.argv.includes("--apply")) {
    mkdirSync("content/home", { recursive: true });
    writeFileSync("content/home/hero-art.json", JSON.stringify(rows, null, 2) + "\n");
  }
  console.log(JSON.stringify({ applied: process.argv.includes("--apply"), boards: rows }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
