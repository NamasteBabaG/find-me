import { composeGame, composeScene } from "@/domain/game/compose";
import type { GameConfig } from "@/domain/game/config";
import type { Locale } from "@/i18n/config";
import { sceneBySlug } from "./scene-catalog.service";

/**
 * Landing-page demo: a fixed illustrated child ("Maya") hiding in the beach.
 * Pure data — no DB, no photo — so the demo is safe to serve to anyone.
 */
const DEMO_FACE = "/demo/noa-face.png";
const DEMO_NAME: Record<Locale, string> = { en: "Noa", he: "נועה" };

export function buildDemoConfig(locale: Locale, slug = "beach", name?: string): GameConfig {
  const scene = sceneBySlug(slug);
  const child = { name: name ?? DEMO_NAME[locale], avatarUrl: DEMO_FACE };
  const sceneConfig = composeScene(
    scene,
    child,
    scene.targets.map((t) => ({ targetId: t.id, sprite: { kind: "composed" as const, faceUrl: DEMO_FACE, bodyTemplate: t.bodyTemplate } })),
    locale,
  );
  return composeGame({ gameId: "demo", child, packageTier: "SMALL", styleVersion: "collage-v1", locale, scenes: [sceneConfig], now: new Date(0) });
}
