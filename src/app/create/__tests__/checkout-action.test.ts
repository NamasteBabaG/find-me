import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ limit: vi.fn(), checkout: vi.fn(), container: vi.fn(), user: vi.fn(), draft: { id: "draft" }, enabled: true }));
vi.mock("@/lib/purchasing", async original => ({ ...await original<typeof import("@/lib/purchasing")>(), purchasingEnabled: () => f.enabled }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw Error(`REDIRECT:${url}`); } }));
vi.mock("@/lib/server/qa-access", () => ({ requireQaAccess: async () => {} }));
vi.mock("@/lib/server/session", () => ({ currentUser: f.user, draftTokenFromCookie: async () => "cookie", requestHeaders: async () => ({ "x-forwarded-for": "192.0.2.1, 192.0.2.2" }) }));
vi.mock("@/i18n/server", () => ({ getCurrency: async () => "ILS" }));
vi.mock("@/lib/server/rate-limit", () => ({ LIMITS: { checkout: { limit: 10, windowMs: 600000 } }, rateLimit: f.limit }));
vi.mock("@/services/container", () => ({ getContainer: f.container }));
vi.mock("@/services/create-flow.service", () => ({ draftBelongsTo: () => true, loadDraft: async () => f.draft }));
vi.mock("@/services/order.service", () => ({ startCheckout: f.checkout }));
vi.mock("@/lib/server/db-guard", () => ({ guardDb: (run: () => unknown) => run() }));
import { checkoutAction } from "../actions";
import { LEGAL_VERSION } from "@/domain/legal";
beforeEach(() => {
  vi.clearAllMocks(); f.limit.mockReturnValue({ ok: true });
  f.enabled = true;
  f.user.mockResolvedValue({ id: "owner" });
  f.container.mockReturnValue({ db: { game: { findUnique: async () => ({ ...f.draft, status: "PACKAGE_SELECTED" }) } } });
  f.checkout.mockResolvedValue({ ok: true, checkoutUrl: "/checkout/synthetic" });
});
describe("checkout server action rate gates", () => {
  it("prelaunch refuses before any checkout or draft lookup", async () => {
    f.enabled = false;
    expect(await checkoutAction(null, new FormData())).toMatchObject({ ok: false, code: "PURCHASING_CLOSED" });
    expect(f.container).not.toHaveBeenCalled(); expect(f.checkout).not.toHaveBeenCalled(); expect(f.user).not.toHaveBeenCalled();
  });
  it("rejects an IP flood before reading a draft or contacting a provider", async () => {
    f.limit.mockReturnValue({ ok: false });
    expect(await checkoutAction(null, new FormData())).toMatchObject({ ok: false, code: "TOO_MANY_REQUESTS" });
    expect(f.container).not.toHaveBeenCalled(); expect(f.checkout).not.toHaveBeenCalled();
  });
  it("also fences the draft independently of IP", async () => {
    f.limit.mockReturnValueOnce({ ok: true }).mockReturnValueOnce({ ok: false });
    expect(await checkoutAction(null, new FormData())).toMatchObject({ ok: false, code: "TOO_MANY_REQUESTS" });
    expect(f.limit).toHaveBeenLastCalledWith("checkout-draft:draft", 10, 600000); expect(f.checkout).not.toHaveBeenCalled();
  });
  it("preserves normal checkout", async () => {
    const form = new FormData(); form.set("legalAccepted", "1"); form.set("legalVersion", LEGAL_VERSION);
    await expect(checkoutAction(null, form)).rejects.toThrow("REDIRECT:/checkout/synthetic");
    expect(f.checkout).toHaveBeenCalledOnce();
    expect(f.limit).toHaveBeenNthCalledWith(1, "checkout:192.0.2.1", 10, 600000);
  });
  it.each(["missing", "stale"])("rejects %s terms acceptance before any payment", async kind => {
    const form = new FormData();
    if (kind === "stale") { form.set("legalAccepted", "1"); form.set("legalVersion", "previous"); }
    expect(await checkoutAction(null, form)).toMatchObject({ ok: false, code: "TERMS_REQUIRED" });
    expect(f.checkout).not.toHaveBeenCalled();
  });
  it("an expired parent session preserves the explicit world draft through login before reading or opening payment", async () => {
    f.user.mockResolvedValue(null);
    const form = new FormData(); form.set("gameId", "world-draft"); form.set("legalAccepted", "1"); form.set("legalVersion", LEGAL_VERSION);
    await expect(checkoutAction(null, form)).rejects.toThrow("REDIRECT:/family?next=%2Fcheckout%3Fgame%3Dworld-draft");
    expect(f.checkout).not.toHaveBeenCalled();
  });
});
