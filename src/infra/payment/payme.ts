import type { CheckoutRequest, CheckoutSession, PaymentProvider, PaymentWebhookEvent, RefundStatus, WebhookParseResult } from "./types";

/**
 * PayMe adapter (Payments API, docs.payme.io, read 2026-11-19). All PayMe-specific parsing stays here; the rest of the
 * system only ever sees PaymentWebhookEvent.
 *
 * Contract facts this adapter is built on (quoted field names; sources in docs/PAYME_ADAPTER.md):
 * - generate-sale / refund-sale / get-sales are JSON POSTs to https://{sandbox|live}.payme.io/api/...; the seller MPL
 *   goes in the body as `seller_payme_id`. Amounts are integer minor units (agorot for ILS).
 * - PayMe has NO idempotency key and does not deduplicate `transaction_id` (we send our order id there).
 * - A callback is form-encoded and, for a seller without a partner key, cannot be authenticated by its signature. Its
 *   status and amount are a notification, not proof: every callback is confirmed by `get-sales` before it becomes an
 *   event, and the event carries the VERIFIED sale's order id, amount and currency.
 * - refund-sale answers synchronously; no pending refund state is documented. Timeouts, non-JSON bodies, 991, 20002,
 *   999 and 998 ("a matching call may still be running") are an UNKNOWN outcome: the call throws, and the ceiling
 *   refund keeps its attempt window and asks `refundStatus` before anything is sent again.
 * - No documented sale status proves that a refund did not and cannot happen, so `refundStatus` never answers
 *   "no-transfer": a lost refund answer is never retried automatically; positive proof or a person decides.
 */
export type PayMeEnvironment = "sandbox" | "live";

export interface PayMeOptions {
  sellerId: string;
  environment: PayMeEnvironment;
  /** Where PayMe posts callbacks: the app's /api/webhooks/payment. Must be a public https URL. */
  callbackUrl: string;
  /** Every call is bounded well inside a minute (the ceiling refund's attempt window assumes it). */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const SALE_STATUSES = ["initial", "completed", "refunded", "partial-refund", "authorized", "failed", "chargeback",
  "canceled", "voided", "partial-void", "partial-chargeback"] as const;
/** Documented refusals of refund-sale: the request was turned down and nothing moved. Any other failure is unknown. */
const REFUND_REFUSALS = new Set([1, 4, 20, 200, 251, 303, 305, 350, 352, 357, 503, 517]);
const ALREADY_FULLY_REFUNDED = 309;
const PAID_STATUSES = new Set(["completed", "partial-refund", "refunded"]);

type PayMeAnswer = Record<string, unknown> & { status_code?: unknown; status_error_code?: unknown };
type SaleItem = { sale_payme_id?: unknown; transaction_id?: unknown; sale_status?: unknown; sale_price?: unknown; sale_currency?: unknown };

/** An answer whose outcome is unknown: the provider may or may not have acted. Never a reason to repeat money movement. */
export class PayMeUnknownOutcome extends Error {
  constructor(readonly operation: string, readonly detail: string) { super(`PAYME_UNKNOWN_OUTCOME: ${operation}: ${detail}`); }
}

export class PayMeProvider implements PaymentProvider {
  readonly id = "payme" as const;
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: PayMeOptions) {
    if (!options.sellerId) throw new Error("PayMe provider requires PAYME_SELLER_ID");
    if (options.environment !== "sandbox" && options.environment !== "live") throw new Error("PayMe provider requires PAYME_ENVIRONMENT sandbox or live");
    let callback: URL;
    try { callback = new URL(options.callbackUrl); } catch { throw new Error("PayMe provider requires a public https callback URL"); }
    if (callback.protocol !== "https:" || !callback.hostname.includes(".")) throw new Error("PayMe provider requires a public https callback URL");
    this.base = `https://${options.environment}.payme.io/api`;
    this.timeoutMs = Math.min(options.timeoutMs ?? 20_000, 30_000);
    this.fetcher = options.fetch ?? fetch;
  }

  /** POST one documented endpoint. A transport failure, timeout or non-JSON body is an unknown outcome. */
  private async post(endpoint: "generate-sale" | "refund-sale" | "get-sales", body: Record<string, unknown>): Promise<{ http: number; answer: PayMeAnswer }> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.base}/${endpoint}`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ seller_payme_id: this.options.sellerId, ...body }), signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (error) {
      throw new PayMeUnknownOutcome(endpoint, error instanceof Error && error.name === "TimeoutError" ? "timeout" : "transport");
    }
    let answer: unknown;
    try { answer = await response.json(); } catch { throw new PayMeUnknownOutcome(endpoint, `non-JSON answer (HTTP ${response.status})`); }
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) throw new PayMeUnknownOutcome(endpoint, `unexpected answer (HTTP ${response.status})`);
    return { http: response.status, answer: answer as PayMeAnswer };
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    if (!Number.isSafeInteger(req.amountAgorot) || req.amountAgorot <= 0) throw new Error("PayMe checkout requires a positive integer minor-unit price");
    const { answer } = await this.post("generate-sale", {
      sale_price: req.amountAgorot, currency: req.currency.toUpperCase(), product_name: req.description.slice(0, 500),
      transaction_id: req.orderId, sale_callback_url: this.options.callbackUrl, sale_return_url: req.successUrl,
      cancel_url: req.cancelUrl, sale_email: req.customerEmail, language: "he", installments: "1",
    });
    const saleUrl = typeof answer.sale_url === "string" ? answer.sale_url : "", saleId = typeof answer.payme_sale_id === "string" ? answer.payme_sale_id : "";
    if (answer.status_code !== 0 || !saleUrl.startsWith("https://") || !saleId)
      throw new Error(`PAYME_CHECKOUT_REFUSED: ${String(answer.status_error_code ?? "no-sale-url")}`);
    return { checkoutUrl: saleUrl, providerPaymentId: saleId };
  }

  /** The sale as PayMe records it now, by PayMe's own id; null when it is not found. Unknown on any failure. */
  private async sale(paymePaymentId: string): Promise<SaleItem | null> {
    const { answer } = await this.post("get-sales", { sale_payme_id: paymePaymentId, sale_status: [...SALE_STATUSES] });
    if (answer.status_code !== 0 || !Array.isArray(answer.items)) throw new PayMeUnknownOutcome("get-sales", `status ${String(answer.status_error_code ?? answer.status_code)}`);
    const matches = (answer.items as SaleItem[]).filter(item => item?.sale_payme_id === paymePaymentId);
    return matches.length === 1 ? matches[0]! : null;
  }

  async parseWebhook(rawBody: string, _headers: Record<string, string | undefined>): Promise<WebhookParseResult> {
    const form = new URLSearchParams(rawBody);
    const notify = form.get("notify_type") ?? "", saleId = form.get("payme_sale_id") ?? "", orderId = form.get("transaction_id") ?? "";
    const transactionId = form.get("payme_transaction_id") ?? "";
    const kind = notify === "sale-complete" ? "PAID" : notify === "refund" ? "REFUNDED" : null;
    // A failed attempt leaves the sale open for another card; chargebacks and the rest go to a person, not to an order.
    if (!kind) return { ok: false, reason: `ignored notify_type ${notify || "(none)"}` };
    if (!saleId || !orderId || !transactionId) return { ok: false, reason: "callback without sale, transaction or order reference" };
    let sale: SaleItem | null;
    try { sale = await this.sale(saleId); } catch { return { ok: false, reason: "the sale could not be confirmed with PayMe; the callback is retried" }; }
    if (!sale) return { ok: false, reason: "no such sale at PayMe" };
    if (sale.transaction_id !== orderId) return { ok: false, reason: "the confirmed sale belongs to another order" };
    const status = typeof sale.sale_status === "string" ? sale.sale_status : "";
    if (kind === "PAID" && !PAID_STATUSES.has(status)) return { ok: false, reason: `the confirmed sale is ${status || "unknown"}, not paid` };
    // A partial refund is not an order refund; a full refund leaves the sale "refunded" (refunds in parts stay partial).
    if (kind === "REFUNDED" && status !== "refunded") return { ok: false, reason: `the confirmed sale is ${status || "unknown"}, not fully refunded` };
    const amount = sale.sale_price, currency = sale.sale_currency;
    if (!Number.isSafeInteger(amount) || typeof currency !== "string") return { ok: false, reason: "the confirmed sale has no amount or currency" };
    if (kind === "PAID" && form.get("price") !== null && Number(form.get("price")) !== amount)
      return { ok: false, reason: "the callback amount differs from the confirmed sale" };
    const event: PaymentWebhookEvent = {
      // PayMe has no event id; the documented de-duplication key is notify_type + sale + transaction.
      providerEventId: `payme:${notify}:${saleId}:${transactionId}`, orderId, kind, providerPaymentId: saleId,
      amountAgorot: amount as number, currency: currency.toUpperCase(),
      // No buyer details are kept: only the references the event was confirmed by.
      raw: { notify_type: notify, payme_sale_id: saleId, payme_transaction_id: transactionId, transaction_id: orderId, sale_status: status },
    };
    return { ok: true, event };
  }

  async refund(providerPaymentId: string, amountAgorot: number): Promise<{ ok: boolean; providerRefundId?: string }> {
    if (!providerPaymentId || !Number.isSafeInteger(amountAgorot) || amountAgorot <= 0) return { ok: false };
    const { answer } = await this.post("refund-sale", { payme_sale_id: providerPaymentId, sale_refund_amount: amountAgorot, language: "en" });
    const code = typeof answer.status_error_code === "number" ? answer.status_error_code : Number(answer.status_error_code);
    if (answer.status_code === 0 && (answer.sale_status === "refunded" || answer.sale_status === "partial-refund"))
      return { ok: true, ...(typeof answer.payme_transaction_id === "string" ? { providerRefundId: answer.payme_transaction_id } : {}) };
    // Already fully refunded: positive proof the money is back, whoever moved it.
    if (code === ALREADY_FULLY_REFUNDED) return { ok: true };
    if (answer.status_code === 1 && REFUND_REFUSALS.has(code)) return { ok: false };
    // 998 (a matching call may still be running), 991, 20002, 999, or anything undocumented: the outcome is unknown.
    throw new PayMeUnknownOutcome("refund-sale", `status ${String(answer.status_code)} / ${String(answer.status_error_code)}`);
  }

  async refundStatus(providerPaymentId: string): Promise<RefundStatus> {
    const sale = await this.sale(providerPaymentId);
    if (!sale) return "unknown";
    if (sale.sale_status === "refunded") return "refunded";
    // Still paid and not refunded. PayMe documents no pending refund state, but no status proves a refund cannot still
    // complete either: this waits for positive proof and then a person; it never admits another refund.
    if (sale.sale_status === "completed") return "in-progress";
    return "unknown";
  }
}
