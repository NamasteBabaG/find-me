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
 * A non-empty file: target is the only supported local database scheme.
 * This preflight never connects to a database and never proves it is disposable.
 */
import { existsSync, readFileSync } from "node:fs";
import { isIP } from "node:net";
import { parseEnv } from "node:util";
import path from "node:path";

const ROOT = process.cwd();

function fromEnvFile(): string | undefined {
  const values = [".env", "prisma/.env"].flatMap(name => {
    const file = path.join(ROOT, name);
    if (!existsSync(file)) return [];
    // Strip the file's encoding marker, never characters inside a credential.
    const value = parseEnv(readFileSync(file, "utf8").replace(/^\uFEFF/, "")).DATABASE_URL;
    return value === undefined ? [] : [value];
  });
  if (new Set(values).size > 1) {
    die(["DATABASE_URL conflicts between .env and prisma/.env. Set one explicit target before changing a schema."]);
  }
  // Prisma's dotenv expansion must not reinterpret the target after this guard.
  if (values.some(value => /\$\{?\w/.test(value))) {
    die(["DATABASE_URL in an env file must be literal. Set the resolved value in the process environment."]);
  }
  return values[0];
}

function die(lines: string[]): never {
  console.error(`\n  ${lines.join("\n  ")}\n`);
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? fromEnvFile() ?? "";
if (!url) die(["DATABASE_URL is not set, and this command changes a database schema."]);

if (url !== url.trim() || /[\r\n\0]/.test(url)) die(["DATABASE_URL contains surrounding whitespace or control characters. Set a clean target."]);

if (/^file:.+/.test(url)) {
  process.exit(0);
}
if (!/^postgres(ql)?:\/\//.test(url)) die(["DATABASE_URL must be a non-empty file: target or a postgres:// / postgresql:// URL."]);

let parsed: URL;
try {
  parsed = new URL(url);
} catch {
  die([`DATABASE_URL is not a URL this can read, and this command changes a database schema.`]);
}

const schema = parsed.searchParams.get("schema");
const target = `${parsed.hostname}:${parsed.port || "5432"}`;
if (parsed.searchParams.getAll("schema").length > 1) die(["DATABASE_URL names more than one schema. Refusing an ambiguous target."]);
if (!parsed.pathname || parsed.pathname === "/") die(["DATABASE_URL must name the database to change."]);

// A placeholder pasted from instructions is a URL that parses. It should not
// reach Prisma and come back as "Can't reach database server at %E2%80%A6".
if (parsed.hostname !== "localhost" && !isIP(parsed.hostname.replace(/^\[|\]$/g, "")) && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(parsed.hostname)) {
  die(["Refusing: DATABASE_URL does not name a supported hostname or IP address. Use the real connection string, not a placeholder."]);
}
const allowPublic = process.argv.includes("--allow-public");

if (!schema) {
  die([
    `Refusing: DATABASE_URL names no schema, so this would change "public" on ${target}.`,
    ``,
    `"public" is where the shop's own tables live. Say which schema you mean:`,
    `  …supabase.com:6543/postgres?schema=qa`,
    ``,
    `If you really do mean the shop's tables, name schema=public and re-run with --allow-public.`,
  ]);
}

if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) die(["DATABASE_URL must name a plain, non-empty schema identifier."]);

if (schema === "public" && !allowPublic) {
  die([
    `Refusing: this would change the "public" schema on ${target}, where the shop's own tables live.`,
    ``,
    `Re-run with --allow-public if that is what you mean.`,
  ]);
}

console.log(`[db] target: ${target}, schema "${schema}"${allowPublic ? " (--allow-public)" : ""}`);
