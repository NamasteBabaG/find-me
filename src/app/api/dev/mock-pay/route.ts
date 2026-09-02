import { NextResponse } from "next/server";
import { isDev } from "@/lib/env";
import { getContainer } from "@/services/container";
import { MockPaymentProvider } from "@/infra/payment/mock";
import { handlePaymentWebhook } from "@/services/order.service";

export const runtime = "nodejs";

/**
 * Dev helper that plays the PSP: builds a signed webhook for the order and
 * feeds it through the exact same handler production will use.
 */
export async function POST(req: Request) {
  if (!isDev()) return NextResponse.json({ ok: false, body: "not available" }, { status: 404 });
  const c = getContainer();
  if (!(c.payment instanceof MockPaymentProvider)) return NextResponse.json({ ok: false, body: "PAYMENT_PROVIDER is not mock" }, { status: 400 });
  const { orderId, kind } = (await req.json()) as { orderId?: string; kind?: "PAID" | "FAILED" | "REFUNDED" };
  if (!orderId || !kind) return NextResponse.json({ ok: false, body: "missing fields" }, { status: 400 });
  const order = await c.db.order.findUnique({ where: { id: orderId } });
  if (!order) return NextResponse.json({ ok: false, body: "unknown order" }, { status: 404 });
  const rawBody = JSON.stringify({ eventId: `evt_${orderId}_${kind}_${Date.now()}`, orderId, kind, amountAgorot: order.amountAgorot });
  const outcome = await handlePaymentWebhook(c, rawBody, { "x-mock-signature": c.payment.sign(rawBody) });
  return NextResponse.json({ ok: outcome.status === 200, body: outcome.body }, { status: outcome.status });
}
