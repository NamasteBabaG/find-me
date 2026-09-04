// Generates the Prisma client for the database named by DATABASE_URL:
// a postgres:// URL uses a Postgres copy of the schema, anything else the SQLite dev schema.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

// `--sqlite` forces the local client regardless of DATABASE_URL. Pushing to
// Postgres regenerates the client for Postgres, which then rejects the SQLite
// url every local test uses — so the push puts it back when it is done.
const url = process.argv.includes("--sqlite") ? "file:./dev.db" : (process.env.DATABASE_URL ?? "");
let schema = "prisma/schema.prisma";
if (/^postgres(ql)?:\/\//.test(url)) {
  const src = readFileSync("prisma/schema.prisma", "utf-8").replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"');
  mkdirSync("prisma/generated", { recursive: true });
  schema = "prisma/generated/schema.postgres.prisma";
  writeFileSync(schema, src);
  console.log("[prisma] postgres schema →", schema);
}
if (!existsSync(schema)) throw new Error(`schema not found: ${schema}`);
execSync(`npx prisma generate --schema ${schema}`, { stdio: "inherit" });
