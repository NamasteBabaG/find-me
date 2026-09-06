import type { SpriteRef } from "../../src/domain/game/config";

/** Selected renders from the real slot pipeline, 2026-09-06. Demo only.
 * One verified appearance per target. Never fall through to the old hat-wearing
 * B assets on replay. Historical files remain available as evidence, not gameplay.
 * Raw inputs, failures, request IDs and costs are in the private QA handoff.
 */
export const beachDemoPatches: Readonly<Record<string, SpriteRef>> = {
  float: {
    kind: "image", url: "/demo/noa-v2/beach-float-A.webp", width: 163, height: 247,
    rect: { x: 0.7063802083333334, y: 0.5703125, w: 0.053059895833333336, h: 0.12060546875 },
    hitRect: { x: 0.7096354166666666, y: 0.57568359375, w: 0.046549479166666664, h: 0.1103515625 },
    anchor: { x: 0.7354750043890449, y: 0.57568359375 },
  },
  sandcastle: {
    kind: "image", url: "/demo/noa-v2/beach-sandcastle-A.webp", width: 163, height: 254,
    rect: { x: 0.3557942708333333, y: 0.62353515625, w: 0.053059895833333336, h: 0.1240234375 },
    hitRect: { x: 0.359375, y: 0.62841796875, w: 0.0458984375, h: 0.1142578125 },
    anchor: { x: 0.3860135091145833, y: 0.62841796875 },
  },
  umbrella: {
    kind: "image", url: "/demo/noa-v2/beach-umbrella-A.webp", width: 98, height: 176,
    rect: { x: 0.2353515625, y: 0.3740234375, w: 0.031901041666666664, h: 0.0859375 },
    hitRect: { x: 0.23893229166666666, y: 0.37890625, w: 0.025065104166666668, h: 0.07568359375 },
    anchor: { x: 0.2547310618071214, y: 0.37890625 },
  },
};
