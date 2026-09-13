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
import { sounds } from "../audio/sounds";

const originalDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "decode");
function mountedDecode(decode: (image: HTMLImageElement) => Promise<void>) {
  Object.defineProperty(HTMLImageElement.prototype, "decode", { configurable: true, value: function(this: HTMLImageElement) { return decode(this); } });
}

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
afterEach(() => {
  cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  if (originalDecode) Object.defineProperty(HTMLImageElement.prototype, "decode", originalDecode);
  else Reflect.deleteProperty(HTMLImageElement.prototype, "decode");
});

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

async function mountPlayer(size: { width: number; height: number }, scene = sceneFixture(), saved: string[] = [], expectStarted = true) {
  const config = { ...buildDemoConfig("en"), scenes: [scene], worlds: undefined, world: undefined };
  config.child.avatarUrl = "";
  const store = createPlayStore(config, { readOnlyPreview: true, skipGift: true,
    copy: { wrongTarget: "Other", wrongTargetNoItem: "Other", bonus: "Bonus", fallbackSuccess: "Found" } });
  if (saved.length) store.setState({ progress: parseProgress(JSON.stringify({
    v: 1, gameId: config.gameId, revealed: true,
    scenes: { [scene.slug]: { sceneVersion: scene.version, foundTargetIds: saved } },
  }), config.gameId) });
  store.getState().openScene(scene.slug);
  function Player() { const state = useStore(store); return <GameI18nProvider locale="en">{state.mission ? <ScenePlayer scene={scene} mission={state.mission} store={state} onBack={state.goToMap} onSceneComplete={state.completeScene} /> : null}</GameI18nProvider>; }
  const view = render(<Player />);
  act(() => LayoutObserver.latest.resize(size.width, size.height));
  await act(async () => { for (const image of LoadedImage.instances) image.onload?.(); });
  act(() => vi.advanceTimersByTime(1000));
  if (expectStarted) expect(store.getState().mission!.phase).toBe("searching");
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
  it.each([{ width: 1280, height: 800 }, { width: 320, height: 650 }])("awards once, then lights one gold star only when its real flight lands at $width×$height", async size => {
    const player = await mountPlayer(size);
    const star = player.container.querySelector(".mission__stars .stars__slot")!;
    vi.spyOn(star, "getBoundingClientRect").mockReturnValue({ x: 180, y: 30, left: 180, top: 30, right: 204, bottom: 54, width: 24, height: 24, toJSON() {} });
    const lit = () => player.container.querySelectorAll(".mission__stars .is-lit").length;
    const play = vi.spyOn(sounds(), "play");
    expect(lit()).toBe(0);
    player.hit(player.visible()[0]!);
    const saved = player.store.getState().progress;
    expect(saved.scenes[player.scene.slug]!.foundTargetIds).toHaveLength(1);
    expect(lit()).toBe(0); // Neither an early award nor the old 1→0 blink.
    act(() => vi.advanceTimersByTime(349));
    expect(lit()).toBe(0); expect(player.container.querySelector(".starfly")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(player.container.querySelector(".starfly")).not.toBeNull(); expect(lit()).toBe(0);
    act(() => vi.advanceTimersByTime(849));
    expect(lit()).toBe(0);
    act(() => vi.advanceTimersByTime(1));
    expect(player.container.querySelector(".starfly")).toBeNull(); expect(lit()).toBe(1);
    expect(play.mock.calls.filter(([cue]) => cue === "star")).toHaveLength(1);
    expect(player.store.getState().progress).toBe(saved);
    act(() => vi.advanceTimersByTime(1000 + 560 + 160));
    expect(lit()).toBe(1); expect(player.visible()).toHaveLength(1);
    expect(player.store.getState().progress).toBe(saved);
  });

  it("restores a saved star without replaying its flight and cancels an in-flight landing when leaving", async () => {
    const player = await mountPlayer({ width: 390, height: 650 }, sceneFixture(), ["hide-1", "hide-3"]);
    const slots = player.container.querySelectorAll(".mission__stars .stars__slot");
    vi.spyOn(slots[2]!, "getBoundingClientRect").mockReturnValue({ x: 180, y: 30, left: 180, top: 30, right: 204, bottom: 54, width: 24, height: 24, toJSON() {} });
    const play = vi.spyOn(sounds(), "play");
    expect(player.container.querySelectorAll(".mission__stars .is-lit")).toHaveLength(2);
    expect(player.container.querySelector(".starfly")).toBeNull();
    player.hit(player.visible()[0]!);
    act(() => vi.advanceTimersByTime(350));
    expect(player.container.querySelector(".starfly")).not.toBeNull();
    const savedIds = player.store.getState().progress.scenes[player.scene.slug]!.foundTargetIds!;
    player.unmount();
    act(() => vi.advanceTimersByTime(3000));
    expect(play.mock.calls.filter(([cue]) => cue === "star")).toHaveLength(0);
    const resumed = await mountPlayer({ width: 390, height: 650 }, sceneFixture(), savedIds);
    expect(resumed.container.querySelectorAll(".mission__stars .is-lit")).toHaveLength(3);
    expect(resumed.container.querySelector(".starfly")).toBeNull();
  });

  it.each([false, true])("a skipped flight still lands its star without changing saved progress (reduced motion=%s)", async reduced => {
    const player = await mountPlayer({ width: 320, height: 650 });
    window.matchMedia = (() => ({ matches: reduced, addEventListener() {}, removeEventListener() {} })) as never;
    if (reduced) vi.spyOn(player.container.querySelector(".mission__stars .stars__slot")!, "getBoundingClientRect")
      .mockReturnValue({ x: 180, y: 30, left: 180, top: 30, right: 204, bottom: 54, width: 24, height: 24, toJSON() {} });
    // No mocked tray geometry in the other case: a missing layout is not a lost star.
    player.hit(player.visible()[0]!);
    const saved = player.store.getState().progress;
    act(() => vi.advanceTimersByTime(350));
    expect(player.container.querySelector(".starfly")).toBeNull();
    expect(player.container.querySelectorAll(".mission__stars .is-lit")).toHaveLength(1);
    expect(player.store.getState().progress).toBe(saved);
  });

  it("the final board names its actual adventure-bag destination after three, without claiming another place exists", async () => {
    const player = await mountPlayer({ width: 390, height: 650 }, sceneFixture(), ["hide-0", "hide-1", "hide-2"]);
    const button = player.container.querySelector<HTMLButtonElement>(".mission__continue")!;
    expect(button.textContent).toContain("To the adventure bag");
    expect(button.textContent).not.toContain("next place");
    const saved = player.store.getState().progress;
    fireEvent.click(button);
    expect(player.store.getState().screen).toBe("passport");
    expect(player.store.getState().progress).toBe(saved);
  });

  it("does not expose a cold mounted image before decode, even after off-DOM preloads finish and the phone resizes", async () => {
    const ready: Array<() => void> = [];
    mountedDecode(() => new Promise<void>(resolve => ready.push(resolve)));
    const player = await mountPlayer({ width: 390, height: 650 }, sceneFixture(), [], false);
    expect(LoadedImage.instances.length).toBeGreaterThanOrEqual(6);
    expect(player.curtainOpen()).toBe(false);
    expect(player.store.getState().mission!.phase).toBe("intro");
    act(() => LayoutObserver.latest.resize(390, 720));
    const camera = player.stage.style.transform;
    act(() => vi.advanceTimersByTime(1500));
    expect(player.curtainOpen()).toBe(false);
    await act(async () => ready.forEach(resolve => resolve()));
    expect(player.curtainOpen()).toBe(true);
    act(() => vi.advanceTimersByTime(1000));
    expect(player.stage.style.transform).toBe(camera);
    expect(player.store.getState().mission!.phase).toBe("searching");
    expect(player.visible()).toHaveLength(1);
  });

  it("samples an initial layout change before opening even when its resize notification has not arrived", async () => {
    const ready: Array<() => void> = [];
    mountedDecode(() => new Promise<void>(resolve => ready.push(resolve)));
    const player = await mountPlayer({ width: 390, height: 650 }, sceneFixture(), [], false);
    const oldCamera = player.stage.style.transform;
    // Mobile browser chrome changed the actual box; ResizeObserver is pending.
    vi.spyOn(player.viewport, "getBoundingClientRect").mockReturnValue({
      width: 390, height: 720, x: 0, y: 0, top: 0, left: 0, right: 390, bottom: 720, toJSON() {},
    });
    expect(player.curtainOpen()).toBe(false);
    await act(async () => ready.forEach(resolve => resolve()));
    const fitted = player.stage.style.transform;
    expect(fitted).not.toBe(oldCamera);
    expect(player.curtainOpen()).toBe(true);
    act(() => LayoutObserver.latest.resize(390, 720));
    act(() => vi.advanceTimersByTime(1000));
    expect(player.stage.style.transform).toBe(fitted);
    expect(player.store.getState().mission!.phase).toBe("searching");
  });

  it("holds the covered swap for the actual next sprite decode and a quiet resized viewport, without awarding another star", async () => {
    let slowUrl = ""; let decodeReady: (() => void) | undefined;
    mountedDecode(image => image.getAttribute("src") === slowUrl ? new Promise<void>(resolve => { decodeReady = resolve; }) : Promise.resolve());
    const player = await mountPlayer({ width: 390, height: 650 });
    const first = player.visible()[0]!;
    const next = player.store.getState().mission!.plan.order.find(id => id !== first)!;
    slowUrl = `/synthetic-${next.slice(-1)}.png`;
    player.hit(first);
    act(() => vi.advanceTimersByTime(2200));
    await act(async () => vi.advanceTimersByTime(560));
    expect(player.visible()).toEqual([next]);
    expect(decodeReady).toBeTypeOf("function");
    const progress = player.store.getState().progress;
    act(() => vi.advanceTimersByTime(1200));
    expect(player.curtainOpen()).toBe(false); // Old fixed160ms timer opened here.
    player.hit(next);
    expect(player.store.getState().progress).toBe(progress);
    await act(async () => decodeReady!());
    act(() => vi.advanceTimersByTime(100));
    act(() => LayoutObserver.latest.resize(390, 720));
    const fitted = player.stage.style.transform;
    act(() => vi.advanceTimersByTime(159));
    expect(player.curtainOpen()).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(player.curtainOpen()).toBe(true);
    act(() => LayoutObserver.latest.resize(390, 720));
    act(() => vi.advanceTimersByTime(1000));
    expect(player.stage.style.transform).toBe(fitted);
    expect(player.store.getState().progress).toBe(progress);
    expect(player.visible()).toEqual([next]);
  });

  it("keeps a failed mounted decode behind the retry screen until an explicit successful retry", async () => {
    let rejectDecode: ((reason: Error) => void) | undefined;
    mountedDecode(() => new Promise<void>((_resolve, reject) => { rejectDecode = reject; }));
    const player = await mountPlayer({ width: 390, height: 650 }, sceneFixture(), [], false);
    await act(async () => rejectDecode!(new Error("cold decode failed")));
    expect(player.container.querySelector(".scene__retry")).not.toBeNull();
    expect(player.curtainOpen()).toBe(false);
    mountedDecode(() => Promise.resolve());
    await act(async () => fireEvent.click(player.container.querySelector(".scene__retry-card button")!));
    await act(async () => { for (const image of LoadedImage.instances) image.onload?.(); });
    act(() => vi.advanceTimersByTime(1000));
    expect(player.container.querySelector(".scene__retry")).toBeNull();
    expect(player.curtainOpen()).toBe(true);
    expect(player.store.getState().mission!.phase).toBe("searching");
  });

  it("ignores a timed-out image's late resolution while a new decode is still pending", async () => {
    const oldReady: Array<() => void> = [], newReady: Array<() => void> = [];
    mountedDecode(() => new Promise<void>(resolve => oldReady.push(resolve)));
    const player = await mountPlayer({ width: 390, height: 650 }, sceneFixture(), [], false);
    act(() => vi.advanceTimersByTime(20_000));
    expect(player.container.querySelector(".scene__retry")).not.toBeNull();
    mountedDecode(() => new Promise<void>(resolve => newReady.push(resolve)));
    await act(async () => fireEvent.click(player.container.querySelector(".scene__retry-card button")!));
    await act(async () => { for (const image of LoadedImage.instances) image.onload?.(); oldReady.forEach(resolve => resolve()); });
    expect(player.curtainOpen()).toBe(false);
    expect(player.store.getState().mission!.phase).toBe("intro");
    await act(async () => newReady.forEach(resolve => resolve()));
    expect(player.curtainOpen()).toBe(true);
  });

  it("does not flash the clouds or decode the unchanged board again when the fifth child disappears", async () => {
    const decode = vi.fn(() => Promise.resolve());
    mountedDecode(decode);
    const scene = sceneFixture();
    const saved = scene.targets.slice(0, 4).map(target => target.id);
    const player = await mountPlayer({ width: 390, height: 650 }, scene, saved);
    expect(decode).toHaveBeenCalledTimes(2); // Actual mounted board and last child.
    player.hit(player.visible()[0]!);
    await act(async () => vi.advanceTimersByTime(2200));
    expect(player.visible()).toEqual([]);
    expect(player.curtainOpen()).toBe(true);
    expect(decode).toHaveBeenCalledTimes(2);
    expect(player.store.getState().mission!.phase).toBe("complete");
    expect(player.store.getState().progress.scenes[scene.slug]!.foundTargetIds).toHaveLength(5);
  });

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
