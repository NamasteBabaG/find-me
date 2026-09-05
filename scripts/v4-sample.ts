/**
 * A visual-approval sample for the hiding-spot prompt (audit finding Q03).
 *
 * One example is not evidence. This paints a fixed sample — several identity
 * sheets across the hard boards (snow, water, space, a dark doorway, a dense
 * crowd) — composes every result on its board, and writes a manifest that
 * ties each picture to the prompt version, model, judge, cost and verdict,
 * so a reviewer approves pictures against versions, not against memory.
 *
 * It spends money, so it refuses to start without a budget, and stops at it.
 *
 *   npx tsx scripts/v4-sample.ts --sheets=work/sheets --budget-cents=300 [--quality=low]
 *          [--boards=antarctica:ice,underwater:coral,beyondstars:lander,giantlibrary:doorway,nightcarnival:mask]
 *          [--variant=A] [--out=work/v4-sample]
 *
 *   work/sheets/            one identity sheet PNG per identity (consented, rights held): noa.png, yuval.png, …
 *   work/v4-sample/         <identity>/<board>-<target>-<variant>.preview.png + .webp + manifest.json
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OpenAiAvatarProvider } from "../src/infra/generation/openai";
import { OpenAiPatchJudge } from "../src/infra/generation/judge";
import { PROMPT_VERSION, childProblem, diffToPatch, paintMask } from "../src/services/generation/patch";
import { cropOf, envKey, slotOf, writePatch, writePreview } from "./slot-patch";

const ROOT = path.resolve(__dirname, "..");
const flag = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;

/** Boards that have caught the model out: snow, water, space, a dark doorway, a dense night crowd. */
const DEFAULT_BOARDS = "antarctica:ice,underwater:coral,beyondstars:lander,giantlibrary:doorway,nightcarnival:mask";

async function main() {
  const key = envKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const budget = Number(flag("budget-cents", "0"));
  if (!(budget > 0)) throw new Error("Refusing to spend without --budget-cents=N (the sample stops when it is reached)");
  const sheetsDir = path.resolve(ROOT, flag("sheets", "work/sheets"));
  if (!existsSync(sheetsDir)) throw new Error(`no identity sheets at ${sheetsDir}`);
  const sheets = readdirSync(sheetsDir).filter((f) => /\.(png|webp|jpe?g)$/i.test(f));
  if (sheets.length === 0) throw new Error(`no identity sheets in ${sheetsDir}`);
  const boards = flag("boards", DEFAULT_BOARDS).split(",").map((s) => s.trim()).filter(Boolean);
  const variant = flag("variant", "A");
  const quality = flag("quality", "low");
  const outDir = path.resolve(ROOT, flag("out", "work/v4-sample"));
  mkdirSync(outDir, { recursive: true });

  const provider = new OpenAiAvatarProvider(key, { model: flag("model", "gpt-image-2"), quality, patchQuality: quality, perMinute: Number(flag("rpm", "5")) });
  const judge = new OpenAiPatchJudge(key, { model: flag("judge-model", "gpt-4o-mini") });

  const manifest: Array<Record<string, unknown>> = [];
  let spent = 0;
  const write = () =>
    writeFileSync(
      path.join(outDir, "manifest.json"),
      JSON.stringify({ promptVersion: PROMPT_VERSION, quality, variant, budgetCents: budget, spentCents: Math.round(spent * 100) / 100, generatedAt: new Date().toISOString(), renders: manifest }, null, 2),
    );

  outer: for (const sheetFile of sheets) {
    const identity = path.parse(sheetFile).name;
    const reference = readFileSync(path.join(sheetsDir, sheetFile));
    for (const board of boards) {
      const [slug, targetId] = board.split(":");
      if (!slug || !targetId) throw new Error(`--boards entries are slug:target, got "${board}"`);
      if (spent >= budget) {
        console.warn(`budget of ${budget} cents reached after ${manifest.length} renders — stopping`);
        break outer;
      }
      const c = slotOf(slug, targetId, variant);
      const name = `${identity}/${c.name}`;
      const crop = await cropOf(c);
      const mask = paintMask(c.ctx, c.art, c.slot);
      const started = Date.now();
      try {
        const edit = await provider.editSlotCrop({ crop, paintMask: mask, reference, prompt: c.prompt, label: name });
        spent += edit.costCents;
        const patch = await diffToPatch({ originalCrop: crop, editedCrop: edit.png, ctx: c.ctx, art: c.art, slot: c.slot });
        const shape = childProblem(patch);
        const verdict = shape ? null : await judge.judge({ patchPng: patch.webp, reference, childName: identity, label: name });
        if (verdict) spent += verdict.costCents;
        const dir = path.join(outDir, identity);
        mkdirSync(dir, { recursive: true });
        const preview = shape ? null : await writePreview(c, patch);
        const patchPath = shape ? null : await writePatch(c, patch, dir);
        manifest.push({
          identity,
          board: slug,
          target: targetId,
          variant,
          slot: c.slot.id,
          promptVersion: PROMPT_VERSION,
          model: edit.model,
          judgeModel: verdict?.model ?? null,
          shapeProblem: shape,
          judgeVerdict: verdict?.verdict ?? null,
          judgeReason: verdict?.reason ?? null,
          costCents: edit.costCents + (verdict?.costCents ?? 0),
          durationMs: Date.now() - started,
          preview,
          patch: patchPath,
          /** Filled in by a person, on the board, at full size and on a phone. */
          approved: null,
          note: "",
        });
        console.log(`${name}: ${shape ? `rejected (${shape})` : `${verdict?.verdict ?? "unjudged"} — ${verdict?.reason ?? ""}`} · ${(spent / 100).toFixed(2)} USD so far`);
      } catch (err) {
        manifest.push({ identity, board: slug, target: targetId, variant, error: err instanceof Error ? err.message : String(err) });
        console.error(`${name}: ${err instanceof Error ? err.message : err}`);
      }
      write();
    }
  }
  write();
  console.log(`\n${manifest.length} renders, ${(spent / 100).toFixed(2)} USD, manifest at ${path.join(outDir, "manifest.json")}`);
  console.log("Open each preview on the board, at full size and on a phone, and fill in `approved` and `note` in the manifest.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
