// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemoConfig } from "@/services/demo";
import { createMissionState } from "@/domain/game/mission";
import { planScenePlay } from "@/domain/game/replay";
import { SceneViewport } from "../components/SceneViewport";
import type { ViewportApi } from "../engine/useViewport";

const work = vi.hoisted(() => ({ sprite: vi.fn() }));
vi.mock("../components/ComposedSprite", async () => {
  const actual = await vi.importActual<typeof import("../components/ComposedSprite")>("../components/ComposedSprite");
  return { ComposedSprite(props: React.ComponentProps<typeof actual.ComposedSprite>) {
    work.sprite();
    return <actual.ComposedSprite {...props} />;
  } };
});

class LayoutObserver {
  static latest: LayoutObserver;
  constructor(private readonly callback: (entries: Array<{ contentRect: { width: number; height: number } }>) => void) { LayoutObserver.latest = this; }
  observe() {}
  disconnect() {}
  resize(width: number, height: number) { this.callback([{ contentRect: { width, height } }]); }
}
class LoadedImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  decode() { return Promise.resolve(); }
  removeAttribute() {}
}
const frames = new Map<number, FrameRequestCallback>();
let nextFrame = 0;

beforeEach(() => {
  work.sprite.mockClear(); frames.clear(); nextFrame = 0;
  vi.stubGlobal("React", React);
  vi.stubGlobal("ResizeObserver", LayoutObserver);
  vi.stubGlobal("Image", LoadedImage);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  window.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as never;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("static scene painting during camera work", () => {
  it("renders the legacy composed sprite once across camera frames, then renders the next hide", async () => {
    const scene = structuredClone(buildDemoConfig("en").scenes[0]!);
    scene.version = 1;
    scene.playMode = undefined;
    scene.ambient = [];
    scene.bonus = undefined;
    for (const target of scene.targets) {
      target.spriteByVariant = undefined;
      target.sprite = { kind: "composed", faceUrl: "/synthetic-face.png", bodyTemplate: "beach_float" };
    }
    const mission = { ...createMissionState(scene.slug, planScenePlay(scene, { plays: 0 }, "synthetic")), phase: "searching" as const };
    let api: ViewportApi | undefined;
    const onReady = (value: ViewportApi) => { api = value; };
    const onHit = vi.fn();
    const view = render(<SceneViewport scene={scene} mission={mission} hintLevel={0} bonusFound={false} onHit={onHit} onReady={onReady} />);
    act(() => LayoutObserver.latest.resize(1024, 768));
    await act(async () => {});
    expect(work.sprite).toHaveBeenCalledTimes(1);
    expect(view.container.querySelectorAll("[data-target]")).toHaveLength(1);
    act(() => api!.focusOn(0.5, 0.5, 2, 0));
    const viewport = view.container.querySelector(".viewport")!;
    const pointer = (type: string, x: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 300 });
      Object.defineProperty(event, "pointerId", { value: 1 });
      fireEvent(viewport, event);
    };
    pointer("pointerdown", 200);
    for (let frame = 0; frame < 30; frame += 1) {
      for (let sample = 1; sample <= 4; sample += 1) pointer("pointermove", 200 + frame * 4 + sample);
      act(() => {
        const scheduled = [...frames.values()]; frames.clear();
        for (const callback of scheduled) callback(performance.now());
      });
    }
    pointer("pointerup", 320);
    expect(work.sprite).toHaveBeenCalledTimes(1);
    expect(onHit).not.toHaveBeenCalled();
    view.rerender(<SceneViewport scene={scene} mission={{ ...mission, currentIndex: 1 }} hintLevel={0} bonusFound={false} onHit={onHit} onReady={onReady} />);
    expect(work.sprite).toHaveBeenCalledTimes(2);
    expect(view.container.querySelector("[data-target]")?.getAttribute("data-target")).toBe(mission.plan.order[1]);
  });
});
