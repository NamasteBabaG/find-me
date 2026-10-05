import { describe, expect, it } from "vitest";
import { turnTipFor } from "../useTurnTip";

describe("which way to hold the device", () => {
  it("tells only a phone held sideways to stand up", () => {
    // A phone on its side cuts the cards and the map off.
    expect(turnTipFor({ touch: true, screenShortSide: 430, portrait: false })).toBe(true);
    // A phone upright is how a phone plays (Guy, 2026-10-05): nothing to say.
    expect(turnTipFor({ touch: true, screenShortSide: 390, portrait: true })).toBe(false);
  });

  it("never tells a tablet which way to hold it, either way", () => {
    expect(turnTipFor({ touch: true, screenShortSide: 768, portrait: true })).toBe(false);
    expect(turnTipFor({ touch: true, screenShortSide: 744, portrait: false })).toBe(false);
  });

  it("says nothing to a mouse, or when the screen's size is unknown", () => {
    expect(turnTipFor({ touch: false, screenShortSide: 390, portrait: false })).toBe(false);
    expect(turnTipFor({ touch: true, screenShortSide: 0, portrait: false })).toBe(false);
  });
});
