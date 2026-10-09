/** QA-only additive rollout of Game.searchLevel. Run it BEFORE deploying the client that reads the column.
 *   vercel env run -e production -- node scripts/qa-search-level-migrate.mjs --dry-run
 * --dry-run executes the DDL and rolls back; --apply commits; --verify only checks.
 * Never prints credentials, child names or row contents. */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const SQL_PATH = "prisma/changes/20261009-search-level.sql";
const LEVELS = ["explorers", "detectives"];

/** Pure and import-safe. `IF NOT EXISTS` accepts a column that already exists with another
 * shape, so the shape is asserted: nullable text, no default, nothing generated. */
export function assertSearchLevelColumn(rows) {
  const found = Array.isArray(rows) ? rows.filter(row => row?.name === "searchLevel") : [];
  const row = found[0];
  if (found.length !== 1 || row.type !== "text" || row.nullable !== true || row.default !== null
    || row.identity !== "" || row.generated !== "") throw new Error("Game.searchLevel metadata mismatch");
  return { column: "searchLevel", type: row.type, nullable: row.nullable };
}

/** Values outside the closed list would be read as corrupt data by domain/search-level.ts. */
export function assertSearchLevelValues(counts) {
  const unknown = (counts ?? []).filter(row => row.level !== null && !LEVELS.includes(row.level));
  if (unknown.length) throw new Error("Game.searchLevel holds a value outside the closed list");
  return Object.fromEntries((counts ?? []).map(row => [row.level ?? "null", row.games]));
}

async function main() {
  const mode = process.argv[2];
  if (!["--dry-run", "--apply", "--verify"].includes(mode)) throw new Error("Choose --dry-run, --apply or --verify");
  const target = new URL(process.env.DATABASE_URL ?? ""), schema = target.searchParams.get("schema");
  const project = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
  if (project.projectName !== "find-me-qa" || process.env.APP_ENV !== "qa" || schema !== "qa"
    || !["postgres:", "postgresql:"].includes(target.protocol) || process.env.PAYMENT_PROVIDER !== "mock") throw new Error("Refusing non-QA target");
  const source = readFileSync(SQL_PATH, "utf8");
  const sql = source.replaceAll("__FINDME_SCHEMA__", schema);
  const db = new PrismaClient();
  class DryRunRollback extends Error {}
  let report;
  try {
    await db.$transaction(async tx => {
      const [scope] = await tx.$queryRawUnsafe("SELECT current_schema() AS schema");
      if (scope.schema !== schema) throw new Error("Database scope is not QA");
      // Bound locks: never stall QA while a generation or checkout is writing.
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
      await tx.$executeRawUnsafe("DO $$ BEGIN PERFORM pg_advisory_xact_lock(20261009); END $$");
      const fingerprint = async () => (await tx.$queryRawUnsafe(`SELECT count(*)::int AS games,
        md5(coalesce(string_agg("id" || coalesce("ownerId", '') || "status" || coalesce("configJson", '') || coalesce("childProfileId", ''), '|' ORDER BY "id"), '')) AS content
        FROM "qa"."Game"`))[0];
      const before = await fingerprint();
      if (mode !== "--verify") for (const statement of sql.split("-- statement-break").map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
      const after = await fingerprint();
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Game content changed during migration");
      const column = assertSearchLevelColumn(await tx.$queryRawUnsafe(`SELECT a.attname::text AS name,
        pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,NOT a.attnotnull AS nullable,
        pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS "default",a.attidentity::text AS identity,a.attgenerated::text AS generated
        FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE n.nspname=$1 AND c.relname='Game' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped AND a.attname='searchLevel'`, schema));
      const levels = assertSearchLevelValues(await tx.$queryRawUnsafe(`SELECT "searchLevel" AS level, count(*)::int AS games FROM "qa"."Game" GROUP BY 1 ORDER BY 1`));
      // The generated client must read the new field against this database.
      await tx.game.findFirst({ select: { id: true, searchLevel: true } });
      report = { mode, schema, unchangedGames: before.games, column, levels, sqlSha256: createHash("sha256").update(source).digest("hex"), at: new Date().toISOString() };
      if (mode === "--dry-run") throw new DryRunRollback();
    }, { timeout: 60_000, isolationLevel: "Serializable" });
  } catch (error) { if (!(error instanceof DryRunRollback)) throw error; }
  finally { await db.$disconnect(); }
  mkdirSync("output/search-level-release", { recursive: true });
  writeFileSync(`output/search-level-release/migration-${mode.slice(2)}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
