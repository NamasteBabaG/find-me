import { Prisma } from "@prisma/client";
import { DbStorage } from "../infra/storage/db";
import { sqlTable } from "@/infra/db/sql-table";
import { isPlayable } from "@/domain/order-state";
import { deleteAdventureAlbum } from "./adventure-album.service";
import { parseGameConfig, type GameConfig } from "@/domain/game/config";
import { PACKAGES, isPackageTier } from "@/domain/package";
import type { Container } from "./container";
import { GameStatusConflict, statusOf, transitionGame } from "./game-status";
import { purgeAdminAlertNotifications } from "./admin-alert-deletion";
import { ensurePlayerLink, revokePlayerLinks } from "./share-link.service";
import { deleteAsset } from "./asset.service";
import type { Actor } from "./audit.service";
import { renderEvidenceIds, removeRenderEvidence } from "./generation/render-evidence";
import { isFixedWorldStyle } from "./generation/fixed-world-stage-record";
import { deleteFixedWorldGame } from "./generation/fixed-world-staging";
import { BOARD_CONDITIONED_QA_STYLE } from "./generation/board-conditioned-qa-job";
import { deleteBoardConditionedQaGame } from "./generation/board-conditioned-deletion";
import { BOARD_WIZARD_STYLE, deleteBoardConditionedWizard } from "./generation/board-conditioned-wizard";
import { deleteBoardWizardIdentityGame } from "./generation/board-wizard-identity-lifecycle";
import { LOCAL_PATCH_STYLE } from "./generation/local-patch-world";
import { deleteLocalPatchGame } from "./generation/local-patch-deletion";
import { avatarRepairLineageAssets, purgeAvatarRepairLineage } from "./generation/avatar-repair-lineage";

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
        sceneVersions: g.scenes.map(({ sceneSlug, sceneVersion }) => ({ sceneSlug, sceneVersion })),
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
  if (isFixedWorldStyle(g.styleVersion) || g.styleVersion === LOCAL_PATCH_STYLE) {
    // One conditional write: a concurrent fixed deletion must never be undone
    // by restoring the config read before its atomic purge.
    const configJson = g.configJson ? JSON.stringify({ ...parseGameConfig(g.configJson), gift: clean }) : null;
    const changed = await c.db.game.updateMany({ where: { id: gameId, ownerId: userId, deletedAt: null, updatedAt: g.updatedAt, styleVersion: g.styleVersion, configJson: g.configJson }, data: { giftJson: JSON.stringify(clean), configJson } });
    return changed.count === 1;
  }
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
  // Revoke before any engine-specific deletion. Failing closed is intentional:
  // even if asset cleanup needs a retry, an old consent link stays disabled.
  await c.db.$executeRaw(Prisma.sql`UPDATE ${sqlTable("PassportShare", c.databaseUrl)} SET "revokedAt" = ${new Date()}
    WHERE "revokedAt" IS NULL AND "familyChildId" IN
      (SELECT "familyChildId" FROM ${sqlTable("Game", c.databaseUrl)} WHERE "id" = ${gameId} AND "deletedAt" IS NULL
        ${userId ? Prisma.sql`AND "ownerId" = ${userId}` : Prisma.empty})`);
  const engine = await c.db.game.findUnique({ where: { id: gameId }, select: { styleVersion: true } });
  if (engine?.styleVersion === LOCAL_PATCH_STYLE) return deleteLocalPatchGame(c, gameId, actor, userId);
  if (engine?.styleVersion === BOARD_WIZARD_STYLE) return deleteBoardConditionedWizard(c, gameId, actor, userId);
  if (engine?.styleVersion === BOARD_CONDITIONED_QA_STYLE) return deleteBoardConditionedQaGame(c, gameId, actor, userId);
  if (engine && isFixedWorldStyle(engine.styleVersion)) return deleteFixedWorldGame(c, gameId, actor, userId);
  const identityDeletion = await deleteBoardWizardIdentityGame(c, gameId, actor, userId);
  if (identityDeletion && typeof identityDeletion === "object") {
    if (identityDeletion.rerouteFixedStyle === LOCAL_PATCH_STYLE) return deleteLocalPatchGame(c, gameId, actor, userId);
    // Enrollment can commit after the first style read. Its transactional
    // identity cleanup signal is terminal routing, never a legacy fallback or
    // an unbounded read/retry loop. Each fixed deleter rechecks its own engine.
    if (identityDeletion.rerouteFixedStyle === BOARD_WIZARD_STYLE) return deleteBoardConditionedWizard(c, gameId, actor, userId);
    if (identityDeletion.rerouteFixedStyle === BOARD_CONDITIONED_QA_STYLE) return deleteBoardConditionedQaGame(c, gameId, actor, userId);
    return deleteFixedWorldGame(c, gameId, actor, userId);
  }
  if (identityDeletion !== null) return identityDeletion;
  const g = await c.db.game.findFirst({
    where: { id: gameId, ...(userId ? { ownerId: userId } : {}), deletedAt: null },
    include: { childProfile: true, scenes: { include: { targets: { include: { variants: true } } } } },
  });
  if (!g) return false;
  // Refuse a corrupt/foreign derivative inventory before any legacy image cleanup.
  // A valid inventory is read again under the final lifecycle fence below.
  const repairAssets = g.childProfile ? await avatarRepairLineageAssets(c.db, { childId: g.childProfile.id, ownerId: g.ownerId }) : [];
  // A prepared first full-face recut may not have committed its lineage yet.
  // Its local-patch sibling's durable history still identifies this mixed graph.
  const localPatchSibling = g.childProfile && await c.db.game.findFirst({ where: { childProfileId: g.childProfile.id,
    styleVersion: LOCAL_PATCH_STYLE }, select: { id: true } });
  if (repairAssets.length || localPatchSibling) {
    const deleted = await deleteLegacyAvatarLineageGame(c, gameId, actor, userId, g.styleVersion);
    if (deleted) c.analytics.track("game_deleted", { gameId });
    return deleted;
  }
  await revokePlayerLinks(c, gameId, actor);
  for (const s of g.scenes) {
    for (const t of s.targets) {
      await deleteAsset(c, t.spriteAssetId);
      for (const v of t.variants) {
        await deleteAsset(c, v.assetId);
        for (const id of rejectedIds(v.rejectedAssetIdsJson)) await deleteAsset(c, id);
        const evidenceIds = renderEvidenceIds(v.usageJson);
        for (const id of evidenceIds) await deleteAsset(c, id);
        if (evidenceIds.length) await c.db.targetVariantAsset.update({ where: { id: v.id }, data: { usageJson: removeRenderEvidence(v.usageJson, new Set(evidenceIds)) } });
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
  // The family album goes with the game; a soft delete does not cascade. Taking
  // the config away and removing the album are ONE serializable step: the
  // account's save is guarded by the config it read, so a save landing between
  // two separate statements could re-create the album after the game was gone.
  await c.db.$transaction(async (tx) => {
    const fenced = await tx.game.updateMany({ where: { id: gameId, ownerId: g.ownerId, deletedAt: null,
      styleVersion: g.styleVersion, updatedAt: g.updatedAt }, data: { configJson: null } });
    if (fenced.count !== 1) throw new GameStatusConflict(gameId, statusOf(g), "DELETED");
    await transitionGame(c, gameId, "DELETED", actor, undefined, tx);
    if (g.childProfile) await purgeAvatarRepairLineage(tx, { gameId, childId: g.childProfile.id, ownerId: g.ownerId, now: new Date() });
    await purgeAdminAlertNotifications(tx, gameId);
    await deleteAdventureAlbum(tx, gameId, c.databaseUrl);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  c.analytics.track("game_deleted", { gameId });
  return true;
}

/** Only a legacy graph sharing local-patch display lineage takes this path.
 * Read it afresh and fence before touching any bytes/pointers: an avatar recut
 * committed after the outer route read must be deleted wholly or left wholly live. */
async function deleteLegacyAvatarLineageGame(c: Container, gameId: string, actor: Actor, userId: string | undefined,
  expectedStyle: string): Promise<boolean> {
  if (c.storage.id !== "db") throw Error("Display repair lineage requires transactional private storage");
  return c.db.$transaction(async tx => {
    const g = await tx.game.findFirst({ where: { id: gameId, ...(userId ? { ownerId: userId } : {}), deletedAt: null },
      include: { childProfile: true, scenes: { include: { targets: { include: { variants: true } } } } } });
    if (!g) return false;
    if (actor.type === "ADMIN") {
      const administrator = await tx.user.findUnique({ where: { id: actor.id }, select: { email: true } });
      if (!administrator || !(c.adminEmails ?? []).some(email => email.trim().toLowerCase() === administrator.email.trim().toLowerCase())) {
        throw Error("Administrator not authorized");
      }
    } else if (actor.type !== "USER" || actor.id !== g.ownerId || userId !== g.ownerId) {
      throw Error("Owner authorization required");
    }
    if (g.styleVersion !== expectedStyle) throw new GameStatusConflict(gameId, statusOf(g), "DELETED");
    const child = g.childProfile;
    const repairs = child ? await avatarRepairLineageAssets(tx, { childId: child.id, ownerId: g.ownerId }) : [];
    const repairIds = new Set(repairs.map(asset => asset.id));
    const scoped = { ...c, db: tx as Container["db"], storage: new DbStorage(tx) };
    const claim = await tx.game.updateMany({ where: { id: gameId, ownerId: g.ownerId, childProfileId: g.childProfileId,
      deletedAt: null, styleVersion: expectedStyle, status: g.status, updatedAt: g.updatedAt },
      data: { updatedAt: new Date(Math.max(Date.now(), g.updatedAt.getTime() + 1)) } });
    if (claim.count !== 1) throw new GameStatusConflict(gameId, statusOf(g), "DELETED");
    await transitionGame(scoped, gameId, "DELETED", actor, undefined, tx);
    await tx.generationJob.updateMany({ where: { gameId }, data: { status: "DONE", attempts: { increment: 1 },
      currentStep: null, stepsJson: "{}", lastError: null } });
    await tx.game.update({ where: { id: gameId }, data: { configJson: null } });
    await revokePlayerLinks(scoped, gameId, actor);
    const remove = (id: string | null | undefined) => id && repairIds.has(id) ? Promise.resolve() : deleteAsset(scoped, id);
    for (const scene of g.scenes) for (const target of scene.targets) {
      await remove(target.spriteAssetId);
      for (const variant of target.variants) {
        await remove(variant.assetId);
        for (const id of rejectedIds(variant.rejectedAssetIdsJson)) await remove(id);
        const evidenceIds = renderEvidenceIds(variant.usageJson);
        for (const id of evidenceIds) await remove(id);
        if (evidenceIds.length) await tx.targetVariantAsset.update({ where: { id: variant.id },
          data: { usageJson: removeRenderEvidence(variant.usageJson, new Set(evidenceIds)) } });
      }
      await tx.targetVariantAsset.updateMany({ where: { targetInstanceId: target.id }, data: { assetId: null, rejectedAssetIdsJson: null } });
    }
    if (child && await tx.game.count({ where: { childProfileId: child.id, deletedAt: null, NOT: { id: gameId } } }) === 0) {
      await remove(child.avatarAssetId); await remove(child.originalPhotoAssetId); await remove(child.identityAssetId);
      await purgeAvatarRepairLineage(tx, { gameId, childId: child.id, ownerId: g.ownerId, now: new Date() });
      await tx.childProfile.update({ where: { id: child.id },
        data: { avatarAssetId: null, originalPhotoAssetId: null, identityAssetId: null, photoCropJson: null, deletedAt: new Date() } });
    }
    await tx.gameScene.updateMany({ where: { gameId }, data: { configJson: null } });
    await purgeAdminAlertNotifications(tx, gameId);
    await deleteAdventureAlbum(tx, gameId, c.databaseUrl);
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

export function configFromGame(game: { configJson: string | null }): GameConfig | null {
  return game.configJson ? parseGameConfig(game.configJson) : null;
}
