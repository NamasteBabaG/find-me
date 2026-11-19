import { describe, expect, it, vi } from "vitest";
import { PayMeProvider, PayMeUnknownOutcome } from "../payme";
import type { PaymentProvider } from "../types";

// PayMe Payments API shapes as documented at docs.payme.io (generate-sale, refund-sale, get-sales, callbacks).
// No network: every call goes to a controlled fetch.
type Call = { url: string; body: Record<string, unknown> };
function provider(answer: (endpoint: string, body: Record<string, unknown>) => unknown) {
  const calls: Call[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    const value = answer(String(url).split("/").at(-1)!, body);
    if (value instanceof Error) throw value;
    return new Response(typeof value === "string" ? value : JSON.stringify(value), { status: 200 });
  });
  const payme = new PayMeProvider({ sellerId: "MPL-synthetic", environment: "sandbox", callbackUrl: "https://shop.example/api/webhooks/payment",
    fetch: fetcher as unknown as typeof fetch });
  return { payme, calls, fetcher };
}
const sale = (status: string, extra: Record<string, unknown> = {}) => ({ status_code: 0, items_count: 1,
  items: [{ sale_payme_id: "SALE-1", transaction_id: "ord-1", sale_status: status, sale_price: 2900, sale_currency: "ILS", ...extra }] });
const callback = (fields: Record<string, string>) => new URLSearchParams({ payme_sale_id: "SALE-1", transaction_id: "ord-1",
  payme_transaction_id: "TRX-1", price: "2900", currency: "ILS", buyer_email: "parent@example.invalid", buyer_name: "Synthetic Parent", ...fields }).toString();

describe("PayMe adapter", () => {
  it("creates a hosted sale with the documented fields and returns the sale URL as given", async () => {
    const { payme, calls } = provider(() => ({ status_code: 0, sale_url: "https://sandbox.payme.io/sale/generate/XYZ", payme_sale_id: "SALE-1" }));
    const session = await payme.createCheckout({ orderId: "ord-1", amountAgorot: 2900, currency: "ils", description: "Find Me world",
      customerEmail: "parent@example.invalid", successUrl: "https://shop.example/done", cancelUrl: "https://shop.example/back" });
    expect(session).toEqual({ checkoutUrl: "https://sandbox.payme.io/sale/generate/XYZ", providerPaymentId: "SALE-1" });
    expect(calls[0]!.url).toBe("https://sandbox.payme.io/api/generate-sale");
    expect(calls[0]!.body).toMatchObject({ seller_payme_id: "MPL-synthetic", sale_price: 2900, currency: "ILS", transaction_id: "ord-1",
      sale_callback_url: "https://shop.example/api/webhooks/payment", sale_return_url: "https://shop.example/done" });
    // The legacy major-unit field is never sent: it would override sale_price.
    expect(calls[0]!.body).not.toHaveProperty("price");
    // Hosted page only: never a saved-card token, which would charge without the buyer (and void the retry contract).
    expect(calls[0]!.body).not.toHaveProperty("buyer_key"); expect(calls[0]!.body).not.toHaveProperty("capture_buyer");
    expect(payme.checkoutRetryLeavesUnreachableSale).toBe(true); expect((payme as PaymentProvider).supportsCheckoutIdempotency).toBeUndefined();
  });

  it("refuses a checkout PayMe declined, naming only its code", async () => {
    const { payme } = provider(() => ({ status_code: 1, status_error_code: 251, status_error_details: "Seller was not found", status_additional_info: "seller_payme_id" }));
    await expect(payme.createCheckout({ orderId: "ord-1", amountAgorot: 2900, currency: "ILS", description: "x", customerEmail: "parent@example.invalid",
      successUrl: "https://shop.example/done", cancelUrl: "https://shop.example/back" })).rejects.toThrow("PAYME_CHECKOUT_REFUSED: 251");
  });

  it("never trusts a callback: a paid callback becomes PAID only after get-sales confirms the sale, with its verified amount", async () => {
    const { payme, calls } = provider(() => sale("completed"));
    const parsed = await payme.parseWebhook(callback({ notify_type: "sale-complete", sale_status: "completed" }), {});
    expect(parsed).toEqual({ ok: true, event: { providerEventId: "payme:sale-complete:SALE-1:TRX-1", orderId: "ord-1", kind: "PAID",
      providerPaymentId: "SALE-1", amountAgorot: 2900, currency: "ILS",
      raw: { notify_type: "sale-complete", payme_sale_id: "SALE-1", payme_transaction_id: "TRX-1", transaction_id: "ord-1", sale_status: "completed" } } });
    expect(calls[0]!.url).toBe("https://sandbox.payme.io/api/get-sales");
    // Unpaid "initial" sales are only returned when asked for explicitly.
    expect(calls[0]!.body).toMatchObject({ sale_payme_id: "SALE-1", sale_status: expect.arrayContaining(["initial", "completed", "refunded"]) });
    // No buyer details are kept with the event.
    expect(JSON.stringify(parsed)).not.toContain("parent@example.invalid"); expect(JSON.stringify(parsed)).not.toContain("Synthetic Parent");
  });

  it("refuses forged or mismatched callbacks", async () => {
    expect(await provider(() => sale("initial")).payme.parseWebhook(callback({ notify_type: "sale-complete" }), {}))
      .toMatchObject({ ok: false, reason: expect.stringContaining("not paid") });
    expect(await provider(() => sale("completed", { transaction_id: "ord-other" })).payme.parseWebhook(callback({ notify_type: "sale-complete" }), {}))
      .toMatchObject({ ok: false, reason: expect.stringContaining("another order") });
    expect(await provider(() => sale("completed")).payme.parseWebhook(callback({ notify_type: "sale-complete", price: "100" }), {}))
      .toMatchObject({ ok: false, reason: expect.stringContaining("amount") });
    expect(await provider(() => ({ status_code: 0, items_count: 0, items: [] })).payme.parseWebhook(callback({ notify_type: "sale-complete" }), {}))
      .toMatchObject({ ok: false, reason: "no such sale at PayMe" });
    expect(await provider(() => Error("down")).payme.parseWebhook(callback({ notify_type: "sale-complete" }), {}))
      .toMatchObject({ ok: false, reason: expect.stringContaining("retried") });
  });

  it("a refund callback is an order refund only when the confirmed sale is fully refunded; failures and chargebacks are not events", async () => {
    expect(await provider(() => sale("refunded")).payme.parseWebhook(callback({ notify_type: "refund", payme_transaction_id: "TRX-R" }), {}))
      .toMatchObject({ ok: true, event: { kind: "REFUNDED", providerEventId: "payme:refund:SALE-1:TRX-R" } });
    expect(await provider(() => sale("partial-refund")).payme.parseWebhook(callback({ notify_type: "refund" }), {}))
      .toMatchObject({ ok: false, reason: expect.stringContaining("not fully refunded") });
    for (const notify of ["sale-failure", "sale-chargeback", "sale-create"]) {
      const { payme, fetcher } = provider(() => sale("completed"));
      expect(await payme.parseWebhook(callback({ notify_type: notify }), {})).toMatchObject({ ok: false, reason: expect.stringContaining("ignored") });
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("refunds by the documented call and reads its outcome: success, already refunded, refusal, or unknown", async () => {
    const ok = provider(() => ({ status_code: 0, status_error_code: 0, payme_status: "success", sale_status: "refunded", payme_transaction_id: "TRX-R" }));
    expect(await ok.payme.refund("SALE-1", 2900)).toEqual({ ok: true, providerRefundId: "TRX-R" });
    expect(ok.calls[0]).toMatchObject({ url: "https://sandbox.payme.io/api/refund-sale", body: { payme_sale_id: "SALE-1", sale_refund_amount: 2900 } });
    expect(await provider(() => ({ status_code: 1, status_error_code: 309 })).payme.refund("SALE-1", 2900)).toEqual({ ok: true });
    expect(await provider(() => ({ status_code: 1, status_error_code: 305, status_additional_info: "chargeback" })).payme.refund("SALE-1", 2900)).toEqual({ ok: false });
    // A matching call may still be running, a timeout, a gateway page or an undocumented code: never a refusal, never a success.
    for (const answer of [{ status_code: 1, status_error_code: 998 }, { status_code: 1, status_error_code: 991 }, "<html>502</html>", Error("socket hang up")])
      await expect(provider(() => answer).payme.refund("SALE-1", 2900)).rejects.toBeInstanceOf(PayMeUnknownOutcome);
  });

  it("reports refund status from the sale and never answers no-transfer", async () => {
    expect(await provider(() => sale("refunded")).payme.refundStatus("SALE-1")).toBe("refunded");
    expect(await provider(() => sale("completed")).payme.refundStatus("SALE-1")).toBe("in-progress");
    for (const status of ["partial-refund", "chargeback", "partial-chargeback", "failed", "voided", "initial"])
      expect(await provider(() => sale(status)).payme.refundStatus("SALE-1")).toBe("unknown");
    expect(await provider(() => ({ status_code: 0, items_count: 0, items: [] })).payme.refundStatus("SALE-1")).toBe("unknown");
  });

  it("requires its seller, a known environment and a public https callback", () => {
    const base = { sellerId: "MPL-synthetic", environment: "sandbox" as const, callbackUrl: "https://shop.example/api/webhooks/payment" };
    expect(() => new PayMeProvider({ ...base, sellerId: "" })).toThrow("PAYME_SELLER_ID");
    expect(() => new PayMeProvider({ ...base, environment: "prod" as never })).toThrow("PAYME_ENVIRONMENT");
    for (const callbackUrl of ["http://shop.example/x", "https://localhost/x", "not a url"])
      expect(() => new PayMeProvider({ ...base, callbackUrl })).toThrow("callback");
    expect(new PayMeProvider({ ...base, environment: "live" })).toBeInstanceOf(PayMeProvider);
  });
});
