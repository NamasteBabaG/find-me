/**
 * Judge EXISTING patches again, against the full identity sheet — no renders.
 *
 * Built for arm F of the 6 September round: its judge was shown the same
 * head-only reference as the painter, so its identity verdicts never separated
 * the render from the reference (Codex's finding). The patches are already
 * paid for; the open question costs judge calls only.
 *
 *   npx tsx scripts/rejudge.ts --run=work/patch-quality/e3 --arm=F
 *     Dry-run, the default: writes <out>/plan.json, prints every request and
 *     the estimated budget, makes no API call and needs no key.
 *
 *   npx tsx scripts/rejudge.ts --run=work/patch-quality/e3 --arm=F --go --budget-cents=8
 *     Asks the judge for real. Refuses without a budget, reserves the next
 *     call's cost before making it, and stops before exceeding the budget.
 *     Verdicts go to the evaluation directory as results.json; the original
 *     cell.json and manifest are never touched, so old and new verdicts can
 *     sit side by side over the same pixels.
 *
 * Cells whose extraction failed shape are skipped: there is no patch to judge.
 * They stay failures of the automatic gate and keep their place in the
 * denominator of any comparison.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { OpenAiPatchJudge } from "../src/infra/generation/judge";
import { envKey } from "./slot-patch";

const ROOT = process.cwd();
const EST_JUDGE_CENTS = 0.26; // what a gpt-4o-mini verdict cost in the 6 Sep round — an estimate from the records, not a quote
const JUDGE_RESERVE_CENTS = 0.4;

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string): string => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const has = (name: string): boolean => argv.includes(`--${name}`);
const sha256 = (buf: Buffer): string => createHash("sha256").update(buf).digest("hex");
const rel = (p: string): string => path.relative(ROOT, p).replaceAll("\\", "/");

interface PlanRow {
  id: string;
  arm: string;
  repeat: string;
  identity: string;
  board: string;
  target: string;
  patch: string;
  patchHash: string;
  judgeReference: string;
  judgeReferenceHash: string;
  priorJudge: { model?: string | null; verdict?: string; reason?: string } | null;
  estCents: number;
}

async function main() {
  const run = path.resolve(ROOT, flag("run", "work/patch-quality/e3"));
  const arm = flag("arm", "F");
  const armDir = path.join(run, `arm-${arm}`);
  if (!existsSync(armDir)) throw new Error(`no ${armDir}`);
  const outDir = path.resolve(ROOT, flag("out", `${rel(run)}-rejudge-${arm}`));
  const sheetsDir = path.resolve(ROOT, flag("sheets", "work/patch-quality/sheets"));
  const judgeModel = flag("judge-model", "gpt-4o-mini");

  const rows: PlanRow[] = [];
  const skipped: Array<{ id: string; why: string }> = [];
  const refHashes = new Map<string, string>();
  for (const rep of readdirSync(armDir).filter((d) => d.startsWith("repeat-")).sort()) {
    const repDir = path.join(armDir, rep);
    for (const identity of readdirSync(repDir).filter((d) => statSync(path.join(repDir, d)).isDirectory()).sort()) {
      const idDir = path.join(repDir, identity);
      const refFile = path.join(sheetsDir, `${identity}.png`);
      if (!existsSync(refFile)) throw new Error(`no full sheet for ${identity} at ${refFile}`);
      if (!refHashes.has(identity)) refHashes.set(identity, sha256(readFileSync(refFile)));
      for (const cellName of readdirSync(idDir).filter((d) => statSync(path.join(idDir, d)).isDirectory()).sort()) {
        const cellDir = path.join(idDir, cellName);
        const cellPath = path.join(cellDir, "cell.json");
        if (!existsSync(cellPath)) continue;
        const cell = JSON.parse(readFileSync(cellPath, "utf8")) as Record<string, unknown>;
        const files = (cell.files ?? {}) as Record<string, string | null>;
        const id = `${rep}/${cell.id as string}`;
        if (cell.error) {
          skipped.push({ id, why: `provider error: ${String(cell.error).slice(0, 60)}` });
          continue;
        }
        if (cell.shapeProblem !== null || !files.patch) {
          skipped.push({ id, why: `failed shape: ${String(cell.shapeProblem ?? "no patch")}` });
          continue;
        }
        const patchFile = path.join(cellDir, files.patch);
        rows.push({
          id,
          arm,
          repeat: rep.replace("repeat-", ""),
          identity,
          board: cell.board as string,
          target: cell.target as string,
          patch: rel(patchFile),
          patchHash: sha256(readFileSync(patchFile)),
          judgeReference: rel(refFile),
          judgeReferenceHash: refHashes.get(identity)!,
          priorJudge: (cell.judge as PlanRow["priorJudge"]) ?? null,
          estCents: EST_JUDGE_CENTS,
        });
      }
    }
  }
  if (rows.length === 0) throw new Error(`no shape-passing cells with patches under ${armDir}`);

  const estTotal = Math.round(rows.length * EST_JUDGE_CENTS * 100) / 100;
  mkdirSync(outDir, { recursive: true });
  const plan = { createdAt: new Date().toISOString(), run: rel(run), arm, judgeModel, judgedCells: rows.length, skipped, estTotalCents: estTotal, rows };
  writeFileSync(path.join(outDir, "plan.json"), JSON.stringify(plan, null, 2));

  console.log(`${rows.length} patches to re-judge against the FULL sheet (${skipped.length} skipped as shape failures):`);
  for (const r of rows) console.log(`  ${r.id}  prior: ${r.priorJudge ? `${r.priorJudge.verdict}: ${r.priorJudge.reason ?? ""}` : "unjudged"}`);
  console.log(`estimated: ${rows.length} × ${EST_JUDGE_CENTS}¢ ≈ ${estTotal}¢ (a planning figure from the round's records, not a quote)`);
  console.log(`plan written to ${rel(path.join(outDir, "plan.json"))}`);

  if (!has("go")) {
    console.log("dry-run — nothing was asked and nothing was spent. Pass --go --budget-cents=N once the spend is approved.");
    return;
  }

  const budget = Number(flag("budget-cents", "0"));
  if (!(budget > 0)) throw new Error("--go needs --budget-cents=N (the run stops before exceeding it)");
  const key = envKey("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const judge = new OpenAiPatchJudge(key, { model: judgeModel });

  let spent = 0;
  let stopped: string | null = null;
  const verdicts: Array<PlanRow & { verdict: string; reason: string; judgeCostCents: number; model: string | null; at: string }> = [];
  const write = () =>
    writeFileSync(
      path.join(outDir, "results.json"),
      JSON.stringify({ ...plan, budgetCents: budget, spentCents: Math.round(spent * 1000) / 1000, stopped, verdicts }, null, 2),
    );
  for (const r of rows) {
    if (spent + JUDGE_RESERVE_CENTS > budget) {
      stopped = `budget: ${spent.toFixed(2)} spent, ${JUDGE_RESERVE_CENTS} reserved for the next call, ${budget} allowed`;
      console.warn(`stopping — ${stopped}`);
      break;
    }
    const verdict = await judge.judge({ patchPng: readFileSync(path.join(ROOT, r.patch)), reference: readFileSync(path.join(ROOT, r.judgeReference)), childName: r.identity, label: r.id });
    spent += verdict.costCents;
    verdicts.push({ ...r, verdict: verdict.verdict, reason: verdict.reason, judgeCostCents: verdict.costCents, model: verdict.model ?? null, at: new Date().toISOString() });
    console.log(`  ${r.id}: ${verdict.verdict}: ${verdict.reason} (prior ${r.priorJudge?.verdict ?? "—"})`);
    write();
  }
  write();
  const ok = verdicts.filter((v) => v.verdict === "ok").length;
  console.log(`${ok}/${verdicts.length} ok against the full sheet · ${spent.toFixed(2)}¢ spent · results in ${rel(path.join(outDir, "results.json"))}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
