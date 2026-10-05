import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ qa: vi.fn(), request: vi.fn(), locale: vi.fn(), limit: vi.fn(), container: { synthetic: true } }));
vi.mock("@/lib/server/qa-access", () => ({ requireQaAccess: mocks.qa }));
vi.mock("@/services/container", () => ({ getContainer: () => mocks.container }));
vi.mock("@/services/auth.service", () => ({ requestMagicLink: mocks.request, destroySession: vi.fn() }));
vi.mock("@/services/game.service", () => ({ deleteGame: vi.fn(), updateGift: vi.fn() }));
vi.mock("@/services/share-link.service", () => ({ rotatePlayerLink: vi.fn() }));
vi.mock("@/lib/server/session", () => ({ SESSION_COOKIE: "synthetic-session", clearSessionCookie: vi.fn(), currentUser: vi.fn(), requestHeaders: async () => ({ "x-real-ip": "192.0.2.10" }) }));
vi.mock("@/lib/server/rate-limit", () => ({ LIMITS: { magicLink: { limit: 3, windowMs: 1000 } }, rateLimit: mocks.limit }));
vi.mock("@/i18n/server", () => ({ getLocale: mocks.locale }));
import { requestMagicLinkAction } from "../actions";

const email = "parent@example.invalid";
function form(next?: string) { const data = new FormData(); data.set("email", email); if (next !== undefined) data.set("next", next); return data; }
beforeEach(() => { vi.clearAllMocks(); mocks.qa.mockResolvedValue(undefined); mocks.request.mockResolvedValue({ ok: true }); mocks.locale.mockResolvedValue("he"); mocks.limit.mockReturnValue({ ok: true }); });

describe("parent login keeps the selected adventure", () => {
  it.each([
    "/family/fam_test/worlds/kingdom/purchase?ageYears=8&returnGame=game_source",
    "/checkout?game=game_selected",
    "/create/photo?game=game_selected#photo",
  ])("keeps the safe return query in the emailed sign-in link: %s", async next => {
    expect(await requestMagicLinkAction(null, form(next))).toEqual({ ok: true, email });
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith(mocks.container, email, next, "he");
    expect(mocks.limit).toHaveBeenCalledTimes(2); expect(mocks.qa).toHaveBeenCalledOnce();
  });
  it.each([undefined, "", "https://outside.invalid/path", "//outside.invalid/path", "/\\outside.invalid/path", "/\n/outside.invalid"])("uses the family area for an absent or unsafe return: %j", async next => {
    await requestMagicLinkAction(null, form(next));
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith(mocks.container, email, "/family", "he");
  });
  it("normalizes dot segments while preserving the selected game", async () => {
    await requestMagicLinkAction(null, form("/family/../checkout?game=game_selected"));
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith(mocks.container, email, "/checkout?game=game_selected", "he");
  });
  it("still rate limits before any email request even when a destination is supplied", async () => {
    mocks.limit.mockReturnValue({ ok: false });
    expect(await requestMagicLinkAction(null, form("/checkout?game=game_selected"))).toMatchObject({ ok: false, code: "TOO_MANY_REQUESTS" });
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
