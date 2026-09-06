import { NextResponse } from "next/server";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { getContainer } from "@/services/container";
import { consumeMagicLink } from "@/services/auth.service";
import { setSessionCookie } from "@/lib/server/session";
import { safeLocalPath } from "@/lib/safe-redirect";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await qaAccessDenied(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const safeNext = safeLocalPath(url.searchParams.get("next"), "/library");
  const session = await consumeMagicLink(getContainer(), token);
  if (!session) return NextResponse.redirect(new URL("/library?error=expired", url.origin));
  await setSessionCookie(session.sessionToken, session.expiresAt);
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
