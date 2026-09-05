import { promises as dns } from "node:dns";
import { NextResponse } from "next/server";
import { getContainer } from "@/services/container";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Can this deployment actually reach the things it needs?
 *
 * Exists because a rotated database password looks exactly like a healthy site
 * until someone tries to buy something: pages render, the database is only
 * touched further in, and Vercel does not apply a changed environment variable
 * until the next deploy. This answers the question in one request.
 *
 * Public on purpose — it has to be checkable before anyone can sign in — so it
 * says whether things work and never what they are. No hostnames, no
 * connection strings, no counts.
 */
export async function GET() {
  const started = Date.now();
  const e = env();
  const db = await checkDb();
  const body = {
    ok: db.ok,
    db,
    host: await hostCheck(),
    appEnv: e.APP_ENV,
    providers: { storage: e.STORAGE_PROVIDER, generation: e.GENERATION_PROVIDER, payment: e.PAYMENT_PROVIDER, email: e.EMAIL_PROVIDER, generationEnabled: e.GENERATION_ENABLED === "on" },
    patchQuality: e.GENERATION_PATCH_QUALITY ?? e.GENERATION_QUALITY,
    patchRetryQuality: e.GENERATION_PATCH_RETRY_QUALITY ?? null,
    // CLI deploys carry no git sha; APP_COMMIT is set at deploy time so what is
    // checked can be shown to be what is deployed.
    commit: (process.env.APP_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
    tookMs: Date.now() - started,
  };
  return NextResponse.json(body, { status: db.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}

async function checkDb(): Promise<{ ok: boolean; code?: string; error?: string }> {
  try {
    // The cheapest query that proves a real round trip, and reads nobody's data.
    await getContainer().db.$queryRaw`select 1`;
    return { ok: true };
  } catch (err) {
    // Prisma's code is the useful half and leaks nothing: P1000 is a rejected
    // password, P1001 is a server it cannot reach. Scrubbing the message can
    // leave it empty, which is the least helpful thing to say at the one moment
    // anyone reads this.
    const code = typeof (err as { code?: unknown })?.code === "string" ? ((err as { code: string }).code) : undefined;
    const name = err instanceof Error ? err.name : "Error";
    return { ok: false, code: code ?? name, error: scrub(err) || meaningOf(code) };
  }
}

/**
 * Where DATABASE_URL points, and whether that can be reached over IPv4.
 *
 * The classic failure on this stack is not a bad password: Supabase's direct
 * host is IPv6-only and a serverless function egresses IPv4, so the same URL
 * works from a laptop and never from production. Reporting which addresses
 * resolve tells those two apart at a glance.
 *
 * The pooler hostname is a shared regional endpoint and names nobody, so it is
 * safe to print. The direct host carries the project ref, so it is not.
 */
async function hostCheck(): Promise<{ host: string; port: string; ipv4: number; ipv6: number; error?: string }> {
  let host = "";
  let port = "";
  try {
    const u = new URL(process.env.DATABASE_URL ?? "");
    host = u.hostname;
    port = u.port;
  } catch {
    return { host: "<unparseable>", port: "", ipv4: 0, ipv6: 0, error: "DATABASE_URL is not a URL" };
  }
  const shown = /\.pooler\.supabase\.com$/i.test(host) ? host : "<direct host>";
  try {
    const [v4, v6] = await Promise.all([dns.resolve4(host).catch(() => []), dns.resolve6(host).catch(() => [])]);
    return { host: shown, port, ipv4: v4.length, ipv6: v6.length, ...(v4.length === 0 && v6.length === 0 ? { error: "this hostname does not resolve" } : {}) };
  } catch (err) {
    return { host: shown, port, ipv4: 0, ipv6: 0, error: err instanceof Error ? err.message.slice(0, 80) : "lookup failed" };
  }
}

function meaningOf(code: string | undefined): string {
  if (code === "P1000") return "the database rejected the credentials in DATABASE_URL";
  if (code === "P1001") return "the database host cannot be reached from here";
  if (code === "P1002") return "the database host timed out";
  return "no detail available";
}

/**
 * A database error carries the connection string often enough that printing it
 * on a public endpoint would undo the rotation this route exists to verify.
 */
function scrub(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Prisma's messages open with a blank line and an "Invalid invocation" banner,
  // so taking line zero returned an empty string — which is this route's whole
  // purpose going missing at the one moment anyone reads it.
  const line =
    raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !/^invalid `?prisma/i.test(l))
      .join(" ") || raw.trim();
  return line
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "<url>")
    .replace(/\b[\w.-]+\.(?:supabase\.co|pooler\.supabase\.com)\b/gi, "<host>")
    .slice(0, 200);
}
