/**
 * Does this DATABASE_URL actually work — and will it work from a serverless host?
 *
 *   npm run db:check                 checks DATABASE_URL from .env
 *   npm run db:check -- "postgres…"  checks a URL you paste
 *
 * Reports the host, port, user and the result of a read-only `select 1`.
 * The password is never printed.
 *
 * Two things catch people out on Supabase:
 *   • the direct host (db.<ref>.supabase.co) listens on 5432, the pooler on
 *     6543 — mixing them gives "Can't reach database server";
 *   • the direct host is IPv6-only, and Vercel functions egress over IPv4, so a
 *     direct URL can work from a laptop and never from production.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { promises as dns } from "node:dns";
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

async function addresses(host: string): Promise<{ v4: string[]; v6: string[] }> {
  const v4 = await dns.resolve4(host).catch(() => []);
  const v6 = await dns.resolve6(host).catch(() => []);
  return { v4, v6 };
}

function describe(url: URL): string {
  if (/\.pooler\.supabase\.com$/.test(url.hostname)) return url.port === "6543" ? "Supabase transaction pooler" : "Supabase session pooler";
  if (/^db\..*\.supabase\.co$/.test(url.hostname)) return "Supabase direct connection";
  return "custom host";
}

/** A read-only query through Prisma, so this proves exactly what the app will do. */
function connects(href: string): { ok: true } | { ok: false; error: string } {
  const schema = path.join("prisma", "generated", "schema.postgres.prisma");
  if (!existsSync(path.join(ROOT, schema))) {
    execFileSync("node", ["scripts/prisma-generate.mjs"], { env: { ...process.env, DATABASE_URL: "postgresql://placeholder" }, stdio: "ignore", shell: true });
  }
  try {
    execFileSync("npx", ["prisma", "db", "execute", "--stdin", "--schema", schema], {
      input: "select 1;",
      env: { ...process.env, DATABASE_URL: href },
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
      timeout: 40_000,
    });
    return { ok: true };
  } catch (err) {
    const e = err as { stderr?: Buffer; stdout?: Buffer; message?: string };
    const text = [e.stderr, e.stdout, e.message].map((x) => (x ? String(x) : "")).join(" ").replace(/\s+/g, " ").trim();
    if (!text) return { ok: false, error: "timed out with no answer (the port is probably not open on that host)" };
    const known = /Can't reach database server|password authentication failed|Tenant or user not found|tenant\/user .* not found|does not exist/.exec(text);
    return { ok: false, error: known ? known[0] : text.slice(0, 160) };
  }
}

async function main() {
  const given = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? fromEnvFile();
  if (!given) throw new Error("no DATABASE_URL in .env and none given — pass one as an argument");
  if (given.startsWith("file:")) {
    console.log("DATABASE_URL is SQLite (file:), which is right for local development. Nothing to check.");
    return;
  }
  const url = new URL(given);
  console.log(`kind   ${describe(url)}`);
  console.log(`host   ${url.hostname}:${url.port || "(default)"}`);
  console.log(`user   ${url.username}`);
  const ips = await addresses(url.hostname);
  console.log(`dns    IPv4 ${ips.v4.length ? ips.v4.join(", ") : "none"} · IPv6 ${ips.v6.length ? "yes" : "none"}`);
  if (!ips.v4.length) {
    console.log("       ⚠ no IPv4: a Vercel function cannot reach this host, however well it works from here.");
  }
  const result = connects(given);
  console.log(`connect ${result.ok ? "✓ select 1 succeeded" : `✗ ${result.error}`}`);

  if (result.ok && ips.v4.length) {
    console.log("\nThis URL is good for production.");
    return;
  }

  // Same host on the port it actually listens on: this separates "wrong port"
  // from "wrong password", which the same error message otherwise hides.
  if (/^db\..*\.supabase\.co$/.test(url.hostname) && url.port !== "5432") {
    const direct = new URL(given);
    direct.port = "5432";
    direct.search = "";
    const r = connects(direct.href);
    console.log(`
same host on 5432 (the port a direct connection listens on): ${r.ok ? "✓ connects — so the credentials are fine and only the port was wrong" : `✗ ${r.error}`}`);
  }

  // Offer the repaired pooler forms, built from the same credentials.
  const ref = /db\.([a-z0-9]+)\.supabase\.co/.exec(url.hostname)?.[1] ?? url.username.split(".")[1];
  if (!ref) return;
  console.log("\nTrying the transaction pooler with the same password…");
  for (const region of [process.argv.includes("--region") ? process.argv[process.argv.indexOf("--region") + 1]! : "eu-central-1"]) {
    for (const prefix of ["aws-0", "aws-1"]) {
      const u = new URL(given);
      u.username = `postgres.${ref}`;
      u.hostname = `${prefix}-${region}.pooler.supabase.com`;
      u.port = "6543";
      u.search = "?pgbouncer=true&connection_limit=1";
      const r = connects(u.href);
      console.log(`  ${u.hostname}  ${r.ok ? "✓ works — use this one" : `✗ ${r.error}`}`);
      if (r.ok) {
        console.log(`\n  postgresql://${u.username}:YOUR-PASSWORD@${u.hostname}:6543/postgres?pgbouncer=true&connection_limit=1`);
        return;
      }
    }
  }
  console.log("\nNo pooler host answered. Open the project's Connect dialog and copy the Transaction pooler URI verbatim.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
