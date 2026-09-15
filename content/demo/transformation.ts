import { publicBeachDemo } from "./beach-v1";
import assets from "./beach-v1-assets.json";

/** Demo-only artwork. No customer photograph or game asset belongs here.
 * See docs/CODEX_UI_IMPLEMENTATION_2026-09-06.md for source hashes and review limits.
 * The marketing proof uses the SAME selected render as the playable demo.
 */
export const transformationExample = {
  photo: "/demo/example-photo.jpg",
  identitySheet: assets.identitySheet,
  scene: "beach",
  target: "sandcastle",
  sprite: publicBeachDemo("he").scenes[0]!.targets.find(t => t.id === "sandcastle")!.sprite,
} as const;
