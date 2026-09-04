/**
 * Puts the QA deployment's three secrets into Vercel, in one command.
 *
 *   DATABASE_URL="postgresql://…?schema=qa" OPENAI_API_KEY="sk-…" node scripts/qa-secrets.mjs
 *
 * SESSION_SECRET is generated here and never printed: it is new on purpose,
 * because it signs sessions and asset URLs, and sharing the shop's would make a
 * QA session valid against real data.
 *
 * The other two are read from the environment of this process, handed to the
 * Vercel CLI on stdin, and never written to a file, a log or the terminal. Pass
 * them as shown above rather than typing them at a prompt, so they do not end up
 * in shell history either (a leading space stops that in bash and zsh).
 *
 * Nothing here is clever. It exists so that setting up QA is one line instead of
 * six dashboard fields, and so the DATABASE_URL is checked before it is stored:
 * a URL without `schema=qa` points at the shop's own tables.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const PROJECT = "find-me-qa";
const SCOPE = "smallheroes-projects";
const TARGET = "production";

function set(name, value) {
  execFileSync("npx", ["vercel", "env", "add", name, TARGET, "--scope", SCOPE, "--force"], {
    input: value,
    stdio: ["pipe", "ignore", "pipe"],
    shell: process.platform === "win32",
  });
  console.log(`  set ${name}`);
}

function die(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
const openaiKey = process.env.OPENAI_API_KEY;

if (!dbUrl || !openaiKey) {
  die(
    'usage: DATABASE_URL="postgresql://…?schema=qa" OPENAI_API_KEY="sk-…" node scripts/qa-secrets.mjs\n' +
      "  (run it from a directory linked to find-me-qa: npx vercel link --project find-me-qa)",
  );
}

let parsed;
try {
  parsed = new URL(dbUrl);
} catch {
  die("DATABASE_URL is not a URL this can read.");
}
const schema = parsed.searchParams.get("schema");
if (schema !== "qa") {
  die(
    `DATABASE_URL points at schema "${schema ?? "public"}" on ${parsed.hostname}.\n` +
      "  QA must not share tables with the shop. Append ?schema=qa (or &schema=qa) and run again.",
  );
}
if (parsed.port && parsed.port !== "6543") {
  console.warn(`  warning: port ${parsed.port} is not the transaction pooler (6543). Vercel egresses IPv4; the direct host is IPv6-only.`);
}

console.log(`\n  ${PROJECT} · ${parsed.hostname} · schema "${schema}"\n`);
set("SESSION_SECRET", randomBytes(32).toString("base64url"));
set("DATABASE_URL", dbUrl);
set("OPENAI_API_KEY", openaiKey);

console.log("\n  Next:");
console.log("    npm run db:push:postgres          # creates the tables in the qa schema");
console.log("    VERCEL_ORG_ID=team_2bLUDGyHayGB1UHIvcCBgyWh VERCEL_PROJECT_ID=prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4 npx vercel deploy --prod");
console.log("    then GET /api/health should say appEnv \"qa\", db.ok true, payment \"mock\"\n");
