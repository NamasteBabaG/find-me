import { describe, expect, it } from "vitest";
import { sqlTable } from "../sql-table";

describe("raw SQL environment isolation", () => {
  it("pins the QA relation even if a pooled connection has a public search path", () => {
    const url = "postgresql://example.invalid/database?schema=qa&pgbouncer=true";
    for (const table of ["Game", "AdventureAlbumProgress", "PassportShare", "PassportPagePreference"] as const) {
      expect(sqlTable(table, url).sql).toBe(`"qa"."${table}"`);
      expect(sqlTable(table, url).values).toEqual([]);
    }
  });
  it("pins production to public, preserves other explicitly configured schemas and SQLite", () => {
    expect(sqlTable("Game", "postgresql://example.invalid/database").sql).toBe('"public"."Game"');
    expect(sqlTable("Game", "postgres://example.invalid/database?schema=qa_rehearsal").sql).toBe('"qa_rehearsal"."Game"');
    expect(sqlTable("Game", "file:./fixture.db").sql).toBe('"Game"');
    expect(sqlTable("Game").sql).toBe('"Game"');
  });
  it("rejects injected identifiers and unsupported table/datasource inputs", () => {
    for (const schema of ['', 'qa";DROP TABLE "Game";--', 'qa.public', 'qa,public']) {
      expect(() => sqlTable("Game", `postgresql://example.invalid/database?schema=${encodeURIComponent(schema)}`)).toThrow("Invalid raw SQL schema");
    }
    expect(() => sqlTable("Game", "https://example.invalid")).toThrow("Unsupported raw SQL datasource");
    expect(() => sqlTable("Game; DROP TABLE Game" as "Game")).toThrow("Unsupported raw SQL table");
  });
  it("does not expose a malformed datasource in a thrown parser error", () => {
    const syntheticInput = "postgresql://synthetic-user:YOUR_PASSWORD@[invalid";
    try { sqlTable("Game", syntheticInput); expect.fail("expected rejection"); }
    catch (error) {
      expect(String(error)).toBe("Error: Invalid raw SQL datasource");
      expect(error).not.toHaveProperty("input");
      expect(error).not.toHaveProperty("cause");
    }
  });
});
