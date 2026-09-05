// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it } from "vitest";
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

function mount() {
  return renderHook(() => {
    const ref = useRef<HTMLDivElement | null>(document.createElement("div"));
    return useViewport(ref, STAGE, () => {});
  });
}

beforeEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver as never;
  window.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as never;
});

describe("the viewport after a resize", () => {
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
