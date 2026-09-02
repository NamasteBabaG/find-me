import type { CheckoutRequest, CheckoutSession, PaymentProvider, WebhookParseResult } from "./types";

/**
 * PayMe adapter — skeleton. Fill in when the merchant account exists.
 * Keep ALL PayMe-specific parsing here so the rest of the system only ever
 * sees PaymentWebhookEvent.
 */
export class PayMeProvider implements PaymentProvider {
  readonly id = "payme" as const;
  constructor(
    private readonly sellerId: string,
    private readonly webhookSecret: string,
  ) {
    if (!sellerId || !webhookSecret) throw new Error("PayMe provider requires PAYME_SELLER_ID and PAYME_WEBHOOK_SECRET");
  }

  async createCheckout(_req: CheckoutRequest): Promise<CheckoutSession> {
    throw new Error("PayMeProvider.createCheckout not implemented yet — use PAYMENT_PROVIDER=mock");
  }

  async parseWebhook(_rawBody: string, _headers: Record<string, string | undefined>): Promise<WebhookParseResult> {
    return { ok: false, reason: "PayMe webhook parsing not implemented" };
  }

  async refund(): Promise<{ ok: boolean }> {
    return { ok: false };
  }
}
