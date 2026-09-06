import { beachDemoPatches } from "./beach-patches";

/** Demo-only artwork. No customer photograph or game asset belongs here.
 * See docs/CODEX_UI_IMPLEMENTATION_2026-09-06.md for source hashes and review limits.
 * The marketing proof uses the SAME selected render as the playable demo.
 */
export const transformationExample = {
  photo: "/demo/example-photo.jpg",
  identitySheet: "/demo/example-identity-no-hat.png",
  scene: "beach",
  target: "sandcastle",
  sprite: beachDemoPatches.sandcastle!,
} as const;
