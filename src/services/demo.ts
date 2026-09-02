import { composeGame, composeScene } from "@/domain/game/compose";
import type { GameConfig } from "@/domain/game/config";
import { sceneBySlug } from "./scene-catalog.service";

/**
 * Landing-page demo: a fixed illustrated child ("מאיה") hiding in the beach.
 * Pure data — no DB, no photo — so the demo is safe to serve to anyone.
 */
const DEMO_FACE = "/demo/maya-face.svg";

export function buildDemoConfig(slug = "beach", name = "מאיה"): GameConfig {
  const scene = sceneBySlug(slug);
  const child = { name, avatarUrl: DEMO_FACE };
  const sceneConfig = composeScene(
    scene,
    child,
    scene.targets.map((t) => ({ targetId: t.id, sprite: { kind: "composed" as const, faceUrl: DEMO_FACE, bodyTemplate: t.bodyTemplate } })),
  );
  return composeGame({ gameId: "demo", child, packageTier: "SMALL", styleVersion: "collage-v1", scenes: [sceneConfig], now: new Date(0) });
}
