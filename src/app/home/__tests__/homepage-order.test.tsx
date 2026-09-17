// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameConfig } from "@/domain/game/config";

const fixture = vi.hoisted(() => ({
  demo: { child: { name: "Anna", avatarUrl: "/demo/noa-portrait.png" } },
  heroChild: vi.fn(),
  demoConfig: vi.fn(),
  buildDemoConfig: vi.fn(),
  unusedActiveSceneRead: vi.fn(),
}));

vi.mock("../../../../content/scenes", () => ({ SCENE_CATALOG: [{ scene: { slug: "beach" } }] }));
vi.mock("@/services/container", () => ({ getContainer: () => ({}) }));
vi.mock("@/services/scene-catalog.service", () => ({ activeSceneSlugs: fixture.unusedActiveSceneRead }));
vi.mock("@/services/world-catalog.service", () => ({
  purchasableWorldSlugs: async () => ["public-world"],
  ownedWorldSlugs: async () => [],
  boardsOfWorlds: () => ["beach"],
}));
vi.mock("@/services/demo", () => ({ buildDemoConfig: fixture.buildDemoConfig }));
vi.mock("@/lib/server/session", () => ({ currentUser: async () => null, isAdminEmail: () => false }));
vi.mock("@/i18n/server", () => ({ getI18n: async () => ({ locale: "en", t: {} }), getCurrency: async () => "USD" }));
vi.mock("@/ui/Shell", () => ({ SiteHeader: () => <header />, SiteFooter: () => <footer /> }));
vi.mock("../worlds-data", () => ({ carouselWorlds: () => [] }));
vi.mock("../Hero", () => ({
  Hero: ({ child, children }: { child: GameConfig["child"]; children: React.ReactNode }) => {
    fixture.heroChild(child);
    return <section data-section="Hero">{children}</section>;
  },
}));
vi.mock("../Transformation", () => ({ Transformation: () => <section data-section="Transformation" /> }));
vi.mock("../PassportDemo", () => ({ PassportDemo: () => <section data-section="PassportDemo" /> }));
vi.mock("../DemoSection", () => ({
  DemoSection: ({ config }: { config: GameConfig }) => {
    fixture.demoConfig(config);
    return <section data-section="DemoSection" />;
  },
}));
vi.mock("../FinalCta", () => ({ FinalCta: () => <section data-section="FinalCta" /> }));
vi.mock("../sections", () => ({
  Marquee: () => <div data-section="Marquee" />,
  HowItWorks: () => <section data-section="HowItWorks" />,
  Inside: () => <section data-section="Inside" />,
  Worlds: () => <section data-section="Worlds" />,
  GiftSection: () => <section data-section="GiftSection" />,
  Pricing: () => <section data-section="Pricing" />,
  Trust: () => <section data-section="Trust" />,
  Faq: () => <section data-section="Faq" />,
}));

import HomePage from "../../page";

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.clearAllMocks();
  fixture.buildDemoConfig.mockReturnValue(fixture.demo);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("homepage composition", () => {
  it("places the visual transformation before the demo and the purchase explanation after it, sharing one public demo identity", async () => {
    const view = render(await HomePage());
    const main = view.getByRole("main");

    expect(Array.from(main.children, section => section.getAttribute("data-section"))).toEqual([
      "Hero",
      "Transformation",
      "DemoSection",
      "PassportDemo",
      "HowItWorks",
      "Inside",
      "Worlds",
      "GiftSection",
      "Pricing",
      "Trust",
      "Faq",
      "FinalCta",
    ]);
    expect(main.querySelectorAll('[data-section="Transformation"]')).toHaveLength(1);
    expect(main.querySelectorAll('[data-section="DemoSection"]')).toHaveLength(1);
    expect(fixture.buildDemoConfig).toHaveBeenCalledExactlyOnceWith("en", "beach");
    // purchasableWorldSlugs already owns availability; a second read was discarded.
    expect(fixture.unusedActiveSceneRead).not.toHaveBeenCalled();
    expect(fixture.demoConfig).toHaveBeenCalledTimes(1);
    expect(fixture.heroChild).toHaveBeenCalledTimes(1);
    const demo = fixture.demoConfig.mock.calls[0]![0] as GameConfig;
    expect(demo).toBe(fixture.demo);
    expect(fixture.heroChild.mock.calls[0]![0]).toBe(demo.child);
  });
});
