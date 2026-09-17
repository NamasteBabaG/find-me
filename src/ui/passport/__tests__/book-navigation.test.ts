import { describe, expect, it } from "vitest";
import { arrowPage, swipePage } from "../book-navigation";

describe("physical passport page navigation", () => {
  it.each(["ltr", "rtl"] as const)("ignores vertical scroll, taps, diagonal drags and long presses in %s", dir => {
    expect(swipePage(12, 4, 200, dir)).toBe(0);
    expect(swipePage(80, 130, 200, dir)).toBe(0);
    expect(swipePage(80, 65, 200, dir)).toBe(0);
    expect(swipePage(130, 4, 1800, dir)).toBe(0);
  });
  it("reverses gestures and physical arrow keys for Hebrew", () => {
    expect(swipePage(120, 10, 200, "rtl")).toBe(1);
    expect(swipePage(-120, 10, 200, "rtl")).toBe(-1);
    expect(swipePage(-120, 10, 200, "ltr")).toBe(1);
    expect(swipePage(120, 10, 200, "ltr")).toBe(-1);
    expect(arrowPage("ArrowLeft", "rtl")).toBe(1);
    expect(arrowPage("ArrowRight", "rtl")).toBe(-1);
    expect(arrowPage("ArrowRight", "ltr")).toBe(1);
    expect(arrowPage("Enter", "ltr")).toBe(0);
  });
});
