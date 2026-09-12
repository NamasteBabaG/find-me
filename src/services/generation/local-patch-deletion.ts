import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import type { Actor } from "../audit.service";
import { newId } from "../../lib/ids";
import { LOCAL_PATCH_STYLE, localPatchPrivateInventory } from "./local-patch-world";
import { LOCAL_PATCH_PROVIDER } from "./local-patch-hide";
import { localPatchNotificationPrefix } from "../local-patch-notifications";

function demand(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`LOCAL_PATCH_DELETE: ${message}`);
}

/** Preserve aliases and other games'/children's assets, even for one owner. */
async function sharedElsewhere(tx: Prisma.TransactionClient, asset: { id: string; storagePath: string }, gameId: string, childId: string | null) {
  const aliases = await tx.asset.findMany({ where: { storagePath: asset.storagePath }, select: { id: true } });
  const ids = aliases.map(a => a.id);
  return aliases.length !== 1
    || await tx.childProfile.count({ where: { ...(childId ? { NOT: { id: childId } } : {}), OR: [
      { originalPhotoAssetId: { in: ids } }, { identityAssetId: { in: ids } }, { avatarAssetId: { in: ids } },
    ] } }) > 0
    || await tx.targetInstance.count({ where: { gameScene: { gameId: { not: gameId } }, spriteAssetId: { in: ids } } }) > 0
    || await tx.targetVariantAsset.count({ where: { targetInstance: { gameScene: { gameId: { not: gameId } } }, assetId: { in: ids } } }) > 0;
}

/** One transaction stops the game, revokes its lease and links, and purges the
 * exact private graph, including retained replies and unlinked late-worker rows.
 * The separate metadata-only budget deliberately survives the deletion. */
export async function deleteLocalPatchGame(c: Container, gameId: string, actor: Actor, userId?: string): Promise<boolean> {
  demand(c.storage.id === "db", "DB-backed private storage required");
  return c.db.$transaction(async tx => {
    const game = await tx.game.findUnique({ where: { id: gameId }, include: { childProfile: true } });
    if (!game || game.deletedAt || game.status === "DELETED" || userId && userId !== game.ownerId) return false;
    demand(game.styleVersion === LOCAL_PATCH_STYLE, "Wrong deletion engine");
    if (actor.type === "ADMIN") {
      const administrator = await tx.user.findUnique({ where: { id: actor.id }, select: { email: true } });
      demand(administrator && (c.adminEmails ?? []).some(email => email.trim().toLowerCase() === administrator.email.trim().toLowerCase()), "Administrator not authorized");
    } else demand(actor.type === "USER" && actor.id === game.ownerId && userId === game.ownerId, "Owner authorization required");

    const now = new Date();
    const fenced = await tx.game.updateMany({ where: { id: gameId, updatedAt: game.updatedAt, deletedAt: null, styleVersion: LOCAL_PATCH_STYLE },
      data: { status: "DELETED", deletedAt: now, configJson: null, title: null, giftJson: null, lastError: null, draftToken: null } });
    demand(fenced.count === 1, "Deletion lost its game fence");
    // Revoking the numeric claim also defeats a worker's delayed catch/release.
    await tx.generationJob.updateMany({ where: { gameId }, data: {
      status: "DONE", attempts: { increment: 1 }, currentStep: null, stepsJson: "{}", lastError: null,
    } });
    const inventory = await localPatchPrivateInventory({ db: tx }, gameId);
    const keys = new Set(inventory.retainedPurchaseKeys), ids = new Set<string>();
    // Immutable email bodies can contain the child's name and bearer play link.
    // They belong to this game's private graph, never to the accounting ledger.
    for (const blob of await tx.fileBlob.findMany({ where: { key: { startsWith: localPatchNotificationPrefix(gameId) } }, select: { key: true } })) keys.add(blob.key);
    await tx.auditLog.updateMany({ where: { entityType: "Game", entityId: gameId, action: "local-patch:notification-pending" },
      data: { action: "local-patch:notification-cancelled" } });
    let sharedAssetsRetained = 0;
    for (const asset of await tx.asset.findMany({ where: { id: { in: inventory.assetIds } } })) {
      demand(asset.ownerId === game.ownerId && asset.provider === LOCAL_PATCH_PROVIDER && asset.providerRequestId === gameId
        && ["TARGET_SPRITE", "REJECTED_PATCH"].includes(asset.type) && ["PRIVATE", "GAME"].includes(asset.visibility)
        && asset.storagePath === `${asset.visibility.toLowerCase()}/${asset.id}.png`, "Private image ownership or purpose changed");
      if (await sharedElsewhere(tx, asset, gameId, null)) { sharedAssetsRetained++; continue; }
      keys.add(asset.storagePath); ids.add(asset.id);
    }

    const child = game.childProfile;
    const sharedChild = !!child && await tx.game.count({ where: { childProfileId: child.id, deletedAt: null, NOT: { id: gameId } } }) > 0;
    if (child && !sharedChild) {
      demand(child.ownerId === game.ownerId, "Child ownership changed");
      for (const [assetId, type] of [[child.identityAssetId, "IDENTITY_SHEET"], [child.avatarAssetId, "AVATAR"], [child.originalPhotoAssetId, "ORIGINAL_PHOTO"]] as const) {
        if (!assetId) continue;
        const asset = await tx.asset.findUniqueOrThrow({ where: { id: assetId } });
        demand(asset.ownerId === game.ownerId && asset.type === type
          && (asset.visibility === "PRIVATE" || type === "AVATAR" && asset.visibility === "GAME"), "Child asset ownership or purpose changed");
        if (await sharedElsewhere(tx, asset, gameId, child.id)) { sharedAssetsRetained++; continue; }
        keys.add(asset.storagePath); ids.add(asset.id);
      }
      await tx.childProfile.update({ where: { id: child.id }, data: {
        identityAssetId: null, avatarAssetId: null, originalPhotoAssetId: null, photoCropJson: null, deletedAt: now,
      } });
    }
    const purged = await tx.fileBlob.deleteMany({ where: { key: { in: [...keys] } } });
    await tx.asset.updateMany({ where: { id: { in: [...ids] } }, data: { status: "DELETED", deletedAt: now } });
    await tx.targetVariantAsset.updateMany({ where: { targetInstance: { gameScene: { gameId } } }, data: {
      assetId: null, rejectedAssetIdsJson: null, judgeJson: null, usageJson: null, lastError: null,
    } });
    await tx.targetInstance.updateMany({ where: { gameScene: { gameId } }, data: { spriteAssetId: null } });
    await tx.gameScene.updateMany({ where: { gameId }, data: { configJson: null } });
    await tx.shareLink.updateMany({ where: { gameId }, data: { active: false, revokedAt: now } });
    await tx.auditLog.create({ data: { id: newId("aud"), actorType: actor.type, actorId: "id" in actor ? actor.id : null,
      action: "local_patch.deleted", entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ privateKeysPurged: purged.count, assetsPurged: ids.size, sharedAssetsRetained, sharedChildPreserved: sharedChild, accountingRetained: true }) } });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}
