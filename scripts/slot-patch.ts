/**
 * Slot patches — how a child gets painted INTO a pre-rendered world.
 *
 * Backgrounds are rendered once. The only thing generated per child is a small
 * "patch": the context crop around a hiding slot with the child painted into it
 * by an image model (inpainting), which we then reduce to the changed pixels
 * only. Placed back at the same coordinates it blends perfectly — same light,
 * same style, real occlusion — and it is tiny (one 300–500px image per spot).
 *
 *   npx tsx scripts/slot-patch.ts export beach sandcastle A
 *     → work/patches/beach-sandcastle-A.crop.png   (give this to the image model)
 *       work/patches/beach-sandcastle-A.mask.png   (where to paint; optional for models that take a mask)
 *       work/patches/beach-sandcastle-A.json       (rect, slot, prompt)
 *
 *   npx tsx scripts/slot-patch.ts import beach sandcastle A path/to/edited.png [--threshold=28] [--outer=2.2] [--feather=6] [--grow=2.2] [--keep=0.12] [--out=public/demo/patches] [--no-clip]
 *     → <out>/beach-sandcastle-A.webp             (transparent patch: only what changed)
 *       <out>/beach-sandcastle-A.json             (rect in px and in art fractions, slot anchor)
 *       work/patches/beach-sandcastle-A.preview.png (the patch composited on the world, for a quick look)
 *
 *   npx tsx scripts/slot-patch.ts generate beach sandcastle A [--ref=public/demo/example-character.webp] [--model=gpt-image-2] [--quality=low] [--pose="hiding behind the sandcastle, only head and shoulders visible"] [--out=...]
 *     → export + OpenAI image edit (mask + character reference) + import, in one go.
 *       Default model gpt-image-2; falls back to gpt-image-1 automatically if the account cannot use it.
 *       Needs OPENAI_API_KEY (environment or .env). Costs one image generation per run.
 */
import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WORK = path.join(ROOT, "work", "patches");

type Rect = { x: number; y: number; w: number; h: number };

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function flag(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** Scripts don't get Next's .env loading; read the one key we need without printing it. */
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

/** White-on-black ellipse mask (the paint area) for a slot, in crop pixels. */
function maskSvg(c: { rect: Rect; slot: { x: number; y: number }; W: number; H: number; childPx: number }, grow = 1): Buffer {
  const cx = c.slot.x * c.W - c.rect.x;
  const cy = c.slot.y * c.H - c.rect.y;
  const rx = Math.round(c.childPx * 0.55 * grow);
  const ry = Math.round(c.childPx * 0.8 * grow);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${c.rect.w}" height="${c.rect.h}"><rect width="100%" height="100%" fill="#000"/><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff"/></svg>`);
}

async function context(slug: string, targetId: string, variantArg: string | undefined) {
  const { sceneBySlug } = await import("../src/services/scene-catalog.service");
  const { BODY_TEMPLATES } = await import("../content/body-templates");
  const scene = sceneBySlug(slug);
  const target = scene.targets.find((t) => t.id === targetId);
  if (!target) throw new Error(`unknown target "${targetId}" in "${slug}" (have: ${scene.targets.map((t) => t.id).join(", ")})`);
  const variant = (variantArg ?? "A").toUpperCase() === "B" ? "B" : "A";
  const slot = target.slots[variant === "A" ? 0 : 1] ?? target.slots[0];
  if (!slot) throw new Error("target has no slots");
  const W = scene.art.width;
  const H = scene.art.height;
  // Context window: ~7× the child's height, square, multiple of 8, clamped to the art.
  const size = Math.min(W, H, Math.round(clamp(slot.scale * H * 7, 384, 768) / 8) * 8);
  const rect: Rect = { x: clamp(Math.round(slot.x * W - size / 2), 0, W - size), y: clamp(Math.round(slot.y * H - size / 2), 0, H - size), w: size, h: size };
  const childPx = Math.round(slot.scale * H);
  const template = BODY_TEMPLATES[target.bodyTemplate];
  const mission = target.mission.en.replace("{name}", "the child");
  const pose = flag("pose", "");
  const prompt = [
    `Paint one child into this illustration, in exactly the same style, colours, line quality and warm daylight as the picture (storybook collage).`,
    `Use the attached character reference for the child (same face, hair, hat and outfit).`,
    `Situation: ${mission}${template ? ` (${template.label.en})` : ""}.${pose ? ` ${pose}` : ""}`,
    `Place the child inside the white area of the mask, about ${childPx}px tall so they match the people nearby, partly hidden by whatever is naturally in front, with a soft matching shadow.`,
    `The child should be findable but not the centre of attention. Keep every other pixel of the scene unchanged.`,
  ].join(" ");
  return { scene, target, variant, slot, W, H, rect, childPx, prompt, name: `${slug}-${targetId}-${variant}` };
}

async function exportCrop(slug: string, targetId: string, variantArg?: string) {
  const c = await context(slug, targetId, variantArg);
  mkdirSync(WORK, { recursive: true });
  const base = path.join(ROOT, "public", c.scene.art.base);
  await sharp(base).extract({ left: c.rect.x, top: c.rect.y, width: c.rect.w, height: c.rect.h }).png().toFile(path.join(WORK, `${c.name}.crop.png`));
  await sharp(maskSvg(c)).png().toFile(path.join(WORK, `${c.name}.mask.png`));
  const meta = { slug, targetId, variant: c.variant, slot: { x: c.slot.x, y: c.slot.y, scale: c.slot.scale, layer: c.slot.layer ?? "front", flip: Boolean(c.slot.flip) }, rect: c.rect, art: { width: c.W, height: c.H }, childPx: c.childPx, prompt: c.prompt };
  writeFileSync(path.join(WORK, `${c.name}.json`), JSON.stringify(meta, null, 2));
  console.log(`exported ${c.name}: crop ${c.rect.w}×${c.rect.h} at (${c.rect.x},${c.rect.y}); child ≈ ${c.childPx}px tall`);
  console.log(`\nPrompt:\n${c.prompt}\n`);
  console.log(`Files: work/patches/${c.name}.crop.png  work/patches/${c.name}.mask.png`);
}

/** Binary mask → the largest 4-connected blob plus blobs of at least `keep` × its area. */
function keepMainBlobs(mask: Buffer, w: number, h: number, keep: number): Buffer {
  const n = w * h;
  const label = new Int32Array(n).fill(-1);
  const areas: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (mask[i]! < 128 || label[i] !== -1) continue;
    const id = areas.length;
    let area = 0;
    stack.push(i);
    label[i] = id;
    while (stack.length) {
      const p = stack.pop()!;
      area++;
      const x = p % w;
      const y = (p - x) / w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) if (q >= 0 && mask[q]! >= 128 && label[q] === -1) { label[q] = id; stack.push(q); }
    }
    areas.push(area);
  }
  const largest = Math.max(0, ...areas);
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    const id = label[i] ?? -1;
    if (id >= 0 && (areas[id] ?? 0) >= largest * keep) out[i] = 255;
  }
  console.log(`blobs: ${areas.length}, largest ${largest}px, kept ${areas.filter((a) => a >= largest * keep).length}`);
  return out;
}

async function importPatch(slug: string, targetId: string, variantArg: string | undefined, editedPath: string) {
  const c = await context(slug, targetId, variantArg);
  const threshold = Number(flag("threshold", "28"));
  const feather = Number(flag("feather", "6"));
  const outDir = path.join(ROOT, flag("out", "public/demo/patches"));
  mkdirSync(outDir, { recursive: true });
  mkdirSync(WORK, { recursive: true });
  const base = path.join(ROOT, "public", c.scene.art.base);
  const original = await sharp(base).extract({ left: c.rect.x, top: c.rect.y, width: c.rect.w, height: c.rect.h }).removeAlpha().raw().toBuffer();
  const edited = await sharp(editedPath).resize({ width: c.rect.w, height: c.rect.h, fit: "cover" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = c.rect.w * c.rect.h;
  // 1. Changed pixels (max channel difference above the threshold), clipped to the paint area
  //    (grown by --grow, default 2.2×) so model drift elsewhere in the crop is ignored.
  const rawMask = { raw: { width: c.rect.w, height: c.rect.h, channels: 1 as const } };
  const grow = Number(flag("grow", "2.2"));
  const outerFactor = Number(flag("outer", "2.2"));
  const allow = has("no-clip") ? null : await sharp(maskSvg(c, grow)).extractChannel(0).raw().toBuffer();
  const inner = await sharp(maskSvg(c, 1.15)).extractChannel(0).raw().toBuffer();
  const diff = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    if (allow && allow[i]! < 128) continue;
    const d = Math.max(Math.abs(edited.data[i * 3]! - original[i * 3]!), Math.abs(edited.data[i * 3 + 1]! - original[i * 3 + 1]!), Math.abs(edited.data[i * 3 + 2]! - original[i * 3 + 2]!));
    // Outside the paint ellipse only strong changes count (the child), not re-render drift on sand and castle.
    const limit = inner[i]! >= 128 ? threshold : threshold * outerFactor;
    diff[i] = d > limit ? 255 : 0;
  }
  // 2. Open (erode → dilate) to drop compression speckle, then feather the edge.
  //    sharp applies operations in a fixed order per pipeline, so each step is its own pass.
  //    (blur promotes a single band to sRGB, so every pass is forced back to one channel.)
  const step = async (buf: Buffer, apply: (s: sharp.Sharp) => sharp.Sharp) => apply(sharp(buf, rawMask)).extractChannel(0).raw().toBuffer();
  let cleaned = await step(diff, (s) => s.blur(2));
  cleaned = await step(cleaned, (s) => s.threshold(150));
  cleaned = await step(cleaned, (s) => s.blur(3));
  cleaned = await step(cleaned, (s) => s.threshold(60));
  // 2b. Keep the child: the largest connected blob plus any blob at least --keep (default 12%) of its area.
  //     Thin re-render drift on castle edges and such becomes small islands and is dropped here.
  cleaned = keepMainBlobs(cleaned, c.rect.w, c.rect.h, Number(flag("keep", "0.12")));
  cleaned = await step(cleaned, (s) => s.blur(feather));
  // 3. Bounding box of the kept pixels (+ margin) so the patch stays small.
  let minX = c.rect.w, minY = c.rect.h, maxX = -1, maxY = -1;
  for (let i = 0; i < n; i++) {
    if (cleaned[i]! > 8) {
      const x = i % c.rect.w;
      const y = Math.floor(i / c.rect.w);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error("no changed pixels found — is this the edited version of the exported crop?");
  // Where the head is: centre of the kept pixels in the top quarter of the blob — the bubble hangs from here.
  let headSum = 0, headCount = 0;
  const headBand = minY + Math.max(4, Math.round((maxY - minY) * 0.25));
  for (let y = minY; y <= headBand; y++) for (let x = minX; x <= maxX; x++) if (cleaned[y * c.rect.w + x]! > 128) { headSum += x; headCount++; }
  const anchor = { x: c.rect.x + (headCount ? headSum / headCount : (minX + maxX) / 2), y: c.rect.y + minY };
  const m = 8;
  const box = { left: Math.max(0, minX - m), top: Math.max(0, minY - m), width: Math.min(c.rect.w, maxX + m + 1) - Math.max(0, minX - m), height: Math.min(c.rect.h, maxY + m + 1) - Math.max(0, minY - m) };
  const rgba = await sharp(edited.data, { raw: { width: c.rect.w, height: c.rect.h, channels: 3 } }).joinChannel(cleaned, rawMask).png().toBuffer();
  const patch = await sharp(rgba).extract(box).webp({ quality: 92, alphaQuality: 100 }).toBuffer();
  const patchPath = path.join(outDir, `${c.name}.webp`);
  writeFileSync(patchPath, patch);
  const rect: Rect = { x: c.rect.x + box.left, y: c.rect.y + box.top, w: box.width, h: box.height };
  const meta = {
    slug,
    targetId,
    variant: c.variant,
    url: `/${path.relative(path.join(ROOT, "public"), patchPath).split(path.sep).join("/")}`,
    rect,
    rectNorm: { x: rect.x / c.W, y: rect.y / c.H, w: rect.w / c.W, h: rect.h / c.H },
    slot: { x: c.slot.x, y: c.slot.y, scale: c.slot.scale },
    /** Top-centre of the painted child in art pixels (speech bubbles hang from here). */
    anchor: { x: Math.round(anchor.x), y: Math.round(anchor.y) },
    art: { width: c.W, height: c.H },
  };
  writeFileSync(path.join(outDir, `${c.name}.json`), JSON.stringify(meta, null, 2));
  const preview = await sharp(base).composite([{ input: patch, left: rect.x, top: rect.y }]).png().toBuffer();
  await sharp(preview).extract({ left: c.rect.x, top: c.rect.y, width: c.rect.w, height: c.rect.h }).png().toFile(path.join(WORK, `${c.name}.preview.png`));
  console.log(`imported ${c.name}: patch ${rect.w}×${rect.h} at (${rect.x},${rect.y}) → ${meta.url}`);
  console.log(`preview: work/patches/${c.name}.preview.png`);
}

/**
 * export → OpenAI image edit → import. gpt-image-1 takes the scene crop as the image to edit,
 * the character as a second reference image, and a mask whose transparent pixels mark the paint area.
 */
async function generate(slug: string, targetId: string, variantArg?: string) {
  const key = envKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set — add it to .env (never commit it) and run again.");
  const c = await context(slug, targetId, variantArg);
  await exportCrop(slug, targetId, variantArg);
  const refPath = path.join(ROOT, flag("ref", "public/demo/example-character.webp"));
  const size = 1024;
  const crop = await sharp(path.join(WORK, `${c.name}.crop.png`)).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();
  // OpenAI mask: alpha 0 where the model may paint, opaque elsewhere.
  const paint = await sharp(maskSvg(c)).resize(size, size).extractChannel(0).raw().toBuffer();
  const alpha = Buffer.alloc(size * size);
  for (let i = 0; i < alpha.length; i++) alpha[i] = paint[i]! > 128 ? 0 : 255;
  const mask = await sharp(crop).ensureAlpha().removeAlpha().joinChannel(alpha, { raw: { width: size, height: size, channels: 1 } }).png().toBuffer();
  const ref = await sharp(refPath).resize({ width: size, height: size, fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
  const prompt = `${c.prompt} The first image is the scene to edit; the second image is the character reference (do not copy its background).`;
  const call = async (model: string, fidelity: boolean) => {
    const form = new FormData();
    form.append("model", model);
    form.append("image[]", new Blob([new Uint8Array(crop)], { type: "image/png" }), "scene.png");
    form.append("image[]", new Blob([new Uint8Array(ref)], { type: "image/png" }), "character.png");
    form.append("mask", new Blob([new Uint8Array(mask)], { type: "image/png" }), "mask.png");
    form.append("prompt", prompt);
    form.append("size", `${size}x${size}`);
    form.append("quality", flag("quality", "low"));
    if (fidelity) form.append("input_fidelity", "high");
    form.append("n", "1");
    console.log(`calling OpenAI images/edits (${model}${fidelity ? ", input_fidelity=high" : ""})…`);
    const res = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
    const json = (await res.json()) as { data?: Array<{ b64_json?: string }>; error?: { message?: string; param?: string; code?: string } };
    return { ok: res.ok && Boolean(json.data?.[0]?.b64_json), status: res.status, json };
  };
  const requested = flag("model", "gpt-image-2");
  let attempt = await call(requested, requested === "gpt-image-1");
  if (!attempt.ok && /input_fidelity/i.test(attempt.json.error?.message ?? attempt.json.error?.param ?? "")) attempt = await call(requested, false);
  if (!attempt.ok && requested !== "gpt-image-1" && /model|not found|does not exist|access|permission|verif/i.test(attempt.json.error?.message ?? "")) {
    console.log(`${requested} unavailable (${attempt.json.error?.message}); falling back to gpt-image-1`);
    attempt = await call("gpt-image-1", true);
    if (!attempt.ok && /input_fidelity/i.test(attempt.json.error?.message ?? "")) attempt = await call("gpt-image-1", false);
  }
  if (!attempt.ok) throw new Error(`OpenAI error ${attempt.status}: ${attempt.json.error?.message ?? "unknown"}`);
  const out = Buffer.from(attempt.json.data![0]!.b64_json!, "base64");
  const editedPath = path.join(WORK, `${c.name}.edited.png`);
  await sharp(out).resize(c.rect.w, c.rect.h, { kernel: "lanczos3" }).png().toFile(editedPath);
  console.log(`edited crop saved: work/patches/${c.name}.edited.png`);
  await importPatch(slug, targetId, c.variant, editedPath);
}

async function main() {
  const [cmd, slug, targetId, variant, edited] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (cmd === "export" && slug && targetId) return exportCrop(slug, targetId, variant);
  if (cmd === "import" && slug && targetId && variant && edited) return importPatch(slug, targetId, variant, edited);
  if (cmd === "generate" && slug && targetId) return generate(slug, targetId, variant);
  console.error("usage:\n  slot-patch export <slug> <targetId> [A|B]\n  slot-patch import <slug> <targetId> <A|B> <edited.png> [--threshold=28] [--feather=6] [--out=public/demo/patches] [--no-clip]\n  slot-patch generate <slug> <targetId> [A|B] [--ref=path] [--quality=high|medium|low]");
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

export {};
