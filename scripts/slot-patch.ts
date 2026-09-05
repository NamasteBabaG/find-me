/**
 * Slot patches — painting a child INTO a pre-rendered world, from the command line.
 *
 * The maths lives in src/services/generation/patch.ts and the authoring helpers
 * in src/services/generation/authoring.ts, both shared with the production
 * pipeline, so a patch made here and a patch made for a paying customer go
 * through exactly the same steps. See docs/SPRITE_PATCHES.md.
 *
 *   npx tsx scripts/slot-patch.ts export beach sandcastle A [--window-factor=7]
 *     → work/patches/beach-sandcastle-A.crop.png   (give this to the image model)
 *       work/patches/beach-sandcastle-A.mask.png   (where it may paint)
 *       work/patches/beach-sandcastle-A.json       (rect, slot, prompt)
 *
 *   npx tsx scripts/slot-patch.ts import beach sandcastle A path/to/edited.png [--threshold=28] [--outer=2.2] [--inner=1.15] [--grow=3.6] [--keep=0.2] [--feather=6] [--out=public/demo/patches] [--preview-dir=work/patches]
 *     → <out>/beach-sandcastle-A.webp  (transparent patch: only what changed)
 *       <out>/beach-sandcastle-A.json  (rect, hitRect and head anchor — the tap contract)
 *       <preview-dir>/beach-sandcastle-A.preview.png
 *
 *   npx tsx scripts/slot-patch.ts generate beach sandcastle A [--ref=public/demo/example-character.webp] [--quality=medium] [--pose="..."] [--tries=3]
 *     → export + OpenAI images/edits + import, in one go. Needs OPENAI_API_KEY.
 *
 *   npx tsx scripts/slot-patch.ts diagnose beach sandcastle A [path/to/edited.png] [the same extraction flags as import]
 *     → why a render was rejected, in numbers: the extracted alpha's height
 *       against the height asked for, shape, and how far from the spot. Costs
 *       nothing — it re-reads a render that was already paid for
 *       (work/patches/<name>.edited.png by default).
 *
 * `import` and `diagnose` read the extraction flags through one parser, so
 * they cannot disagree about a render; a flag neither knows is an error.
 */
import sharp from "sharp";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { childProblem, diffToPatch, paintMask, type PatchResult } from "../src/services/generation/patch";
import { cropOf, parseDiffOptions, slotOf, writePatch, writePreview, type SlotInfo } from "../src/services/generation/authoring";
import { OpenAiAvatarProvider } from "../src/infra/generation/openai";
import { OpenAiPatchJudge } from "../src/infra/generation/judge";

export { cropOf, slotOf, writePatch, writePreview, type SlotInfo };

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

/** The flags every command may carry besides the extraction knobs. */
const COMMON_FLAGS = ["out", "preview-dir", "pose", "window-factor", "units", "ref", "quality", "patch-quality", "model", "judge-model", "rpm", "tries", "name"];

/** The slot as the scripts see it: the window factor and the units are command-line knobs. */
function slotFromFlags(slug: string, targetId: string, variantArg: string | undefined) {
  const factor = Number(flag("window-factor", "7"));
  // "model": the height the prompt names is in the provider's 1024px space (the
  // fix). "art": the art's own number, the baseline that was shipped until it
  // was fixed — kept only so a comparison can reproduce it.
  const units = flag("units", "model");
  if (units !== "model" && units !== "art") throw new Error(`--units takes model or art, got "${units}"`);
  return slotOf(slug, targetId, variantArg, { pose: flag("pose", "") || undefined, windowFactor: factor, outputPx: units === "model" ? 1024 : undefined });
}

async function exportCrop(slug: string, targetId: string, variantArg?: string) {
  const c = slotFromFlags(slug, targetId, variantArg);
  mkdirSync(WORK, { recursive: true });
  writeFileSync(path.join(WORK, `${c.name}.crop.png`), await cropOf(c));
  await sharp(paintMask(c.ctx, c.art, c.slot)).png().toFile(path.join(WORK, `${c.name}.mask.png`));
  writeFileSync(
    path.join(WORK, `${c.name}.json`),
    JSON.stringify(
      { slug, targetId, variant: c.variant, slot: { x: c.slot.x, y: c.slot.y, scale: c.slot.scale }, rect: c.ctx.rect, windowFactor: c.ctx.windowFactor, art: c.art, childPx: c.ctx.childPx, promptChildPx: c.promptChildPx, prompt: c.prompt },
      null,
      2,
    ),
  );
  console.log(`exported ${c.name}: crop ${c.ctx.rect.w}x${c.ctx.rect.h} at (${c.ctx.rect.x},${c.ctx.rect.y}); child ~${c.ctx.childPx}px tall in the art, ${c.promptChildPx}px in the prompt`);
  console.log(`\nPrompt:\n${c.prompt}\n`);
  console.log(`Files: work/patches/${c.name}.crop.png  work/patches/${c.name}.mask.png`);
}

async function importPatch(slug: string, targetId: string, variantArg: string | undefined, editedPath: string): Promise<PatchResult> {
  const options = parseDiffOptions(process.argv, COMMON_FLAGS);
  const c = slotFromFlags(slug, targetId, variantArg);
  const outDir = path.join(ROOT, flag("out", "public/demo/patches"));
  const previewDir = path.join(ROOT, flag("preview-dir", "work/patches"));
  const originalCrop = await cropOf(c);
  const patch = await diffToPatch({ originalCrop, editedCrop: readFileSync(editedPath), ctx: c.ctx, art: c.art, slot: c.slot, options });
  // diffToPatch no longer throws when nothing changed (in production that is an
  // ordinary rejection), so importing by hand has to say so itself — here the
  // overwhelmingly likely cause is passing the wrong file.
  if (patch.largest === 0) throw new Error(`${editedPath} changed nothing in the crop — is this the edited version of the exported crop?`);
  const url = await writePatch(c, patch, outDir);
  const preview = await writePreview(c, patch, previewDir);
  console.log(`imported ${c.name}: patch ${patch.width}x${patch.height} -> ${url}`);
  console.log(`preview: ${path.relative(ROOT, preview)}`);
  return patch;
}

/** export → OpenAI images/edits → import, retrying until the painted blob is plausibly a child. */
async function generate(slug: string, targetId: string, variantArg?: string) {
  parseDiffOptions(process.argv, COMMON_FLAGS);
  const key = envKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set — add it to .env (never commit it) and run again.");
  const c = slotFromFlags(slug, targetId, variantArg);
  const provider = new OpenAiAvatarProvider(key, { model: flag("model", "gpt-image-2"), quality: flag("quality", "medium"), patchQuality: flag("patch-quality", "") || undefined, perMinute: Number(flag("rpm", "5")) });
  const judge = new OpenAiPatchJudge(key, { model: flag("judge-model", "gpt-4o-mini") });
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
    if (edit.rawPng) writeFileSync(path.join(WORK, `${c.name}.raw.png`), edit.rawPng);
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
    // The same bar the pipeline applies. Without it this script accepted a boy
    // in jeans for one spot and a canoe with an arm for another — both the right
    // shape, neither the child — and those are exactly the patches a slot test
    // must not call a success.
    const verdict = await judge.judge({ patchPng: patch.webp, reference, childName: flag("name", "the child"), label: c.name });
    if (verdict.verdict === "bad") {
      console.log(`rejected by the judge: ${verdict.reason}`);
      continue;
    }
    if (verdict.verdict === "unknown") console.log(`(judge could not answer: ${verdict.reason})`);
    await importPatch(slug, targetId, c.variant, editedPath);
    console.log(`accepted (${patch.largest}px vs expected ~${patch.expected}px), ${(edit.costCents / 100).toFixed(3)} USD on ${edit.model}`);
    return;
  }
  throw new Error(`gave up after ${tries} attempts — try a simpler --pose or a different slot`);
}

/**
 * Read the numbers off a render we already have. No API call, no cost.
 *
 * What it measures is the alpha the extraction left, not the child the model
 * drew: a render whose child lost her hair to the threshold reads as short
 * here. So the labels say "extracted", and the scale that would match is
 * offered as an unverified number — the raw render, looked at, is the only
 * measure of what was painted.
 */
async function diagnose(slug: string, targetId: string, variantArg: string | undefined, editedArg: string | undefined) {
  const options = parseDiffOptions(process.argv, COMMON_FLAGS);
  const c = slotFromFlags(slug, targetId, variantArg);
  const editedPath = editedArg ? path.resolve(editedArg) : path.join(WORK, `${c.name}.edited.png`);
  if (!existsSync(editedPath)) throw new Error(`no render at ${path.relative(ROOT, editedPath)} — run "generate" first, or pass one`);
  const patch = await diffToPatch({ originalCrop: await cropOf(c), editedCrop: readFileSync(editedPath), ctx: c.ctx, art: c.art, slot: c.slot, options });
  const s = patch.shape;
  // Measured exactly as childProblem measures them, or this report talks the
  // author out of a slot the rule would have kept — and it is read far more
  // often than the rule is.
  const drift = Math.hypot(s.centerX - s.slotX, s.centerY - s.slotY) / Math.max(s.height, s.childPx);
  const askedWide = 0.75 * s.childPx;
  console.log(`${c.name}  ${path.relative(ROOT, editedPath)}`);
  if (Object.keys(options).length) console.log(`  extraction  ${JSON.stringify(options)}`);
  console.log(`  verdict     ${childProblem(patch) ?? "accepted"}`);
  console.log(`  extracted   ${Math.round(s.width)}x${Math.round(s.height)}px alpha, blob ${patch.largest}px   (what the extraction kept, not what was drawn)`);
  console.log(`  asked for   ~${s.childPx}px tall in the art (${c.promptChildPx}px in the prompt), blob ~${patch.expected}px   (slot scale ${c.slot.scale}, window ${c.ctx.rect.w}px at ${c.ctx.windowFactor}x)`);
  console.log(`  height      ${(s.height / s.childPx).toFixed(2)}x what was asked   (accepted between 0.45 and 2.20)`);
  console.log(`  shape       ${(s.width / Math.max(1, s.height)).toFixed(2)} wide:tall   (accepted below 1.60)`);
  console.log(`  across      ${(s.width / Math.max(1, askedWide)).toFixed(2)}x the ~${Math.round(askedWide)}px a child is here   (accepted between 0.38 and 1.40)`);
  console.log(`  pieces      ${((patch.largest / Math.max(1, patch.painted)) * 100).toFixed(0)}% of what was drawn is one body   (accepted above 95%)`);
  console.log(`  drift       ${drift.toFixed(2)} child-heights from the spot   (accepted below 2.50)`);
  const ratio = s.height / s.childPx;
  if (ratio < 0.45 || ratio > 2.2) {
    console.log(`  → the extracted alpha is ${ratio < 1 ? "smaller" : "larger"} than this slot asks for. perspectiveUnverified:`);
    console.log(`    the alpha alone cannot say whether the model painted a small child or the extraction lost`);
    console.log(`    part of a large one. Look at the raw render on the board before touching the slot.`);
    console.log(`    (scale ${(c.slot.scale * ratio).toFixed(3)} would match the alpha; now ${c.slot.scale})`);
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
  console.error(
    "usage:\n  slot-patch export <slug> <targetId> [A|B] [--window-factor=7]\n  slot-patch import <slug> <targetId> <A|B> <edited.png> [--threshold=28] [--feather=6] [--out=public/demo/patches] [--preview-dir=work/patches]\n  slot-patch diagnose <slug> <targetId> [A|B] [edited.png] [the same extraction flags]\n  slot-patch generate <slug> <targetId> [A|B] [--ref=path] [--quality=low|medium|high] [--tries=3]",
  );
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
