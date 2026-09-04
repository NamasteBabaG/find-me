import { NextResponse } from "next/server";
import { getContainer } from "@/services/container";
import { handlePaymentWebhook } from "@/services/order.service";
import { isDev } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Dev helper that plays the PSP: builds a signed webhook for the order and
 * feeds it through the exact same handler production will use.
 *
 * It takes an order id and a word, and the order id is printed in the mock
 * checkout URL — no session, no ownership check, nothing to forge. That is fine
 * on a laptop and catastrophic on a public host, so the environment decides
 * whether this file exists at all, not the provider that happens to be wired.
 */
export async function POST(req: Request) {
  if (!isDev()) return NextResponse.json({ ok: false, body: "not found" }, { status: 404 });
  const c = getContainer();
  if (c.payment.id !== "mock") return NextResponse.json({ ok: false, body: "not available" }, { status: 404 });
  const payment = c.payment as { id: string; sign?: (raw: string) => string };
  if (payment.id !== "mock" || typeof payment.sign !== "function") return NextResponse.json({ ok: false, body: "PAYMENT_PROVIDER is not mock" }, { status: 400 });
  const { orderId, kind } = (await req.json()) as { orderId?: string; kind?: "PAID" | "FAILED" | "REFUNDED" };
  if (!orderId || !kind) return NextResponse.json({ ok: false, body: "missing fields" }, { status: 400 });
  const order = await c.db.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ ok: false, body: "unknown order" }, { status: 404 });
  const rawBody = JSON.stringify({ eventId: `evt_${orderId}_${kind}_${Date.now()}`, orderId, kind, amountAgorot: order.amountAgorot });
  const outcome = await handlePaymentWebhook(c, rawBody, { "x-mock-signature": payment.sign(rawBody) });
  return NextResponse.json({ ok: outcome.status === 200, body: outcome.body }, { status: outcome.status });
}
