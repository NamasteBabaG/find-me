import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDict } from "@/i18n";
const mocks = vi.hoisted(() => ({ qa: vi.fn(), user: vi.fn(), container: vi.fn(), children: vi.fn(), game: vi.fn(), passport: vi.fn(),
  redirect: vi.fn((path: string) => { throw Error(`REDIRECT:${path}`); }), notFound: vi.fn(() => { throw Error("NOT_FOUND"); }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("@/lib/server/qa-access", () => ({ requireQaAccess: mocks.qa }));
vi.mock("@/lib/server/session", () => ({ currentUser: mocks.user, isAdminEmail: () => false }));
vi.mock("@/i18n/server", () => ({ getI18n: async () => ({ t: getDict("en"), locale: "en" }), getCurrency: async () => "ILS" }));
vi.mock("@/services/container", () => ({ getContainer: mocks.container }));
vi.mock("@/services/family-adventures.service", () => ({ familyAdventures: mocks.children }));
vi.mock("@/services/child-pricing.service", () => ({ childHasPaidWorld: vi.fn() }));
vi.mock("@/services/passport.service", () => ({ ownerPassport: mocks.passport, PassportAccessError: class extends Error {} }));
vi.mock("@/services/asset.service", () => ({ withFreshAssetUrls: vi.fn(value => value) }));
vi.mock("@/services/adventure-album.service", () => ({ albumSeed: vi.fn() }));
vi.mock("@/ui/friends/FamilyFriendSharing", () => ({ FamilyFriendSharing: () => null }));
vi.mock("@/game/components/GameShell", () => ({ GameShell: () => null }));
vi.mock("@/ui/passport/OwnerPassport", () => ({ OwnerPassport: () => null }));
vi.mock("@/ui/passport/PassportSharing", () => ({ PassportSharing: () => null }));
import ChildPage from "../[childId]/page";
import FamilyPlay from "../[childId]/play/[gameId]/page";
import PassportPage from "../[childId]/passport/page";
import { PassportAccessError } from "@/services/passport.service";

const childId = "fam_test", gameId = "game_source";
const routes = [
  ["child", () => ChildPage({ params: Promise.resolve({ childId }), searchParams: Promise.resolve({ friends: gameId, world: "kingdom" }) }), "/family/fam_test?friends=game_source&world=kingdom"],
  ["play", () => FamilyPlay({ params: Promise.resolve({ childId, gameId }), searchParams: Promise.resolve({ board: "tokyo", world: "journey" }) }), "/family/fam_test/play/game_source?board=tokyo&world=journey"],
  ["passport", () => PassportPage({ params: Promise.resolve({ childId }) }), "/family/fam_test/passport"],
] as const;
beforeEach(() => {
  vi.clearAllMocks(); mocks.qa.mockResolvedValue(undefined); mocks.user.mockResolvedValue(null);
  mocks.container.mockReturnValue({ db: { game: { findFirst: mocks.game } } }); mocks.game.mockResolvedValue(null); mocks.children.mockResolvedValue([]);
  mocks.passport.mockRejectedValue(new PassportAccessError("not-found"));
});

describe("protected family routes preserve only navigation context", () => {
  it.each(routes)("signed-out %s resumes the original local route after login without reading private data", async (_name, run, next) => {
    await expect(run()).rejects.toThrow("REDIRECT:/family?");
    const login = new URL(mocks.redirect.mock.calls[0]![0], "https://example.invalid");
    expect(login.pathname).toBe("/family"); expect(login.searchParams.get("next")).toBe(next);
    expect(mocks.container).not.toHaveBeenCalled(); expect(mocks.children).not.toHaveBeenCalled(); expect(mocks.passport).not.toHaveBeenCalled(); expect(mocks.game).not.toHaveBeenCalled();
  });
  it.each(routes)("%s still requires the QA gate before user or application data", async (_name, run) => {
    mocks.qa.mockRejectedValue(new Error("QA_LOCKED")); await expect(run()).rejects.toThrow("QA_LOCKED");
    expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.container).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it.each(routes)("signed-in nonowners still cannot access %s merely by retaining its return path", async (_name, run) => {
    mocks.user.mockResolvedValue({ id: "usr_other", email: "other@example.invalid" });
    await expect(run()).rejects.toThrow("NOT_FOUND"); expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });
  it("query values stay encoded data and arbitrary redirect keys are not copied into the play return", async () => {
    const query = { world: "journey&next=https://outside.invalid", board: "tokyo", next: "//outside.invalid" };
    await expect(FamilyPlay({ params: Promise.resolve({ childId, gameId }), searchParams: Promise.resolve(query) })).rejects.toThrow("REDIRECT:/family?");
    const login = new URL(mocks.redirect.mock.calls[0]![0], "https://example.invalid");
    const next = new URL(login.searchParams.get("next")!, login.origin);
    expect(next.origin).toBe(login.origin); expect(next.pathname).toBe("/family/fam_test/play/game_source");
    expect(next.searchParams.get("world")).toBe(query.world); expect(next.searchParams.get("board")).toBe("tokyo");
    expect(next.searchParams.has("next")).toBe(false); expect(mocks.container).not.toHaveBeenCalled();
  });
  it("route parameters are encoded before constructing a sign-in destination", async () => {
    await expect(PassportPage({ params: Promise.resolve({ childId: "fam_test/../../outside?next=bad" }) })).rejects.toThrow("REDIRECT:/family?");
    const login = new URL(mocks.redirect.mock.calls[0]![0], "https://example.invalid");
    const next = new URL(login.searchParams.get("next")!, login.origin);
    expect(next.origin).toBe(login.origin); expect(next.pathname).toBe("/family/fam_test%2F..%2F..%2Foutside%3Fnext%3Dbad/passport");
    expect(next.searchParams.size).toBe(0); expect(mocks.container).not.toHaveBeenCalled();
  });
});
