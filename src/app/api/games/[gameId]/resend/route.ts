import { NextResponse } from "next/server";
import { getContainer } from "@/services/container";
import { resendGameMail } from "@/services/publish.service";
import { SYSTEM } from "@/services/audit.service";
import { currentUser, draftTokenFromCookie, isAdminEmail } from "@/lib/server/session";

export const runtime = "nodejs";

/** "Email me the link" on the creating and library pages. Same visibility rule as the status route. */
export async function POST(_req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await ctx.params;
  const c = getContainer();
  const [game, user, draftToken] = await Promise.all([c.db.game.findUnique({ where: { id: gameId }, select: { ownerId: true, draftToken: true } }), currentUser(), draftTokenFromCookie()]);
  if (!game) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404 });
  const allowed = (draftToken && game.draftToken === draftToken) || (user && game.ownerId === user.id) || isAdminEmail(user?.email);
  if (!allowed) return NextResponse.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
  const result = await resendGameMail(c, gameId, user ? { type: "USER", id: user.id } : SYSTEM);
  if (!result.ok) return NextResponse.json(result, { status: result.code === "WAIT" ? 429 : 409 });
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
