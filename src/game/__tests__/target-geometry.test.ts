import { describe, expect, it } from "vitest";
import type { SceneConfig, SpriteRef, TargetConfig } from "@/domain/game/config";
import { expandRect, hitPadding, rectContains } from "@/game/engine/viewport-math";
import { targetGeometry } from "@/game/engine/target-geometry";

/**
 * Regression guard for the slot-patch tap contract.
 *
 * A patch is drawn at its own rect, which sits higher and is taller than the
 * slot it was generated at. Hit-testing used to be derived from the slot, so a
 * tap on the visible head — what the mission actually asks for — did nothing.
 */

const stage = { width: 3072, height: 2048 };

const slot = (x: number, y: number, scale: number) => ({
  id: "s",
  x,
  y,
  scale,
  rotation: 0,
  zIndex: 10,
  layer: "front" as const,
  flip: false,
  hintZone: { x, y, r: 0.1 },
  hintText: "",
});

function scene(target: TargetConfig): SceneConfig {
  return {
    slug: "beach",
    version: 1,
    name: "Beach",
    tagline: "",
    artStatus: "final",
    art: { width: stage.width, height: stage.height, base: "/b.webp", thumbnail: "/t.webp", palette: { sky: "#fff", ground: "#fff", accent: "#fff" } },
    targets: [target, target, target],
    ambient: [],
    celebration: { kind: "confetti", completeText: "" },
    collectible: { id: "c", name: "c", icon: "c" },
    sounds: {},
  } as SceneConfig;
}

/** The real beach/sandcastle/A patch: drawn at 33.2%,58.4%; her head is at 59.3%; the slot is at 71%. */
const patchSprite: SpriteRef = {
  kind: "image",
  url: "/demo/patches/beach-sandcastle-A.webp",
  width: 218,
  height: 371,
  rect: { x: 0.3324, y: 0.5845, w: 0.071, h: 0.1812 },
  hitRect: { x: 0.3385, y: 0.5933, w: 0.0589, h: 0.1631 },
  anchor: { x: 0.3763, y: 0.5933 },
};

function target(sprite: SpriteRef): TargetConfig {
  return {
    id: "sandcastle",
    targetType: "hide",
    difficulty: 1,
    mission: "Find Noa",
    item: "straw hat",
    success: ["!"],
    animation: "wave",
    slots: [slot(0.36, 0.71, 0.075), slot(0.4, 0.6, 0.075)],
    sprite,
  } as TargetConfig;
}

/** What SceneViewport does on a tap, at fit scale. */
function taps(g: ReturnType<typeof targetGeometry>, x: number, y: number, scale = 0.35): boolean {
  const pad = hitPadding(g.hitRect, stage, scale);
  return rectContains(expandRect(g.hitRect, pad.padX, pad.padY), x, y);
}

describe("target geometry", () => {
  it("puts a slot patch's tap area on the painted child, not on the slot", () => {
    const t = target(patchSprite);
    const g = targetGeometry(scene(t), t, "A");
    expect(g.isPatch).toBe(true);
    // Her head and hat: the one thing the demo mission names.
    expect(taps(g, 0.3763, 0.5985)).toBe(true);
    // Body and feet stay tappable too.
    expect(taps(g, 0.366, 0.68)).toBe(true);
    expect(taps(g, 0.366, 0.75)).toBe(true);
    // Open sand well away from her does not count.
    expect(taps(g, 0.55, 0.45)).toBe(false);
  });

  it("hangs the bubble from the head and centres the camera on the middle", () => {
    const t = target(patchSprite);
    const g = targetGeometry(scene(t), t, "A");
    expect(g.head).toEqual({ x: 0.3763, y: 0.5933 });
    expect(g.center.y).toBeCloseTo(0.5933 + 0.1631 / 2, 5);
    // The old behaviour pointed at the slot, a tenth of the scene below her head.
    expect(g.head.y).toBeLessThan(g.slot.y - 0.1);
  });

  it("falls back to the drawn rect when a patch carries no hitRect", () => {
    const { hitRect, anchor, ...bare } = patchSprite as Extract<SpriteRef, { kind: "image" }>;
    const t = target(bare as SpriteRef);
    const g = targetGeometry(scene(t), t, "A");
    expect(g.hitRect.x0).toBeCloseTo(0.3324, 5);
    expect(g.head).toEqual({ x: 0.3324 + 0.071 / 2, y: 0.5845 });
  });

  it("still uses the slot footprint for ordinary sprites", () => {
    const t = target({ kind: "composed", faceUrl: "/f.png", bodyTemplate: "crouch" });
    const g = targetGeometry(scene(t), t, "A");
    expect(g.isPatch).toBe(false);
    expect(g.hitRect.y0).toBeCloseTo(0.71 - 0.075 / 2, 5);
    expect(g.head).toEqual({ x: 0.36, y: 0.71 });
  });

  it("uses the variant's own patch", () => {
    const b: SpriteRef = { ...patchSprite, hitRect: { x: 0.354, y: 0.569, w: 0.058, h: 0.101 }, anchor: { x: 0.38, y: 0.569 } };
    const t = { ...target(patchSprite), spriteByVariant: { A: patchSprite, B: b } };
    expect(targetGeometry(scene(t), t, "B").head).toEqual({ x: 0.38, y: 0.569 });
    expect(targetGeometry(scene(t), t, "A").head).toEqual({ x: 0.3763, y: 0.5933 });
  });

  it("moves the hint onto the painted child, keeping the authored radius", () => {
    const t = target(patchSprite);
    const g = targetGeometry(scene(t), t, "A");
    // The slot sits at 0.71; she was painted centred near 0.675.
    expect(g.hintZone.x).toBeCloseTo(g.center.x, 5);
    expect(g.hintZone.y).toBeCloseTo(g.center.y, 5);
    expect(g.hintZone.r).toBe(g.slot.hintZone.r);
    expect(Math.abs(g.hintZone.y - g.slot.hintZone.y)).toBeGreaterThan(0.01);
    // An ordinary sprite keeps the authored zone exactly.
    const plain = target({ kind: "composed", faceUrl: "/f.png", bodyTemplate: "crouch" });
    expect(targetGeometry(scene(plain), plain, "A").hintZone).toEqual(plain.slots[0].hintZone);
  });
});
