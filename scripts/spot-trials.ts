/**
 * Targeted renders for a handful of hiding spots (8 September 2026): the
 * same painter, pass two, shape guard, composite and judge chain a game
 * runs, on one identity sheet, with every call reserved against the round's
 * one durable ledger before it is made. Nothing touches the database.
 *
 *   npx tsx scripts/spot-trials.ts --sheet=<private sheet.png> --name=<child> --age=8 \
 *     --spots=sydney/lifeguard,paris/awning --out=work/.../trials --budget-dir=work/.../budget --limit-cents=500 \
 *     [--quality=medium] [--matte-quality=low] [--repeat=1]
 *
 * Per trial it writes the crop, the mask, the prompt as sent, the raw render,
 * every pass-two answer, the extracted patch, the composite the judge saw and
 * a JSON with the shape verdict, the judges' checks and every cost and
 * request id. Stops on the first unknown charge.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { GenerationBudget } from "./generation-budget";

for (const line of readFileSync(path.resolve(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*(#.*)?$/.exec(line);
  if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = (m[2] ?? "").trim();
}
function flag(name: string, fallback = ""): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main() {
  const sheetPath = flag("sheet"), name = flag("name"), age = Number(flag("age", "8"));
  const spots = flag("spots").split(",").filter(Boolean);
  const out = flag("out"), budgetDir = flag("budget-dir"), limit = Number(flag("limit-cents", "500"));
  const quality = flag("quality", "medium"), matteQuality = flag("matte-quality", "low"), repeat = Number(flag("repeat", "1"));
  if (!sheetPath || !name || !spots.length || !out || !budgetDir) throw new Error("--sheet, --name, --spots, --out and --budget-dir are required");
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  mkdirSync(out, { recursive: true });
  const sheet = readFileSync(sheetPath);

  const { OpenAiAvatarProvider, prepareSlotEdit } = await import("../src/infra/generation/openai");
  const { OpenAiPatchJudge } = await import("../src/infra/generation/judge");
  const { boardJudgeReserveCents } = await import("../src/infra/generation/board-verdict");
  const { IMAGE_EDIT_RESERVE_CENTS } = await import("../src/infra/generation/image-edit-reserve");
  const reserveFor = (q: string) => IMAGE_EDIT_RESERVE_CENTS[(q === "low" || q === "high" ? q : "medium") as "low" | "medium" | "high"];
  const { slotOf, cropOf } = await import("../src/services/generation/authoring");
  const { childProblem, matteHint, paintMask, visibleGeometry } = await import("../src/services/generation/patch");
  const { extractChild } = await import("../src/services/generation/extract");
  const { boardComposite } = await import("../src/services/generation/board-composite");
  const { recipeOf } = await import("../src/services/generation/slot-patches");

  const provider = new OpenAiAvatarProvider(apiKey, { model: process.env.GENERATION_MODEL ?? "gpt-image-2", quality: "medium", patchQuality: quality, tries: 1 });
  const judge = new OpenAiPatchJudge(apiKey, { policy: (process.env.JUDGE_POLICY as "screen" | "chain" | "strong" | undefined) ?? "screen", timeoutMs: Number(flag("timeout-ms", "180000")) });
  const budget = new GenerationBudget(budgetDir, limit, { round: "judge-placement-20260908" });
  console.log(`budget: ${budget.spent.toFixed(2)} of ${limit} cents already spent in this round`);

  for (const spot of spots) {
    const [slug, targetId] = spot.split("/") as [string, string];
    for (let n = 1; n <= repeat; n++) {
      const info = slotOf(slug, targetId, "A", { ageYears: age, outputPx: provider.patchOutputPx });
      const dir = path.join(out, `${slug}-${targetId}-${n}`);
      mkdirSync(dir, { recursive: true });
      const crop = await cropOf(info);
      const mask = paintMask(info.ctx, info.art, info.slot);
      const prompt = info.prompt.replace("the child", name);
      writeFileSync(path.join(dir, "crop.png"), crop);
      writeFileSync(path.join(dir, "mask.png"), await sharp(mask).png().toBuffer());
      const wire = await prepareSlotEdit({ crop, paintMask: mask, reference: sheet, prompt, label: spot });
      writeFileSync(path.join(dir, "prompt.txt"), wire.promptSent);
      const record: Record<string, unknown> = { spot, n, sceneVersion: info.scene.version, slot: { x: info.slot.x, y: info.slot.y, scale: info.slot.scale, layer: info.slot.layer, contract: info.slot.placement?.contract ?? null }, promptChildPx: info.promptChildPx };
      try {
        // Pass one.
        const edit = await budget.run(`paint:${spot}:${n}`, reserveFor(quality), () => provider.editSlotCrop({ crop, paintMask: mask, reference: sheet, prompt, label: spot, quality }));
        writeFileSync(path.join(dir, "render-raw.png"), edit.rawPng ?? edit.png);
        writeFileSync(path.join(dir, "render.png"), edit.png);
        record.paint = { costCents: edit.costCents, requestId: edit.providerRequestId, model: edit.model, usage: edit.usage };
        // Pass two, through the same extraction as the game.
        let matteN = 0;
        const extracted = await extractChild({
          provider: { matteSlotCrop: (req) => budget.run(`matte:${spot}:${n}:${++matteN}`, reserveFor(matteQuality), () => provider.matteSlotCrop(req)) },
          originalCrop: crop, editedCrop: edit.png, ctx: info.ctx, art: info.art, slot: info.slot, hint: matteHint(info.slot), label: spot, reference: sheet, quality: matteQuality,
          onMatte: async (m) => { writeFileSync(path.join(dir, `matte-${matteN}.png`), m.rawPng ?? m.png); },
        });
        const patch = extracted.patch;
        record.extraction = { method: extracted.method, version: extracted.version, matteCalls: extracted.matteAttempts.map((m) => ({ costCents: m.costCents, requestId: m.providerRequestId, problem: m.problem ?? null })), renderProblem: extracted.renderProblem ?? null, extractionProblem: extracted.extractionProblem ?? null, occluderShift: extracted.occluder?.mean ?? null, unchanged: patch.unchanged ?? null, occluderGap: patch.occluderGap ?? null };
        const shape = extracted.renderProblem ?? (extracted.extractionProblem ? `extraction: ${extracted.extractionProblem}` : childProblem(patch));
        record.shape = { problem: shape, width: patch.width, height: patch.height, geometry: patch.geometry, contract: patch.shape.contract ?? null };
        if (patch.width > 0) writeFileSync(path.join(dir, "patch.webp"), patch.webp);
        if (!shape) {
          const scene = info.scene;
          const base = readFileSync(path.join(process.cwd(), "public", scene.art.base));
          const fg = scene.art.foreground ? readFileSync(path.join(process.cwd(), "public", scene.art.foreground)) : undefined;
          if (fg && info.slot.layer === "behindForeground") {
            const px = { left: Math.round(patch.geometry.rect.x * info.art.width), top: Math.round(patch.geometry.rect.y * info.art.height) };
            const fgAtRect = await sharp(fg).extract({ left: px.left, top: px.top, width: patch.width, height: patch.height }).png().toBuffer();
            const seen = await visibleGeometry(patch, fgAtRect, info.art);
            record.visible = { hiddenFraction: seen.hiddenFraction, hitRect: seen.geometry.hitRect, anchor: seen.geometry.anchor };
          }
          const composite = await boardComposite({ base, foreground: fg, art: info.art, patch: patch.webp, rect: patch.geometry.rect, layer: info.slot.layer, flip: info.slot.flip });
          writeFileSync(path.join(dir, "composite.png"), composite);
          const judged = await budget.run(`judge:${spot}:${n}`, boardJudgeReserveCents(name), () => judge.judge({ patchPng: patch.webp, reference: sheet, childName: name, ageYears: age, label: spot, boardCrop: composite, recipe: recipeOf(info.slot, info.target) }));
          const { wireImages, ...forJson } = judged;
          for (const [i, img] of (wireImages ?? []).entries()) writeFileSync(path.join(dir, `judge-image-${i + 1}.png`), img);
          record.judge = { ...forJson, reviews: forJson.reviews?.map(({ wireImages: _w, ...r }) => r) };
          console.log(`${spot} #${n}: ${judged.verdict} (${judged.policy}) ${Object.entries(judged.checks ?? {}).filter(([, v]) => v !== "pass").map(([k, v]) => `${k}=${v}`).join(" ")} — ${judged.reason.slice(0, 140)}`);
        } else {
          console.log(`${spot} #${n}: refused before the judge — ${shape}`);
        }
      } catch (err) {
        record.error = err instanceof Error ? err.message : String(err);
        console.error(`${spot} #${n}: ${record.error}`);
      }
      writeFileSync(path.join(dir, "trial.json"), JSON.stringify(record, null, 2));
      if (budget.held) { console.error("budget held: an unresolved request; stopping"); return; }
    }
  }
  console.log(`budget: ${budget.spent.toFixed(2)} of ${limit} cents spent in this round`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
