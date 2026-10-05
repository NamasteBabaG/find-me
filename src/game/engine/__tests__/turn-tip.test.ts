import { describe, expect, it } from "vitest";
import { turnTipFor } from "../useTurnTip";

describe("which way to hold the device", () => {
  it("tells a tablet held upright to turn sideways, and a phone held sideways to stand up", () => {
    // An iPad upright: the board is more fun sideways.
    expect(turnTipFor({ touch: true, screenShortSide: 768, portrait: true })).toBe("tablet");
    // An iPad mini already sideways: nothing to say.
    expect(turnTipFor({ touch: true, screenShortSide: 744, portrait: false })).toBeNull();
    // A phone upright is how a phone plays (Guy, 2026-10-05): never told to turn sideways.
    expect(turnTipFor({ touch: true, screenShortSide: 390, portrait: true })).toBeNull();
    // A phone on its side cuts the cards and the map off.
    expect(turnTipFor({ touch: true, screenShortSide: 430, portrait: false })).toBe("phone");
  });

  it("says nothing to a mouse, or when the screen's size is unknown", () => {
    expect(turnTipFor({ touch: false, screenShortSide: 768, portrait: true })).toBeNull();
    expect(turnTipFor({ touch: false, screenShortSide: 390, portrait: false })).toBeNull();
    expect(turnTipFor({ touch: true, screenShortSide: 0, portrait: false })).toBeNull();
  });
});
