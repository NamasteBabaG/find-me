import { NextResponse } from "next/server";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { currentAdmin } from "@/lib/server/session";
import { env } from "@/lib/env";
import { getContainer } from "@/services/container";
import { createCanonicalIdentityReuse } from "@/services/generation/local-patch-identity-reuse";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Operator-only creation: POST creates a new unpaid QA checkout, not a render. */
export async function POST(request: Request) {
  const denied = await qaAccessDenied(request);
  if (denied) return denied;
  const actor = await currentAdmin();
  const origin = request.headers.get("origin"), host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let sameOrigin = false;
  try { sameOrigin = !!origin && !!host && new URL(origin).host === host && request.headers.get("sec-fetch-site") !== "cross-site"; } catch { /* fail closed */ }
  if (!actor || env().APP_ENV !== "qa" || !sameOrigin) return NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request");
    const value = body as Record<string, unknown>;
    for (const name of ["sourceGameId", "sourceIdentityAssetId", "requestId", "displayName", "confirmation"]) if (typeof value[name] !== "string") throw new Error("Invalid request");
    if (typeof value.confirmedAgeYears !== "number") throw new Error("Explicit child age required");
    const result = await createCanonicalIdentityReuse(getContainer(), {
      sourceGameId: String(value.sourceGameId), sourceIdentityAssetId: String(value.sourceIdentityAssetId), requestId: String(value.requestId),
      displayName: String(value.displayName), confirmedAgeYears: value.confirmedAgeYears, confirmation: String(value.confirmation),
    }, { type: "ADMIN", id: actor.id });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, code: "IDENTITY_REUSE_REFUSED" }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
}
