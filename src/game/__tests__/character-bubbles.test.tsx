// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allWorlds } from "../../../content/worlds";
import { boardSlugs } from "@/domain/world";
import { composeWorld } from "@/domain/game/compose";
import type { GameConfig } from "@/domain/game/config";
import { emptyProgress, recordSceneCompleted } from "@/domain/game/progress";
import { getDict, type Locale } from "@/i18n";
import { buildDemoConfig } from "@/services/demo";
import { GiftReveal } from "../components/GiftReveal";
import { WorldMap } from "../components/WorldMap";
import { GameI18nProvider } from "../i18n";

/**
 * The child speaks from the sticker, not only from the board: once on the
 * gift's cover, and once from the map marker when it reaches the next place.
 * Both are short bubbles that leave on their own; neither blocks anything.
 */
vi.mock("../audio/sounds", () => ({ sounds: () => ({ unlock() {}, play() {}, startAmbient() {}, stopAmbient() {} }), bindGameAudio: () => () => {} }));
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
  vi.useFakeTimers();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function fixture(locale: Locale): GameConfig {
  const definition = allWorlds()[0]!;
  const base = buildDemoConfig(locale, boardSlugs(definition)[0]!, "Test");
  const world = composeWorld(definition, base.child, locale);
  return { ...base, gameId: "bubbles-test", worlds: [world], world, scenes: boardSlugs(definition).map((slug) => buildDemoConfig(locale, slug, "Test").scenes[0]!) };
}

describe("the child's own bubbles", () => {
  it.each(["en", "he"] as const)("says hello from the cover sticker in %s", (locale) => {
    const config = fixture(locale);
    const view = render(<GameI18nProvider locale={locale}><GiftReveal config={config} onOpen={vi.fn()} /></GameI18nProvider>);
    expect(view.container.querySelector(".gift__hello")).toBeNull();
    fireEvent.click(view.getByRole("button"));
    act(() => { vi.advanceTimersByTime(701); });
    const hello = view.container.querySelector(".gift__hello");
    expect(hello?.textContent).toBe(getDict(locale).game.gift.hello);
    expect(hello?.classList.contains("bubble")).toBe(true);
    // Inside the sticker, so it sits over the child and not somewhere in the copy.
    expect(hello?.closest(".gift__sticker")?.querySelector("img")).toBeTruthy();
  });

  it.each(["en", "he"] as const)("says it has arrived when the marker reaches the next place in %s, then goes quiet", (locale) => {
    const config = fixture(locale);
    const first = config.scenes[0]!.slug;
    const progress = recordSceneCompleted(emptyProgress(config.gameId), first, { variants: {}, order: [], noHints: true, bonusFound: false }, config.scenes.length);
    const onTravelDone = vi.fn();
    const view = render(<GameI18nProvider locale={locale}><WorldMap config={config} world={config.worlds![0]} progress={progress} onOpen={vi.fn()} onPassport={vi.fn()} travelFrom={first} onTravelDone={onTravelDone} /></GameI18nProvider>);
    expect(view.container.querySelector(".wmap__marker--travel")).toBeTruthy();
    expect(view.container.querySelector(".wmap__hello")).toBeNull();
    act(() => { vi.advanceTimersByTime(1500); });
    expect(onTravelDone).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector(".wmap__marker--travel")).toBeNull();
    const hello = view.container.querySelector(".wmap__hello");
    expect(hello?.textContent).toBe(getDict(locale).game.map.arrived);
    expect(hello?.closest(".wmap__marker")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(2400); });
    expect(view.container.querySelector(".wmap__hello")).toBeNull();
  });

  it("says it has arrived after a skipped walk too", () => {
    const config = fixture("en");
    const first = config.scenes[0]!.slug;
    const progress = recordSceneCompleted(emptyProgress(config.gameId), first, { variants: {}, order: [], noHints: true, bonusFound: false }, config.scenes.length);
    const view = render(<GameI18nProvider locale="en"><WorldMap config={config} world={config.worlds![0]} progress={progress} onOpen={vi.fn()} onPassport={vi.fn()} travelFrom={first} onTravelDone={vi.fn()} /></GameI18nProvider>);
    fireEvent.click(view.getByRole("button", { name: getDict("en").game.map.skip }));
    expect(view.container.querySelector(".wmap__hello")?.textContent).toBe(getDict("en").game.map.arrived);
  });
});
