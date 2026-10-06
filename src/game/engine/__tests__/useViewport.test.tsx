// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useViewport } from "../useViewport";
import { stageToScreen } from "../viewport-math";

/**
 * The bug an auditor reproduced by turning a phone sideways mid-mission: the
 * scene player keeps the camera API it was handed at first layout, and after a
 * resize every method on that object still centred on the old screen — so the
 * third hint pointed the camera at a child who was off the edge of the picture.
 *
 * The hook is exercised for real (jsdom, a fake ResizeObserver), because the
 * defect lived in React closures and no amount of testing the maths alone
 * would have caught it.
 */
class FakeResizeObserver {
  static latest: FakeResizeObserver | null = null;
  constructor(private readonly cb: (entries: Array<{ contentRect: { width: number; height: number } }>) => void) {
    FakeResizeObserver.latest = this;
  }
  observe() {}
  disconnect() {}
  resize(width: number, height: number) {
    this.cb([{ contentRect: { width, height } }]);
  }
}

const STAGE = { width: 3072, height: 2048 };
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;

function flushFrame() {
  act(() => {
    const scheduled = [...frames.values()];
    frames.clear();
    for (const callback of scheduled) callback(performance.now());
  });
}

function mount(onTap: (nx: number, ny: number) => void = () => {}) {
  return renderHook(() => {
    const ref = useRef<HTMLDivElement | null>(document.createElement("div"));
    return useViewport(ref, STAGE, onTap);
  });
}

beforeEach(() => {
  frames.clear();
  frameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver as never;
  window.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as never;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function pointer(pointerId: number, clientX: number, clientY: number) {
  return { pointerId, clientX, clientY, currentTarget: document.createElement("div") } as ReactPointerEvent<HTMLDivElement>;
}

describe("active camera gestures", () => {
  it("publishes 120 pointer samples once per frame while keeping hit coordinates live", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      const ref = useRef<HTMLDivElement | null>(document.createElement("div"));
      return useViewport(ref, STAGE, () => {});
    });
    act(() => FakeResizeObserver.latest!.resize(390, 650));
    const initial = result.current.transform;
    act(() => result.current.bind.onPointerDown(pointer(1, 180, 300)));
    const before = renders;
    for (let x = 181; x <= 300; x += 1) act(() => result.current.bind.onPointerMove(pointer(1, x, 300)));
    expect(renders - before).toBe(1); // The gesture starts; camera publications wait.
    expect(frames.size).toBe(1);
    const hit = result.current.toNormalized(300, 300)!;
    expect(hit.x).toBeCloseTo((300 - initial.tx - 120) / initial.scale / STAGE.width);
    flushFrame();
    expect(renders - before).toBe(2);
    expect(result.current.transform.tx).toBeCloseTo(initial.tx + 120);
    expect(frames.size).toBe(0);
  });

  it("does not render or schedule frames for repeated input against a clamped edge", () => {
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      const ref = useRef<HTMLDivElement | null>(document.createElement("div"));
      return useViewport(ref, STAGE, () => {});
    });
    act(() => FakeResizeObserver.latest!.resize(390, 650));
    act(() => result.current.bind.onPointerDown(pointer(1, 180, 300)));
    act(() => result.current.bind.onPointerMove(pointer(1, -1000, 300)));
    flushFrame();
    const before = renders;
    const edge = result.current.transform;
    for (let x = -1001; x >= -1120; x -= 1) act(() => result.current.bind.onPointerMove(pointer(1, x, 300)));
    expect(renders).toBe(before);
    expect(frames.size).toBe(0);
    expect(result.current.transform).toBe(edge);
  });

  it("flushes the final pan on release and cancels a pending frame on resize or unmount", () => {
    const { result, unmount } = mount();
    act(() => FakeResizeObserver.latest!.resize(390, 650));
    const initial = result.current.transform;
    act(() => result.current.bind.onPointerDown(pointer(1, 180, 300)));
    act(() => result.current.bind.onPointerMove(pointer(1, 200, 300)));
    expect(frames.size).toBe(1);
    act(() => result.current.bind.onPointerUp(pointer(1, 200, 300)));
    expect(frames.size).toBe(0);
    expect(result.current.transform.tx).toBeCloseTo(initial.tx + 20);

    act(() => result.current.bind.onPointerDown(pointer(2, 180, 300)));
    act(() => result.current.bind.onPointerMove(pointer(2, 200, 300)));
    act(() => FakeResizeObserver.latest!.resize(844, 330));
    expect(frames.size).toBe(0);
    const resized = result.current.transform;
    flushFrame();
    expect(result.current.transform).toBe(resized);

    act(() => result.current.bind.onPointerDown(pointer(3, 180, 150)));
    act(() => result.current.bind.onPointerMove(pointer(3, 180, 170)));
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
  });

  it("keeps taps and small motion quiet, starts pan at the existing slop and ends on release", () => {
    const tap = vi.fn(), { result } = mount(tap);
    act(() => FakeResizeObserver.latest!.resize(390, 650));
    const clock = vi.spyOn(performance, "now").mockReturnValue(1000);
    act(() => result.current.bind.onPointerDown(pointer(1, 180, 300)));
    act(() => result.current.bind.onPointerMove(pointer(1, 185, 300)));
    expect(result.current.isDragging).toBe(false);
    const hit = result.current.toNormalized(185, 300)!;
    clock.mockReturnValue(1050);
    act(() => result.current.bind.onPointerUp(pointer(1, 185, 300)));
    expect(tap).toHaveBeenCalledExactlyOnceWith(hit.x, hit.y);

    act(() => result.current.bind.onPointerDown(pointer(2, 180, 300)));
    const initial = result.current.transform;
    act(() => result.current.bind.onPointerMove(pointer(2, 189, 300)));
    flushFrame();
    expect(result.current.isDragging).toBe(true);
    expect(result.current.transform.tx).toBeCloseTo(initial.tx + 9);
    act(() => result.current.bind.onPointerUp(pointer(2, 189, 300)));
    expect(result.current.isDragging).toBe(false);
    expect(tap).toHaveBeenCalledTimes(1);
  });

  it("reports pinch immediately and keeps the remaining finger's pan active without a camera jump or tap", () => {
    const tap = vi.fn(), { result } = mount(tap);
    act(() => FakeResizeObserver.latest!.resize(390, 650));
    const fitted = result.current.transform;
    act(() => result.current.bind.onPointerDown(pointer(1, 100, 300)));
    expect(result.current.isDragging).toBe(false);
    act(() => result.current.bind.onPointerDown(pointer(2, 300, 300)));
    expect(result.current.isDragging).toBe(true);
    expect(result.current.transform).toBe(fitted);
    act(() => result.current.bind.onPointerMove(pointer(2, 350, 300)));
    flushFrame();
    expect(result.current.transform.scale).toBeCloseTo(fitted.scale * 1.25);
    const pinched = result.current.transform;
    act(() => result.current.bind.onPointerUp(pointer(2, 350, 300)));
    expect(result.current.isDragging).toBe(true);
    expect(result.current.transform).toBe(pinched);
    act(() => result.current.bind.onPointerMove(pointer(1, 112, 300)));
    flushFrame();
    expect(result.current.transform.scale).toBe(pinched.scale);
    expect(result.current.transform.tx).toBeCloseTo(pinched.tx + 12);
    act(() => result.current.bind.onPointerUp(pointer(1, 112, 300)));
    expect(result.current.isDragging).toBe(false);
    expect(tap).not.toHaveBeenCalled();
  });

  it("keeps a cancelled pinch's remaining finger active and clears state after that finger ends", () => {
    const tap = vi.fn(), { result } = mount(tap);
    act(() => FakeResizeObserver.latest!.resize(390, 650));
    act(() => result.current.bind.onPointerDown(pointer(1, 100, 300)));
    act(() => result.current.bind.onPointerDown(pointer(2, 300, 300)));
    act(() => result.current.bind.onPointerCancel(pointer(2, 300, 300)));
    expect(result.current.isDragging).toBe(true);
    act(() => result.current.bind.onPointerUp(pointer(1, 100, 300)));
    expect(result.current.isDragging).toBe(false);
    expect(tap).not.toHaveBeenCalled();
  });

  it.each(["cancel", "capture loss"])("clears an interrupted pan on %s without interpreting a later release as a tap", reason => {
    const tap = vi.fn(), { result } = mount(tap);
    act(() => FakeResizeObserver.latest!.resize(390, 650));
    act(() => result.current.bind.onPointerDown(pointer(1, 180, 300)));
    act(() => result.current.bind.onPointerMove(pointer(1, 210, 300)));
    flushFrame();
    expect(result.current.isDragging).toBe(true);
    const camera = result.current.transform;
    act(() => {
      if (reason === "cancel") result.current.bind.onPointerCancel(pointer(1, 210, 300));
      else result.current.bind.onLostPointerCapture!(pointer(1, 210, 300));
    });
    expect(result.current.isDragging).toBe(false);
    expect(result.current.transform).toBe(camera);
    act(() => result.current.bind.onPointerUp(pointer(1, 210, 300)));
    expect(tap).not.toHaveBeenCalled();
  });

  it("invalidates a pinch on resize, ignores stale pointers and starts a fresh pan normally", () => {
    const tap = vi.fn(), { result } = mount(tap);
    act(() => FakeResizeObserver.latest!.resize(390, 650));
    act(() => result.current.bind.onPointerDown(pointer(1, 100, 300)));
    act(() => result.current.bind.onPointerDown(pointer(2, 300, 300)));
    expect(result.current.isDragging).toBe(true);
    act(() => FakeResizeObserver.latest!.resize(844, 330));
    expect(result.current.isDragging).toBe(false);
    const resized = result.current.transform;
    act(() => {
      result.current.bind.onPointerMove(pointer(1, 120, 300));
      result.current.bind.onPointerUp(pointer(1, 120, 300));
      result.current.bind.onPointerUp(pointer(2, 300, 300));
    });
    expect(result.current.transform).toBe(resized);
    expect(tap).not.toHaveBeenCalled();
    act(() => result.current.bind.onPointerDown(pointer(3, 180, 150)));
    act(() => result.current.bind.onPointerMove(pointer(3, 180, 175)));
    expect(result.current.isDragging).toBe(true);
    act(() => result.current.bind.onPointerUp(pointer(3, 180, 175)));
    expect(result.current.isDragging).toBe(false);
    expect(tap).not.toHaveBeenCalled();
  });

  it("paints gesture frames through onFrame without React while nothing follows the camera, and publishes on release", () => {
    let renders = 0, following = false;
    const painted: number[] = [];
    const { result } = renderHook(() => {
      renders += 1;
      const ref = useRef<HTMLDivElement | null>(document.createElement("div"));
      return useViewport(ref, STAGE, () => {}, { onFrame: t => painted.push(t.tx), liveState: () => following });
    });
    act(() => FakeResizeObserver.latest!.resize(390, 650));
    const initial = result.current.transform;
    act(() => result.current.bind.onPointerDown(pointer(1, 180, 300)));
    act(() => result.current.bind.onPointerMove(pointer(1, 200, 300))); // past the slop: the gesture starts
    const before = renders;
    painted.length = 0;
    for (let frame = 1; frame <= 10; frame += 1) {
      for (let sample = 1; sample <= 4; sample += 1) act(() => result.current.bind.onPointerMove(pointer(1, 200 + frame * 8 + sample, 300)));
      flushFrame();
    }
    // One paint per frame, at the latest position, and no React work at all.
    expect(painted).toHaveLength(10);
    expect(painted.at(-1)).toBeCloseTo(initial.tx + 104);
    expect(renders).toBe(before);
    expect(result.current.live().tx).toBeCloseTo(initial.tx + 104);
    expect(result.current.toNormalized(300, 300)!.x).toBeCloseTo((300 - initial.tx - 104) / initial.scale / STAGE.width);
    // Something starts following the camera: React sees the next frame too.
    following = true;
    act(() => result.current.bind.onPointerMove(pointer(1, 310, 300)));
    flushFrame();
    expect(renders).toBe(before + 1);
    following = false;
    act(() => result.current.bind.onPointerMove(pointer(1, 320, 300)));
    flushFrame();
    expect(renders).toBe(before + 1);
    // Release always catches React up to where the stage is.
    act(() => result.current.bind.onPointerUp(pointer(1, 320, 300)));
    expect(result.current.transform.tx).toBeCloseTo(initial.tx + 140);
    expect(result.current.transform).toBe(result.current.live());
  });
});

describe("the viewport after a resize", () => {
  it.each([[1440, 900], [1024, 768], [390, 844], [844, 330], [720, 405]])("never pans beyond board edges at %sx%s, including zoom and hints", (width, height) => {
    const { result } = mount();
    act(() => FakeResizeObserver.latest!.resize(width, height));
    const bounded = () => {
      const { scale, tx, ty } = result.current.transform;
      const w = STAGE.width * scale, h = STAGE.height * scale;
      if (w <= width) expect(tx).toBeCloseTo((width - w) / 2);
      else { expect(tx).toBeLessThanOrEqual(0.001); expect(tx + w).toBeGreaterThanOrEqual(width - 0.001); }
      if (h <= height) expect(ty).toBeCloseTo((height - h) / 2);
      else { expect(ty).toBeLessThanOrEqual(0.001); expect(ty + h).toBeGreaterThanOrEqual(height - 0.001); }
    };
    for (const zoom of [1, 2, 4, 0.1]) for (const [x, y] of [[0, 0], [1, 1], [-5, 10]]) {
      act(() => result.current.focusOn(x!, y!, zoom, 0)); bounded();
      act(() => result.current.animateTo({ scale: result.current.transform.scale, tx: 100000, ty: -100000 }, 0)); bounded();
    }
    act(() => result.current.reset(0)); bounded();
  });
  it("fits the actual layout during a covered reset before a delayed ResizeObserver notification", () => {
    const { result } = mount();
    act(() => FakeResizeObserver.latest!.resize(390, 650));
    act(() => result.current.zoomBy(2));
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 844, height: 330 } as DOMRect);
    act(() => result.current.reset(0));
    expect(result.current.viewport).toEqual({ width: 844, height: 330 });
    expect(result.current.transform.scale).toBeCloseTo(844 / STAGE.width);
    const fitted = result.current.transform;
    // The notification arriving after cloud-open must not move the board again.
    act(() => FakeResizeObserver.latest!.resize(844, 330));
    expect(result.current.transform).toBe(fitted);
  });

  it("fills a tall portrait search window and refits to landscape without retaining excessive zoom", () => {
    const { result } = mount();
    act(() => FakeResizeObserver.latest!.resize(390, 650));
    expect(result.current.transform.scale).toBeCloseTo(650 / 2048);
    expect(STAGE.width * result.current.transform.scale).toBeGreaterThan(390);
    act(() => FakeResizeObserver.latest!.resize(844, 330));
    expect(result.current.transform.scale).toBeCloseTo(844 / 3072);
    expect(STAGE.width * result.current.transform.scale).toBeCloseTo(844);
    act(() => FakeResizeObserver.latest!.resize(390, 650));
    expect(result.current.transform.scale).toBeCloseTo(650 / 2048);
  });
  it("a focusOn captured on a wide screen still centres the target on the narrow one", () => {
    const { result } = mount();
    act(() => FakeResizeObserver.latest!.resize(1280, 720));
    // What ScenePlayer does: keep the API object from first layout.
    const captured = result.current;
    expect(captured.viewport).toEqual({ width: 1280, height: 720 });

    act(() => FakeResizeObserver.latest!.resize(390, 844));
    act(() => captured.focusOn(0.5, 0.5, 1.8, 0));

    const t = result.current.transform;
    const on = stageToScreen(t, 0.5 * STAGE.width, 0.5 * STAGE.height);
    // Inside the phone screen, and in fact at its centre — not at the centre
    // of the 1280px screen that is gone.
    expect(on.x).toBeGreaterThanOrEqual(0);
    expect(on.x).toBeLessThanOrEqual(390);
    expect(Math.abs(on.x - 195)).toBeLessThan(2);
    expect(Math.abs(on.y - 422)).toBeLessThan(2);
  });

  it("re-fits and re-clamps so the board still fills the screen it is on", () => {
    const { result } = mount();
    act(() => FakeResizeObserver.latest!.resize(1280, 720));
    const wideFit = result.current.fit;
    act(() => FakeResizeObserver.latest!.resize(390, 844));
    expect(result.current.fit).not.toBe(wideFit);
    const t = result.current.transform;
    expect(t.scale).toBeGreaterThanOrEqual(result.current.fit - 1e-9);
    // No empty band on either side: the stage covers the viewport horizontally.
    expect(t.tx).toBeLessThanOrEqual(0.5);
    expect(t.tx + STAGE.width * t.scale).toBeGreaterThanOrEqual(390 - 0.5);
  });

  it("reset() from a captured API goes back to the fit of the current screen", () => {
    const { result } = mount();
    act(() => FakeResizeObserver.latest!.resize(1280, 720));
    const captured = result.current;
    act(() => FakeResizeObserver.latest!.resize(390, 844));
    act(() => captured.zoomBy(3));
    act(() => captured.reset());
    expect(Math.abs(result.current.transform.scale - result.current.fit)).toBeLessThan(1e-6);
  });
});
