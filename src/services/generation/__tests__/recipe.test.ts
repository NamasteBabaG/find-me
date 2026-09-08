import { describe, expect, it } from "vitest";
import { recipeOf } from "../slot-patches";
import { sceneBySlug } from "../../scene-catalog.service";

/** The judge is told what a correct picture is, with or without an authored recipe. */
describe("recipeOf", () => {
  it("hands over an authored recipe with its mode and contract", () => {
    const giza = sceneBySlug("giza");
    const stones = giza.targets.find((t) => t.id === "stones")!;
    const r = recipeOf(stones.slots[0], stones)!;
    expect(r.pose).toBe("standing");
    expect(r.occlusionMode).toBe("layer");
    expect(r.occlusion).toContain("stone block");
  });
  it("derives a peek from the body template and the mission when the slot has no recipe", () => {
    const marrakech = sceneBySlug("marrakech");
    const spices = marrakech.targets.find((t) => t.id === "spices")!;
    expect(spices.slots[0].placement).toBeUndefined();
    const r = recipeOf(spices.slots[0], spices)!;
    expect(r.pose).toBe("peeking");
    expect(r.occlusionMode).toBe("open");
    expect(r.occlusion).toContain(spices.item.en);
    expect(recipeOf(spices.slots[0])).toBeUndefined();
  });
});
