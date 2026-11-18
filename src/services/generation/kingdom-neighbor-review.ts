import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { env } from '../../lib/env';
import type { Container } from '../container';
import { readBoundSubjectQualityEnvelopeV2 } from '../../domain/generation/bound-subject-quality-envelope';
import { localPatchRuntimeContinuityVerdict } from '../../domain/scene/local-patch-body-continuity';
import { readSubjectAnswerV2 } from '../../domain/generation/subject-policy';
import { targetHeadReturnDecision } from '../../domain/generation/target-head-return';
import { KINGDOM_GAMEPLAY_NEIGHBOR_REVIEW } from '../../domain/generation/kingdom-generation';
import { boardWizardBudgetOf } from './board-conditioned-wizard';
import { kingdomGenerationReleaseOf } from './kingdom-generation-release';
import { authoredLocalPatchReviewBinding } from './local-patch-authored-return';
import { INTEGRATED_REQUIRED_CHECKS } from './local-patch-judge';
import { parseVisualSceneVerdicts } from './visual-review';
import { PLAYER_REVIEW_MODE } from './local-patch-player-review';
import { readSourceNeighborQualityStage, readContinuityStage, verifiedDualStage, type DualReviewProof } from './local-patch-dual-evidence';
import { subjectPlanOfHide } from './subject-enrollment';
import { localPatchPublicationGeometryHash } from './local-patch-publication-policy';
import { fenceLocalPatchImages } from './local-patch-lifecycle';

const VERSION = 'kingdom-neighbor-gameplay-review/v1';
const ACTION = 'generation:' + VERSION;
const EXHAUSTED = 'local-patch:recovery-exhausted';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const auditId = (gameId: string) => 'aud_kingdom_neighbors_' + hash(gameId).slice(0, 36);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const pinSchema = z.object({ version: z.literal(VERSION), gameId: z.string(), rowId: z.string(), hideId: z.string(),
  imageSha256: digest, geometrySha256: digest, identitySha256: digest, previousJudgeSha256: digest,
  attempts: z.number().int().positive(), reviewEvidence: z.literal(KINGDOM_GAMEPLAY_NEIGHBOR_REVIEW),
  worldCapMicroUsd: z.literal(4_000_000), maxAdditionalReviewMicroUsd: z.literal(250_000),
  originalRequestsSha256: digest, providerCalls: z.literal(0), approvalTransferred: z.literal(false),
}).strict();
type Reader = Pick<Prisma.TransactionClient, 'auditLog'> & Partial<Pick<Prisma.TransactionClient, 'targetVariantAsset'>>;

/** A separately recorded question change for one unchanged paid appearance. */
export async function kingdomNeighborReviewOf(db: Reader, gameId: string) {
  const audit = await db.auditLog.findUnique({ where: { id: auditId(gameId) } });
  if (!audit) return null;
  const pin = pinSchema.parse(JSON.parse(audit.metaJson ?? 'null'));
  if (audit.action !== ACTION || audit.actorType !== 'SYSTEM' || audit.actorId !== null
    || audit.entityType !== 'Game' || audit.entityId !== gameId || pin.gameId !== gameId)
    throw Error('KINGDOM_NEIGHBORS: invalid review authority');
  if (!db.targetVariantAsset) throw Error('KINGDOM_NEIGHBORS: authoritative appearance required');
  const row = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: pin.rowId },
    include: { targetInstance: { select: { gameScene: { select: { gameId: true } } } } } });
  const receipt = JSON.parse(row.judgeJson ?? 'null');
  if (row.targetInstance.gameScene.gameId !== gameId || row.provider !== 'local-patch' || row.variant !== 'A' || row.attempts !== pin.attempts
    || receipt?.hide !== pin.hideId || receipt.judgedSha256 !== pin.imageSha256
    || localPatchPublicationGeometryHash(row) !== pin.geometrySha256
    || receipt.kingdomNeighborReview !== hash(audit.metaJson!)
    || !Array.isArray(receipt.reviewHistory) || !receipt.reviewHistory.some((old: { judgeJson?: string }) =>
      typeof old.judgeJson === 'string' && hash(old.judgeJson) === pin.previousJudgeSha256))
    throw Error('KINGDOM_NEIGHBORS: reviewed image or original evidence changed');
  return pin;
}

/** One software recovery of a source-correspondence-only refusal. The fresh
 * question still judges every visible defect, identity, limb and target head. */
export async function resumeKingdomNeighborReview(c: Container, gameId: string): Promise<boolean> {
  if (env().APP_ENV !== 'qa' || c.storage.id !== 'db' || env().KINGDOM_GENERATION_RELEASE !== 'v5'
    || await c.db.auditLog.findUnique({ where: { id: auditId(gameId) } })) return false;
  const release = await kingdomGenerationReleaseOf(c.db, gameId);
  if (release?.version !== 'kingdom-generation/v4') return false;
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, orders: true,
    scenes: { include: { targets: { include: { variants: true } } } } } });
  const child = game?.childProfile;
  const job = await c.db.generationJob.findUnique({ where: { id: 'job_' + gameId } });
  if (!game || !child?.ageYears || child.deletedAt || child.ownerId !== game.ownerId || game.deletedAt
    || game.status !== 'TARGETS_GENERATING' || game.configJson || game.readyAt || game.deliveredAt
    || game.styleVersion !== 'local-patch-world-v1' || game.searchLevel !== 'detectives'
    || game.scenes.length !== 9 || game.scenes.some(s => s.sceneVersion !== 13 || s.targets.length !== 3)
    || !game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === 'PAID' && o.paidAt && !o.refundedAt)
    || game.orders.some(o => o.paymentStatus === 'REFUNDED' || o.refundedAt)
    || job?.status !== 'FAILED' || job.currentStep !== EXHAUSTED) return false;
  const rows = game.scenes.flatMap(s => s.targets.flatMap(t => t.variants));
  const failed = rows.filter(r => r.status === 'FAILED');
  if (rows.length !== 27 || rows.some(r => r.variant !== 'A' || r.provider !== 'local-patch') || failed.length !== 1
    || rows.filter(r => r.status === 'GENERATED').length !== 26) return false;
  const row = failed[0]!, receipt = JSON.parse(row.judgeJson ?? 'null'), proof = receipt?.boardReview?.dual as DualReviewProof | undefined;
  if (!row.assetId || receipt?.reviewState !== 'board-review-complete' || receipt.kingdomNeighborReview
    || proof?.single !== 'single-sol-medium/v1' || !proof.quality.subjectBundle || !proof.quality.headEvidence
    || !proof.subject || !proof.continuity || proof.subject.collectionRefusal
    || proof.imageSha256 !== receipt.judgedSha256 || proof.geometrySha256 !== localPatchPublicationGeometryHash(row)
    || proof.hideId !== receipt.hide || !proof.quality.reader || proof.sceneVersion !== 13) return false;
  const neighbors = readSourceNeighborQualityStage(proof.quality);
  if (!neighbors?.ok || neighbors.sourceNeighbors.disposition !== 'unresolved'
    || neighbors.sourceNeighbors.faults.some(f => !['unsure', 'mapping-contradiction'].includes(f.code))) return false;
  const inner = readBoundSubjectQualityEnvelopeV2(neighbors.assessment.raw, proof.quality.subjectBundle);
  const quality = inner && parseVisualSceneVerdicts(inner.quality, [proof.hideId], 13, 'ready-only/v1', PLAYER_REVIEW_MODE, proof.quality.reader)[proof.hideId];
  const plan = subjectPlanOfHide(proof.hideId, 13);
  const subject = inner && plan && readSubjectAnswerV2(inner.subject, { hideId: proof.hideId, ageYears: child.ageYears, plan });
  const continuity = readContinuityStage(proof.continuity, proof.hideId, proof.version);
  const checks = quality as Record<string, unknown> | null;
  if (!quality || !checks || INTEGRATED_REQUIRED_CHECKS.some(check => check !== 'neighborsIntact' && checks[check] !== 'pass')
    || quality.faults.some(f => f.check !== 'neighborsIntact') || !subject?.ok || subject.disposition !== 'pass'
    || !continuity?.ok || localPatchRuntimeContinuityVerdict(continuity).disposition !== 'pass'
    || targetHeadReturnDecision(proof.quality.raw, proof.quality.headEvidence).disposition !== 'pass') return false;
  const worldId = gameId + ':board-wizard', budget = await boardWizardBudgetOf(c).audit(worldId);
  if (budget.capMicroUsd !== 4_000_000 || budget.overCapMicroUsd || budget.pendingRequestKeys.length
    || budget.unknownRequestKeys.length || budget.conflictRequestKeys.length || budget.overrunRequestKeys.length
    || budget.committedMicroUsd + 250_000 > budget.capMicroUsd) return false;
  const verification = { allowSingle: true, authoredReviewBinding: authoredLocalPatchReviewBinding(proof)! };
  const paid = await verifiedDualStage(c.db, worldId, proof.quality, 'scene-quality', verification);
  if (!paid || ![proof.continuity, proof.subject].every(s => s.raw === proof.quality.raw && s.requestKey === proof.quality.requestKey
    && s.fingerprint === proof.quality.fingerprint && s.costMicroUsd === proof.quality.costMicroUsd)) return false;
  const ledger = await c.db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
  const pin = pinSchema.parse({ version: VERSION, gameId, rowId: row.id, hideId: proof.hideId, imageSha256: proof.imageSha256,
    geometrySha256: proof.geometrySha256, identitySha256: proof.identitySha256, previousJudgeSha256: hash(row.judgeJson!),
    attempts: row.attempts, reviewEvidence: KINGDOM_GAMEPLAY_NEIGHBOR_REVIEW, worldCapMicroUsd: 4_000_000,
    maxAdditionalReviewMicroUsd: 250_000, originalRequestsSha256: hash(ledger.snapshotJson), providerCalls: 0, approvalTransferred: false });
  const metaJson = JSON.stringify(pin);
  return c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, gameId);
    const live = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true, orders: true } });
    if (live.status !== 'TARGETS_GENERATING' || live.configJson || live.readyAt || live.deliveredAt
      || live.ownerId !== game.ownerId || live.childProfileId !== child.id || live.childProfile?.deletedAt
      || live.childProfile?.identityAssetId !== child.identityAssetId || live.childProfile?.ageYears !== child.ageYears
      || !live.orders.some(o => o.userId === live.ownerId && o.paymentStatus === 'PAID' && o.paidAt && !o.refundedAt)
      || live.orders.some(o => o.paymentStatus === 'REFUNDED' || o.refundedAt)) return false;
    const currentRows = await tx.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } } });
    const originalRows = new Map(rows.map(r => [r.id, r]));
    if (currentRows.length !== rows.length || currentRows.some(r => {
      const old = originalRows.get(r.id);
      return !old || old.status !== r.status || old.assetId !== r.assetId || old.attempts !== r.attempts
        || old.judgeJson !== r.judgeJson || localPatchPublicationGeometryHash(old) !== localPatchPublicationGeometryHash(r);
    })) return false;
    const currentLedger = await tx.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
    const current = await tx.targetVariantAsset.findUniqueOrThrow({ where: { id: row.id } });
    if (current.judgeJson !== row.judgeJson || current.assetId !== row.assetId || current.status !== row.status
      || current.attempts !== row.attempts || currentLedger.revision !== ledger.revision || currentLedger.snapshotJson !== ledger.snapshotJson) return false;
    const changed = await tx.generationJob.updateMany({ where: { id: job.id, status: 'FAILED', currentStep: EXHAUSTED,
      attempts: job.attempts, updatedAt: job.updatedAt }, data: { status: 'QUEUED', currentStep: 'local-patch', lastError: null } });
    if (changed.count !== 1) return false;
    receipt.reviewHistory = [...(receipt.reviewHistory ?? []), { kind: VERSION, judgeJson: row.judgeJson }];
    for (const key of ['boardReview', 'verdict', 'qualityDisposition']) delete receipt[key];
    receipt.reviewState = 'pending-board-review';
    receipt.kingdomNeighborReview = hash(metaJson);
    await tx.targetVariantAsset.update({ where: { id: row.id }, data: { status: 'GENERATED', judgeJson: JSON.stringify(receipt) } });
    await tx.auditLog.create({ data: { id: auditId(gameId), action: ACTION, actorType: 'SYSTEM', entityType: 'Game', entityId: gameId, metaJson } });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}
