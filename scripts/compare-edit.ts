/** How much of the crop the model actually changed — the fastest way to tell a
 *  refusal ("it handed the picture back") from a bad paint. */
import sharp from "sharp";
import path from "node:path";
import { readFileSync } from "node:fs";
import { cropOf, slotOf } from "./slot-patch";

async function main() {
  const [slug, targetId, variant = "A"] = process.argv.slice(2);
  if (!slug || !targetId) throw new Error("usage: compare-edit <slug> <targetId> [A|B]");
  const c = slotOf(slug, targetId, variant);
  const original = await sharp(await cropOf(c)).removeAlpha().raw().toBuffer();
  const editedPath = path.join(process.cwd(), "work", "patches", `${c.name}.edited.png`);
  const edited = await sharp(readFileSync(editedPath)).resize({ width: c.ctx.rect.w, height: c.ctx.rect.h, fit: "cover" }).removeAlpha().raw().toBuffer();
  let sum = 0;
  let over8 = 0;
  let over28 = 0;
  const n = c.ctx.rect.w * c.ctx.rect.h;
  for (let i = 0; i < n; i++) {
    const d = Math.max(Math.abs(edited[i * 3]! - original[i * 3]!), Math.abs(edited[i * 3 + 1]! - original[i * 3 + 1]!), Math.abs(edited[i * 3 + 2]! - original[i * 3 + 2]!));
    sum += d;
    if (d > 8) over8++;
    if (d > 28) over28++;
  }
  console.log(`${c.name}: mean diff ${(sum / n).toFixed(1)}, pixels >8: ${((over8 / n) * 100).toFixed(1)}%, >28: ${((over28 / n) * 100).toFixed(1)}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
