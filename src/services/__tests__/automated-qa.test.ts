import { describe, expect, it } from "vitest";
import type { GameConfig, SpriteRef } from "@/domain/game/config";
import { automatedQa } from "@/services/generation/pipeline";

/** A patch is only shippable if a child can tap what they see (docs/SPRITE_PATCHES.md). */
const patch: SpriteRef = {
  kind: "image",
  url: "/p/beach-sandcastle-A.webp",
  width: 218,
  height: 371,
  rect: { x: 0.33, y: 0.58, w: 0.07, h: 0.18 },
  hitRect: { x: 0.34, y: 0.59, w: 0.06, h: 0.16 },
  anchor: { x: 0.376, y: 0.59 },
};

const slot = (id: string) => ({ id, x: 0.36, y: 0.71, scale: 0.075, rotation: 0, zIndex: 10, layer: "front", flip: false, hintZone: { x: 0.36, y: 0.71, r: 0.1 }, hintText: "h" });

function config(sprite: SpriteRef, spriteByVariant?: { A?: SpriteRef; B?: SpriteRef }): GameConfig {
  const target = { id: "sandcastle", targetType: "hide", difficulty: 1, mission: "Find Noa", item: "hat", success: ["!"], animation: "wave", slots: [slot("a"), slot("b")], sprite, ...(spriteByVariant ? { spriteByVariant } : {}) };
  return {
    version: 1,
    gameId: "g1",
    locale: "en",
    child: { name: "Noa", avatarUrl: "/a.png" },
    styleVersion: "collage-v1",
    packageTier: "ONE_WORLD",
    composedAt: new Date(0).toISOString(),
    scenes: [
      {
        slug: "beach",
        version: 1,
        name: "Beach",
        tagline: "t",
        artStatus: "final",
        art: { width: 3072, height: 2048, base: "/b.webp", thumbnail: "/t.webp", palette: { sky: "#fff", ground: "#fff", accent: "#fff" } },
        targets: [target, target, target],
        ambient: [],
        celebration: { kind: "confetti", completeText: "done" },
        collectible: { id: "c", name: "c", icon: "c" },
        sounds: {},
      },
    ],
  } as unknown as GameConfig;
}

describe("automated QA", () => {
  it("passes a patch that carries its tap contract", () => {
    expect(automatedQa(config(patch, { A: patch, B: patch }))).toEqual([]);
  });

  it("rejects a patch with no hitRect or head anchor", () => {
    const { hitRect, anchor, ...bare } = patch as Extract<SpriteRef, { kind: "image" }>;
    const problems = automatedQa(config(bare as SpriteRef));
    expect(problems.some((p) => p.includes("no hitRect"))).toBe(true);
    expect(problems.some((p) => p.includes("no head anchor"))).toBe(true);
  });

  it("checks the per-variant sprites, not only the default", () => {
    const broken: SpriteRef = { ...patch, anchor: { x: 0.9, y: 0.9 } };
    const problems = automatedQa(config(patch, { A: patch, B: broken }));
    expect(problems.some((p) => p.includes("variant B") && p.includes("head anchor is outside"))).toBe(true);
    expect(problems.some((p) => p.includes("variant A"))).toBe(false);
  });

  it("rejects a patch that hangs off the edge of the scene", () => {
    const off: SpriteRef = { ...patch, rect: { x: 0.95, y: 0.58, w: 0.1, h: 0.18 } };
    expect(automatedQa(config(off)).some((p) => p.includes("extends outside the scene"))).toBe(true);
  });
});
