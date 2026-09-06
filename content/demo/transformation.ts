import type { SpriteRef } from "../../src/domain/game/config";

/** Existing demo-only artwork. No customer photograph or game asset belongs here.
 * See docs/CODEX_UI_IMPLEMENTATION_2026-09-06.md for source hashes and review limits.
 * This separate example does not replace historical patches in playable demos.
 */
export const transformationExample = {
  photo: "/demo/example-photo.jpg",
  identitySheet: "/demo/example-identity-no-hat.png",
  scene: "beach",
  target: "sandcastle",
  sprite: {
    kind: "image", url: "/demo/examples/beach-sandcastle-illustrated.webp", width: 167, height: 225,
    rect: { x: 0.3610026041666667, y: 0.59521484375, w: 0.054361979166666664, h: 0.10986328125 },
    hitRect: { x: 0.3645833333333333, y: 0.60009765625, w: 0.047526041666666664, h: 0.099609375 },
    anchor: { x: 0.39566750897271347, y: 0.60009765625 },
  } satisfies SpriteRef,
} as const;
