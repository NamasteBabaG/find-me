/** The pilot's TEST BOARD: a clearly marked 16:9 dummy picture, drawn here with
 * sharp, so the whole find → discovery → album → postcard path can be played and
 * verified before any real art exists. It is content for the local pilot game
 * (scripts/pilot-game.ts), never a purchasable world, and it says so on its face.
 *
 *   npx tsx scripts/pilot-test-board.ts          # draw, print hash and size
 *   npx tsx scripts/pilot-test-board.ts --apply  # also write the hash into content/adventures/test-board.json
 *
 * Geometry lives in content/adventures/test-board.json (the zones, the crab's
 * rectangles, the postcard crop); this file only paints what the JSON describes.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { AdventureCatalogSchema, type ReadyAdventureBoard } from "../src/domain/adventure/content";

const W = 1920;
const H = 1080;
const CATALOG = path.join("content", "adventures", "test-board.json");
const pct = (n: number) => `${(n * 100).toFixed(3)}%`;
const px = (n: number, size: number) => Math.round(n * size);

function svg(board: ReadyAdventureBoard): string {
  const zones = board.personalZones.map((z, i) => `
    <rect x="${px(z.x, W)}" y="${px(z.y, H)}" width="${px(z.w, W)}" height="${px(z.h, H)}" rx="18" fill="#f3d9a4" stroke="#d8b06c" stroke-width="4" stroke-dasharray="14 10"/>
    <text x="${px(z.x + z.w / 2, W)}" y="${px(z.y + z.h, H) + 30}" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#8a6a2e">hide ${i + 1}</text>`).join("");
  const d = board.discoveries[0]!;
  const v = d.visibleRect;
  const crabW = px(v.w, W);
  const crabH = px(v.h, H);
  const cx = px(v.x, W) + crabW / 2;
  const cy = px(v.y, H) + crabH * 0.55;
  const r = Math.min(crabW, crabH) * 0.32;
  const legs = [-1, 1].flatMap((side) => [0, 1, 2].map((n) => {
    const x1 = cx + side * r * 0.9;
    const y1 = cy - r * 0.2 + n * r * 0.35;
    const x2 = cx + side * (r * 1.7 + n * r * 0.15);
    const y2 = y1 + r * 0.55;
    return `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#c8402c" stroke-width="${Math.max(4, r * 0.16)}" stroke-linecap="round"/>`;
  })).join("");
  const claws = [-1, 1].map((side) => `<circle cx="${cx + side * r * 1.6}" cy="${cy - r * 0.95}" r="${r * 0.42}" fill="#e05a3a" stroke="#a52f1e" stroke-width="4"/>`).join("");
  const bucketX = px(v.x + v.w, W) + 12;
  const bucketY = px(v.y + v.h * 0.35, H);
  const bucketH = crabH * 0.6;
  const activity = [
    [0.05, 0.08, 0.16, 0.22, "#bfe3f2", "shop"], [0.24, 0.05, 0.14, 0.12, "#cfe8c2", "trees"], [0.44, 0.07, 0.2, 0.2, "#f6c9d9", "stalls"],
    [0.67, 0.04, 0.12, 0.09, "#e6d7f5", "kites"], [0.82, 0.06, 0.15, 0.2, "#ffe1a8", "tower"],
    [0.02, 0.36, 0.18, 0.14, "#d9ecf7", "boats"], [0.26, 0.4, 0.2, 0.18, "#e4f0c7", "picnic"], [0.52, 0.34, 0.17, 0.2, "#fbd9c0", "market"],
    [0.74, 0.36, 0.1, 0.16, "#d6e7ff", "fountain"], [0.86, 0.34, 0.12, 0.18, "#ffd9e8", "bridge"],
    [0.2, 0.8, 0.14, 0.16, "#e0f2df", "garden"], [0.6, 0.84, 0.18, 0.13, "#fbe8b6", "beach"], [0.82, 0.8, 0.16, 0.17, "#dcd6f7", "fair"],
  ].map(([x, y, w, h, fill, label]) => `<rect x="${px(x as number, W)}" y="${px(y as number, H)}" width="${px(w as number, W)}" height="${px(h as number, H)}" rx="28" fill="${fill}" stroke="#6b7280" stroke-opacity="0.35" stroke-width="3"/>
    <text x="${px((x as number) + (w as number) / 2, W)}" y="${px((y as number) + (h as number) / 2, H) + 10}" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#4b5563">${label}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8f4fb"/><stop offset="0.55" stop-color="#f7efd9"/><stop offset="1" stop-color="#efd9a6"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    ${activity}
    ${zones}
    <ellipse cx="${cx}" cy="${cy + r * 1.1}" rx="${r * 2.2}" ry="${r * 0.35}" fill="#000" opacity="0.12"/>
    ${legs}
    <ellipse cx="${cx}" cy="${cy}" rx="${r * 1.35}" ry="${r}" fill="#e8583a" stroke="#a52f1e" stroke-width="5"/>
    ${claws}
    <circle cx="${cx - r * 0.42}" cy="${cy - r * 0.55}" r="${r * 0.2}" fill="#fff" stroke="#a52f1e" stroke-width="3"/><circle cx="${cx + r * 0.42}" cy="${cy - r * 0.55}" r="${r * 0.2}" fill="#fff" stroke="#a52f1e" stroke-width="3"/>
    <circle cx="${cx - r * 0.42}" cy="${cy - r * 0.55}" r="${r * 0.09}" fill="#1f1f2e"/><circle cx="${cx + r * 0.42}" cy="${cy - r * 0.55}" r="${r * 0.09}" fill="#1f1f2e"/>
    <path d="M${cx - r * 0.35} ${cy + r * 0.25} Q${cx} ${cy + r * 0.55} ${cx + r * 0.35} ${cy + r * 0.25}" stroke="#7a1f14" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M${bucketX} ${bucketY} L${bucketX + bucketH * 0.9} ${bucketY} L${bucketX + bucketH * 0.78} ${bucketY + bucketH} L${bucketX + bucketH * 0.12} ${bucketY + bucketH} Z" fill="#8fb3c9" stroke="#3f6478" stroke-width="5"/>
    <path d="M${bucketX + bucketH * 0.1} ${bucketY} Q${bucketX + bucketH * 0.45} ${bucketY - bucketH * 0.5} ${bucketX + bucketH * 0.8} ${bucketY}" stroke="#3f6478" stroke-width="6" fill="none"/>
    <text x="${W / 2}" y="86" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="54" fill="#1f1f2e" opacity="0.85">TEST BOARD · בורד בדיקה · dummy content, not art</text>
    <text x="${W / 2}" y="${H - 28}" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#4b5563">${pct(0)} … ${pct(1)} — 16:9 · five personal zones · one discovery · one postcard</text>
  </svg>`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const catalog = AdventureCatalogSchema.parse(JSON.parse(readFileSync(CATALOG, "utf8")));
  const board = catalog.boards[0];
  if (!board || board.status !== "ready") throw new Error("The test board must be a ready board");
  const dir = path.join("public", "scenes", "pilot-test");
  mkdirSync(dir, { recursive: true });
  const base = await sharp(Buffer.from(svg(board))).webp({ quality: 80, effort: 6 }).toBuffer();
  const thumb = await sharp(base).resize({ width: 480 }).webp({ quality: 70 }).toBuffer();
  writeFileSync(path.join(dir, "base.webp"), base);
  writeFileSync(path.join(dir, "thumb.webp"), thumb);
  const sha256 = createHash("sha256").update(base).digest("hex");
  const meta = await sharp(base).metadata();
  console.log(JSON.stringify({ base: `${dir}/base.webp`, bytes: base.length, width: meta.width, height: meta.height, sha256, applied: apply }));
  if (apply) {
    const raw = JSON.parse(readFileSync(CATALOG, "utf8"));
    raw.boards[0].art = { ...raw.boards[0].art, sha256, width: meta.width, height: meta.height };
    writeFileSync(CATALOG, JSON.stringify(raw, null, 2) + "\n");
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
