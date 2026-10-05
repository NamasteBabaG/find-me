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

function mount(onTap: (nx: number, ny: number) => void = () => {}) {
  return renderHook(() => {
    const ref = useRef<HTMLDivElement | null>(document.createElement("div"));
    return useViewport(ref, STAGE, onTap);
  });
}

beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver as never;
  window.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as never;
});
afterEach(() => vi.restoreAllMocks());

function pointer(pointerId: number, clientX: number, clientY: number) {
  return { pointerId, clientX, clientY, currentTarget: document.createElement("div") } as ReactPointerEvent<HTMLDivElement>;
}

describe("active camera gestures", () => {
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
    expect(result.current.transform.scale).toBeCloseTo(fitted.scale * 1.25);
    const pinched = result.current.transform;
    act(() => result.current.bind.onPointerUp(pointer(2, 350, 300)));
    expect(result.current.isDragging).toBe(true);
    expect(result.current.transform).toBe(pinched);
    act(() => result.current.bind.onPointerMove(pointer(1, 112, 300)));
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
