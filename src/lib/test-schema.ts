import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Create the tables of a fresh SQLite test database from prisma/test-schema.sql,
 * without Prisma's schema engine. See scripts/prisma-sql.mjs for why.
 */
export async function applyTestSchema(db: { $executeRawUnsafe: (sql: string) => Promise<unknown> }, root = process.cwd()): Promise<void> {
  const sqlPath = path.join(root, "prisma", "test-schema.sql");
  const sql = readFileSync(sqlPath, "utf8").replace(/\r\n/g, "\n");
  const schema = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8").replace(/\r\n/g, "\n");
  const want = createHash("sha256").update(schema).digest("hex");
  const have = /^-- schema-sha256: ([0-9a-f]+)/.exec(sql)?.[1];
  if (have !== want) throw new Error(`prisma/test-schema.sql is stale (schema ${want.slice(0, 12)}, file ${have?.slice(0, 12) ?? "none"}). Run: npm run db:sql`);
  for (const statement of sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--.*$/gm, "").trim())
    .filter(Boolean)) {
    await db.$executeRawUnsafe(statement);
  }
}
