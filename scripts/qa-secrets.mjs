/**
 * Puts the QA deployment's three secrets into Vercel, in one go.
 *
 *   PowerShell:
 *     $env:DATABASE_URL="postgresql://…?schema=qa"; $env:OPENAI_API_KEY="sk-…"
 *     node scripts/qa-secrets.mjs
 *     Remove-Item Env:DATABASE_URL, Env:OPENAI_API_KEY
 *
 *   bash/zsh (the leading space keeps it out of history):
 *      DATABASE_URL="postgresql://…?schema=qa" OPENAI_API_KEY="sk-…" node scripts/qa-secrets.mjs
 *
 * SESSION_SECRET is generated here and never printed: it is new on purpose,
 * because it signs sessions and asset URLs, and sharing the shop's would make a
 * QA session valid against real data.
 *
 * The other two are read from this process's environment, handed to the Vercel
 * CLI on stdin, and never written to a file, a log or the terminal.
 *
 * Nothing here is clever. It exists so setting up QA is one line instead of six
 * dashboard fields, and so the DATABASE_URL is checked before it is stored: a
 * URL that does not name the `qa` schema is pointing at the shop's own tables.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const PROJECT = "find-me-qa";
const SCOPE = "smallheroes-projects";
const ORG_ID = "team_2bLUDGyHayGB1UHIvcCBgyWh";
const PROJECT_ID = "prj_LbqCRqwU8WfZpeaWU7HTXM4SsfG4";
const TARGET = "production";
const pwsh = process.platform === "win32";

function set(name, value) {
  execFileSync("npx", ["vercel", "env", "add", name, TARGET, "--scope", SCOPE, "--force"], {
    input: value,
    stdio: ["pipe", "ignore", "pipe"],
    shell: pwsh,
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
  const usage = pwsh
    ? 'usage (PowerShell — it has no inline env prefix):\n' +
      '    $env:DATABASE_URL="postgresql://…?schema=qa"; $env:OPENAI_API_KEY="sk-…"\n' +
      "    node scripts/qa-secrets.mjs\n" +
      "    Remove-Item Env:DATABASE_URL, Env:OPENAI_API_KEY"
    : 'usage: DATABASE_URL="postgresql://…?schema=qa" OPENAI_API_KEY="sk-…" node scripts/qa-secrets.mjs';
  die(`${usage}\n\n  Run it from a directory linked to find-me-qa:\n    npx vercel link --project ${PROJECT} --scope ${SCOPE} --yes`);
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

console.log("\n  Next — create the tables in the qa schema (DATABASE_URL is still set in this shell):");
console.log("    npm run db:push:postgres");
console.log("\n  Then deploy:");
if (pwsh) {
  console.log(`    $env:VERCEL_ORG_ID="${ORG_ID}"; $env:VERCEL_PROJECT_ID="${PROJECT_ID}"`);
  console.log("    npx vercel deploy --prod");
} else {
  console.log(`    VERCEL_ORG_ID=${ORG_ID} VERCEL_PROJECT_ID=${PROJECT_ID} npx vercel deploy --prod`);
}
console.log('\n  Health should then say appEnv "qa", db.ok true, payment "mock".');
console.log(pwsh ? "  Finally: Remove-Item Env:DATABASE_URL, Env:OPENAI_API_KEY\n" : "\n");
