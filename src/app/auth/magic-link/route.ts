import { NextResponse } from "next/server";
import { getContainer } from "@/services/container";
import { consumeMagicLink } from "@/services/auth.service";
import { setSessionCookie } from "@/lib/server/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const next = url.searchParams.get("next") ?? "/library";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/library";
  const session = await consumeMagicLink(getContainer(), token);
  if (!session) return NextResponse.redirect(new URL("/library?error=expired", url.origin));
  await setSessionCookie(session.sessionToken, session.expiresAt);
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
