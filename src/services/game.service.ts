import { isPlayable } from "@/domain/order-state";
import { parseGameConfig, type GameConfig } from "@/domain/game/config";
import { PACKAGES, isPackageTier } from "@/domain/package";
import type { Container } from "./container";
import { statusOf, transitionGame } from "./game-status";
import { ensurePlayerLink, revokePlayerLinks } from "./share-link.service";
import { deleteAsset } from "./asset.service";
import { audit, type Actor } from "./audit.service";

/** Library + owner actions. Everything here requires the owner's user id. */
export async function listGamesForUser(c: Container, userId: string) {
  const games = await c.db.game.findMany({
    where: { ownerId: userId, deletedAt: null, NOT: { status: { in: ["DRAFT", "PHOTO_UPLOADED", "PHOTO_VALIDATING", "PHOTO_REJECTED", "PHOTO_APPROVED", "CANCELLED", "DELETED"] } } },
    include: { childProfile: true, scenes: { orderBy: { orderIndex: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(
    games.map(async (g) => {
      const playable = isPlayable(statusOf(g));
      const link = playable ? await ensurePlayerLink(c, g.id) : null;
      return {
        id: g.id,
        title: g.title ?? "משחק",
        childName: g.childProfile?.displayName ?? "",
        avatarAssetId: g.childProfile?.avatarAssetId ?? null,
        status: statusOf(g),
        playable,
        sceneCount: g.scenes.length,
        sceneSlugs: g.scenes.map((s) => s.sceneSlug),
        packageName: g.packageTier && isPackageTier(g.packageTier) ? PACKAGES[g.packageTier].name : { en: "", he: "" },
        locale: g.locale === "he" ? ("he" as const) : ("en" as const),
        createdAt: g.createdAt,
        readyAt: g.readyAt,
        playUrl: link?.url ?? null,
      };
    }),
  );
}

export async function getOwnedGame(c: Container, gameId: string, userId: string) {
  const g = await c.db.game.findFirst({ where: { id: gameId, ownerId: userId, deletedAt: null }, include: { childProfile: true, scenes: { orderBy: { orderIndex: "asc" } }, orders: true } });
  if (!g) return null;
  const playable = isPlayable(statusOf(g));
  const link = playable ? await ensurePlayerLink(c, g.id) : null;
  const gift = g.giftJson ? (JSON.parse(g.giftJson) as { fromName?: string; message?: string }) : {};
  return { game: g, status: statusOf(g), playable, playUrl: link?.url ?? null, gift };
}

export async function updateGift(c: Container, gameId: string, userId: string, gift: { fromName?: string; message?: string }): Promise<boolean> {
  const g = await c.db.game.findFirst({ where: { id: gameId, ownerId: userId, deletedAt: null } });
  if (!g) return false;
  const clean = { fromName: gift.fromName?.trim().slice(0, 40) || undefined, message: gift.message?.trim().slice(0, 140) || undefined };
  await c.db.game.update({ where: { id: gameId }, data: { giftJson: JSON.stringify(clean) } });
  // Gift text is part of the play config → recompose the stored config in place.
  if (g.configJson) {
    const config = parseGameConfig(g.configJson);
    await c.db.game.update({ where: { id: gameId }, data: { configJson: JSON.stringify({ ...config, gift: clean }) } });
  }
  return true;
}

/** Soft delete + purge personal assets. Scene art is shared and untouched. */
/**
 * Every picture of this child that the game produced, not just the ones the
 * game draws with.
 *
 * Deletion used to take the composed sprite per hiding spot and, if no other
 * game needed them, the avatar and the original photo. It left behind the slot
 * patches themselves, every render QA threw out — kept on purpose, so a failing
 * spot can be looked at — and the identity sheet, which is the child drawn from
 * several angles and the single most identifying asset in the system.
 *
 * The copy promises deletion is complete and cannot be undone. That has to be
 * true of the whole graph or it is not true at all.
 */
function rejectedIds(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export async function deleteGame(c: Container, gameId: string, actor: Actor, userId?: string): Promise<boolean> {
  const g = await c.db.game.findFirst({
    where: { id: gameId, ...(userId ? { ownerId: userId } : {}), deletedAt: null },
    include: { childProfile: true, scenes: { include: { targets: { include: { variants: true } } } } },
  });
  if (!g) return false;
  await revokePlayerLinks(c, gameId, actor);
  for (const s of g.scenes) {
    for (const t of s.targets) {
      await deleteAsset(c, t.spriteAssetId);
      for (const v of t.variants) {
        await deleteAsset(c, v.assetId);
        for (const id of rejectedIds(v.rejectedAssetIdsJson)) await deleteAsset(c, id);
      }
      // The rows keep their shape for the audit trail; they stop pointing at
      // pictures.
      await c.db.targetVariantAsset.updateMany({ where: { targetInstanceId: t.id }, data: { assetId: null, rejectedAssetIdsJson: null } });
    }
  }
  if (g.childProfile) {
    const otherGames = await c.db.game.count({ where: { childProfileId: g.childProfile.id, deletedAt: null, NOT: { id: gameId } } });
    if (otherGames === 0) {
      await deleteAsset(c, g.childProfile.avatarAssetId);
      await deleteAsset(c, g.childProfile.originalPhotoAssetId);
      await deleteAsset(c, g.childProfile.identityAssetId);
      await c.db.childProfile.update({
        where: { id: g.childProfile.id },
        data: { avatarAssetId: null, originalPhotoAssetId: null, identityAssetId: null, photoCropJson: null, deletedAt: new Date() },
      });
    }
  }
  await c.db.game.update({ where: { id: gameId }, data: { configJson: null } });
  await transitionGame(c, gameId, "DELETED", actor);
  c.analytics.track("game_deleted", { gameId });
  return true;
}

export function configFromGame(game: { configJson: string | null }): GameConfig | null {
  return game.configJson ? parseGameConfig(game.configJson) : null;
}
