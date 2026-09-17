/** Ordinary crops of the already-approved public beach example. No AI/API/DB. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { publicBeachDemo } from "../content/demo/beach-v1";
import { passportPhotoCrop } from "../src/domain/passport/passport";
import type { AdventureRect } from "../src/domain/adventure/content";

async function main() {
  const config = publicBeachDemo("en"), board = config.adventure!.boards[0]!, scene = config.scenes[0]!;
  const base = await readFile(path.join(process.cwd(), "public", board.art.base));
  if (createHash("sha256").update(base).digest("hex") !== board.artSha256) throw new Error("Approved demo source changed");
  const output = path.join(process.cwd(), "public/demo/passport-v1");
  await mkdir(output, { recursive: true });
  async function crop(bytes: Buffer, rect: AdventureRect, width: number) {
    const left = Math.floor(rect.x * board.art.width), top = Math.floor(rect.y * board.art.height);
    const result = await sharp(bytes).extract({ left, top, width: Math.min(board.art.width - left, Math.ceil(rect.w * board.art.width)), height: Math.min(board.art.height - top, Math.ceil(rect.h * board.art.height)) }).resize({ width, withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
    const name = `${createHash("sha256").update(result).digest("hex")}.webp`;
    await writeFile(path.join(output, name), result);
    return `/demo/passport-v1/${name}`;
  }
  const photos: Record<string, string> = {}, discoveries: Record<string, string> = {};
  for (const target of scene.targets) {
    if (target.sprite.kind !== "image" || !/^\/demo\/beach-v1\/[a-f0-9]{64}\.webp$/.test(target.sprite.url)) throw new Error("Public example sources only");
    const binding = board.targetImages.find(t => t.targetId === target.id)!.A;
    const patch = await readFile(path.join(process.cwd(), "public", target.sprite.url));
    if (!target.sprite.url.includes(createHash("sha256").update(patch).digest("hex"))) throw new Error("Demo patch changed");
    const composite = await sharp(base).composite([{ input: await sharp(patch).resize(Math.round(binding.rect.w * board.art.width), Math.round(binding.rect.h * board.art.height), { fit: "fill" }).png().toBuffer(), left: Math.round(binding.rect.x * board.art.width), top: Math.round(binding.rect.y * board.art.height) }]).png().toBuffer();
    photos[target.id] = await crop(composite, passportPhotoCrop(binding.hitRect, board.art), 900);
  }
  for (const d of board.discoveries) discoveries[d.id] = await crop(base, d.cardCrop, 192);
  await writeFile(path.join(process.cwd(), "content/demo/passport-v1-assets.json"), JSON.stringify({ source: "approved-public-beach-v1", photos, discoveries }, null, 2) + "\n");
  console.log("Passport demo: 3 public-example photographs and 6 discovery crops, no generation.");
}
void main();
