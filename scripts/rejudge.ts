/**
 * Rejudge existing F pixels against the archived full sheet. No image renders.
 * Dry-run writes a NEW private evaluation directory; --go requires a budget.
 * Every request is reserved durably before sending; unknown charges stop.
 * Existing output directories are never reused. After an interruption inspect
 * the pending reservation; do NOT simply rerun into a fresh directory.
 *
 * results.planHash is SHA-256 of UTF-8 JSON.stringify(plan), NOT the pretty
 * printed plan.json bytes. To verify a historical or current run, parse the
 * stored plan.json and stringify it without indentation, preserving key order.
 * This is whitespace-independent compact JSON, not sorted-key canonical JSON.
 *
 * npx tsx scripts/rejudge.ts --out=work/patch-quality/f-review-unique
 * Add --go --budget-cents=4 only with spend approval.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { OpenAiPatchJudge, judgePrompt, judgeReserveCents } from "../src/infra/generation/judge";
import type { PatchJudge, PatchJudgement } from "../src/infra/generation/types";
import { envKey } from "./slot-patch";

const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
export interface RejudgeRow {
  id: string; identity: string; board: string; target: string;
  patch: string; patchHash: string; judgeReference: string; judgeReferenceHash: string;
  sourceCell: string; sourceCellHash: string;
  priorJudge: unknown; reserveCents: number;
}
export interface RejudgePlan {
  schemaVersion: 2; createdAt: string; run: string; arm: string; judgeModel: string;
  commit: string; referenceManifest: string; referenceManifestHash: string;
  promptTemplateHash: string; judgedCells: number; denominator: number;
  skipped: Array<{ id: string; why: string }>;
  estTotalCents: number; rows: RejudgeRow[];
}

function inside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}
function checkedFile(root: string, candidate: string): string {
  const real = realpathSync(candidate);
  if (!inside(realpathSync(root), real)) throw new Error(`input outside run: ${candidate}`);
  return real;
}

/** Local planning. Legacy F uses the same round's archived E full sheet. */
export function buildRejudgePlan(options: { run: string; arm: string; referenceManifest: string; judgeModel?: string; commit: string }): RejudgePlan {
  const run = realpathSync(options.run);
  const armDir = checkedFile(run, path.join(run, `arm-${options.arm}`));
  const referenceManifest = checkedFile(run, options.referenceManifest);
  const referenceRaw = readFileSync(referenceManifest);
  const reference = JSON.parse(referenceRaw.toString("utf8")) as { config?: { reference?: string }; referenceHashes?: Record<string, string | { judge?: string }> };
  if (reference.config?.reference !== "sheet") throw new Error("reference manifest must identify a full-sheet arm");
  const judgeModel = options.judgeModel ?? "gpt-4o-mini";
  judgeReserveCents(judgeModel, ""); // refuse unpriced models before writing
  const rows: RejudgeRow[] = [];
  const skipped: RejudgePlan["skipped"] = [];
  const ids = new Set<string>();
  for (const rep of readdirSync(armDir).filter((d) => d.startsWith("repeat-")).sort()) {
    const repDir = checkedFile(run, path.join(armDir, rep));
    for (const identity of readdirSync(repDir).filter((d) => statSync(path.join(repDir, d)).isDirectory()).sort()) {
      const idDir = checkedFile(run, path.join(repDir, identity));
      const refDir = path.join(path.dirname(referenceManifest), identity);
      const refFile = checkedFile(run, path.join(refDir, existsSync(path.join(refDir, "reference.judge.png")) ? "reference.judge.png" : "reference.sheet.png"));
      const expected = reference.referenceHashes?.[identity];
      const refHash = sha256(readFileSync(refFile));
      if (refHash !== (typeof expected === "string" ? expected : expected?.judge)) throw new Error(`archived full sheet does not match manifest: ${identity}`);
      for (const cellName of readdirSync(idDir).filter((d) => statSync(path.join(idDir, d)).isDirectory()).sort()) {
        const cellDir = checkedFile(run, path.join(idDir, cellName));
        const sourceCell = path.join(cellDir, "cell.json");
        if (!existsSync(sourceCell)) continue;
        const raw = readFileSync(checkedFile(run, sourceCell));
        const cell = JSON.parse(raw.toString("utf8")) as { id: string; board: string; target: string; error?: string; shapeProblem: string | null; files?: { patch?: string }; judge?: unknown };
        if (typeof cell.id !== "string" || typeof cell.board !== "string" || typeof cell.target !== "string") throw new Error(`invalid source cell: ${sourceCell}`);
        const id = `${rep}/${cell.id}`;
        if (ids.has(id)) throw new Error(`duplicate cell id: ${id}`);
        ids.add(id);
        if (cell.error || cell.shapeProblem !== null || !cell.files?.patch) {
          skipped.push({ id, why: cell.error ? "provider error" : `failed shape: ${cell.shapeProblem ?? "no patch"}` });
          continue;
        }
        const patch = checkedFile(run, path.resolve(cellDir, cell.files.patch));
        rows.push({ id, identity, board: cell.board, target: cell.target, patch, patchHash: sha256(readFileSync(patch)), judgeReference: refFile, judgeReferenceHash: refHash, sourceCell, sourceCellHash: sha256(raw), priorJudge: cell.judge ?? null, reserveCents: judgeReserveCents(judgeModel, identity) });
      }
    }
  }
  if (!rows.length) throw new Error("no shape-passing cells with patches");
  return { schemaVersion: 2, createdAt: new Date().toISOString(), run, arm: options.arm, judgeModel, commit: options.commit, referenceManifest, referenceManifestHash: sha256(referenceRaw), promptTemplateHash: sha256(judgePrompt("{identity}")), judgedCells: rows.length, denominator: rows.length + skipped.length, skipped, estTotalCents: round(rows.length * 0.26), rows };
}

/** Snapshot all inputs before any call; use these exact bytes throughout. */
function inputsFor(plan: RejudgePlan) {
  if (sha256(readFileSync(plan.referenceManifest)) !== plan.referenceManifestHash) throw new Error("reference manifest changed after planning");
  return plan.rows.map((r) => {
    if (sha256(readFileSync(r.sourceCell)) !== r.sourceCellHash) throw new Error(`source cell changed: ${r.id}`);
    const patchPng = readFileSync(r.patch);
    const reference = readFileSync(r.judgeReference);
    if (sha256(patchPng) !== r.patchHash || sha256(reference) !== r.judgeReferenceHash) throw new Error(`input changed after planning: ${r.id}`);
    return { patchPng, reference, childName: r.identity, label: r.id };
  });
}
function newOutput(plan: RejudgePlan, out: string) {
  const absolute = path.resolve(out);
  // The parent must already exist. Never create a path inside the source run
  // before discovering it was an overlap (including symlinks/junctions).
  const real = path.join(realpathSync(path.dirname(absolute)), path.basename(absolute));
  if (inside(plan.run, real) || inside(real, plan.run)) throw new Error("evaluation output must be separate from the source run");
  mkdirSync(real); // atomic refusal if this directory exists, even empty
  writeFileSync(path.join(real, "plan.json"), JSON.stringify(plan, null, 2), { flag: "wx" });
  return real;
}

export async function executeRejudge(plan: RejudgePlan, options: { out: string; budgetCents?: number; judge?: PatchJudge }) {
  const inputs = inputsFor(plan);
  const go = Boolean(options.judge);
  const budget = options.budgetCents ?? 0;
  if (go && (!Number.isFinite(budget) || budget <= 0)) throw new Error("live rejudge needs a finite positive budget");
  const out = newOutput(plan, options.out);
  const state = { planHash: sha256(JSON.stringify(plan)), planHashFormat: "sha256-json-stringify-utf8-v1", budgetCents: budget, knownCostCents: 0, accountedCents: 0, stopped: null as string | null, pending: null as { id: string; reservedCents: number } | null, verdicts: [] as Array<{ id: string; chargedCents: number; result: PatchJudgement }> };
  const save = () => {
    const tmp = path.join(out, "results.pending.json");
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, path.join(out, "results.json"));
  };
  if (!go) return { plan, state, out };
  save();
  for (const [index, r] of plan.rows.entries()) {
    if (round(state.accountedCents + r.reserveCents) > budget) { state.stopped = "budget: next request cannot be fully reserved"; break; }
    state.pending = { id: r.id, reservedCents: r.reserveCents };
    state.accountedCents = round(state.accountedCents + r.reserveCents);
    save(); // a crash leaves a reservation, never a free rerun
    let result: PatchJudgement;
    try { result = await options.judge!.judge(inputs[index]!); }
    catch { result = { verdict: "unknown", reason: "judge threw; charge unknown", costCents: 0, costUnknown: true }; }
    const validCost = Number.isFinite(result.costCents) && result.costCents >= 0;
    const unknown = result.costUnknown !== false || !validCost || result.attempts?.length !== 1;
    const known = validCost ? result.costCents : 0;
    const charged = unknown ? Math.max(r.reserveCents, known) : known;
    state.knownCostCents = round(state.knownCostCents + known);
    state.accountedCents = round(state.accountedCents - r.reserveCents + charged);
    state.verdicts.push({ id: r.id, chargedCents: charged, result });
    state.pending = null;
    if (unknown) state.stopped = "unknown charge; no more requests";
    else if (known > r.reserveCents) state.stopped = "provider cost exceeded reservation; review pricing before any further request";
    else if (result.model !== plan.judgeModel && result.model !== `${plan.judgeModel}-2024-07-18`) state.stopped = "unexpected served model; comparison stopped";
    save();
    console.log(`${r.id}: ${result.verdict} (${state.accountedCents.toFixed(6)} cents accounted)`);
    if (state.stopped) break;
  }
  save();
  return { plan, state, out };
}

async function main() {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const allowed = new Set(["run", "arm", "out", "reference-manifest", "judge-model", "budget-cents", "go"]);
  for (const arg of args) if (!arg.startsWith("--") || !allowed.has(arg.slice(2).split("=")[0]!)) throw new Error(`unknown argument: ${arg}`);
  const flag = (name: string, fallback: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
  const run = path.resolve(root, flag("run", "work/patch-quality/e3"));
  const go = args.includes("--go");
  const out = path.resolve(root, flag("out", `${run}-rejudge-F-${Date.now()}`));
  if (!inside(path.join(root, "work"), out)) throw new Error("private evaluation output must stay under work/");
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (go && execFileSync("git", ["status", "--porcelain", "--", "src", "scripts"], { cwd: root, encoding: "utf8" }).trim()) throw new Error("commit code before a live evaluation");
  const plan = buildRejudgePlan({ run, arm: flag("arm", "F"), referenceManifest: path.resolve(root, flag("reference-manifest", path.join(run, "arm-E", "repeat-1", "manifest.json"))), judgeModel: flag("judge-model", "gpt-4o-mini"), commit });
  const key = go ? envKey("OPENAI_API_KEY") : null;
  if (go && !key) throw new Error("OPENAI_API_KEY is not set");
  const result = await executeRejudge(plan, { out, budgetCents: Number(flag("budget-cents", "0")), judge: key ? new OpenAiPatchJudge(key, { model: plan.judgeModel, tries: 1 }) : undefined });
  console.log(JSON.stringify({ dryRun: !go, cells: plan.judgedCells, denominator: plan.denominator, estimateCents: plan.estTotalCents, completed: result.state.verdicts.length, accountedCents: result.state.accountedCents, stopped: result.state.stopped, out: result.out }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((err) => { console.error(err instanceof Error ? err.message : "rejudge failed"); process.exitCode = 1; });
}
