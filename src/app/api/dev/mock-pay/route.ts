import { NextResponse } from "next/server";
import { getContainer } from "@/services/container";
import { handlePaymentWebhook } from "@/services/order.service";
import { currentUser, draftTokenFromCookie, isAdminEmail } from "@/lib/server/session";
import { spendAllowedFor } from "@/domain/spend-policy";
import { spendGuard } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Dev helper that plays the PSP: builds a signed webhook for the order and
 * feeds it through the exact same handler production will use.
 *
 * It used to take an order id and a word, and nothing else — no session, no
 * ownership — while the id is printed in the mock checkout URL. Anyone could
 * mark anyone's order paid, and with a real image model wired that is someone
 * else's money. It now proves the caller is the person who is checking out, the
 * same way /api/jobs/tick does: their session, or the draft cookie they created
 * the game with.
 *
 * The route stays available in production on purpose. Until the real PSP is
 * live, this *is* the checkout, and killing it here would only mean the button
 * does nothing.
 */
export async function POST(req: Request) {
  const c = getContainer();
  if (c.payment.id !== "mock") return NextResponse.json({ ok: false, body: "not available" }, { status: 404 });
  const payment = c.payment as { id: string; sign?: (raw: string) => string };
  if (payment.id !== "mock" || typeof payment.sign !== "function") return NextResponse.json({ ok: false, body: "PAYMENT_PROVIDER is not mock" }, { status: 400 });
  const { orderId, kind } = (await req.json()) as { orderId?: string; kind?: "PAID" | "FAILED" | "REFUNDED" };
  if (!orderId || !kind) return NextResponse.json({ ok: false, body: "missing fields" }, { status: 400 });
  const order = await c.db.order.findUnique({ where: { id: orderId }, include: { game: { select: { ownerId: true, draftToken: true } }, user: { select: { email: true } } } });
  if (!order) return NextResponse.json({ ok: false, body: "unknown order" }, { status: 404 });
  if (!(await ownsOrder(order))) return NextResponse.json({ ok: false, body: "not your order" }, { status: 403 });
  // Owning the order is not enough on a QA box with a real painter: this is
  // the click that makes a game PAID, which is the click that starts spending.
  if (!spendAllowedFor(spendGuard(), order.user.email)) return NextResponse.json({ ok: false, body: "testers only" }, { status: 403 });
  const rawBody = JSON.stringify({ eventId: `evt_${orderId}_${kind}_${Date.now()}`, orderId, kind, amountAgorot: order.amountAgorot, currency: order.currency });
  const outcome = await handlePaymentWebhook(c, rawBody, { "x-mock-signature": payment.sign(rawBody) });
  return NextResponse.json({ ok: outcome.status === 200, body: outcome.body }, { status: outcome.status });
}

/**
 * The same test the rest of the app uses for "is this your game": a signed-in
 * owner, the draft cookie the game was created with, or an admin.
 */
async function ownsOrder(order: { userId: string | null; game: { ownerId: string | null; draftToken: string | null } | null }): Promise<boolean> {
  const [user, draftToken] = await Promise.all([currentUser(), draftTokenFromCookie()]);
  if (user && (order.userId === user.id || order.game?.ownerId === user.id)) return true;
  if (draftToken && order.game?.draftToken && order.game.draftToken === draftToken) return true;
  return isAdminEmail(user?.email);
}
