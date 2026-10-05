// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDict } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
const mocks = vi.hoisted(() => ({ user: vi.fn(), qa: vi.fn(), container: vi.fn(), adventures: vi.fn(), drafts: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/server/session", () => ({ currentUser: mocks.user, isAdminEmail: () => false }));
vi.mock("@/lib/server/qa-access", () => ({ requireQaAccess: mocks.qa }));
vi.mock("@/services/container", () => ({ getContainer: mocks.container }));
vi.mock("@/services/family-adventures.service", () => ({ familyAdventures: mocks.adventures }));
vi.mock("@/services/family.service", () => ({ familyDrafts: mocks.drafts }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: "qa" }) }));
vi.mock("@/i18n/server", () => ({ getI18n: async () => ({ t: getDict("en"), locale: "en" }) }));
vi.mock("../actions", () => ({ resumeFamilyDraft: vi.fn() }));
vi.mock("../../library/actions", () => ({ logoutAction: vi.fn(), requestMagicLinkAction: vi.fn() }));
vi.mock("@/ui/Shell", () => ({ SiteHeader: () => null, SiteFooter: () => null, Notice: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
import FamilyPage from "../page";
import { LoginForm } from "../../library/LoginForm";

const target = "/family/fam_test/worlds/kingdom/purchase?ageYears=8&returnGame=game_source";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("React", React); mocks.user.mockResolvedValue(null); mocks.qa.mockResolvedValue(undefined);
  mocks.container.mockReturnValue({ db: {}, email: { id: "mock" } }); mocks.adventures.mockResolvedValue([]); mocks.drafts.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function mount(next?: string | string[]) {
  return render(<I18nProvider locale="en" dict={getDict("en")}>{await FamilyPage({ searchParams: Promise.resolve({ next }) })}</I18nProvider>);
}
function destination(container: HTMLElement) { return new FormData(container.querySelector("form")!).get("next"); }

describe("family sign-in return context", () => {
  it("puts the selected child, world, age and source game in the actual login form", async () => {
    const view = await mount(target);
    expect(destination(view.container)).toBe(target); expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.adventures).not.toHaveBeenCalled(); expect(mocks.drafts).not.toHaveBeenCalled();
  });
  it.each([undefined, "//outside.invalid", "/\\outside.invalid", [target, "/checkout?game=another"]])("an absent, unsafe or ambiguous next defaults to family: %j", async next => {
    const view = await mount(next); expect(destination(view.container)).toBe("/family");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("the reused login form has a family return without an explicit destination", () => {
    const view = render(<I18nProvider locale="en" dict={getDict("en")}><LoginForm devOutbox={false} /></I18nProvider>);
    expect(destination(view.container)).toBe("/family");
  });
  it("an already signed-in parent continues to the safe destination before reading the family shelf", async () => {
    mocks.user.mockResolvedValue({ id: "usr_test", email: "parent@example.invalid" });
    await expect(FamilyPage({ searchParams: Promise.resolve({ next: target }) })).rejects.toThrow(`REDIRECT:${target}`);
    expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(target);
    expect(mocks.container).not.toHaveBeenCalled(); expect(mocks.adventures).not.toHaveBeenCalled(); expect(mocks.drafts).not.toHaveBeenCalled();
  });
  it.each([undefined, "/family", "/family/", "/family?next=%2Ffamily#top", "https://outside.invalid"])("signed-in return %j does not make a family redirect loop", async next => {
    mocks.user.mockResolvedValue({ id: "usr_test", email: "parent@example.invalid" });
    const view = await mount(next);
    expect(view.getByRole("heading", { name: getDict("en").family.title })).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled(); expect(mocks.adventures).toHaveBeenCalledOnce();
  });
  it("QA access is required before login context or family data is read", async () => {
    mocks.qa.mockRejectedValue(new Error("QA_LOCKED"));
    await expect(FamilyPage({ searchParams: Promise.resolve({ next: target }) })).rejects.toThrow("QA_LOCKED");
    expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.container).not.toHaveBeenCalled();
  });
});
