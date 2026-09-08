/**
 * Settle one unresolved entry of a GenerationBudget ledger by hand, so the
 * round can go on without pretending the money was not spent.
 *
 *   npx tsx scripts/budget-reconcile.ts <budget-dir> <entry-id> --as-reserve "why"
 *
 * `--as-reserve` charges the entry its whole reservation (the conservative
 * answer for a timed-out call whose bill is unknown) and records the reason;
 * nothing is ever released to zero here.
 */
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";

const [dir, idArg, mode, ...why] = process.argv.slice(2);
if (!dir || !idArg || mode !== "--as-reserve") throw new Error("usage: budget-reconcile.ts <budget-dir> <entry-id> --as-reserve <reason>");
const file = path.join(dir, "requests.json");
const ledger = JSON.parse(readFileSync(file, "utf8")) as { entries: Array<{ id: number; kind: string; reserve: number; state: string; cents: number; reconciled?: string }>; spentCents: number; held: boolean };
const entry = ledger.entries.find((e) => e.id === Number(idArg));
if (!entry) throw new Error(`no entry ${idArg}`);
if (entry.state === "known") throw new Error(`entry ${idArg} is already settled`);
entry.state = "known";
entry.cents = entry.reserve;
entry.reconciled = `${new Date().toISOString()}: charged at the reservation (${entry.reserve} cents); ${why.join(" ") || "no reason given"}`;
ledger.spentCents = ledger.entries.reduce((n, e) => n + e.cents, 0);
ledger.held = ledger.entries.some((e) => e.state !== "known");
const temp = `${file}.tmp`;
writeFileSync(temp, JSON.stringify(ledger, null, 2));
renameSync(temp, file);
console.log(`entry ${entry.id} (${entry.kind}) charged ${entry.cents} cents; ledger now ${ledger.spentCents.toFixed(2)} cents, held=${ledger.held}`);
