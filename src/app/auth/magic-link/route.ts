import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { getContainer } from "@/services/container";
import { consumeMagicLink, inspectMagicLink } from "@/services/auth.service";
import { setSessionCookie } from "@/lib/server/session";
import { familySignInHref, safeLocalPath } from "@/lib/safe-redirect";
import { createMagicConfirmation, MAGIC_CONFIRM_COOKIE, MAGIC_CONFIRM_COOKIE_PATH, MAGIC_CONFIRM_TTL_SECONDS, validMagicConfirmation } from "./challenge";

export const runtime = "nodejs";

function privateAuthResponse(response: Response): Response {
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

async function privateAuthRoute(req: Request, handler: (request: Request) => Promise<Response>): Promise<Response> {
  try { return privateAuthResponse(await handler(req)); }
  catch {
    // Never log a token, account details, or a database/provider error body.
    console.error("[auth] Sign-in request could not be completed");
    return privateAuthResponse(NextResponse.json({ ok: false }, { status: 500 }));
  }
}

export function GET(req: Request): Promise<Response> {
  return privateAuthRoute(req, openConfirmation);
}

export function POST(req: Request): Promise<Response> {
  return privateAuthRoute(req, confirmSignIn);
}

async function openConfirmation(req: Request): Promise<Response> {
  const denied = await qaAccessDenied(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const safeNext = safeLocalPath(url.searchParams.get("next"), "/library");
  const container = getContainer();
  const trustedOrigin = new URL(container.appUrl).origin;
  if (url.origin !== trustedOrigin) return NextResponse.json({ ok: false }, { status: 400 });
  if (!(await inspectMagicLink(container, token))) return NextResponse.redirect(new URL(familySignInHref(safeNext, "expired"), trustedOrigin));
  const confirmation = new URL("/auth/magic-link/confirm", trustedOrigin);
  confirmation.searchParams.set("token", token);
  confirmation.searchParams.set("next", safeNext);
  const response = NextResponse.redirect(confirmation);
  response.cookies.set(MAGIC_CONFIRM_COOKIE, createMagicConfirmation(container.secret, token), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: MAGIC_CONFIRM_COOKIE_PATH, maxAge: MAGIC_CONFIRM_TTL_SECONDS,
  });
  return response;
}

async function confirmSignIn(req: Request): Promise<Response> {
  const denied = await qaAccessDenied(req);
  if (denied) return denied;
  const url = new URL(req.url);
  // A token authenticates an account; it is not a browser's consent to switch
  // accounts. A top-level cross-site GET can only open the confirmation page.
  if (req.headers.get("origin") !== url.origin) return NextResponse.json({ ok: false }, { status: 403 });
  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const token = String(form.get("token") ?? "");
  const nonce = String(form.get("confirmation") ?? "");
  const cookie = (await cookies()).get(MAGIC_CONFIRM_COOKIE)?.value;
  const container = getContainer();
  const trustedOrigin = new URL(container.appUrl).origin;
  if (url.origin !== trustedOrigin) return NextResponse.json({ ok: false }, { status: 403 });
  const safeNext = safeLocalPath(String(form.get("next") ?? ""), "/library");
  if (!validMagicConfirmation(container.secret, token, cookie, nonce)) {
    return NextResponse.redirect(new URL(familySignInHref(safeNext, "expired"), trustedOrigin), 303);
  }
  const session = await consumeMagicLink(container, token);
  const response = NextResponse.redirect(new URL(session ? safeNext : familySignInHref(safeNext, "expired"), trustedOrigin), 303);
  response.cookies.set(MAGIC_CONFIRM_COOKIE, "", { path: MAGIC_CONFIRM_COOKIE_PATH, maxAge: 0 });
  if (!session) return response;
  await setSessionCookie(session.sessionToken, session.expiresAt);
  return response;
}
