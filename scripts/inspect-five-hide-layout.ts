/** Free authoring evidence, not a provider render or visual approval. */
import sharp from "sharp";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { FIVE_HIDE_BOARDS } from "../src/domain/scene/local-patch-five-hides";
import { cropOf, maskOf } from "../src/domain/scene/local-patch-hides";

async function main() {
  const output = path.resolve(process.argv[2] ?? "work/five-hide-layout-review");
  await mkdir(output, { recursive: true });
  for (const board of FIVE_HIDE_BOARDS) {
    const svg = `<svg width="3072" height="2048" xmlns="http://www.w3.org/2000/svg">${board.hides.map((hide, index) => {
      const crop = cropOf(hide), box = maskOf(hide);
      const color = hide.placement?.depth === "deep" ? "#00ffff" : hide.placement?.depth === "middle" ? "#ffec00" : "#ff74cc";
      return `<rect x="${crop.left}" y="${crop.top}" width="${crop.width}" height="${crop.height}" fill="none" stroke="${color}" stroke-width="3" stroke-dasharray="12 12"/><rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="${color}" fill-opacity=".24" stroke="${color}" stroke-width="5"/><text x="${box.left}" y="${box.top - 12}" font-size="32" font-family="sans-serif" fill="white" stroke="black" stroke-width="1">${index + 1} ${hide.placement?.depth} ${hide.pose}</text>`;
    }).join("")}</svg>`;
    const filename = path.join(output, `${board.board}.png`);
    const annotated = await sharp(path.resolve(board.art)).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
    await sharp(annotated).resize(1920, 1280).png().toFile(filename);
    console.log(filename);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
