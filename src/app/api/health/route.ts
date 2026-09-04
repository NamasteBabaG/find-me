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
    providers: { storage: e.STORAGE_PROVIDER, generation: e.GENERATION_PROVIDER, payment: e.PAYMENT_PROVIDER, email: e.EMAIL_PROVIDER },
    patchQuality: e.GENERATION_PATCH_QUALITY ?? e.GENERATION_QUALITY,
    patchRetryQuality: e.GENERATION_PATCH_RETRY_QUALITY ?? null,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
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
  return raw
    .split("\n")[0]!
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "<url>")
    .replace(/\b[\w.-]+\.(?:supabase\.co|pooler\.supabase\.com)\b/gi, "<host>")
    .slice(0, 160);
}
