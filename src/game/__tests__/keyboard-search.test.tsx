// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "zustand";
import { buildDemoConfig } from "@/services/demo";
import type { SceneConfig } from "@/domain/game/config";
import { getDict } from "@/i18n";
import { GameI18nProvider } from "../i18n";
import { ScenePlayer } from "../components/ScenePlayer";
import { createPlayStore } from "../store/play-store";
import { targetGeometry } from "../engine/target-geometry";
import { screenToStage, type ViewTransform } from "../engine/viewport-math";

/**
 * Finding the child without a finger.
 *
 * The board carried role="application" but could not be focused and handled no
 * keys: the tools and the hint were reachable by keyboard and the search
 * itself was not (project audit A07, 2026-09-15). The arrows walk a crosshair
 * over the picture and Enter looks where it stands — through the same
 * hit-testing a tap goes through, so nothing about what counts as a find
 * changes, and no hiding spot becomes a tab stop that gives itself away.
 */
const originalDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "decode");
class LayoutObserver {
  static latest: LayoutObserver;
  constructor(private readonly callback: (entries: Array<{ contentRect: { width: number; height: number } }>) => void) {}
  observe(target: Element) { if (target.classList.contains("viewport")) LayoutObserver.latest = this; }
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

const SIZE = { width: 1400, height: 900 };

function sceneFixture(): SceneConfig {
  const scene = structuredClone(buildDemoConfig("en").scenes[0]!);
  const source = scene.targets[0]!;
  // One child, well inside the opening view, and nothing else to tap.
  return {
    ...scene, version: 7, playMode: "find-any", appearancesPerBoard: 3, findsRequiredToAdvance: 3, intro: undefined, ambient: [], bonus: undefined,
    targets: [{ ...source, id: "hide-0", success: ["Found me!"], spriteByVariant: undefined,
      sprite: { kind: "image", url: "/synthetic-0.png", width: 512, height: 768, rect: { x: 0.44, y: 0.3, w: 0.08, h: 0.35 }, hitRect: { x: 0.46, y: 0.42, w: 0.04, h: 0.14 } } }],
  };
}

async function mountPlayer() {
  const scene = sceneFixture();
  const config = { ...buildDemoConfig("en"), scenes: [scene], worlds: undefined, world: undefined };
  config.child.avatarUrl = "";
  const store = createPlayStore(config, { readOnlyPreview: true, skipGift: true, copy: { wrongTarget: "Other", wrongTargetNoItem: "Other", bonus: "Bonus", fallbackSuccess: "Found" } });
  store.getState().openScene(scene.slug);
  function Player() {
    const state = useStore(store);
    return <GameI18nProvider locale="en">{state.mission ? <ScenePlayer scene={scene} mission={state.mission} store={state} onBack={state.goToMap} onSceneComplete={state.completeScene} /> : null}</GameI18nProvider>;
  }
  const view = render(<Player />);
  act(() => LayoutObserver.latest.resize(SIZE.width, SIZE.height));
  await act(async () => { for (const image of LoadedImage.instances) image.onload?.(); });
  act(() => vi.advanceTimersByTime(1000));
  expect(store.getState().mission!.phase).toBe("searching");
  const viewport = view.container.querySelector<HTMLElement>(".viewport")!;
  const stage = view.container.querySelector<HTMLElement>(".stage")!;
  const transform = (): ViewTransform => {
    const [, tx, ty, scale] = stage.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/)!;
    return { tx: Number(tx), ty: Number(ty), scale: Number(scale) };
  };
  const cursor = () => view.container.querySelector<HTMLElement>(".scene__cursor");
  /** Where the crosshair stands, in the picture's own coordinates. */
  const cursorAt = () => {
    const node = cursor();
    if (!node) return null;
    const point = screenToStage(transform(), parseFloat(node.style.left), parseFloat(node.style.top));
    return { x: point.x / scene.art.width, y: point.y / scene.art.height };
  };
  const press = (key: string, shiftKey = false) => act(() => { fireEvent.keyDown(viewport, { key, shiftKey }); });
  return { ...view, store, scene, viewport, transform, cursor, cursorAt, press };
}

describe("searching the board with a keyboard", () => {
  it("is reachable, and says how", async () => {
    const player = await mountPlayer();
    expect(player.viewport.getAttribute("tabindex")).toBe("0");
    const describedBy = player.viewport.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)?.textContent).toBe(getDict("en").game.scene.keyboardHint);
  });

  it("places the marker in the middle of what is on screen, and the first press does not tap", async () => {
    const player = await mountPlayer();
    expect(player.cursor()).toBeNull();

    player.press("Enter");

    const at = player.cursorAt()!;
    expect(at.x).toBeCloseTo(0.5, 1);
    expect(at.y).toBeCloseTo(0.5, 1);
    // Placing is not looking: nothing was found, and no mission progress moved.
    expect(Object.keys(player.store.getState().mission!.found)).toHaveLength(0);
  });

  it("walks a constant distance on screen, further with Shift, and never off the picture", async () => {
    const player = await mountPlayer();
    player.press("Enter");
    const start = player.cursorAt()!;
    const scale = player.transform().scale;

    player.press("ArrowRight");
    const oneStep = player.cursorAt()!;
    expect((oneStep.x - start.x) * player.scene.art.width * scale).toBeCloseTo(24, 0);
    expect(oneStep.y).toBeCloseTo(start.y, 5);

    player.press("ArrowRight", true);
    expect((player.cursorAt()!.x - oneStep.x) * player.scene.art.width * scale).toBeCloseTo(96, 0);

    for (let i = 0; i < 40; i++) player.press("ArrowUp", true);
    expect(player.cursorAt()!.y).toBe(0);
  });

  it("finds the child when Enter is pressed where she stands", async () => {
    const player = await mountPlayer();
    const target = player.scene.targets[0]!;
    const { center } = targetGeometry(player.scene, target, player.store.getState().mission!.plan.variants[target.id] ?? "A");
    player.press("Enter");

    // Walk to her, one step at a time, the way a child would.
    const stepX = 24 / (player.scene.art.width * player.transform().scale);
    const stepY = 24 / (player.scene.art.height * player.transform().scale);
    for (let guard = 0; guard < 400; guard++) {
      const at = player.cursorAt()!;
      const dx = center.x - at.x;
      const dy = center.y - at.y;
      if (Math.abs(dx) < stepX && Math.abs(dy) < stepY) break;
      if (Math.abs(dx) >= stepX) player.press(dx > 0 ? "ArrowRight" : "ArrowLeft");
      else player.press(dy > 0 ? "ArrowDown" : "ArrowUp");
    }

    player.press("Enter");
    act(() => vi.advanceTimersByTime(50));

    expect(Object.keys(player.store.getState().mission!.found)).toEqual(["hide-0"]);
  });

  it("puts the marker away on Escape and when the picture loses focus", async () => {
    const player = await mountPlayer();
    player.press("Enter");
    expect(player.cursor()).not.toBeNull();

    player.press("Escape");
    expect(player.cursor()).toBeNull();

    player.press("Enter");
    expect(player.cursor()).not.toBeNull();
    act(() => { fireEvent.blur(player.viewport); });
    expect(player.cursor()).toBeNull();
  });
});
