/**
 * Recompute the tap contract of existing slot patches from their own alpha.
 *
 * A patch is drawn at `rectNorm`, but the tap target is the painted child inside
 * it and the bubble hangs from her head — never the slot the patch was generated
 * at, which sits lower (docs/SPRITE_PATCHES.md). Use this after changing how the
 * hitbox is derived, or to backfill patches made before the contract existed.
 *
 *   npx tsx scripts/patch-hitbox.ts [dir=public/demo/patches]
 */
import sharp from "sharp";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hitBoxFromAlpha } from "../src/services/generation/patch";

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
    meta.hitRectNorm = { x: (meta.rect.x + box.hitRect.x) / W, y: (meta.rect.y + box.hitRect.y) / H, w: box.hitRect.w / W, h: box.hitRect.h / H };
    meta.anchorNorm = { x: (meta.rect.x + box.anchor.x) / W, y: (meta.rect.y + box.anchor.y) / H };
    writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
    console.log(`${file}: draw ${pct(meta.rectNorm.w)}x${pct(meta.rectNorm.h)} -> tap ${pct(meta.hitRectNorm.w)}x${pct(meta.hitRectNorm.h)}, head (${pct(meta.anchorNorm.x)}, ${pct(meta.anchorNorm.y)})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
