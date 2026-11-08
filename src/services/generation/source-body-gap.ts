import { Prisma } from '@prisma/client';
import sharp from 'sharp';
import { isDeepStrictEqual as equal } from 'node:util';
import type { Container } from '../container';
import { DbStorage } from '../../infra/storage/db';
import { PrismaWorldBudgetStore } from '../../infra/db/prisma-world-budget-store';
import { SOURCE_BODY_GAP_ACTION, SOURCE_BODY_GAP_VERSION, bodyGapHash as hash, bodyGapAuditId,
  sourceBodyGapSchema, sourceBodyGapAuthority, sourceBodyGapCandidate, composeSourceBodyGap, type SourceBodyGap } from '../../domain/generation/source-body-gap';
import { sourceBodyBirthMarkerSchema } from '../../domain/generation/detectives-operational-policy';
import { sourceBodyBirthRequestKey } from './detectives-operational-policy';
import { sourceBodyForHide, resolveLocalPatchBoardsForGame } from './source-placement-release';
import { sourceBodyCompositionEvidenceMatches } from './source-body-repair-compose';
import { readSettledTargetRaw } from './single-review-head-evidence';
import { singleMediumReviewPolicyOf } from './single-medium-policy';
import { authoredLocalPatchReviewBinding } from './local-patch-authored-return';
import { verifiedDualStage, readQualityStage, type DualReviewProof } from './local-patch-dual-evidence';
import { localPatchPublicationGeometryHash } from './local-patch-publication-policy';
import { readShippedBoardArt, type LocalPatchHideDeps } from './local-patch-hide';
import { fenceLocalPatchImages } from './local-patch-lifecycle';
import { sha256Bytes as sha } from './fixed-sprite';
import { env } from '../../lib/env';

type ReadArt = NonNullable<LocalPatchHideDeps['readBoardArt']>;
type Receipt = Record<string, any>;
type Candidate = { id: string; status: string; attempts: number; assetId: string | null; judgeJson: string | null };
const incompatible = ['sourceFigureReturn', 'crownTab', 'headPixelCorrection', 'retainedNormalHead', 'crownReturn', 'authoredRecovery', 'propJoinCorrection'];
async function joined(raw: Buffer, baseline: Buffer, g: Parameters<typeof composeSourceBodyGap>[0]) {
  const rgba = async (b: Buffer) => {
    const { data, info } = await sharp(b, { limitInputPixels: 8294400 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== 512 || info.height !== 768 || info.channels !== 4) throw Error('BODY_GAP: native raster required');
    return data;
  };
  const result = composeSourceBodyGap(g, await rgba(raw), await rgba(baseline));
  return { png: await sharp(result.pixels, { raw: { width: 512, height: 768, channels: 4 } }).png().toBuffer(), proof: result.proof };
}
/** Reauthenticate the old composition and its paid refusal. This never reads a
 * mutable success claim as permission to alter a person or return boundary. */
async function baseline(db: Prisma.TransactionClient, gameId: string, rowId: string, old: Receipt, baselineAssetId: string,
  readArt: ReadArt, publication = false) {
  const game = await db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, orders: true } });
  const child = game?.childProfile;
  const row = await db.targetVariantAsset.findUnique({ where: { id: rowId }, include: { targetInstance: { include: { gameScene: true } } } });
  if (!game || !child || !row || game.deletedAt || child.deletedAt || child.ownerId !== game.ownerId || !child.identityAssetId
    || !(game.status === 'TARGETS_GENERATING' || publication && ['READY', 'DELIVERED'].includes(game.status))
    || !publication && (game.configJson || game.readyAt) || row.targetInstance.gameScene.gameId !== gameId
    || row.targetInstance.gameScene.sceneVersion !== 13 || row.attempts < 1 || row.attempts > 3
    || game.orders.some(o => o.refundedAt || o.paymentStatus === 'REFUNDED')
    || !game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === 'PAID' && o.paidAt)
    || incompatible.some(k => old[k] !== undefined) || old.sourceBodyGapFill !== undefined
    || !sourceBodyGapCandidate({ ...row, status: 'FAILED', assetId: baselineAssetId, judgeJson: JSON.stringify(old) })) return null;
  const context = await resolveLocalPatchBoardsForGame(db, gameId, 13), g = sourceBodyForHide(context, old.hide);
  const board = context.boards.find(b => b.hides.some(h => h.id === old.hide));
  const hide = board?.hides.find(h => h.id === old.hide);
  const authority = g && sourceBodyGapAuthority(g);
  if (!g || !authority || !board || !hide || hide.targetId !== row.targetInstance.targetId || hide.pose !== old.pose) return null;
  const before = await readArt(board.art, g.sourceSha256);
  if (!await sourceBodyCompositionEvidenceMatches(db, { gameId, hideId: hide.id, receipt: old, geometry: g, beforePng: before })) return null;
  const asset = await db.asset.findUnique({ where: { id: baselineAssetId } });
  const identity = await db.asset.findUnique({ where: { id: child.identityAssetId } });
  if (!asset || asset.deletedAt || asset.status !== 'READY' || asset.type !== 'TARGET_SPRITE' || asset.visibility !== 'GAME'
    || asset.ownerId !== game.ownerId || asset.providerRequestId !== gameId || asset.provider !== 'local-patch'
    || !identity || identity.deletedAt || identity.status !== 'READY' || identity.type !== 'IDENTITY_SHEET'
    || identity.visibility !== 'PRIVATE' || identity.ownerId !== game.ownerId) return null;
  const storage = new DbStorage(db), image = await storage.get(asset.storagePath), identitySha256 = sha(await storage.get(identity.storagePath));
  const policy = await singleMediumReviewPolicyOf(db, gameId), proof = old.boardReview?.dual as DualReviewProof;
  if (!policy || policy.identitySha256 !== identitySha256 || sha(image) !== old.judgedSha256
    || old.geometrySha256 !== localPatchPublicationGeometryHash(row) || proof.hideId !== hide.id
    || proof.imageSha256 !== old.judgedSha256 || proof.geometrySha256 !== old.geometrySha256 || proof.identitySha256 !== identitySha256
    || !proof.continuity || !proof.subject || !equal(readQualityStage(proof.quality, hide.id, 13), old.verdict)) return null;
  const options = { allowSingle: true, authoredReviewBinding: authoredLocalPatchReviewBinding({ hideId: hide.id,
    imageSha256: old.judgedSha256, geometrySha256: old.geometrySha256, identitySha256, authoredReturn: old.authoredReturn }) };
  const stages = await Promise.all([verifiedDualStage(db, gameId + ':board-wizard', proof.quality, 'scene-quality', options),
    verifiedDualStage(db, gameId + ':board-wizard', proof.continuity, 'head-continuity', options),
    verifiedDualStage(db, gameId + ':board-wizard', proof.subject, 'scene-quality', options)]);
  if (stages.some(s => !s) || !stages[0]!.bytes.equals(stages[1]!.bytes) || !stages[0]!.bytes.equals(stages[2]!.bytes)) return null;
  const birth = sourceBodyBirthMarkerSchema.parse(old.sourceBodyBirth), requestKey = sourceBodyBirthRequestKey(birth);
  const paid = await readSettledTargetRaw(db, gameId, requestKey);
  return { game, row, g, authority, before, image, identitySha256, paid, requestKey };
}
/** A finite background-only correction inside the SAME return; never a new
 * painting, attempt, opinion, grant or acceptance. Fresh ordinary MEDIUM owed. */
export async function correctSourceBodyGap(c: Container, gameId: string, rows: readonly Candidate[], fence: (tx: Prisma.TransactionClient) => Promise<void>,
  readArt: ReadArt = readShippedBoardArt) {
  if (env().APP_ENV !== 'qa' || c.storage.id !== 'db') return false;
  for (const candidate of rows.filter(sourceBodyGapCandidate)) {
    const changed = await c.db.$transaction(async tx => {
      await fenceLocalPatchImages(tx, gameId); await fence(tx);
      const worldId = gameId + ':board-wizard', ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(tx).read(worldId);
      if (!ledger) return false;
      const row = await tx.targetVariantAsset.findUnique({ where: { id: candidate.id } });
      if (!row || !sourceBodyGapCandidate(row) || row.judgeJson !== candidate.judgeJson || row.assetId !== candidate.assetId) return false;
      const old = JSON.parse(row.judgeJson!), p = await baseline(tx, gameId, row.id, old, row.assetId!, readArt);
      if (!p) return false;
      const result = await joined(p.paid.normalized, p.image, p.g);
      if (!result.proof.changedPixels) return false;
      const body = { version: SOURCE_BODY_GAP_VERSION, gameId, rowId: row.id, hideId: old.hide, attempts: row.attempts,
        authoritySha256: hash(p.authority), baselineReceiptSha256: sha(Buffer.from(row.judgeJson!)), baselineAssetId: row.assetId!,
        baselineImageSha256: old.judgedSha256, sourceRequestKey: p.requestKey, sourceFingerprint: p.paid.kept.operationFingerprint,
        sourcePayloadSha256: p.paid.kept.payloadSha256, normalizedRawSha256: sha(p.paid.normalized), sourcePngSha256: sha(p.before),
        geometrySha256: old.geometrySha256, identitySha256: p.identitySha256, candidateSha256: sha(result.png) };
      const marker = sourceBodyGapSchema.parse({ ...body, auditId: bodyGapAuditId(body) });
      if (await tx.auditLog.findUnique({ where: { id: marker.auditId } })) return false;
      const cas = await tx.worldBudgetLedger.updateMany({ where: { worldId, revision: ledger.revision }, data: { revision: { increment: 1 } } });
      if (cas.count !== 1) return false;
      const assetId = 'ast_bgp_' + hash([gameId, row.id, marker.candidateSha256]).slice(0, 24), key = `game/${assetId}.png`;
      await tx.asset.create({ data: { id: assetId, ownerId: p.game.ownerId, type: 'TARGET_SPRITE', visibility: 'GAME', status: 'READY', storagePath: key,
        mimeType: 'image/png', width: 512, height: 768, bytes: result.png.length, costCents: 0, provider: 'local-patch', providerRequestId: gameId } });
      await new DbStorage(tx).put(key, result.png, 'image/png');
      const rejected: unknown = JSON.parse(row.rejectedAssetIdsJson ?? '[]');
      if (!Array.isArray(rejected) || !rejected.every(v => typeof v === 'string')) throw Error('BODY_GAP: invalid retained inventory');
      await tx.auditLog.create({ data: { id: marker.auditId, actorType: 'SYSTEM', action: SOURCE_BODY_GAP_ACTION, entityType: 'Game', entityId: gameId,
        metaJson: JSON.stringify({ marker, assetId, previousJudgeJson: row.judgeJson, previousCostCents: row.costCents, proof: result.proof,
          providerCalls: 0, attemptsPreserved: true, cyclesPreserved: true, requestsPreserved: true, approvalTransferred: false }) } });
      const receipt = { ...old, sourceBodyGapFill: marker, judgedSha256: marker.candidateSha256, verdict: null, wireFault: null,
        boardReview: undefined, dualContinuityCheckpoint: undefined, qualityDisposition: undefined, reviewState: 'pending-board-review' };
      await tx.targetVariantAsset.update({ where: { id: row.id }, data: { assetId, status: 'GENERATED', judgeJson: JSON.stringify(receipt), lastError: null,
        rejectedAssetIdsJson: JSON.stringify([...new Set([...rejected, row.assetId!])]) } });
      await tx.targetInstance.update({ where: { id: row.targetInstanceId }, data: { status: 'GENERATED', spriteKind: 'image', spriteAssetId: assetId } });
      await tx.gameScene.update({ where: { id: p.row.targetInstance.gameSceneId }, data: { generationStatus: 'NEEDS_REGENERATION', configJson: null } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    if (changed) return true;
  }
  return false;
}
/** Every review/publication reproduces candidate bytes and the original paid
 * mask, refusal, RAW, identity, geometry and owned assets. Claimed zeros do not authorize. */
export async function sourceBodyGapBaseline(db: Prisma.TransactionClient, gameId: string, marker: SourceBodyGap,
  readArt: ReadArt = readShippedBoardArt) {
  try {
    const m = sourceBodyGapSchema.parse(marker), { auditId, ...body } = m;
    if (m.gameId !== gameId || auditId !== bodyGapAuditId(body)) return null;
    const audit = await db.auditLog.findUnique({ where: { id: auditId } }), meta = audit && JSON.parse(audit.metaJson ?? 'null');
    if (!audit || audit.actorType !== 'SYSTEM' || audit.actorId !== null || audit.action !== SOURCE_BODY_GAP_ACTION
      || audit.entityType !== 'Game' || audit.entityId !== gameId || !equal(meta?.marker, m)
      || sha(Buffer.from(meta.previousJudgeJson)) !== m.baselineReceiptSha256) return null;
    const previous = JSON.parse(meta.previousJudgeJson), p = await baseline(db, gameId, m.rowId, previous, m.baselineAssetId, readArt, true);
    if (!p || p.row.attempts !== m.attempts || p.row.costCents !== meta.previousCostCents || p.row.assetId !== meta.assetId
      || hash(p.authority) !== m.authoritySha256 || sha(p.before) !== m.sourcePngSha256 || p.identitySha256 !== m.identitySha256
      || p.paid.kept.operationFingerprint !== m.sourceFingerprint || p.paid.kept.payloadSha256 !== m.sourcePayloadSha256
      || p.requestKey !== m.sourceRequestKey || sha(p.paid.normalized) !== m.normalizedRawSha256
      || previous.judgedSha256 !== m.baselineImageSha256 || previous.geometrySha256 !== m.geometrySha256) return null;
    const current = JSON.parse(p.row.judgeJson ?? 'null');
    if (!equal(current?.sourceBodyGapFill, m) || current.judgedSha256 !== m.candidateSha256 || current.geometrySha256 !== m.geometrySha256
      || !equal(current.sourceBodyBirth, previous.sourceBodyBirth) || !equal(current.sourceBodyComposition, previous.sourceBodyComposition)
      || !equal(current.authoredReturn, previous.authoredReturn) || incompatible.some(k => current[k] !== undefined)) return null;
    const result = await joined(p.paid.normalized, p.image, p.g), asset = await db.asset.findUnique({ where: { id: meta.assetId } });
    const expectedId = 'ast_bgp_' + hash([gameId, m.rowId, m.candidateSha256]).slice(0, 24);
    if (sha(result.png) !== m.candidateSha256 || !equal(result.proof, meta.proof) || !asset || asset.id !== expectedId
      || asset.storagePath !== `game/${expectedId}.png` || asset.ownerId !== p.game.ownerId || asset.deletedAt || asset.status !== 'READY'
      || asset.provider !== 'local-patch' || asset.providerRequestId !== gameId || asset.type !== 'TARGET_SPRITE' || asset.visibility !== 'GAME'
      || sha(await new DbStorage(db).get(asset.storagePath)) !== m.candidateSha256) return null;
    return { previous, previousJudgeJson: meta.previousJudgeJson as string, assetId: asset.id, variantId: m.rowId };
  } catch { return null; }
}
