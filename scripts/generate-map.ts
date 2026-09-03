/**
 * Generates the illustrated map for a world, in the same painterly language as
 * the boards (which are passed as style references).
 *
 *   npx tsx scripts/generate-map.ts journey [--quality=medium] [--size=1536x1024] [--dry]
 *   npx tsx scripts/generate-map.ts journey --from-asset     no API call: rebuild the web assets from assets/map-<slug>.png
 *
 * Output:
 *   assets/map-<slug>.png            the raw generation (the source of truth)
 *   public/worlds/<slug>/map.webp    desktop/tablet
 *   public/worlds/<slug>/map-sm.webp phone (same framing, fewer pixels — never a crop,
 *                                    because all nine destinations have to stay visible)
 *
 * The map is scenery only: the route is painted in, but every node, label and
 * the child marker is a runtime layer, so nothing here may contain text.
 * See docs/WORLD_MAP.md §"Artistic map asset contract".
 */
import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { envKey } from "./slot-patch";

const ROOT = process.cwd();

function flag(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** What every world map must be, whatever its theme. */
const MAP_STYLE = [
  "A hand-painted storybook adventure map, in exactly the same warm painterly digital style, colour treatment and line quality as the reference pictures.",
  "Seen from above at a gentle three-quarter angle, like a beautifully illustrated board game or a treasure map in a children's picture book.",
  "One clear winding path travels across the whole map and visits nine distinct little regions in order, each region a small, instantly recognisable diorama.",
  "The regions are generously spaced and each sits on its own patch of open ground, with calm, uncluttered space around it so a marker can stand there.",
  "The path is painted as a dotted or cobbled trail and is unbroken from the first region to the last.",
  "Bright, friendly, saturated but soft colours; no dark or scary areas; no big foreground objects blocking the path.",
  "Absolutely no text, no letters, no numbers, no signposts with writing, no logos, no watermark, no border, no frame, no compass rose with letters.",
].join(" ");

interface WorldFile {
  slug: string;
  name: { en: string; he: string };
  tagline: { en: string; he: string };
  map: { width: number; height: number; art: string; artPortrait?: string };
  nodes: Array<{ boardSlug: string; routeIndex: number }>;
}

function prompt(world: WorldFile, boardNames: string[]): string {
  const route = boardNames.map((n, i) => `${i + 1}. ${n}`).join(", ");
  return [
    MAP_STYLE,
    `Paint the map of "${world.name.en}" — ${world.tagline.en}.`,
    `The nine regions, in the order the path visits them: ${route}.`,
    `Each region should read at a glance as its own place, even when the map is shown small on a phone.`,
    `The path starts at the bottom left and ends at the top right.`,
  ].join(" ");
}

async function main() {
  const slug = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!slug) throw new Error("usage: generate-map <slug> [--quality=medium] [--size=1536x1024]");
  const worldPath = path.join(ROOT, "content", "worlds", slug, "world.json");
  const world = JSON.parse(readFileSync(worldPath, "utf-8")) as WorldFile;
  const boards = [...world.nodes].sort((a, b) => a.routeIndex - b.routeIndex).map((n) => n.boardSlug);
  const names = boards.map((b) => {
    const scene = JSON.parse(readFileSync(path.join(ROOT, "content", "scenes", b, "scene.json"), "utf-8")) as { name: { en: string } };
    return scene.name.en;
  });
  const text = prompt(world, names);
  console.log(`\n[${slug}] prompt:\n${text}\n`);
  if (has("dry")) return;

  const pretty = `map-${slug}`;
  if (has("from-asset")) {
    await writeAssets(slug, readFileSync(path.join(ROOT, "assets", `${pretty}.png`)));
    return;
  }

  const key = envKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set (put it in .env).");
  const size = flag("size", "1536x1024");
  const refs = boards
    .slice(0, 3)
    .map((b) => path.join(ROOT, "public", "scenes", b, "base.webp"))
    .filter((p) => existsSync(p));

  const form = new FormData();
  form.append("model", flag("model", "gpt-image-2"));
  for (const [i, ref] of refs.entries()) {
    const png = await sharp(ref).resize({ width: 1024, height: 1024, fit: "inside" }).png().toBuffer();
    form.append("image[]", new Blob([new Uint8Array(png)], { type: "image/png" }), `reference-${i + 1}.png`);
  }
  form.append("prompt", `${text} The attached pictures are STYLE REFERENCES only: match their painting style, not their content or composition.`);
  form.append("size", size);
  form.append("quality", flag("quality", "medium"));
  form.append("n", "1");
  console.log(`calling OpenAI images/edits (${size}, quality ${flag("quality", "medium")}, ${refs.length} style refs)…`);
  const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  const json = (await res.json()) as { data?: Array<{ b64_json?: string }>; usage?: { input_tokens?: number; output_tokens?: number }; error?: { message?: string } };
  if (!res.ok || !json.data?.[0]?.b64_json) throw new Error(`OpenAI error ${res.status}: ${json.error?.message ?? "unknown"}`);
  const png = Buffer.from(json.data[0].b64_json, "base64");
  mkdirSync(path.join(ROOT, "assets"), { recursive: true });
  writeFileSync(path.join(ROOT, "assets", `${pretty}.png`), png);
  console.log(`usage ${JSON.stringify(json.usage ?? {})}`);
  await writeAssets(slug, png);
}

async function writeAssets(slug: string, png: Buffer) {
  const dir = path.join(ROOT, "public", "worlds", slug);
  mkdirSync(dir, { recursive: true });
  const meta = await sharp(png).metadata();
  await sharp(png).webp({ quality: 88 }).toFile(path.join(dir, "map.webp"));
  await sharp(png).resize({ width: 900 }).webp({ quality: 84 }).toFile(path.join(dir, "map-sm.webp"));
  console.log(`map ${meta.width}x${meta.height} → public/worlds/${slug}/map.webp (+ map-sm.webp)`);
  console.log(`set map.width/height in content/worlds/${slug}/world.json to ${meta.width} and ${meta.height}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
