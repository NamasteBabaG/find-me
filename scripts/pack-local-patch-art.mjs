/** Mechanical packaging of the already-authored, non-personalized world art.
 * No provider calls and no image generation. Source pixels must survive exactly.
 * The source inputs are local authoring outputs; deployment reads only the
 * public paths declared in content/local-patch-world/art.json. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";

const sources = {
  tokyo: "work/fixed-world-simple-20260908/dense/assembled-static-v1/tokyo/board.png",
  amazon: "work/fixed-world-simple-20260908/dense/amazon-static-seam-v2/board.png",
  greatwall: "work/fixed-world-simple-20260908/dense/assembled-static-v1/greatwall/board.png",
  newyork: "work/fixed-world-simple-20260908/city-final-v1/newyork/board-static.png",
  paris: "work/fixed-world-simple-20260908/city-final-v1/paris/board-static.png",
};
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const rows = [];
for (const [board, source] of Object.entries(sources)) {
  const sourceBytes = await readFile(source);
  const meta = await sharp(sourceBytes).metadata();
  if (meta.width !== 3072 || meta.height !== 2048) throw new Error(`${board}: unexpected source size`);
  const dir = `public/scenes/${board}/local-patch-20260912`;
  await mkdir(dir, { recursive: true });
  const output = await sharp(sourceBytes).webp({ lossless: true, effort: 6 }).toBuffer();
  const before = await sharp(sourceBytes).ensureAlpha().raw().toBuffer();
  const after = await sharp(output).ensureAlpha().raw().toBuffer();
  if (!before.equals(after)) throw new Error(`${board}: lossless conversion changed pixels`);
  await writeFile(`${dir}/base.webp`, output);
  const written = await readFile(`${dir}/base.webp`);
  const writtenPixels = await sharp(written).ensureAlpha().raw().toBuffer();
  if (!before.equals(writtenPixels)) throw new Error(`${board}: written art changed pixels`);
  await sharp(sourceBytes).resize({ width: 768 }).webp({ quality: 88 }).toFile(`${dir}/thumb.webp`);
  rows.push({ board, base: `/${dir.slice(7)}/base.webp`, thumbnail: `/${dir.slice(7)}/thumb.webp`,
    sha256: sha(written), sourceSha256: sha(sourceBytes), bytes: written.length, width: meta.width, height: meta.height });
}
console.log(JSON.stringify(rows, null, 2));
