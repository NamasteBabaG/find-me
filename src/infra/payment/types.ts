export type PaymentProviderId = "mock" | "payme";

export interface CheckoutRequest {
  orderId: string;
  /** Immutable attempt identity. An adapter advertising support must dedupe it. */
  idempotencyKey?: string;
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

export interface CloseCheckoutRequest {
  orderId: string;
  providerPaymentId: string | null;
  /** Retried closure requests must refer to the same complete provider attempt. */
  idempotencyKey: string;
}

export type CloseCheckoutResult =
  /** The provider confirms this attempt was never paid and cannot accept payment. */
  | { state: "closed_unpaid"; providerCloseId?: string }
  | { state: "paid" }
  | { state: "unknown" };

export type PaymentEventKind = "PAID" | "FAILED" | "REFUNDED";

export interface PaymentWebhookEvent {
  providerEventId: string;
  orderId: string;
  kind: PaymentEventKind;
  providerPaymentId: string;
  amountAgorot: number;
  /** Minor-unit currency code, when the provider says. A payment in the wrong currency is not a payment. */
  currency?: string;
  raw: unknown;
}

export type WebhookParseResult = { ok: true; event: PaymentWebhookEvent } | { ok: false; reason: string };

/**
 * Every payment provider hides behind this. The webhook — not the redirect —
 * is the only thing that moves an order to PAID.
 */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  /** Explicit contract needed before retrying an uncertain checkout response. */
  readonly supportsCheckoutIdempotency?: boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /** Optional: only a confirmed terminal unpaid result permits replacement. */
  closeCheckout?(req: CloseCheckoutRequest): Promise<CloseCheckoutResult>;
  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<WebhookParseResult>;
  refund(providerPaymentId: string, amountAgorot: number): Promise<{ ok: boolean; providerRefundId?: string }>;
}
