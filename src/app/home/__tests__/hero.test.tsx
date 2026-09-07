// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hero } from "../Hero";
import art from "../../../../content/home/hero-art.json";
vi.mock("@/i18n/client", () => ({ useI18n: () => ({ t: { home: { hero: { title: "Find me?" } } } }) }));
let reduced = false;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("React", React);
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduced-motion") && reduced, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); reduced = false; });
describe("hero boards", () => {
  it("presents the introductory label as quiet text, not a yellow button", () => {
    const view = render(<Hero />);
    const label = view.container.querySelector(".hero3__content .hero3__pill")!;
    expect(label.tagName).toBe("SPAN");
    expect(label.classList.contains("fm-pill--sun")).toBe(false);
    expect(label.hasAttribute("tabindex")).toBe(false);
    expect(label.getAttribute("role")).not.toBe("button");
  });
  it("uses identical refreshed art in both layers, holds 12 seconds, and cycles together", () => {
    const view = render(<Hero />);
    const layers = [".hero3__ghost", ".hero3__hidden"];
    for (const layer of layers) expect(Array.from(view.container.querySelectorAll(`${layer} img`)).map(img => img.getAttribute("src"))).toEqual(art.map(row => row.src));
    const current = () => layers.map(layer => view.container.querySelector(`${layer} .is-on`)?.getAttribute("src"));
    expect(current()).toEqual([art[0]!.src, art[0]!.src]);
    act(() => vi.advanceTimersByTime(11_999));
    expect(current()).toEqual([art[0]!.src, art[0]!.src]);
    act(() => vi.advanceTimersByTime(1));
    expect(current()).toEqual([art[1]!.src, art[1]!.src]);
    act(() => vi.advanceTimersByTime(24_000));
    expect(current()).toEqual([art[0]!.src, art[0]!.src]);
    view.unmount(); expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps the board still with reduced motion", () => {
    reduced = true; const view = render(<Hero />);
    act(() => vi.advanceTimersByTime(36_000));
    expect(view.container.querySelector(".hero3__ghost .is-on")?.getAttribute("src")).toBe(art[0]!.src);
    expect(vi.getTimerCount()).toBe(0);
  });
});
