/**
 * Adds an occluder patch to a scene's foreground layer by copying an ellipse of
 * the base art into it (seamless by construction). Anything drawn on the
 * "behindForeground" layer is hidden where the patch is.
 *
 *   npx tsx scripts/add-foreground-patch.ts beach 520 650 130 85
 *                                           slug  cx  cy  rx ry   (base-image pixels)
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [slug, cxS, cyS, rxS, ryS] = process.argv.slice(2);
if (!slug || !cxS || !cyS || !rxS || !ryS) {
  console.error("usage: add-foreground-patch <slug> <cx> <cy> <rx> <ry>");
  process.exit(1);
}
const [cx, cy, rx, ry] = [cxS, cyS, rxS, ryS].map(Number);
const dir = path.join(process.cwd(), "public", "scenes", slug);

async function main() {
  const base = sharp(path.join(dir, "base.webp"));
  const { width = 0, height = 0 } = await base.metadata();
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff"/></svg>`);
  const patch = await base.ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const fgPath = path.join(dir, "foreground.webp");
  // Read into memory first: on Windows sharp cannot overwrite a file it is still reading.
  const current = readFileSync(fgPath);
  const merged = await sharp(current).composite([{ input: patch, blend: "over" }]).webp({ quality: 92, alphaQuality: 100 }).toBuffer();
  writeFileSync(fgPath, merged);
  console.log(`patched ${slug}/foreground.webp with ellipse (${cx},${cy}) r=(${rx},${ry})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
