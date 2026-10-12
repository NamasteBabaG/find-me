/**
 * Dry run for an unfinished local-patch world: which appearances a retained,
 * already-paid answer can decide for free, which still need a paid question,
 * which have no automatic question left, and whether the next question fits
 * the authorized world budget.
 *
 *   npx tsx scripts/local-patch-evidence-plan.ts <gameId>
 *
 * Read-only. It never reserves, settles, dispatches a provider call, writes a
 * row or an audit record, or reads a customer photo; it hashes stored game
 * pixels only to bind each decision to the exact image. Output holds hide ids,
 * plan classes, machine codes and micro-USD amounts, never answer text. It
 * reads whatever DATABASE_URL and storage settings are in the environment.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Fill only what the environment does not already provide; no .env is required.
const local = path.resolve(process.cwd(), ".env");
if (existsSync(local)) for (const line of readFileSync(local, "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*(#.*)?$/.exec(line);
  if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = (m[2] ?? "").trim();
}

async function main() {
  const gameId = process.argv[2];
  if (!gameId || gameId.startsWith("-")) {
    console.error("usage: npx tsx scripts/local-patch-evidence-plan.ts <gameId>");
    process.exit(2);
  }
  const { getContainer } = await import("../src/services/container");
  const { planLocalPatchEvidenceRecovery } = await import("../src/services/generation/local-patch-evidence-plan");
  const c = getContainer();
  try { console.log(JSON.stringify(await planLocalPatchEvidenceRecovery(c, gameId), null, 2)); }
  finally { await c.db.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
