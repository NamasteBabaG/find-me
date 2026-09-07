// @vitest-environment jsdom
import React, { useRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScrollReveal } from "../useScrollReveal";

let callback: IntersectionObserverCallback;
const disconnect = vi.fn();
let reduced = false;
function Harness({ ready = true, demo = true }: { ready?: boolean; demo?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const open = useScrollReveal(ref, demo, ready);
  return <div ref={ref} data-open={open} />;
}
function intersect(ratio: number) {
  act(() => callback([{ isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry], {} as IntersectionObserver));
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("React", React); disconnect.mockClear();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(cb: IntersectionObserverCallback) { callback = cb; }
    observe() {} disconnect = disconnect;
  });
  vi.stubGlobal("matchMedia", () => ({ matches: reduced }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); reduced = false; });
describe("demo cloud entrance", () => {
  it("waits offscreen, then opens after a short visible beat, only once", () => {
    const view = render(<Harness />);
    const open = () => view.container.firstElementChild?.getAttribute("data-open");
    act(() => vi.advanceTimersByTime(30_000)); expect(open()).toBe("false");
    intersect(0.11); act(() => vi.advanceTimersByTime(1000)); expect(open()).toBe("false");
    intersect(0.2); act(() => vi.advanceTimersByTime(159)); expect(open()).toBe("false");
    act(() => vi.advanceTimersByTime(1)); expect(open()).toBe("true");
    expect(disconnect).toHaveBeenCalledOnce();
    intersect(0); expect(open()).toBe("true");
    intersect(0.9); expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels a fleeting pass and waits for the images as well as visibility", () => {
    const view = render(<Harness ready={false} />);
    intersect(0.5); act(() => vi.advanceTimersByTime(1000));
    expect(view.container.firstElementChild?.getAttribute("data-open")).toBe("false");
    view.rerender(<Harness />);
    act(() => vi.advanceTimersByTime(80)); intersect(0);
    act(() => vi.advanceTimersByTime(1000));
    expect(view.container.firstElementChild?.getAttribute("data-open")).toBe("false");
    intersect(0.5); act(() => vi.advanceTimersByTime(160));
    expect(view.container.firstElementChild?.getAttribute("data-open")).toBe("true");
  });
  it("does not delay normal games", () => {
    const view = render(<Harness demo={false} />);
    expect(view.container.firstElementChild?.getAttribute("data-open")).toBe("true");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("skips the extra delay with reduced motion", () => {
    reduced = true;
    const view = render(<Harness />); intersect(0.5);
    act(() => vi.advanceTimersByTime(0));
    expect(view.container.firstElementChild?.getAttribute("data-open")).toBe("true");
  });
  it("cleans up a pending entrance on unmount", () => {
    const view = render(<Harness />); intersect(0.5); view.unmount();
    expect(vi.getTimerCount()).toBe(0); expect(disconnect).toHaveBeenCalledOnce();
  });
  it("fails open when the visibility API is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const view = render(<Harness />);
    act(() => vi.advanceTimersByTime(160));
    expect(view.container.firstElementChild?.getAttribute("data-open")).toBe("true");
  });
});
