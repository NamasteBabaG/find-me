// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "zustand";
import { readFileSync } from "node:fs";
import { buildDemoConfig } from "@/services/demo";
import { type SceneConfig } from "@/domain/game/config";
import { createMissionState, currentTargetId, missionReducer, type MissionCopy } from "@/domain/game/mission";
import { planScenePlay } from "@/domain/game/replay";
import { SceneViewport } from "../components/SceneViewport";
import { ScenePlayer } from "../components/ScenePlayer";
import { MissionCard } from "../components/MissionCard";
import { WorldMap } from "../components/WorldMap";
import { Passport } from "../components/Passport";
import { publicBeachDemo } from "../../../content/demo/beach-v1";
import { GiftReveal } from "../components/GiftReveal";
import { IslandGrid } from "../components/IslandGrid";
import { emptyProgress, parseProgress } from "@/domain/game/progress";
import { GameI18nProvider } from "../i18n";
import { createPlayStore, type PlayStoreApi } from "../store/play-store";
import { clampTransform, stageToScreen } from "../engine/viewport-math";

const rig = vi.hoisted(() => ({ tap: (_x: number, _y: number) => {}, viewport: { transform: { tx: 0, ty: 0, scale: 0.2 }, viewport: { width: 390, height: 650 }, fit: 0.2, isDragging: false, bind: {}, reset: vi.fn(), focusOn: vi.fn(), zoomBy: vi.fn() } }));
vi.mock("../engine/useViewport", () => ({ useViewport: (_ref: unknown, _stage: unknown, tap: typeof rig.tap) => { rig.tap = tap; return rig.viewport; } }));
vi.mock("next/image", () => ({ default: ({ unoptimized: _unoptimized, fill: _fill, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean; fill?: boolean }) => <img {...props} /> }));
const copy: MissionCopy = { successByTarget: {}, itemByTarget: {}, wrongTarget: "Other", wrongTargetNoItem: "Other", bonus: "Bonus", fallbackSuccess: "Found" };

class LoadedImage {
  static instances: LoadedImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  resolveDecode!: () => void;
  decode = vi.fn(() => new Promise<void>(resolve => { this.resolveDecode = resolve; }));
  constructor() { LoadedImage.instances.push(this); }
}
async function decodeAll() {
  await act(async () => { for (const image of LoadedImage.instances) { image.onload?.(); image.resolveDecode?.(); } });
}
function fiveScene(): SceneConfig {
  const scene = structuredClone(buildDemoConfig("en").scenes[0]!);
  const source = scene.targets[0]!;
  return { ...scene, version: 7, playMode: "find-any", appearancesPerBoard: 5, findsRequiredToAdvance: 3, intro: undefined,
    targets: Array.from({ length: 5 }, (_, i) => ({ ...source, id: `hide-${i}`, success: [`Found ${i}!`], spriteByVariant: undefined, sprite: { kind: "image", url: `/test-patch-${i}.png`, width: 512, height: 768,
      rect: { x: i * 0.19, y: 0.3, w: 0.17, h: 0.35 }, hitRect: { x: i * 0.19 + 0.04, y: 0.4, w: 0.06, h: 0.15 }, anchor: { x: i * 0.19 + 0.07, y: 0.4 } } })),
    ambient: [{ id: "ambient", label: "Tree", x: 0, y: 0, w: 0.1, h: 0.1, animation: "shake", cooldownMs: 1500, reaction: "Tree says hello" }],
  };
}
function fourScene(): SceneConfig {
  const scene = fiveScene();
  return { ...scene, appearancesPerBoard: 4, targets: scene.targets.slice(0, 4) };
}
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("Image", LoadedImage); LoadedImage.instances = []; vi.useFakeTimers(); window.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as never; });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("find-any rendering and mobile feedback", () => {
  it("pilot bag round-trip preserves replay finds and exposes the permanent album", async () => {
    const config = { ...publicBeachDemo("en"), gameId: "pilot-bag-ui", playPolicy: "independent-worlds-v1" as const };
    const scene = config.scenes[0]!;
    const store = createPlayStore(config, { copy, skipGift: true, telemetry: false });
    store.getState().hydrate(); store.getState().openScene(scene.slug);
    store.getState().dispatch({ type: "START", now: 1 });
    for (const targetId of store.getState().mission!.plan.order) {
      store.getState().dispatch({ type: "TAP_TARGET", targetId, now: 2 });
      store.getState().dispatch({ type: "FOUND_DONE", now: 3 });
    }
    store.getState().replayScene(); store.getState().dispatch({ type: "START", now: 4 });
    const discoveryId = config.adventure!.boards[0]!.discoveries[0]!.id;
    store.getState().collectDiscovery(discoveryId);
    function Review() {
      const state = useStore(store);
      return <GameI18nProvider locale="en">{state.screen === "passport"
        ? <Passport config={config} progress={state.progress} album={state.album} albumMode={state.albumMode} albumState={state.albumState} onMap={state.goToMap} onOpen={state.openScene} onReplay={state.replayScene} onResume={state.resumeScene} />
        : <ScenePlayer scene={scene} mission={state.mission!} store={state} onBack={state.goToMap} onSceneComplete={state.completeScene} />}</GameI18nProvider>;
    }
    const view = render(<Review />); await decodeAll(); act(() => vi.advanceTimersByTime(901));
    const mission = store.getState().mission;
    fireEvent.click(view.getByRole("button", { name: "To the adventure bag 🎒" }));
    expect(store.getState().screen).toBe("passport");
    expect(view.getByText(/New discoveries join your album/)).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Back to my round" }));
    await decodeAll(); act(() => vi.advanceTimersByTime(901));
    expect(store.getState().mission).toBe(mission);
    expect(store.getState().replay!.discoveryIds).toEqual([discoveryId]);
    expect(store.getState().album!.discoveries).toHaveLength(1);
    expect(view.container.querySelector('.scene')?.getAttribute('data-replay')).toBe('true');
    expect(view.container.querySelector('.scene__curtain')?.classList.contains('is-open')).toBe(true);
    expect(view.container.querySelectorAll('.mission__stars .stars__slot.is-lit')).toHaveLength(0);
    store.getState().stopAlbumSync(); window.localStorage.clear();
  });
  it.each(["en", "he"] as const)("plays all four appearances, unlocks at three and celebrates four actual stars in %s", async locale => {
    const scene = fourScene();
    const config = { ...buildDemoConfig(locale), scenes: [scene, { ...fiveScene(), slug: "next-board" }], worlds: undefined, world: undefined };
    const store = createPlayStore(config, { copy, readOnlyPreview: true, skipGift: true });
    store.getState().openScene(scene.slug); store.getState().dispatch({ type: "START", now: 1 });
    function Player() { const state = useStore(store); return <GameI18nProvider locale={locale}><ScenePlayer scene={scene} mission={state.mission!} store={state} onBack={state.goToMap} onSceneComplete={state.completeScene} /></GameI18nProvider>; }
    const view = render(<Player />); await decodeAll();
    expect(view.container.querySelectorAll(".mission__stars .stars__slot")).toHaveLength(4);
    for (let count = 1; count <= 4; count++) {
      const id = currentTargetId(store.getState().mission!)!;
      act(() => rig.tap(Number(id.slice(-1)) * 0.19 + 0.07, 0.45));
      expect(view.container.querySelectorAll(".bubble")).toHaveLength(1);
      act(() => vi.advanceTimersByTime(2200));
      act(() => vi.advanceTimersByTime(560));
      act(() => vi.advanceTimersByTime(160));
      act(() => vi.advanceTimersByTime(901));
      expect(store.getState().progress.scenes[scene.slug]!.foundTargetIds).toHaveLength(count);
      if (count < 3) expect(view.container.querySelector(".mission__continue")).toBeNull();
      if (count === 3) {
        expect(view.container.querySelector(".mission__continue")).not.toBeNull();
        expect(view.container.querySelector(".complete")).toBeNull();
        expect(view.container.querySelector(".mission__rules")).toBeNull();
        fireEvent.click(view.container.querySelector(".scene__advance-actions button:last-child")!);
      }
    }
    expect(store.getState().mission!.phase).toBe("complete");
    expect(view.container.querySelectorAll("[data-target]")).toHaveLength(0);
    expect(view.container.querySelectorAll(".complete__stars .stars__slot")).toHaveLength(4);
    expect(view.container.querySelector(".complete__stars-text")?.textContent).toBe(locale === "en" ? "Four gold stars!" : "ארבעה כוכבי זהב!");
    expect(view.container.querySelector(".mission__rules")).toBeNull();
  });

  it.each(["en", "he"] as const)("shows43 total stars and truthful four/five rules throughout the mixed-board gift and bag in %s", locale => {
    const original = buildDemoConfig(locale);
    const config = { ...original, worlds: undefined, world: undefined, scenes: Array.from({ length: 9 }, (_, index) => ({ ...(index < 2 ? fourScene() : fiveScene()), slug: `mixed-${index}` })) };
    const progress = emptyProgress(config.gameId);
    const gift = render(<GameI18nProvider locale={locale}><GiftReveal config={config} onOpen={vi.fn()} /></GameI18nProvider>);
    fireEvent.click(gift.getByRole("button")); act(() => vi.advanceTimersByTime(701));
    expect(gift.container.querySelector(".gift__lead")?.textContent).toContain("43");
    expect(gift.container.querySelector(".gift__lead")?.textContent).not.toContain(locale === "en" ? "Five hiding spots in each" : "בכל אחד חמישה");
    gift.unmount();
    const map = render(<GameI18nProvider locale={locale}><IslandGrid config={config} progress={progress} onOpen={vi.fn()} onPassport={vi.fn()} /></GameI18nProvider>);
    const labels = Array.from(map.container.querySelectorAll(".island__meta")).map(node => node.textContent);
    expect(labels[0]).toContain(locale === "en" ? "4 hiding spots" : "4 מחבואים");
    expect(labels[2]).toContain(locale === "en" ? "5 hiding spots" : "5 מחבואים");
    expect(labels[0]).toContain("0/4"); expect(labels[2]).toContain("0/5");
    map.unmount();
    const bag = render(<GameI18nProvider locale={locale}><Passport config={config} progress={progress} onOpen={vi.fn()} onMap={vi.fn()} /></GameI18nProvider>);
    expect(bag.getByRole("img", { name: locale === "en" ? "0 of 43 gold stars collected" : "0 מתוך 43 כוכבי זהב נאספו" })).toBeTruthy();
    expect(Array.from(bag.container.querySelectorAll(".loot")).map(node => node.querySelectorAll(".stars__slot").length)).toEqual([4, 4, 5, 5, 5, 5, 5, 5, 5]);
  });

  it.each(["en", "he"] as const)("keeps the search name and stars beside hint without unlock helper sentences in %s", locale => {
    const scene = fiveScene();
    const props = { index: 1, total: 5, target: scene.targets[0]!, order: scene.targets.map(t => t.id), hintLevel: 0 as const,
      hintPulse: false, hintText: "Authored hint", onHint: vi.fn(), childName: "Alex", findAny: true };
    const card = (count: number, threshold = 3) => <GameI18nProvider locale={locale}><MissionCard {...props} found={props.order.slice(0, count)} findsRequiredToAdvance={threshold} /></GameI18nProvider>;
    const view = render(card(0));
    for (let count = 0; count <= 5; count++) {
      view.rerender(card(count));
      expect(view.container.querySelector(".mission__rules")).toBeNull();
      expect(view.container.textContent).not.toMatch(locale === "en" ? /more hiding|stars to|find 3/ : /עוד מחבוא|עוד [123]|מוצאים 3/);
      const top = view.container.querySelector(".mission__top")!;
      expect(top.querySelector(".mission__text")?.parentElement).toBe(top.querySelector(".mission__stars")?.parentElement);
      expect(top.querySelector(".mission__hintbtn")?.parentElement).toBe(top);
      expect(view.container.querySelector(".mission__body")).toBeNull();
      const heading = view.getByRole("heading").textContent!;
      if (count > 0 && count < 5) expect(heading).toContain(locale === "en" ? "another hiding spot" : "איפה Alex עכשיו?");
      if (count === 5) expect(heading).toBe(locale === "en" ? "All hiding spots found!" : "מצאתם את כל המחבואים!");
    }
    view.rerender(card(1, 4));
    expect(view.container.querySelector(".mission__rules")).toBeNull();
    view.rerender(<GameI18nProvider locale={locale}><MissionCard {...props} found={[props.order[0]!]} hintLevel={1} /></GameI18nProvider>);
    expect(view.getByRole("heading").textContent).toContain(locale === "en" ? "another hiding spot" : "איפה Alex עכשיו?");
    expect(view.container.textContent).toContain(props.target.mission);
    view.rerender(<GameI18nProvider locale={locale}><MissionCard {...props} findAny={false} found={[]} hintLevel={1} /></GameI18nProvider>);
    expect(view.getByRole("heading").textContent).toContain("Alex");
    expect(view.container.querySelector(".mission__body")?.textContent).toContain(props.target.mission);
    expect(view.container.querySelector(".mission__rules")).toBeNull();
  });

  it.each(["en", "he"] as const)("keeps the identity heading while the first search's requested hint folds in %s", locale => {
    const scene = fiveScene(), onExpand = vi.fn();
    const props = { index: 1, total: 5, target: scene.targets[0]!, order: scene.targets.map(t => t.id), found: [],
      hintLevel: 1 as const, hintPulse: false, hintText: "Beside the tree", onHint: vi.fn(), childName: "Alex", findAny: true, onExpand };
    const view = render(<GameI18nProvider locale={locale}><MissionCard {...props} /></GameI18nProvider>);
    expect(view.getByRole("heading").textContent).toBe(locale === "en" ? "Find Alex!" : "מצאו את Alex");
    const details = view.container.querySelector(".mission__body")!;
    expect(details.textContent).toContain(props.target.mission); expect(details.textContent).toContain("Beside the tree");
    expect(details.hasAttribute("hidden")).toBe(false);
    view.rerender(<GameI18nProvider locale={locale}><MissionCard {...props} quiet /></GameI18nProvider>);
    expect(view.getByRole("heading").textContent).toContain("Alex");
    expect(view.container.querySelector(".mission__body")!.hasAttribute("hidden")).toBe(true);
    const card = view.container.querySelector(".mission")!;
    expect(card.getAttribute("role")).toBe("button"); expect(card.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(card, { key: "Enter" }); expect(onExpand).toHaveBeenCalledOnce();
  });

  it("replaces each found child, blocks hidden targets during the turn, and unlocks after the third", async () => {
    const scene = fiveScene(); const config = { ...buildDemoConfig("en"), scenes: [scene, { ...scene, slug: "next-board" }], worlds: undefined, world: undefined };
    const store = createPlayStore(config, { copy: { wrongTarget: "Other", wrongTargetNoItem: "Other", bonus: "Bonus", fallbackSuccess: "Found" }, readOnlyPreview: true, skipGift: true });
    store.getState().openScene(scene.slug); store.getState().dispatch({ type: "START", now: 1 });
    const track = vi.spyOn(store.getState().telemetry, "track");
    const dispatch = vi.spyOn(store.getState(), "dispatch");
    function Player() { const state = useStore(store); return <GameI18nProvider locale="en"><ScenePlayer scene={scene} mission={state.mission!} store={state} onBack={state.goToMap} onSceneComplete={state.completeScene} /></GameI18nProvider>; }
    const view = render(<Player />); await decodeAll();
    const tap = (id: string) => act(() => rig.tap(Number(id.slice(-1)) * 0.19 + 0.07, 0.45));
    for (let count = 1; count <= 3; count++) {
      const id = currentTargetId(store.getState().mission!)!;
      expect(view.container.querySelectorAll("[data-target]")).toHaveLength(1);
      tap(id);
      const firstBubble = view.container.querySelector(".bubble");
      expect(firstBubble?.textContent).toContain("Found");
      expect(view.getByRole("status").textContent).toContain("One star earned!");
      const progress = store.getState().progress;
      track.mockClear(); dispatch.mockClear();
      tap(id);
      expect(view.container.querySelector(".bubble")).toBe(firstBubble);
      expect(dispatch).not.toHaveBeenCalled(); expect(track).not.toHaveBeenCalled();
      expect(store.getState().progress).toBe(progress);
      act(() => vi.advanceTimersByTime(2200));
      expect(view.container.querySelector(".scene__curtain")?.classList.contains("is-open")).toBe(false);
      expect(view.container.querySelector(".mission__continue")).toBeNull();
      act(() => vi.advanceTimersByTime(560));
      expect(view.container.querySelector(`[data-target="${id}"]`)).toBeNull();
      const next = currentTargetId(store.getState().mission!)!;
      expect(next).not.toBe(id);
      expect(view.container.querySelector(`[data-target="${next}"]`)).not.toBeNull();
      dispatch.mockClear();
      tap(next); // already swapped, but still behind a closed curtain
      expect(dispatch).not.toHaveBeenCalled();
      expect(store.getState().progress).toBe(progress);
      act(() => vi.advanceTimersByTime(160));
      expect(view.container.querySelector(".scene__curtain")?.classList.contains("is-open")).toBe(true);
      expect(store.getState().progress.scenes[scene.slug]!.foundTargetIds).toHaveLength(count);
      expect(view.container.querySelector(".bubble")).toBeNull();
      if (count < 3) expect(view.container.querySelector(".mission__continue")).toBeNull();
    }
    expect(store.getState().progress.scenes[scene.slug]!.foundTargetIds).toHaveLength(3);
    expect(view.container.querySelectorAll("[data-target]")).toHaveLength(1);
    expect(view.container.querySelector(".mission__continue")).not.toBeNull();
    expect(view.container.querySelector(".scene__advance")).not.toBeNull();
    expect(view.container.querySelector(".complete")).toBeNull();
    fireEvent.click(view.container.querySelector(".mission__continue")!);
    expect(store.getState().sceneSlug).toBe("next-board");
  });

  it("preloads all five but draws and accepts only one, including the fifth celebration", async () => {
    const scene = fiveScene(); const plan = planScenePlay(scene, { plays: 0 }, "fixture");
    let mission = missionReducer(createMissionState(scene.slug, plan, scene), { type: "START", now: 1 }, copy);
    const hit = vi.fn(); const ready = vi.fn();
    const view = render(<SceneViewport scene={scene} mission={mission} hintLevel={0} bonusFound={false} onHit={hit} onAssetsReady={ready} />);
    expect(view.container.querySelectorAll("[data-target]")).toHaveLength(1);
    expect(LoadedImage.instances.map(image => image.src)).toEqual(expect.arrayContaining(scene.targets.map((_, i) => `/test-patch-${i}.png`)));
    expect(ready).not.toHaveBeenCalled();
    await act(async () => { for (const image of LoadedImage.instances) image.onload?.(); });
    expect(ready).not.toHaveBeenCalled(); // load is not enough: every decode must complete.
    await act(async () => { for (const image of LoadedImage.instances) image.resolveDecode(); });
    expect(ready).toHaveBeenCalledOnce();
    for (let i = 0; i < 5; i++) {
      const id = currentTargetId(mission)!;
      const index = Number(id.slice(-1));
      for (let hidden = 0; hidden < 5; hidden++) if (hidden !== index) {
        act(() => vi.advanceTimersByTime(10));
        act(() => rig.tap(hidden * 0.19 + 0.07, 0.45));
        expect(hit.mock.lastCall?.[0].kind).not.toBe("target");
      }
      act(() => rig.tap(index * 0.19 + 0.07, 0.45)); expect(hit).toHaveBeenLastCalledWith({ kind: "target", id });
      const style = view.container.querySelector(`[data-target="${id}"]`)!.getAttribute("style");
      mission = missionReducer(mission, { type: "TAP_TARGET", targetId: id, now: 2 }, copy);
      view.rerender(<SceneViewport scene={scene} mission={mission} hintLevel={0} bonusFound={false} onHit={hit} />);
      const before = hit.mock.calls.length;
      act(() => rig.tap(index * 0.19 + 0.07, 0.45));
      expect(hit).toHaveBeenCalledTimes(before);
      expect(view.container.querySelectorAll("[data-target]")).toHaveLength(1);
      expect(view.container.querySelector(`[data-target="${id}"]`)!.getAttribute("style")).toBe(style);
      mission = missionReducer(mission, { type: "FOUND_DONE", now: 3 }, copy);
      view.rerender(<SceneViewport scene={scene} mission={mission} hintLevel={0} bonusFound={false} onHit={hit} />);
      expect(view.container.querySelector(`[data-target="${id}"]`)).toBeNull();
    }
    expect(view.container.querySelectorAll("[data-target]")).toHaveLength(0);
  });

  it("has one anchored bubble/announcement, cancels old timers and completes the cloud turn", async () => {
    const scene = fiveScene(); const config = { ...buildDemoConfig("en"), scenes: [scene], worlds: undefined, world: undefined };
    const store = createPlayStore(config, { copy: { wrongTarget: "Other", wrongTargetNoItem: "Other", bonus: "Bonus", fallbackSuccess: "Found" }, readOnlyPreview: true, skipGift: true });
    store.getState().openScene(scene.slug); store.getState().dispatch({ type: "START", now: 1 });
    function Player({ api }: { api: PlayStoreApi }) { const state = useStore(api); return <GameI18nProvider locale="en"><ScenePlayer scene={scene} mission={state.mission!} store={state} onBack={state.goToMap} onSceneComplete={state.completeScene} /></GameI18nProvider>; }
    const view = render(<Player api={store} />); await decodeAll();
    expect(view.container.querySelector(".scene__curtain")?.classList.contains("is-open")).toBe(true);
    act(() => store.getState().dispatch({ type: "TAP_AMBIENT", ambientId: "ambient" }));
    expect(view.container.querySelector(".bubble")?.textContent).toBe("Tree says hello");
    act(() => vi.advanceTimersByTime(500));
    act(() => store.getState().dispatch({ type: "TAP_TARGET", targetId: "hide-4", now: 2 }));
    const bubble = view.container.querySelector(".bubble");
    expect(bubble?.textContent).toContain("Found 4!"); expect(view.container.querySelectorAll(".bubble")).toHaveLength(1);
    expect(view.getAllByRole("status")).toHaveLength(1); expect(view.getByRole("status").textContent).toContain("One star earned!");
    act(() => vi.advanceTimersByTime(1200));
    expect(view.container.querySelector(".bubble")).toBe(bubble); // the old ambient timer did not erase the new find.
    expect(view.container.querySelectorAll(".bubble")).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1001));
    expect(view.container.querySelector(".bubble")).toBeNull();
    expect(view.container.querySelector(".scene__curtain")?.classList.contains("is-open")).toBe(false);
    act(() => vi.advanceTimersByTime(560));
    act(() => vi.advanceTimersByTime(160));
    expect(store.getState().mission!.phase).toBe("searching");
    expect(view.container.querySelector(".scene__curtain")?.classList.contains("is-open")).toBe(true);
    expect(view.container.querySelectorAll("[data-target]")).toHaveLength(1);
    act(() => store.getState().dispatch({ type: "TAP_AMBIENT", ambientId: "ambient" }));
    act(() => vi.advanceTimersByTime(1601)); expect(view.container.querySelector(".bubble")).toBeNull();
    view.unmount(); act(() => vi.advanceTimersByTime(10_000)); expect(view.container.querySelector(".bubble")).toBeNull();
  });

  it("keeps the curtain closed on an essential decode failure", async () => {
    const scene = fiveScene(); const mission = createMissionState(scene.slug, planScenePlay(scene, { plays: 0 }, "fixture"), scene);
    const ready = vi.fn(); const failed = vi.fn();
    render(<SceneViewport scene={scene} mission={mission} hintLevel={0} bonusFound={false} onHit={vi.fn()} onAssetsReady={ready} onAssetsFailed={failed} />);
    await act(async () => { LoadedImage.instances[0]!.onerror?.(); for (const image of LoadedImage.instances.slice(1)) { image.onload?.(); image.resolveDecode(); } });
    expect(failed).toHaveBeenCalledOnce(); expect(ready).not.toHaveBeenCalled();
  });

  it("reentry does not celebrate; explicit replay remounts, starts at zero and can finish again without overwriting five earned stars", async () => {
    const scene = fiveScene(); const config = { ...buildDemoConfig("en"), scenes: [scene], worlds: undefined, world: undefined };
    const store = createPlayStore(config, { copy, readOnlyPreview: true, skipGift: true });
    store.getState().openScene(scene.slug); store.getState().dispatch({ type: "START", now: 1 });
    for (const target of scene.targets) { store.getState().dispatch({ type: "TAP_TARGET", targetId: target.id, now: 2 }); store.getState().dispatch({ type: "FOUND_DONE", now: 3 }); }
    const progress = store.getState().progress;
    function Player() { const state = useStore(store); return <GameI18nProvider locale="en"><ScenePlayer key={state.visitId} scene={scene} mission={state.mission!} store={state} onBack={state.goToMap} onSceneComplete={state.completeScene} /></GameI18nProvider>; }
    const view = render(<Player />);
    await decodeAll(); act(() => vi.advanceTimersByTime(901));
    expect(view.queryByRole("dialog")).toBeNull();
    expect(view.container.querySelectorAll(".mission__stars .stars__slot.is-lit")).toHaveLength(5);
    fireEvent.click(view.getByRole("button", { name: "Play again" }));
    await decodeAll(); act(() => vi.advanceTimersByTime(901));
    expect(store.getState().mission!.phase).toBe("searching");
    expect(view.container.querySelector(".scene__curtain")?.classList.contains("is-open")).toBe(true);
    expect(view.container.querySelectorAll("[data-target]")).toHaveLength(1);
    expect(view.container.querySelectorAll(".mission__stars .stars__slot.is-lit")).toHaveLength(0);
    expect(view.container.querySelector(".mission__replay-label")?.textContent).toBe("Playing again");
    for (let i = 0; i < 5; i++) {
      const id = currentTargetId(store.getState().mission!)!;
      act(() => rig.tap(Number(id.slice(-1)) * 0.19 + 0.07, 0.45));
      act(() => vi.advanceTimersByTime(2200)); act(() => vi.advanceTimersByTime(560)); act(() => vi.advanceTimersByTime(160)); act(() => vi.advanceTimersByTime(901));
      expect(view.container.querySelector(".scene__advance")).toBeNull();
    }
    expect(view.getByRole("dialog").textContent).toContain("You found every hiding spot in this round!");
    expect(view.container.querySelector(".complete__loot")).toBeNull();
    expect(store.getState().progress).toBe(progress);
    // A second replay must also discard completion and choreography state.
    fireEvent.click(view.getByRole("button", { name: "Play again" }));
    await decodeAll(); act(() => vi.advanceTimersByTime(901));
    expect(view.queryByRole("dialog")).toBeNull();
    expect(store.getState().mission!.phase).toBe("searching");
    expect(Object.keys(store.getState().mission!.found)).toHaveLength(0);
    expect(store.getState().progress.scenes[scene.slug]!.foundTargetIds).toHaveLength(5);
  });

  it.each(["en", "he"] as const)("the gift describes five-hide rules only for new games in %s", locale => {
    const config = { ...buildDemoConfig(locale), scenes: [fiveScene()] };
    const view = render(<GameI18nProvider locale={locale}><GiftReveal config={config} onOpen={vi.fn()} /></GameI18nProvider>);
    fireEvent.click(view.getByRole("button")); act(() => vi.advanceTimersByTime(701));
    expect(view.container.querySelector(".gift__lead")?.textContent).toContain(locale === "en" ? "Five hiding spots" : "חמישה מחבואים");
    view.unmount();
    const legacyBase = buildDemoConfig(locale);
    const legacyConfig = { ...legacyBase, adventure: undefined, scenes: legacyBase.scenes.map(scene => ({ ...scene, playMode: undefined, appearancesPerBoard: undefined, findsRequiredToAdvance: undefined })) };
    const legacy = render(<GameI18nProvider locale={locale}><GiftReveal config={legacyConfig} onOpen={vi.fn()} /></GameI18nProvider>);
    fireEvent.click(legacy.getByRole("button")); act(() => vi.advanceTimersByTime(701));
    expect(legacy.container.querySelector(".gift__lead")?.textContent).toContain(locale === "en" ? "Three hiding spots" : "שלושה מחבואים");
  });

  it("provides opaque fallback, fixed bubble anchors, full-face HUD and room to pan edge hides out from under it", () => {
    const css = readFileSync("src/game/game.css", "utf8");
    expect(css).toContain("background-color: #BFE9FF"); expect(css).toContain(".scene__curtain.is-open { pointer-events: none; }");
    // The portrait is contained (never a circular crop), 48px on a desktop and 40px on a phone.
    expect(css).toContain("object-fit: contain");
    expect(css).toContain(".mission__thumb--face { width: var(--space-6); height: var(--space-6)");
    expect(css).toContain(".mission__thumb--face { width: var(--space-5); height: var(--space-5); }");
    const keyframes = css.slice(css.indexOf("@keyframes fm-bubble-pop"), css.indexOf("@media (max-width: 720px), (max-height: 480px)"));
    expect(keyframes.match(/translate\(-50%, calc\(-100% - var\(--space-4\)\)\)/g)).toHaveLength(3);
    for (const width of [320, 360, 390, 430]) for (const viewport of [{ width, height: 650 }, { width: 844, height: width }]) {
      const stage = { width: 3072, height: 2048 }, scale = Math.max(viewport.width / stage.width, viewport.height / stage.height);
      const t = clampTransform({ scale, tx: viewport.width - stage.width * scale - 180, ty: 200 }, viewport, stage, scale, scale * 4, 220);
      const point = stageToScreen(t, stage.width * 0.99, stage.height * 0.01);
      expect(point.y).toBeGreaterThan(180); expect(point.x).toBeLessThan(viewport.width - 100);
    }
  });

  it("shows three stars without a completion stamp, unlocks just the next board, and keeps the passport honest", () => {
    const original = buildDemoConfig("en"); const first = fiveScene(); const second = { ...fiveScene(), slug: "next-board" }; const third = { ...fiveScene(), slug: "later-board" };
    const world = { slug: "test-world", version: 1, name: "World", tagline: "Explore", intro: "Go", map: { width: 1280, height: 720, art: "/map.webp", palette: { sky: "#fff", ground: "#fff", accent: "#000" } }, collectible: { id: "stamps", name: "Stamps", piece: "stamps", icon: "★" }, completion: { title: "World complete", text: "All found", icon: "★" }, nodes: [first, second, third].map((scene, index) => ({ boardSlug: scene.slug, routeIndex: index + 1, x: 0.2 + index * 0.3, y: 0.5, markerScale: 0.09, travelStyle: "walk" as const, labelAnchor: "bottom" as const })) };
    const config = { ...original, scenes: [first, second, third], worlds: [world], world };
    const progress = parseProgress(JSON.stringify({ ...emptyProgress(config.gameId), scenes: { [first.slug]: { sceneVersion: 7, foundTargetIds: first.targets.slice(0, 3).map(target => target.id), completed: false } } }), config.gameId);
    const view = render(<GameI18nProvider locale="en"><WorldMap config={config} progress={progress} onOpen={vi.fn()} onPassport={vi.fn()} /></GameI18nProvider>);
    expect(view.container.querySelector(`[data-board="${first.slug}"] .wmap__stamp`)).toBeNull();
    expect(view.container.querySelector(`[data-board="${first.slug}"]`)?.getAttribute("aria-label")).toContain("3/5");
    expect(view.container.querySelector(`[data-board="${second.slug}"]`)?.getAttribute("aria-disabled")).toBeNull();
    expect(view.container.querySelector(`[data-board="${third.slug}"]`)?.getAttribute("aria-disabled")).toBe("true");
    view.unmount();
    const passport = render(<GameI18nProvider locale="en"><Passport config={config} progress={progress} onOpen={vi.fn()} onMap={vi.fn()} /></GameI18nProvider>);
    expect(passport.container.querySelectorAll(".loot__completed")).toHaveLength(0);
    // The world's stars are said in words to a screen reader; the digits and the gold star are decoration.
    expect(passport.getByRole("img", { name: "3 of 15 gold stars collected" })).toBeTruthy();
    expect([...passport.container.querySelectorAll(".loot")].map(card => card.querySelectorAll(".stars__slot.is-lit").length)).toEqual([3, 0, 0]);
  });
});
