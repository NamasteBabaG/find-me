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

async function checkDb(): Promise<{ ok: boolean; error?: string }> {
  try {
    // The cheapest query that proves a real round trip, and reads nobody's data.
    await getContainer().db.$queryRaw`select 1`;
    return { ok: true };
  } catch (err) {
    return { ok: false, error: scrub(err) };
  }
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
