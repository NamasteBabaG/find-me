import { describe, expect, it } from "vitest";
import { chooseFitMode, clampTransform, fitScale, hitPadding, hitTest, isTap, screenToStage, spriteRect, zoomAt } from "@/game/engine/viewport-math";

const stage = { width: 1600, height: 1000 };

describe("viewport math", () => {
  it("contains on desktop, covers on portrait phones", () => {
    expect(chooseFitMode({ width: 1200, height: 800 }, stage)).toBe("contain");
    expect(chooseFitMode({ width: 390, height: 844 }, stage)).toBe("cover");
    expect(fitScale({ width: 800, height: 800 }, stage, "contain")).toBe(0.5);
    expect(fitScale({ width: 800, height: 800 }, stage, "cover")).toBe(0.8);
  });

  it("clamps panning so the stage always covers the viewport", () => {
    const vp = { width: 800, height: 500 };
    const t = clampTransform({ scale: 1, tx: 100, ty: -900 }, vp, stage, 0.5, 4);
    expect(t.tx).toBe(0);
    expect(t.ty).toBe(-500);
  });

  it("centres a stage smaller than the viewport", () => {
    const vp = { width: 2000, height: 1200 };
    const t = clampTransform({ scale: 0.5, tx: 0, ty: 0 }, vp, stage, 0.5, 4);
    expect(t.tx).toBe((2000 - 800) / 2);
    expect(t.ty).toBe((1200 - 500) / 2);
  });

  it("zooms around a focal point", () => {
    const t = zoomAt({ scale: 1, tx: 0, ty: 0 }, 400, 300, 2);
    const p = screenToStage(t, 400, 300);
    expect(p.x).toBeCloseTo(400);
    expect(p.y).toBeCloseTo(300);
  });

  it("hit-tests the topmost padded sprite rect", () => {
    const r = spriteRect({ x: 0.5, y: 0.5, scale: 0.05 }, stage, 100 / 140);
    const pad = hitPadding(r, stage, 0.5);
    expect(pad.padX).toBeGreaterThan(0);
    const hit = hitTest([{ id: "a", rect: r, zIndex: 1 }], 0.5, 0.5);
    expect(hit).toBe("a");
    expect(hitTest([{ id: "a", rect: r, zIndex: 1 }], 0.9, 0.9)).toBeNull();
  });

  it("distinguishes taps from drags", () => {
    expect(isTap(3, 4, 120)).toBe(true);
    expect(isTap(30, 0, 120)).toBe(false);
    expect(isTap(0, 0, 900)).toBe(false);
  });
});
