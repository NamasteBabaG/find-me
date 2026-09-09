import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import type { Actor } from "../audit.service";
import { env } from "../../lib/env";
import { newId } from "../../lib/ids";
import { boardConditionedCheckpointKeys } from "../../infra/db/board-conditioned-checkpoints";
import { BOARD_CONDITIONED_QA_STYLE, BoardConditionedQaJobError, boardConditionedQaPrivateInventory, boardQaReferenceLineageKey } from "./board-conditioned-qa-job";

function demand(value: unknown, code: "permission" | "unsupported" | "integrity" | "identity" | "conflict", message: string): asserts value {
  if (!value) throw new BoardConditionedQaJobError(code, message);
}

/** Private QA lifecycle only. One transaction shares the Game -> Job writer
 * fence, scrubs imagery, and keeps the separate metadata-only cost ledger.
 * A lost/late provider reply may still settle its bill, but cannot save images. */
export async function deleteBoardConditionedQaGame(c: Container, gameId: string, actor: Actor, userId?: string): Promise<boolean> {
  demand(process.env.NODE_ENV === "test" || env().APP_ENV === "qa", "unsupported", "Board-conditioned deletion is QA-only");
  demand(c.storage.id === "db", "unsupported", "Board-conditioned deletion requires DB-backed private storage");
  demand(/^[A-Za-z0-9_-]{1,120}$/.test(gameId), "integrity", "Canonical game ID required");
  if (actor.type !== "ADMIN") demand(actor.type === "USER" && !!userId && actor.id === userId, "permission", "Deletion requires its owner or an authenticated administrator");
  return c.db.$transaction(async tx => {
    if (actor.type === "ADMIN") {
      const administrator = await tx.user.findUnique({ where: { id: actor.id }, select: { email: true } });
      demand(administrator && (c.adminEmails ?? []).some(email => email.trim().toLowerCase() === administrator.email.trim().toLowerCase()), "permission", "Administrator is not authorized");
    }
    const game = await tx.game.findFirst({ where: { id: gameId, ...(userId ? { ownerId: userId } : {}) },
      include: { childProfile: true, jobs: true, scenes: { orderBy: { orderIndex: "asc" }, include: { targets: true } } } });
    if (!game || game.deletedAt || game.status === "DELETED") return false;
    demand(game.styleVersion === BOARD_CONDITIONED_QA_STYLE && ["QA_PENDING", "MANUAL_REVIEW"].includes(game.status)
      && !game.paidAt && !game.readyAt && !game.deliveredAt && !game.draftToken && !game.configJson
      && game.jobs.length === 1 && game.jobs[0]!.id === `job_${gameId}`
      && game.scenes.every(scene => !scene.configJson && scene.targets.length === 0), "unsupported", "Only a private enrolled board-conditioned QA game may use this deletion path");
    demand(await tx.order.count({ where: { gameId } }) === 0 && await tx.shareLink.count({ where: { gameId } }) === 0, "unsupported", "This cleanup cannot adopt commerce or published games");
    const job = game.jobs[0]!, now = new Date();
    // Same lock order as every checkpoint, preview and recovery writer.
    const fenced = await tx.game.updateMany({ where: { id: gameId, updatedAt: game.updatedAt, styleVersion: BOARD_CONDITIONED_QA_STYLE, deletedAt: null, status: game.status },
      data: { status: "DELETED", deletedAt: now, configJson: null, title: null, giftJson: null, lastError: null } });
    demand(fenced.count === 1, "conflict", "Deletion lost its game fence");
    const stopped = await tx.generationJob.updateMany({ where: { id: job.id, gameId, status: job.status, attempts: job.attempts, currentStep: job.currentStep, stepsJson: job.stepsJson },
      data: { status: "DONE", currentStep: null, stepsJson: "{}", lastError: null } });
    demand(stopped.count === 1, "conflict", "Deletion lost its exact job fence");
    const inventory = await boardConditionedQaPrivateInventory(tx, job.stepsJson, gameId), record = inventory.record;
    demand(record.ownerId === game.ownerId && record.childProfileId === game.childProfileId && record.worldId === `${gameId}:board-conditioned`
      && game.scenes.length === record.boards.length && game.scenes.every((scene, i) => scene.sceneSlug === record.boards[i]!.boardId && scene.sceneVersion === record.boards[i]!.sceneVersion && scene.orderIndex === i),
      "integrity", "Deletion inventory differs from this game's frozen ownership and boards");
    const privateKeys = new Set(inventory.privateKeys);
    for (const board of record.boards) for (const key of Object.values(boardConditionedCheckpointKeys(record.worldId, board.boardId))) privateKeys.add(key);

    const removedAssets: string[] = [], retainedSharedAssets: string[] = [];
    const child = game.childProfile;
    demand(child && child.id === record.childProfileId && child.ownerId === record.ownerId, "identity", "Deletion child ownership changed");
    const sharedChild = await tx.game.count({ where: { childProfileId: child.id, deletedAt: null, NOT: { id: gameId } } }) > 0;
    if (!sharedChild) {
      demand(child.identityAssetId === record.childIdentityAssetId, "identity", "Canonical child identity changed since enrollment");
      const candidates = new Map<string, string>();
      if (record.childIdentityAssetId) candidates.set(record.childIdentityAssetId, "IDENTITY_SHEET");
      for (const board of record.boards) candidates.set(board.referenceAssetId, "IDENTITY_SHEET");
      if (child.avatarAssetId) candidates.set(child.avatarAssetId, "AVATAR");
      if (child.originalPhotoAssetId) candidates.set(child.originalPhotoAssetId, "ORIGINAL_PHOTO");
      for (const [assetId, expectedType] of candidates) {
        const asset = await tx.asset.findUnique({ where: { id: assetId } });
        demand(asset && asset.ownerId === record.ownerId && asset.type === expectedType
          && (asset.visibility === "PRIVATE" || expectedType === "AVATAR" && asset.visibility === "GAME"), "identity", "Deletion asset ownership or purpose changed");
        const references = record.boards.filter(board => board.referenceAssetId === assetId);
        demand(references.every(board => board.referenceStoragePath === asset.storagePath), "integrity", "Illustrated reference storage path changed since enrollment");
        const aliases = await tx.asset.findMany({ where: { storagePath: asset.storagePath }, select: { id: true } });
        const aliasIds = aliases.map(a => a.id);
        const usedByAnotherChild = await tx.childProfile.count({ where: { NOT: { id: child.id }, OR: [
          { avatarAssetId: { in: aliasIds } }, { identityAssetId: { in: aliasIds } }, { originalPhotoAssetId: { in: aliasIds } },
        ] } }) > 0;
        const usedByTarget = await tx.targetInstance.count({ where: { spriteAssetId: { in: aliasIds } } }) > 0
          || await tx.targetVariantAsset.count({ where: { assetId: { in: aliasIds } } }) > 0;
        // An alias may belong to another product even without a ChildProfile FK.
        // Preserve it instead of widening deletion into another image graph.
        if (aliases.length !== 1 || usedByAnotherChild || usedByTarget) { retainedSharedAssets.push(assetId); continue; }
        privateKeys.add(asset.storagePath);
        await tx.asset.update({ where: { id: assetId }, data: { status: "DELETED", deletedAt: now } });
        removedAssets.push(assetId);
      }
      for (const board of record.boards) if (board.referenceLineageSha256) privateKeys.add(boardQaReferenceLineageKey(child.id, board.referenceAssetId));
      await tx.childProfile.update({ where: { id: child.id }, data: { avatarAssetId: null, identityAssetId: null, originalPhotoAssetId: null, photoCropJson: null, deletedAt: now } });
    }
    // Inventory is exact and checked. Never delete by startsWith or owner sweep.
    await tx.fileBlob.deleteMany({ where: { key: { in: [...privateKeys] } } });
    await tx.gameScene.updateMany({ where: { gameId }, data: { configJson: null } });
    await tx.auditLog.create({ data: { id: newId("aud"), actorType: actor.type, actorId: "id" in actor ? actor.id : null,
      action: "board_conditioned.deleted", entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ privateKeysPurged: privateKeys.size, assetsPurged: removedAssets.length, sharedAssetsRetained: retainedSharedAssets.length, sharedChildPreserved: sharedChild, accountingRetained: true }) } });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 });
}
