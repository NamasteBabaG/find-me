// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "zustand";
import type { MissionCopy } from "@/domain/game/mission";
import { HINT_PULSE_AFTER_MS } from "@/domain/game/hints";
import { CelebrationOverlay } from "../components/CelebrationOverlay";
import { ScenePlayer } from "../components/ScenePlayer";
import { GameI18nProvider } from "../i18n";
import { createPlayStore } from "../store/play-store";
import { publicBeachDemo } from "../../../content/demo/beach-v1";

/**
 * Work a board does while nobody touches it. On a slow tablet every render of the board is time taken from the
 * next drag frame (measured 2026-10-06), so an idle board renders only when something on it changes.
 */
const work = vi.hoisted(() => ({ missionCard: 0 }));
vi.mock("../components/MissionCard", async () => {
  const actual = await vi.importActual<typeof import("../components/MissionCard")>("../components/MissionCard");
  return { MissionCard(props: React.ComponentProps<typeof actual.MissionCard>) { work.missionCard += 1; return <actual.MissionCard {...props} />; } };
});
const rig = vi.hoisted(() => ({ viewport: { transform: { tx: 0, ty: 0, scale: 0.2 }, live() { return this.transform; }, viewport: { width: 1024, height: 768 }, fit: 0.2, isDragging: false, bind: {}, reset: () => {}, focusOn: () => {}, zoomBy: () => {} } }));
vi.mock("../engine/useViewport", () => ({ useViewport: () => rig.viewport }));
vi.mock("next/image", () => ({ default: ({ unoptimized: _u, fill: _f, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean; fill?: boolean }) => <img {...props} alt="" /> }));
const copy: MissionCopy = { successByTarget: {}, itemByTarget: {}, wrongTarget: "Other", wrongTargetNoItem: "Other", bonus: "Bonus", fallbackSuccess: "Found" };

class LoadedImage {
  static instances: LoadedImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  decode() { return Promise.resolve(); }
  removeAttribute() {}
  constructor() { LoadedImage.instances.push(this); }
}

beforeEach(() => {
  work.missionCard = 0; LoadedImage.instances = [];
  vi.stubGlobal("React", React); vi.stubGlobal("Image", LoadedImage);
  vi.useFakeTimers();
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never;
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("an idle board", () => {
  it("does not re-render every second, and still lights the hint once the search has gone on long enough", async () => {
    const config = publicBeachDemo("en"), scene = config.scenes[0]!;
    const store = createPlayStore(config, { copy, readOnlyPreview: true, skipGift: true });
    store.getState().openScene(scene.slug);
    store.getState().dispatch({ type: "START", now: Date.now() });
    function Player() { const state = useStore(store); return <GameI18nProvider locale="en"><ScenePlayer scene={scene} mission={state.mission!} store={state} onBack={state.goToMap} onSceneComplete={state.completeScene} /></GameI18nProvider>; }
    const view = render(<Player />);
    await act(async () => { for (const image of LoadedImage.instances) image.onload?.(); });
    // Past the curtain, the HUD's quiet fold and every other opening timer.
    act(() => vi.advanceTimersByTime(8000));
    const settled = work.missionCard;
    const hint = view.container.querySelector(".mission__hintbtn")!;
    expect(hint.classList.contains("mission__hintbtn--pulse")).toBe(false);
    // One second at a time, as a clock would tick (a single act would batch eleven ticks into one render).
    for (let second = 8; second < 19; second += 1) act(() => vi.advanceTimersByTime(1000));
    act(() => vi.advanceTimersByTime(HINT_PULSE_AFTER_MS - 19_000 - 50));
    expect(work.missionCard).toBe(settled); // eleven quiet seconds, no renders
    expect(hint.classList.contains("mission__hintbtn--pulse")).toBe(false);
    act(() => vi.advanceTimersByTime(100));
    expect(view.container.querySelector(".mission__hintbtn")!.classList.contains("mission__hintbtn--pulse")).toBe(true);
    store.getState().stopAlbumSync?.();
  });
});

describe("the confetti of a find", () => {
  it("is gone once its last piece has fallen, and a new find brings a new burst", () => {
    const view = render(<CelebrationOverlay kind="confetti" small seed={7} key={7} />);
    expect(view.container.querySelectorAll(".celebration__s").length).toBe(70);
    // A small burst's slowest piece: up to 450ms late and 2600ms long.
    act(() => vi.advanceTimersByTime(2600));
    expect(view.container.querySelector(".celebration")).not.toBeNull();
    act(() => vi.advanceTimersByTime(1000));
    expect(view.container.querySelector(".celebration")).toBeNull();
    view.rerender(<CelebrationOverlay kind="confetti" small seed={8} key={8} />);
    expect(view.container.querySelectorAll(".celebration__s").length).toBe(70);
  });

  it("moves its pieces with no animation starting or ending inside its life, so no frame wakes the main thread", () => {
    // React listens for animation events at its root: every start, iteration or end of a piece's animation would
    // wake the main thread. Every animation must start as the burst mounts and outlast the overlay.
    const calls: { duration: number; delay: number; frames: number }[] = [];
    let cancelled = 0;
    const proto = Element.prototype as { animate?: Element["animate"] };
    const original = proto.animate;
    proto.animate = function (keyframes: Keyframe[] | PropertyIndexedKeyframes | null, options?: number | KeyframeAnimationOptions) {
      const o = typeof options === "object" ? options : {};
      calls.push({ duration: Number(o.duration), delay: Number(o.delay ?? 0), frames: Array.isArray(keyframes) ? keyframes.length : 0 });
      return { cancel: () => { cancelled += 1; } } as unknown as Animation;
    };
    try {
      const view = render(<CelebrationOverlay kind="confetti" small seed={7} key={7} />);
      expect(calls.length).toBe(70 * 3);
      // The fall runs exactly the burst's life (every piece's delay is held inside its keyframes).
      const falls = calls.filter((_, i) => i % 3 === 1);
      const life = falls[0]!.duration;
      expect(falls.every(f => f.duration === life && f.delay === 0 && f.frames === 4)).toBe(true);
      for (const call of calls) {
        expect(call.delay).toBeLessThanOrEqual(0);
        expect(call.delay + call.duration).toBeGreaterThanOrEqual(life);
      }
      act(() => vi.advanceTimersByTime(life - 1));
      expect(view.container.querySelector(".celebration")).not.toBeNull();
      act(() => vi.advanceTimersByTime(1));
      expect(view.container.querySelector(".celebration")).toBeNull();
      expect(cancelled).toBe(70 * 3);
    } finally {
      if (original) proto.animate = original; else delete proto.animate;
    }
  });
});
