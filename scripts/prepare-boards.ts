/**
 * Get every board ready to receive a child.
 *
 * A world is "ready" when all six of its hiding spots (3 targets × 2 variants)
 * are places a child can actually be painted into: the window the model sees
 * contains something to hide behind, the child comes out the size of the people
 * around her, and the spot is not jammed against an edge. That is a property of
 * the scene data, not of any particular child, so it can be checked for free.
 *
 *   npx tsx scripts/prepare-boards.ts audit [slug…]
 *     → work/boards/<slug>.png  — the six windows with the paint area drawn
 *       work/boards/index.html  — all of them on one page
 *       a table of every spot, and what is wrong with it
 *
 *   npx tsx scripts/prepare-boards.ts generate [slug…] [--ref=public/demo/example-character.webp]
 *                                    [--variants=A|AB] [--quality=medium] [--tries=3] [--out=public/demo/patches]
 *     → a real patch per spot, plus the measured cost per spot. Needs OPENAI_API_KEY.
 */
import sharp, { type OverlayOptions } from "sharp";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { allScenes } from "../content/scenes";
import type { SceneDefinition } from "../src/domain/scene/schema";
import { childProblem, diffToPatch, paintMask } from "../src/services/generation/patch";
import { OpenAiAvatarProvider } from "../src/infra/generation/openai";
import { cropOf, envKey, slotOf, writePatch, writePreview, type SlotInfo } from "./slot-patch";

const ROOT = process.cwd();
const BOARDS = path.join(ROOT, "work", "boards");
const VARIANTS = ["A", "B"] as const;
const SCENES: SceneDefinition[] = allScenes();

function flag(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function slugsFrom(args: string[]): string[] {
  const asked = args.filter((a) => !a.startsWith("--"));
  const all = SCENES.filter((s) => s.active).map((s) => s.slug);
  if (asked.length === 0) return all;
  for (const s of asked) if (!all.includes(s)) throw new Error(`unknown or inactive world "${s}" (have: ${all.join(", ")})`);
  return asked;
}

// ── audit ────────────────────────────────────────────────────

interface SpotReport {
  name: string;
  childPx: number;
  /** How much of the window the child will fill — small means "hard to find". */
  fill: number;
  problems: string[];
}

/** Is this a place a child can be hidden well? */
function checkSpot(c: SlotInfo): SpotReport {
  const problems: string[] = [];
  const childPx = c.ctx.childPx;
  const fill = childPx / c.ctx.rect.h;
  // A child smaller than ~1.5% of the scene height is a pixel; bigger than ~10% is not hiding.
  const heightFraction = c.slot.scale;
  if (heightFraction < 0.015) problems.push(`child is only ${(heightFraction * 100).toFixed(1)}% of the scene height — too small to recognise`);
  if (heightFraction > 0.1) problems.push(`child is ${(heightFraction * 100).toFixed(1)}% of the scene height — too easy to spot`);
  // The window must be centred on the slot; if it was clamped, the slot is against an edge.
  const wantX = Math.round(c.slot.x * c.art.width - c.ctx.rect.w / 2);
  const wantY = Math.round(c.slot.y * c.art.height - c.ctx.rect.h / 2);
  const offX = Math.abs(wantX - c.ctx.rect.x);
  const offY = Math.abs(wantY - c.ctx.rect.y);
  if (offX > c.ctx.rect.w * 0.25 || offY > c.ctx.rect.h * 0.25) {
    problems.push(`slot is against an edge — the model sees ${offX || offY}px less context on one side`);
  }
  // The paint ellipse must sit inside the window with room for the shadow.
  const cx = c.slot.x * c.art.width - c.ctx.rect.x;
  const cy = c.slot.y * c.art.height - c.ctx.rect.y;
  const rx = childPx * 0.55;
  const ry = childPx * 0.8;
  if (cx - rx < 8 || cy - ry < 8 || cx + rx > c.ctx.rect.w - 8 || cy + ry > c.ctx.rect.h - 8) {
    problems.push("the paint area touches the edge of the window — nothing can occlude her there");
  }
  if (!c.target.slots.every((s) => s.hintZone)) problems.push("slot has no hint zone");
  return { name: c.name, childPx, fill, problems };
}

/** The six windows of one world, with the paint area drawn, as one sheet. */
async function contactSheet(slug: string): Promise<{ file: string; spots: SpotReport[] }> {
  const cols = 3;
  const cell = 320;
  const pad = 8;
  const labelH = 22;
  const spots: SpotReport[] = [];
  const tiles: OverlayOptions[] = [];
  const scene = SCENES.find((s) => s.slug === slug)!;
  let i = 0;
  for (const target of scene.targets) {
    for (const variant of VARIANTS) {
      const c = slotOf(slug, target.id, variant);
      spots.push(checkSpot(c));
      const crop = await cropOf(c);
      const cx = ((c.slot.x * c.art.width - c.ctx.rect.x) / c.ctx.rect.w) * cell;
      const cy = ((c.slot.y * c.art.height - c.ctx.rect.y) / c.ctx.rect.h) * cell;
      const rx = ((c.ctx.childPx * 0.55) / c.ctx.rect.w) * cell;
      const ry = ((c.ctx.childPx * 0.8) / c.ctx.rect.h) * cell;
      const overlay = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${cell + labelH}">` +
          `<rect x="0" y="0" width="${cell}" height="${labelH}" fill="#17162b"/>` +
          `<text x="6" y="15" font-family="monospace" font-size="12" fill="#ffffff">${target.id} · ${variant} · ${c.ctx.childPx}px</text>` +
          `<ellipse cx="${cx}" cy="${cy + labelH}" rx="${rx}" ry="${ry}" fill="none" stroke="#ff2d87" stroke-width="2" stroke-dasharray="5 4"/>` +
          `</svg>`,
      );
      const tile = await sharp(await sharp(crop).resize(cell, cell).png().toBuffer())
        .extend({ top: labelH, background: { r: 23, g: 22, b: 43, alpha: 1 } })
        .composite([{ input: overlay, top: 0, left: 0 }])
        .png()
        .toBuffer();
      tiles.push({ input: tile, left: pad + (i % cols) * (cell + pad), top: pad + Math.floor(i / cols) * (cell + labelH + pad) });
      i++;
    }
  }
  const rows = Math.ceil(i / cols);
  const width = pad + cols * (cell + pad);
  const height = pad + rows * (cell + labelH + pad);
  mkdirSync(BOARDS, { recursive: true });
  const file = path.join(BOARDS, `${slug}.png`);
  await sharp({ create: { width, height, channels: 3, background: { r: 240, g: 238, b: 233 } } }).composite(tiles).png().toFile(file);
  return { file, spots };
}

async function audit(slugs: string[]) {
  const rows: Array<{ slug: string; spots: SpotReport[] }> = [];
  for (const slug of slugs) {
    const { spots } = await contactSheet(slug);
    rows.push({ slug, spots });
    const bad = spots.filter((s) => s.problems.length > 0);
    console.log(`${bad.length === 0 ? "ok  " : "warn"} ${slug.padEnd(9)} ${spots.length} spots, child ${Math.min(...spots.map((s) => s.childPx))}–${Math.max(...spots.map((s) => s.childPx))}px` + (bad.length ? `, ${bad.length} to look at` : ""));
    for (const s of bad) for (const p of s.problems) console.log(`       ${s.name}: ${p}`);
  }
  const html = [
    `<!doctype html><meta charset="utf-8"><title>Boards</title>`,
    `<style>body{font:14px system-ui;background:#f0eee9;margin:0;padding:24px}h2{margin:24px 0 8px}img{max-width:100%;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.15)}p{color:#555;margin:4px 0 12px}</style>`,
    `<h1>Hiding spots — every world</h1>`,
    `<p>Each tile is the window the image model sees for one spot; the dashed ellipse is where it may paint the child.</p>`,
    ...rows.map((r) => {
      const problems = r.spots.flatMap((s) => s.problems.map((p) => `${s.name}: ${p}`));
      return `<h2>${r.slug}</h2>${problems.length ? `<p style="color:#b00">${problems.join("<br>")}</p>` : `<p>all six spots look placeable</p>`}<img src="${r.slug}.png" alt="${r.slug}">`;
    }),
  ].join("\n");
  writeFileSync(path.join(BOARDS, "index.html"), html);
  const total = rows.reduce((n, r) => n + r.spots.length, 0);
  const bad = rows.reduce((n, r) => n + r.spots.filter((s) => s.problems.length > 0).length, 0);
  console.log(`\n${total} spots across ${rows.length} worlds, ${bad} with something to look at`);
  console.log(`sheets: work/boards/index.html`);
}

// ── generate ─────────────────────────────────────────────────

async function generateAll(slugs: string[]) {
  const key = envKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set — add it to .env (never commit it) and run again.");
  const provider = new OpenAiAvatarProvider(key, { model: flag("model", "gpt-image-2"), quality: flag("quality", "medium"), perMinute: Number(flag("rpm", "5")) });
  const reference = readFileSync(path.join(ROOT, flag("ref", "public/demo/example-character.webp")));
  const variants = flag("variants", "A").toUpperCase().includes("B") ? VARIANTS : (["A"] as const);
  const outDir = path.join(ROOT, flag("out", "public/demo/patches"));
  const tries = Number(flag("tries", "3"));
  const only = flag("target", "");

  const results: Array<{ name: string; ok: boolean; cents: number; ms: number; attempts: number; model?: string; note?: string }> = [];
  for (const slug of slugs) {
    const scene = SCENES.find((s) => s.slug === slug)!;
    for (const target of scene.targets) {
      if (only && target.id !== only) continue;
      for (const variant of variants) {
        const c = slotOf(slug, target.id, variant);
        const started = Date.now();
        let cents = 0;
        let attempts = 0;
        let model: string | undefined;
        let note = "";
        let ok = false;
        const originalCrop = await cropOf(c);
        const mask = paintMask(c.ctx, c.art, c.slot);
        for (let attempt = 1; attempt <= tries && !ok; attempt++) {
          try {
            const edit = await provider.editSlotCrop({ crop: originalCrop, paintMask: mask, reference, prompt: c.prompt, label: c.name });
            // Keep what the model returned: tuning the isolation step should never cost another call.
            mkdirSync(path.join(ROOT, "work", "patches"), { recursive: true });
            writeFileSync(path.join(ROOT, "work", "patches", `${c.name}.edited.png`), edit.png);
            cents += edit.costCents;
            attempts += edit.attempts;
            model = edit.model;
            const patch = await diffToPatch({ originalCrop, editedCrop: edit.png, ctx: c.ctx, art: c.art, slot: c.slot });
            const problem = childProblem(patch);
            if (problem) {
              note = problem;
              continue;
            }
            await writePatch(c, patch, outDir);
            await writePreview(c, patch);
            ok = true;
            note = `${patch.width}x${patch.height}`;
          } catch (err) {
            note = err instanceof Error ? err.message.slice(0, 90) : String(err);
            attempts += 1;
          }
        }
        const ms = Date.now() - started;
        results.push({ name: c.name, ok, cents, ms, attempts, model, note });
        console.log(`${ok ? "ok  " : "FAIL"} ${c.name.padEnd(26)} ${(cents / 100).toFixed(3)} USD  ${attempts} call(s)  ${(ms / 1000).toFixed(0)}s  ${note}`);
      }
    }
  }

  const cents = results.reduce((n, r) => n + r.cents, 0);
  const good = results.filter((r) => r.ok).length;
  console.log(`\n${good}/${results.length} spots generated`);
  console.log(`cost ${(cents / 100).toFixed(2)} USD total, ${(cents / 100 / Math.max(1, results.length)).toFixed(3)} USD per spot (${results[0]?.model ?? "?"}, quality ${flag("quality", "medium")})`);
  console.log(`a 3-world game at 3 spots each ≈ ${((cents / 100 / Math.max(1, results.length)) * 9).toFixed(2)} USD of patches`);
  mkdirSync(BOARDS, { recursive: true });
  writeFileSync(path.join(BOARDS, "cost.json"), `${JSON.stringify({ at: new Date().toISOString(), quality: flag("quality", "medium"), results }, null, 2)}\n`);
  console.log(`per-spot cost recorded in work/boards/cost.json`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const slugs = slugsFrom(rest);
  if (cmd === "audit") return audit(slugs);
  if (cmd === "generate") return generateAll(slugs);
  console.error("usage:\n  prepare-boards audit [slug…]\n  prepare-boards generate [slug…] [--ref=path] [--variants=A|AB] [--quality=medium] [--tries=3]");
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
