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
import { IMAGE_EDIT_RESERVE_CENTS } from "../src/infra/generation/image-edit-reserve";
import { OpenAiPatchJudge } from "../src/infra/generation/judge";
import { faceWindow } from "../src/infra/generation/avatar-cut";
import { DEFAULT_WINDOW_FACTOR, PROMPT_VERSION, childProblem, matteHint, paintMask } from "../src/services/generation/patch";
import { extractChild } from "../src/services/generation/extract";
import { assertSameRun, chargeCents, cropOf, slotOf, writePatch, writePreview } from "../src/services/generation/authoring";
import { boardComposite } from "../src/services/generation/board-composite";
import { envKey } from "./slot-patch";
import { GenerationBudget } from "./generation-budget";
import { boardJudgeReserveCents } from "../src/infra/generation/board-verdict";

const ROOT = process.cwd();
const flag = (name: string, fallback: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const has = (name: string) => process.argv.includes(`--${name}`);
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** The four boards the review chose: a partial child, a beach in a jacket, open water, a dark doorway. */
const DEFAULT_BOARDS = "greatwall:lanterns,sydney:surfboards,amazon:canoe,giantlibrary:doorway";

/** Per-call allowance includes input; actual usage remains the cost of record. */
const RESERVE_CENTS: Readonly<Record<string, number>> = IMAGE_EDIT_RESERVE_CENTS;
// The contextual judge (board crop + patch + sheet, then Sol HIGH on a pass) cost
// about 2.4 cents per verdict in the 7 September trials; reserve for that.
const JUDGE_RESERVE_CENTS = boardJudgeReserveCents("sample-child");

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
  // The actual inputs, hashed up front: the scene definition (the slot and its
  // window live there) and the board art it points at. They go into the config
  // hash, so --append refuses a resumed run whose inputs changed even on the
  // same commit — a locally edited scene or repainted board is a different run.
  const boardInputs: Record<string, { scene: string; art: string }> = {};
  for (const board of boards) {
    const slug = board.split(":")[0]!;
    if (boardInputs[slug]) continue;
    const sceneRaw = readFileSync(path.join(ROOT, "content", "scenes", slug, "scene.json"));
    const artRel = (JSON.parse(sceneRaw.toString("utf8")) as { art: { base: string } }).art.base;
    boardInputs[slug] = { scene: sha256(sceneRaw), art: sha256(readFileSync(path.join(ROOT, "public", artRel))) };
  }
  const variant = flag("variant", "A");
  const quality = flag("quality", "low");
  const matteQuality = flag("matte-quality", "low");
  const model = flag("model", "gpt-image-2");
  const windowFactor = Number(flag("window-factor", String(DEFAULT_WINDOW_FACTOR)));
  const units = flag("units", "model");
  if (units !== "model" && units !== "art") throw new Error(`--units takes model or art, got "${units}"`);
  const referenceKind = flag("reference", "sheet");
  if (referenceKind !== "sheet" && referenceKind !== "head") throw new Error(`--reference takes sheet or head, got "${referenceKind}"`);
  const judgeOn = flag("judge", "on") !== "off";
  const artDirectionPath = flag("art-direction", "");
  const artDirection: Record<string, ArtDirection> = artDirectionPath ? (JSON.parse(readFileSync(path.resolve(ROOT, artDirectionPath), "utf8")) as Record<string, ArtDirection>) : {};
  const tries = Number(flag("tries", "1"));
  const judgeModel = flag("judge-model", "gpt-4o-mini");
  // The age the prompt and the judge are told; production reads it from the child profile.
  const ageYears = flag("age", "") ? Number(flag("age", "")) : undefined;
  mkdirSync(outDir, { recursive: true });

  const provider = new OpenAiAvatarProvider(key, { model, quality, patchQuality: quality, perMinute: Number(flag("rpm", "5")), tries });
  const judge = judgeOn ? new OpenAiPatchJudge(key, { model: judgeModel, tries: 1 }) : null;
  const commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
  // A commit identifies the code only when the checkout is clean where it matters.
  const treeDirty = execSync("git status --porcelain -- scripts src content public/scenes", { cwd: ROOT }).toString().trim();
  if (treeDirty) console.warn(`uncommitted changes under scripts/src/content/public — ${commit} does not identify this run:\n${treeDirty}`);
  const sheetHashes = Object.fromEntries(sheets.map((f) => [path.parse(f).name, sha256(readFileSync(path.join(sheetsDir, f)))]));
  const config = {
    promptVersion: PROMPT_VERSION,
    quality,
    matteQuality,
    model,
    judgeModel: judgeOn ? judgeModel : null,
    variant,
    boards,
    boardInputs,
    windowFactor,
    units,
    reference: referenceKind,
    artDirection: artDirectionPath || null,
    artDirectionHash: artDirectionPath ? sha256(readFileSync(path.resolve(ROOT, artDirectionPath))) : null,
    sheetHashes,
    tries,
    judge: judgeOn,
    arm: flag("arm", ""),
    repeat: Number(flag("repeat", "1")),
  };
  // Everything that shapes a cell is in the hash, so a resumed run cannot
  // quietly become a different run.
  const configHash = sha256(Buffer.from(JSON.stringify(config)));
  const requestBudget = new GenerationBudget(path.join(outDir, "request-ledger"), budget, { configHash, commit, treeDirty });
  const editCall = provider.editSlotCrop.bind(provider);
  const matteCall = provider.matteSlotCrop.bind(provider);
  provider.editSlotCrop = request => requestBudget.run(`${request.label}:paint`, RESERVE_CENTS[request.quality ?? quality] ?? RESERVE_CENTS.high!, () => editCall(request));
  provider.matteSlotCrop = request => requestBudget.run(`${request.label}:matte`, RESERVE_CENTS[matteQuality] ?? RESERVE_CENTS.high!, () => matteCall({ ...request, quality: matteQuality }));
  if (judge) {
    const judgeCall = judge.judge.bind(judge);
    judge.judge = request => requestBudget.run(`${request.label}:judge`, boardJudgeReserveCents(request.childName), () => judgeCall(request));
  }

  const cells: Array<Record<string, unknown>> = [];
  const unknownCharges: string[] = [];
  let spent = 0;
  let stopped: string | null = null;
  const manifestPath = path.join(outDir, "manifest.json");
  let startedAt = new Date().toISOString();
  let runId = createHash("sha256").update(`${outDir}:${startedAt}:${Math.random()}`).digest("hex").slice(0, 12);
  const artHashes: Record<string, string> = {};
  const referenceHashes: Record<string, { generation: string; judge: string }> = {};
  // Resume: a cell that already has its json is done — provided this is the
  // same run. A different commit or config refuses before anything is written
  // or paid for; old cells never end up under a new run's heading.
  if (has("append") && existsSync(manifestPath)) {
    const prior = JSON.parse(readFileSync(manifestPath, "utf8")) as { commit?: string; configHash?: string; runId?: string; startedAt?: string; treeDirty?: string; unknownCharges?: string[]; cells?: Array<Record<string, unknown>>; spentCents?: number; artHashes?: Record<string, string>; referenceHashes?: Record<string, { generation: string; judge: string }> };
    assertSameRun({ commit: prior.commit ?? "", configHash: prior.configHash ?? "" }, { commit, configHash });
    if (treeDirty) throw new Error(`cannot resume on a dirty tree — the commit would not identify the code:\n${treeDirty}`);
    if (prior.treeDirty) throw new Error("the prior run was made on a dirty tree, so its commit does not identify its code; start a new --out directory");
    cells.push(...(prior.cells ?? []));
    unknownCharges.push(...(prior.unknownCharges ?? []));
    spent = prior.spentCents ?? 0;
    startedAt = prior.startedAt ?? startedAt;
    runId = prior.runId ?? runId;
    Object.assign(artHashes, prior.artHashes ?? {});
    Object.assign(referenceHashes, prior.referenceHashes ?? {});
  }
  const write = () =>
    writeFileSync(
      manifestPath,
      JSON.stringify({ runId, commit, treeDirty: treeDirty || undefined, configHash, config, budgetCents: budget, spentCents: requestBudget.spent, unknownCharges, stopped, startedAt, updatedAt: new Date().toISOString(), artHashes, referenceHashes, cells }, null, 2),
    );

  // Two image calls per cell — the roll and its matte (pass two) — and the judge.
  const reserve = (RESERVE_CENTS[quality] ?? RESERVE_CENTS.high!) + 2 * (RESERVE_CENTS[matteQuality] ?? RESERVE_CENTS.high!) + (judge ? JUDGE_RESERVE_CENTS : 0);

  outer: for (const sheetFile of sheets) {
    const identity = path.parse(sheetFile).name;
    const sheet = readFileSync(path.join(sheetsDir, sheetFile));
    const identityDir = path.join(outDir, identity);
    mkdirSync(identityDir, { recursive: true });
    // Two references, on purpose: what the painter is shown may vary by arm;
    // what the judge compares against is the whole sheet in every arm, so a
    // verdict is about the render, not about the reference the judge got.
    const generationReference = referenceKind === "head" ? await headReference(sheet) : sheet;
    const judgeReference = sheet;
    for (const [name, buf] of [[`reference.generation.png`, generationReference], [`reference.judge.png`, judgeReference]] as const) {
      const file = path.join(identityDir, name);
      if (!existsSync(file)) writeFileSync(file, buf);
      else if (sha256(readFileSync(file)) !== sha256(buf)) throw new Error(`${file} does not match this run's sheet — the reference on disk came from different inputs`);
    }
    referenceHashes[identity] = { generation: sha256(generationReference), judge: sha256(judgeReference) };
    for (const board of boards) {
      const [slug, targetId] = board.split(":");
      if (!slug || !targetId) throw new Error(`--boards entries are slug:target, got "${board}"`);
      const cellId = `${identity}/${slug}-${targetId}-${variant}`;
      if (cells.some((c) => c.id === cellId)) continue;
      spent = requestBudget.spent;
      if (spent + reserve > budget || requestBudget.held) {
        stopped = `budget: ${spent.toFixed(2)} spent, ${reserve.toFixed(2)} reserved for the next call, ${budget} allowed`;
        console.warn(`stopping — ${stopped}`);
        break outer;
      }
      const direction: ArtDirection = { ...(artDirection[slug] ?? {}), ...(artDirection[`${slug}/${targetId}`] ?? {}) };
      const c = slotOf(slug, targetId, variant, { windowFactor, outputPx: units === "model" ? provider.patchOutputPx : undefined, ageYears, ...direction });
      const cellDir = path.join(identityDir, `${slug}-${targetId}-${variant}`);
      mkdirSync(cellDir, { recursive: true });
      const crop = await cropOf(c);
      const mask = paintMask(c.ctx, c.art, c.slot);
      const artFile = path.join(ROOT, "public", c.scene.art.base);
      // Hashed as read NOW and checked against the hash taken at start — never
      // a stale value carried over a local edit (Codex's second review).
      const artHash = sha256(readFileSync(artFile));
      if (artHash !== boardInputs[slug]?.art) throw new Error(`the art for ${slug} changed while the run was going`);
      artHashes[slug] = artHash;
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
        generationReferenceHash: referenceHashes[identity]!.generation,
        judgeReferenceHash: referenceHashes[identity]!.judge,
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
        const edit = await provider.editSlotCrop({ crop, paintMask: mask, reference: generationReference, prompt: c.prompt, label: cellId, quality });
        // A successful answer without usage is an unknown charge, not a free
        // one: it consumes the call's whole reserve from the budget and is
        // listed in the manifest's unknownCharges. The run goes on — the image
        // is real; only its price is not.
        const charge = chargeCents(edit, RESERVE_CENTS[quality] ?? RESERVE_CENTS.high!);
        spent += charge.cents;
        if (charge.unknown) {
          unknownCharges.push(cellId);
          cell.costUnknown = true;
        }
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
        // Cut out exactly as the pipeline cuts: the provider's matte (pass two), or the difference when there is none.
        const extracted = await extractChild({ provider, originalCrop: crop, editedCrop: edit.png, ctx: c.ctx, art: c.art, slot: c.slot, hint: matteHint(c.slot), label: cellId, reference: judgeReference, quality: matteQuality });
        const patch = extracted.patch;
        let matteCost = 0;
        cell.matteAttempts = extracted.matteAttempts.map(({ png, rawPng, ...metadata }) => metadata);
        for (const matte of extracted.matteAttempts) {
          const matteCharge = chargeCents(matte, RESERVE_CENTS[matteQuality] ?? RESERVE_CENTS.high!);
          spent += matteCharge.cents;
          matteCost += matte.costCents;
          if (matteCharge.unknown) {
            unknownCharges.push(`${cellId}:matte`);
            cell.costUnknown = true;
          }
          if (matte.png.length) writeFileSync(path.join(cellDir, "matte.png"), matte.png);
          files.matte = "matte.png";
          if (matte.rawPng) {
            writeFileSync(path.join(cellDir, "matte-1024.png"), matte.rawPng);
            files.matte1024 = "matte-1024.png";
          }
          cell.matte = { model: matte.model, requestId: matte.providerRequestId ?? null, usage: matte.usage ?? null, costCents: matte.costCents, promptSent: matte.promptSent ?? null };
        }
        const shape = extracted.renderProblem ?? extracted.extractionProblem ?? (extracted.method === "deferred" ? "deferred" : childProblem(patch));
        Object.assign(cell, {
          extraction: { method: extracted.method, version: extracted.version, diff: extracted.diff, largest: patch.largest, painted: patch.painted, expected: patch.expected, shape: patch.shape, geometry: patch.width ? patch.geometry : null, patchSize: { width: patch.width, height: patch.height } },
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
          // Judged exactly as the pipeline judges: on the board, in context.
          const boardCrop = await boardComposite({ base: readFileSync(artFile), art: c.art, patch: patch.webp, rect: patch.geometry.rect, layer: c.slot.layer, flip: c.slot.flip });
          writeFileSync(path.join(cellDir, "board-crop.png"), boardCrop);
          files.boardCrop = "board-crop.png";
          const verdict = await judge.judge({ patchPng: patch.webp, reference: judgeReference, childName: identity, ageYears, label: cellId, boardCrop });
          const judgeCharge = chargeCents(verdict, JUDGE_RESERVE_CENTS);
          spent += judgeCharge.cents;
          judgeCost = verdict.costCents;
          cell.judge = verdict;
          if (judgeCharge.unknown) {
            unknownCharges.push(`${cellId}:judge`);
            cell.costUnknown = true;
            stopped = "judge charge unknown; reserved and stopped before another call";
          }
          verdictText = verdict.verdict;
        }
        cell.costCents = Math.round((edit.costCents + matteCost + judgeCost) * 100) / 100;
        console.log(`${cellId}: ${shape ? `rejected (${shape})` : verdictText}${cell.nonComparable ? " [served by another model: not comparable]" : ""} · ${(spent / 100).toFixed(3)} USD so far`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const unknownCost = /timed out|out of time/i.test(message);
        if (unknownCost) {
          spent += reserve;
          unknownCharges.push(cellId);
        }
        Object.assign(cell, { error: message, costUnknown: unknownCost || undefined });
        console.error(`${cellId}: ${message}`);
        if (unknownCost || requestBudget.held || /BUDGET_STOP/.test(message)) stopped = `request held: ${message}`;
      }
      cell.durationMs = Date.now() - started;
      spent = requestBudget.spent;
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
