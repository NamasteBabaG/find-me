/**
 * Refuses to let a schema-changing command run against a Postgres database
 * without saying, out loud, which schema it means.
 *
 *   npm run db:push:postgres   →   guard   →   prisma db push
 *   npm run db:reset           →   guard   →   prisma db push --force-reset
 *
 * `db push` alters a live schema without asking and `--force-reset` empties it.
 * Both take their target from DATABASE_URL, and the difference between the QA
 * schema and the shop's is nine characters at the end of a URL. One missing
 * `?schema=qa` in a shell, an env var or a copied line, and the command lands on
 * `public`.
 *
 * So a Postgres URL has to name its schema. There is no default: refusing is
 * the whole point, and `--allow-public` is there for the one time you really do
 * mean the shop's own tables.
 *
 * SQLite is left alone — a local dev.db is nobody's production.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function fromEnvFile(): string | undefined {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, "utf-8").split(/\r?\n/)) {
    if (!line.startsWith("DATABASE_URL=")) continue;
    return line.slice("DATABASE_URL=".length).trim().replace(/^"|"$/g, "");
  }
  return undefined;
}

function die(lines: string[]): never {
  console.error(`\n  ${lines.join("\n  ")}\n`);
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? fromEnvFile() ?? "";
if (!url) die(["DATABASE_URL is not set, and this command changes a database schema."]);

if (!/^postgres(ql)?:\/\//.test(url)) {
  // SQLite: nothing to guard.
  process.exit(0);
}

let parsed: URL;
try {
  parsed = new URL(url);
} catch {
  die([`DATABASE_URL is not a URL this can read, and this command changes a database schema.`]);
}

const schema = parsed.searchParams.get("schema");
const target = `${parsed.hostname}:${parsed.port || "5432"}`;

// A placeholder pasted from instructions is a URL that parses. It should not
// reach Prisma and come back as "Can't reach database server at %E2%80%A6".
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(parsed.hostname)) {
  die([`Refusing: DATABASE_URL points at "${parsed.hostname}", which is not a hostname.`, ``, `That is usually a placeholder pasted verbatim. Use the real connection string.`]);
}
const allowPublic = process.argv.includes("--allow-public");

if (!schema) {
  die([
    `Refusing: DATABASE_URL names no schema, so this would change "public" on ${target}.`,
    ``,
    `"public" is where the shop's own tables live. Say which schema you mean:`,
    `  …supabase.com:6543/postgres?schema=qa`,
    ``,
    `If you really do mean the shop's tables, re-run with --allow-public.`,
  ]);
}

if (schema === "public" && !allowPublic) {
  die([
    `Refusing: this would change the "public" schema on ${target}, where the shop's own tables live.`,
    ``,
    `Re-run with --allow-public if that is what you mean.`,
  ]);
}

console.log(`[db] target: ${target}, schema "${schema}"${allowPublic ? " (--allow-public)" : ""}`);
