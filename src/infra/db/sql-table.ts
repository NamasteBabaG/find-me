import { Prisma } from "@prisma/client";

type RawTable = "Game" | "AdventureAlbumProgress" | "PassportShare" | "PassportPagePreference";
const TABLES = new Set<RawTable>(["Game", "AdventureAlbumProgress", "PassportShare", "PassportPagePreference"]);

/** Identifiers come only from the server's configured datasource, never a request.
 * Qualify PostgreSQL SQL explicitly: pooled connections must not decide which
 * environment owns an album or a revoked share. SQLite keeps portable SQL.
 * Do not log the datasource; it contains credentials.
 */
export function sqlTable(table: RawTable, databaseUrl?: string): Prisma.Sql {
  if (!TABLES.has(table)) throw new Error("Unsupported raw SQL table");
  if (!databaseUrl || databaseUrl.startsWith("file:")) return Prisma.raw(`"${table}"`);
  let url: URL;
  try { url = new URL(databaseUrl); }
  catch { throw new Error("Invalid raw SQL datasource"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Unsupported raw SQL datasource");
  const schema = url.searchParams.get("schema") ?? "public";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) throw new Error("Invalid raw SQL schema identifier");
  return Prisma.raw(`"${schema}"."${table}"`);
}
