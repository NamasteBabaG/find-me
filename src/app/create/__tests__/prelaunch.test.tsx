// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDict } from "@/i18n";

const f = vi.hoisted(() => ({ appEnv: "production", mockWizard: "off", locale: "en" as "en" | "he", draft: vi.fn(), container: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: f.appEnv, QA_WIZARD_MOCK: f.mockWizard, PURCHASING_ENABLED: "off" }) }));
vi.mock("@/i18n/server", () => ({ getI18n: async () => ({ t: getDict(f.locale), locale: f.locale }) }));
vi.mock("@/ui/Shell", () => ({ SiteHeader: () => <header />, SiteFooter: () => <footer />, Stepper: () => <div data-testid="stepper" /> }));
vi.mock("../ScrollToTop", () => ({ ScrollToTop: () => null }));
vi.mock("@/lib/server/session", () => ({ currentUser: f.user, isAdminEmail: () => false }));
vi.mock("@/services/container", () => ({ getContainer: f.container }));
vi.mock("@/lib/server/current-draft", () => ({ currentDraft: f.draft }));
import CreateNamePage from "../page";
import { CreateFrame, CreationPrelaunch } from "../CreateLayout";

beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("React", React); f.appEnv = "production"; f.mockWizard = "off"; f.locale = "en"; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("prelaunch creation display", () => {
  it.each(["en", "he"] as const)("%s says ordering opens soon and offers the demo and how it works, never a dead button, before asking for a photo", async locale => {
    f.locale = locale;
    const t = getDict(locale);
    render(await CreationPrelaunch({}));
    expect(screen.getByRole("heading", { name: t.create.prelaunch.title })).toBeTruthy();
    expect(screen.getByText(t.create.prelaunch.lead)).toBeTruthy();
    expect(screen.queryAllByRole("button").filter(b => (b as HTMLButtonElement).disabled)).toHaveLength(0);
    expect(screen.getByRole("link", { name: t.nav.demo }).getAttribute("href")).toBe("/#demo");
    expect(screen.getByRole("link", { name: t.nav.how }).getAttribute("href")).toBe("/#how");
    expect(screen.queryByRole("textbox")).toBeNull(); expect(screen.queryByTestId("stepper")).toBeNull();
  });

  it("the create entry refuses before loading a draft, family details or a provider container", async () => {
    const page = await CreateNamePage({ searchParams: Promise.resolve({ name: "Synthetic" }) });
    expect(page.type).toBe(CreationPrelaunch);
    expect(f.draft).not.toHaveBeenCalled(); expect(f.user).not.toHaveBeenCalled(); expect(f.container).not.toHaveBeenCalled();
  });

  it("a saved photo/checkout step cannot render its form through the shared create frame", async () => {
    const page = await CreateFrame({ step: 1, title: "Synthetic photo", user: null, isAdmin: false, children: <input aria-label="Synthetic photo" /> });
    expect(page.type).toBe(CreationPrelaunch);
    expect(page.props).not.toHaveProperty("children");
  });

  it("QA keeps its existing wizard form and stepper", async () => {
    f.appEnv = "qa";
    render(await CreateFrame({ step: 1, title: "Synthetic photo", user: null, isAdmin: false, children: <input aria-label="Synthetic photo" /> }));
    expect(screen.getByRole("textbox", { name: "Synthetic photo" })).toBeTruthy();
    expect(screen.getByTestId("stepper")).toBeTruthy();
    expect(screen.queryByText(getDict("en").create.prelaunch.title)).toBeNull();
    expect(screen.queryByText(getDict("en").create.qaSimulation.title)).toBeNull();
  });

  it.each(["en", "he"] as const)("%s labels the free Wizard from the first step", async locale => {
    f.appEnv = "qa";
    f.mockWizard = "on";
    f.locale = locale;
    render(await CreateFrame({ step: 0, title: "Synthetic start", user: null, isAdmin: false, children: null }));
    const notice = getDict(locale).create.qaSimulation;
    expect(screen.getByText(notice.title).parentElement?.textContent).toContain(notice.description);
  });
});
