export type PaymentProviderId = "mock" | "payme";

export interface CheckoutRequest {
  orderId: string;
  amountAgorot: number;
  currency: string;
  description: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  checkoutUrl: string;
  providerPaymentId?: string;
}

export type PaymentEventKind = "PAID" | "FAILED" | "REFUNDED";

export interface PaymentWebhookEvent {
  providerEventId: string;
  orderId: string;
  kind: PaymentEventKind;
  providerPaymentId: string;
  amountAgorot: number;
  raw: unknown;
}

export type WebhookParseResult = { ok: true; event: PaymentWebhookEvent } | { ok: false; reason: string };

/**
 * Every payment provider hides behind this. The webhook — not the redirect —
 * is the only thing that moves an order to PAID.
 */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<WebhookParseResult>;
  refund(providerPaymentId: string, amountAgorot: number): Promise<{ ok: boolean; providerRefundId?: string }>;
}
