/** Explicit QA-only additive migration. No credentials or child names in logs.
 * vercel env run -e production -- node scripts/qa-passport-migrate.mjs --dry-run
 * After review: --apply. A dry run executes the actual DDL/backfill then rolls back.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const mode = process.argv[2];
if (!["--dry-run", "--apply", "--verify"].includes(mode)) throw new Error("Choose --dry-run, --apply or --verify");
const target = new URL(process.env.DATABASE_URL ?? "");
const project = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
if (project.projectName !== "find-me-qa" || process.env.APP_ENV !== "qa" || target.searchParams.get("schema") !== "qa"
  || !["postgres:", "postgresql:"].includes(target.protocol) || process.env.PAYMENT_PROVIDER !== "mock") throw new Error("Refusing non-QA target");
const db = new PrismaClient();
const sql = readFileSync("prisma/changes/20260917-passport.sql", "utf8");
class DryRunRollback extends Error {}
let report;
try {
  await db.$transaction(async tx => {
    const [scope] = await tx.$queryRawUnsafe('SELECT current_schema() AS schema');
    if (scope.schema !== "qa") throw new Error("Database search path is not QA");
    // Bound locks: do not stall QA if a generation/checkout is writing.
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
    await tx.$executeRawUnsafe("DO $$ BEGIN PERFORM pg_advisory_xact_lock(20260917); END $$");
    const fingerprint = async () => (await tx.$queryRawUnsafe(`SELECT count(*)::int AS games,
      md5(coalesce(string_agg("id" || coalesce("ownerId", '') || "status" || coalesce("configJson", '') || coalesce("childProfileId", ''), '|' ORDER BY "id"), '')) AS content
      FROM "Game"`))[0];
    const before = await fingerprint();
    if (mode !== "--verify") for (const statement of sql.split("-- statement-break").map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
    const after = await fingerprint();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Game content changed during migration");
    const [counts] = await tx.$queryRawUnsafe(`SELECT
      (SELECT count(*)::int FROM "FamilyChild") AS children,
      (SELECT count(*)::int FROM "Game" WHERE "familyChildId" IS NOT NULL) AS linked,
      (SELECT count(*)::int FROM "Game" g JOIN "ChildProfile" c ON c."id"=g."childProfileId" AND c."ownerId"=g."ownerId" AND c."deletedAt" IS NULL
        WHERE g."familyChildId" IS NULL AND g."deletedAt" IS NULL AND g."status" NOT IN ('CANCELLED','REFUNDED','DELETED')
        AND EXISTS (SELECT 1 FROM "Order" o WHERE o."gameId"=g."id" AND o."userId"=g."ownerId" AND o."paymentStatus"='PAID')) AS unlinked`);
    if (counts.unlinked !== 0) throw new Error("Eligible paid adventures are still unlinked");
    // Query newly deployed fields with the generated PostgreSQL client too.
    await tx.passportShare.findMany({ take: 1, select: { tokenHash: true, expiresAt: true } });
    await tx.passportPagePreference.count();
    report = { mode, schema: scope.schema, unchangedGames: before.games, ...counts, sqlSha256: createHash("sha256").update(sql).digest("hex"), at: new Date().toISOString() };
    if (mode === "--dry-run") throw new DryRunRollback();
  }, { timeout: 60_000, isolationLevel: "Serializable" });
} catch (error) {
  if (!(error instanceof DryRunRollback)) throw error;
} finally { await db.$disconnect(); }
mkdirSync("output/passport-release", { recursive: true });
writeFileSync(`output/passport-release/migration-${mode.slice(2)}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
