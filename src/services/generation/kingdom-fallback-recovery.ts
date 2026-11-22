import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { KINGDOM_FALLBACK_PLACEMENT as profile, KINGDOM_FALLBACK_PLACEMENT_SHA256 as placementSha256, KINGDOM_FALLBACK_RECOVERY_ACTION } from '../../../content/detectives/kingdom/fallback-placement-v1';
import { KINGDOM_DETECTIVE_ADVENTURE_CATALOG } from '../../../content/detectives/kingdom/runtime-release';
import { SUNBURST_MIN_CAPACITY_MICRO_USD } from '../../domain/generation/sunburst-painter';
import { kingdomFallbackAdventure, kingdomFallbackPlacement, kingdomFallbackRefusal } from '../../domain/scene/kingdom-fallback-placement';
import { sourcePlacementCanonical, sourcePlacementSha256 } from '../../domain/scene/source-placement-release';
import { env } from '../../lib/env';
import type { Container } from '../container';
import { boardWizardBudgetOf, boardWizardWorldId } from './board-conditioned-wizard';
import { KINGDOM_GENERATION_V7, KINGDOM_V7_CEILING_MICRO_USD, kingdomGenerationReleaseOf } from './kingdom-generation-release';
import { authoredLocalPatchReviewBinding } from './local-patch-authored-return';
import { readContinuityStage, verifiedDualStage, type DualReviewProof } from './local-patch-dual-evidence';
import { fenceLocalPatchImages } from './local-patch-lifecycle';
import { localPatchPublicationGeometryHash } from './local-patch-publication-policy';
import { resolveLocalPatchBoardsForGame, sourcePlacementForHide } from './source-placement-release';

const EXHAUSTED = 'local-patch:recovery-exhausted';
const auditId = (gameId: string) => `aud_kingdom_fallback_${gameId}`;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const schema = z.object({
  version: z.literal(profile.version), gameId: z.string(), rowId: z.string(), hideId: z.literal(profile.hideId),
  placementSha256: z.literal(placementSha256), previousJudgeJson: z.string().max(250_000), previousJudgeSha256: digest,
  previousAssetId: z.string(), previousAttempts: z.literal(3), authorizedAttempt: z.literal(4),
  ledgerSha256: digest, providerCalls: z.literal(0), approvalTransferred: z.literal(false),
}).strict();
export type KingdomFallbackRecovery = z.infer<typeof schema>;

export async function kingdomFallbackRecoveryOf(db: Pick<Prisma.TransactionClient, 'auditLog'>, gameId: string) {
  const audit = await db.auditLog.findUnique({ where: { id: auditId(gameId) } });
  if (!audit) return null;
  const pin = schema.parse(JSON.parse(audit.metaJson ?? 'null'));
  if (audit.action !== KINGDOM_FALLBACK_RECOVERY_ACTION || audit.actorType !== 'SYSTEM' || audit.actorId !== null || audit.entityType !== 'Game'
    || audit.entityId !== gameId || pin.gameId !== gameId || pin.previousJudgeSha256 !== sourcePlacementSha256(pin.previousJudgeJson))
    throw Error('KINGDOM_FALLBACK: invalid recovery receipt');
  return pin;
}

type AttemptRow = { id: string; status: string; attempts: number; assetId: string | null; judgeJson: string | null };
export function kingdomFallbackPainting(pin: KingdomFallbackRecovery, row: AttemptRow) {
  if (row.id !== pin.rowId || row.assetId !== pin.previousAssetId || !(row.status === 'FAILED' && row.attempts === pin.previousAttempts
    || row.status === 'PENDING' && row.attempts === pin.authorizedAttempt)) return false;
  try { return JSON.parse(row.judgeJson ?? 'null')?.kingdomFallback === pin.previousJudgeSha256; }
  catch { return false; }
}

/** Finite capacity/source authority only; the usual paid-pixel and verdict gates still apply. */
export async function kingdomFallbackReviewAuthorized(db: Pick<Prisma.TransactionClient, 'auditLog'>, input: {
  gameId: string; variantId: string; hideId: string; attempts: number; sceneVersion: number; judgeJson: string | null;
}) {
  if (input.sceneVersion !== 13 || input.hideId !== profile.hideId || input.attempts !== 4) return false;
  const pin = await kingdomFallbackRecoveryOf(db, input.gameId);
  if (!pin || pin.rowId !== input.variantId || pin.authorizedAttempt !== input.attempts
    || (await kingdomGenerationReleaseOf(db, input.gameId))?.version !== KINGDOM_GENERATION_V7) return false;
  const value = JSON.parse(input.judgeJson ?? 'null');
  const returned = value?.authoredReturn;
  const crop = { ...profile.originalCrop, left: profile.fallback.left, top: profile.fallback.top };
  return value?.kingdomFallback === pin.previousJudgeSha256 && value.hide === pin.hideId && value.pose === profile.fallback.pose
    && returned?.sourcePlacement?.manifestSha256 === placementSha256 && returned.source?.sha256 === profile.sourceSha256
    && sourcePlacementCanonical(returned.crop) === sourcePlacementCanonical(crop)
    && sourcePlacementCanonical(returned.local) === sourcePlacementCanonical(profile.fallback.returnRect);
}

/** Enroll one exhausted, settled v7 appearance without buying or approving anything.
 * The regular worker still reserves and judges the replacement. */
export async function enrollKingdomFallbackRecovery(c: Container, gameId: string) {
  if (env().APP_ENV !== 'qa' || env().KINGDOM_GENERATION_RELEASE !== 'v8' || c.storage.id !== 'db') return false;
  if ((await kingdomGenerationReleaseOf(c.db, gameId))?.version !== KINGDOM_GENERATION_V7) return false;
  if (await kingdomFallbackRecoveryOf(c.db, gameId)) return false;
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { orders: true, childProfile: true,
    scenes: { include: { targets: { include: { variants: true } } } } } });
  const job = await c.db.generationJob.findUnique({ where: { id: 'job_' + gameId } });
  if (!game || game.deletedAt || !game.ownerId || !game.paidAt || game.status !== 'TARGETS_GENERATING' || game.configJson || game.readyAt || game.deliveredAt
    || !game.childProfile?.identityAssetId || game.childProfile.deletedAt || game.childProfile.ownerId !== game.ownerId
    || game.scenes.length !== 9 || game.scenes.some(scene => scene.sceneVersion !== 13 || scene.targets.length !== 3)
    || game.orders.length !== 1 || !game.orders.some(order => order.userId === game.ownerId && order.provider === 'mock'
      && order.paymentStatus === 'PAID' && order.paidAt && !order.refundedAt)
    || job?.status !== 'FAILED' || job.currentStep !== EXHAUSTED) return false;
  const target = game.scenes.find(scene => scene.sceneSlug === profile.boardId)?.targets.find(item => item.targetId === profile.targetId);
  const row = target?.variants[0];
  const rows = game.scenes.flatMap(scene => scene.targets.flatMap(item => item.variants));
  if (!row?.judgeJson || !row.assetId || row.status !== 'FAILED' || row.attempts !== 3 || rows.length !== 27
    || rows.some(item => item.variant !== 'A' || item.provider !== 'local-patch')
    || rows.some(item => item.id !== row.id && (!item.assetId || item.status !== 'GENERATED'
      || JSON.parse(item.judgeJson ?? 'null')?.qualityDisposition?.state !== 'acceptable'))) return false;
  const proof = JSON.parse(row.judgeJson).boardReview?.dual as DualReviewProof | undefined;
  if (!proof?.quality || !proof.continuity || proof.single !== 'single-sol-medium/v1' || proof.sceneVersion !== 13
    || proof.hideId !== profile.hideId || proof.geometrySha256 !== localPatchPublicationGeometryHash(row)) return false;
  const refusal = kingdomFallbackRefusal(row.judgeJson, readContinuityStage(proof.continuity, profile.hideId, proof.version));
  if (!refusal || proof.quality.requestKey !== refusal.reviewKey || proof.continuity.requestKey !== refusal.reviewKey) return false;
  const worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c);
  const ledger = await c.db.worldBudgetLedger.findUnique({ where: { worldId } });
  const room = await budget.audit(worldId);
  if (!ledger || room.capMicroUsd !== KINGDOM_V7_CEILING_MICRO_USD || room.held || room.pendingRequestKeys.length
    || room.remainingMicroUsd < SUNBURST_MIN_CAPACITY_MICRO_USD) return false;
  const binding = authoredLocalPatchReviewBinding(proof);
  if (!binding || proof.imageSha256 !== JSON.parse(row.judgeJson).judgedSha256
    || !await verifiedDualStage(c.db, worldId, proof.quality, 'scene-quality', { allowSingle: true, authoredReviewBinding: binding })
    || !await verifiedDualStage(c.db, worldId, proof.continuity, 'head-continuity', { allowSingle: true, authoredReviewBinding: binding })) return false;
  const context = await resolveLocalPatchBoardsForGame(c.db, gameId, 13);
  const board = context.boards.find(item => item.board === profile.boardId);
  const contract = sourcePlacementForHide(context, profile.hideId);
  if (!board || !contract) return false;
  kingdomFallbackPlacement(board, contract);
  kingdomFallbackAdventure(KINGDOM_DETECTIVE_ADVENTURE_CATALOG);
  const pin = schema.parse({ version: profile.version, gameId, rowId: row.id, hideId: profile.hideId, placementSha256,
    previousJudgeJson: row.judgeJson, previousJudgeSha256: sourcePlacementSha256(row.judgeJson), previousAssetId: row.assetId,
    previousAttempts: row.attempts, authorizedAttempt: 4, ledgerSha256: sourcePlacementSha256(ledger.snapshotJson),
    providerCalls: 0, approvalTransferred: false });
  return c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, gameId);
    const sameWorld = await tx.game.findFirst({ where: { id: gameId, ownerId: game.ownerId, status: 'TARGETS_GENERATING',
      configJson: null, readyAt: null, deliveredAt: null, childProfile: { id: game.childProfile!.id, deletedAt: null,
        identityAssetId: game.childProfile!.identityAssetId }, orders: { some: { id: game.orders[0]!.id,
        paymentStatus: 'PAID', refundedAt: null } } } });
    const current = await tx.targetVariantAsset.findUniqueOrThrow({ where: { id: row.id } });
    const currentLedger = await tx.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
    const inventory = await tx.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } },
      select: { id: true, updatedAt: true, judgeJson: true, assetId: true, status: true, attempts: true } });
    const before = new Map(rows.map(item => [item.id, item]));
    const unchanged = inventory.length === before.size && inventory.every(item => {
      const original = before.get(item.id);
      return original?.updatedAt.getTime() === item.updatedAt.getTime() && original.judgeJson === item.judgeJson
        && original.assetId === item.assetId && original.status === item.status && original.attempts === item.attempts;
    });
    if (!sameWorld || !unchanged || current.status !== 'FAILED' || current.attempts !== pin.previousAttempts
      || current.assetId !== pin.previousAssetId || current.judgeJson !== pin.previousJudgeJson
      || currentLedger.revision !== ledger.revision || currentLedger.snapshotJson !== ledger.snapshotJson) return false;
    const changed = await tx.generationJob.updateMany({ where: { id: job.id, status: 'FAILED', currentStep: EXHAUSTED,
      attempts: job.attempts, updatedAt: job.updatedAt }, data: { status: 'QUEUED', currentStep: 'local-patch', lastError: null } });
    if (!changed.count) return false;
    await tx.auditLog.create({ data: { id: auditId(gameId), action: KINGDOM_FALLBACK_RECOVERY_ACTION, actorType: 'SYSTEM',
      entityType: 'Game', entityId: gameId, metaJson: JSON.stringify(pin) } });
    await tx.targetVariantAsset.update({ where: { id: row.id }, data: {
      judgeJson: JSON.stringify({ kingdomFallback: pin.previousJudgeSha256 }),
    } });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}
