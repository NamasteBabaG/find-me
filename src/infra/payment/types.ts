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
  /** An adapter bounds this call well inside a minute: the ceiling refund's attempt window assumes it (kingdom-ceiling-refund/v1). */
  refund(providerPaymentId: string, amountAgorot: number): Promise<{ ok: boolean; providerRefundId?: string }>;
  /**
   * Optional: the provider's own statement about refunds of this payment, asked BEFORE any repeated refund after an
   * uncertain outcome (PayMe has no idempotency key; its transaction_id is not a dedupe key).
   * Only "no-transfer" can authorize another attempt; "in-progress" and "unknown" never do. An adapter without this
   * method leaves every uncertain refund to a person.
   */
  refundStatus?(providerPaymentId: string): Promise<RefundStatus>;
}

/**
 * - "refunded": positive proof that the money went back.
 * - "no-transfer": TERMINAL proof that no refund of this payment happened and none can still complete; for example the
 *   provider records every earlier refund request as failed or rejected. An adapter returns it only where the
 *   provider's documented semantics make it final. A "not refunded yet" snapshot is NOT this (QAV6-04).
 * - "in-progress": a refund may be pending, queued or processing, or the provider cannot rule out a later completion.
 * - "unknown": the question could not be answered.
 */
export type RefundStatus = "refunded" | "no-transfer" | "in-progress" | "unknown";
