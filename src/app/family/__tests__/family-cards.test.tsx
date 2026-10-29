// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDict, tf } from "@/i18n";
import type { WorldSummary } from "@/domain/adventure/summary";
import type { PreparationState } from "@/domain/generation-health";
import type { FamilyAdventure, FamilyChild } from "@/services/family-adventures.service";

const mocks = vi.hoisted(() => ({ sharing: vi.fn() }));
vi.mock("@/ui/friends/FamilyFriendSharing", () => ({
  FamilyFriendSharing: (props: { gameId: string; worlds: Array<{ slug: string; name: string }>; initialOpen?: boolean; initialWorld?: string }) => {
    mocks.sharing(props);
    return <button type="button" data-testid="friend-entry">Synthetic friends entry</button>;
  },
}));
import { AdventureCard, ChildCard, FamilyCompanion } from "../FamilyCards";

function world(overrides: Partial<WorldSummary> = {}): WorldSummary {
  return {
    slug: "synthetic-world", name: "Synthetic world", map: { art: "/synthetic/map.svg", width: 600, height: 400 },
    places: 9, stamped: 2, stars: 7, starsTotal: 27,
    here: { boardSlug: "synthetic-place", name: "Synthetic place", x: 0.5, y: 0.5 },
    route: ["stamped", "stamped", "here", "ahead", "ahead", "ahead", "ahead", "ahead", "ahead"],
    ...overrides,
  };
}
function adventure(overrides: Partial<FamilyAdventure> = {}): FamilyAdventure {
  return { gameId: "game_synthetic", title: "Synthetic adventure", ready: true, tracked: true, worlds: [world()], shareableWorldSlugs: [], ...overrides };
}
function child(adventures: FamilyAdventure[] = []): FamilyChild {
  return { id: "fam_synthetic", name: "Example child", avatarUrl: null, adventures };
}
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("React", React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("family adventure presentation keeps the existing action destinations", () => {
  it.each([
    { stars: 0, stamped: 0, tracked: true, label: "playStart" as const },
    { stars: 7, stamped: 2, tracked: true, label: "playContinue" as const },
    { stars: 27, stamped: 9, tracked: true, label: "playAgain" as const },
    { stars: 0, stamped: 0, tracked: false, label: null },
  ])("retains the appropriate ready-game action: $label", ({ stars, stamped, tracked, label }) => {
    const t = getDict("en"), item = adventure({ tracked, worlds: [world({ stars, stamped })] }), owner = child([item]);
    const view = render(<AdventureCard adventure={item} child={owner} t={t} eager={false} />);
    const play = view.getByRole("link", { name: label ? t.family[label] : t.library.play });
    expect(play.getAttribute("href")).toBe("/family/fam_synthetic/play/game_synthetic");
    expect(view.getByRole("link", { name: t.library.manage }).getAttribute("href")).toBe("/library/game_synthetic");
    // The painted map is the same destination, with one announced/tabbable play link.
    expect(view.getAllByRole("link")).toHaveLength(2);
    expect(view.container.querySelector(".adventure__map")?.getAttribute("tabindex")).toBe("-1");
  });

  it.each<PreparationState>(["preparing", "repairing", "delayed", "needsPhoto", "attention", "unavailable"])("shows the safe preparation/help action and no Play for %s", preparation => {
    const t = getDict("en"), item = adventure({ ready: false, preparation, shareableWorldSlugs: ["synthetic-world"] });
    const view = render(<AdventureCard adventure={item} child={child([item])} t={t} eager={false} />);
    const help = preparation === "attention" || preparation === "unavailable";
    expect(view.getByRole("heading", { name: t.family.generationState[preparation].title })).toBeTruthy();
    expect(view.getByRole("link", { name: help ? t.family.getHelp : t.library.viewProgress }).getAttribute("href"))
      .toBe(help ? "/support?order=game_synthetic" : "/creating/game_synthetic");
    expect(view.getByRole("link", { name: t.library.manage }).getAttribute("href")).toBe("/library/game_synthetic");
    expect(view.container.querySelector('a[href*="/play/"]')).toBeNull();
    expect(mocks.sharing).not.toHaveBeenCalled();
  });

  it("passes only eligible worlds and the existing eligible intent to friend controls", () => {
    const eligible = world({ slug: "eligible", name: "Eligible synthetic world" });
    const item = adventure({ worlds: [eligible, world({ slug: "private" })], shareableWorldSlugs: ["eligible", "not-in-this-adventure"] });
    render(<AdventureCard adventure={item} child={child([item])} t={getDict("en")} eager={false} friendIntent="eligible" />);
    expect(mocks.sharing).toHaveBeenCalledExactlyOnceWith({ gameId: "game_synthetic", worlds: [{ slug: "eligible", name: eligible.name }], initialOpen: true, initialWorld: "eligible" });
  });

  it("does not open friend sharing from an ineligible world intent", () => {
    const item = adventure({ shareableWorldSlugs: ["synthetic-world"] });
    render(<AdventureCard adventure={item} child={child([item])} t={getDict("en")} eager={false} friendIntent="private-world" />);
    expect(mocks.sharing.mock.calls[0]?.[0].initialOpen).toBe(false);
    expect(mocks.sharing.mock.calls[0]?.[0].worlds).toEqual([{ slug: "synthetic-world", name: "Synthetic world" }]);
  });

  it("does not show friend controls when no world is eligible", () => {
    const view = render(<AdventureCard adventure={adventure()} child={child()} t={getDict("en")} eager={false} />);
    expect(view.queryByTestId("friend-entry")).toBeNull();
    expect(mocks.sharing).not.toHaveBeenCalled();
  });
});

describe.each(["en", "he"] as const)("family companion and counts in %s", locale => {
  it("displays the exact supplied world price and preserves the create/passport destinations", () => {
    const t = getDict(locale), owner = child(), price = "SYNTHETIC 37.45";
    const view = render(<div dir={locale === "he" ? "rtl" : "ltr"}><FamilyCompanion child={owner} t={t} worldPrice={price} stamps={{ n: 2, total: 9 }} /></div>);
    expect(view.getByText(tf(t.home.pricing.everyWorld, { price }))).toBeTruthy();
    expect(view.getByRole("link", { name: t.family.exploreMore }).getAttribute("href")).toBe("/create?child=fam_synthetic");
    expect(view.getByRole("link", { name: new RegExp(t.family.openPassport) }).getAttribute("href")).toBe("/family/fam_synthetic/passport");
    expect(view.getByRole("region", { name: tf(t.family.more, { name: owner.name }) })).toBeTruthy();
  });

  it("does not invent a world price when one was not supplied", () => {
    const view = render(<FamilyCompanion child={child()} t={getDict(locale)} worldPrice={null} stamps={{ n: 0, total: 0 }} />);
    expect(view.container.querySelector(".family-more__price")).toBeNull();
    expect(view.container.querySelector(".family-passport__count")).toBeNull();
    expect(view.getByRole("link", { name: getDict(locale).family.exploreMore })).toBeTruthy();
  });

  it("keeps the visual fraction LTR and announces its localized meaning once", () => {
    const t = getDict(locale), view = render(<div dir={locale === "he" ? "rtl" : "ltr"}><AdventureCard adventure={adventure()} child={child()} t={t} eager={false} /></div>);
    const tally = view.getByRole("img", { name: tf(t.family.stars, { n: 7, total: 27 }) });
    const fraction = tally.querySelector('[dir="ltr"]');
    expect(fraction?.textContent).toBe("7/27");
    expect(fraction?.getAttribute("aria-hidden")).toBe("true");
    expect(view.getByText(tf(t.family.currentPlace, { place: "Synthetic place" }))).toBeTruthy();
  });

  it("names the shelf destination while keeping the child card as a single link", () => {
    const t = getDict(locale), owner = child([adventure()]);
    const view = render(<ChildCard child={owner} t={t} eager={false} />);
    expect(view.getAllByRole("link")).toHaveLength(1);
    expect(view.getByRole("link").getAttribute("href")).toBe("/family/fam_synthetic");
    expect(view.getByText(tf(t.family.open, { name: owner.name }))).toBeTruthy();
  });
});
