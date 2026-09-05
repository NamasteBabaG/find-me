/**
 * Experiment 1: can the extraction keep more of the child without buying a
 * single render? Runs diffToPatch over renders that were already paid for,
 * with a small matrix of the knobs that already exist, and writes everything a
 * person needs to judge it on the board.
 *
 *   npx tsx scripts/extraction-matrix.ts --set=work/patch-quality/e1/set.json --out=work/patch-quality/e1 [--mode=grid|matrix] [--zoom=2]
 *
 * set.json:
 *   { "cases": [ { "id": "greatwall-lanterns-A", "slug": "greatwall", "target": "lanterns", "variant": "A",
 *                  "edited": "work/patches/greatwall-lanterns-A.edited.png", "role": "calibration" | "holdout",
 *                  "expected": "defect" | "good", "note": "...",
 *                  "boxes": { "face": [x0,y0,x1,y1], "hair": [...], "silhouette": [...] } } ] }
 *
 * `--mode=grid` writes each case's render with a labelled 32px grid, so the
 * boxes can be read off by eye and written into set.json (crop pixels).
 * `--mode=matrix` (the default) runs every combination and writes, per case:
 *   <id>.strip.png   the child's region at 2×: the raw render, the untouched
 *                    board, then every combination composited on the board —
 *                    where hair was lost, the board shows through instead of hair
 *   <id>.alpha.png   the same region with each combination's alpha tinted over
 *                    the raw render: exactly which drawn pixels were kept
 *   <combo>/…        the alpha and the on-board preview of each combination
 * plus matrix.json and matrix.md with the numbers.
 *
 * On the full window the eight results look identical, because a patch lands
 * on the very scenery it was cut from: the differences are at the child's
 * edge, and only a zoomed strip beside the raw render shows them.
 *
 * The boxes are a person's marking of what is visible in the RENDER, not the
 * alpha the engine produced: coverage is the share of the box the alpha keeps
 * opaque (≥128), spill the opaque alpha outside the silhouette box with a
 * two-pixel tolerance. Boxes are coarse; a number here ranks configurations on
 * the same picture, it does not certify one.
 *
 * Nothing here calls a model.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { childProblem, diffToPatch, type DiffOptions, type PatchResult } from "../src/services/generation/patch";
import { cropOf, slotOf, writePreview, type SlotInfo } from "../src/services/generation/authoring";

const ROOT = process.cwd();
const flag = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

type Box = [number, number, number, number];
interface Case {
  id: string;
  slug: string;
  target: string;
  variant: "A" | "B";
  edited: string;
  role: "calibration" | "holdout";
  expected: "defect" | "good";
  note?: string;
  boxes?: { face?: Box; hair?: Box; silhouette?: Box };
}

/** The matrix the review names: the knobs that exist, two values each, the current defaults included. */
const COMBOS: Array<{ key: string; options: DiffOptions }> = [];
for (const threshold of [28, 24]) for (const keep of [0.2, 0.1]) for (const feather of [6, 2]) COMBOS.push({ key: `t${threshold}-k${keep}-f${feather}`, options: { threshold, keep, feather } });
const BASELINE = "t28-k0.2-f6";

async function main() {
  const setPath = path.resolve(ROOT, flag("set", "work/patch-quality/e1/set.json"));
  const outDir = path.resolve(ROOT, flag("out", "work/patch-quality/e1"));
  const mode = flag("mode", "matrix");
  const zoom = Number(flag("zoom", "2"));
  const set = JSON.parse(readFileSync(setPath, "utf8")) as { cases: Case[] };
  mkdirSync(outDir, { recursive: true });

  if (mode === "grid") {
    const gridDir = path.join(outDir, "grid");
    mkdirSync(gridDir, { recursive: true });
    for (const k of set.cases) {
      const c = slotOf(k.slug, k.target, k.variant);
      const edited = await sharp(path.resolve(ROOT, k.edited)).resize(c.ctx.rect.w, c.ctx.rect.h, { fit: "cover" }).png().toBuffer();
      const file = path.join(gridDir, `${k.id}.grid.png`);
      writeFileSync(file, await withGrid(edited, c.ctx.rect.w, c.ctx.rect.h, 32));
      console.log(`${k.id}: ${path.relative(ROOT, file)} (${c.ctx.rect.w}x${c.ctx.rect.h}, slot at ${Math.round(c.slot.x * c.art.width - c.ctx.rect.x)},${Math.round(c.slot.y * c.art.height - c.ctx.rect.y)})`);
    }
    return;
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const k of set.cases) {
    const c = slotOf(k.slug, k.target, k.variant);
    const editedPath = path.resolve(ROOT, k.edited);
    if (!existsSync(editedPath)) throw new Error(`${k.id}: no render at ${k.edited}`);
    const original = await cropOf(c);
    const edited = readFileSync(editedPath);
    const editedFit = await sharp(edited).resize(c.ctx.rect.w, c.ctx.rect.h, { fit: "cover" }).png().toBuffer();
    // The recorded export, when there is one, says whether the slot moved since the render.
    const exportJson = path.join(ROOT, "work", "patches", `${c.name}.json`);
    let contextMismatch: string | null = null;
    if (existsSync(exportJson)) {
      const rec = JSON.parse(readFileSync(exportJson, "utf8")) as { rect?: { x: number; y: number; w: number; h: number }; slot?: { x: number; y: number; scale: number } };
      if (rec.rect && (rec.rect.x !== c.ctx.rect.x || rec.rect.y !== c.ctx.rect.y || rec.rect.w !== c.ctx.rect.w)) contextMismatch = `window was ${JSON.stringify(rec.rect)} at export, is ${JSON.stringify(c.ctx.rect)} now`;
      if (rec.slot && (rec.slot.x !== c.slot.x || rec.slot.y !== c.slot.y || rec.slot.scale !== c.slot.scale)) contextMismatch = `slot was ${JSON.stringify(rec.slot)} at export, is ${JSON.stringify({ x: c.slot.x, y: c.slot.y, scale: c.slot.scale })} now`;
    }
    const results: Array<{ combo: (typeof COMBOS)[number]; patch: PatchResult; preview: string | null; alpha: Buffer | null; box: Box | null }> = [];
    for (const combo of COMBOS) {
      const comboDir = path.join(outDir, combo.key);
      mkdirSync(comboDir, { recursive: true });
      const patch = await diffToPatch({ originalCrop: original, editedCrop: edited, ctx: c.ctx, art: c.art, slot: c.slot, options: combo.options });
      const verdict = childProblem(patch);
      const metrics = await measure(patch, c, k.boxes);
      let preview: string | null = null;
      let alpha: Buffer | null = null;
      let box: Box | null = null;
      if (patch.width > 0) {
        preview = await writePreview(c, patch, comboDir);
        alpha = await sharp(patch.webp).ensureAlpha().extractChannel(3).png().toBuffer();
        writeFileSync(path.join(comboDir, `${c.name}.alpha.png`), alpha);
        box = patchBox(patch, c);
      }
      results.push({ combo, patch, preview, alpha, box });
      rows.push({ id: k.id, role: k.role, expected: k.expected, combo: combo.key, baseline: combo.key === BASELINE, verdict, largest: patch.largest, painted: patch.painted, width: patch.shape.width, height: patch.shape.height, ...metrics, preview: preview ? path.relative(ROOT, preview) : null, contextMismatch });
    }
    // The region to look at: the union of every combination's patch, padded.
    const union = unionBox(results.map((r) => r.box).filter((b): b is Box => b !== null), c.ctx.rect.w, c.ctx.rect.h, 24);
    if (union) {
      const region = { left: union[0], top: union[1], width: union[2] - union[0], height: union[3] - union[1] };
      const tiles: Buffer[] = [];
      tiles.push(await tile(await sharp(editedFit).extract(region).toBuffer(), "raw render", zoom));
      tiles.push(await tile(await sharp(original).extract(region).toBuffer(), "board, untouched", zoom));
      const alphaTiles: Buffer[] = [await tile(await sharp(editedFit).extract(region).toBuffer(), "raw render", zoom)];
      for (const r of results) {
        if (!r.preview) {
          tiles.push(await tile(await sharp(original).extract(region).toBuffer(), `${r.combo.key}: nothing kept`, zoom));
          continue;
        }
        const verdict = childProblem(r.patch);
        tiles.push(await tile(await sharp(r.preview).extract(region).toBuffer(), `${r.combo.key}${verdict ? " ✗" : ""}`, zoom));
        alphaTiles.push(await tile(await tintAlpha(editedFit, r.alpha!, r.patch, c, region), `${r.combo.key}${verdict ? " ✗" : ""}`, zoom));
      }
      writeFileSync(path.join(outDir, `${k.id}.strip.png`), await sheet(tiles, 5));
      writeFileSync(path.join(outDir, `${k.id}.alpha.png`), await sheet(alphaTiles, 5));
    }
    console.log(`${k.id}: ${COMBOS.length} combinations${union ? "" : " (nothing kept by any)"}${contextMismatch ? ` — CONTEXT MISMATCH: ${contextMismatch}` : ""}`);
  }
  writeFileSync(path.join(outDir, "matrix.json"), JSON.stringify({ generatedAt: new Date().toISOString(), combos: COMBOS, baseline: BASELINE, rows }, null, 2));
  writeFileSync(path.join(outDir, "matrix.md"), table(rows));
  console.log(`\nwrote ${path.relative(ROOT, path.join(outDir, "matrix.md"))}`);
}

/** The patch's box in crop pixels. */
function patchBox(patch: PatchResult, c: SlotInfo): Box {
  const x = Math.round(patch.geometry.rect.x * c.art.width) - c.ctx.rect.x;
  const y = Math.round(patch.geometry.rect.y * c.art.height) - c.ctx.rect.y;
  return [x, y, x + patch.width, y + patch.height];
}

function unionBox(boxes: Box[], w: number, h: number, pad: number): Box | null {
  if (boxes.length === 0) return null;
  const x0 = Math.max(0, Math.min(...boxes.map((b) => b[0])) - pad);
  const y0 = Math.max(0, Math.min(...boxes.map((b) => b[1])) - pad);
  const x1 = Math.min(w, Math.max(...boxes.map((b) => b[2])) + pad);
  const y1 = Math.min(h, Math.max(...boxes.map((b) => b[3])) + pad);
  return [x0, y0, x1, y1];
}

/** The raw render with the kept alpha tinted magenta, cropped to the region. */
async function tintAlpha(editedFit: Buffer, alpha: Buffer, patch: PatchResult, c: SlotInfo, region: { left: number; top: number; width: number; height: number }): Promise<Buffer> {
  const box = patchBox(patch, c);
  // A magenta layer whose alpha is the patch's alpha, at 55% strength, placed where the patch sits in the crop.
  const { data, info } = await sharp(alpha).raw().toBuffer({ resolveWithObject: true });
  const rgba = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const a = data[i * info.channels]!;
    rgba[i * 4] = 255;
    rgba[i * 4 + 1] = 0;
    rgba[i * 4 + 2] = 229;
    rgba[i * 4 + 3] = Math.round(a * 0.55);
  }
  const magenta = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  // Two steps: sharp composites after it extracts, so the overlay has to land on the whole crop first.
  const tinted = await sharp(editedFit)
    .composite([{ input: magenta, left: Math.max(0, box[0]), top: Math.max(0, box[1]) }])
    .png()
    .toBuffer();
  return sharp(tinted).extract(region).png().toBuffer();
}

/** Coverage of the marked boxes by the alpha, and spill outside the silhouette. */
async function measure(patch: PatchResult, c: SlotInfo, boxes: Case["boxes"]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = { faceKept: null, hairKept: null, silhouetteKept: null, spill: null };
  if (!boxes || patch.width === 0) return out;
  const { data, info } = await sharp(patch.webp).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const [px, py] = patchBox(patch, c);
  const opaque = (x: number, y: number) => {
    const lx = x - px;
    const ly = y - py;
    if (lx < 0 || ly < 0 || lx >= info.width || ly >= info.height) return false;
    return data[ly * info.width + lx]! >= 128;
  };
  const kept = (box: Box) => {
    let n = 0;
    let hit = 0;
    for (let y = box[1]; y < box[3]; y++)
      for (let x = box[0]; x < box[2]; x++) {
        n++;
        if (opaque(x, y)) hit++;
      }
    return n ? hit / n : null;
  };
  if (boxes.face) out.faceKept = kept(boxes.face);
  if (boxes.hair) out.hairKept = kept(boxes.hair);
  if (boxes.silhouette) {
    out.silhouetteKept = kept(boxes.silhouette);
    const [x0, y0, x1, y1] = boxes.silhouette;
    let all = 0;
    let outside = 0;
    for (let ly = 0; ly < info.height; ly++) {
      for (let lx = 0; lx < info.width; lx++) {
        if (data[ly * info.width + lx]! < 128) continue;
        all++;
        const x = lx + px;
        const y = ly + py;
        if (x < x0 - 2 || x >= x1 + 2 || y < y0 - 2 || y >= y1 + 2) outside++;
      }
    }
    out.spill = all ? outside / all : null;
  }
  return out;
}

async function withGrid(png: Buffer, w: number, h: number, step: number): Promise<Buffer> {
  const lines: string[] = [];
  for (let x = 0; x <= w; x += step) lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="rgba(255,0,255,0.45)" stroke-width="1"/><text x="${x + 2}" y="10" font-size="9" fill="#ff00ff">${x}</text>`);
  for (let y = 0; y <= h; y += step) lines.push(`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="rgba(255,0,255,0.45)" stroke-width="1"/><text x="2" y="${y + 10}" font-size="9" fill="#ff00ff">${y}</text>`);
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${lines.join("")}</svg>`);
  return sharp(png).composite([{ input: svg }]).png().toBuffer();
}

/** A picture scaled up with a label bar above it. */
async function tile(png: Buffer, label: string, zoom: number): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  const w = (meta.width ?? 0) * zoom;
  const h = (meta.height ?? 0) * zoom;
  const scaled = await sharp(png).resize(w, h, { kernel: "nearest" }).png().toBuffer();
  const bar = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="24"><rect width="100%" height="100%" fill="#17162B"/><text x="6" y="17" font-size="13" font-family="Arial" fill="#fff">${label}</text></svg>`);
  return sharp({ create: { width: w, height: h + 24, channels: 3, background: "#17162B" } })
    .composite([{ input: bar, left: 0, top: 0 }, { input: scaled, left: 0, top: 24 }])
    .png()
    .toBuffer();
}

async function sheet(tiles: Buffer[], cols: number): Promise<Buffer> {
  const metas = await Promise.all(tiles.map((t) => sharp(t).metadata()));
  const w = Math.max(...metas.map((m) => m.width ?? 0));
  const h = Math.max(...metas.map((m) => m.height ?? 0));
  const rows = Math.ceil(tiles.length / cols);
  const gap = 6;
  return sharp({ create: { width: cols * (w + gap), height: rows * (h + gap), channels: 3, background: "#FBF8F2" } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * (w + gap), top: Math.floor(i / cols) * (h + gap) })))
    .png()
    .toBuffer();
}

function table(rows: Array<Record<string, unknown>>): string {
  const pct = (v: unknown) => (typeof v === "number" ? `${(v * 100).toFixed(0)}%` : "");
  const lines = ["| case | role | expected | combo | verdict | alpha | face | hair | silhouette | spill |", "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"];
  for (const r of rows) lines.push(`| ${r.id} | ${r.role} | ${r.expected} | ${r.combo}${r.baseline ? " (baseline)" : ""} | ${r.verdict ?? "accepted"} | ${r.width}×${r.height} | ${pct(r.faceKept)} | ${pct(r.hairKept)} | ${pct(r.silhouetteKept)} | ${pct(r.spill)} |`);
  return `${lines.join("\n")}\n`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
