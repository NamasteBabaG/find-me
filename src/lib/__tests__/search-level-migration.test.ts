import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

type Column = { name: string; type: string; nullable: boolean; default: string | null; identity: string; generated: string };
const moduleUrl = pathToFileURL(path.resolve("scripts/qa-search-level-migrate.mjs")).href;
const sql = readFileSync("prisma/changes/20261009-search-level.sql", "utf8");

/** Importing the CLI cannot open a database or read .vercel: only the pure checks run. */
function run(call: "column" | "values" | "client", input: unknown) {
  const fn = call === "column" ? "assertSearchLevelColumn" : call === "values" ? "assertSearchLevelValues" : "assertPostgresClient";
  const script = `import { ${fn} } from ${JSON.stringify(moduleUrl)};
    console.log(JSON.stringify(${fn}(JSON.parse(process.argv[1]))));`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", script, JSON.stringify(input)], {
    encoding: "utf8", timeout: 10_000, windowsHide: true,
    env: { ...process.env, DATABASE_URL: "invalid-synthetic-no-connection", APP_ENV: "test" },
  });
}
const column = (): Column => ({ name: "searchLevel", type: "text", nullable: true, default: null, identity: "", generated: "" });

describe("search level rollout", () => {
  it("is one additive, schema-qualified, nullable column with no default and no backfill", () => {
    const statements = sql.split("\n").filter(line => line.trim() && !line.startsWith("--"));
    expect(statements).toEqual([`ALTER TABLE "__FINDME_SCHEMA__"."Game" ADD COLUMN IF NOT EXISTS "searchLevel" TEXT;`]);
  });

  it("accepts the exact column shape", () => {
    const result = run("column", [column()]);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ column: "searchLevel", type: "text", nullable: true });
  });

  it.each<[string, (row: Column) => Column[]]>([
    ["missing", () => []],
    ["duplicated", row => [row, row]],
    ["varchar", row => [{ ...row, type: "character varying(16)" }]],
    ["not null", row => [{ ...row, nullable: false }]],
    ["a default that would label old games", row => [{ ...row, default: "'explorers'::text" }]],
    ["generated", row => [{ ...row, generated: "s" }]],
  ])("refuses a pre-existing %s column that IF NOT EXISTS would accept", (_name, mutate) => {
    const result = run("column", mutate(column()));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Game.searchLevel metadata mismatch");
  });

  it("refuses to run with the local SQLite client and says how to generate the PostgreSQL one, never a push", () => {
    const sqlite = run("client", 'generator client {\n  provider = "prisma-client-js"\n}\ndatasource db {\n  provider = "sqlite"\n  url = env("DATABASE_URL")\n}');
    expect(sqlite.status).toBe(1);
    expect(sqlite.stderr).toContain("node scripts/prisma-generate.mjs");
    expect(sqlite.stderr).toContain("npm run db:client:local");
    expect(sqlite.stderr).not.toMatch(/db push|db:push/);
    expect(run("client", "").status).toBe(1);
    const postgres = run("client", 'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}');
    expect(postgres.status, postgres.stderr).toBe(0);
    expect(JSON.parse(postgres.stdout)).toBe("postgresql");
  });

  it("reports level counts and refuses a value outside the closed list", () => {
    const ok = run("values", [{ level: null, games: 12 }, { level: "explorers", games: 2 }]);
    expect(ok.status, ok.stderr).toBe(0);
    expect(JSON.parse(ok.stdout)).toEqual({ null: 12, explorers: 2 });
    const bad = run("values", [{ level: "hard", games: 1 }]);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain("outside the closed list");
  });
});
