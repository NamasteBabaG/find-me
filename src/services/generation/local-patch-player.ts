import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { GameConfigSchema, SpriteRefSchema, type GameConfig, type PlayWorld } from "../../domain/game/config";
import { composeGame, composeScene, composeWorld } from "../../domain/game/compose";
import { isLocalPatchAdvisoryVersion, localPatchBoardForVersion } from "../../domain/scene/local-patch-catalog";
import { newId } from "../../lib/ids";
import type { Container } from "../container";
import { signedAssetUrl } from "../asset.service";
import { sceneBySlug } from "../scene-catalog.service";
import { worldForBoard } from "../world-catalog.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT } from "./local-patch-hide";
import { JUDGE_CHECKS, localPatchVerdictSchema } from "./local-patch-judge";
import { IDENTITY_GATE_ACTION, identityReceiptReadyForPublication } from "./board-wizard-identity-gate";
import { hasLocalPatchHumanApproval, localPatchGeometryDigest } from "./local-patch-human-approval";
import { hasLocalPatchPublicationPolicy, localPatchPublicationGeometryHash } from "./local-patch-publication-policy";
import { enqueueLocalPatchNotifications } from "../local-patch-notifications";

const STYLE = "local-patch-world-v1";
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
function demand(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(`LOCAL_PATCH_PLAYER: ${reason}`);
}

/** Strict assembly: no avatar/body fallback and no unpainted B variant. */
export async function composeLocalPatchGame(c: Container, gameId: string): Promise<GameConfig> {
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId },
    include: { childProfile: true, scenes: { orderBy: { orderIndex: "asc" }, include: { targets: { include: { variants: true } } } } } });
  const child = game.childProfile;
  demand(game.styleVersion === STYLE && !game.deletedAt && game.ownerId && child && !child.deletedAt && child.ownerId === game.ownerId,
    "a live owned local-patch game is required");
  demand(game.packageTier === "ONE_WORLD" && game.scenes.length === 9 && new Set(game.scenes.map(s => s.sceneSlug)).size === 9,
    "exactly nine distinct boards are required");
  demand(new Set(game.scenes.map(scene => scene.sceneVersion)).size === 1, "one pinned content version is required");
  const avatar = child.avatarAssetId ? await c.db.asset.findUnique({ where: { id: child.avatarAssetId } }) : null;
  demand(avatar && avatar.type === "AVATAR" && avatar.visibility === "GAME" && avatar.ownerId === game.ownerId
    && avatar.status === "READY" && !avatar.deletedAt, "the approved illustrated avatar is missing");
  demand((await c.storage.get(avatar.storagePath)).length > 0, "the avatar bytes are missing");
  const who = { name: child.displayName, avatarUrl: signedAssetUrl(c, avatar.id) };
  const locale = game.locale === "he" ? "he" : "en";
  const scenes = [];
  const worlds = new Map<string, PlayWorld>();
  let humanIdentitySha256: string | undefined;
  for (const scene of game.scenes) {
    const board = localPatchBoardForVersion(scene.sceneSlug, scene.sceneVersion);
    const def = sceneBySlug(scene.sceneSlug, scene.sceneVersion);
    demand(board && `public${def.art.base}` === board.art, `the ${scene.sceneSlug} board is not the authored artwork`);
    demand(scene.targets.length === board.hides.length, `${scene.sceneSlug} needs exactly ${board.hides.length} painted targets`);
    const sprites = [];
    for (const hide of board.hides) {
      const target = scene.targets.find(t => t.targetId === hide.targetId);
      const row = target?.variants.find(v => v.variant === LOCAL_PATCH_VARIANT);
      demand(target && row && ["GENERATED", "APPROVED"].includes(row.status) && row.provider === LOCAL_PATCH_PROVIDER && row.assetId,
        `${hide.id} does not have an approved painted appearance`);
      const asset = await c.db.asset.findUnique({ where: { id: row.assetId } });
      demand(asset && asset.visibility === "GAME" && asset.type === "TARGET_SPRITE" && asset.status === "READY" && !asset.deletedAt
        && asset.ownerId === game.ownerId && asset.provider === LOCAL_PATCH_PROVIDER && asset.providerRequestId === gameId,
        `${hide.id} has an unavailable or unrelated asset`);
      const imageSha256 = sha(await c.storage.get(asset.storagePath));
      if (row.status === "APPROVED" || isLocalPatchAdvisoryVersion(scene.sceneVersion)) {
        demand(child.identityAssetId, "human approval requires its original identity");
        if (!humanIdentitySha256) {
          const identity = await c.db.asset.findUniqueOrThrow({ where: { id: child.identityAssetId } });
          demand(identity.ownerId === game.ownerId && identity.status === "READY" && !identity.deletedAt && identity.type === "IDENTITY_SHEET", "human approval identity is unavailable");
          humanIdentitySha256 = sha(await c.storage.get(identity.storagePath));
        }
        const binding = { gameId, hideId: hide.id, identityAssetId: child.identityAssetId,
          identitySha256: humanIdentitySha256, assetId: asset.id, imageSha256, variantId: row.id, attempts: row.attempts,
          geometrySha256: localPatchGeometryDigest(row), judgeJson: row.judgeJson };
        if (isLocalPatchAdvisoryVersion(scene.sceneVersion)) {
          demand(row.status === "GENERATED" && await hasLocalPatchPublicationPolicy(c, { ...binding,
            sceneVersion: scene.sceneVersion, geometrySha256: localPatchPublicationGeometryHash(row) }),
          `${hide.id} has no publication policy for these pixels, identity and tap geometry`);
        } else demand(await hasLocalPatchHumanApproval(c, binding), `${hide.id} has no human approval for these pixels and tap geometry`);
      } else {
        const receipt = JSON.parse(row.judgeJson ?? "null");
        demand(receipt && receipt.hide === hide.id && receipt.pose === hide.pose && receipt.judgedSha256 === imageSha256,
          `${hide.id} is not the picture that was judged`);
        const verdict = receipt.verdict;
        demand(verdict && localPatchVerdictSchema.parse({
          ...Object.fromEntries(JUDGE_CHECKS.map(key => [key, verdict[key]])),
          verdict: verdict.verdict, reason: verdict.reason, faults: verdict.faults,
        }).verdict === "pass", `${hide.id} has no passing visual verdict`);
      }
      demand(row.rectJson && row.hitRectJson && row.headAnchorJson, `${hide.id} has no tap geometry`);
      const sprite = SpriteRefSchema.parse({ kind: "image", url: signedAssetUrl(c, asset.id), width: asset.width, height: asset.height,
        rect: JSON.parse(row.rectJson), hitRect: JSON.parse(row.hitRectJson), anchor: JSON.parse(row.headAnchorJson) });
      sprites.push({ targetId: hide.targetId, sprite, spriteByVariant: { A: sprite, B: sprite } });
    }
    const world = worldForBoard(scene.sceneSlug);
    demand(world, `${scene.sceneSlug} has no world map`);
    worlds.set(world.slug, composeWorld(world, who, locale));
    const composed = composeScene(def, who, sprites, locale);
    if (isLocalPatchAdvisoryVersion(scene.sceneVersion)) Object.assign(composed, {
      playMode: "find-any", appearancesPerBoard: 5, findsRequiredToAdvance: 3,
    });
    // The patch includes the surroundings/occlusion already. Old foreground
    // overlays and sprite flips must not repaint or move the judged picture.
    composed.art = { ...composed.art, foreground: undefined };
    for (const target of composed.targets) for (const slot of target.slots) {
      slot.flip = false; slot.rotation = 0; slot.layer = "front";
    }
    scenes.push({ ...composed, worldSlug: world.slug });
  }
  demand(worlds.size === 1, "the nine boards must belong to one world");
  return GameConfigSchema.parse(composeGame({ gameId, child: who, locale, packageTier: "ONE_WORLD", styleVersion: STYLE,
    scenes, worlds: [...worlds.values()], ...(game.giftJson ? { gift: JSON.parse(game.giftJson) } : {}) }));
}

/** Publish only an entirely verified world, atomically with the worker fence. */
export async function finishLocalPatchGame(c: Container, gameId: string, fence: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
  const config = await composeLocalPatchGame(c, gameId);
  const assetIds = [config.child.avatarUrl, ...config.scenes.flatMap(s => s.targets.map(t => t.sprite.kind === "image" ? t.sprite.url : ""))]
    .map(url => /\/api\/assets\/([^?]+)/.exec(url)?.[1]).filter((id): id is string => !!id);
  await c.db.$transaction(async tx => {
    await fence(tx);
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true } });
    const count = await tx.asset.count({ where: { id: { in: assetIds }, ownerId: game.ownerId, status: "READY", deletedAt: null, visibility: "GAME" } });
    const expectedAssets = 1 + config.scenes.reduce((sum, scene) => sum + scene.targets.length, 0);
    demand(count === expectedAssets && new Set(assetIds).size === expectedAssets, "all appearances and the avatar must remain available at publication");
    const contentVersions = await tx.gameScene.findMany({ where: { gameId }, select: { sceneVersion: true } });
    const contentVersion = contentVersions[0]?.sceneVersion;
    demand(contentVersions.length === 9 && contentVersions.every(scene => scene.sceneVersion === contentVersion), "publication needs one pinned content version");
    const audit = await boardWizardBudgetOf({ ...c, db: tx as unknown as Container["db"] }).audit(boardWizardWorldId(gameId));
    demand(!audit.held && audit.reservedMicroUsd === 0, "unresolved spending must be reconciled before publication");
    // QA uses durable FileBlob storage. Honor the parent's original-photo
    // privacy choice in the same commit that first exposes a playable config.
    const child = game.childProfile;
    if (child?.originalPhotoAssetId && !child.retainOriginalPhoto) {
      demand(c.storage.id === "db", "publication requires durable database storage");
      const photo = await tx.asset.findUniqueOrThrow({ where: { id: child.originalPhotoAssetId } });
      demand(photo.ownerId === game.ownerId && photo.type === "ORIGINAL_PHOTO", "the original photograph is not owned by this game");
      await tx.fileBlob.deleteMany({ where: { key: photo.storagePath } });
      await tx.asset.update({ where: { id: photo.id }, data: { status: "DELETED", deletedAt: new Date() } });
      const approval = await tx.auditLog.findFirst({ where: { action: IDENTITY_GATE_ACTION, entityType: "Asset", entityId: child.identityAssetId! }, orderBy: { createdAt: "desc" } });
      const identityReceipt = JSON.parse(approval?.metaJson ?? "null");
      demand(identityReceipt && identityReceiptReadyForPublication(identityReceipt, contentVersion) && identityReceipt?.provenance?.photoAssetId === photo.id && identityReceipt?.provenance?.ageYears === child.ageYears,
        "the privacy purge must belong to the approved identity");
      await tx.auditLog.create({ data: { id: newId("aud"), actorType: "SYSTEM", action: "local-patch:photo-purged-after-approval", entityType: "Asset", entityId: child.identityAssetId!,
        metaJson: JSON.stringify({ photoAssetId: photo.id, ageYears: child.ageYears, approvalFingerprint: identityReceipt.fingerprint }) } });
      await tx.childProfile.update({ where: { id: child.id }, data: { originalPhotoAssetId: null } });
    }
    for (const scene of config.scenes) await tx.gameScene.update({ where: { gameId_sceneSlug: { gameId, sceneSlug: scene.slug } },
      data: { generationStatus: "GENERATED", configJson: JSON.stringify(scene) } });
    const now = new Date();
    await tx.game.update({ where: { id: gameId }, data: { configJson: JSON.stringify(config), status: "READY", readyAt: now, lastError: null } });
    await tx.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "DONE", currentStep: null, lastError: null } });
    await tx.auditLog.create({ data: { id: newId("aud"), actorType: "SYSTEM", action: "local-patch:ready", entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ boards: 9, targets: expectedAssets - 1, configSha256: sha(Buffer.from(JSON.stringify(config))), settledMicroUsd: audit.settledMicroUsd }) } });
    if (isLocalPatchAdvisoryVersion(contentVersion ?? 0)) await enqueueLocalPatchNotifications(c, tx, gameId, config);
  }, { maxWait: 10_000, timeout: 30_000 });
}
