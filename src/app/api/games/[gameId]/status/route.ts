import { NextResponse } from "next/server";
import { getContainer } from "@/services/container";
import { creationStep, isPlayable } from "@/domain/order-state";
import { statusOf } from "@/services/game-status";
import { ensurePlayerLink } from "@/services/share-link.service";
import { currentUser, draftTokenFromCookie, isAdminEmail } from "@/lib/server/session";

export const runtime = "nodejs";

/** Polled by /creating. Visible to the draft owner (cookie), the account owner, or an admin. */
export async function GET(_req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await ctx.params;
  const c = getContainer();
  const [game, user, draftToken] = await Promise.all([c.db.game.findUnique({ where: { id: gameId } }), currentUser(), draftTokenFromCookie()]);
  if (!game) return NextResponse.json({ error: "not found" }, { status: 404 });
  const allowed = (draftToken && game.draftToken === draftToken) || (user && game.ownerId === user.id) || isAdminEmail(user?.email);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const status = statusOf(game);
  const step = creationStep(status);
  const playUrl = isPlayable(status) ? (await ensurePlayerLink(c, gameId)).url : null;
  return NextResponse.json({ status, ...step, playUrl, awaitingQa: status === "QA_PENDING" || status === "MANUAL_REVIEW" }, { headers: { "Cache-Control": "no-store" } });
}
