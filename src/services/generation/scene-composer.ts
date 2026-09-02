import { composeGame, composeScene, type TargetSpriteInput } from "@/domain/game/compose";
import { TargetAdjustSchema, type GameConfig, type SceneConfig, type SpriteRef } from "@/domain/game/config";
import { isPackageTier } from "@/domain/package";
import type { Container } from "../container";
import { signedAssetUrl } from "../asset.service";
import { sceneBySlug } from "../scene-catalog.service";

/**
 * Resolves DB rows into the player-facing GameConfig. This is the ONLY place
 * that turns asset ids into URLs — and it only ever signs GAME-visibility
 * assets, so the original photo cannot leak into the config by construction.
 */
export async function composeGameConfig(c: Container, gameId: string): Promise<GameConfig> {
  const game = await c.db.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { childProfile: true, scenes: { orderBy: { orderIndex: "asc" }, include: { targets: true } } },
  });
  if (!game.childProfile) throw new Error("composeGameConfig: game has no child profile");
  if (!game.childProfile.avatarAssetId) throw new Error("composeGameConfig: avatar not generated yet");
  if (!game.packageTier || !isPackageTier(game.packageTier)) throw new Error("composeGameConfig: no package");

  const avatar = await c.db.asset.findUniqueOrThrow({ where: { id: game.childProfile.avatarAssetId } });
  if (avatar.visibility !== "GAME") throw new Error("composeGameConfig: avatar asset must be GAME-visible");
  const avatarUrl = signedAssetUrl(c, avatar.id);
  const child = { name: game.childProfile.displayName, avatarUrl };

  const scenes: SceneConfig[] = [];
  for (const gs of game.scenes) {
    const def = sceneBySlug(gs.sceneSlug);
    const sprites: TargetSpriteInput[] = [];
    for (const t of gs.targets) {
      let sprite: SpriteRef;
      if (t.spriteKind === "image" && t.spriteAssetId) {
        const asset = await c.db.asset.findUniqueOrThrow({ where: { id: t.spriteAssetId } });
        if (asset.visibility !== "GAME") throw new Error(`sprite asset ${asset.id} must be GAME-visible`);
        sprite = { kind: "image", url: signedAssetUrl(c, asset.id), width: asset.width ?? 512, height: asset.height ?? 512 };
      } else {
        const target = def.targets.find((x) => x.id === t.targetId);
        if (!target) throw new Error(`target ${t.targetId} missing from scene ${def.slug}`);
        sprite = { kind: "composed", faceUrl: avatarUrl, bodyTemplate: target.bodyTemplate };
      }
      const adjust = t.adjustJson ? TargetAdjustSchema.parse(JSON.parse(t.adjustJson)) : undefined;
      sprites.push({ targetId: t.targetId, sprite, adjust });
    }
    scenes.push(composeScene(def, child, sprites));
  }

  const gift = game.giftJson ? (JSON.parse(game.giftJson) as { fromName?: string; message?: string }) : undefined;

  return composeGame({ gameId: game.id, child, packageTier: game.packageTier, styleVersion: game.styleVersion, scenes, gift });
}

export async function persistGameConfig(c: Container, gameId: string): Promise<GameConfig> {
  const config = await composeGameConfig(c, gameId);
  await c.db.game.update({ where: { id: gameId }, data: { configJson: JSON.stringify(config) } });
  for (const scene of config.scenes) {
    await c.db.gameScene.update({ where: { gameId_sceneSlug: { gameId, sceneSlug: scene.slug } }, data: { configJson: JSON.stringify(scene) } });
  }
  return config;
}
