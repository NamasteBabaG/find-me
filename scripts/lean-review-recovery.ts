/**
 * The explicit release of ONE existing lean world whose continuation quota (2 under v1, 4 under v2) parked it for a
 * person (src/services/generation/lean-review-recovery.ts, local-patch-lean-review-recovery/v1). Identifiers are always
 * supplied; nothing here names a customer, reads a .env file or prints image bytes.
 *
 *   npx tsx scripts/lean-review-recovery.ts plan  --game=<gameId>
 *   npx tsx scripts/lean-review-recovery.ts apply --game=<gameId> --operator=<operatorId> --plan=<planSha256>
 *
 * `plan` is read-only. `apply` writes one pin bound to the exact hold, held requests and ledger the plan read, and
 * nothing else: no job, game, ledger or provider write. Applying again changes nothing. The scheduled tick then gives the
 * bound hold its turns, and the world's own slice continues it under v3 or says exactly why it cannot.
 */
function flag(name: string): string {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  if (!hit || hit.length === name.length + 3) throw new Error(`--${name}=<value> is required`);
  return hit.slice(name.length + 3);
}

async function main() {
  const command = process.argv[2];
  if (command !== "plan" && command !== "apply") throw new Error("usage: lean-review-recovery.ts plan|apply --game=<id> [--operator=<id> --plan=<sha>]");
  const gameId = flag("game");
  const { getContainer } = await import("../src/services/container");
  const { applyLeanReviewRecovery, planLeanReviewRecovery } = await import("../src/services/generation/lean-review-recovery");
  const c = getContainer();
  if (command === "plan") {
    console.log(JSON.stringify(await planLeanReviewRecovery(c, { gameId }), null, 2));
    return;
  }
  const result = await applyLeanReviewRecovery(c, { gameId, operatorId: flag("operator"), expectedPlanSha256: flag("plan") });
  console.log(JSON.stringify({ applied: result.applied, mode: result.receipt.mode, version: result.receipt.version,
    authorizedAt: result.receipt.mode === "existing-world" ? result.receipt.authorizedAt : null }, null, 2));
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
export {};
