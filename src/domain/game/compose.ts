import type { SceneDefinition } from "../scene/schema";
import type { PackageTier } from "../package";
import { fillTemplate } from "@/lib/copy";
import { pick, type Locale } from "@/i18n/config";
import type { GameConfig, PlayWorld, SceneConfig, SpriteRef, TargetAdjust, TargetConfig } from "./config";
import type { WorldDefinition } from "../world";

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
  spriteByVariant?: { A?: SpriteRef; B?: SpriteRef };
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
      spriteByVariant: spriteInput.spriteByVariant,
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

/** WorldDefinition + child + locale → the map the player runtime draws. */
export function composeWorld(world: WorldDefinition, child: ComposeChild, locale: Locale): PlayWorld {
  const vars = { name: child.name };
  const l = (text: { en: string; he: string }) => fillTemplate(pick(text, locale), vars);
  return {
    slug: world.slug,
    version: world.version,
    name: l(world.name),
    tagline: l(world.tagline),
    intro: l(world.intro),
    map: world.map,
    nodes: [...world.nodes].sort((a, b) => a.routeIndex - b.routeIndex),
    collectible: { id: world.collectible.id, name: l(world.collectible.name), piece: l(world.collectible.piece), icon: world.collectible.icon },
    completion: { title: l(world.completion.title), text: l(world.completion.text), icon: world.completion.icon },
  };
}

export function composeGame(input: {
  gameId: string;
  child: ComposeChild;
  packageTier: PackageTier;
  styleVersion: string;
  locale: Locale;
  scenes: SceneConfig[];
  worlds?: PlayWorld[];
  world?: PlayWorld;
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
    worlds: input.worlds,
    // Still written so a runtime that only knows about one world keeps working.
    world: input.world ?? input.worlds?.[0],
    gift: input.gift,
    composedAt: (input.now ?? new Date()).toISOString(),
  };
}
