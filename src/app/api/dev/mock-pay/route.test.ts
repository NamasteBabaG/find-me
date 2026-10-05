import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ db: vi.fn(), user: vi.fn(), token: vi.fn(), close: vi.fn(), webhook: vi.fn() }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => null }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ appUrl: "https://qa.example.invalid", payment: { id: "mock", sign: () => "synthetic-signature" }, db: { order: { findUnique: f.db } } }) }));
vi.mock("@/services/order.service", () => ({ handlePaymentWebhook: f.webhook }));
vi.mock("@/services/checkout-close.service", () => ({ closeDraftCheckout: f.close }));
vi.mock("@/lib/server/session", () => ({ currentUser: f.user, draftTokenFromCookie: f.token, isAdminEmail: () => false }));
vi.mock("@/domain/spend-policy", () => ({ spendAllowedFor: () => true }));
vi.mock("@/lib/env", () => ({ spendGuard: () => ({}) }));
import { POST } from "./route";
beforeEach(() => {
  vi.clearAllMocks(); f.user.mockResolvedValue({ id: "owner" }); f.token.mockResolvedValue(null);
  f.db.mockResolvedValue({ id: "order", gameId: "game", userId: "owner", game: { ownerId: "owner", draftToken: "synthetic-draft" }, user: { email: "owner@example.invalid" } });
  f.close.mockResolvedValue({ ok: true });
});
const request = (origin = "https://qa.example.invalid") => new Request("https://qa.example.invalid/api/dev/mock-pay", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ orderId: "order", kind: "CANCELLED" }) });
describe("mock hosted payment cancellation", () => {
  it("Cancel calls terminal closure instead of inventing a failure webhook", async () => {
    const result = await POST(request()); expect(result.status).toBe(200);
    expect(f.close).toHaveBeenCalledWith(expect.anything(), { ownerId: "owner", gameId: "game", orderId: "order" }); expect(f.webhook).not.toHaveBeenCalled();
  });
  it("unknown closure stays pending for the browser and never reports success", async () => {
    f.close.mockResolvedValue({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    const result = await POST(request()); expect(result.status).toBe(409); expect(await result.json()).toMatchObject({ ok: false });
  });
  it("refuses cross-origin cancellation and another parent's order", async () => {
    expect((await POST(request("https://outside.invalid"))).status).toBe(403); expect(f.close).not.toHaveBeenCalled();
    f.user.mockResolvedValue({ id: "stranger" }); expect((await POST(request())).status).toBe(403); expect(f.close).not.toHaveBeenCalled();
  });
  it("retains the original anonymous checkout's draft proof for mock Cancel", async () => {
    f.user.mockResolvedValue(null); f.token.mockResolvedValue("synthetic-draft");
    expect((await POST(request())).status).toBe(200); expect(f.close).toHaveBeenCalledOnce();
  });
});
