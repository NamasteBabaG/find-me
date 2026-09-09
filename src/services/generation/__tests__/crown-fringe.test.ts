import { describe, expect, it } from "vitest";
import { validateConnectedCrownFringe } from "../crown-fringe";

function fixture(crown = { x: 155, y: 13 }, contour = { x: 155, y: 17 }, alpha = 178) {
  const width = 345, height = 951, rgba = Buffer.alloc(width * height * 4);
  const paint = (x: number, y: number, value: number) => { rgba[(y * width + x) * 4 + 3] = value; };
  const eye = { x: crown.x, y: 118 }, chin = { x: crown.x, y: 180 };
  for (let y = contour.y; y <= chin.y + 10; y++) for (let x = contour.x - 15; x <= contour.x + 15; x++) paint(x, y, 255);
  for (let y = crown.y; y < contour.y; y++) paint(crown.x, y, alpha);
  for (let x = Math.min(crown.x, contour.x); x <= Math.max(crown.x, contour.x); x++) paint(x, contour.y, 255);
  return { crown, eye, chin, complete: true, originalFrameClear: true, width, height, rgba };
}

describe("opt-in observed crown hair-fringe validation", () => {
  it.each([
    ["Sydney lifeguard", { x: 144, y: 13 }, { x: 143, y: 20 }, 4],
    ["Sydney rocks", { x: 155, y: 13 }, { x: 155, y: 17 }, 178],
    ["Paris bakery", { x: 195, y: 13 }, { x: 195, y: 17 }, 21],
  ] as const)("accepts%s-coordinate connected antialias topology without relocating the crown", (_label, crown, contour, alpha) => {
    const result = validateConnectedCrownFringe(fixture(crown, contour, alpha));
    expect(result).toMatchObject({ accepted: true, rawCrown: crown, usedCrown: crown, rawAlpha: alpha,
      coordinateChanged: false, additionalCrownTransformShiftPx: 0, eyeConnected: true, chinConnected: true });
    expect(result.contourDistancePx).toBeLessThanOrEqual(12);
  });
  it("rejects a zero-alpha observation even with nearby opaque hair", () => {
    const input = fixture(); input.rgba[(13 * input.width + 155) * 4 + 3] = 0;
    expect(validateConnectedCrownFringe(input).reason).toBe("raw-crown-has-no-alpha");
  });
  it("rejects a disconnected translucent spark beside the head", () => {
    const input = fixture(); input.rgba[(15 * input.width + 155) * 4 + 3] = 0;
    expect(validateConnectedCrownFringe(input).reason).toBe("no-connected-solid-hair-within-twelve-source-pixels");
  });
  it("rejects connected fringe whose opaque contour is farther than12source pixels", () => {
    const input = fixture({ x: 155, y: 13 }, { x: 155, y: 26 });
    expect(validateConnectedCrownFringe(input).reason).toBe("no-connected-solid-hair-within-twelve-source-pixels");
  });
  it("rejects local opaque hair that belongs to a component disconnected from the observed face", () => {
    const input = fixture();
    for (let x = 0; x < input.width; x++) input.rgba[(70 * input.width + x) * 4 + 3] = 0;
    expect(validateConnectedCrownFringe(input).reason).toBe("hair-contour-not-connected-to-observed-face");
  });
  it.each(["eye", "chin"] as const)("requires opaque%s pixels", key => {
    const input = fixture(); input.rgba[(input[key].y * input.width + input[key].x) * 4 + 3] = 223;
    expect(validateConnectedCrownFringe(input).reason).toBe("opaque-observed-face-required");
  });
  it.each(["incomplete", "clipped", "implausible-head"])("never rescues%s", defect => {
    const input = fixture();
    if (defect === "incomplete") input.complete = false;
    if (defect === "clipped") input.originalFrameClear = false;
    if (defect === "implausible-head") input.chin.y = 130;
    expect(validateConnectedCrownFringe(input).accepted).toBe(false);
  });
});
