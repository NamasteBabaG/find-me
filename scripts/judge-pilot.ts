/**
 * The judge policy pilot (8 September 2026): both reviewers, each on its
 * own, on a labelled set of finished pictures from game 2 — the five accepted
 * spots a parent called wrong, ten accepted spots nobody did, and ten
 * rejected attempts rebuilt from their kept render and matte, six of which
 * are good peeks. Every call is reserved before it is made against one
 * durable ledger for the whole round (GenerationBudget), and nothing is
 * rendered: only judgements are bought.
 *
 *   npx tsx scripts/judge-pilot.ts --cases=work/.../pilot/cases.json --out=work/.../pilot --budget-dir=work/.../budget --limit-cents=500 [--prompt=<tag>] [--models=fast,strong] [--only=id,id] [--window=3] [--timeout-ms=180000]
 *
 * --prompt is only a tag for the results file (the prompt is always the code's current one); --window=3 reproduces the old 3x board crop.
 *
 * Writes <out>/results-<prompt>.json (every verdict, check, reason, cost and
 * request id) and prints the confusion matrix per reviewer.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

interface Case {
  id: string;
  slug: string;
  target: string;
  /** exact: the stored patch at its stored rect; reconstructed: a kept render + matte re-extracted with the current code. */
  kind: "accepted-exact" | "reconstructed";
  /** The scene version the game pinned when this picture was made. */
  sceneVersion: number;
  label: "good" | "bad";
  labelSource: string;
  note: string;
  /** accepted-exact */
  patch?: string;
  rect?: { x: number; y: number; w: number; h: number };
  /** reconstructed */
  raw?: string;
  matte?: string;
}

async function main() {
  const casesFile = flag("cases");
  const out = flag("out");
  const budgetDir = flag("budget-dir");
  const limit = Number(flag("limit-cents", "500"));
  const promptVersion = flag("prompt", "v6");
  const models = flag("models", "fast,strong").split(",");
  const only = flag("only") ? new Set(flag("only").split(",")) : null;
  if (!casesFile || !out || !budgetDir) throw new Error("--cases, --out and --budget-dir are required");
  mkdirSync(out, { recursive: true });
  const cases = (JSON.parse(readFileSync(casesFile, "utf8")) as { sheet: string; childName: string; ageYears: number; cases: Case[] });
  const sheet = readFileSync(cases.sheet);

  const { OpenAiPatchJudge } = await import("../src/infra/generation/judge");
  const bv = await import("../src/infra/generation/board-verdict");
  const { boardJudgeReserveCents, BOARD_FAST_JUDGE_MODEL, BOARD_JUDGE_MODEL } = bv;
  const { slotOf, cropOf } = await import("../src/services/generation/authoring");
  const { matteToPatch } = await import("../src/services/generation/patch");
  const { fitMatte } = await import("../src/infra/generation/openai");
  const { boardComposite } = await import("../src/services/generation/board-composite");
  const { recipeOf } = await import("../src/services/generation/slot-patches");
  const { sceneBySlug } = await import("../src/services/scene-catalog.service");

  const apiKey = process.env.OPENAI_API_KEY ?? "";
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  // A pilot can wait for the strong reviewer longer than a tick can; a timeout is an unknown charge either way.
  const judge = new OpenAiPatchJudge(apiKey, { policy: "strong", timeoutMs: Number(flag("timeout-ms", "180000")) });
  const budget = new GenerationBudget(budgetDir, limit, { round: flag("budget-tag", "judge-placement-20260908") });
  console.log(`budget: ${budget.spent.toFixed(2)} of ${limit} cents already spent in this round`);

  // There is no v5 mode: the ES module cannot be patched, and game 2's own records ARE the
  // v5 baseline on exact wires (both reviewers passed all 15 accepted pictures, five of them
  // wrong; the fast one refused the six good peeks). --window=3 reproduces the old crop.
  const windowFactor = Number(flag("window", "0")) || undefined;
  const resultsFile = path.join(out, `results-${promptVersion}.json`);
  const results: Array<Record<string, unknown>> = existsSync(resultsFile) ? (JSON.parse(readFileSync(resultsFile, "utf8")) as Array<Record<string, unknown>>) : [];
  const done = new Set(results.map((r) => `${r.id}|${r.model}`));

  for (const c of cases.cases) {
    if (only && !only.has(c.id)) continue;
    // The scene version the game pinned: its art, layer and slot, so an accepted
    // patch is composed exactly as the game composed it (the current version
    // may have moved the spot or added to the foreground layer since).
    const scene = sceneBySlug(c.slug, c.sceneVersion);
    const target = scene.targets.find((t) => t.id === c.target);
    if (!target) throw new Error(`${c.id}: ${c.slug}/${c.target} is not in version ${c.sceneVersion}`);
    const slot = target.slots[0];
    const art = { width: scene.art.width, height: scene.art.height };
    const base = readFileSync(path.join(process.cwd(), "public", scene.art.base));
    const fg = scene.art.foreground ? readFileSync(path.join(process.cwd(), "public", scene.art.foreground)) : undefined;
    let patchWebp: Buffer;
    let rect: { x: number; y: number; w: number; h: number };
    if (c.kind === "accepted-exact") {
      patchWebp = readFileSync(c.patch!);
      rect = c.rect!;
    } else {
      const info = slotOf(c.slug, c.target, "A", { outputPx: 1024 });
      if (info.slot.x !== slot.x || info.slot.y !== slot.y || info.slot.scale !== slot.scale) throw new Error(`${c.id}: the current slot differs from version ${c.sceneVersion}; rebuild against the archived one`);
      const original = await cropOf(info);
      const edited = await sharp(readFileSync(c.raw!)).resize(info.ctx.rect.w, info.ctx.rect.h, { kernel: "lanczos3" }).png().toBuffer();
      const mattePng = await fitMatte(readFileSync(c.matte!), info.ctx.rect.w, info.ctx.rect.h);
      const patch = await matteToPatch({ originalCrop: original, mattePng, ctx: info.ctx, art: info.art, slot: info.slot, editedCrop: edited });
      if (patch.width === 0) { console.warn(`${c.id}: nothing extracted`); continue; }
      patchWebp = patch.webp;
      rect = patch.geometry.rect;
    }
    const boardCrop = await boardComposite({ base, foreground: fg, art, patch: patchWebp, rect, layer: slot.layer, flip: slot.flip, windowFactor });
    writeFileSync(path.join(out, `${c.id}.composite-${promptVersion}.png`), boardCrop);
    // The recipe of the CURRENT version: what the judge would be told from now on (contracts included).
    const current = sceneBySlug(c.slug).targets.find((t) => t.id === c.target);
    const recipe = recipeOf(current?.slots[0] ?? slot, current ?? target);
    for (const which of models) {
      const model = which === "fast" ? BOARD_FAST_JUDGE_MODEL : BOARD_JUDGE_MODEL;
      if (done.has(`${c.id}|${model}`)) continue;
      const reserve = boardJudgeReserveCents(cases.childName);
      const started = Date.now();
      const r = await budget.run(`judge:${promptVersion}:${which}:${c.id}`, reserve, async () => {
        const j = await judge.reviewWith({ patchPng: patchWebp, reference: sheet, childName: cases.childName, ageYears: cases.ageYears, label: c.id, boardCrop, recipe }, model);
        // The wire images go to files, never into the ledger.
        for (const [i, img] of (j.wireImages ?? []).entries()) writeFileSync(path.join(out, `${c.id}.wire-${promptVersion}-${i + 1}.png`), img);
        const { wireImages: _w, promptSent: _p, ...compact } = j;
        return compact;
      });
      const row = { id: c.id, slug: c.slug, target: c.target, kind: c.kind, label: c.label, labelSource: c.labelSource, note: c.note, prompt: promptVersion, model, verdict: r.verdict, checks: r.checks ?? null, reason: r.reason, costCents: r.costCents, costUnknown: Boolean(r.costUnknown), requestIds: (r.attempts ?? []).map((a) => a.requestId), imageHashes: r.imageHashes ?? null, ms: Date.now() - started };
      results.push(row);
      writeFileSync(resultsFile, JSON.stringify(results, null, 2));
      console.log(`${c.id.padEnd(28)} ${which.padEnd(6)} ${r.verdict.padEnd(7)} label ${c.label.padEnd(4)} ${r.costCents.toFixed(3)}c  ${Object.entries(r.checks ?? {}).filter(([, v]) => v !== "pass").map(([k, v]) => `${k}=${v}`).join(" ")}`);
    }
  }

  // The matrices.
  for (const which of models) {
    const model = which === "fast" ? BOARD_FAST_JUDGE_MODEL : BOARD_JUDGE_MODEL;
    const rows = results.filter((r) => r.model === model && r.prompt === promptVersion);
    const count = (label: string, verdict: string) => rows.filter((r) => r.label === label && r.verdict === verdict).length;
    const cents = rows.reduce((n, r) => n + Number(r.costCents), 0);
    console.log(`\n${promptVersion} ${model}: ${rows.length} cases, ${cents.toFixed(1)}c (${(cents / Math.max(1, rows.length)).toFixed(2)}c each)`);
    console.log(`  good → ok ${count("good", "ok")}  bad ${count("good", "bad")}  unknown ${count("good", "unknown")}`);
    console.log(`  bad  → ok ${count("bad", "ok")}  bad ${count("bad", "bad")}  unknown ${count("bad", "unknown")}`);
  }
  console.log(`\nbudget: ${budget.spent.toFixed(2)} of ${limit} cents spent in this round${budget.held ? " (HELD: an unresolved request)" : ""}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
