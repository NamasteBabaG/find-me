/**
 * Backfill (or refresh) the tap contract of a slot patch from its own alpha.
 *
 * A patch is drawn at `rectNorm`, but the tap target must be the child inside it
 * and the speech bubble must hang from the head — not from the slot the patch was
 * generated at (docs/SPRITE_PATCHES.md). This reads the finished .webp and writes:
 *
 *   hitRectNorm — bounding box of the solid pixels (fractions of the art)
 *   anchorNorm  — top-centre of the head (fractions of the art)
 *
 *   npx tsx scripts/patch-hitbox.ts [dir=public/demo/patches]
 */
import sharp from "sharp";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface HitBox {
  hitRect: { x: number; y: number; w: number; h: number };
  anchor: { x: number; y: number };
}

/**
 * Bounding box of the pixels a child can actually tap, and the head point, in
 * pixels relative to the patch. Feathered edges (alpha under `solid`) do not count.
 */
export function hitBoxFromAlpha(alpha: Buffer, w: number, h: number, solid = 128): HitBox {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let i = 0; i < w * h; i++) {
    if (alpha[i]! < solid) continue;
    const x = i % w;
    const y = (i - x) / w;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) return { hitRect: { x: 0, y: 0, w, h }, anchor: { x: w / 2, y: 0 } };
  // The head: centre of gravity of the top quarter of the child.
  const band = minY + Math.max(2, Math.round((maxY - minY) * 0.25));
  let sum = 0;
  let count = 0;
  for (let y = minY; y <= band; y++) for (let x = minX; x <= maxX; x++) if (alpha[y * w + x]! >= solid) { sum += x; count++; }
  return {
    hitRect: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    anchor: { x: count ? sum / count : (minX + maxX) / 2, y: minY },
  };
}

async function main() {
  const dir = path.join(process.cwd(), process.argv[2] ?? "public/demo/patches");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const metaPath = path.join(dir, file);
    const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
    const webp = path.join(dir, file.replace(/\.json$/, ".webp"));
    const { data, info } = await sharp(webp).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
    const box = hitBoxFromAlpha(data, info.width, info.height);
    const W = meta.art.width as number;
    const H = meta.art.height as number;
    meta.hitRectNorm = {
      x: (meta.rect.x + box.hitRect.x) / W,
      y: (meta.rect.y + box.hitRect.y) / H,
      w: box.hitRect.w / W,
      h: box.hitRect.h / H,
    };
    meta.anchorNorm = { x: (meta.rect.x + box.anchor.x) / W, y: (meta.rect.y + box.anchor.y) / H };
    meta.anchor = { x: Math.round(meta.rect.x + box.anchor.x), y: Math.round(meta.rect.y + box.anchor.y) };
    writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
    console.log(
      `${file}: draw ${pct(meta.rectNorm.w)}×${pct(meta.rectNorm.h)} → tap ${pct(meta.hitRectNorm.w)}×${pct(meta.hitRectNorm.h)} at (${pct(meta.hitRectNorm.x)}, ${pct(meta.hitRectNorm.y)}), head (${pct(meta.anchorNorm.x)}, ${pct(meta.anchorNorm.y)}); slot was (${pct(meta.slot.x)}, ${pct(meta.slot.y)})`,
    );
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
