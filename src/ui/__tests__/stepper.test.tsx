// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Stepper } from "../primitives";

/**
 * The wizard's steps have names now: the ones behind are ticked, the current
 * one is the step, the count line under the dots says which step this is.
 */
beforeEach(() => { vi.stubGlobal("React", React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const STEPS = ["Name & age", "Photo", "Package", "Worlds", "Summary"] as const;

describe("the wizard's steps", () => {
  it("names every step, ticks the ones behind and marks the current one", () => {
    const view = render(<Stepper steps={STEPS} current={2} count="Step 3 of 5" />);
    const items = view.container.querySelectorAll(".fm-steps__item");
    expect(items).toHaveLength(5);
    expect(Array.from(items, (i) => i.querySelector(".fm-steps__label")?.textContent)).toEqual([...STEPS]);
    expect(Array.from(items, (i) => i.querySelector(".fm-steps__dot")?.textContent)).toEqual(["✓", "✓", "3", "4", "5"]);
    expect(items[2]!.getAttribute("aria-current")).toBe("step");
    expect(items[2]!.classList.contains("is-current")).toBe(true);
    expect(items[0]!.classList.contains("is-done")).toBe(true);
    expect(items[3]!.className).toBe("fm-steps__item");
    expect(view.container.querySelector(".fm-steps__count")?.textContent).toBe("Step 3 of 5 · Package");
    expect(view.getByRole("navigation").getAttribute("aria-label")).toBe("Step 3 of 5");
  });

  it("works without a count line", () => {
    const view = render(<Stepper steps={STEPS} current={0} />);
    expect(view.container.querySelector(".fm-steps__count")).toBeNull();
    expect(view.getByRole("navigation").getAttribute("aria-label")).toBe("Name & age");
  });
});
