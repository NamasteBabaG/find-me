import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import sharp from "sharp";
import { env } from "../../lib/env";
import { newId } from "../../lib/ids";
import { WORLD_LOCAL_PATCH_HIDES, cropOf } from "../../domain/scene/local-patch-hides";
import type { Container } from "../container";
import type { Actor } from "../audit.service";
import { sceneBySlug } from "../scene-catalog.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { localPatchGeometry } from "./local-patch-geometry";
import { readShippedBoardArt } from "./local-patch-hide";
import { finishLocalPatchGame } from "./local-patch-player";
import { readBoardConditionedCatalog } from "./board-conditioned-catalog";
import { requireBoardWizardIdentityApproval } from "./board-wizard-identity-gate";

export const LOCAL_PATCH_HUMAN_ACTION = "local-patch:human-approved-as-is";
export const LOCAL_PATCH_HUMAN_CONFIRMATION = "approve-all-27-current-pictures-as-is-without-generation";
const STYLE = "local-patch-world-v1";
const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
function demand(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(`LOCAL_PATCH_HUMAN_APPROVAL: ${reason}`); }
const decisionId = (gameId: string, hideId: string) => `aud_lpha_${digest(JSON.stringify([gameId, hideId])).slice(0, 32)}`;

export function localPatchGeometryDigest(row: { rectJson: string | null; hitRectJson: string | null; headAnchorJson: string | null }) {
  return digest(JSON.stringify([row.rectJson, row.hitRectJson, row.headAnchorJson]));
}

/** A human decision is independent of, and never rewrites, the machine verdict. */
export async function hasLocalPatchHumanApproval(c: Container, input: {
  gameId: string; hideId: string; identityAssetId: string; identitySha256: string; assetId: string; imageSha256: string;
  variantId: string; attempts: number; geometrySha256: string; judgeJson: string | null;
}): Promise<boolean> {
  const audit = await c.db.auditLog.findUnique({ where: { id: decisionId(input.gameId, input.hideId) } });
  if (!audit || audit.action !== LOCAL_PATCH_HUMAN_ACTION || audit.entityType !== "Game" || audit.entityId !== input.gameId
    || audit.actorType !== "ADMIN" || !audit.actorId) return false;
  try {
    const r = JSON.parse(audit.metaJson ?? "null");
    return r?.version === "local-patch-human-approval/v1" && r.gameId === input.gameId && r.hideId === input.hideId
      && r.identityAssetId === input.identityAssetId && r.identitySha256 === input.identitySha256
      && r.assetId === input.assetId && r.imageSha256 === input.imageSha256 && r.variantId === input.variantId
      && r.attempts === input.attempts && r.geometrySha256 === input.geometrySha256
      && r.machineJudgeSha256 === digest(input.judgeJson ?? "") && r.decision === "approve-as-is"
      && r.confirmation === LOCAL_PATCH_HUMAN_CONFIRMATION;
  } catch { return false; }
}

/** Explicit QA administrator action only. No provider, retry, reset or queue operation. */
export async function approveLocalPatchAsIs(c: Container, gameId: string, actor: Actor): Promise<void> {
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "Only durable QA games support this explicit review");
  demand(actor.type === "ADMIN" && actor.id.trim(), "An authenticated administrator is required");
  const administrator = await c.db.user.findUnique({ where: { id: actor.id } });
  demand(administrator && c.adminEmails?.some(email => email.trim().toLowerCase() === administrator.email.toLowerCase()), "Administrator is not authorized");
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true, orders: true, jobs: true,
    scenes: { orderBy: { orderIndex: "asc" }, include: { targets: { include: { variants: true } } } } } });
  demand(game.status === "MANUAL_REVIEW" && !game.deletedAt && game.styleVersion === STYLE && game.ownerId
    && game.packageTier === "ONE_WORLD" && game.paidAt && !game.configJson && !game.readyAt, "A paid unpublished local-patch game in manual review is required");
  demand(game.orders.some(order => order.userId === game.ownerId && order.paymentStatus === "PAID" && order.paidAt && !order.refundedAt)
    && !game.orders.some(order => order.paymentStatus === "REFUNDED" || order.refundedAt), "A paid nonrefunded order is required");
  const child = game.childProfile;
  demand(child && !child.deletedAt && child.ownerId === game.ownerId && child.identityAssetId, "A live owned illustrated identity is required");
  const identity = await c.db.asset.findUniqueOrThrow({ where: { id: child.identityAssetId } });
  demand(identity.ownerId === game.ownerId && identity.type === "IDENTITY_SHEET" && identity.status === "READY" && !identity.deletedAt, "The current identity is unavailable");
  const identitySha256 = digest(await c.storage.get(identity.storagePath));
  demand(child.ageYears && child.originalPhotoAssetId, "The original approved identity inputs must remain available");
  await requireBoardWizardIdentityApproval(c, boardWizardBudgetOf(c), {
    gameId, identityAssetId: identity.id, sheetSha256: identitySha256,
    catalogSha256: (await readBoardConditionedCatalog()).sha256, photoAssetId: child.originalPhotoAssetId,
    ageYears: child.ageYears, crop: child.photoCropJson ? JSON.parse(child.photoCropJson) : null,
  });
  const job = game.jobs.find(item => item.id === `job_${gameId}`);
  demand(job && game.jobs.every(item => item.status === "DONE" && item.currentStep === null), "All generation jobs must have stopped normally");
  demand(game.scenes.length === 9 && new Set(game.scenes.map(scene => scene.sceneSlug)).size === 9, "Exactly nine boards are required");
  const budget = await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId));
  demand(!budget.held && budget.reservedMicroUsd === 0 && !budget.pendingRequestKeys.length && !budget.unknownRequestKeys.length, "Unresolved spending must be reconciled first");
  type Prepared = { rowId: string; targetId: string; hideId: string; before: string; sourceId: string; sourcePath: string;
    assetId: string; path: string; bytes: Buffer; imageSha256: string; width: number; height: number;
    rectJson: string; hitRectJson: string; headAnchorJson: string; judgeJson: string | null; attempts: number; wasFailed: boolean };
  const prepared: Prepared[] = [];
  const snapshot = (row: { status: string; attempts: number; assetId: string | null; judgeJson: string | null; rectJson: string | null;
    hitRectJson: string | null; headAnchorJson: string | null; rejectedAssetIdsJson: string | null }) =>
    JSON.stringify([row.status, row.attempts, row.assetId, row.judgeJson, row.rectJson, row.hitRectJson, row.headAnchorJson, row.rejectedAssetIdsJson]);
  for (const scene of game.scenes) {
    const board = WORLD_LOCAL_PATCH_HIDES.find(item => item.board === scene.sceneSlug), definition = sceneBySlug(scene.sceneSlug, scene.sceneVersion);
    demand(board && `public${definition.art.base}` === board.art && scene.targets.length === 3, `${scene.sceneSlug}: wrong board or incomplete placements`);
    let boardPng: Buffer | undefined;
    for (const hide of board.hides) {
      const target = scene.targets.find(item => item.targetId === hide.targetId), row = target?.variants.find(item => item.variant === "A");
      demand(target && row && row.provider === "local-patch" && ["FAILED", "GENERATED", "APPROVED"].includes(row.status)
        && row.attempts >= 1 && row.attempts <= 3, `${hide.id}: only completed retained attempts may be approved`);
      const wasFailed = row.status === "FAILED";
      const rejected: unknown = JSON.parse(row.rejectedAssetIdsJson ?? "[]");
      const sourceId = wasFailed && Array.isArray(rejected) ? rejected.at(-1) : row.assetId;
      demand(typeof sourceId === "string" && sourceId, `${hide.id}: no retained picture to approve`);
      const source = await c.db.asset.findUniqueOrThrow({ where: { id: sourceId } });
      demand(source.ownerId === game.ownerId && source.provider === "local-patch" && source.providerRequestId === gameId
        && source.status === "READY" && !source.deletedAt && source.type === (wasFailed ? "REJECTED_PATCH" : "TARGET_SPRITE")
        && source.visibility === (wasFailed ? "PRIVATE" : "GAME"), `${hide.id}: the selected picture is unavailable or unrelated`);
      const bytes = await c.storage.get(source.storagePath), imageSha256 = digest(bytes), crop = cropOf(hide);
      if (wasFailed) demand(source.id === `ast_lp_${digest(JSON.stringify([gameId, hide.id, imageSha256])).slice(0, 24)}`,
        `${hide.id}: rejected picture bytes changed after retention`);
      if (row.status === "GENERATED") {
        const judged = JSON.parse(row.judgeJson ?? "null");
        demand(judged?.hide === hide.id && judged.pose === hide.pose && judged.judgedSha256 === imageSha256,
          `${hide.id}: generated picture bytes changed after judging`);
      }
      const metadata = await sharp(bytes, { limitInputPixels: 1_048_576 }).metadata();
      demand(metadata.format === "png" && metadata.width === crop.width && metadata.height === crop.height && (metadata.pages ?? 1) === 1,
        `${hide.id}: retained picture has incorrect dimensions`);
      const assetId = wasFailed ? `ast_lpha_${digest(JSON.stringify([gameId, hide.id, sourceId, imageSha256])).slice(0, 24)}` : source.id;
      let rectJson = row.rectJson, hitRectJson = row.hitRectJson, headAnchorJson = row.headAnchorJson;
      if (wasFailed) {
        boardPng ??= await readShippedBoardArt(board.art, definition.art.sha256 ?? "");
        const measured = await localPatchGeometry({ hide, boardPng, patchPng: bytes, board: { width: definition.art.width, height: definition.art.height } });
        rectJson = JSON.stringify(measured.geometry.rect); hitRectJson = JSON.stringify(measured.geometry.hitRect); headAnchorJson = JSON.stringify(measured.geometry.anchor);
      }
      demand(rectJson && hitRectJson && headAnchorJson, `${hide.id}: tap geometry is missing`);
      prepared.push({ rowId: row.id, targetId: target.id, hideId: hide.id, before: snapshot(row), sourceId, sourcePath: source.storagePath,
        assetId, path: wasFailed ? `game/${assetId}.png` : source.storagePath, bytes, imageSha256, width: crop.width, height: crop.height,
        rectJson, hitRectJson, headAnchorJson, judgeJson: row.judgeJson, attempts: row.attempts, wasFailed });
    }
  }
  demand(prepared.length === 27, "All 27 pictures must exist before approval");
  const fence = async (tx: Prisma.TransactionClient) => {
    const live = await tx.game.updateMany({ where: { id: gameId, status: "MANUAL_REVIEW", styleVersion: STYLE, deletedAt: null,
      childProfileId: child.id }, data: { status: "MANUAL_REVIEW" } });
    const inactive = await tx.generationJob.updateMany({ where: { id: job.id, attempts: job.attempts, status: "DONE", currentStep: null }, data: { status: "DONE" } });
    demand(live.count === 1 && inactive.count === 1, "The game or job changed during approval");
    const current = await tx.childProfile.findUniqueOrThrow({ where: { id: child.id } });
    demand(!current.deletedAt && current.identityAssetId === identity.id && current.avatarAssetId === child.avatarAssetId && current.ageYears === child.ageYears,
      "The child's identity changed during approval");
    const originalIdentity = await tx.fileBlob.findUnique({ where: { key: identity.storagePath } });
    demand(originalIdentity && digest(Buffer.from(originalIdentity.data)) === identitySha256, "The identity bytes changed during approval");
    demand(!await tx.order.count({ where: { gameId, OR: [{ paymentStatus: "REFUNDED" }, { refundedAt: { not: null } }] } }), "The order was refunded during approval");
  };
  await c.db.$transaction(async tx => {
    await fence(tx);
    for (const item of prepared) {
      const row = await tx.targetVariantAsset.findUniqueOrThrow({ where: { id: item.rowId } });
      demand(snapshot(row) === item.before, `${item.hideId}: selected attempt changed during approval`);
      const source = await tx.fileBlob.findUnique({ where: { key: item.sourcePath } });
      demand(source && digest(Buffer.from(source.data)) === item.imageSha256, `${item.hideId}: selected pixels changed during approval`);
      if (item.wasFailed) {
        await tx.asset.upsert({ where: { id: item.assetId }, update: {}, create: {
          id: item.assetId, ownerId: game.ownerId, type: "TARGET_SPRITE", visibility: "GAME", status: "READY", storagePath: item.path,
          mimeType: "image/png", bytes: item.bytes.length, width: item.width, height: item.height, provider: "local-patch", providerRequestId: gameId, costCents: 0,
        } });
        await tx.fileBlob.upsert({ where: { key: item.path }, update: {}, create: { key: item.path, data: new Uint8Array(item.bytes), contentType: "image/png" } });
      }
      await tx.targetVariantAsset.update({ where: { id: item.rowId }, data: { status: "APPROVED", assetId: item.assetId,
        rectJson: item.rectJson, hitRectJson: item.hitRectJson, headAnchorJson: item.headAnchorJson } });
      await tx.targetInstance.update({ where: { id: item.targetId }, data: { status: "GENERATED", spriteKind: "image", spriteAssetId: item.assetId } });
      const metaJson = JSON.stringify({ version: "local-patch-human-approval/v1", decision: "approve-as-is", confirmation: LOCAL_PATCH_HUMAN_CONFIRMATION,
        gameId, hideId: item.hideId, variantId: item.rowId, attempts: item.attempts, sourceAssetId: item.sourceId, assetId: item.assetId,
        imageSha256: item.imageSha256, geometrySha256: localPatchGeometryDigest(item), identityAssetId: identity.id, identitySha256,
        machineJudgeSha256: digest(item.judgeJson ?? ""), machineVerdictUnchanged: true,
        reason: "Administrator confirmed the user's explicit approval of all 27 current pictures as-is, including retained rejected pictures; no generation requested" });
      const existing = await tx.auditLog.findUnique({ where: { id: decisionId(gameId, item.hideId) } });
      if (existing) {
        // A committed approval followed by an interrupted finalizer resumes
        // using the OLD decision, including its private sourceAssetId. Never
        // mint a replacement binding from today's published-asset pointer.
        demand(await hasLocalPatchHumanApproval({ ...c, db: tx as unknown as Container["db"] }, {
          gameId, hideId: item.hideId, identityAssetId: identity.id, identitySha256, assetId: item.assetId,
          imageSha256: item.imageSha256, variantId: item.rowId, attempts: item.attempts,
          geometrySha256: localPatchGeometryDigest(item), judgeJson: item.judgeJson,
        }), `${item.hideId}: a previous human decision belongs to different pixels`);
      }
      if (!existing) await tx.auditLog.create({ data: { id: decisionId(gameId, item.hideId), actorType: "ADMIN", actorId: actor.id,
        action: LOCAL_PATCH_HUMAN_ACTION, entityType: "Game", entityId: gameId, metaJson } });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 60_000 });
  // The normal finalizer owns schema validation, accounting and privacy. Its
  // fence rechecks every selected image and tap rectangle AFTER composition.
  await finishLocalPatchGame(c, gameId, async tx => {
    await fence(tx);
    for (const item of prepared) {
      const row = await tx.targetVariantAsset.findUniqueOrThrow({ where: { id: item.rowId } });
      demand(row.status === "APPROVED" && row.assetId === item.assetId && row.attempts === item.attempts && row.judgeJson === item.judgeJson
        && localPatchGeometryDigest(row) === localPatchGeometryDigest(item), `${item.hideId}: approval changed before publication`);
      const bytes = await tx.fileBlob.findUnique({ where: { key: item.path } });
      demand(bytes && digest(Buffer.from(bytes.data)) === item.imageSha256, `${item.hideId}: approved pixels changed before publication`);
    }
    await tx.auditLog.create({ data: { id: newId("aud"), actorType: "ADMIN", actorId: actor.id, action: "local-patch:human-publication-authorized",
      entityType: "Game", entityId: gameId, metaJson: JSON.stringify({ targets: 27, retainedFailuresAccepted: prepared.filter(item => item.wasFailed).length,
        confirmation: LOCAL_PATCH_HUMAN_CONFIRMATION, generationCalls: 0 }) } });
  });
}
