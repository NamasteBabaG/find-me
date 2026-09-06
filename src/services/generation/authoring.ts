import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BODY_TEMPLATES } from "../../../content/body-templates";
import { sceneBySlug } from "../scene-catalog.service";
import { expressionFor, modelSpaceHeight, slotContext, slotPrompt, type DiffOptions, type PatchResult } from "./patch";

/**
 * Authoring a hiding spot from the command line: the same slot, window, prompt
 * and patch maths the pipeline uses, plus the files a person looks at.
 *
 * Shared by scripts/slot-patch.ts, scripts/v4-sample.ts, scripts/game-status.ts
 * and the tests, so a patch made by hand and a patch made for a customer go
 * through exactly the same steps — and so the tests can exercise the tooling.
 *
 * Every file written here takes an explicit directory. The preview used to be
 * written to one shared path per slot, and two identities sampled on the same
 * spot pointed their manifest at the same picture, the second overwriting the
 * first; the "best-looking arm" was being judged on the wrong render.
 */

const ROOT = process.cwd();

export interface SlotOfOptions {
  pose?: string;
  /** The context window as a multiple of the child's height; the pipeline's default is 7. */
  windowFactor?: number;
  /**
   * The square size the image model receives and returns. The prompt states the
   * child's height in that space. Undefined means "the crop's own pixels" — the
   * baseline that was shipped until the units were fixed, kept so a comparison
   * can still produce it.
   */
  outputPx?: number;
  /** An experiment's art direction for the spot; see SlotPromptInput. */
  wardrobe?: string;
  action?: string;
  expression?: string;
}

/** Everything one hiding spot needs: the slot, the window, and the prompt. */
export function slotOf(slug: string, targetId: string, variantArg: string | undefined, options: SlotOfOptions = {}) {
  const scene = sceneBySlug(slug);
  const target = scene.targets.find((t) => t.id === targetId);
  if (!target) throw new Error(`unknown target "${targetId}" in "${slug}" (have: ${scene.targets.map((t) => t.id).join(", ")})`);
  const variant = (variantArg ?? "A").toUpperCase() === "B" ? "B" : "A";
  const slot = target.slots[variant === "A" ? 0 : 1] ?? target.slots[0];
  const art = { width: scene.art.width, height: scene.art.height };
  const ctx = slotContext(art, slot, { windowFactor: options.windowFactor });
  // The height the prompt names is in the pixels the model will actually see.
  const promptChildPx = modelSpaceHeight(ctx.childPx, ctx.rect.h, options.outputPx);
  // The same prompt the pipeline sends, so a render here predicts a render there.
  const body = BODY_TEMPLATES[target.bodyTemplate];
  const prompt = slotPrompt({
    mission: target.mission.en.replace("{name}", "the child"),
    bodyLabel: body?.label.en,
    childPx: promptChildPx,
    pose: options.pose,
    place: scene.name.en,
    placeNote: scene.tagline.en,
    expression: options.expression ?? target.expression ?? expressionFor(body?.pose),
    wardrobe: options.wardrobe ?? scene.wardrobe,
    action: options.action ?? target.action,
  });
  return { scene, target, variant: variant as "A" | "B", slot, art, ctx, prompt, promptChildPx, name: `${slug}-${targetId}-${variant}` };
}

export type SlotInfo = ReturnType<typeof slotOf>;

/** The window the model sees, as a PNG. */
export async function cropOf(c: SlotInfo): Promise<Buffer> {
  const base = path.join(ROOT, "public", c.scene.art.base);
  return sharp(base).extract({ left: c.ctx.rect.x, top: c.ctx.rect.y, width: c.ctx.rect.w, height: c.ctx.rect.h }).png().toBuffer();
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

/** Where a slot's preview lands inside a directory. */
export function previewPath(c: Pick<SlotInfo, "name">, outDir: string): string {
  return path.join(outDir, `${c.name}.preview.png`);
}

/** The patch composited back onto the world, cropped to the window — the quick look. */
export async function writePreview(c: SlotInfo, patch: PatchResult, outDir: string): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  const base = path.join(ROOT, "public", c.scene.art.base);
  const left = Math.round(patch.geometry.rect.x * c.art.width);
  const top = Math.round(patch.geometry.rect.y * c.art.height);
  const composed = await sharp(base).composite([{ input: patch.webp, left, top }]).png().toBuffer();
  const out = previewPath(c, outDir);
  await sharp(composed).extract({ left: c.ctx.rect.x, top: c.ctx.rect.y, width: c.ctx.rect.w, height: c.ctx.rect.h }).png().toFile(out);
  return out;
}

/** The extraction knobs a command line may set, and nothing else. */
export const DIFF_FLAGS = ["threshold", "outer", "inner", "grow", "keep", "feather", "tone", "solidify"] as const;

/**
 * One reading of the extraction flags for every command.
 *
 * `diagnose` used to read `--inner` and swallow `--feather`; `import` did the
 * reverse. A flag that one path honoured and the other ignored made two
 * commands disagree about the same render without a word of warning. Now both
 * read the same list, an unknown `--flag` is an error, and a value that is
 * not a number is an error too.
 */
export function parseDiffOptions(argv: readonly string[], allow: readonly string[] = []): DiffOptions {
  const options: DiffOptions = {};
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    const name = eq < 0 ? a.slice(2) : a.slice(2, eq);
    const value = eq < 0 ? "" : a.slice(eq + 1);
    if (allow.includes(name)) continue;
    if (!(DIFF_FLAGS as readonly string[]).includes(name)) throw new Error(`unknown flag --${name} (extraction flags: ${DIFF_FLAGS.map((f) => `--${f}`).join(", ")})`);
    if (name === "tone" || name === "solidify") {
      if (value !== "true" && value !== "false") throw new Error(`--${name} takes true or false`);
      options[name] = value === "true";
      continue;
    }
    const n = Number(value);
    if (value === "" || !Number.isFinite(n)) throw new Error(`--${name} needs a number, got "${value}"`);
    (options as Record<string, number | boolean>)[name] = n;
  }
  return options;
}

/** What identifies a sampling run: the code and the configuration hash. */
export interface RunIdentity {
  commit: string;
  configHash: string;
}

/**
 * A resumed run has to be the same run. `--append` used to load the previous
 * cells and spend and carry on under whatever the command line now said, so a
 * changed sheet, board list or judge could sit next to old cells under a new
 * heading. Refuse before anything is written or paid for, and say what differs.
 */
export function assertSameRun(prior: RunIdentity, current: RunIdentity): void {
  const differences: string[] = [];
  if (prior.commit !== current.commit) differences.push(`commit ${prior.commit} → ${current.commit}`);
  if (prior.configHash !== current.configHash) differences.push(`config ${prior.configHash.slice(0, 8)} → ${current.configHash.slice(0, 8)}`);
  if (differences.length) throw new Error(`cannot resume into a different run (${differences.join(", ")}); start a new --out directory`);
}
