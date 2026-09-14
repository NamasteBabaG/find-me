/** Deterministic packing only: approved master pixels -> lossless 4K WebP.
 * No provider, photo, database, registration in the shop, or upscaling. */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

async function main() {
  const sourceRoot = path.resolve(process.argv[2] ?? "../..");
  const files = {
    giza: process.argv[3] ?? "output/imagegen/adventure-three-boards-20260914-v1/giza-4k.png",
    amazon: "output/imagegen/adventure-three-boards-20260914-v3-style/amazon-4k.png",
    newyork: "output/imagegen/adventure-three-boards-20260914-v3-style/newyork-4k-concealed.png",
  };
  const manifest: Record<string, unknown> = {};
  for (const [name, file] of Object.entries(files)) {
    const raw = readFileSync(path.resolve(sourceRoot, file)), meta = await sharp(raw).metadata();
    if (meta.width !== 3840 || meta.height !== 2160) throw new Error(`${name}: not a 4K master`);
    const folder = path.join("public/scenes", `adventure-${name}${name === 'giza' && process.argv[3] ? '-repaired-v1' : ''}`);
    mkdirSync(folder, { recursive: true });
    const packed = await sharp(raw).webp({ lossless: true }).toBuffer();
    writeFileSync(path.join(folder, "base.webp"), packed);
    await sharp(raw).resize(640, 360).webp({ quality: 85 }).toFile(path.join(folder, "thumb.webp"));
    manifest[name] = { base: `/${folder.replaceAll('\\','/').replace(/^public\//,'')}/base.webp`, width: meta.width, height: meta.height,
      sha256: createHash("sha256").update(packed).digest("hex"), sourceSha256: createHash("sha256").update(raw).digest("hex"), bytes: packed.length };
  }
  writeFileSync("content/adventures/three-art.json", JSON.stringify(manifest, null, 2) + "\n");
  console.log("Packed 3 lossless 3840x2160 boards; source images unchanged.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
