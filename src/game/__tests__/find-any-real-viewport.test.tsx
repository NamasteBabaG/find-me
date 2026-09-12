// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "zustand";
import { buildDemoConfig } from "@/services/demo";
import type { SceneConfig } from "@/domain/game/config";
import { parseProgress } from "@/domain/game/progress";
import { GameI18nProvider } from "../i18n";
import { ScenePlayer } from "../components/ScenePlayer";
import { createPlayStore } from "../store/play-store";
import { targetGeometry } from "../engine/target-geometry";
import { stageToScreen } from "../engine/viewport-math";

// Actual viewport hook, pointer handlers, RAF, bubble, particles and store.
// Only browser layout/image loading are supplied; no network or persistence.
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
    // All five distinct hit footprints are in the initial portrait viewport.
    targets: Array.from({ length: 5 }, (_, index) => ({ ...source, id: `hide-${index}`, success: [`Found ${index}!`], spriteByVariant: undefined,
      sprite: { kind: "image", url: `/synthetic-${index}.png`, width: 512, height: 768,
        rect: { x: 0.33 + index * 0.055, y: 0.3, w: 0.08, h: 0.35 },
        hitRect: { x: 0.3525 + index * 0.055, y: 0.4, w: 0.035, h: 0.15 } } })),
  };
}

async function mountPlayer(size: { width: number; height: number }, scene = sceneFixture(), saved: string[] = []) {
  const config = { ...buildDemoConfig("en"), scenes: [scene], worlds: undefined, world: undefined };
  config.child.avatarUrl = "";
  const store = createPlayStore(config, { readOnlyPreview: true, skipGift: true,
    copy: { wrongTarget: "Other", wrongTargetNoItem: "Other", bonus: "Bonus", fallbackSuccess: "Found" } });
  if (saved.length) store.setState({ progress: parseProgress(JSON.stringify({
    v: 1, gameId: config.gameId, revealed: true,
    scenes: { [scene.slug]: { sceneVersion: scene.version, foundTargetIds: saved } },
  }), config.gameId) });
  store.getState().openScene(scene.slug);
  function Player() { const state = useStore(store); return <GameI18nProvider locale="en"><ScenePlayer scene={scene} mission={state.mission!} store={state} onBack={state.goToMap} onSceneComplete={state.completeScene} /></GameI18nProvider>; }
  const view = render(<Player />);
  act(() => LayoutObserver.latest.resize(size.width, size.height));
  await act(async () => { for (const image of LoadedImage.instances) image.onload?.(); });
  act(() => vi.advanceTimersByTime(1000));
  expect(store.getState().mission!.phase).toBe("searching");
  const stage = view.container.querySelector<HTMLElement>(".stage")!;
  const viewport = view.container.querySelector<HTMLElement>(".viewport")!;
  let pointerId = 0;
  const hit = (targetId: string) => {
    const target = scene.targets.find(item => item.id === targetId)!;
    const { center } = targetGeometry(scene, target, store.getState().mission!.plan.variants[targetId] ?? "A");
    const [, tx, ty, scale] = stage.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/)!;
    const point = stageToScreen({ tx: Number(tx), ty: Number(ty), scale: Number(scale) }, center.x * scene.art.width, center.y * scene.art.height);
    expect(point.x).toBeGreaterThan(0); expect(point.x).toBeLessThan(size.width);
    expect(point.y).toBeGreaterThan(0); expect(point.y).toBeLessThan(size.height);
    pointerId += 1;
    for (const type of ["pointerdown", "pointerup"]) {
      const event = new MouseEvent(type, { bubbles: true, clientX: point.x, clientY: point.y });
      Object.defineProperty(event, "pointerId", { value: pointerId });
      fireEvent(viewport, event);
    }
  };
  const visible = () => Array.from(view.container.querySelectorAll("[data-target]"), element => element.getAttribute("data-target")!);
  const curtainOpen = () => view.container.querySelector(".scene__curtain")?.classList.contains("is-open");
  return { ...view, store, stage, viewport, hit, visible, curtainOpen, scene };
}

describe("one child at a time through the actual animated viewport", () => {
  it.each([{ width: 1280, height: 800 }, { width: 390, height: 650 }])("finds all five via pointers, swaps under clouds and completes without a stuck curtain at $width×$height", async size => {
    const player = await mountPlayer(size);
    const { store, stage, hit, visible, curtainOpen, container, scene } = player;
    const initialCamera = stage.style.transform;
    const seen: string[] = [];
    expect(visible()).toHaveLength(1);
    for (let count = 1; count <= 5; count++) {
      const current = visible()[0]!;
      expect(seen).not.toContain(current);
      seen.push(current);
      hit(current);
      expect(store.getState().mission!.phase).toBe("found");
      expect(visible()).toEqual([current]); // Including the fifth during its celebration.
      expect(container.querySelectorAll(".bubble")).toHaveLength(1);
      expect(container.querySelectorAll(".found-particles")).toHaveLength(1);
      expect(store.getState().progress.scenes[scene.slug]!.foundTargetIds).toHaveLength(count);
      act(() => vi.advanceTimersByTime(2199));
      expect(visible()).toEqual([current]);
      expect(curtainOpen()).toBe(true);
      expect(container.querySelectorAll(".bubble")).toHaveLength(1);
      expect(stage.style.transform).toBe(initialCamera); // No forced find zoom in v7.
      act(() => vi.advanceTimersByTime(1));
      expect(container.querySelector(".bubble")).toBeNull();
      if (count === 5) {
        expect(store.getState().mission!.phase).toBe("complete");
        expect(visible()).toEqual([]);
        expect(curtainOpen()).toBe(true);
        act(() => vi.advanceTimersByTime(1000));
        expect(container.querySelector(".complete__card")).not.toBeNull();
        expect(curtainOpen()).toBe(true);
        expect(store.getState().progress.scenes[scene.slug]!.completed).toBe(true);
        break;
      }
      expect(curtainOpen()).toBe(false);
      expect(visible()).toEqual([current]);
      act(() => vi.advanceTimersByTime(559));
      expect(visible()).toEqual([current]);
      expect(store.getState().mission!.phase).toBe("found");
      act(() => vi.advanceTimersByTime(1));
      expect(visible()).toHaveLength(1);
      expect(visible()).not.toContain(current);
      expect(store.getState().mission!.phase).toBe("searching");
      expect(curtainOpen()).toBe(false);
      // Pointer delivery behind the closed curtain cannot award the next star.
      const savedProgress = store.getState().progress;
      hit(visible()[0]!);
      expect(store.getState().progress).toBe(savedProgress);
      act(() => vi.advanceTimersByTime(159));
      expect(curtainOpen()).toBe(false);
      act(() => vi.advanceTimersByTime(1));
      expect(curtainOpen()).toBe(true);
      act(() => vi.advanceTimersByTime(400));
      expect(stage.style.transform).toBe(initialCamera);
      if (count === 3) expect(container.querySelector(".mission__continue")).not.toBeNull();
    }
    expect(new Set(seen).size).toBe(5);
  });

  it("keeps manual zoom through success feedback, then resets for the next hide under the clouds", async () => {
    const { store, stage, container, hit, visible, curtainOpen } = await mountPlayer({ width: 1280, height: 800 });
    const initialCamera = stage.style.transform;
    fireEvent.click(container.querySelectorAll(".scene__tools button")[0]!);
    act(() => vi.advanceTimersByTime(300));
    const zoomed = stage.style.transform;
    expect(zoomed).not.toBe(initialCamera);
    hit(visible()[0]!);
    act(() => vi.advanceTimersByTime(2199));
    expect(stage.style.transform).toBe(zoomed);
    act(() => vi.advanceTimersByTime(1));
    expect(curtainOpen()).toBe(false);
    act(() => vi.advanceTimersByTime(560));
    expect(store.getState().mission!.phase).toBe("searching");
    expect(visible()).toHaveLength(1);
    expect(stage.style.transform).toBe(initialCamera);
    expect(curtainOpen()).toBe(false);
    act(() => vi.advanceTimersByTime(160));
    expect(curtainOpen()).toBe(true);
    act(() => vi.advanceTimersByTime(200));
    hit(visible()[0]!);
    expect(store.getState().mission!.phase).toBe("found");
  });

  it("restores non-prefix saved finds but only shows and awards the next unfound hide", async () => {
    const saved = ["hide-1", "hide-3"];
    const { store, visible, hit, scene, container } = await mountPlayer({ width: 390, height: 650 }, sceneFixture(), saved);
    expect(visible()).toHaveLength(1);
    expect(saved).not.toContain(visible()[0]);
    expect(Object.keys(store.getState().mission!.found).sort()).toEqual(saved);
    hit(visible()[0]!);
    expect(store.getState().progress.scenes[scene.slug]!.foundTargetIds).toHaveLength(3);
    act(() => vi.advanceTimersByTime(2200));
    act(() => vi.advanceTimersByTime(560));
    act(() => vi.advanceTimersByTime(400));
    expect(visible()).toHaveLength(1);
    expect(store.getState().progress.scenes[scene.slug]!.foundTargetIds).not.toContain(visible()[0]);
    expect(container.querySelector(".mission__continue")).not.toBeNull();
  });

  it("keeps the legacy serial focus, cloud turn and reset choreography", async () => {
    const scene: SceneConfig = { ...sceneFixture(), version: 6, playMode: undefined, appearancesPerBoard: undefined, findsRequiredToAdvance: undefined };
    scene.targets = scene.targets.slice(1, 4);
    const { store, stage, hit, visible, curtainOpen } = await mountPlayer({ width: 1280, height: 800 }, scene);
    const initialCamera = stage.style.transform;
    const first = visible()[0]!;
    hit(first);
    act(() => vi.advanceTimersByTime(500));
    expect(stage.style.transform).not.toBe(initialCamera);
    expect(store.getState().mission!.phase).toBe("found");
    act(() => vi.advanceTimersByTime(1700));
    expect(curtainOpen()).toBe(false);
    act(() => vi.advanceTimersByTime(560));
    act(() => vi.advanceTimersByTime(400));
    expect(store.getState().mission!.phase).toBe("searching");
    expect(store.getState().mission!.currentIndex).toBe(1);
    expect(visible()).toHaveLength(1);
    expect(visible()).not.toContain(first);
    expect(stage.style.transform).toBe(initialCamera);
    expect(curtainOpen()).toBe(true);
  });
});
