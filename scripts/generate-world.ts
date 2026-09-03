/**
 * Generates the base art for a world with gpt-image-2, in the style of the
 * existing worlds (the beach/jungle/space paintings are passed as style
 * references), then writes the web assets and points the scene JSON at them.
 *
 *   npx tsx scripts/generate-world.ts city [--quality=medium] [--size=3072x2048] [--refs=beach,jungle,space] [--dry]
 *   npx tsx scripts/generate-world.ts beach --rerender [--size=3072x2048]   re-render the EXISTING art at a higher resolution (same composition)
 *   npx tsx scripts/generate-world.ts beach --from-asset                     no API call: (re)write the web assets + scene.json from assets/<Slug>.png
 *
 * Output:
 *   assets/<Slug>.png                      the raw generation (kept as the source of truth)
 *   public/scenes/<slug>/base.webp         the world
 *   public/scenes/<slug>/thumb.webp        480px thumbnail
 *   public/scenes/<slug>/foreground.webp   empty transparent layer (add occluders with add-foreground-patch.ts)
 *   content/scenes/<slug>/scene.json       art.{width,height,base,thumbnail,foreground}, artStatus "draft"
 *
 * The scene stays inactive until its hiding slots are placed on the new art.
 * Costs one image generation (medium ≈ a few cents).
 */
import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function flag(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function envKey(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return undefined;
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*(#.*)?$/);
    if (m && m[1] === name && m[2]) return m[2].trim();
  }
  return undefined;
}

/** Shared art direction — must stay consistent across worlds. */
const STYLE = [
  "Extremely detailed, joyful storybook illustration in the same painterly digital style, colour treatment, line quality and level of detail as the reference pictures (a modern 'search and find' children's book, like a Where's Wally page).",
  "Wide landscape composition seen from a slightly elevated angle, even warm daylight, saturated but soft colours, clean outlines.",
  "The picture is DENSELY packed edge to edge: at least 150 small, diverse, cheerful children and adults plus animals, all busy with funny little activities. No big foreground figures, no empty areas, no plain sky taking more than the top tenth — every part of the picture is full of small things to look at.",
  "Every person is tiny, at most 4% of the picture height (a crowd seen from a lookout tower), so that one particular child is genuinely hard to find and takes a few moments of searching.",
  "Plenty of nooks and natural hiding places: things to peek out from behind (bushes, vehicles, tents, stalls, walls, rocks).",
  "Absolutely no text, no letters, no numbers, no signs with writing, no logos, no watermark, no borders, no frame.",
].join(" ");

type LocalizedText = { en: string; he: string };
interface Scene {
  slug: string;
  name: LocalizedText;
  tagline: LocalizedText;
  art: { width: number; height: number; base: string; thumbnail: string; foreground?: string; palette?: unknown };
  artStatus: string;
  targets: Array<{ item: LocalizedText; mission: LocalizedText }>;
  ambient?: Array<{ label: LocalizedText }>;
  bonus?: { label?: LocalizedText; item?: LocalizedText };
  collectible?: { name: LocalizedText };
}

function prompt(scene: Scene): string {
  const items = scene.targets.map((t) => t.item.en).join(", ");
  const ambient = (scene.ambient ?? []).map((a) => a.label.en).join("; ");
  return [
    `${STYLE}`,
    `Paint a brand-new world: "${scene.name.en}" — ${scene.tagline.en}`,
    `It must contain, as clearly visible props spread across the scene: ${items}.`,
    ambient ? `Small delightful details to include: ${ambient}.` : "",
    `Leave several spots where a child could plausibly hide: next to or partly behind those props.`,
  ]
    .filter(Boolean)
    .join(" ");
}

async function main() {
  const slug = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!slug) throw new Error("usage: generate-world <slug> [--quality=medium] [--size=1536x1024] [--refs=beach,jungle,space] [--dry]");
  const scenePath = path.join(ROOT, "content", "scenes", slug, "scene.json");
  const scene = JSON.parse(readFileSync(scenePath, "utf-8")) as Scene;
  const text = prompt(scene);
  console.log(`\n[${slug}] prompt:\n${text}\n`);
  if (has("dry")) return;

  const size = flag("size", "3072x2048");
  const rerender = has("rerender");
  const pretty = slug.charAt(0).toUpperCase() + slug.slice(1);
  if (has("from-asset")) {
    await writeAssets(slug, scene, scenePath, readFileSync(path.join(ROOT, "assets", `${pretty}.png`)));
    return;
  }
  const key = envKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set (put it in .env).");
  const [w, h] = size.split("x").map(Number) as [number, number];
  const refs = flag("refs", "beach,jungle,space")
    .split(",")
    .map((r) => path.join(ROOT, "public", "scenes", r.trim(), "base.webp"))
    .filter((p) => existsSync(p));

  const form = new FormData();
  form.append("model", flag("model", "gpt-image-2"));
  if (rerender) {
    // Same picture, more pixels: the current art is the content reference.
    // Read into memory first: on Windows sharp cannot overwrite a file it still has open.
    const png = await sharp(readFileSync(path.join(ROOT, "public", scene.art.base))).png().toBuffer();
    form.append("image[]", new Blob([new Uint8Array(png)], { type: "image/png" }), "current.png");
    form.append(
      "prompt",
      "Re-render this exact picture at a much higher resolution. Identical composition, the same people, animals and objects at exactly the same positions and sizes, the same colours and lighting. Only add fine detail, crisp lines and sharpness. No text, no letters, no logos, no watermark, no border.",
    );
  } else {
    for (const [i, ref] of refs.entries()) {
      const png = await sharp(ref).resize({ width: 1024, height: 1024, fit: "inside" }).png().toBuffer();
      form.append("image[]", new Blob([new Uint8Array(png)], { type: "image/png" }), `reference-${i + 1}.png`);
    }
    form.append("prompt", `${text} The attached pictures are STYLE REFERENCES only: do not copy their content or composition.`);
  }
  form.append("size", size);
  form.append("quality", flag("quality", "medium"));
  form.append("n", "1");
  console.log(`calling OpenAI images/edits (${flag("model", "gpt-image-2")}, ${flag("quality", "medium")}, ${size}, ${rerender ? "re-render of current art" : `${refs.length} style refs`})…`);
  const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
  const json = (await res.json()) as { data?: Array<{ b64_json?: string }>; error?: { message?: string } };
  if (!res.ok || !json.data?.[0]?.b64_json) throw new Error(`OpenAI error ${res.status}: ${json.error?.message ?? "unknown"}`);
  const png = Buffer.from(json.data[0].b64_json, "base64");

  mkdirSync(path.join(ROOT, "assets"), { recursive: true });
  if (rerender && existsSync(path.join(ROOT, "assets", `${pretty}.png`))) writeFileSync(path.join(ROOT, "assets", `${pretty}.orig.png`), readFileSync(path.join(ROOT, "assets", `${pretty}.png`)));
  writeFileSync(path.join(ROOT, "assets", `${pretty}.png`), png);
  await writeAssets(slug, scene, scenePath, png);
}

/** base/thumb/foreground webp + scene.json art block. An existing foreground (occluders) is scaled so slots stay aligned. */
async function writeAssets(slug: string, scene: Scene, scenePath: string, png: Buffer) {
  const dir = path.join(ROOT, "public", "scenes", slug);
  mkdirSync(dir, { recursive: true });
  const meta = await sharp(png).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  writeFileSync(path.join(dir, "base.webp"), await sharp(png).webp({ quality: 85 }).toBuffer());
  writeFileSync(path.join(dir, "thumb.webp"), await sharp(png).resize({ width: 640 }).webp({ quality: 80 }).toBuffer());
  const fgPath = path.join(dir, "foreground.webp");
  const fgMeta = existsSync(fgPath) ? await sharp(readFileSync(fgPath)).metadata() : null;
  if (fgMeta && fgMeta.width && fgMeta.height && (fgMeta.width !== W || fgMeta.height !== H)) {
    writeFileSync(fgPath, await sharp(readFileSync(fgPath)).resize({ width: W, height: H, kernel: "lanczos3" }).webp({ quality: 85, alphaQuality: 100 }).toBuffer());
  } else if (!fgMeta) {
    writeFileSync(fgPath, await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).webp({ quality: 80, alphaQuality: 100 }).toBuffer());
  }

  scene.art = { ...scene.art, width: W, height: H, base: `/scenes/${slug}/base.webp`, thumbnail: `/scenes/${slug}/thumb.webp`, foreground: `/scenes/${slug}/foreground.webp` };
  if (scene.artStatus === "placeholder") scene.artStatus = "draft";
  writeFileSync(scenePath, JSON.stringify(scene, null, 2) + "\n");
  console.log(`✓ ${slug}: ${W}×${H} → public/scenes/${slug}/ (base, thumb, foreground); scene.json art updated`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

export {};
