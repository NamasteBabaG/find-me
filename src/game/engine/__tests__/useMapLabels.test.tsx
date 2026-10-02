// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMapLabels } from "../useMapLabels";

const nodes = Array.from({ length: 9 }, (_, i) => ({ boardSlug: `place-${i}`, x: 0.5, y: 0.5 }));
function Labels({ firstHeight = 24, firstName = "Place" }: { firstHeight?: number; firstName?: string }) {
  const { ref, positions, minHeight } = useMapLabels(nodes);
  return <div ref={ref} data-map data-min-height={minHeight} style={{ minHeight }}>
    {nodes.map((node, i) => <button key={node.boardSlug} className="wmap__place" data-board={node.boardSlug} data-height={i === 0 ? firstHeight : 24}
      style={{ left: `${(positions[node.boardSlug]?.x ?? node.x) * 100}%`, top: `${(positions[node.boardSlug]?.y ?? node.y) * 100}%` }}>{i === 0 ? firstName : node.boardSlug}</button>)}
  </div>;
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) { return this.hasAttribute("data-map") ? 288 : 0; });
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) { return this.hasAttribute("data-map") ? Math.max(192, parseFloat(this.style.minHeight) || 0) : 0; });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) { return this.classList.contains("wmap__place") ? 70 : 0; });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) { return Number(this.dataset.height ?? 0); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("map label measurement lifecycle", () => {
  it("uses measured name height, refits changed progress, and disconnects every observed control", () => {
    let resize = () => {};
    const observe = vi.fn(), disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe = observe;
      disconnect = disconnect;
    });
    const view = render(<Labels firstHeight={112} />);
    const map = view.container.querySelector<HTMLElement>("[data-map]")!;
    expect(map.dataset.minHeight).toBe("257"); // 113px measured row, two 64px rows, and two 8px gaps.
    expect(observe).toHaveBeenCalledTimes(10);
    act(resize); // The resized map has the same height React just reserved.
    const first = view.container.querySelector<HTMLButtonElement>('[data-board="place-0"]')!;
    const centre = parseFloat(first.style.top) / 100 * 257;
    expect(centre - 113 / 2).toBeGreaterThanOrEqual(0);
    expect(centre + 113 / 2).toBeLessThanOrEqual(257);
    view.rerender(<Labels firstHeight={24} firstName="New progress" />);
    act(resize);
    expect(map.dataset.minHeight).toBe("208");
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    const reads = vi.spyOn(HTMLElement.prototype, "clientWidth", "get");
    reads.mockClear();
    act(resize);
    expect(reads).not.toHaveBeenCalled();
  });

  it("remeasures translated names without ResizeObserver and removes its fallback listener", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    let changed = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal("MutationObserver", class {
      constructor(callback: () => void) { changed = callback; }
      observe() {}
      disconnect = disconnect;
    });
    const remove = vi.spyOn(window, "removeEventListener");
    const view = render(<Labels />);
    view.rerender(<Labels firstHeight={96} firstName="שם מקום ארוך יותר" />);
    act(changed);
    expect(view.container.querySelector<HTMLElement>("[data-map]")!.dataset.minHeight).toBe("241");
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
  });
});
