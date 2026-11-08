import { Prisma } from '@prisma/client';
import sharp from 'sharp';
import type { Container } from '../container';
import { DbStorage } from '../../infra/storage/db';
import { PrismaWorldBudgetStore } from '../../infra/db/prisma-world-budget-store';
import { SOURCE_FIGURE_ACTION, SOURCE_FIGURE_RETURN_VERSION, SOURCE_FIGURE_GEOMETRY_VERSION, composeSourceFigureReturn,
  sourceFigureAuthorityFor, sourceFigureAuditId, sourceFigureHash as hash, sourceFigureReturnSchema,
  type SourceFigureAuthority } from '../../domain/generation/source-figure-return';
import { readQaCompletionCapacity } from './qa-completion-capacity';
import { cropOf } from '../../domain/scene/local-patch-hides';
import { singleMediumReviewPolicyOf } from './single-medium-policy';
import { resolveLocalPatchBoardsForGame } from './source-placement-release';
import { expectedAuthoredLocalPatchReturn, authoredLocalPatchRecoveryEvidenceMatches, authoredLocalPatchReviewBinding } from './local-patch-authored-return';
import { readShippedBoardArt, type LocalPatchHideDeps } from './local-patch-hide';
import { readSettledTargetRaw } from './single-review-head-evidence';
import { localPatchGeometry } from './local-patch-geometry';
import { paidPatchJoinGeometry } from './local-patch-repair-compose';
import { localPatchPublicationGeometryHash } from './local-patch-publication-policy';
import { fenceLocalPatchImages } from './local-patch-lifecycle';
import { backgroundRoundsOnImage } from './continuity-background';
import { dualVisualReviewVersion } from './visual-review-release';
import { sha256Bytes as sha } from './fixed-sprite';

type ReadArt = NonNullable<LocalPatchHideDeps['readBoardArt']>;
const equal = (a: unknown, b: unknown) => hash(a) === hash(b);
const decode = async (png: Buffer) => { const { data, info } = await sharp(png, { limitInputPixels: 8294400 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels }; };
const geometryOf = (measured: Awaited<ReturnType<typeof localPatchGeometry>>) => ({ rectJson: JSON.stringify(measured.geometry.rect),
  hitRectJson: JSON.stringify(measured.geometry.hitRect), headAnchorJson: JSON.stringify(measured.geometry.anchor) });
type Candidate = { id: string; status: string; assetId: string | null; judgeJson: string | null };
export function sourceFigureCandidate(row: Candidate) {
  try { const j = JSON.parse(row.judgeJson ?? 'null');
    return row.status === 'GENERATED' && !!row.assetId && j?.hide === 'cloudcity-detectives-hide-1'
      && j.authoredRecovery !== undefined && j.sourceFigureReturn === undefined && j.reviewState === 'pending-board-review'
      && j.boardReview === undefined && j.wireFault === null && j.renderFault == null;
  } catch { return false; }
}
async function composed(a: SourceFigureAuthority, before: Buffer, raw: Buffer, baseline: Buffer) {
  if (sha(before) !== a.sourcePngSha256) throw Error('SOURCE_FIGURE: public source PNG changed');
  const scene = await sharp(before, { limitInputPixels: 8294400 }).extract(a.crop).png().toBuffer();
  const result = composeSourceFigureReturn({ authority: a, scene: await decode(scene), raw: await decode(raw), baseline: await decode(baseline) });
  return { png: await sharp(result.pixels, { raw: { width: 512, height: 768, channels: 4 } }).png().toBuffer(), reports: result.reports };
}
/** All inputs are read inside the caller's fenced transaction. The original
 * diagnosis and shrink-only composition stay the baseline, not a rewritten plan. */
async function baselineContext(c: Container, gameId: string, rowId: string, receipt: Record<string, any>, baselineAssetId: string,
  readArt: ReadArt, publication = false) {
  const grant = await readQaCompletionCapacity(c, gameId + ':board-wizard');
  if (!grant) return null;
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true } }), child = game?.childProfile;
  const row = await c.db.targetVariantAsset.findUnique({ where: { id: rowId }, include: { targetInstance: { include: { gameScene: true } } } });
  if (!game || !(game.status === 'TARGETS_GENERATING' || publication && ['READY', 'DELIVERED'].includes(game.status))
    || !publication && (game.configJson || game.readyAt) || !child || !row || row.status !== 'GENERATED' || row.attempts < 1 || row.attempts > 3
    || row.targetInstance.gameScene.gameId !== gameId || row.targetInstance.gameScene.sceneVersion !== 13 || receipt.sourceFigureReturn !== undefined
    || ['crownTab', 'headPixelCorrection', 'crownReturn', 'propJoinCorrection', 'foreground', 'retainedNormalHead', 'sourceBodyBirth', 'sourceBodyRepair'].some(k => receipt[k] !== undefined)) return null;
  const context = await resolveLocalPatchBoardsForGame(c.db, gameId, 13), scene = row.targetInstance.gameScene;
  const board = context.boards.find(b => b.board === scene.sceneSlug), hide = board?.hides.find(h => h.targetId === row.targetInstance.targetId);
  if (!board || !hide || receipt.hide !== hide.id || receipt.pose !== hide.pose) return null;
  const parent = expectedAuthoredLocalPatchReturn(board, hide, 13, context);
  const authority = parent && sourceFigureAuthorityFor(parent, receipt.authoredRecovery?.returnWindow);
  if (!authority || !equal(receipt.authoredReturn, parent) || receipt.headPolicyVersion !== 'target-head-return/v2-visible-completeness') return null;
  if (board.hides.some(other => other.id !== hide.id && authority.extensions.some(e => {
    const r = cropOf(other), x = authority.crop.left + e.rect.left, y = authority.crop.top + e.rect.top;
    return x < r.left + r.width && x + e.rect.width > r.left && y < r.top + r.height && y + e.rect.height > r.top;
  }))) return null;
  const before = await readArt(board.art, authority.source.sha256);
  if (sha(before) !== authority.sourcePngSha256) return null;
  if (!await authoredLocalPatchRecoveryEvidenceMatches(c.db, { gameId, board, hide, sceneVersion: 13, receipt,
    placementContext: context, promptVersion: row.promptVersion, beforePng: before })) return null;
  const baselineAsset = await c.db.asset.findUnique({ where: { id: baselineAssetId } });
  const identity = child.identityAssetId ? await c.db.asset.findUnique({ where: { id: child.identityAssetId } }) : null;
  if (!baselineAsset || baselineAsset.ownerId !== game.ownerId || baselineAsset.providerRequestId !== gameId || baselineAsset.provider !== 'local-patch'
    || baselineAsset.visibility !== 'GAME' || baselineAsset.type !== 'TARGET_SPRITE' || baselineAsset.status !== 'READY' || baselineAsset.deletedAt
    || !identity || identity.ownerId !== game.ownerId || identity.visibility !== 'PRIVATE' || identity.type !== 'IDENTITY_SHEET'
    || identity.status !== 'READY' || identity.deletedAt) return null;
  const baseline = await c.storage.get(baselineAsset.storagePath), identitySha256 = sha(await c.storage.get(identity.storagePath));
  const policy = await singleMediumReviewPolicyOf(c.db, gameId);
  if (!policy || policy.identitySha256 !== identitySha256) return null;
  const paid = await readSettledTargetRaw(c.db, gameId, receipt.authoredRecovery.source.requestKey);
  if (sha(baseline) !== receipt.judgedSha256 || !equal(paid.wire.authoredReturn, parent)) return null;
  const baselineGeometry = paidPatchJoinGeometry({ crop: authority.crop, protectedCore: receipt.authoredRecovery.protectedCore,
    faceRect: receipt.authoredRecovery.faceRect, boardSize: authority.source });
  if (localPatchPublicationGeometryHash({ rectJson: JSON.stringify(baselineGeometry.rect), hitRectJson: JSON.stringify(baselineGeometry.hitRect),
    headAnchorJson: JSON.stringify(baselineGeometry.anchor) }) !== receipt.geometrySha256) return null;
  return { game, child, row, scene, board, hide, parent: parent!, authority, before, baseline, baselineAsset, identity, identitySha256, paid, grant };
}
/** Refuse both recorded rounds and orphaned reservations for any historical
 * form of the current question. This must run after the ledger/lease fence. */
async function hasQuestion(c: Container, p: NonNullable<Awaited<ReturnType<typeof baselineContext>>>, receipt: Record<string, any>) {
  const binding = { hideId: p.hide.id, variantId: p.row.id, imageSha256: receipt.judgedSha256,
    geometrySha256: receipt.geometrySha256, identitySha256: p.identitySha256,
    authoredReviewBinding: authoredLocalPatchReviewBinding({ hideId: p.hide.id, imageSha256: receipt.judgedSha256,
      geometrySha256: receipt.geometrySha256, identitySha256: p.identitySha256, authoredReturn: receipt.authoredReturn, authoredRecovery: receipt.authoredRecovery })! };
  if ((await backgroundRoundsOnImage(c.db, p.game.id, binding)).length) return true;
  const prepared = await (await import('./local-patch-board-review')).prepareLocalPatchBoardReview(c, { gameId: p.game.id, sceneId: p.scene.id },
    { readBoardArt: async () => p.before }, { onlyHideId: p.hide.id, playerReview: true });
  const version = await dualVisualReviewVersion(c.db, p.game.id);
  if (!prepared.ready || !version) return true;
  const candidates = await (await import('./local-patch-dual-review')).dualReviewQuestionCandidates(c, prepared, version);
  const stored = await PrismaWorldBudgetStore.forReadOnlyTransaction(c.db).read(p.game.id + ':board-wizard');
  return !stored || candidates.some(q => stored.snapshot.requests.some(r => r.requestKey === q.requestKey));
}
/** At most one free application and no opinion. A new ordinary MEDIUM remains
 * mandatory. The caller yields after true, before any provider dispatch. */
export async function correctSourceFigureReturn(c: Container, gameId: string, rows: readonly Candidate[], fence: (tx: Prisma.TransactionClient) => Promise<void>,
  readArt: ReadArt = readShippedBoardArt) {
  if (c.storage.id !== 'db') return false;
  for (const candidate of rows.filter(sourceFigureCandidate)) {
    const changed = await c.db.$transaction(async tx => {
      await fenceLocalPatchImages(tx, gameId); await fence(tx);
      const scoped = { ...c, db: tx, storage: new DbStorage(tx) } as unknown as Container, worldId = gameId + ':board-wizard';
      const stored = await PrismaWorldBudgetStore.forReadOnlyTransaction(tx).read(worldId);
      if (!stored || stored.snapshot.requests.some(r => r.state === 'pending')) return false;
      const row = await tx.targetVariantAsset.findUnique({ where: { id: candidate.id } });
      if (!row || !sourceFigureCandidate(row) || row.judgeJson !== candidate.judgeJson || row.assetId !== candidate.assetId) return false;
      const j = JSON.parse(row.judgeJson!), p = await baselineContext(scoped, gameId, row.id, j, row.assetId!, readArt);
      if (!p || j.geometrySha256 !== localPatchPublicationGeometryHash(row) || await hasQuestion(scoped, p, j)) return false;
      const joined = await composed(p.authority, p.before, p.paid.normalized, p.baseline), candidateSha256 = sha(joined.png);
      if (candidateSha256 === j.judgedSha256) return false;
      const measured = await localPatchGeometry({ hide: p.hide, boardPng: p.before, patchPng: joined.png, board: p.authority.source,
        contentVersion: 13, sourceFigure: p.authority }), geometry = geometryOf(measured);
      const body = { version: SOURCE_FIGURE_RETURN_VERSION, geometryVersion: SOURCE_FIGURE_GEOMETRY_VERSION, gameId, rowId: row.id, hideId: p.hide.id,
        attempts: row.attempts, authoritySha256: hash(p.authority), parentSha256: hash(p.parent), baselineReceiptSha256: sha(Buffer.from(row.judgeJson!)),
        sourceRequestKey: j.authoredRecovery.source.requestKey, sourceFingerprint: p.paid.kept.operationFingerprint, sourcePayloadSha256: p.paid.kept.payloadSha256,
        normalizedRawSha256: sha(p.paid.normalized), sourcePngSha256: sha(p.before), baselineAssetId: row.assetId!, baselineImageSha256: j.judgedSha256,
        baselineGeometrySha256: j.geometrySha256, candidateSha256, geometrySha256: localPatchPublicationGeometryHash(geometry), identitySha256: p.identitySha256 };
      const marker = sourceFigureReturnSchema.parse({ ...body, auditId: sourceFigureAuditId(body) });
      if (await tx.auditLog.findUnique({ where: { id: marker.auditId } })) return false;
      const cas = await tx.worldBudgetLedger.updateMany({ where: { worldId, revision: stored.revision }, data: { revision: { increment: 1 } } });
      if (cas.count !== 1) return false;
      const assetId = 'ast_fgr_' + hash([gameId, p.hide.id, candidateSha256]).slice(0, 24), key = `game/${assetId}.png`;
      await tx.asset.create({ data: { id: assetId, ownerId: p.game.ownerId, type: 'TARGET_SPRITE', visibility: 'GAME', status: 'READY', storagePath: key,
        mimeType: 'image/png', width: 512, height: 768, bytes: joined.png.length, costCents: 0, provider: 'local-patch', providerRequestId: gameId } });
      await new DbStorage(tx).put(key, joined.png, 'image/png');
      const retained: unknown = JSON.parse(row.rejectedAssetIdsJson ?? '[]');
      if (!Array.isArray(retained) || !retained.every(v => typeof v === 'string')) throw Error('SOURCE_FIGURE: invalid old image inventory');
      await tx.auditLog.create({ data: { id: marker.auditId, actorType: 'SYSTEM', action: SOURCE_FIGURE_ACTION, entityType: 'Game', entityId: gameId,
        metaJson: JSON.stringify({ marker, assetId, previousJudgeJson: row.judgeJson, previousGeometry: { rectJson: row.rectJson, hitRectJson: row.hitRectJson, headAnchorJson: row.headAnchorJson },
          previousCostCents: row.costCents, joins: joined.reports, providerCalls: 0, attemptsPreserved: true, cyclesPreserved: true, requestsPreserved: true, approvalTransferred: false }) } });
      const receipt = { ...j, sourceFigureReturn: marker, judgedSha256: candidateSha256, geometrySha256: marker.geometrySha256,
        geometryBasis: measured.basis, measuredFraction: Number(measured.measuredFraction.toFixed(4)), verdict: null, qualityDisposition: undefined,
        dualContinuityCheckpoint: undefined, boardReview: undefined, reviewState: 'pending-board-review' };
      await tx.targetVariantAsset.update({ where: { id: row.id }, data: { assetId, ...geometry, judgeJson: JSON.stringify(receipt), lastError: null,
        rejectedAssetIdsJson: JSON.stringify([...new Set([...retained, row.assetId!])]) } });
      await tx.targetInstance.update({ where: { id: row.targetInstanceId }, data: { status: 'GENERATED', spriteKind: 'image', spriteAssetId: assetId } });
      await tx.gameScene.update({ where: { id: p.scene.id }, data: { generationStatus: 'NEEDS_REGENERATION', configJson: null } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
    if (changed) return true;
  }
  return false;
}

/** Reproduce the full figure and its new geometry. A marker, copied audit or
 * artist's/model's coordinates alone can never admit it. */
export async function sourceFigurePublicationMatches(db: Prisma.TransactionClient, input: { gameId: string; sceneVersion: number; hideId: string;
  variantId?: string; assetId?: string; judgeJson: string | null; identitySha256?: string }, readArt: ReadArt = readShippedBoardArt) {
  try {
    const j = JSON.parse(input.judgeJson ?? 'null'), m = sourceFigureReturnSchema.parse(j?.sourceFigureReturn);
    if (input.sceneVersion !== 13 || m.gameId !== input.gameId || m.hideId !== input.hideId || input.variantId !== m.rowId
      || input.identitySha256 !== undefined && input.identitySha256 !== m.identitySha256 || m.auditId !== sourceFigureAuditId(m)) return false;
    const audit = await db.auditLog.findUnique({ where: { id: m.auditId } }), saved = JSON.parse(audit?.metaJson ?? 'null');
    if (!audit || audit.actorType !== 'SYSTEM' || audit.actorId !== null || audit.action !== SOURCE_FIGURE_ACTION || audit.entityType !== 'Game'
      || audit.entityId !== input.gameId || !equal(saved?.marker, m) || saved?.providerCalls !== 0 || saved.approvalTransferred !== false
      || typeof saved.previousJudgeJson !== 'string' || sha(Buffer.from(saved.previousJudgeJson)) !== m.baselineReceiptSha256) return false;
    const old = JSON.parse(saved.previousJudgeJson), c = { db, storage: new DbStorage(db) } as unknown as Container;
    const p = await baselineContext(c, input.gameId, m.rowId, old, m.baselineAssetId, readArt, true);
    if (!p || !equal(old.authoredReturn, j.authoredReturn) || !equal(old.authoredRecovery, j.authoredRecovery) || !equal(old.selfRepair, j.selfRepair)
      || p.row.assetId !== input.assetId || p.row.attempts !== m.attempts || !equal(JSON.parse(p.row.judgeJson!), j)
      || hash(p.authority) !== m.authoritySha256 || hash(p.parent) !== m.parentSha256 || sha(p.before) !== m.sourcePngSha256
      || p.identitySha256 !== m.identitySha256 || p.paid.kept.operationFingerprint !== m.sourceFingerprint || p.paid.kept.payloadSha256 !== m.sourcePayloadSha256
      || old.authoredRecovery.source.requestKey !== m.sourceRequestKey || sha(p.paid.normalized) !== m.normalizedRawSha256
      || old.judgedSha256 !== m.baselineImageSha256 || localPatchPublicationGeometryHash(saved.previousGeometry) !== m.baselineGeometrySha256
      || old.geometrySha256 !== m.baselineGeometrySha256 || p.row.costCents !== saved.previousCostCents) return false;
    const joined = await composed(p.authority, p.before, p.paid.normalized, p.baseline);
    const measured = await localPatchGeometry({ hide: p.hide, boardPng: p.before, patchPng: joined.png, board: p.authority.source, contentVersion: 13, sourceFigure: p.authority });
    if (sha(joined.png) !== m.candidateSha256 || j.judgedSha256 !== m.candidateSha256 || !equal(saved.joins, joined.reports)
      || localPatchPublicationGeometryHash(geometryOf(measured)) !== m.geometrySha256 || localPatchPublicationGeometryHash(p.row) !== m.geometrySha256
      || j.geometrySha256 !== m.geometrySha256) return false;
    const asset = input.assetId ? await db.asset.findUnique({ where: { id: input.assetId } }) : null;
    const assetId = 'ast_fgr_' + hash([input.gameId, input.hideId, m.candidateSha256]).slice(0, 24);
    if (!asset || asset.id !== saved.assetId || asset.id !== assetId || asset.storagePath !== `game/${assetId}.png` || asset.ownerId !== p.game.ownerId || asset.providerRequestId !== input.gameId
      || asset.provider !== 'local-patch' || asset.type !== 'TARGET_SPRITE' || asset.visibility !== 'GAME' || asset.status !== 'READY' || asset.deletedAt) return false;
    return sha(await c.storage.get(asset.storagePath)) === m.candidateSha256;
  } catch { return false; }
}
