import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Metadata = {
  columns: Array<{ table: string; name: string; type: string; nullable: boolean; default: string | null; identity: string; generated: string }>;
  indexes: Array<{ table: string; name: string; columns: string[]; unique: boolean; primary: boolean; valid: boolean; ready: boolean; live: boolean;
    immediate: boolean; method: string; partial: boolean; expression: boolean; nullsNotDistinct: boolean; keyCount: number; columnCount: number; options: number[]; keyDefinitions: string[] }>;
  constraints: Array<{ table: string; name: string; columns: string[]; kind: string; validated: boolean; deferrable: boolean; deferred: boolean;
    targetSchema: string | null; targetTable: string | null; targetColumns: string[]; deleteAction: string; updateAction: string; match: string }>;
};
const moduleUrl = pathToFileURL(path.resolve("scripts/qa-friends-world-migrate.mjs")).href;
const sql = readFileSync("prisma/changes/20261005-friends-world-purchases.sql", "utf8");
const keys = (value: string) => [...value.matchAll(/"([^"]+)"/g)].map(match => match[1]!);

/** Synthetic catalog rows derived from the checked-in DDL, not the helper's
 * private expected shape. Importing the CLI cannot open a DB or read .vercel. */
function fixture(): Metadata {
  const rows: Metadata = { columns: [], indexes: [], constraints: [] };
  const index = (table: string, name: string, columns: string[], unique: boolean, primary: boolean) => ({ table, name, columns, unique, primary,
    valid: true, ready: true, live: true, immediate: true, method: "btree", partial: false, expression: false, nullsNotDistinct: false,
    keyCount: columns.length, columnCount: columns.length, options: columns.map(() => 0), keyDefinitions: columns.map(name => `"${name}"`) });
  for (const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS "__FINDME_SCHEMA__"\."([^"]+)" \(([\s\S]*?)\n\);/g)) {
    const table = match[1]!, body = match[2]!;
    for (const column of body.matchAll(/"([^"]+)"\s+(TEXT|TIMESTAMP\(3\)|INTEGER)([^,\n]*)/g)) {
      const suffix = column[3]!;
      rows.columns.push({ table, name: column[1]!, type: column[2] === "TIMESTAMP(3)" ? "timestamp(3) without time zone" : column[2]!.toLowerCase(),
        nullable: !/NOT NULL|PRIMARY KEY/.test(suffix), default: /DEFAULT (CURRENT_TIMESTAMP|0)/.exec(suffix)?.[1]?.toLowerCase() ?? null, identity: "", generated: "" });
      if (suffix.includes("PRIMARY KEY")) {
        rows.indexes.push(index(table, `${table}_pkey`, [column[1]!], true, true));
        rows.constraints.push({ table, name: `${table}_pkey`, columns: [column[1]!], kind: "p", validated: true, deferrable: false, deferred: false,
          targetSchema: null, targetTable: null, targetColumns: [], deleteAction: " ", updateAction: " ", match: " " });
      }
    }
    for (const fk of body.matchAll(/CONSTRAINT "([^"]+)" FOREIGN KEY \(([^)]+)\) REFERENCES "__FINDME_SCHEMA__"\."([^"]+)"\(([^)]+)\) ON DELETE (CASCADE|SET NULL) ON UPDATE CASCADE/g)) {
      rows.constraints.push({ table, name: fk[1]!, columns: keys(fk[2]!), kind: "f", validated: true, deferrable: false, deferred: false,
        targetSchema: "qa", targetTable: fk[3]!, targetColumns: keys(fk[4]!), deleteAction: fk[5] === "CASCADE" ? "c" : "n", updateAction: "c", match: "s" });
    }
  }
  for (const match of sql.matchAll(/ALTER TABLE "__FINDME_SCHEMA__"\."Order" ADD COLUMN IF NOT EXISTS "([^"]+)" (TEXT|TIMESTAMP\(3\));/g)) {
    rows.columns.push({ table: "Order", name: match[1]!, type: match[2] === "TEXT" ? "text" : "timestamp(3) without time zone", nullable: true, default: null, identity: "", generated: "" });
  }
  for (const match of sql.matchAll(/CREATE (UNIQUE )?INDEX IF NOT EXISTS "([^"]+)" ON "__FINDME_SCHEMA__"\."([^"]+)" \(([^)]+)\);/g)) {
    rows.indexes.push(index(match[3]!, match[2]!, keys(match[4]!), Boolean(match[1]), false));
  }
  return rows;
}
function run(metadata: Metadata, query = false) {
  const script = query ? `
    import { verifyFriendsMigrationMetadata } from ${JSON.stringify(moduleUrl)};
    const metadata=JSON.parse(process.argv[1]), calls=[];
    const tx={$queryRawUnsafe:async(sql,schema)=>{calls.push({sql,schema});return [metadata.columns,metadata.indexes,metadata.constraints][calls.length-1]}};
    console.log(JSON.stringify({result:await verifyFriendsMigrationMetadata(tx,'qa'),calls}));
  ` : `import { assertFriendsMigrationMetadata } from ${JSON.stringify(moduleUrl)};
    console.log(JSON.stringify(assertFriendsMigrationMetadata(JSON.parse(process.argv[1]),'qa')));`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", script, JSON.stringify(metadata)], {
    encoding: "utf8", timeout: 10_000, windowsHide: true,
    env: { ...process.env, DATABASE_URL: "invalid-synthetic-no-connection", APP_ENV: "test" },
  });
}

describe("friends rollout metadata acceptance", () => {
  it("accepts the exact additive migration without a database, allowing untouched Order columns", () => {
    const metadata = fixture();
    metadata.columns.push({ table: "Order", name: "legacyField", type: "text", nullable: true, default: null, identity: "", generated: "" });
    const result = run(metadata);
    expect(result.error).toBeUndefined(); expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ columns: 33, indexes: 12, primaryKeys: 3, foreignKeys: 5 });
  });
  it.each<[string, (metadata: Metadata) => void]>([
    ["wrong column type/precision", rows => { rows.columns.find(row => row.name === "expiresAt")!.type = "timestamp without time zone"; }],
    ["wrong nullability", rows => { rows.columns.find(row => row.name === "checkoutKey")!.nullable = false; }],
    ["wrong default", rows => { rows.columns.find(row => row.name === "revision")!.default = "10"; }],
    ["missing column", rows => { rows.columns = rows.columns.filter(row => row.name !== "activityRevision"); }],
    ["extra required column", rows => { rows.columns.push({ ...rows.columns[0]!, name: "unexpected", nullable: false }); }],
    ["missing index", rows => { rows.indexes = rows.indexes.filter(row => row.name !== "Order_checkoutKey_key"); }],
    ["wrong unique columns/order", rows => { rows.indexes.find(row => row.name === "ChildWorldPurchase_familyChildId_worldSlug_key")!.columns.reverse(); }],
    ["nonunique checkout key", rows => { rows.indexes.find(row => row.name === "Order_checkoutKey_key")!.unique = false; }],
    ["NULLS NOT DISTINCT checkout key", rows => { rows.indexes.find(row => row.name === "Order_checkoutKey_key")!.nullsNotDistinct = true; }],
    ["invalid index", rows => { rows.indexes[0]!.valid = false; }],
    ["different index operator class", rows => { rows.indexes[0]!.keyDefinitions = ["id text_pattern_ops"]; }],
    ["different index collation", rows => { rows.indexes[0]!.keyDefinitions = ['id COLLATE "C"']; }],
    ["partial unique index", rows => { rows.indexes.find(row => row.name === "GuestShare_tokenHash_key")!.partial = true; }],
    ["deferrable unique index", rows => { rows.indexes[0]!.immediate = false; }],
    ["unexpected unique constraint", rows => { rows.indexes.push({ ...rows.indexes[0]!, name: "unexpected_unique" }); }],
    ["wrong primary key", rows => { rows.constraints.find(row => row.kind === "p")!.columns = ["ownerId"]; }],
    ["wrong FK target schema", rows => { rows.constraints.find(row => row.kind === "f")!.targetSchema = "public"; }],
    ["wrong FK cascade", rows => { rows.constraints.find(row => row.name === "ChildWorldPurchase_activeGameId_fkey")!.deleteAction = "c"; }],
    ["unvalidated FK", rows => { rows.constraints.find(row => row.kind === "f")!.validated = false; }],
  ])("refuses pre-existing %s silently accepted by IF NOT EXISTS", (_name, mutate) => {
    const metadata = fixture(); mutate(metadata);
    const result = run(metadata);
    expect(result.status).toBe(1); expect(result.stderr).toContain("Friends migration metadata mismatch:");
  });
  it("queries only three bounded catalog projections with a parameterized schema, never customer model rows", () => {
    const result = run(fixture(), true);
    expect(result.status, result.stderr).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.calls).toHaveLength(3);
    for (const call of data.calls) {
      expect(call.schema).toBe("qa"); expect(call.sql.trim()).toMatch(/^SELECT /);
      expect(call.sql).toContain("n.nspname=$1"); expect(call.sql).toContain("pg_catalog.");
      expect(call.sql).not.toMatch(/FROM "qa"\."(?:Game|Order|GuestShare|GuestParticipant)"/);
    }
  });
});
