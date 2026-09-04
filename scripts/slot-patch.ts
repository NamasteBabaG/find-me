/**
 * Slot patches — painting a child INTO a pre-rendered world, from the command line.
 *
 * The maths lives in src/services/generation/patch.ts and is shared with the
 * production pipeline, so a patch made here and a patch made for a paying
 * customer go through exactly the same steps. See docs/SPRITE_PATCHES.md.
 *
 *   npx tsx scripts/slot-patch.ts export beach sandcastle A
 *     → work/patches/beach-sandcastle-A.crop.png   (give this to the image model)
 *       work/patches/beach-sandcastle-A.mask.png   (where it may paint)
 *       work/patches/beach-sandcastle-A.json       (rect, slot, prompt)
 *
 *   npx tsx scripts/slot-patch.ts import beach sandcastle A path/to/edited.png [--threshold=28] [--outer=2.2] [--feather=6] [--grow=2.2] [--keep=0.12] [--out=public/demo/patches]
 *     → <out>/beach-sandcastle-A.webp  (transparent patch: only what changed)
 *       <out>/beach-sandcastle-A.json  (rect, hitRect and head anchor — the tap contract)
 *       work/patches/beach-sandcastle-A.preview.png
 *
 *   npx tsx scripts/slot-patch.ts generate beach sandcastle A [--ref=public/demo/example-character.webp] [--quality=medium] [--pose="..."] [--tries=3]
 *     → export + OpenAI images/edits + import, in one go. Needs OPENAI_API_KEY.
 *
 *   npx tsx scripts/slot-patch.ts diagnose beach sandcastle A [path/to/edited.png]
 *     → why a render was rejected, in numbers: painted height against the height
 *       asked for, shape, and how far from the spot. Costs nothing — it re-reads
 *       a render that was already paid for (work/patches/<name>.edited.png by
 *       default). A spot that is always rejected for height is usually not a bad
 *       model but a slot whose scale disagrees with the board's own perspective.
 */
import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BODY_TEMPLATES } from "../content/body-templates";
import { sceneBySlug } from "../src/services/scene-catalog.service";
import { childProblem, diffToPatch, paintMask, slotContext, slotPrompt, type PatchResult } from "../src/services/generation/patch";
import { OpenAiAvatarProvider } from "../src/infra/generation/openai";

const ROOT = process.cwd();
const WORK = path.join(ROOT, "work", "patches");

function flag(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

/** Scripts do not get Next's .env loading; read the one key we need without printing it. */
export function envKey(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return undefined;
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*(#.*)?$/);
    if (m && m[1] === name && m[2]) return m[2].trim();
  }
  return undefined;
}

/** Everything one hiding spot needs: the slot, the window, and the prompt. */
export function slotOf(slug: string, targetId: string, variantArg: string | undefined, pose?: string) {
  const scene = sceneBySlug(slug);
  const target = scene.targets.find((t) => t.id === targetId);
  if (!target) throw new Error(`unknown target "${targetId}" in "${slug}" (have: ${scene.targets.map((t) => t.id).join(", ")})`);
  const variant = (variantArg ?? "A").toUpperCase() === "B" ? "B" : "A";
  const slot = target.slots[variant === "A" ? 0 : 1] ?? target.slots[0];
  const art = { width: scene.art.width, height: scene.art.height };
  const ctx = slotContext(art, slot);
  const prompt = slotPrompt({
    mission: target.mission.en.replace("{name}", "the child"),
    bodyLabel: BODY_TEMPLATES[target.bodyTemplate]?.label.en,
    childPx: ctx.childPx,
    pose,
  });
  return { scene, target, variant: variant as "A" | "B", slot, art, ctx, prompt, name: `${slug}-${targetId}-${variant}` };
}

export type SlotInfo = ReturnType<typeof slotOf>;

/** The window the model sees, as a PNG. */
export async function cropOf(c: SlotInfo): Promise<Buffer> {
  const base = path.join(ROOT, "public", c.scene.art.base);
  return sharp(base).extract({ left: c.ctx.rect.x, top: c.ctx.rect.y, width: c.ctx.rect.w, height: c.ctx.rect.h }).png().toBuffer();
}

async function exportCrop(slug: string, targetId: string, variantArg?: string) {
  const c = slotOf(slug, targetId, variantArg, flag("pose", "") || undefined);
  mkdirSync(WORK, { recursive: true });
  writeFileSync(path.join(WORK, `${c.name}.crop.png`), await cropOf(c));
  await sharp(paintMask(c.ctx, c.art, c.slot)).png().toFile(path.join(WORK, `${c.name}.mask.png`));
  writeFileSync(
    path.join(WORK, `${c.name}.json`),
    JSON.stringify({ slug, targetId, variant: c.variant, slot: { x: c.slot.x, y: c.slot.y, scale: c.slot.scale }, rect: c.ctx.rect, art: c.art, childPx: c.ctx.childPx, prompt: c.prompt }, null, 2),
  );
  console.log(`exported ${c.name}: crop ${c.ctx.rect.w}x${c.ctx.rect.h} at (${c.ctx.rect.x},${c.ctx.rect.y}); child ~${c.ctx.childPx}px tall`);
  console.log(`\nPrompt:\n${c.prompt}\n`);
  console.log(`Files: work/patches/${c.name}.crop.png  work/patches/${c.name}.mask.png`);
}

/** Write a finished patch and its tap contract next to each other. */
export async function writePatch(c: SlotInfo, patch: PatchResult, outDir: string): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  const patchPath = path.join(outDir, `${c.name}.webp`);
  writeFileSync(patchPath, patch.webp);
  const url = `/${path.relative(path.join(ROOT, "public"), patchPath).split(path.sep).join("/")}`;
  const meta = {
    slug: c.scene.slug,
    targetId: c.target.id,
    variant: c.variant,
    url,
    rect: { x: Math.round(patch.geometry.rect.x * c.art.width), y: Math.round(patch.geometry.rect.y * c.art.height), w: patch.width, h: patch.height },
    rectNorm: patch.geometry.rect,
    /** The painted child's own footprint: this is the hitbox. */
    hitRectNorm: patch.geometry.hitRect,
    /** Top-centre of the head: bubbles and hints point here. */
    anchorNorm: patch.geometry.anchor,
    slot: { x: c.slot.x, y: c.slot.y, scale: c.slot.scale },
    art: c.art,
  };
  writeFileSync(path.join(outDir, `${c.name}.json`), `${JSON.stringify(meta, null, 2)}\n`);
  return url;
}

/** The patch composited back onto the world, cropped to the window — the quick look. */
export async function writePreview(c: SlotInfo, patch: PatchResult): Promise<string> {
  mkdirSync(WORK, { recursive: true });
  const base = path.join(ROOT, "public", c.scene.art.base);
  const left = Math.round(patch.geometry.rect.x * c.art.width);
  const top = Math.round(patch.geometry.rect.y * c.art.height);
  const composed = await sharp(base).composite([{ input: patch.webp, left, top }]).png().toBuffer();
  const out = path.join(WORK, `${c.name}.preview.png`);
  await sharp(composed).extract({ left: c.ctx.rect.x, top: c.ctx.rect.y, width: c.ctx.rect.w, height: c.ctx.rect.h }).png().toFile(out);
  return out;
}

async function importPatch(slug: string, targetId: string, variantArg: string | undefined, editedPath: string): Promise<PatchResult> {
  const c = slotOf(slug, targetId, variantArg, flag("pose", "") || undefined);
  const outDir = path.join(ROOT, flag("out", "public/demo/patches"));
  const originalCrop = await cropOf(c);
  const patch = await diffToPatch({
    originalCrop,
    editedCrop: readFileSync(editedPath),
    ctx: c.ctx,
    art: c.art,
    slot: c.slot,
    options: {
      threshold: Number(flag("threshold", "28")),
      outer: Number(flag("outer", "2.2")),
      grow: Number(flag("grow", "3.6")),
      keep: Number(flag("keep", "0.2")),
      feather: Number(flag("feather", "6")),
    },
  });
  // diffToPatch no longer throws when nothing changed (in production that is an
  // ordinary rejection), so importing by hand has to say so itself — here the
  // overwhelmingly likely cause is passing the wrong file.
  if (patch.largest === 0) throw new Error(`${editedPath} changed nothing in the crop — is this the edited version of the exported crop?`);
  const url = await writePatch(c, patch, outDir);
  const preview = await writePreview(c, patch);
  console.log(`imported ${c.name}: patch ${patch.width}x${patch.height} -> ${url}`);
  console.log(`preview: ${path.relative(ROOT, preview)}`);
  return patch;
}

/** export → OpenAI images/edits → import, retrying until the painted blob is plausibly a child. */
async function generate(slug: string, targetId: string, variantArg?: string) {
  const key = envKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set — add it to .env (never commit it) and run again.");
  const c = slotOf(slug, targetId, variantArg, flag("pose", "") || undefined);
  const provider = new OpenAiAvatarProvider(key, { model: flag("model", "gpt-image-2"), quality: flag("quality", "medium"), perMinute: Number(flag("rpm", "5")) });
  const reference = readFileSync(path.join(ROOT, flag("ref", "public/demo/example-character.webp")));
  const originalCrop = await cropOf(c);
  const mask = paintMask(c.ctx, c.art, c.slot);
  const tries = Number(flag("tries", "3"));
  for (let attempt = 1; attempt <= tries; attempt++) {
    console.log(`attempt ${attempt}/${tries} — ${c.name}`);
    const edit = await provider.editSlotCrop({ crop: originalCrop, paintMask: mask, reference, prompt: c.prompt, label: c.name });
    mkdirSync(WORK, { recursive: true });
    const editedPath = path.join(WORK, `${c.name}.edited.png`);
    writeFileSync(editedPath, edit.png);
    const patch = await diffToPatch({ originalCrop, editedCrop: edit.png, ctx: c.ctx, art: c.art, slot: c.slot }).catch((e: Error) => e);
    if (patch instanceof Error) {
      console.log(`rejected: ${patch.message}`);
      continue;
    }
    const problem = childProblem(patch);
    if (problem) {
      console.log(`rejected: ${problem}`);
      continue;
    }
    await importPatch(slug, targetId, c.variant, editedPath);
    console.log(`accepted (${patch.largest}px vs expected ~${patch.expected}px), ${(edit.costCents / 100).toFixed(3)} USD on ${edit.model}`);
    return;
  }
  throw new Error(`gave up after ${tries} attempts — try a simpler --pose or a different slot`);
}

/** Read the numbers off a render we already have. No API call, no cost. */
async function diagnose(slug: string, targetId: string, variantArg: string | undefined, editedArg: string | undefined) {
  const c = slotOf(slug, targetId, variantArg, flag("pose", "") || undefined);
  const editedPath = editedArg ? path.resolve(editedArg) : path.join(WORK, `${c.name}.edited.png`);
  if (!existsSync(editedPath)) throw new Error(`no render at ${path.relative(ROOT, editedPath)} — run "generate" first, or pass one`);
  const options = {
    threshold: Number(flag("threshold", "28")),
    outer: Number(flag("outer", "2.2")),
    inner: Number(flag("inner", "1.15")),
    grow: Number(flag("grow", "3.6")),
    keep: Number(flag("keep", "0.2")),
  };
  const patch = await diffToPatch({ originalCrop: await cropOf(c), editedCrop: readFileSync(editedPath), ctx: c.ctx, art: c.art, slot: c.slot, options });
  const s = patch.shape;
  const drift = Math.hypot(s.centerX - s.slotX, s.centerY - s.slotY) / s.childPx;
  console.log(`${c.name}  ${path.relative(ROOT, editedPath)}`);
  console.log(`  verdict     ${childProblem(patch) ?? "accepted"}`);
  console.log(`  painted     ${Math.round(s.width)}x${Math.round(s.height)}px, blob ${patch.largest}px`);
  console.log(`  asked for   ~${s.childPx}px tall, blob ~${patch.expected}px   (slot scale ${c.slot.scale})`);
  console.log(`  height      ${(s.height / s.childPx).toFixed(2)}x what was asked   (accepted between 0.45 and 2.20)`);
  console.log(`  shape       ${(s.width / Math.max(1, s.height)).toFixed(2)} wide:tall   (accepted below 1.60)`);
  console.log(`  drift       ${drift.toFixed(2)} child-heights from the spot   (accepted below 1.60)`);
  // The fix for a height rejection is almost never another roll.
  const ratio = s.height / s.childPx;
  if (ratio < 0.45 || ratio > 2.2) {
    console.log(`  → the model painted a person ${ratio < 1 ? "smaller" : "larger"} than this slot asks for.`);
    console.log(`    If it keeps doing that, the board's perspective disagrees with the slot:`);
    console.log(`    scale ${(c.slot.scale * ratio).toFixed(3)} would match what it painted (now ${c.slot.scale}).`);
  }
}

async function main() {
  const [cmd, slug, targetId, variant, edited] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (cmd === "export" && slug && targetId) return exportCrop(slug, targetId, variant);
  if (cmd === "diagnose" && slug && targetId) return diagnose(slug, targetId, variant, edited);
  if (cmd === "import" && slug && targetId && variant && edited) {
    await importPatch(slug, targetId, variant, edited);
    return;
  }
  if (cmd === "generate" && slug && targetId) return generate(slug, targetId, variant);
  console.error("usage:\n  slot-patch export <slug> <targetId> [A|B]\n  slot-patch import <slug> <targetId> <A|B> <edited.png> [--threshold=28] [--feather=6] [--out=public/demo/patches]\n  slot-patch generate <slug> <targetId> [A|B] [--ref=path] [--quality=low|medium|high] [--tries=3]");
  process.exit(1);
}

if (process.argv[1] && path.basename(process.argv[1]) === "slot-patch.ts") {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
