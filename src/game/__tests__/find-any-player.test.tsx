// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "zustand";
import { readFileSync } from "node:fs";
import { buildDemoConfig } from "@/services/demo";
import { type SceneConfig } from "@/domain/game/config";
import { createMissionState, missionReducer, type MissionCopy } from "@/domain/game/mission";
import { planScenePlay } from "@/domain/game/replay";
import { SceneViewport } from "../components/SceneViewport";
import { ScenePlayer } from "../components/ScenePlayer";
import { WorldMap } from "../components/WorldMap";
import { Passport } from "../components/Passport";
import { GiftReveal } from "../components/GiftReveal";
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
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("Image", LoadedImage); LoadedImage.instances = []; vi.useFakeTimers(); window.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as never; });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("find-any rendering and mobile feedback", () => {
  it("draws all five together, accepts each footprint, and never removes/repositions a found patch", async () => {
    const scene = fiveScene(); const plan = planScenePlay(scene, { plays: 0 }, "fixture");
    let mission = missionReducer(createMissionState(scene.slug, plan, scene), { type: "START", now: 1 }, copy);
    const hit = vi.fn(); const ready = vi.fn();
    const view = render(<SceneViewport scene={scene} mission={mission} hintLevel={0} bonusFound={false} onHit={hit} onAssetsReady={ready} />);
    expect(view.container.querySelectorAll("[data-target]")).toHaveLength(5);
    const styles = [...view.container.querySelectorAll("[data-target]")].map(node => node.getAttribute("style"));
    expect(ready).not.toHaveBeenCalled();
    await act(async () => { for (const image of LoadedImage.instances) image.onload?.(); });
    expect(ready).not.toHaveBeenCalled(); // load is not enough: every decode must complete.
    await act(async () => { for (const image of LoadedImage.instances) image.resolveDecode(); });
    expect(ready).toHaveBeenCalledOnce();
    for (let i = 0; i < 5; i++) {
      act(() => rig.tap(i * 0.19 + 0.07, 0.45)); expect(hit).toHaveBeenLastCalledWith({ kind: "target", id: `hide-${i}` });
      mission = missionReducer(mission, { type: "TAP_TARGET", targetId: `hide-${i}`, now: 2 }, copy);
      view.rerender(<SceneViewport scene={scene} mission={mission} hintLevel={0} bonusFound={false} onHit={hit} />);
      const before = hit.mock.calls.length; act(() => rig.tap(i * 0.19 + 0.07, 0.45)); expect(hit).toHaveBeenCalledTimes(before);
      expect([...view.container.querySelectorAll("[data-target]")].map(node => node.getAttribute("style"))).toEqual(styles);
      mission = missionReducer(mission, { type: "FOUND_DONE", now: 3 }, copy);
      view.rerender(<SceneViewport scene={scene} mission={mission} hintLevel={0} bonusFound={false} onHit={hit} />);
    }
    expect(view.container.querySelectorAll('[data-found="true"]')).toHaveLength(5);
  });

  it("has one anchored bubble/announcement, no delayed duplicate or cloud turn, and cancels old dismissal timers", async () => {
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
    expect(view.container.querySelector(".bubble")).toBeNull(); expect(store.getState().mission!.phase).toBe("searching");
    expect(view.container.querySelector(".scene__curtain")?.classList.contains("is-open")).toBe(true);
    expect(view.container.querySelectorAll("[data-target]")).toHaveLength(5);
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

  it("a completed new board offers map/passport, not a broken intro-reset replay; revisits retain five stars", async () => {
    const scene = fiveScene(); const config = { ...buildDemoConfig("en"), scenes: [scene], worlds: undefined, world: undefined };
    const store = createPlayStore(config, { copy, readOnlyPreview: true, skipGift: true });
    store.getState().openScene(scene.slug); store.getState().dispatch({ type: "START", now: 1 });
    for (const target of scene.targets) { store.getState().dispatch({ type: "TAP_TARGET", targetId: target.id, now: 2 }); store.getState().dispatch({ type: "FOUND_DONE", now: 3 }); }
    const state = store.getState();
    const view = render(<GameI18nProvider locale="en"><ScenePlayer scene={scene} mission={state.mission!} store={state} onBack={state.goToMap} onSceneComplete={state.completeScene} /></GameI18nProvider>);
    await decodeAll(); act(() => vi.advanceTimersByTime(901));
    expect(view.queryByRole("button", { name: "Play again" })).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "To the map" }));
    expect(store.getState().screen).toBe("map"); expect(store.getState().progress.scenes[scene.slug]!.foundTargetIds).toHaveLength(5);
  });

  it.each(["en", "he"] as const)("the gift describes five-hide rules only for new games in %s", locale => {
    const config = { ...buildDemoConfig(locale), scenes: [fiveScene()] };
    const view = render(<GameI18nProvider locale={locale}><GiftReveal config={config} onOpen={vi.fn()} /></GameI18nProvider>);
    fireEvent.click(view.getByRole("button")); act(() => vi.advanceTimersByTime(701));
    expect(view.container.querySelector(".gift__lead")?.textContent).toContain(locale === "en" ? "Five hiding spots" : "חמישה מחבואים");
    view.unmount();
    const legacy = render(<GameI18nProvider locale={locale}><GiftReveal config={buildDemoConfig(locale)} onOpen={vi.fn()} /></GameI18nProvider>);
    fireEvent.click(legacy.getByRole("button")); act(() => vi.advanceTimersByTime(701));
    expect(legacy.container.querySelector(".gift__lead")?.textContent).toContain(locale === "en" ? "Three hiding spots" : "שלושה מחבואים");
  });

  it("provides opaque fallback, fixed bubble anchors, full-face HUD and room to pan edge hides out from under it", () => {
    const css = readFileSync("src/game/game.css", "utf8");
    expect(css).toContain("background-color: #BFE9FF"); expect(css).toContain(".scene__curtain.is-open { pointer-events: none; }");
    expect(css).toContain("object-fit: contain"); expect(css).toContain("width: 72px; height: 72px"); expect(css).toContain("width: 96px; height: 96px");
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
    expect(passport.container.textContent).toContain("World: 3/15");
  });
});
