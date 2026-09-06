import { describe, expect, it } from "vitest";
import { DEFAULT_WINDOW_FACTOR, WINDOW_MAX_PX, WINDOW_MIN_PX, modelSpaceHeight, paintMask, slotContext, slotPrompt } from "../generation/patch";

/**
 * The size the prompt names has to be the size the mask draws, in the same
 * pixels. The window is cut from the art and the provider scales it to its
 * own square; until this was pinned the text kept the art's number while the
 * mask was scaled with the picture — on the Great Wall a 119px child was drawn
 * into a 1024px window where the mask asked for 159.
 */

const ART = { width: 2048, height: 2048 };
const OUTPUT = 1024;

/** A slot whose default window lands on the given size, for the three sizes that matter. */
const SLOTS = {
  /** 0.03 × 2048 = 61px: ×7 = 430 → 432, ×4 = 245 → the 384 floor. */
  small: { x: 0.5, y: 0.5, scale: 0.03 },
  /** 0.058 × 2048 = 119px, ×7 = 831 → capped at 768; ×4 = 475 → 472. */
  greatWall: { x: 0.5, y: 0.5, scale: 0.058 },
  /** 0.08 × 2048 = 164px, ×7 = 1147 → capped at 768. */
  big: { x: 0.5, y: 0.5, scale: 0.08 },
};

describe("the height the prompt names", () => {
  it("is the same fraction of the window whatever size the window came out at", () => {
    for (const slot of Object.values(SLOTS)) {
      for (const factor of [DEFAULT_WINDOW_FACTOR, 4]) {
        const ctx = slotContext(ART, slot, { windowFactor: factor });
        const inModel = modelSpaceHeight(ctx.childPx, ctx.rect.h, OUTPUT);
        expect(Math.abs(inModel / OUTPUT - ctx.childPx / ctx.rect.h)).toBeLessThan(1 / OUTPUT);
      }
    }
  });

  it("is the art's own number when the provider sends the crop as it is", () => {
    const ctx = slotContext(ART, SLOTS.greatWall);
    expect(modelSpaceHeight(ctx.childPx, ctx.rect.h, undefined)).toBe(ctx.childPx);
    expect(modelSpaceHeight(ctx.childPx, ctx.rect.h, ctx.rect.h)).toBe(ctx.childPx);
  });

  it("on the Great Wall says 159, not 119, for a 1024px edit at the old window, and 258 at the new one", () => {
    const ctx = slotContext(ART, SLOTS.greatWall, { windowFactor: 7 });
    expect(ctx.rect.h).toBe(WINDOW_MAX_PX);
    expect(ctx.childPx).toBe(119);
    expect(modelSpaceHeight(ctx.childPx, ctx.rect.h, OUTPUT)).toBe(159);
    // and at a 4× window the same child is drawn at 258
    const tight = slotContext(ART, SLOTS.greatWall, { windowFactor: 4 });
    expect(tight.rect.h).toBe(472);
    expect(modelSpaceHeight(tight.childPx, tight.rect.h, OUTPUT)).toBe(258);
  });

  it("agrees with the mask about the drawing space", async () => {
    // The mask is drawn in crop pixels and scaled with the crop; its ellipse is
    // 1.6 child-heights tall. Scaled to the model's square, that is 1.6 × the
    // height the prompt names — the text and the mask describe one child.
    const ctx = slotContext(ART, SLOTS.greatWall);
    const svg = paintMask(ctx, ART, SLOTS.greatWall).toString();
    const ry = Number(svg.match(/ry="(\d+)"/)![1]);
    const inModel = modelSpaceHeight(ctx.childPx, ctx.rect.h, OUTPUT);
    const ryInModel = (ry / ctx.rect.h) * OUTPUT;
    expect(Math.abs(ryInModel / inModel - 0.8)).toBeLessThan(0.02);
  });

  it("is the number the prompt prints", () => {
    const text = slotPrompt({ mission: "the child hides", childPx: 159 });
    expect(text).toContain("about 159 pixels tall");
    expect(text).not.toContain("119");
  });
});

describe("the window", () => {
  it("shrinks with a smaller factor but never below the floor, and keeps the spot in the middle", () => {
    const wide = slotContext(ART, SLOTS.small, { windowFactor: 7 });
    const tight = slotContext(ART, SLOTS.small);
    expect(wide.rect.w).toBe(432);
    expect(tight.rect.w).toBe(WINDOW_MIN_PX); // the floor, not 4 × 61
    for (const ctx of [wide, tight]) {
      expect(ctx.rect.x + ctx.rect.w / 2).toBe(SLOTS.small.x * ART.width);
      expect(ctx.rect.y + ctx.rect.h / 2).toBe(SLOTS.small.y * ART.height);
      expect(ctx.childPx).toBe(61); // the child's size in the art does not change with the window
    }
    expect(wide.windowFactor).toBe(7);
    expect(tight.windowFactor).toBe(DEFAULT_WINDOW_FACTOR);
    expect(DEFAULT_WINDOW_FACTOR).toBe(4);
  });

  it("is capped at the top and is always a multiple of eight", () => {
    for (const slot of Object.values(SLOTS)) {
      for (const factor of [3, 4, 5, 7, 9]) {
        const ctx = slotContext(ART, slot, { windowFactor: factor });
        expect(ctx.rect.w % 8).toBe(0);
        expect(ctx.rect.w).toBeGreaterThanOrEqual(WINDOW_MIN_PX);
        expect(ctx.rect.w).toBeLessThanOrEqual(WINDOW_MAX_PX);
      }
    }
    expect(() => slotContext(ART, SLOTS.small, { windowFactor: 0 })).toThrow(/positive/);
  });
});
