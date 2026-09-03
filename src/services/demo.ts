import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { composeGame, composeScene } from "@/domain/game/compose";
import type { GameConfig, SpriteRef } from "@/domain/game/config";
import type { Locale } from "@/i18n/config";
import { sceneBySlug } from "./scene-catalog.service";

/**
 * Landing-page demo: a fixed illustrated child (Anna / נועה) hiding in a world.
 * Pure data — no DB, no photo — so the demo is safe to serve to anyone, and it
 * uses whatever slot patches exist for that world (all nine have some).
 */
const DEMO_FACE = "/demo/noa-face.png";

type ArtRect = { x: number; y: number; w: number; h: number };
type PatchMeta = { url: string; rect: { w: number; h: number }; rectNorm: ArtRect; hitRectNorm?: ArtRect; anchorNorm?: { x: number; y: number } };

/** A slot patch made by scripts/slot-patch.ts for this scene/target/variant, if present. */
function demoPatch(slug: string, targetId: string, variant: "A" | "B"): SpriteRef | null {
  const file = path.join(process.cwd(), "public", "demo", "patches", `${slug}-${targetId}-${variant}.json`);
  if (!existsSync(file)) return null;
  try {
    const m = JSON.parse(readFileSync(file, "utf-8")) as PatchMeta;
    // hitRect/anchor come from the patch's own alpha: tapping the head has to count.
    return { kind: "image", url: m.url, width: m.rect.w, height: m.rect.h, rect: m.rectNorm, hitRect: m.hitRectNorm, anchor: m.anchorNorm };
  } catch {
    return null;
  }
}

/**
 * Which hiding spots of a world already have a patch of the demo child.
 *
 * This is how "is this board ready to receive a child?" is answered in the
 * admin: a world with 6 of 6 has been proven end to end, a world with 0 has
 * only ever been looked at.
 */
export function demoPatchCoverage(slug: string, targets: readonly { id: string }[]): { ready: number; total: number; missing: string[] } {
  const missing: string[] = [];
  for (const t of targets) {
    for (const variant of ["A", "B"] as const) {
      if (!demoPatch(slug, t.id, variant)) missing.push(`${t.id}/${variant}`);
    }
  }
  const total = targets.length * 2;
  return { ready: total - missing.length, total, missing };
}

const DEMO_NAME: Record<Locale, string> = { en: "Anna", he: "נועה" };

export function buildDemoConfig(locale: Locale, slug = "beach", name?: string): GameConfig {
  const scene = sceneBySlug(slug);
  const child = { name: name ?? DEMO_NAME[locale], avatarUrl: DEMO_FACE };
  const sceneConfig = composeScene(
    scene,
    child,
    scene.targets.map((t) => {
      const composed: SpriteRef = { kind: "composed", faceUrl: DEMO_FACE, bodyTemplate: t.bodyTemplate };
      const A = demoPatch(scene.slug, t.id, "A");
      const B = demoPatch(scene.slug, t.id, "B");
      return { targetId: t.id, sprite: A ?? composed, spriteByVariant: A || B ? { A: A ?? undefined, B: B ?? undefined } : undefined };
    }),
    locale,
  );
  return composeGame({ gameId: "demo", child, packageTier: "SMALL", styleVersion: "collage-v1", locale, scenes: [sceneConfig], now: new Date(0) });
}
