/** QA-only additive rollout. --dry-run executes DDL and rolls back; --apply
 * commits; --verify checks metadata. Never prints credentials or customer data. */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const timestamp = "timestamp(3) without time zone";
const columns = {
  ChildWorldPurchase: [
    ["id", "text", false], ["ownerId", "text", false], ["familyChildId", "text", false], ["worldSlug", "text", false],
    ["activeGameId", "text", true], ["returnGameId", "text", true], ["createdAt", timestamp, false, "current_timestamp"], ["updatedAt", timestamp, false],
  ],
  GuestShare: [
    ["id", "text", false], ["gameId", "text", false], ["ownerId", "text", false], ["worldSlug", "text", false],
    ["tokenHash", "text", false], ["sourceConfigSha256", "text", false], ["configJson", "text", false],
    ["createdAt", timestamp, false, "current_timestamp"], ["expiresAt", timestamp, false], ["resultsDeleteAt", timestamp, false],
    ["revokedAt", timestamp, true], ["revision", "integer", false, "0"], ["seenRevision", "integer", false, "0"],
  ],
  GuestParticipant: [
    ["id", "text", false], ["shareId", "text", false], ["tokenHash", "text", false], ["nicknameId", "text", false],
    ["snapshotJson", "text", false], ["revision", "integer", false, "0"], ["activityRevision", "integer", false, "0"],
    ["createdAt", timestamp, false, "current_timestamp"], ["updatedAt", timestamp, false], ["removedAt", timestamp, true],
  ],
  // The older Order shape is deliberately untouched; only the additive fields are asserted.
  Order: [["checkoutKey", "text", true], ["checkoutClaimUntil", timestamp, true]],
};
const indexes = [
  ["ChildWorldPurchase", "ChildWorldPurchase_pkey", ["id"], true, true],
  ["ChildWorldPurchase", "ChildWorldPurchase_familyChildId_worldSlug_key", ["familyChildId", "worldSlug"], true, false],
  ["ChildWorldPurchase", "ChildWorldPurchase_activeGameId_key", ["activeGameId"], true, false],
  ["ChildWorldPurchase", "ChildWorldPurchase_ownerId_idx", ["ownerId"], false, false],
  ["GuestShare", "GuestShare_pkey", ["id"], true, true],
  ["GuestShare", "GuestShare_tokenHash_key", ["tokenHash"], true, false],
  ["GuestShare", "GuestShare_gameId_worldSlug_createdAt_idx", ["gameId", "worldSlug", "createdAt"], false, false],
  ["GuestShare", "GuestShare_resultsDeleteAt_idx", ["resultsDeleteAt"], false, false],
  ["GuestParticipant", "GuestParticipant_pkey", ["id"], true, true],
  ["GuestParticipant", "GuestParticipant_tokenHash_key", ["tokenHash"], true, false],
  ["GuestParticipant", "GuestParticipant_shareId_createdAt_idx", ["shareId", "createdAt"], false, false],
  ["Order", "Order_checkoutKey_key", ["checkoutKey"], true, false],
];
const foreignKeys = [
  ["ChildWorldPurchase", "ChildWorldPurchase_ownerId_fkey", ["ownerId"], "User", "c"],
  ["ChildWorldPurchase", "ChildWorldPurchase_familyChildId_fkey", ["familyChildId"], "FamilyChild", "c"],
  ["ChildWorldPurchase", "ChildWorldPurchase_activeGameId_fkey", ["activeGameId"], "Game", "n"],
  ["GuestShare", "GuestShare_gameId_fkey", ["gameId"], "Game", "c"],
  ["GuestParticipant", "GuestParticipant_shareId_fkey", ["shareId"], "GuestShare", "c"],
];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const mismatch = field => { throw new Error(`Friends migration metadata mismatch: ${field}`); };

/** Pure and import-safe. Reject a pre-existing table/index that IF NOT EXISTS
 * silently accepted. Errors identify schema fields, never row contents. */
export function assertFriendsMigrationMetadata(metadata, schema) {
  if (!/^[a-z][a-z0-9_]*$/.test(schema ?? "") || !Array.isArray(metadata?.columns)
    || !Array.isArray(metadata?.indexes) || !Array.isArray(metadata?.constraints)) mismatch("metadata");
  for (const [table, expected] of Object.entries(columns)) {
    const actual = metadata.columns.filter(row => row.table === table);
    if (table !== "Order" && actual.length !== expected.length) mismatch(`${table}.columns`);
    for (const [name, type, nullable, defaultValue = null] of expected) {
      const found = actual.filter(row => row.name === name);
      const row = found[0];
      if (found.length !== 1 || row.type !== type || row.nullable !== nullable || row.identity !== "" || row.generated !== ""
        || (row.default === null ? null : row.default?.trim().toLowerCase()) !== defaultValue) mismatch(`${table}.${name}`);
    }
  }
  for (const [table, name, keys, unique, primary] of indexes) {
    const found = metadata.indexes.filter(row => row.table === table && row.name === name), row = found[0];
    if (found.length !== 1 || !same(row.columns, keys) || row.unique !== unique || row.primary !== primary
      || !row.valid || !row.ready || !row.live || !row.immediate || row.method !== "btree" || row.partial || row.expression
      || row.nullsNotDistinct || row.keyCount !== keys.length || row.columnCount !== keys.length
      || !same(row.options, keys.map(() => 0))
      || !same(row.keyDefinitions?.map(value => value.replace(/^"([A-Za-z0-9_]+)"$/, "$1")), keys)) mismatch(`${table}.${name}`);
  }
  // An extra unique constraint can reject otherwise valid inserts. Additional
  // non-unique performance indexes are harmless and are not owned by this rollout.
  const newTables = Object.keys(columns).filter(table => table !== "Order");
  if (metadata.indexes.some(row => newTables.includes(row.table) && row.unique
    && !indexes.some(([table, name]) => row.table === table && row.name === name))) mismatch("unexpected unique index");
  const actualConstraints = metadata.constraints.filter(row => newTables.includes(row.table));
  if (actualConstraints.length !== newTables.length + foreignKeys.length) mismatch("constraints");
  for (const table of newTables) {
    const found = actualConstraints.filter(row => row.table === table && row.kind === "p"), row = found[0];
    if (found.length !== 1 || row.name !== `${table}_pkey` || !same(row.columns, ["id"])
      || !row.validated || row.deferrable || row.deferred) mismatch(`${table}.primary key`);
  }
  for (const [table, name, keys, targetTable, deleteAction] of foreignKeys) {
    const found = actualConstraints.filter(row => row.table === table && row.name === name), row = found[0];
    if (found.length !== 1 || row.kind !== "f" || !same(row.columns, keys) || row.targetSchema !== schema
      || row.targetTable !== targetTable || !same(row.targetColumns, ["id"]) || row.deleteAction !== deleteAction
      || row.updateAction !== "c" || row.match !== "s" || !row.validated || row.deferrable || row.deferred) mismatch(`${table}.${name}`);
  }
  return { columns: Object.values(columns).reduce((sum, rows) => sum + rows.length, 0), indexes: indexes.length,
    primaryKeys: newTables.length, foreignKeys: foreignKeys.length };
}

export async function verifyFriendsMigrationMetadata(tx, schema) {
  const actualColumns = await tx.$queryRawUnsafe(`SELECT c.relname::text AS "table",a.attname::text AS name,
    pg_catalog.format_type(a.atttypid,a.atttypmod) AS type,NOT a.attnotnull AS nullable,
    pg_catalog.pg_get_expr(d.adbin,d.adrelid) AS "default",a.attidentity::text AS identity,a.attgenerated::text AS generated
    FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname=$1 AND c.relname IN ('ChildWorldPurchase','GuestShare','GuestParticipant','Order')
      AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`, schema);
  const actualIndexes = await tx.$queryRawUnsafe(`SELECT t.relname::text AS "table",c.relname::text AS name,
    i.indisunique AS "unique",i.indisprimary AS "primary",i.indisvalid AS valid,i.indisready AS ready,i.indislive AS live,
    i.indimmediate AS immediate,am.amname::text AS method,i.indpred IS NOT NULL AS "partial",i.indexprs IS NOT NULL AS expression,
    coalesce((to_jsonb(i)->>'indnullsnotdistinct')::boolean,false) AS "nullsNotDistinct",
    i.indnkeyatts::int AS "keyCount",i.indnatts::int AS "columnCount",
    ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY AS k(num,position)
      JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.num ORDER BY k.position) AS columns,
    ARRAY(SELECT flags.value::int FROM unnest(i.indoption) AS flags(value)) AS options,
    ARRAY(SELECT pg_catalog.pg_get_indexdef(i.indexrelid,k.position::int,true)
      FROM generate_series(1,i.indnkeyatts) AS k(position) ORDER BY k.position) AS "keyDefinitions"
    FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class t ON t.oid=i.indrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
    JOIN pg_catalog.pg_am am ON am.oid=c.relam
    WHERE n.nspname=$1 AND t.relname IN ('ChildWorldPurchase','GuestShare','GuestParticipant','Order') ORDER BY t.relname,c.relname`, schema);
  const actualConstraints = await tx.$queryRawUnsafe(`SELECT t.relname::text AS "table",c.conname::text AS name,c.contype::text AS kind,
    c.convalidated AS validated,c.condeferrable AS deferrable,c.condeferred AS deferred,
    ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY AS k(num,position)
      JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.num ORDER BY k.position) AS columns,
    rn.nspname::text AS "targetSchema",r.relname::text AS "targetTable",
    ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY AS k(num,position)
      JOIN pg_catalog.pg_attribute a ON a.attrelid=r.oid AND a.attnum=k.num ORDER BY k.position) AS "targetColumns",
    c.confdeltype::text AS "deleteAction",c.confupdtype::text AS "updateAction",c.confmatchtype::text AS "match"
    FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
    JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace LEFT JOIN pg_catalog.pg_class r ON r.oid=c.confrelid
    LEFT JOIN pg_catalog.pg_namespace rn ON rn.oid=r.relnamespace
    WHERE n.nspname=$1 AND t.relname IN ('ChildWorldPurchase','GuestShare','GuestParticipant') AND c.contype IN ('p','f') ORDER BY t.relname,c.conname`, schema);
  return assertFriendsMigrationMetadata({ columns: actualColumns, indexes: actualIndexes, constraints: actualConstraints }, schema);
}

async function main() {
const mode = process.argv[2];
if (!["--dry-run", "--apply", "--verify"].includes(mode)) throw new Error("Choose --dry-run, --apply or --verify");
const target = new URL(process.env.DATABASE_URL ?? ""), schema = target.searchParams.get("schema");
const project = JSON.parse(readFileSync(".vercel/project.json", "utf8"));
if (project.projectName !== "find-me-qa" || process.env.APP_ENV !== "qa" || schema !== "qa"
  || !["postgres:", "postgresql:"].includes(target.protocol) || process.env.PAYMENT_PROVIDER !== "mock") throw new Error("Refusing non-QA target");
const source = readFileSync("prisma/changes/20261005-friends-world-purchases.sql", "utf8");
const sql = source.replaceAll("__FINDME_SCHEMA__", schema);
const db = new PrismaClient();
class DryRunRollback extends Error {}
let report;
try {
  await db.$transaction(async tx => {
    const [scope] = await tx.$queryRawUnsafe("SELECT current_schema() AS schema");
    if (scope.schema !== schema) throw new Error("Database scope is not QA");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
    await tx.$executeRawUnsafe("DO $$ BEGIN PERFORM pg_advisory_xact_lock(20261005); END $$");
    const fingerprint = async () => (await tx.$queryRawUnsafe(`SELECT count(*)::int AS games,
      md5(coalesce(string_agg("id" || coalesce("ownerId", '') || "status" || coalesce("configJson", '') || coalesce("childProfileId", ''), '|' ORDER BY "id"), '')) AS content FROM "qa"."Game"`))[0];
    const before = await fingerprint();
    if (mode !== "--verify") for (const statement of sql.split("-- statement-break").map(s => s.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement);
    const after = await fingerprint();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Game content changed during migration");
    const tables = await tx.$queryRawUnsafe(`SELECT c.relname AS name,c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='qa' AND c.relname IN ('ChildWorldPurchase','GuestShare','GuestParticipant') AND c.relkind='r' ORDER BY c.relname`);
    if (tables.length !== 3 || tables.some(row => !row.rls)) throw new Error("Server-only tables or RLS missing");
    const [grants] = await tx.$queryRawUnsafe(`SELECT count(*)::int AS count FROM information_schema.role_table_grants WHERE table_schema='qa'
      AND table_name IN ('ChildWorldPurchase','GuestShare','GuestParticipant') AND grantee IN ('PUBLIC','anon','authenticated')`);
    if (grants.count !== 0) throw new Error("Client Data API privileges must be absent");
    const metadata = await verifyFriendsMigrationMetadata(tx, schema);
    report = { mode, schema, unchangedGames: before.games, tables, clientGrants: grants.count, metadata, sqlSha256: createHash("sha256").update(source).digest("hex"), at: new Date().toISOString() };
    if (mode === "--dry-run") throw new DryRunRollback();
  }, { timeout: 60_000, isolationLevel: "Serializable" });
} catch (error) { if (!(error instanceof DryRunRollback)) throw error; }
finally { await db.$disconnect(); }
mkdirSync("output/friends-world-release", { recursive: true });
writeFileSync(`output/friends-world-release/migration-${mode.slice(2)}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
