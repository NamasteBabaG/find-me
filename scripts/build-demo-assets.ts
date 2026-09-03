/**
 * Builds the landing-page example pair from the source art in assets/:
 *   assets/random-girl.png          → public/demo/example-photo.jpg      (4:5 crop around the face, 800×1000)
 *   assets/random-girl-cartoon.png  → public/demo/example-character.webp (trimmed to the figure, alpha kept, 900px tall)
 * Re-run after replacing the sources:  npx tsx scripts/build-demo-assets.ts
 */
import sharp from "sharp";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "public", "demo");

async function photo() {
  const src = path.join(ROOT, "assets", "random-girl.png");
  const meta = await sharp(src).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const cropW = Math.min(w, Math.round((h * 4) / 5));
  const faceX = Math.round(w * 0.5); // the face sits in the middle of the frame
  const left = Math.max(0, Math.min(w - cropW, faceX - Math.round(cropW / 2)));
  await sharp(src).extract({ left, top: 0, width: cropW, height: h }).resize({ width: 800, height: 1000, fit: "cover" }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(OUT, "example-photo.jpg"));
  console.log("photo →", "example-photo.jpg", `${cropW}×${h} → 800×1000`);
}

async function character() {
  const src = path.join(ROOT, "assets", "random-girl-cartoon.png");
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = 0, minY = info.height, maxY = 0;
  for (let i = 0; i < info.width * info.height; i++) {
    if ((data[i * 4 + 3] ?? 0) > 24) {
      const x = i % info.width;
      const y = Math.floor(i / info.width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const pad = 6;
  const box = { left: Math.max(0, minX - pad), top: Math.max(0, minY - pad), width: Math.min(info.width, maxX + pad) - Math.max(0, minX - pad), height: Math.min(info.height, maxY + pad) - Math.max(0, minY - pad) };
  await sharp(src).extract(box).resize({ height: 900 }).webp({ quality: 90, alphaQuality: 90 }).toFile(path.join(OUT, "example-character.webp"));
  console.log("character →", "example-character.webp", `${box.width}×${box.height} → h900`);
}

photo().then(character).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
