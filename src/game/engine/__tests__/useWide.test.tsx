// @vitest-environment jsdom
import React, { useRef } from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useWide } from "../useWide";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("sizes collection furniture against its scene, not a larger browser window", () => {
  vi.stubGlobal("React", React);
  window.matchMedia = vi.fn(() => ({ matches: true })) as never;
  let size = { width: 720, height: 405 };
  let resize = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({ ...size, x: 0, y: 0, left: 0, top: 0, right: size.width, bottom: size.height, toJSON() {} }));
  function Furniture() {
    const ref = useRef<HTMLElement>(null);
    const wide = useWide(ref);
    return <div className="scene"><aside ref={ref}>{wide ? "strip" : "button"}</aside></div>;
  }
  const view = render(<Furniture />);
  expect(view.getByText("button")).toBeTruthy();
  act(() => { size = { width: 1100, height: 620 }; resize(); });
  expect(view.getByText("strip")).toBeTruthy();
  act(() => { size = { width: 1000, height: 330 }; resize(); });
  expect(view.getByText("button")).toBeTruthy();
  view.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
