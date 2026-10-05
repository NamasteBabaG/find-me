// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allWorlds } from "../../../content/worlds";
import { boardSlugs } from "@/domain/world";
import { composeWorld } from "@/domain/game/compose";
import type { GameConfig, PlayWorld, SceneConfig } from "@/domain/game/config";
import { adoptFinds, emptyProgress, recordSceneCompleted, type GameProgress } from "@/domain/game/progress";
import { getDict, tf, type Locale } from "@/i18n";
import { buildDemoConfig } from "@/services/demo";
import { WorldMap } from "../components/WorldMap";
import { GameShell } from "../components/GameShell";
import { RoundControls } from "../components/RoundControls";
import { GameI18nProvider } from "../i18n";
import { createPlayStore } from "../store/play-store";
import { loadRound } from "../engine/round-storage";

vi.mock("../audio/sounds", () => ({ sounds: () => ({ muted: false, restoreMutePreference() { return false; }, subscribeMuted() { return () => {}; }, unlock() {}, play() {}, setScene() {}, startAmbient() {}, stopAmbient() {} }), bindGameAudio: () => () => {} }));
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

describe("the map's one face", () => {
  it("shows the child once, as the marker on the painting, never again in the header", () => {
    const config = fixture("he");
    const view = mount(config, emptyProgress(config.gameId));
    const faces = [...view.container.querySelectorAll("img")].filter(img => img.getAttribute("src") === config.child.avatarUrl);
    expect(faces).toHaveLength(1);
    expect(faces[0]!.closest(".wmap__marker")).not.toBeNull();
    expect(view.container.querySelector(".wmap__bar img")).toBeNull();
  });
});

describe("starting over, and the round strip", () => {
  it("starts a full round from the historical grid without resetting earned progress", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    const config = { ...fixture(), world: undefined, worlds: undefined, adventure: undefined };
    const progress = { ...finish(config, [config.scenes[0]!.slug]), revealed: true };
    const progressKey = `findme:progress:v1:${config.gameId}`;
    window.localStorage.setItem(progressKey, JSON.stringify(progress));
    const view = render(<GameShell config={config} />);
    expect(view.container.querySelector(".map__islands")).not.toBeNull();
    expect(view.container.querySelector(".round-controls")).toBeNull();
    const again = view.getByRole("button", { name: getDict(config.locale).game.replay.startOver });
    expect(again.classList.contains("wmap__again")).toBe(true);
    fireEvent.click(again);
    const round = loadRound(config)!;
    expect(round.active).toBe(true);
    expect(round.route).toEqual(config.scenes.map(scene => scene.slug));
    expect(round.progress.lastScene).toBe(config.scenes[0]!.slug);
    expect(round.progress.scenes).toEqual({});
    expect(JSON.parse(window.localStorage.getItem(progressKey)!)).toEqual(progress);
    expect(view.container.querySelector(".scene")).not.toBeNull();
  });

  it("puts a quiet Play from the beginning under Go when the shell offers one, and none on a finished world", () => {
    const config = fixture("he"), world = config.worlds![0]!, g = getDict("he").game, onStartOver = vi.fn();
    const started = finish(config, boardSlugs(world).slice(0, 1));
    const view = mount(config, started, world, { onStartOver });
    const again = view.getByRole("button", { name: g.replay.startOver });
    expect(view.container.querySelector(".wmap__go")!.compareDocumentPosition(again) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(again); expect(onStartOver).toHaveBeenCalledOnce();
    cleanup();
    expect(mount(config, started, world).queryByRole("button", { name: g.replay.startOver })).toBeNull();
    cleanup();
    const finished = mount(config, finish(config, boardSlugs(world)), world, { onStartOver });
    expect(finished.queryByRole("button", { name: g.replay.startOver })).toBeNull();
    // The finished world's panel: a title, one line and two actions (V17).
    expect(finished.container.querySelectorAll(".wmap__complete p")).toHaveLength(1);
  });

  it("offers starting over on the map once something is found, with no strip above the map", () => {
    const config = fixture("he"), world = config.worlds![0]!, g = getDict("he").game;
    const progress = { ...finish(config, boardSlugs(world).slice(0, 1)), revealed: true, lastWorld: world.slug };
    window.localStorage.setItem(`findme:progress:v1:${config.gameId}`, JSON.stringify(progress));
    const view = render(<GameShell config={config} />);
    expect(view.getByRole("button", { name: g.replay.startOver }).classList.contains("wmap__again")).toBe(true);
    expect(view.container.querySelector(".round-controls")).toBeNull();
  });

  it("shows the round strip only while a round exists, with this round's stars and no 'Another player?'", () => {
    const config = fixture("he"), g = getDict("he").game;
    const store = createPlayStore(config, { copy: g.copy });
    store.setState({ progress: { ...finish(config, boardSlugs(config.worlds![0]!).slice(0, 1)), revealed: true } });
    const strip = () => render(<GameI18nProvider locale="he"><RoundControls store={store.getState()} /></GameI18nProvider>);
    expect(strip().container.querySelector(".round-controls")).toBeNull();
    cleanup();
    store.getState().startRound(); store.setState({ screen: "map" });
    const view = strip(), route = store.getState().round!.route;
    const total = config.scenes.filter(scene => route.includes(scene.slug)).reduce((n, scene) => n + scene.targets.length, 0);
    expect(view.container.querySelector(".round-controls strong")?.textContent).toBe(tf(g.replay.roundStars, { earned: 0, total }));
    // On the map, Go continues an active round: no second "continue" stacked above the map.
    expect(view.queryByRole("button", { name: g.replay.resumeRound })).toBeNull();
    expect(view.getByRole("button", { name: g.replay.savedJourney })).toBeTruthy();
    expect(view.container.textContent).not.toContain("עוד מישהו רוצה לשחק?");
    cleanup();
    // Paused, the strip is the way back into the round.
    store.setState({ round: { ...store.getState().round!, active: false } });
    const paused = strip();
    expect(paused.getByRole("button", { name: g.replay.resumeRound })).toBeTruthy();
    expect(paused.queryByRole("button", { name: g.replay.savedJourney })).toBeNull();
  });
});

describe("a finished world's map", () => {
  it.each(["en", "he"] as const)("keeps both worlds' unreached board art out of map image sources in %s", locale => {
    const config = fixture(locale, 2);
    const saved = JSON.stringify(config);
    for (const world of config.worlds!) {
      // lastScene is persisted when opening, before the board has actually loaded.
      // It must not make a preview of the first unreached board appear on the map.
      const progress = { ...emptyProgress(config.gameId), lastScene: boardSlugs(world)[0] };
      const view = mount(config, progress, world);
      const go = view.container.querySelector<HTMLButtonElement>(".wmap__go")!;
      expect(go.querySelector(".place-emblem")).toBeTruthy();
      expect(go.querySelector("img")).toBeNull();
      const sources = [...view.container.querySelectorAll("img")].map(img => img.getAttribute("src"));
      for (const scene of config.scenes) {
        expect(sources).not.toContain(scene.art.base);
        expect(sources).not.toContain(scene.art.thumbnail);
      }
      fireEvent.click(go);
      expect(view.onOpen).toHaveBeenCalledExactlyOnceWith(boardSlugs(world)[0]);
      cleanup();
    }
    expect(JSON.stringify(config)).toBe(saved);
  });

  it("keeps place emblems after a partial find and on the newly unlocked next board", () => {
    const base = fixture(); const first = base.scenes[0]!;
    const scene: SceneConfig = { ...first, playMode: "find-any", appearancesPerBoard: 3, findsRequiredToAdvance: 3 };
    const config: GameConfig = { ...base, scenes: [scene, ...base.scenes.slice(1)] };
    const partial = adoptFinds(emptyProgress(config.gameId), config, [{ boardSlug: scene.slug, targetId: scene.targets[0]!.id, variant: "A" }]).progress;
    const view = mount(config, partial);
    expect(view.container.querySelector(".wmap__go-name")?.textContent).toBe(scene.name);
    expect(view.container.querySelector(".wmap__go-thumb .place-emblem")).toBeTruthy();
    expect(view.container.querySelector(".wmap__go-thumb img")).toBeNull();
    const complete = adoptFinds(partial, config, scene.targets.map(target => ({ boardSlug: scene.slug, targetId: target.id, variant: "A" as const }))).progress;
    view.rerender(<GameI18nProvider locale={config.locale}><WorldMap config={config} progress={complete} onOpen={view.onOpen} onPassport={view.onPassport} /></GameI18nProvider>);
    expect(view.container.querySelector(".wmap__go-name")?.textContent).toBe(config.scenes[1]!.name);
    expect(view.container.querySelector(".wmap__go-thumb .place-emblem")).toBeTruthy();
    expect(view.container.querySelector(".wmap__go-thumb img")).toBeNull();
    fireEvent.click(view.container.querySelector(".wmap__go")!);
    expect(view.onOpen).toHaveBeenCalledExactlyOnceWith(config.scenes[1]!.slug);
  });
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
      const places = view.container.querySelectorAll(".wmap__place");
      expect(places).toHaveLength(9);
      for (const node of places) expect(node.getAttribute("aria-disabled")).toBeNull();
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

  it("counts the stars already found at the next place instead of calling all of them waiting", () => {
    // Only a find-any board can be part-found; the demo boards are sequential, so the first one is made find-any.
    const base = fixture(); const first = base.scenes[0]!; const g = getDict(base.locale).game;
    expect(first.targets).toHaveLength(3);
    const scene: SceneConfig = { ...first, playMode: "find-any", appearancesPerBoard: 3, findsRequiredToAdvance: 3 };
    const config: GameConfig = { ...base, scenes: [scene, ...base.scenes.slice(1)] };
    const two = scene.targets.slice(0, 2).map(t => ({ boardSlug: scene.slug, targetId: t.id, variant: "A" as const }));
    const view = mount(config, adoptFinds(emptyProgress(config.gameId), config, two).progress);
    const go = view.container.querySelector(".wmap__go")!.textContent!;
    expect(go).toContain(tf(g.stars.tray, { earned: 2, total: scene.targets.length }));
    expect(go).not.toContain(tf(g.stars.here, { total: scene.targets.length }));
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
    expect(view.getByRole("heading", { name: "הדרכון של Test" })).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: getDict("he").game.passport.map }));
    expect(view.getByRole("region", { name: world.completion.title })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(`findme:progress:v1:${config.gameId}`)!)).toEqual(progress);
  });

  it("refreshing a board history entry replaces its stale step without leaving the game", () => {
    const config = fixture("he"), world = config.worlds![0]!;
    const progress = { ...finish(config, boardSlugs(world)), revealed: true, lastWorld: world.slug };
    window.localStorage.setItem(`findme:progress:v1:${config.gameId}`, JSON.stringify(progress));
    window.history.replaceState({ findMeGameStep: "scene", __NA: true }, "");
    const back = vi.spyOn(window.history, "back");
    const view = render(<GameShell config={config} />);
    expect(view.getByRole("region", { name: world.completion.title })).toBeTruthy();
    expect(window.history.state).toEqual({ __NA: true });
    expect(back).not.toHaveBeenCalled();
  });
});
