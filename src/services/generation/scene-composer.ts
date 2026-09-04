import { composeGame, composeScene, composeWorld, type TargetSpriteInput } from "@/domain/game/compose";
import { TargetAdjustSchema, type GameConfig, type SceneConfig, type SpriteRef } from "@/domain/game/config";
import { isPackageTier } from "@/domain/package";
import type { Locale } from "@/i18n/config";
import type { Container } from "../container";
import { signedAssetUrl } from "../asset.service";
import { sceneBySlug } from "../scene-catalog.service";
import { worldForBoard } from "../world-catalog.service";

/**
 * Resolves DB rows into the player-facing GameConfig. This is the ONLY place
 * that turns asset ids into URLs — and it only ever signs GAME-visibility
 * assets, so the original photo cannot leak into the config by construction.
 */
export async function composeGameConfig(c: Container, gameId: string): Promise<GameConfig> {
  const game = await c.db.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { childProfile: true, scenes: { orderBy: { orderIndex: "asc" }, include: { targets: { include: { variants: true } } } } },
  });
  if (!game.childProfile) throw new Error("composeGameConfig: game has no child profile");
  if (!game.childProfile.avatarAssetId) throw new Error("composeGameConfig: avatar not generated yet");
  if (!game.packageTier || !isPackageTier(game.packageTier)) throw new Error("composeGameConfig: no package");

  const avatar = await c.db.asset.findUniqueOrThrow({ where: { id: game.childProfile.avatarAssetId } });
  if (avatar.visibility !== "GAME") throw new Error("composeGameConfig: avatar asset must be GAME-visible");
  const avatarUrl = signedAssetUrl(c, avatar.id);
  const child = { name: game.childProfile.displayName, avatarUrl };
  const locale: Locale = game.locale === "he" ? "he" : "en";

  const scenes: SceneConfig[] = [];
  for (const gs of game.scenes) {
    const def = sceneBySlug(gs.sceneSlug);
    const sprites: TargetSpriteInput[] = [];
    for (const t of gs.targets) {
      const target = def.targets.find((x) => x.id === t.targetId);
      if (!target) throw new Error(`target ${t.targetId} missing from scene ${def.slug}`);
      const fallback: SpriteRef = { kind: "composed", faceUrl: avatarUrl, bodyTemplate: target.bodyTemplate };

      // A slot patch belongs to ONE hiding spot, so each variant has its own.
      const byVariant: { A?: SpriteRef; B?: SpriteRef } = {};
      for (const v of t.variants ?? []) {
        if (v.status !== "GENERATED" && v.status !== "APPROVED") continue;
        const ref = await patchSprite(c, v);
        if (ref) byVariant[v.variant === "B" ? "B" : "A"] = ref;
      }

      let sprite: SpriteRef | undefined = byVariant.A ?? byVariant.B;
      if (!sprite && t.spriteKind === "image" && t.spriteAssetId) {
        const asset = await c.db.asset.findUniqueOrThrow({ where: { id: t.spriteAssetId } });
        if (asset.visibility !== "GAME") throw new Error(`sprite asset ${asset.id} must be GAME-visible`);
        sprite = { kind: "image", url: signedAssetUrl(c, asset.id), width: asset.width ?? 512, height: asset.height ?? 512 };
      }
      const adjust = t.adjustJson ? TargetAdjustSchema.parse(JSON.parse(t.adjustJson)) : undefined;
      sprites.push({
        targetId: t.targetId,
        sprite: sprite ?? fallback,
        spriteByVariant: byVariant.A || byVariant.B ? byVariant : undefined,
        adjust,
      });
    }
    const world = worldForBoard(gs.sceneSlug);
    scenes.push({ ...composeScene(def, child, sprites, locale), worldSlug: world?.slug });
  }

  const gift = game.giftJson ? (JSON.parse(game.giftJson) as { fromName?: string; message?: string }) : undefined;

  // Every journey these boards belong to, in order, each with its own map and
  // keepsake. This used to be `worldForBoard(scenes[0])` — one world, taken from
  // whichever board happened to be first — so a two-world game drew all eighteen
  // boards on world one's map and counted them 10/9 against its nine nodes.
  const worlds = [];
  const seen = new Set<string>();
  for (const gs of game.scenes) {
    const world = worldForBoard(gs.sceneSlug);
    if (!world || seen.has(world.slug)) continue;
    seen.add(world.slug);
    worlds.push(composeWorld(world, child, locale));
  }
  return composeGame({
    gameId: game.id,
    child,
    packageTier: game.packageTier,
    styleVersion: game.styleVersion,
    locale,
    scenes,
    worlds,
    gift,
  });
}

export async function persistGameConfig(c: Container, gameId: string): Promise<GameConfig> {
  const config = await composeGameConfig(c, gameId);
  await c.db.game.update({ where: { id: gameId }, data: { configJson: JSON.stringify(config) } });
  for (const scene of config.scenes) {
    await c.db.gameScene.update({ where: { gameId_sceneSlug: { gameId, sceneSlug: scene.slug } }, data: { configJson: JSON.stringify(scene) } });
  }
  return config;
}

/**
 * One generated hiding spot → the sprite the renderer draws. The geometry
 * travels with the sprite because where a patch is drawn is not where the child
 * can be tapped (see src/game/engine/target-geometry.ts).
 */
async function patchSprite(c: Container, v: { assetId: string | null; rectJson: string | null; hitRectJson: string | null; headAnchorJson: string | null }): Promise<SpriteRef | null> {
  if (!v.assetId) return null;
  const asset = await c.db.asset.findUnique({ where: { id: v.assetId } });
  if (!asset || asset.status !== "READY") return null;
  if (asset.visibility !== "GAME") throw new Error(`patch asset ${asset.id} must be GAME-visible`);
  const json = <T,>(raw: string | null): T | undefined => (raw ? (JSON.parse(raw) as T) : undefined);
  return {
    kind: "image",
    url: signedAssetUrl(c, asset.id),
    width: asset.width ?? 512,
    height: asset.height ?? 512,
    rect: json<{ x: number; y: number; w: number; h: number }>(v.rectJson),
    hitRect: json<{ x: number; y: number; w: number; h: number }>(v.hitRectJson),
    anchor: json<{ x: number; y: number }>(v.headAnchorJson),
  };
}
