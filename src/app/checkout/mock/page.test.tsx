import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDict } from "@/i18n";
import { familySignInHref } from "@/lib/safe-redirect";

const f = vi.hoisted(() => ({ user: vi.fn(), token: vi.fn(), admin: vi.fn(), read: vi.fn(), access: vi.fn(), provider: "mock", live: false }));
vi.mock("@/lib/env", () => ({ isLiveShop: () => f.live }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Error(`REDIRECT:${url}`); }, notFound: () => { throw Error("NOT_FOUND"); } }));
vi.mock("@/lib/server/qa-access", () => ({ requireQaAccess: f.access }));
vi.mock("@/lib/server/session", () => ({ currentUser: f.user, draftTokenFromCookie: f.token, isAdminEmail: f.admin }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ payment: { id: f.provider }, db: { order: { findUnique: f.read } } }) }));
vi.mock("@/i18n/server", () => ({ getI18n: async () => ({ t: getDict("en"), locale: "en" }) }));
vi.mock("./MockPay", () => ({ MockPay: () => null }));
import MockCheckoutPage from "./page";

beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("React", React); f.provider = "mock";
  f.live = false;
  f.access.mockResolvedValue(undefined); f.user.mockResolvedValue({ id: "owner", email: "owner@example.invalid" }); f.token.mockResolvedValue(null); f.admin.mockReturnValue(false);
  f.read.mockResolvedValue({ id: "stored-order", gameId: "stored-game", userId: "owner", provider: "mock", amountAgorot: 3900, currency: "ILS", packageTier: "ONE_WORLD",
    game: { id: "stored-game", ownerId: "owner", draftToken: "creator-draft", childProfile: { displayName: "Synthetic" } } });
});
afterEach(() => vi.unstubAllGlobals());

function paymentProps(node: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(node)) return node.map(paymentProps).find(Boolean);
  if (!React.isValidElement<Record<string, unknown>>(node)) return undefined;
  if (typeof node.props.orderId === "string") return node.props;
  return paymentProps(node.props.children);
}

describe("mock checkout display authority and stored return destinations", () => {
  it("production hides the mock checkout before reading an order or account", async () => {
    f.live = true;
    await expect(MockCheckoutPage({ searchParams: Promise.resolve({ orderId: "stored-order" }) })).rejects.toThrow("NOT_FOUND");
    expect(f.read).not.toHaveBeenCalled(); expect(f.user).not.toHaveBeenCalled();
  });
  it.each(["javascript:alert(1)", "https://outside.invalid/collect", "//outside.invalid/collect", "/creating/foreign-game"])("ignores the untrusted success/cancel destination %s", async malicious => {
    const tree = await MockCheckoutPage({ searchParams: Promise.resolve({ orderId: "stored-order", success: malicious, cancel: malicious }) });
    expect(paymentProps(tree)).toMatchObject({ orderId: "stored-order", successUrl: "/creating/stored-game", cancelUrl: "/checkout/close?game=stored-game", declinedUrl: "/checkout/close?game=stored-game" });
    expect(JSON.stringify(tree)).not.toContain(malicious);
  });
  it("allows the anonymous creator's exact draft proof without adding compulsory sign-in", async () => {
    f.user.mockResolvedValue(null); f.token.mockResolvedValue("creator-draft");
    expect(paymentProps(await MockCheckoutPage({ searchParams: Promise.resolve({ orderId: "stored-order", success: "https://outside.invalid", cancel: "javascript:alert(1)" }) }))).toMatchObject({
      orderId: "stored-order", successUrl: "/creating/stored-game", cancelUrl: "/checkout?cancelled=1", declinedUrl: "/checkout?declined=1",
    });
  });
  it("returns a creator draft to checkout even when its browser is signed in to an unrelated account", async () => {
    f.user.mockResolvedValue({ id: "another-parent", email: "another@example.invalid" }); f.token.mockResolvedValue("creator-draft");
    expect(paymentProps(await MockCheckoutPage({ searchParams: Promise.resolve({ orderId: "stored-order" }) }))).toMatchObject({
      cancelUrl: "/checkout?cancelled=1", declinedUrl: "/checkout?declined=1",
    });
  });
  it("requires sign-in with only the local stored-order target when an anonymous viewer lacks draft proof", async () => {
    f.user.mockResolvedValue(null); f.token.mockResolvedValue("unrelated-draft");
    const next = familySignInHref("/checkout/mock?orderId=stored-order");
    await expect(MockCheckoutPage({ searchParams: Promise.resolve({ orderId: "stored-order", success: "javascript:alert(1)", cancel: "https://outside.invalid" }) })).rejects.toThrow(`REDIRECT:${next}`);
  });
  it("refuses another parent's order before returning any child/order presentation", async () => {
    f.user.mockResolvedValue({ id: "another-parent", email: "another@example.invalid" });
    await expect(MockCheckoutPage({ searchParams: Promise.resolve({ orderId: "stored-order" }) })).rejects.toThrow("NOT_FOUND");
  });
  it("allows an authenticated admin under the same authority as the mock payment API", async () => {
    f.user.mockResolvedValue({ id: "admin", email: "admin@example.invalid" }); f.admin.mockReturnValue(true);
    expect(paymentProps(await MockCheckoutPage({ searchParams: Promise.resolve({ orderId: "stored-order" }) }))).toMatchObject({
      orderId: "stored-order", cancelUrl: "/checkout/close?game=stored-game", declinedUrl: "/checkout/close?game=stored-game",
    });
  });
  it("constructs safe destinations even when a stored identifier contains URL punctuation", async () => {
    f.read.mockResolvedValue({ id: "stored-order", gameId: "//outside.invalid/#x", userId: "owner", provider: "mock", amountAgorot: 3900, currency: "ILS", packageTier: "ONE_WORLD",
      game: { ownerId: "owner", draftToken: null, childProfile: null } });
    const props = paymentProps(await MockCheckoutPage({ searchParams: Promise.resolve({ orderId: "stored-order" }) }))!;
    expect(new URL(String(props.successUrl), "https://local.invalid").origin).toBe("https://local.invalid");
    expect(new URL(String(props.cancelUrl), "https://local.invalid").origin).toBe("https://local.invalid");
    expect(new URL(String(props.cancelUrl), "https://local.invalid").searchParams.get("game")).toBe("//outside.invalid/#x");
  });
  it.each(["", "//outside.invalid", "x".repeat(161)])("rejects an invalid order identifier before querying it", async orderId => {
    await expect(MockCheckoutPage({ searchParams: Promise.resolve({ orderId }) })).rejects.toThrow("NOT_FOUND");
    expect(f.read).not.toHaveBeenCalled();
  });
  it("does not expose a real-provider order through the mock page", async () => {
    f.provider = "payme";
    await expect(MockCheckoutPage({ searchParams: Promise.resolve({ orderId: "stored-order" }) })).rejects.toThrow("NOT_FOUND");
    expect(f.read).not.toHaveBeenCalled();
  });
  it("refuses a real-provider order even when the configured current provider is mock", async () => {
    f.read.mockResolvedValue({ id: "stored-order", provider: "payme" });
    await expect(MockCheckoutPage({ searchParams: Promise.resolve({ orderId: "stored-order" }) })).rejects.toThrow("NOT_FOUND");
  });
});
