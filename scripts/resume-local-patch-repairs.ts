/** Explicit internal QA operation. Supply environment via the approved shell or
 * env runner; this script never reads/writes env files or starts generation.
 * npx tsx scripts/resume-local-patch-repairs.ts --game-id=ID --operator-id=ID --reason="Explicit authorization reference" --execute
 */
async function main() {
  const args = process.argv.slice(2);
  const value = (name: string) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? "";
  if (!args.includes("--execute") || !value("game-id") || !value("operator-id") || !value("reason")) {
    throw new Error("Usage: --game-id=ID --operator-id=ID --reason=AUTHORIZATION --execute; no defaults or bulk selection");
  }
  const database = new URL(process.env.DATABASE_URL ?? "");
  if (!["postgres:", "postgresql:"].includes(database.protocol) || database.searchParams.get("schema") !== "qa") {
    throw new Error("LOCAL_PATCH_REPAIR_RESUME: operational resume requires an explicit Postgres qa schema");
  }
  const { getContainer } = await import("../src/services/container");
  const { resumeLocalPatchRepairs } = await import("../src/services/generation/local-patch-repair-resume");
  const c = getContainer();
  try { console.log(JSON.stringify(await resumeLocalPatchRepairs(c, { gameId: value("game-id"), operatorId: value("operator-id"), authorizationReason: value("reason") }))); }
  finally { await c.db.$disconnect(); }
}
main().catch(error => {
  // Do not print provider/database connection diagnostics that may contain secrets.
  console.error(error instanceof Error && (error.message.startsWith("LOCAL_PATCH_REPAIR_RESUME:") || error.message.startsWith("Usage:"))
    ? error.message : "Resume failed; no successful result was returned. Inspect the exact game's audit before retrying.");
  process.exitCode = 1;
});
