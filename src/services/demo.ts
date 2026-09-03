import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { composeGame, composeScene } from "@/domain/game/compose";
import type { GameConfig, SpriteRef } from "@/domain/game/config";
import { getDict } from "@/i18n";
import { fillTemplate } from "@/lib/copy";
import type { Locale } from "@/i18n/config";
import { sceneBySlug } from "./scene-catalog.service";

/**
 * Landing-page demo: a fixed illustrated child ("Maya") hiding in the beach.
 * Pure data — no DB, no photo — so the demo is safe to serve to anyone.
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
const DEMO_NAME: Record<Locale, string> = { en: "Anna", he: "נועה" };
/** The hiding spot the landing demo uses: she kneels by the sandcastle, hat and all. */
export const DEMO_TARGET_ID = "sandcastle";

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
  // The demo asks one thing only: find her by the straw hat. Making that spot the
  // easiest puts it first in the plan, so `singleMission` lands on it.
  const demoMission = fillTemplate(getDict(locale).home.demo.mission, { name: child.name });
  const easiest = Math.min(...sceneConfig.targets.map((t) => t.difficulty)) as 1 | 2 | 3;
  const chosen = sceneConfig.targets.find((t) => t.id === DEMO_TARGET_ID);
  if (chosen) {
    chosen.difficulty = easiest;
    chosen.mission = demoMission;
    // The "wrong one" line quotes the item, so it has to say hat too.
    chosen.item = getDict(locale).home.demo.item;
    // The planner sorts by difficulty with a stable sort, so first-among-equals wins.
    sceneConfig.targets = [chosen, ...sceneConfig.targets.filter((t) => t !== chosen)] as typeof sceneConfig.targets;
  }

  return composeGame({ gameId: "demo", child, packageTier: "SMALL", styleVersion: "collage-v1", locale, scenes: [sceneConfig], now: new Date(0) });
}
