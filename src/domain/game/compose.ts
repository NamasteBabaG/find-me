import type { SceneDefinition } from "../scene/schema";
import type { PackageTier } from "../package";
import { fillTemplate } from "@/lib/copy";
import { pick, type Locale } from "@/i18n/config";
import type { GameConfig, SceneConfig, SpriteRef, TargetAdjust, TargetConfig } from "./config";

/**
 * Pure composition: SceneDefinition + child + sprites + locale → SceneConfig.
 * No I/O here; the SceneComposer service resolves assets into signed URLs
 * and then calls these functions. The output is single-language and
 * already personalised — the player runtime never sees templates.
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

export function composeScene(scene: SceneDefinition, child: ComposeChild, sprites: readonly TargetSpriteInput[], locale: Locale): SceneConfig {
  const vars = { name: child.name };
  const l = (t: { en: string; he: string }) => fillTemplate(pick(t, locale), vars);

  const targets: TargetConfig[] = scene.targets.map((t) => {
    const spriteInput = sprites.find((s) => s.targetId === t.id);
    if (!spriteInput) throw new Error(`composeScene: missing sprite for target "${t.id}" in scene "${scene.slug}"`);
    return {
      id: t.id,
      targetType: t.targetType,
      difficulty: t.difficulty,
      mission: l(t.mission),
      item: l(t.item),
      success: t.success.map(l),
      animation: t.animation,
      slots: t.slots.map((s) => ({ ...s, hintText: l(s.hintText) })) as TargetConfig["slots"],
      sprite: spriteInput.sprite,
      adjust: spriteInput.adjust,
    };
  });

  return {
    slug: scene.slug,
    version: scene.version,
    name: l(scene.name),
    tagline: l(scene.tagline),
    artStatus: scene.artStatus,
    art: scene.art,
    intro: scene.intro,
    targets,
    ambient: scene.ambient.map((a) => ({ ...a, label: l(a.label), reaction: a.reaction ? l(a.reaction) : undefined })),
    bonus: scene.bonus
      ? { ...scene.bonus, name: l(scene.bonus.name), prompt: l(scene.bonus.prompt), slots: scene.bonus.slots.map((s) => ({ ...s, hintText: l(s.hintText) })) as SceneConfig["targets"][number]["slots"] }
      : undefined,
    celebration: { kind: scene.celebration.kind, completeText: l(scene.celebration.completeText) },
    collectible: { ...scene.collectible, name: l(scene.collectible.name) },
    sounds: scene.sounds,
  };
}

export function composeGame(input: {
  gameId: string;
  child: ComposeChild;
  packageTier: PackageTier;
  styleVersion: string;
  locale: Locale;
  scenes: SceneConfig[];
  gift?: { fromName?: string; message?: string };
  now?: Date;
}): GameConfig {
  return {
    version: 1,
    gameId: input.gameId,
    locale: input.locale,
    child: { name: input.child.name, avatarUrl: input.child.avatarUrl },
    styleVersion: input.styleVersion,
    packageTier: input.packageTier,
    scenes: input.scenes,
    gift: input.gift,
    composedAt: (input.now ?? new Date()).toISOString(),
  };
}
