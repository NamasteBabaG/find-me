/**
 * Draw a child from a photo, once, the way the pipeline does.
 *
 *   npx tsx scripts/character.ts <photo> [--out=work/character] [--quality=medium]
 *     → <out>/sheet.png   the identity sheet (4 poses) used as the reference for every hiding spot
 *       <out>/avatar.png  the round cover face, cut from the sheet
 *
 * This is the first and most important call in a game: if the child on the sheet
 * is not recognisably the child in the photo, nothing downstream can fix it.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OpenAiAvatarProvider } from "../src/infra/generation/openai";
import { envKey } from "./slot-patch";

function flag(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main() {
  const photoPath = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!photoPath) throw new Error("usage: npx tsx scripts/character.ts <photo> [--out=work/character]");
  const key = envKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const out = path.join(process.cwd(), flag("out", "work/character"));
  mkdirSync(out, { recursive: true });

  const provider = new OpenAiAvatarProvider(key, { model: flag("model", "gpt-image-2"), quality: flag("quality", "medium") });
  const started = Date.now();
  const character = await provider.createCharacter({
    originalPhoto: readFileSync(path.resolve(photoPath)),
    mimeType: "image/png",
    crop: null,
    childName: flag("name", "the child"),
  });
  writeFileSync(path.join(out, "sheet.png"), character.sheetPng);
  writeFileSync(path.join(out, "avatar.png"), character.avatarPng);
  console.log(`sheet  ${character.sheetWidth}x${character.sheetHeight}  ${path.relative(process.cwd(), path.join(out, "sheet.png"))}`);
  console.log(`avatar ${character.avatarWidth}x${character.avatarHeight}  ${path.relative(process.cwd(), path.join(out, "avatar.png"))}`);
  console.log(`${(character.costCents / 100).toFixed(3)} USD on ${character.model}, ${Math.round((Date.now() - started) / 1000)}s, usage ${JSON.stringify(character.usage ?? {})}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
