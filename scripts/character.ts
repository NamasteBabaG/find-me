/**
 * Draw a child from a photo, once, the way the pipeline does.
 *
 *   npx tsx scripts/character.ts <photo> [--out=work/character] [--quality=medium]
 *                                        [--style=beach | --style=none]
 *     → <out>/sheet.png   the identity sheet (4 poses) used as the reference for every hiding spot
 *       <out>/avatar.png  the round cover face, cut from the sheet
 *       <out>/style.png   the piece of world she was told to match
 *
 * This is the first and most important call in a game: if the child on the sheet
 * is not recognisably the child in the photo, nothing downstream can fix it —
 * and if she is not painted like the world, every hiding spot after it fights to
 * blend a stranger in. `--style=none` reproduces the old, description-only
 * behaviour, which is how the two are compared.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OpenAiAvatarProvider } from "../src/infra/generation/openai";
import { styleReference } from "../src/services/generation/patch";
import { allScenes, findScene } from "../content/scenes";
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
  const styleRef = await boardStyle(flag("style", "beach"));
  if (styleRef) writeFileSync(path.join(out, "style.png"), styleRef);
  const started = Date.now();
  const character = await provider.createCharacter({
    originalPhoto: readFileSync(path.resolve(photoPath)),
    mimeType: "image/png",
    crop: null,
    childName: flag("name", "the child"),
    styleRef,
  });
  writeFileSync(path.join(out, "sheet.png"), character.sheetPng);
  writeFileSync(path.join(out, "avatar.png"), character.avatarPng);
  console.log(`sheet  ${character.sheetWidth}x${character.sheetHeight}  ${path.relative(process.cwd(), path.join(out, "sheet.png"))}`);
  console.log(`avatar ${character.avatarWidth}x${character.avatarHeight}  ${path.relative(process.cwd(), path.join(out, "avatar.png"))}`);
  console.log(`${(character.costCents / 100).toFixed(3)} USD on ${character.model}, ${Math.round((Date.now() - started) / 1000)}s, usage ${JSON.stringify(character.usage ?? {})}`);
}

/** The same crop the pipeline sends: around the first hiding spot of a real board. */
async function boardStyle(slug: string): Promise<Buffer | undefined> {
  if (slug === "none") return undefined;
  const scene = findScene(slug);
  if (!scene) throw new Error(`no scene "${slug}" (have: ${allScenes().map((s) => s.slug).join(", ")})`);
  const target = scene.targets[0];
  if (!target) throw new Error(`scene "${slug}" has no targets`);
  const art = readFileSync(path.join(process.cwd(), "public", scene.art.base.replace(/^\//, "")));
  return styleReference(art, { width: scene.art.width, height: scene.art.height }, target.slots[0]);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
