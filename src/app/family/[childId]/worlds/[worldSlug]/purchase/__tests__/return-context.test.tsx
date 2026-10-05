import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDict } from "@/i18n";
import { worldPurchaseDraftHref, worldPurchaseHref, worldPurchaseSignInHref } from "@/domain/world-purchase";
import { safeLocalPath } from "@/lib/safe-redirect";

const f = vi.hoisted(() => ({ user: vi.fn(), context: vi.fn(), begin: vi.fn(), draft: vi.fn(), cookie: vi.fn(), container: vi.fn(), limit: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw Error(`REDIRECT:${href}`); }, notFound: () => { throw Error("NOT_FOUND"); } }));
vi.mock("@/lib/server/qa-access", () => ({ requireQaAccess: async () => {} }));
vi.mock("@/lib/server/session", () => ({ currentUser: f.user, isAdminEmail: () => false, setDraftCookie: f.cookie }));
vi.mock("@/services/container", () => ({ getContainer: f.container }));
vi.mock("@/services/world-purchase.service", () => ({ worldPurchaseContext: f.context, beginWorldPurchase: f.begin }));
vi.mock("@/lib/server/db-guard", () => ({ guardDb: (run: () => unknown) => run() }));
vi.mock("@/lib/server/rate-limit", () => ({ LIMITS: { checkout: { limit: 10, windowMs: 600000 } }, rateLimit: f.limit }));
vi.mock("@/i18n/server", () => ({ getI18n: async () => ({ t: getDict("en"), locale: "en" }), getLocale: async () => "en", getCurrency: async () => "ILS" }));
vi.mock("@/ui/Shell", () => ({ SiteHeader: () => null, SiteFooter: () => null }));
vi.mock("../PurchasePanel", () => ({ PurchasePanel: () => null }));
vi.mock("@/app/create/actions", () => ({ currentDraft: f.draft }));
import WorldPurchasePage from "../page";
import { continueWorldAction } from "../actions";
import CreatePhotoPage from "@/app/create/photo/page";
import CheckoutPage from "@/app/checkout/page";
import ClosePaymentPage from "@/app/checkout/close/page";

beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("React", React);
  f.user.mockResolvedValue(null); f.draft.mockResolvedValue(null); f.limit.mockReturnValue({ ok: true }); f.container.mockReturnValue({ db: {} });
});
afterEach(() => { vi.unstubAllGlobals(); });
const route = { childId: "child-test", worldSlug: "kingdom" };
const target = worldPurchaseHref(route.childId, route.worldSlug, "source-game", 8);
const signIn = worldPurchaseSignInHref(target);

function panelProps(node: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(node)) return node.map(panelProps).find(Boolean);
  if (!React.isValidElement<Record<string, unknown>>(node)) return undefined;
  if (node.props.childId === route.childId && node.props.worldSlug === route.worldSlug) return node.props;
  return panelProps(node.props.children);
}

describe("world purchase session recovery", () => {
  it("the parent GET retains its child, world, requested age and owned-return context without reading private context while signed out", async () => {
    await expect(WorldPurchasePage({ params: Promise.resolve(route), searchParams: Promise.resolve({ ageYears: "8", returnGame: "source-game" }) })).rejects.toThrow(`REDIRECT:${signIn}`);
    expect(f.context).not.toHaveBeenCalled(); expect(f.begin).not.toHaveBeenCalled();
  });
  it("the parent confirmation retains the same context on expiry instead of creating a duplicate draft", async () => {
    const form = new FormData(); form.set("ageYears", "8"); form.set("returnGame", "source-game");
    await expect(continueWorldAction(route.childId, route.worldSlug, null, form)).rejects.toThrow(`REDIRECT:${signIn}`);
    expect(f.begin).not.toHaveBeenCalled(); expect(f.cookie).not.toHaveBeenCalled();
  });
  it.each(["photo", "checkout"] as const)("an expired explicit %s step returns to its same frozen game after login", async phase => {
    const page = phase === "photo" ? CreatePhotoPage : CheckoutPage;
    await expect(page({ searchParams: Promise.resolve({ game: "world-game" }) })).rejects.toThrow(`REDIRECT:${worldPurchaseSignInHref(worldPurchaseDraftHref("world-game", phase))}`);
    expect(f.context).not.toHaveBeenCalled(); expect(f.begin).not.toHaveBeenCalled();
  });
  it("after login, restores the parent's valid new-game age, but a resumed game keeps its frozen age", async () => {
    f.user.mockResolvedValue({ id: "owner", email: "owner@example.invalid" });
    const context = { child: { displayName: "Synthetic" }, world: { name: { he: "ממלכה", en: "Kingdom" } }, state: "new", continuation: true, ageYears: 5, active: null, returnGameId: "source-game", returnHref: "/family/child-test/worlds" };
    f.context.mockResolvedValue(context);
    const args = { params: Promise.resolve(route), searchParams: Promise.resolve({ ageYears: "8", returnGame: "source-game" }) };
    expect(panelProps(await WorldPurchasePage(args))).toMatchObject({ ageYears: 8, returnGameId: "source-game", resuming: false });
    f.context.mockResolvedValue({ ...context, state: "checkout", active: { id: "existing-game" } });
    expect(panelProps(await WorldPurchasePage(args))).toMatchObject({ ageYears: 5, resuming: true });
    expect(f.context).toHaveBeenCalledWith(expect.anything(), { ownerId: "owner", familyChildId: route.childId, worldSlug: "kingdom", returnGameId: "source-game" });
  });
  it("encoded route parameters and an invalid age can never become an external login destination", () => {
    const constructed = worldPurchaseHref("//evil.invalid", "../kingdom", "https://evil.invalid", 200);
    const next = new URL(worldPurchaseSignInHref(constructed), "https://local.invalid").searchParams.get("next");
    expect(next).toBe(constructed); expect(safeLocalPath(next, "/family")).toBe(constructed); expect(next).not.toContain("ageYears");
    expect(new URL(next!, "https://local.invalid").origin).toBe("https://local.invalid");
  });
  it("a signed-in stranger cannot turn a retained local URL into a purchase capability", async () => {
    f.user.mockResolvedValue({ id: "stranger", email: "stranger@example.invalid" }); f.context.mockResolvedValue(null);
    await expect(WorldPurchasePage({ params: Promise.resolve(route), searchParams: Promise.resolve({ ageYears: "8", returnGame: "source-game" }) })).rejects.toThrow("NOT_FOUND");
    expect(f.begin).not.toHaveBeenCalled(); expect(f.context).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ownerId: "stranger" }));
  });
  it("an expired historical-payment recovery link is retained through parent login", async () => {
    await expect(ClosePaymentPage({ searchParams: Promise.resolve({ game: "deleted-game" }) })).rejects.toThrow(`REDIRECT:${worldPurchaseSignInHref("/checkout/close?game=deleted-game")}`);
    expect(f.container).not.toHaveBeenCalled();
  });
  it("the owner can open an old deleted game's financial closure form without loading any image/profile/config", async () => {
    f.user.mockResolvedValue({ id: "owner", email: "owner@example.invalid" });
    const read = vi.fn().mockResolvedValue({ id: "deleted-game", familyChild: { id: "child-test", ownerId: "owner", deletedAt: null },
      orders: [{ id: "old-order", paymentStatus: "PENDING", checkoutUrl: "https://mock.example.invalid/old", checkoutClaimUntil: null, providerPaymentId: "synthetic-psp" }] });
    f.container.mockReturnValue({ db: { game: { findFirst: read } } });
    const page = await ClosePaymentPage({ searchParams: Promise.resolve({ game: "deleted-game" }) });
    expect(JSON.stringify(page)).toContain('"gameId":"deleted-game"'); expect(JSON.stringify(page)).toContain('"recovery":true');
    expect(read.mock.calls[0]![0].where).toEqual({ id: "deleted-game", ownerId: "owner" });
    expect(Object.keys(read.mock.calls[0]![0].select).sort()).toEqual(["familyChild", "id", "orders"]);
    expect(f.draft).not.toHaveBeenCalled();
  });
  it("a paid historical game shows confirmed-payment copy without a closure form or an editing promise", async () => {
    f.user.mockResolvedValue({ id: "owner", email: "owner@example.invalid" });
    const read = vi.fn().mockResolvedValue({ id: "paid-game", familyChild: null, orders: [
      { id: "paid-order", paymentStatus: "PAID", refundedAt: null, checkoutUrl: "https://qa.example.invalid/checkout/mock?orderId=paid-order", checkoutClaimUntil: null, providerPaymentId: "synthetic-payment" },
    ] });
    f.container.mockReturnValue({ appUrl: "https://qa.example.invalid", db: { game: { findFirst: read } } });
    const tree = JSON.stringify(await ClosePaymentPage({ searchParams: Promise.resolve({ game: "paid-game" }) }));
    expect(tree).toContain(getDict("en").worldPurchase.paymentAlreadyPaid);
    expect(tree).not.toContain(getDict("en").worldPurchase.paymentClosed);
    expect(tree).not.toContain('"recovery":true');
    expect(read.mock.calls[0]![0].select.orders.where.paymentStatus.in).toContain("PAID");
    expect(read.mock.calls[0]![0].select.orders.select.refundedAt).toBe(true);
  });
  it("an adventure with no active attempt displays neutral financial copy without suggesting the game can be edited", async () => {
    f.user.mockResolvedValue({ id: "owner", email: "owner@example.invalid" });
    f.container.mockReturnValue({ db: { game: { findFirst: vi.fn().mockResolvedValue({ id: "deleted-game", familyChild: null, orders: [] }) } } });
    const tree = JSON.stringify(await ClosePaymentPage({ searchParams: Promise.resolve({ game: "deleted-game" }) }));
    expect(tree).toContain(getDict("en").worldPurchase.paymentClosed);
    expect(tree).not.toContain(getDict("en").worldPurchase.paymentAlreadyPaid);
    expect(tree).not.toContain('"recovery":true');
  });
  it.each(["PENDING", "FAILED"])("%s retains its stored hosted-payment return alongside the close form", async paymentStatus => {
    f.user.mockResolvedValue({ id: "owner", email: "owner@example.invalid" });
    f.container.mockReturnValue({ appUrl: "https://qa.example.invalid", db: { game: { findFirst: vi.fn().mockResolvedValue({ id: "unpaid-game", familyChild: null,
      orders: [{ id: "unpaid-order", paymentStatus, checkoutUrl: "https://qa.example.invalid/checkout/mock?orderId=unpaid-order", checkoutClaimUntil: null, providerPaymentId: "synthetic-payment" }] }) } } });
    const tree = JSON.stringify(await ClosePaymentPage({ searchParams: Promise.resolve({ game: "unpaid-game" }) }));
    expect(tree).toContain('"href":"https://qa.example.invalid/checkout/mock?orderId=unpaid-order"');
    expect(tree).toContain(getDict("en").worldPurchase.returnPayment);
    expect(tree).toContain('"recovery":true');
  });
  it.each(["javascript:alert(1)", "data:text/html,x", "https://user:password@outside.invalid"])("refuses unsafe stored navigation %s while still allowing financial closure", async checkoutUrl => {
    f.user.mockResolvedValue({ id: "owner", email: "owner@example.invalid" });
    f.container.mockReturnValue({ appUrl: "https://qa.example.invalid", db: { game: { findFirst: vi.fn().mockResolvedValue({ id: "unpaid-game", familyChild: null,
      orders: [{ id: "unpaid-order", paymentStatus: "PENDING", checkoutUrl, checkoutClaimUntil: null, providerPaymentId: "synthetic-payment" }] }) } } });
    const tree = JSON.stringify(await ClosePaymentPage({ searchParams: Promise.resolve({ game: "unpaid-game" }) }));
    expect(tree).not.toContain(checkoutUrl); expect(tree).not.toContain(getDict("en").worldPurchase.returnPayment);
    expect(tree).toContain('"recovery":true');
  });
});
