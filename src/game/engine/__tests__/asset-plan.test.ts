import { describe, expect, it } from "vitest";
import { assetPlan, preloadVerdict } from "../asset-plan";

/**
 * A board with a missing child used to open anyway after ten seconds, and the
 * game asked the child to find someone who was not there.
 */
const scene = { art: { base: "/b.webp", foreground: "/f.webp" }, bonus: { sprite: "/bonus.webp" } };

describe("the asset plan", () => {
  it("counts the board and every child as essential, the rest as decoration", () => {
    const plan = assetPlan(scene, ["/c1.webp", "/c2.webp"]);
    expect(plan.essential).toEqual(["/b.webp", "/c1.webp", "/c2.webp"]);
    expect(plan.decorative).toEqual(["/f.webp", "/bonus.webp"]);
  });

  it("opens when only decoration failed", () => {
    const plan = assetPlan(scene, ["/c1.webp"]);
    expect(preloadVerdict(plan, [{ url: "/f.webp", ok: false }, { url: "/b.webp", ok: true }, { url: "/c1.webp", ok: true }])).toBe("ready");
  });

  it("does not open without the child, or without the board", () => {
    const plan = assetPlan(scene, ["/c1.webp"]);
    expect(preloadVerdict(plan, [{ url: "/c1.webp", ok: false }])).toBe("failed");
    expect(preloadVerdict(plan, [{ url: "/b.webp", ok: false }])).toBe("failed");
  });

  it("never lists a picture twice", () => {
    const plan = assetPlan({ art: { base: "/b.webp", foreground: "/b.webp" } }, ["/b.webp"]);
    expect(plan.essential).toEqual(["/b.webp"]);
    expect(plan.decorative).toEqual([]);
  });
});
