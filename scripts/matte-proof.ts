/**
 * Pass two on renders that were already paid for.
 *
 * Every cell of a harness run keeps its render (raw-crop.png) and the crop it
 * was made from (crop.png). This cuts the child out of each with the
 * provider's matte — the same extractChild the pipeline uses — measures the
 * result, puts it on the board and judges it in context. Nothing is
 * repainted, so the only new bills are the matte and the judge. It refuses to
 * start without a budget and reserves both before every cell.
 *
 *   npx tsx scripts/matte-proof.ts --run=work/placement/proof-1 --budget-cents=40 [--cells=newyork-bench-A,amazon-canoe-A] [--age=8] [--judge=on|off] [--judge-model=gpt-4o-mini]
 *   npx tsx scripts/matte-proof.ts --run=... --budget-cents=10 --rekey=matte-1 [--from=matte]   # key the saved answers again (free) into <cell>/matte-1/, judge only
 *   npx tsx scripts/matte-proof.ts --run=... --budget-cents=10 --into=matte-2    # buy pass two again (a changed prompt) into <cell>/matte-2/
 *
 * Output, per cell, under <cell>/matte/: matte.png (crop size), matte-1024.png
 * (the model's own), alpha.png, the patch, its preview, board-crop.png and
 * result.json; and <run>/matte-manifest.json for the run.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { OpenAiAvatarProvider, fitMatte } from "../src/infra/generation/openai";
import { IMAGE_EDIT_RESERVE_CENTS } from "../src/infra/generation/image-edit-reserve";
import { OpenAiPatchJudge } from "../src/infra/generation/judge";
import { childProblem, matteHint, matteToPatch, MATTE_VERSION } from "../src/services/generation/patch";
import { extractChild } from "../src/services/generation/extract";
import { chargeCents, slotOf, writePatch, writePreview } from "../src/services/generation/authoring";
import { boardComposite } from "../src/services/generation/board-composite";
import { envKey } from "./slot-patch";

const ROOT = process.cwd();
const flag = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const JUDGE_RESERVE_CENTS = 3;

interface Cell {
  id: string;
  identity: string;
  board: string;
  target: string;
  variant: string;
  quality: string;
  units: string;
  window: { x: number; y: number; w: number; h: number; factor: number };
  direction?: Record<string, string>;
}

async function main() {
  const key = envKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const budget = Number(flag("budget-cents", "0"));
  if (!(budget > 0)) throw new Error("Refusing to spend without --budget-cents=N");
  const run = path.resolve(ROOT, flag("run", ""));
  if (!flag("run", "") || !existsSync(run)) throw new Error("--run=<harness run dir> is required");
  const only = flag("cells", "").split(",").map((s) => s.trim()).filter(Boolean);
  const ageYears = flag("age", "") ? Number(flag("age", "")) : undefined;
  const judgeOn = flag("judge", "on") !== "off";
  const judgeModel = flag("judge-model", "gpt-4o-mini");
  // --rekey=<name>: no pass two is bought; the saved matte-1024.png is keyed again
  // by the current code and the result goes under <cell>/<name>/.
  const rekey = flag("rekey", "");
  // --into=<name>: where this pass's files go (default "matte"); a rekey goes under its own name.
  const into = rekey || flag("into", "matte");
  const provider = new OpenAiAvatarProvider(key, { model: flag("model", "gpt-image-2"), perMinute: Number(flag("rpm", "5")), tries: 1 });
  const judge = judgeOn ? new OpenAiPatchJudge(key, { model: judgeModel, tries: 1 }) : null;

  const manifestPath = path.join(run, into === "matte" ? "matte-manifest.json" : `matte-manifest-${into}.json`);
  const manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, "utf8")) as { spentCents: number; unknownCharges: string[]; cells: Array<Record<string, unknown>> })
    : { spentCents: 0, unknownCharges: [] as string[], cells: [] as Array<Record<string, unknown>> };
  let spent = manifest.spentCents;
  const write = (stopped: string | null) => writeFileSync(manifestPath, JSON.stringify({ ...manifest, budgetCents: budget, spentCents: Math.round(spent * 100) / 100, stopped, updatedAt: new Date().toISOString() }, null, 2));

  const identities = readdirSync(run).filter((d) => statSync(path.join(run, d)).isDirectory() && existsSync(path.join(run, d, "reference.judge.png")));
  let stopped: string | null = null;
  outer: for (const identity of identities) {
    const judgeReference = readFileSync(path.join(run, identity, "reference.judge.png"));
    for (const cellName of readdirSync(path.join(run, identity)).filter((d) => statSync(path.join(run, identity, d)).isDirectory())) {
      const dir = path.join(run, identity, cellName);
      if (!existsSync(path.join(dir, "raw-crop.png")) || !existsSync(path.join(dir, "cell.json"))) continue;
      if (only.length > 0 && !only.includes(cellName)) continue;
      if (manifest.cells.some((c) => c.id === `${identity}/${cellName}`)) continue;
      const cell = JSON.parse(readFileSync(path.join(dir, "cell.json"), "utf8")) as Cell;
      const reserve = (rekey ? 0 : IMAGE_EDIT_RESERVE_CENTS[cell.quality as "low" | "medium" | "high"] ?? IMAGE_EDIT_RESERVE_CENTS.high) + (judge ? JUDGE_RESERVE_CENTS : 0);
      if (spent + reserve > budget) {
        stopped = `budget: ${spent.toFixed(2)} spent, ${reserve.toFixed(2)} reserved for the next cell, ${budget} allowed`;
        console.warn(`stopping — ${stopped}`);
        break outer;
      }
      // The same slot the render was made for, from the same scene on disk.
      const c = slotOf(cell.board, cell.target, cell.variant, { windowFactor: cell.window.factor, outputPx: cell.units === "model" ? provider.patchOutputPx : undefined, ageYears, ...(cell.direction ?? {}) });
      const w = c.ctx.rect;
      if (w.x !== cell.window.x || w.y !== cell.window.y || w.w !== cell.window.w || w.h !== cell.window.h) throw new Error(`${cell.id}: the slot's window changed since the render (${JSON.stringify(w)} vs ${JSON.stringify(cell.window)}); the render no longer belongs to this scene`);
      const out = path.join(dir, into);
      mkdirSync(out, { recursive: true });
      const savedRaw = path.join(dir, flag("from", "matte"), "matte-1024.png");
      if (rekey && !existsSync(savedRaw)) continue;
      const originalCrop = readFileSync(path.join(dir, "crop.png"));
      const editedCrop = readFileSync(path.join(dir, "raw-crop.png"));
      const started = Date.now();
      const result: Record<string, unknown> = { id: cell.id, cell: cellName, identity, quality: cell.quality, startedAt: new Date().toISOString() };
      try {
        const meta = await sharp(editedCrop).metadata();
        const extracted = rekey
          ? { patch: await matteToPatch({ originalCrop, mattePng: await fitMatte(readFileSync(savedRaw), meta.width!, meta.height!), ctx: c.ctx, art: c.art, slot: c.slot }), method: "matte" as const, version: MATTE_VERSION, matte: undefined, diff: null }
          : await extractChild({ provider, originalCrop, editedCrop, ctx: c.ctx, art: c.art, slot: c.slot, hint: matteHint(c.slot), label: cell.id, quality: cell.quality });
        const patch = extracted.patch;
        if (rekey) writeFileSync(path.join(out, "matte.png"), await fitMatte(readFileSync(savedRaw), meta.width!, meta.height!));
        let matteCents = 0;
        if (extracted.matte) {
          const charge = chargeCents(extracted.matte, IMAGE_EDIT_RESERVE_CENTS[cell.quality as "low" | "medium" | "high"] ?? IMAGE_EDIT_RESERVE_CENTS.high);
          spent += charge.cents;
          matteCents = extracted.matte.costCents;
          if (charge.unknown) manifest.unknownCharges.push(`${cell.id}:matte`);
          writeFileSync(path.join(out, "matte.png"), extracted.matte.png);
          if (extracted.matte.rawPng) writeFileSync(path.join(out, "matte-1024.png"), extracted.matte.rawPng);
          if (extracted.matte.promptSent) writeFileSync(path.join(out, "matte-prompt-sent.txt"), extracted.matte.promptSent);
          result.matte = { model: extracted.matte.model, requestId: extracted.matte.providerRequestId ?? null, usage: extracted.matte.usage ?? null, costCents: extracted.matte.costCents, costUnknown: extracted.matte.costUnknown ?? false, inputFidelity: (extracted.matte as { inputFidelity?: string | null }).inputFidelity ?? null, durationMs: extracted.matte.durationMs };
        }
        const shape = childProblem(patch);
        Object.assign(result, {
          method: extracted.method,
          version: extracted.version,
          diff: extracted.diff,
          extraction: { largest: patch.largest, painted: patch.painted, expected: patch.expected, shape: patch.shape, geometry: patch.width ? patch.geometry : null, patchSize: { width: patch.width, height: patch.height } },
          shapeProblem: shape,
        });
        let verdictText = "unjudged";
        let judgeCents = 0;
        if (patch.width > 0) {
          await sharp(patch.webp).ensureAlpha().extractChannel(3).png().toFile(path.join(out, "alpha.png"));
          await writePatch(c, patch, out);
          await writePreview(c, patch, out);
        }
        if (!shape && judge) {
          const boardCrop = await boardComposite({ base: readFileSync(path.join(ROOT, "public", c.scene.art.base)), art: c.art, patch: patch.webp, rect: patch.geometry.rect, layer: c.slot.layer, flip: c.slot.flip });
          writeFileSync(path.join(out, "board-crop.png"), boardCrop);
          const verdict = await judge.judge({ patchPng: patch.webp, reference: judgeReference, childName: identity, ageYears, label: cell.id, boardCrop });
          const charge = chargeCents(verdict, JUDGE_RESERVE_CENTS);
          spent += charge.cents;
          judgeCents = verdict.costCents;
          if (charge.unknown) {
            manifest.unknownCharges.push(`${cell.id}:judge`);
            stopped = "judge charge unknown; reserved and stopped before another call";
          }
          result.judge = verdict;
          verdictText = verdict.verdict;
        }
        result.costCents = Math.round((matteCents + judgeCents) * 100) / 100;
        console.log(`${cell.id}: ${extracted.method} → ${shape ? `rejected (${shape})` : verdictText} · ${(spent / 100).toFixed(3)} USD so far`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.error = message;
        if (/timed out|out of time/i.test(message)) {
          spent += reserve;
          manifest.unknownCharges.push(cell.id);
          stopped = `a call timed out with an unknown charge (${reserve} cents reserved for it)`;
        }
        console.error(`${cell.id}: ${message}`);
      }
      result.durationMs = Date.now() - started;
      writeFileSync(path.join(out, "result.json"), JSON.stringify(result, null, 2));
      manifest.cells.push(result);
      write(stopped);
      if (stopped) break outer;
    }
  }
  write(stopped);
  console.log(`spent ${(spent / 100).toFixed(4)} USD of ${(budget / 100).toFixed(2)}; unknown charges: ${manifest.unknownCharges.length}`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
