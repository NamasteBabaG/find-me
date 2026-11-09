import { Prisma } from '@prisma/client';
import { isDeepStrictEqual as same } from 'node:util';
import sharp from 'sharp';
import type { Container } from '../container';
import { env } from '../../lib/env';
import { DbStorage } from '../../infra/storage/db';
import { PrismaWorldBudgetStore } from '../../infra/db/prisma-world-budget-store';
import { RETAINED_WINDOW_MANIFEST_SHA256, retainedWindowAuthorityFor } from '../../../content/detectives/retained-window-v1';
import { composeRetainedWindow, retainedWindowAuditId, retainedWindowCanonicalHash as hash, retainedWindowMarkerSchema,
  RETAINED_WINDOW_ACTION, RETAINED_WINDOW_VERSION, type RetainedWindowAuthority } from '../../domain/generation/retained-window';
import { TARGET_HEAD_VISIBLE_VERSION } from '../../domain/generation/target-head-return';
import { resolveLocalPatchBoardsForGame } from './source-placement-release';
import { expectedAuthoredLocalPatchReturn } from './local-patch-authored-return';
import { readSettledTargetRaw } from './single-review-head-evidence';
import { singleMediumReviewPolicyOf } from './single-medium-policy';
import { readQaCompletionCapacity } from './qa-completion-capacity';
import { boardWizardBudgetOf } from './board-conditioned-wizard';
import { readShippedBoardArt, type LocalPatchHideDeps } from './local-patch-hide';
import { localPatchGeometry } from './local-patch-geometry';
import { localPatchPublicationGeometryHash } from './local-patch-publication-policy';
import { fenceLocalPatchImages } from './local-patch-lifecycle';
import { sha256Bytes as sha } from './fixed-sprite';
import { cropOf } from '../../domain/scene/local-patch-hides';

type Db = Prisma.TransactionClient;
type ReadArt = NonNullable<LocalPatchHideDeps['readBoardArt']>;
const decode = async (png: Buffer) => {
  const { data, info } = await sharp(png, { limitInputPixels: 8294400 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
};
const geometryOf = (m: Awaited<ReturnType<typeof localPatchGeometry>>) => ({ rectJson: JSON.stringify(m.geometry.rect),
  hitRectJson: JSON.stringify(m.geometry.hitRect), headAnchorJson: JSON.stringify(m.geometry.anchor) });
const assetIdOf = (gameId: string, hideId: string, image: string) => 'ast_rsw_' + hash([gameId, hideId, image]).slice(0, 24);
const rowAuditId = (gameId: string, rowId: string) => 'aud_retained_window_row_' + hash([gameId, rowId]).slice(0, 40);
const demand = (ok: unknown, why: string): void => { if (!ok) throw Error('RETAINED_WINDOW: ' + why); };

/** A new permission cannot fix unchanged, intrinsic age evidence. Those two
 * placements need a different, separately qualified drawing recipe. */
const freeWindowHide = (id: string) => !['newyork-detectives-hide-1', 'paris-detectives-hide-1'].includes(id);

async function context(c: Container, gameId: string, rowId: string, publication: boolean) {
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, orders: true, scenes: true } });
  const row = await c.db.targetVariantAsset.findUnique({ where: { id: rowId }, include: { targetInstance: { include: { gameScene: true } } } });
  const child = game?.childProfile;
  if (!game || game.deletedAt || !game.paidAt || !child || child.deletedAt || child.ownerId !== game.ownerId || child.ageYears !== 7
    || !row || row.variant !== 'A' || row.provider !== 'local-patch'
    || row.targetInstance.gameScene.gameId !== gameId || game.styleVersion !== 'local-patch-world-v1'
    || !(game.status === 'TARGETS_GENERATING' || publication && ['READY', 'DELIVERED'].includes(game.status))
    || !publication && (game.readyAt || game.configJson) || game.scenes.length !== 9 || game.scenes.some(s => s.sceneVersion !== 13)
    || game.orders.some(o => o.refundedAt || o.paymentStatus === 'REFUNDED')
    || !game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === 'PAID' && o.paidAt)) return null;
  const policy = await singleMediumReviewPolicyOf(c.db, gameId);
  if (!policy) return null;
  const identity = child.identityAssetId ? await c.db.asset.findUnique({ where: { id: child.identityAssetId } }) : null;
  if (!identity || identity.ownerId !== game.ownerId || identity.visibility !== 'PRIVATE' || identity.type !== 'IDENTITY_SHEET'
    || identity.status !== 'READY' || identity.deletedAt) return null;
  const identitySha256 = sha(await c.storage.get(identity.storagePath));
  if (identitySha256 !== policy.identitySha256) return null;
  const placement = await resolveLocalPatchBoardsForGame(c.db, gameId, 13), scene = row.targetInstance.gameScene;
  const board = placement.boards.find(b => b.board === scene.sceneSlug), hide = board?.hides.find(h => h.targetId === row.targetInstance.targetId);
  const parent = board && hide ? expectedAuthoredLocalPatchReturn(board, hide, 13, placement) : null;
  const authority = parent && retainedWindowAuthorityFor(parent);
  if (!board || !hide || !parent || !authority || !freeWindowHide(hide.id)) return null;
  if (board.hides.some(other => other.id !== hide.id && (() => {
    const r = cropOf(other), q = authority.crop;
    return q.left < r.left + r.width && q.left + q.width > r.left && q.top < r.top + r.height && q.top + q.height > r.top;
  })())) return null;
  const grant = await readQaCompletionCapacity(c, gameId + ':board-wizard');
  const budget = await boardWizardBudgetOf(c).audit(gameId + ':board-wizard');
  if (budget.capMicroUsd !== (grant ? 12000000 : 4000000) || budget.overCapMicroUsd
    || budget.conflictRequestKeys.length || budget.overrunRequestKeys.length) return null;
  return { game, row, board, hide, parent, authority, identitySha256, scene };
}

async function compose(authority: RetainedWindowAuthority, before: Buffer, raw: Buffer) {
  const scene = await sharp(before, { limitInputPixels: 8294400 }).extract(authority.crop).png().toBuffer();
  const made = composeRetainedWindow({ authority, scene: await decode(scene), raw: await decode(raw) });
  return { png: await sharp(Buffer.from(made.pixels.data), { raw: { width: 512, height: 768, channels: 4 } }).png().toBuffer(), proof: made.proof };
}

/** Only an explicit, named QA restore turn calls this. It never invokes a
 * painter or a reviewer. One immutable application per row, then yield. */
export async function restoreRetainedWindow(c: Container, gameId: string, hideId: string, readArt: ReadArt = readShippedBoardArt,
  observeRefusal?: (why: string) => void, sourceRequestKey?: string) {
  const refuse = (why: string) => { observeRefusal?.(why); return false; };
  if (env().APP_ENV !== 'qa' || c.storage.id !== 'db' || !freeWindowHide(hideId)) return refuse('qa-scope-or-intrinsic-placement');
  return c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, gameId);
    const scoped = { ...c, db: tx, storage: new DbStorage(tx) } as unknown as Container, worldId = gameId + ':board-wizard';
    const job = await tx.generationJob.findUnique({ where: { id: 'job_' + gameId } });
    if (!job || !['QUEUED', 'FAILED'].includes(job.status)) return refuse('job-is-active');
    const rows = await tx.targetVariantAsset.findMany({ where: { variant: 'A', targetInstance: { gameScene: { gameId } } },
      include: { targetInstance: { include: { gameScene: true } } }, orderBy: { id: 'asc' } });
    if (rows.length !== 27) return refuse('all27-original-rows-required');
    const placement = await resolveLocalPatchBoardsForGame(tx, gameId, 13), b = placement.boards.find(b => b.hides.some(h => h.id === hideId));
    const hide = b?.hides.find(h => h.id === hideId), row = rows.find(r => r.targetInstance.gameScene.sceneSlug === b?.board && r.targetInstance.targetId === hide?.targetId);
    if (!row || row.status !== 'FAILED' || row.attempts < 1 || row.attempts > 8 || await tx.auditLog.findUnique({ where: { id: rowAuditId(gameId, row.id) } }))
      return refuse('failed-paid-row-or-already-restored');
    // An unapproved restored image is diagnosed before any sibling is changed.
    if (rows.some(r => { try { const j = JSON.parse(r.judgeJson ?? 'null'); return j?.retainedWindow !== undefined
      && (r.status !== 'GENERATED' || j.reviewState !== 'board-review-complete' || j.qualityDisposition?.state !== 'acceptable'); } catch { return true; } }))
      return refuse('previous-restoration-awaits-ordinary-pass');
    const old = JSON.parse(row.judgeJson ?? 'null'), p = await context(scoped, gameId, row.id, false);
    if (!old || !p || old.hide !== hideId || old.pose !== p.hide.pose || !same(old.authoredReturn, p.parent)) return refuse('original-source-or-receipt');
    const stored = await PrismaWorldBudgetStore.forReadOnlyTransaction(tx).read(worldId);
    if (!stored || stored.snapshot.requests.some(r => r.state === 'pending')) return refuse('pending-purchase');
    const before = await readArt(p.board.art, p.authority.source.sha256);
    let selected: { paid: Awaited<ReturnType<typeof readSettledTargetRaw>>; joined: Awaited<ReturnType<typeof compose>>; key: string } | null = null;
    // Latest admissible paid work first, preserving later intrinsic repairs.
    // A rejected candidate never loops through old drawings for extra opinions.
    for (const bill of [...stored.snapshot.requests].reverse().filter(r => r.scope === 'image'
      && r.requestKey.startsWith(hideId + ':' + p.hide.pose + ':') && ['settled', 'linked'].includes(r.state)
      && (sourceRequestKey === undefined || r.requestKey === sourceRequestKey))) {
      if (old.selfRepair?.subjectContext?.intrinsic === true && old.selfRepair.subjectContext.failedSource === bill.requestKey) continue;
      try {
        const paid = await readSettledTargetRaw(tx, gameId, bill.requestKey);
        if (!same(paid.wire.authoredReturn, p.parent)) continue;
        const joined = await compose(p.authority, before, paid.normalized);
        if (sha(joined.png) === old.judgedSha256) continue;
        selected = { paid, joined, key: bill.requestKey }; break;
      } catch { /* No purchase on missing, unbound or geometrically unsafe RAW. */ }
    }
    if (!selected) return refuse('no-authenticated-safe-paid-window');
    const { paid, joined, key } = selected, candidateSha256 = sha(joined.png);
    const measured = await localPatchGeometry({ contentVersion: 13, hide: p.hide, boardPng: before, patchPng: joined.png,
      board: p.authority.source, retainedWindow: p.authority }), geometry = geometryOf(measured);
    const plainRow = { ...row, targetInstance: undefined }, previousRowSha256 = hash(JSON.parse(JSON.stringify(plainRow)));
    const originalRequests = stored.snapshot.requests.map(r => ({ requestKey: r.requestKey, sha256: hash(r) }));
    const protectedRows = rows.filter(r => r.id !== row.id).map(r => ({ id: r.id, sha256: hash({ ...r, targetInstance: undefined }) }));
    const body = { version: RETAINED_WINDOW_VERSION, gameId, rowId: row.id, hideId, attempts: row.attempts,
      authoritySha256: hash(p.authority), manifestSha256: RETAINED_WINDOW_MANIFEST_SHA256, parentSha256: hash(p.parent), previousRowSha256,
      originalRequestsSha256: hash(originalRequests), protectedRowsSha256: hash(protectedRows),
      sourceRequestKey: key, sourceFingerprint: paid.kept.operationFingerprint, sourcePayloadSha256: paid.kept.payloadSha256,
      normalizedRawSha256: sha(paid.normalized), sourcePngSha256: sha(before), candidateSha256,
      geometrySha256: localPatchPublicationGeometryHash(geometry), identitySha256: p.identitySha256,
      sampleX: joined.proof.registration.sampleX, sampleY: joined.proof.registration.sampleY };
    const marker = retainedWindowMarkerSchema.parse({ ...body, auditId: retainedWindowAuditId(body) });
    const revised = await tx.worldBudgetLedger.updateMany({ where: { worldId, revision: stored.revision }, data: { revision: { increment: 1 } } });
    demand(revised.count === 1, 'concurrent ledger revision');
    const assetId = assetIdOf(gameId, hideId, candidateSha256), storagePath = `game/${assetId}.png`;
    await tx.asset.create({ data: { id: assetId, ownerId: p.game.ownerId, type: 'TARGET_SPRITE', visibility: 'GAME', status: 'READY',
      storagePath, mimeType: 'image/png', width: 512, height: 768, bytes: joined.png.length, costCents: 0, provider: 'local-patch', providerRequestId: gameId } });
    await new DbStorage(tx).put(storagePath, joined.png, 'image/png');
    const retired: unknown = JSON.parse(row.rejectedAssetIdsJson ?? '[]');
    demand(Array.isArray(retired) && retired.every(v => typeof v === 'string'), 'invalid retained image inventory');
    const receipt = { ...old };
    for (const k of ['boardReview', 'qualityDisposition', 'dualQualityCheckpoint', 'dualContinuityCheckpoint', 'evidenceDiagnosis',
      'sourceFigureReturn', 'sourceBodyGapFill', 'crownTab', 'headPixelCorrection', 'retainedNormalHead', 'headSourceVersion',
      'propJoinCorrection', 'sourceBodyBirth', 'sourceBodyRepair', 'crownReturn', 'foreground']) delete receipt[k];
    Object.assign(receipt, { retainedWindow: marker, compositionVersion: RETAINED_WINDOW_VERSION, headPolicyVersion: TARGET_HEAD_VISIBLE_VERSION,
      judgedSha256: candidateSha256, geometrySha256: marker.geometrySha256, geometryBasis: measured.basis,
      measuredFraction: Number(measured.measuredFraction.toFixed(4)), verdict: null, renderFault: null, wireFault: null, reviewState: 'pending-board-review' });
    await tx.auditLog.create({ data: { id: marker.auditId, actorType: 'SYSTEM', action: RETAINED_WINDOW_ACTION, entityType: 'Game', entityId: gameId,
      metaJson: JSON.stringify({ marker, assetId, previousRow: plainRow, originalRequests, compositionProof: joined.proof,
        protectedRows, selection: sourceRequestKey === undefined ? 'latest-admissible-paid-raw' : 'explicit-authenticated-paid-raw',
        providerCalls: 0, approvalTransferred: false }) } });
    await tx.auditLog.create({ data: { id: rowAuditId(gameId, row.id), actorType: 'SYSTEM', action: RETAINED_WINDOW_ACTION + ':once',
      entityType: 'Game', entityId: gameId, metaJson: JSON.stringify({ auditId: marker.auditId }) } });
    await tx.targetVariantAsset.update({ where: { id: row.id }, data: { status: 'GENERATED', assetId, ...geometry, lastError: null,
      judgeJson: JSON.stringify(receipt), rejectedAssetIdsJson: JSON.stringify([...new Set([...(retired as string[]), ...(row.assetId ? [row.assetId] : [])])]) } });
    await tx.targetInstance.update({ where: { id: row.targetInstanceId }, data: { status: 'GENERATED', spriteKind: 'image', spriteAssetId: assetId } });
    await tx.gameScene.update({ where: { id: p.scene.id }, data: { generationStatus: 'NEEDS_REGENERATION', configJson: null } });
    await tx.generationJob.update({ where: { id: job.id }, data: { status: 'QUEUED', currentStep: 'local-patch', lastError: null } });
    const after = await PrismaWorldBudgetStore.forReadOnlyTransaction(tx).read(worldId);
    demand(same(after?.snapshot, stored.snapshot), 'free turn changed a bill or full reserve');
    const siblingsAfter = await tx.targetVariantAsset.findMany({ where: { id: { in: protectedRows.map(r => r.id) } } });
    demand(siblingsAfter.length === 26 && protectedRows.every(r => siblingsAfter.some(s => s.id === r.id && hash(s) === r.sha256)), 'another original row changed');
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
}

/** Composition provenance only, called before a question and again by the
 * publisher. The ordinary settled MEDIUM answer still decides all quality. */
export async function retainedWindowEvidenceMatches(db: Db, input: { gameId: string; sceneVersion: number; hideId: string;
  variantId?: string; assetId?: string; judgeJson: string | null; identitySha256?: string }, readArt: ReadArt = readShippedBoardArt,
  observeRefusal?: (stage: string) => void) {
  let phase = 'marker';
  const refuse = () => { observeRefusal?.(phase); return false; };
  try {
    const j = JSON.parse(input.judgeJson ?? 'null'), m = retainedWindowMarkerSchema.parse(j?.retainedWindow), { auditId, ...body } = m;
    if (input.sceneVersion !== 13 || input.gameId !== m.gameId || input.hideId !== m.hideId || input.variantId !== m.rowId
      || auditId !== retainedWindowAuditId(body) || j.compositionVersion !== RETAINED_WINDOW_VERSION) return refuse();
    phase = 'audit';
    const audit = await db.auditLog.findUnique({ where: { id: auditId } }), saved = JSON.parse(audit?.metaJson ?? 'null');
    const once = await db.auditLog.findUnique({ where: { id: rowAuditId(m.gameId, m.rowId) } });
    if (!audit || audit.actorType !== 'SYSTEM' || audit.actorId !== null || audit.action !== RETAINED_WINDOW_ACTION || audit.entityType !== 'Game'
      || audit.entityId !== m.gameId || !same(saved?.marker, m) || saved.providerCalls !== 0 || saved.approvalTransferred !== false
      || hash(saved.previousRow) !== m.previousRowSha256 || hash(saved.originalRequests) !== m.originalRequestsSha256
      || hash(saved.protectedRows) !== m.protectedRowsSha256 || once?.actorType !== 'SYSTEM' || once.actorId !== null
      || once.action !== RETAINED_WINDOW_ACTION + ':once' || once.entityType !== 'Game' || once.entityId !== m.gameId
      || !same(JSON.parse(once.metaJson ?? 'null'), { auditId })) return refuse();
    phase = 'live-world';
    const c = { db, storage: new DbStorage(db) } as unknown as Container, p = await context(c, m.gameId, m.rowId, true);
    if (!p || hash(p.authority) !== m.authoritySha256 || RETAINED_WINDOW_MANIFEST_SHA256 !== m.manifestSha256
      || hash(p.parent) !== m.parentSha256 || p.identitySha256 !== m.identitySha256 || input.identitySha256 !== undefined && input.identitySha256 !== m.identitySha256
      || p.row.attempts !== m.attempts || p.row.costCents !== saved.previousRow.costCents || !same(JSON.parse(p.row.judgeJson ?? 'null'), j)
      || j.hide !== m.hideId || j.pose !== p.hide.pose || j.headPolicyVersion !== TARGET_HEAD_VISIBLE_VERSION || !same(j.authoredReturn, p.parent)
      || !same(j.authoredRecovery, JSON.parse(saved.previousRow.judgeJson).authoredRecovery)
      || !same(j.selfRepair, JSON.parse(saved.previousRow.judgeJson).selfRepair) || !['GENERATED', 'FAILED'].includes(p.row.status)) return refuse();
    phase = 'ledger';
    const ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(db).read(m.gameId + ':board-wizard');
    if (!ledger || !Array.isArray(saved.originalRequests) || saved.originalRequests.length < 2
      || !saved.originalRequests.every((old: { requestKey: string; sha256: string }) => ledger.snapshot.requests.some(r => r.requestKey === old.requestKey && hash(r) === old.sha256))) return refuse();
    phase = 'paid-raw';
    const paid = await readSettledTargetRaw(db, m.gameId, m.sourceRequestKey);
    if (!same(paid.wire.authoredReturn, p.parent) || paid.kept.operationFingerprint !== m.sourceFingerprint
      || paid.kept.payloadSha256 !== m.sourcePayloadSha256 || sha(paid.normalized) !== m.normalizedRawSha256) return refuse();
    phase = 'composition';
    const before = await readArt(p.board.art, p.authority.source.sha256), made = await compose(p.authority, before, paid.normalized);
    if (sha(before) !== m.sourcePngSha256 || sha(made.png) !== m.candidateSha256 || !same(made.proof, saved.compositionProof)
      || made.proof.registration.sampleX !== m.sampleX || made.proof.registration.sampleY !== m.sampleY) return refuse();
    phase = 'geometry';
    const measured = await localPatchGeometry({ contentVersion: 13, hide: p.hide, boardPng: before, patchPng: made.png,
      board: p.authority.source, retainedWindow: p.authority });
    if (localPatchPublicationGeometryHash(geometryOf(measured)) !== m.geometrySha256 || localPatchPublicationGeometryHash(p.row) !== m.geometrySha256
      || j.geometrySha256 !== m.geometrySha256 || j.judgedSha256 !== m.candidateSha256 || j.geometryBasis !== measured.basis
      || j.measuredFraction !== Number(measured.measuredFraction.toFixed(4))) return refuse();
    phase = 'asset';
    const assetId = assetIdOf(m.gameId, m.hideId, m.candidateSha256), asset = await db.asset.findUnique({ where: { id: assetId } });
    return !!asset && asset.id === input.assetId && p.row.assetId === asset.id && saved.assetId === asset.id && asset.ownerId === p.game.ownerId
      && asset.storagePath === `game/${assetId}.png` && asset.type === 'TARGET_SPRITE' && asset.visibility === 'GAME' && asset.status === 'READY'
      && asset.width === 512 && asset.height === 768 && asset.mimeType === 'image/png' && asset.bytes === made.png.length
      && !asset.deletedAt && asset.provider === 'local-patch' && asset.providerRequestId === m.gameId && sha(await c.storage.get(asset.storagePath)) === m.candidateSha256;
  } catch { return refuse(); }
}
