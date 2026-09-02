import type { SceneDefinition } from "../scene/schema";
import type { PackageTier } from "../package";
import { fillAll, fillTemplate } from "@/lib/copy";
import type { GameConfig, SceneConfig, SpriteRef, TargetAdjust, TargetConfig } from "./config";

/**
 * Pure composition: SceneDefinition + child + sprites → SceneConfig.
 * No I/O here; the SceneComposer service resolves assets into signed URLs
 * and then calls these functions.
 */

export interface ComposeChild {
  name: string;
  avatarUrl: string;
}

export interface TargetSpriteInput {
  targetId: string;
  sprite: SpriteRef;
  adjust?: TargetAdjust;
}

export function composeScene(scene: SceneDefinition, child: ComposeChild, sprites: readonly TargetSpriteInput[]): SceneConfig {
  const vars = { name: child.name };
  const targets: TargetConfig[] = scene.targets.map((t) => {
    const spriteInput = sprites.find((s) => s.targetId === t.id);
    if (!spriteInput) throw new Error(`composeScene: missing sprite for target "${t.id}" in scene "${scene.slug}"`);
    return {
      id: t.id,
      targetType: t.targetType,
      difficulty: t.difficulty,
      mission: fillTemplate(t.mission, vars),
      item: t.item,
      success: fillAll(t.success, vars),
      animation: t.animation,
      slots: t.slots,
      sprite: spriteInput.sprite,
      adjust: spriteInput.adjust,
    };
  });

  return {
    slug: scene.slug,
    version: scene.version,
    name: scene.name,
    tagline: scene.tagline,
    artStatus: scene.artStatus,
    art: scene.art,
    intro: scene.intro,
    targets,
    ambient: scene.ambient,
    bonus: scene.bonus,
    celebration: { kind: scene.celebration.kind, completeText: fillTemplate(scene.celebration.completeText, vars) },
    collectible: scene.collectible,
    sounds: scene.sounds,
  };
}

export function composeGame(input: {
  gameId: string;
  child: ComposeChild;
  packageTier: PackageTier;
  styleVersion: string;
  scenes: SceneConfig[];
  gift?: { fromName?: string; message?: string };
  now?: Date;
}): GameConfig {
  return {
    version: 1,
    gameId: input.gameId,
    child: { name: input.child.name, avatarUrl: input.child.avatarUrl },
    styleVersion: input.styleVersion,
    packageTier: input.packageTier,
    scenes: input.scenes,
    gift: input.gift,
    composedAt: (input.now ?? new Date()).toISOString(),
  };
}
