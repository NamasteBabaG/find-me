import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { composeGame, composeScene, composeWorld } from "@/domain/game/compose";
import { worldOfBoard } from "../../content/worlds";
import type { GameConfig, SpriteRef } from "@/domain/game/config";
import type { Locale } from "@/i18n/config";
import { sceneBySlug } from "./scene-catalog.service";
import { beachDemoPatches } from "../../content/demo/beach-patches";

/**
 * Landing-page demo: a fixed illustrated child (Anna / נועה) hiding in a world.
 * Pure data — no DB, no photo — so the demo is safe to serve to anyone, and it
 * uses whatever slot patches exist for that world (all nine have some).
 */
// The identity cue is neutral: accessories belong to a hiding spot, not the face
// the child is asked to recognise. Versioned URL also avoids stale hat avatars.
const DEMO_FACE = "/demo/noa-portrait.png";

type ArtRect = { x: number; y: number; w: number; h: number };
type PatchMeta = { sceneVersion?: number; artSha256?: string; url: string; rect: { w: number; h: number }; rectNorm: ArtRect; hitRectNorm?: ArtRect; anchorNorm?: { x: number; y: number } };

/** A slot patch made by scripts/slot-patch.ts for this scene/target/variant, if present. */
function demoPatch(slug: string, targetId: string, variant: "A" | "B"): SpriteRef | null {
  // Explicit versioned set: a missing new asset must never restore a legacy hat.
  if (slug === "beach") return variant === "A" ? beachDemoPatches[targetId] ?? null : null;
  const file = path.join(process.cwd(), "public", "demo", "patches", `${slug}-${targetId}-${variant}.json`);
  if (!existsSync(file)) return null;
  try {
    const m = JSON.parse(readFileSync(file, "utf-8")) as PatchMeta;
    const scene = sceneBySlug(slug);
    if (m.sceneVersion !== scene.version && !(m.sceneVersion === undefined && scene.version === 1)) return null;
    if (scene.art.sha256 && m.artSha256 !== scene.art.sha256) return null;
    // hitRect/anchor come from the patch's own alpha: tapping the head has to count.
    return { kind: "image", url: m.url, width: m.rect.w, height: m.rect.h, rect: m.rectNorm, hitRect: m.hitRectNorm, anchor: m.anchorNorm };
  } catch {
    return null;
  }
}

/**
 * Which hiding spots of a world already have a patch of the demo child.
 *
 * Counts compatible saved demo assets, NOT independent quality certification.
 * Old-art patches never count toward the newly adopted board's coverage.
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
  if (scene.slug === "beach") {
    // These inpainted patches already preserve the board's occluders. The old
    // separate parasols were authored for earlier beach art and appear twice
    // over the current 3072x2048 painting. Do not apply them to this demo set.
    sceneConfig.art = { ...sceneConfig.art, foreground: undefined };
  }
  const world = worldOfBoard(scene.slug);
  return composeGame({
    gameId: "demo",
    child,
    packageTier: "ONE_WORLD",
    styleVersion: "collage-v1",
    locale,
    scenes: [sceneConfig],
    world: world ? composeWorld(world, child, locale) : undefined,
    now: new Date(0),
  });
}
