/**
 * The opt-in subject upgrade of ONE paid local-patch world still in generation
 * (src/services/generation/subject-upgrade.ts). Identifiers are always supplied;
 * nothing here names a customer, reads a .env file or prints image bytes.
 *
 *   npx tsx scripts/subject-upgrade.ts plan  --game=<gameId> --owner=<ownerId>
 *   npx tsx scripts/subject-upgrade.ts apply --game=<gameId> --owner=<ownerId> --operator=<operatorId> --plan=<planSha256>
 *
 * `plan` is read-only. `apply` writes the immutable enrollment only for the exact
 * plan digest it is given, only while no worker holds the lease, then runs the
 * ordinary interrupted-review recovery; applying again changes nothing. The world
 * then continues through the normal queue (cron or a direct tick).
 */
function flag(name: string): string {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  if (!hit || hit.length === name.length + 3) throw new Error(`--${name}=<value> is required`);
  return hit.slice(name.length + 3);
}

async function main() {
  const command = process.argv[2];
  if (command !== "plan" && command !== "apply") throw new Error("usage: subject-upgrade.ts plan|apply --game=<id> --owner=<id> [--operator=<id> --plan=<sha>]");
  const gameId = flag("game"), ownerId = flag("owner");
  const { getContainer } = await import("../src/services/container");
  const { applySubjectUpgrade, planSubjectUpgrade } = await import("../src/services/generation/subject-upgrade");
  const c = getContainer();
  if (command === "plan") {
    console.log(JSON.stringify(await planSubjectUpgrade(c, { gameId, ownerId }), null, 2));
    return;
  }
  const result = await applySubjectUpgrade(c, { gameId, ownerId, operatorId: flag("operator"), expectedPlanSha256: flag("plan") });
  console.log(JSON.stringify({ applied: result.applied, recovered: result.recovered, enrolledAt: result.receipt.enrolledAt,
    subjectPolicy: result.receipt.subjectPolicy, continuityTransport: result.receipt.continuityTransport, reviewRecovery: result.receipt.reviewRecovery }, null, 2));
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); });
export {};
