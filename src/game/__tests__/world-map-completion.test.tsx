// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allWorlds } from "../../../content/worlds";
import { boardSlugs } from "@/domain/world";
import { composeWorld } from "@/domain/game/compose";
import type { GameConfig, PlayWorld } from "@/domain/game/config";
import { emptyProgress, recordSceneCompleted, type GameProgress } from "@/domain/game/progress";
import { getDict, tf, type Locale } from "@/i18n";
import { buildDemoConfig } from "@/services/demo";
import { WorldMap } from "../components/WorldMap";
import { GameShell } from "../components/GameShell";
import { GameI18nProvider } from "../i18n";
import { createPlayStore } from "../store/play-store";

vi.mock("../audio/sounds", () => ({ sounds: () => ({ unlock() {}, play() {}, startAmbient() {}, stopAmbient() {} }), bindGameAudio: () => () => {} }));
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
  window.localStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

// Real catalog + composer + saved-progress contract, not a hand-written mock schema.
function fixture(locale: Locale = "en", count = 1): GameConfig {
  const definitions = allWorlds().slice(0, count);
  const base = buildDemoConfig(locale, boardSlugs(definitions[0]!)[0]!, "Test");
  const worlds = definitions.map(w => composeWorld(w, base.child, locale));
  return {
    ...base, gameId: "map-completion-test", worlds, world: worlds[0],
    scenes: definitions.flatMap(w => boardSlugs(w).map(slug => buildDemoConfig(locale, slug, "Test").scenes[0]!)),
  };
}
function finish(config: GameConfig, slugs: string[]): GameProgress {
  return slugs.reduce((p, slug) => recordSceneCompleted(p, slug, { variants: {}, order: [], noHints: true, bonusFound: false }, config.scenes.length), emptyProgress(config.gameId));
}
function mount(config: GameConfig, progress: GameProgress, world = config.worlds![0]!, extra: Partial<React.ComponentProps<typeof WorldMap>> = {}) {
  const onOpen = vi.fn(), onPassport = vi.fn();
  const view = render(<GameI18nProvider locale={config.locale}><WorldMap config={config} world={world} progress={progress} onOpen={onOpen} onPassport={onPassport} {...extra} /></GameI18nProvider>);
  return { ...view, onOpen, onPassport };
}

describe("a finished world's map", () => {
  it.each(["en", "he"] as const)("uses each world's title and localized completion copy in %s, with all nine places still replayable", locale => {
    const config = fixture(locale, 3);
    for (const world of config.worlds!) {
      const view = mount(config, finish(config, boardSlugs(world)), world);
      const card = view.getByRole("region", { name: world.completion.title });
      expect(within(card).getByText(tf(getDict(locale).game.map.completedText, { name: config.child.name }))).toBeTruthy();
      expect(card.textContent).not.toContain("{name}");
      expect(view.container.querySelector(".wmap__go")).toBeNull();
      expect(view.container.querySelector(".wmap__skip")).toBeNull();
      expect(view.container.querySelectorAll(".wmap__node--completed")).toHaveLength(9);
      expect(view.container.querySelectorAll('[aria-current="step"]')).toHaveLength(0);
      for (const node of view.container.querySelectorAll(".wmap__dot")) expect(node.getAttribute("aria-disabled")).toBeNull();
      cleanup();
    }
  });

  it("uses current neutral copy even when an old saved config contains retired wording", () => {
    const config = fixture("he"); const original = config.worlds![0]!;
    const world = { ...original, completion: { ...original.completion, text: "Test מצאו את כל המחבואים בעולם הזה. הדרכון מלא!" } };
    const view = mount(config, finish(config, boardSlugs(world)), world);
    expect(view.getByText("Test, כל המחבואים בעולם הזה נמצאו!")).toBeTruthy();
    expect(view.queryByText(world.completion.text)).toBeNull();
    expect(world.completion.text).toContain("מצאו"); // no migration or mutation
  });

  it.each([0, 8])("keeps the next-place action at %i of 9", done => {
    const config = fixture(); const world = config.worlds![0]!;
    const view = mount(config, finish(config, boardSlugs(world).slice(0, done)));
    expect(view.queryByRole("region", { name: world.completion.title })).toBeNull();
    expect(view.container.querySelector(".wmap__go")?.textContent).toContain(config.scenes[done]!.name);
  });

  it("does not mistake nine completions elsewhere, or a global timestamp, for this world's completion", () => {
    const config = fixture("en", 2); const [first, second] = config.worlds!;
    const progress = { ...finish(config, boardSlugs(first!)), completedAt: new Date(0).toISOString() };
    const view = mount(config, progress, second!);
    expect(view.queryByRole("region", { name: second!.completion.title })).toBeNull();
    expect(view.container.querySelectorAll(".wmap__node--completed")).toHaveLength(0);
  });

  it("opens the existing bag and replays the first route stop without resetting progress", () => {
    const config = fixture(); const world: PlayWorld = { ...config.worlds![0]!, nodes: [...config.worlds![0]!.nodes].reverse() };
    const progress = finish(config, boardSlugs(world)); const before = JSON.stringify(progress);
    const view = mount(config, progress, world); const g = getDict(config.locale).game;
    fireEvent.click(view.getByRole("button", { name: g.map.viewCollection }));
    expect(view.onPassport).toHaveBeenCalledOnce();
    fireEvent.click(view.getByRole("button", { name: g.map.replayWorld }));
    expect(view.onOpen).toHaveBeenCalledWith(boardSlugs(world)[0]);
    expect(JSON.stringify(progress)).toBe(before);
    // Exercise the real store callback too, beyond the component spy.
    const store = createPlayStore(config, { demo: true, copy: g.copy });
    store.setState({ progress });
    store.getState().openScene(view.onOpen.mock.calls[0]![0]);
    expect(store.getState().screen).toBe("scene");
    expect(store.getState().mission?.plan.playIndex).toBe(1);
    expect(JSON.stringify(store.getState().progress)).toBe(before);
  });

  it.each([false, true])("does not travel to a nonexistent next place after the final board (reduced motion: %s)", reduced => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: reduced, addEventListener() {}, removeEventListener() {} })));
    const config = fixture(); const world = config.worlds![0]!; const onTravelDone = vi.fn();
    const view = mount(config, finish(config, boardSlugs(world)), world, { travelFrom: boardSlugs(world).at(-1), onTravelDone });
    expect(view.getByRole("region", { name: world.completion.title })).toBeTruthy();
    expect(view.container.querySelector(".wmap__skip")).toBeNull();
    expect(view.container.querySelector(".wmap__marker--travel")).toBeNull();
    act(() => vi.advanceTimersByTime(2000));
    expect(onTravelDone).toHaveBeenCalledOnce();
  });

  it("restores the completion panel from saved progress on a fresh game-shell mount", () => {
    const config = fixture("he"); const world = config.worlds![0]!;
    const progress = { ...finish(config, boardSlugs(world)), revealed: true, lastWorld: world.slug };
    window.localStorage.setItem(`findme:progress:v1:${config.gameId}`, JSON.stringify(progress));
    const view = render(<GameShell config={config} />);
    expect(view.getByRole("region", { name: world.completion.title })).toBeTruthy();
    expect(view.container.querySelector(".game")?.getAttribute("dir")).toBe("rtl");
    fireEvent.click(view.getByRole("button", { name: getDict("he").game.map.viewCollection }));
    expect(view.getByRole("heading", { name: "תיק ההרפתקאות של Test" })).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: getDict("he").game.passport.map }));
    expect(view.getByRole("region", { name: world.completion.title })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(`findme:progress:v1:${config.gameId}`)!)).toEqual(progress);
  });
});
