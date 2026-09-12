// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "zustand";
import { buildDemoConfig } from "@/services/demo";
import type { SceneConfig } from "@/domain/game/config";
import { GameI18nProvider } from "../i18n";
import { ScenePlayer } from "../components/ScenePlayer";
import { createPlayStore } from "../store/play-store";
import { targetGeometry } from "../engine/target-geometry";
import { stageToScreen } from "../engine/viewport-math";

// Keep the actual viewport hook, pointer handlers, RAF, bubble and particles.
// Only browser layout/image loading are supplied by the test environment.
class LayoutObserver {
  static latest: LayoutObserver;
  constructor(private readonly callback: (entries: Array<{ contentRect: { width: number; height: number } }>) => void) { LayoutObserver.latest = this; }
  observe() {}
  disconnect() {}
  resize(width: number, height: number) { this.callback([{ contentRect: { width, height } }]); }
}
class LoadedImage {
  static instances: LoadedImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  decode() { return Promise.resolve(); }
  constructor() { LoadedImage.instances.push(this); }
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("ResizeObserver", LayoutObserver);
  vi.stubGlobal("Image", LoadedImage);
  LoadedImage.instances = [];
  vi.useFakeTimers();
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle));
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function sceneFixture(): SceneConfig {
  const scene = structuredClone(buildDemoConfig("en").scenes[0]!);
  const source = scene.targets[0]!;
  return { ...scene, version: 7, playMode: "find-any", appearancesPerBoard: 5, findsRequiredToAdvance: 3, intro: undefined, ambient: [], bonus: undefined,
    targets: Array.from({ length: 5 }, (_, index) => ({ ...source, id: `hide-${index}`, success: [`Found ${index}!`], spriteByVariant: undefined,
      sprite: { kind: "image", url: `/synthetic-${index}.png`, width: 512, height: 768,
        rect: { x: index * 0.19, y: 0.3, w: 0.17, h: 0.35 }, hitRect: { x: index * 0.19 + 0.04, y: 0.4, w: 0.06, h: 0.15 } } })),
  };
}

describe("first find through the actual animated viewport", () => {
  it.each([{ width: 1280, height: 800 }, { width: 390, height: 650 }])("keeps the camera still and accepts the next pointer hit without reset at $width×$height", async size => {
    const scene = sceneFixture();
    const config = { ...buildDemoConfig("en"), scenes: [scene], worlds: undefined, world: undefined };
    // No live imagery, localStorage writes, telemetry or API calls.
    config.child.avatarUrl = "";
    const store = createPlayStore(config, { readOnlyPreview: true, skipGift: true,
      copy: { wrongTarget: "Other", wrongTargetNoItem: "Other", bonus: "Bonus", fallbackSuccess: "Found" } });
    store.getState().openScene(scene.slug);
    function Player() { const state = useStore(store); return <GameI18nProvider locale="en"><ScenePlayer scene={scene} mission={state.mission!} store={state} onBack={state.goToMap} onSceneComplete={state.completeScene} /></GameI18nProvider>; }
    const view = render(<Player />);
    act(() => LayoutObserver.latest.resize(size.width, size.height));
    await act(async () => { for (const image of LoadedImage.instances) image.onload?.(); });
    act(() => vi.advanceTimersByTime(1000));
    expect(store.getState().mission!.phase).toBe("searching");
    const stage = view.container.querySelector<HTMLElement>(".stage")!;
    const viewport = view.container.querySelector<HTMLElement>(".viewport")!;
    const hit = (targetId: string, pointerId: number) => {
      const target = scene.targets.find(item => item.id === targetId)!;
      const { center } = targetGeometry(scene, target, store.getState().mission!.plan.variants[targetId] ?? "A");
      const [, tx, ty, scale] = stage.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/)!;
      const point = stageToScreen({ tx: Number(tx), ty: Number(ty), scale: Number(scale) }, center.x * scene.art.width, center.y * scene.art.height);
      expect(point.x).toBeGreaterThan(0); expect(point.x).toBeLessThan(size.width);
      expect(point.y).toBeGreaterThan(0); expect(point.y).toBeLessThan(size.height);
      for (const type of ["pointerdown", "pointerup"]) {
        const event = new MouseEvent(type, { bubbles: true, clientX: point.x, clientY: point.y });
        Object.defineProperty(event, "pointerId", { value: pointerId });
        fireEvent(viewport, event);
      }
    };
    const before = stage.style.transform;
    hit("hide-2", 1);
    expect(store.getState().mission!.phase).toBe("found");
    expect(view.container.querySelectorAll(".bubble")).toHaveLength(1);
    expect(view.container.querySelectorAll(".found-particles")).toHaveLength(1);
    act(() => vi.advanceTimersByTime(500));
    expect(stage.style.transform).toBe(before); // no forced zoom onto an already-found child.
    act(() => vi.advanceTimersByTime(1800));
    expect(store.getState().mission!.phase).toBe("searching");
    expect(store.getState().progress.scenes[scene.slug]!.foundTargetIds).toEqual(["hide-2"]);
    expect(view.container.querySelector(".bubble")).toBeNull();
    expect(view.container.querySelector(".scene__intro-veil")).toBeNull();
    expect(view.container.querySelector(".scene__curtain")?.classList.contains("is-open")).toBe(true);
    expect(stage.style.transform).toBe(before);
    // The old child stays in the art. A repeat tap must answer, not look frozen,
    // while preserving both the saved stars and the still-searching mission.
    const savedProgress = store.getState().progress;
    expect(view.container.querySelectorAll("[data-found-marker]")).toHaveLength(1);
    hit("hide-2", 8);
    expect(view.container.querySelectorAll(".bubble")).toHaveLength(1);
    expect(view.container.querySelector(".bubble")?.textContent).toContain("already found");
    expect(view.container.querySelector(".bubble__star")).toBeNull();
    expect(view.container.querySelector(".found-particles")).toBeNull();
    expect(store.getState().mission!.phase).toBe("searching");
    expect(store.getState().progress).toBe(savedProgress);
    act(() => vi.advanceTimersByTime(500)); // a deliberate second tap, not a zoom gesture
    hit("hide-2", 9);
    expect(view.container.querySelectorAll(".bubble")).toHaveLength(1);
    expect(store.getState().progress).toBe(savedProgress);
    act(() => vi.advanceTimersByTime(500));
    // The next visible hide remains reachable without zooming out or resetting.
    hit("hide-3", 2);
    expect(store.getState().mission!.phase).toBe("found");
    expect(store.getState().progress.scenes[scene.slug]!.foundTargetIds).toEqual(["hide-2", "hide-3"]);
    act(() => vi.advanceTimersByTime(2300));
    expect(store.getState().mission!.phase).toBe("searching");
    expect(view.container.querySelectorAll("[data-target]")).toHaveLength(5);
    expect(view.container.querySelectorAll("[data-found-marker]")).toHaveLength(2);
  });

  it("does not undo manual zoom and pan when find-any feedback finishes", async () => {
    const scene = sceneFixture();
    const config = { ...buildDemoConfig("en"), scenes: [scene], worlds: undefined, world: undefined };
    config.child.avatarUrl = "";
    const store = createPlayStore(config, { readOnlyPreview: true, skipGift: true,
      copy: { wrongTarget: "Other", wrongTargetNoItem: "Other", bonus: "Bonus", fallbackSuccess: "Found" } });
    store.getState().openScene(scene.slug);
    function Player() { const state = useStore(store); return <GameI18nProvider locale="en"><ScenePlayer scene={scene} mission={state.mission!} store={state} onBack={state.goToMap} onSceneComplete={state.completeScene} /></GameI18nProvider>; }
    const view = render(<Player />);
    act(() => LayoutObserver.latest.resize(1280, 800));
    await act(async () => { for (const image of LoadedImage.instances) image.onload?.(); });
    act(() => vi.advanceTimersByTime(1000));
    const stage = view.container.querySelector<HTMLElement>(".stage")!;
    const viewport = view.container.querySelector<HTMLElement>(".viewport")!;
    const before = stage.style.transform;
    act(() => store.getState().dispatch({ type: "TAP_TARGET", targetId: "hide-2", now: Date.now() }));
    fireEvent.click(view.container.querySelectorAll(".scene__tools button")[0]!);
    act(() => vi.advanceTimersByTime(300));
    const zoomed = stage.style.transform;
    expect(zoomed).not.toBe(before); // the real, non-reduced-motion camera RAF ran.
    for (const [type, x, y] of [["pointerdown", 640, 400], ["pointermove", 710, 440], ["pointerup", 710, 440]] as const) {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
      Object.defineProperty(event, "pointerId", { value: 5 });
      fireEvent(viewport, event);
    }
    const panned = stage.style.transform;
    expect(panned).not.toBe(zoomed);
    act(() => vi.advanceTimersByTime(2000));
    expect(store.getState().mission!.phase).toBe("searching");
    expect(stage.style.transform).toBe(panned);
    expect(store.getState().progress.scenes[scene.slug]!.foundTargetIds).toEqual(["hide-2"]);
  });

  it("keeps the legacy serial focus, cloud turn and reset choreography", async () => {
    const scene: SceneConfig = { ...sceneFixture(), version: 6, playMode: undefined, appearancesPerBoard: undefined, findsRequiredToAdvance: undefined };
    scene.targets = scene.targets.slice(1, 4);
    const config = { ...buildDemoConfig("en"), scenes: [scene], worlds: undefined, world: undefined };
    config.child.avatarUrl = "";
    const store = createPlayStore(config, { readOnlyPreview: true, skipGift: true,
      copy: { wrongTarget: "Other", wrongTargetNoItem: "Other", bonus: "Bonus", fallbackSuccess: "Found" } });
    store.getState().openScene(scene.slug);
    function Player() { const state = useStore(store); return <GameI18nProvider locale="en"><ScenePlayer scene={scene} mission={state.mission!} store={state} onBack={state.goToMap} onSceneComplete={state.completeScene} /></GameI18nProvider>; }
    const view = render(<Player />);
    act(() => LayoutObserver.latest.resize(1280, 800));
    await act(async () => { for (const image of LoadedImage.instances) image.onload?.(); });
    act(() => vi.advanceTimersByTime(1000));
    const stage = view.container.querySelector<HTMLElement>(".stage")!;
    const before = stage.style.transform;
    const first = store.getState().mission!.plan.order[0]!;
    act(() => store.getState().dispatch({ type: "TAP_TARGET", targetId: first, now: Date.now() }));
    act(() => vi.advanceTimersByTime(500));
    expect(stage.style.transform).not.toBe(before);
    expect(store.getState().mission!.phase).toBe("found");
    act(() => vi.advanceTimersByTime(1700));
    expect(view.container.querySelector(".scene__curtain")?.classList.contains("is-open")).toBe(false);
    act(() => vi.advanceTimersByTime(560));
    act(() => vi.advanceTimersByTime(400));
    expect(store.getState().mission!.phase).toBe("searching");
    expect(store.getState().mission!.currentIndex).toBe(1);
    expect(stage.style.transform).toBe(before);
    expect(view.container.querySelector(".scene__curtain")?.classList.contains("is-open")).toBe(true);
  });
});
