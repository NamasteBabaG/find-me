import { NextResponse } from "next/server";
import { createQaSession, QA_SESSION_SECONDS, qaAccessConfig, qaAccessConfigured, qaCookieName, qaDeniedResponse, qaPasswordMatches, safeQaNext } from "@/lib/qa-access";
import { callerKey, rateLimit, tooManyRequests } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const c = qaAccessConfig();
  if (!c.enabled) return new Response(null, { status: 404 });
  if (!qaAccessConfigured(c)) return qaDeniedResponse(c);
  const url = new URL(req.url);
  // A plain HTML form works without JS; an outside site cannot log someone in.
  if (req.headers.get("origin") !== url.origin || req.headers.get("sec-fetch-site") === "cross-site") {
    return new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const limited = rateLimit(callerKey(req, "qa-login"), 10, 15 * 60_000);
  if (!limited.ok) return tooManyRequests(limited);
  // Only a small URL-encoded form, never a multipart/photo upload or arbitrary JSON.
  if (!req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return new Response(null, { status: 415 });
  if (Number(req.headers.get("content-length")) > 8192) return new Response(null, { status: 413 });
  const body = await req.text();
  if (body.length > 8192) return new Response(null, { status: 413 });
  const form = new URLSearchParams(body);
  const next = safeQaNext(form.get("next"));
  if (!(await qaPasswordMatches(form.get("password") ?? "", c))) {
    const retry = new URL("/qa-access", url.origin);
    retry.searchParams.set("error", "invalid");
    retry.searchParams.set("next", next);
    const response = NextResponse.redirect(retry, 303);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  const response = NextResponse.redirect(new URL(next, url.origin), 303);
  response.cookies.set(qaCookieName(c), await createQaSession(c), {
    httpOnly: true, secure: c.secure, sameSite: "lax", path: "/", maxAge: QA_SESSION_SECONDS,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
