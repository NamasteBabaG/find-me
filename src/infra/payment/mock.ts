import { hmacSign, hmacVerify } from "@/lib/ids";
import type { CheckoutRequest, CheckoutSession, PaymentProvider, WebhookParseResult } from "./types";

/**
 * Sandbox payment provider for development.
 *
 * Flow mirrors a real PSP: the checkout page lives on our own /checkout/mock
 * route; when the tester presses "pay", that page POSTs a signed webhook to
 * /api/webhooks/payment — exactly the path PayMe will use in production.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly id = "mock" as const;
  constructor(
    private readonly appUrl: string,
    private readonly secret: string,
  ) {}

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const params = new URLSearchParams({
      orderId: req.orderId,
      amount: String(req.amountAgorot),
      success: req.successUrl,
      cancel: req.cancelUrl,
    });
    return { checkoutUrl: `${this.appUrl}/checkout/mock?${params.toString()}`, providerPaymentId: `mockpay_${req.orderId}` };
  }

  /** Used by the mock checkout page to sign its webhook body. */
  sign(rawBody: string): string {
    return hmacSign(rawBody, this.secret);
  }

  async parseWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<WebhookParseResult> {
    const signature = headers["x-mock-signature"];
    if (!signature || !hmacVerify(rawBody, signature, this.secret)) return { ok: false, reason: "bad signature" };
    let body: { eventId?: string; orderId?: string; kind?: string; amountAgorot?: number };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { ok: false, reason: "invalid json" };
    }
    if (!body.eventId || !body.orderId || !body.kind || typeof body.amountAgorot !== "number") return { ok: false, reason: "missing fields" };
    if (body.kind !== "PAID" && body.kind !== "FAILED" && body.kind !== "REFUNDED") return { ok: false, reason: "unknown kind" };
    return {
      ok: true,
      event: {
        providerEventId: body.eventId,
        orderId: body.orderId,
        kind: body.kind,
        providerPaymentId: `mockpay_${body.orderId}`,
        amountAgorot: body.amountAgorot,
        raw: body,
      },
    };
  }

  async refund(): Promise<{ ok: boolean; providerRefundId?: string }> {
    return { ok: true, providerRefundId: `mockrefund_${Date.now()}` };
  }
}
