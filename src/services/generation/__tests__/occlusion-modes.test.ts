import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { matteHint, occlusionMode, slotPrompt, visibleGeometry, type PatchResult, type SlotPoint } from "../patch";
import { mattePrompt } from "@/infra/generation/openai";
import { repairInstruction } from "../slot-patches";

/**
 * Three ways a spot hides the child, three sets of words. One wording for
 * all three told the painter to let the block overlap her AND to paint her
 * complete, told pass two to cut her at the block that was not in the
 * render, and told the judge nothing — so a correct peek was rejected for
 * its missing feet (game 2, 8 September 2026).
 */
const POLY = [{ x: 0.4, y: 0.6 }, { x: 0.6, y: 0.6 }, { x: 0.6, y: 0.8 }, { x: 0.4, y: 0.8 }];
const placement = { pose: "standing", support: "Hidden shoes on the sand behind the block.", occlusion: "The block hides her from the chest down.", instructions: "Paint her complete." };
const OPEN: SlotPoint = { x: 0.5, y: 0.5, scale: 0.1, placement: { pose: "standing", occlusion: "None; the whole child shows." } };
const CLIPPED: SlotPoint = { x: 0.5, y: 0.5, scale: 0.1, placement: { pose: "peeking", foreground: POLY, occlusion: placement.occlusion } };
const LAYER: SlotPoint = { x: 0.5, y: 0.5, scale: 0.1, layer: "behindForeground", placement: { pose: "standing", foreground: POLY, occlusion: placement.occlusion } };

describe("occlusion modes", () => {
  it("are read from the layer and the polygon", () => {
    expect(occlusionMode(OPEN)).toBe("open");
    expect(occlusionMode(CLIPPED)).toBe("clipped");
    expect(occlusionMode(LAYER)).toBe("layer");
    expect(occlusionMode({})).toBe("open");
  });
  it("tell pass two to keep a layer-mode child whole, and a clipped one cut at the object", () => {
    expect(matteHint({ placement: { ...placement } as never, layer: "behindForeground" })).toContain("nothing in this picture is in front of her");
    expect(matteHint({ placement: { ...placement } as never, layer: "behindForeground" })).toContain("NOT in this picture");
    expect(matteHint({ placement: { ...placement } as never, layer: "front" })).toBe("The child is standing. The block hides her from the chest down.");
    const layer = mattePrompt("hint", true, undefined, "layer");
    expect(layer).toContain("Nothing in image 1 is in front of this child");
    expect(layer).not.toContain("paint it magenta as well");
    const clipped = mattePrompt("hint", true, undefined, "clipped");
    expect(clipped).toContain("paint it magenta as well");
    expect(clipped).toContain("Her head, her hands and her feet stay at exactly the pixels");
  });
  it("tell the painter one thing per mode, and name the contract's two heights", () => {
    const common = { mission: "Find the child", childPx: 200, ageYears: 7 };
    const layer = slotPrompt({ ...common, placement: placement as never, occlusion: "layer", contractPx: { standing: 300, visible: 135 } });
    expect(layer).toContain("NOTHING in this picture may cover any part of her");
    expect(layer).not.toContain("Let whatever is naturally in front of the child overlap them");
    expect(layer).not.toContain("If this spot has no suitable occluder");
    expect(layer).toContain("about 300 pixels tall from head to feet");
    expect(layer).toContain("about 135 pixels of her show above the object in front");
    const clipped = slotPrompt({ ...common, placement: { ...placement, pose: "peeking" } as never, occlusion: "clipped" });
    expect(clipped).toContain("Let whatever is naturally in front of the child overlap them");
    expect(clipped).toContain("about 200 pixels tall");
    const seated = slotPrompt({ ...common, placement: { ...placement, pose: "seated" } as never, occlusion: "open", contractPx: { standing: 390, visible: 303 } });
    expect(seated).toContain("about 303 pixels of her show from the head down to the seat");
  });
  it("repairs a placement failure inside the recipe, never by swapping the pose", () => {
    const bad = JSON.stringify({ verdict: "bad", reason: "no feet", checks: { bodyPlacement: "fail", relativeScale: "fail" } });
    const peek = repairInstruction(bad, { ...placement, foreground: POLY, contract: { standingHeight: 0.1, visibleFraction: 0.4, supportPoint: { x: 0.5, y: 0.6 }, comparators: "the boy in blue" } } as never);
    expect(peek).toContain("Keep exactly this recipe: pose standing");
    expect(peek).toContain("The only thing that may hide any part of the child is the object the recipe names");
    expect(peek).not.toContain("complete supported standing or seated body");
    expect(peek).toContain("wrong size for the people at her depth (the boy in blue)");
    expect(repairInstruction(bad)).toContain("complete supported standing or seated body");
    expect(repairInstruction(JSON.stringify({ verdict: "ok" }), placement as never)).toBe("");
  });
});

describe("the tap contract after the foreground layer", () => {
  it("is measured on what the layer leaves uncovered", async () => {
    const W = 40, H = 100;
    // A whole opaque child; the layer covers her lower 60 rows.
    const rgba = Buffer.alloc(W * H * 4, 255);
    const patch: PatchResult = {
      webp: await sharp(rgba, { raw: { width: W, height: H, channels: 4 } }).webp({ lossless: true }).toBuffer(), width: W, height: H,
      geometry: { rect: { x: 0.1, y: 0.2, w: W / 1000, h: H / 1000 }, hitRect: { x: 0.1, y: 0.2, w: W / 1000, h: H / 1000 }, anchor: { x: 0.12, y: 0.2 } },
      largest: W * H, painted: W * H, expected: W * H, basis: "matte",
      shape: { width: W, height: H, centerX: 0, centerY: 0, childPx: H, slotX: 0, slotY: 0 },
    };
    const cover = Buffer.alloc(W * H * 4);
    for (let y = 40; y < H; y++) for (let x = 0; x < W; x++) cover.set([0, 0, 0, 255], (y * W + x) * 4);
    const fg = await sharp(cover, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
    const seen = await visibleGeometry(patch, fg, { width: 1000, height: 1000 });
    expect(seen.hiddenFraction).toBeCloseTo(0.6, 2);
    expect(seen.geometry.hitRect.y * 1000).toBeCloseTo(200, 0);
    expect(seen.geometry.hitRect.h * 1000).toBeCloseTo(40, 0);
    expect(seen.geometry.rect).toEqual(patch.geometry.rect);
    const all = Buffer.alloc(W * H * 4, 255);
    const hidden = await visibleGeometry(patch, await sharp(all, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer(), { width: 1000, height: 1000 });
    expect(hidden.hiddenFraction).toBe(1);
    expect(hidden.visiblePx).toBe(0);
  });
});
