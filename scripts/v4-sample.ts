/**
 * A controlled sample of the hiding-spot prompt: several identities across a
 * few boards, every render tied to the code, prompt, art, reference and knobs
 * that made it, and every failure kept with its evidence.
 *
 * One cell = one identity on one hiding spot, one provider call. Its directory
 * holds what went in (crop, mask, the prompt as sent), what came back (the
 * model's own 1024px output and the same fitted to the crop), what the
 * extraction made of it (alpha, patch, the patch on the board), and cell.json
 * with the numbers, the verdicts, and the questions a person answers. A
 * rejected cell keeps all of that too: the rejection is what the sample is
 * for. The manifest ties the run to a commit, a config hash, and the hashes
 * of every board and reference it used.
 *
 * It spends money, so it refuses to start without a budget, reserves the next
 * call's cost before making it, asks the provider for a single attempt per
 * cell, stops on a timeout (whose charge is unknown), and marks a cell the
 * provider served from another model as not comparable.
 *
 *   npx tsx scripts/v4-sample.ts --sheets=work/patch-quality/sheets --out=work/patch-quality/e2/arm-b/repeat-1 --budget-cents=22
 *          [--boards=greatwall:lanterns,sydney:surfboards,amazon:canoe,giantlibrary:doorway] [--variant=A]
 *          [--quality=low] [--model=gpt-image-2] [--window-factor=7] [--units=model|art]
 *          [--reference=sheet|head] [--art-direction=work/patch-quality/art-direction.json]
 *          [--arm=B] [--repeat=1] [--rpm=5] [--judge=on|off] [--append]
 *
 *   work/patch-quality/sheets/   one identity sheet PNG per identity (consented, rights held): noa.png, dana.png, …
 *   --reference=head             cut the head (hair, ears, chin, no body) from the sheet's portrait and send that instead
 *   --art-direction=<json>       { "<slug>": { "wardrobe": "...", "action": "...", "expression": "..." }, "<slug>/<target>": {...} }
 *
 * Nothing here is written under public/, and the out directory should stay
 * under work/ (git-ignored): the pictures are of real children.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { OpenAiAvatarProvider } from "../src/infra/generation/openai";
import { OpenAiPatchJudge } from "../src/infra/generation/judge";
import { faceWindow } from "../src/infra/generation/avatar-cut";
import { PROMPT_VERSION, childProblem, diffToPatch, paintMask } from "../src/services/generation/patch";
import { cropOf, slotOf, writePatch, writePreview } from "../src/services/generation/authoring";
import { envKey } from "./slot-patch";

const ROOT = process.cwd();
const flag = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const has = (name: string) => process.argv.includes(`--${name}`);
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** The four boards the review chose: a partial child, a beach in a jacket, open water, a dark doorway. */
const DEFAULT_BOARDS = "greatwall:lanterns,sydney:surfboards,amazon:canoe,giantlibrary:doorway";

/** What one call is likely to cost, in cents, so the budget is reserved before the call, not counted after it. */
const RESERVE_CENTS: Record<string, number> = { low: 2.5, medium: 8, high: 20 };
const JUDGE_RESERVE_CENTS = 0.4;

interface ArtDirection {
  wardrobe?: string;
  action?: string;
  expression?: string;
}

/** The questions a person answers per cell (the review, §9). Null until answered. */
const MANUAL = { approved: null, rawChildOk: null, identityOk: null, faceHairKept: null, backgroundClean: null, occlusionNatural: null, wardrobeOk: null, expressionOk: null, tapWorks: null, note: "" };

async function main() {
  const key = envKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const budget = Number(flag("budget-cents", "0"));
  if (!(budget > 0)) throw new Error("Refusing to spend without --budget-cents=N (the sample stops before it is exceeded)");
  if (!flag("out", "")) throw new Error("--out=<dir> is required: every run gets its own directory, so nothing is ever overwritten");
  const outDir = path.resolve(ROOT, flag("out", ""));
  if (existsSync(outDir) && readdirSync(outDir).length > 0 && !has("append")) throw new Error(`${outDir} is not empty; pass --append to resume into it`);
  const sheetsDir = path.resolve(ROOT, flag("sheets", "work/patch-quality/sheets"));
  if (!existsSync(sheetsDir)) throw new Error(`no identity sheets at ${sheetsDir}`);
  const sheets = readdirSync(sheetsDir)
    .filter((f) => /\.(png|webp|jpe?g)$/i.test(f))
    .sort();
  if (sheets.length === 0) throw new Error(`no identity sheets in ${sheetsDir}`);
  const boards = flag("boards", DEFAULT_BOARDS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const variant = flag("variant", "A");
  const quality = flag("quality", "low");
  const model = flag("model", "gpt-image-2");
  const windowFactor = Number(flag("window-factor", "7"));
  const units = flag("units", "model");
  if (units !== "model" && units !== "art") throw new Error(`--units takes model or art, got "${units}"`);
  const referenceKind = flag("reference", "sheet");
  if (referenceKind !== "sheet" && referenceKind !== "head") throw new Error(`--reference takes sheet or head, got "${referenceKind}"`);
  const judgeOn = flag("judge", "on") !== "off";
  const artDirectionPath = flag("art-direction", "");
  const artDirection: Record<string, ArtDirection> = artDirectionPath ? (JSON.parse(readFileSync(path.resolve(ROOT, artDirectionPath), "utf8")) as Record<string, ArtDirection>) : {};
  const tries = Number(flag("tries", "1"));
  mkdirSync(outDir, { recursive: true });

  const provider = new OpenAiAvatarProvider(key, { model, quality, patchQuality: quality, perMinute: Number(flag("rpm", "5")), tries });
  const judge = judgeOn ? new OpenAiPatchJudge(key, { model: flag("judge-model", "gpt-4o-mini") }) : null;
  const commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
  const config = { promptVersion: PROMPT_VERSION, quality, model, variant, windowFactor, units, reference: referenceKind, artDirection: artDirectionPath || null, tries, judge: judgeOn, arm: flag("arm", ""), repeat: Number(flag("repeat", "1")) };
  const configHash = sha256(Buffer.from(JSON.stringify(config)));

  const cells: Array<Record<string, unknown>> = [];
  let spent = 0;
  let stopped: string | null = null;
  const manifestPath = path.join(outDir, "manifest.json");
  // Resume: a cell that already has its json is done.
  if (has("append") && existsSync(manifestPath)) {
    const prior = JSON.parse(readFileSync(manifestPath, "utf8")) as { cells?: Array<Record<string, unknown>>; spentCents?: number };
    cells.push(...(prior.cells ?? []));
    spent = prior.spentCents ?? 0;
  }
  const artHashes: Record<string, string> = {};
  const referenceHashes: Record<string, string> = {};
  const startedAt = new Date().toISOString();
  const write = () =>
    writeFileSync(
      manifestPath,
      JSON.stringify({ commit, configHash, config, budgetCents: budget, spentCents: Math.round(spent * 100) / 100, stopped, startedAt, updatedAt: new Date().toISOString(), artHashes, referenceHashes, cells }, null, 2),
    );

  const reserve = (RESERVE_CENTS[quality] ?? RESERVE_CENTS.high!) + (judge ? JUDGE_RESERVE_CENTS : 0);

  outer: for (const sheetFile of sheets) {
    const identity = path.parse(sheetFile).name;
    const sheet = readFileSync(path.join(sheetsDir, sheetFile));
    const identityDir = path.join(outDir, identity);
    mkdirSync(identityDir, { recursive: true });
    const reference = referenceKind === "head" ? await headReference(sheet) : sheet;
    writeFileSync(path.join(identityDir, `reference.${referenceKind}.png`), reference);
    referenceHashes[identity] = sha256(reference);
    for (const board of boards) {
      const [slug, targetId] = board.split(":");
      if (!slug || !targetId) throw new Error(`--boards entries are slug:target, got "${board}"`);
      const cellId = `${identity}/${slug}-${targetId}-${variant}`;
      if (cells.some((c) => c.id === cellId)) continue;
      if (spent + reserve > budget) {
        stopped = `budget: ${spent.toFixed(2)} spent, ${reserve.toFixed(2)} reserved for the next call, ${budget} allowed`;
        console.warn(`stopping — ${stopped}`);
        break outer;
      }
      const direction: ArtDirection = { ...(artDirection[slug] ?? {}), ...(artDirection[`${slug}/${targetId}`] ?? {}) };
      const c = slotOf(slug, targetId, variant, { windowFactor, outputPx: units === "model" ? provider.patchOutputPx : undefined, ...direction });
      const cellDir = path.join(identityDir, `${slug}-${targetId}-${variant}`);
      mkdirSync(cellDir, { recursive: true });
      const crop = await cropOf(c);
      const mask = paintMask(c.ctx, c.art, c.slot);
      const artFile = path.join(ROOT, "public", c.scene.art.base);
      artHashes[slug] ??= sha256(readFileSync(artFile));
      writeFileSync(path.join(cellDir, "crop.png"), crop);
      await sharp(mask).png().toFile(path.join(cellDir, "mask.png"));
      writeFileSync(path.join(cellDir, "prompt.txt"), c.prompt);
      const files: Record<string, string | null> = { crop: "crop.png", mask: "mask.png", prompt: "prompt.txt" };
      const cell: Record<string, unknown> = {
        id: cellId,
        identity,
        board: slug,
        target: targetId,
        variant,
        startedAt: new Date().toISOString(),
        slot: { x: c.slot.x, y: c.slot.y, scale: c.slot.scale },
        window: { ...c.ctx.rect, factor: c.ctx.windowFactor },
        childPx: c.ctx.childPx,
        promptChildPx: c.promptChildPx,
        units,
        artHash: artHashes[slug],
        referenceHash: referenceHashes[identity],
        direction,
        promptVersion: PROMPT_VERSION,
        requestedModel: model,
        quality,
        files,
        manual: { ...MANUAL },
      };
      const started = Date.now();
      let judgeCost = 0;
      try {
        const edit = await provider.editSlotCrop({ crop, paintMask: mask, reference, prompt: c.prompt, label: cellId, quality });
        spent += edit.costCents;
        Object.assign(cell, {
          model: edit.model,
          nonComparable: edit.model !== model || undefined,
          requestId: edit.providerRequestId ?? null,
          usage: edit.usage ?? null,
          editCostCents: edit.costCents,
          providerAttempts: edit.attempts,
          promptSent: edit.promptSent ?? null,
        });
        if (edit.promptSent) {
          writeFileSync(path.join(cellDir, "prompt-sent.txt"), edit.promptSent);
          files.promptSent = "prompt-sent.txt";
        }
        if (edit.rawPng) {
          writeFileSync(path.join(cellDir, "raw-1024.png"), edit.rawPng);
          files.raw1024 = "raw-1024.png";
        }
        writeFileSync(path.join(cellDir, "raw-crop.png"), edit.png);
        files.rawCrop = "raw-crop.png";
        const patch = await diffToPatch({ originalCrop: crop, editedCrop: edit.png, ctx: c.ctx, art: c.art, slot: c.slot });
        const shape = childProblem(patch);
        Object.assign(cell, {
          extraction: { largest: patch.largest, painted: patch.painted, expected: patch.expected, shape: patch.shape, geometry: patch.width ? patch.geometry : null, patchSize: { width: patch.width, height: patch.height } },
          shapeProblem: shape,
        });
        if (patch.width > 0) {
          await sharp(patch.webp).ensureAlpha().extractChannel(3).png().toFile(path.join(cellDir, "alpha.png"));
          await writePatch(c, patch, cellDir);
          await writePreview(c, patch, cellDir);
          Object.assign(files, { alpha: "alpha.png", patch: `${c.name}.webp`, geometry: `${c.name}.json`, preview: `${c.name}.preview.png` });
        }
        let verdictText = "unjudged";
        if (!shape && judge) {
          const verdict = await judge.judge({ patchPng: patch.webp, reference, childName: identity, label: cellId });
          spent += verdict.costCents;
          judgeCost = verdict.costCents;
          cell.judge = { model: verdict.model ?? null, verdict: verdict.verdict, reason: verdict.reason, costCents: verdict.costCents };
          verdictText = verdict.verdict;
        }
        cell.costCents = Math.round((edit.costCents + judgeCost) * 100) / 100;
        console.log(`${cellId}: ${shape ? `rejected (${shape})` : verdictText}${cell.nonComparable ? " [served by another model: not comparable]" : ""} · ${(spent / 100).toFixed(3)} USD so far`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const unknownCost = /timed out|out of time/i.test(message);
        if (unknownCost) spent += reserve;
        Object.assign(cell, { error: message, costUnknown: unknownCost || undefined });
        console.error(`${cellId}: ${message}`);
        if (unknownCost) stopped = `a call timed out with an unknown charge (${reserve} cents reserved for it)`;
      }
      cell.durationMs = Date.now() - started;
      cells.push(cell);
      writeFileSync(path.join(cellDir, "cell.json"), JSON.stringify(cell, null, 2));
      write();
      if (stopped) {
        console.warn(`stopping — ${stopped}`);
        break outer;
      }
    }
  }
  write();
  console.log(`\n${cells.length} cells, ${(spent / 100).toFixed(3)} USD${stopped ? ` (stopped: ${stopped})` : ""}, manifest at ${path.relative(ROOT, manifestPath)}`);
  console.log("Look at every preview on the board, at game size and zoomed, and answer the manual questions in each cell.json.");
}

/**
 * The head alone from a 2×2 identity sheet: the portrait quadrant, then the
 * square the head fills with air for hair and ears — not the round sticker,
 * and no body, so there is no outfit to copy. Check the two crops by eye
 * before a run; a hat or a tall curl outside the square is a different test.
 */
async function headReference(sheet: Buffer): Promise<Buffer> {
  const meta = await sharp(sheet).metadata();
  const half = Math.floor(Math.min(meta.width ?? 0, meta.height ?? 0) / 2);
  const portrait = await sharp(sheet).extract({ left: 0, top: 0, width: half, height: half }).png().toBuffer();
  const win = await faceWindow(portrait, { air: 1.5 });
  return sharp(portrait).extract({ left: win.left, top: win.top, width: win.size, height: win.size }).png().toBuffer();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
