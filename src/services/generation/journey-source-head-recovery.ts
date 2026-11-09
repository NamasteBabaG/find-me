import { Prisma } from '@prisma/client';
import { z } from 'zod';
import sharp from 'sharp';
import type { Container } from '../container';
import { env } from '../../lib/env';
import { DbStorage } from '../../infra/storage/db';
import { PrismaWorldBudgetStore } from '../../infra/db/prisma-world-budget-store';
import { PrismaRetainedPurchaseStore } from '../../infra/db/prisma-retained-purchase-store';
import { JOURNEY_SOURCE_HEAD_AUTHORITIES } from '../../../content/detectives/journey-source-head-v2';
import { JOURNEY_SOURCE_HEAD_VERSION, JOURNEY_SOURCE_HEAD_ACTION, JOURNEY_HEAD_REVIEW_COVERAGE_MICRO_USD,
  journeyHeadHash as hash, journeyHeadBytesHash as sha, journeyHeadAlpha, journeyHeadAuthorityFor,
  journeyHeadMarker, journeyHeadMarkerSchema, composeJourneySourceHead, JOURNEY_HEAD_FRAME_REPLAY_ACTION,
  type JourneyHeadAuthority, type JourneyHeadMarker } from '../../domain/generation/journey-source-head';
import { normalizeJourneyHeadProviderPng } from './journey-head-provider-frame';
import { maskForHide } from '../../domain/scene/local-patch-hides';
import { TARGET_HEAD_VISIBLE_VERSION } from '../../domain/generation/target-head-return';
import { composeBoundedLocalPatch } from './local-patch-seam';
import { AUTHORED_PATCH_COMPOSITION_VERSION } from '../../domain/scene/local-patch-return-region';
import { LOCAL_PATCH_RESERVE } from './local-patch-render';
import { singleMediumReviewPolicyOf } from './single-medium-policy';
import { identityApprovedForDisplay } from './board-wizard-identity-gate';
import { resolveLocalPatchBoardsForGame } from './source-placement-release';
import { expectedAuthoredLocalPatchReturn } from './local-patch-authored-return';
import { boardWizardBudgetOf } from './board-conditioned-wizard';
import { fenceLocalPatchImages } from './local-patch-lifecycle';
import { readSettledTargetRaw } from './single-review-head-evidence';
import { readShippedBoardArt, type LocalPatchHideDeps } from './local-patch-hide';
import { localPatchGeometry } from './local-patch-geometry';
import { localPatchPublicationGeometryHash, hasLocalPatchPublicationPolicy } from './local-patch-publication-policy';

type Db = Prisma.TransactionClient;
type ReadArt = NonNullable<LocalPatchHideDeps['readBoardArt']>;
type Row = { id: string; status: string; attempts: number; judgeJson: string | null; assetId: string | null; [key: string]: unknown };
const id = z.string().regex(/^[A-Za-z0-9_:.-]{1,240}$/), digest = z.string().regex(/^[a-f0-9]{64}$/);
const requestHash = z.object({ requestKey: id, sha256: digest }).strict();
const pinBody = z.object({ version: z.literal(JOURNEY_SOURCE_HEAD_VERSION), gameId: id, worldId: id, ownerId: id,
  rowId: id, hideId: id, authoritySha256: digest, identityAssetId: id, identitySha256: digest, mediumAuthorizationSha256: digest,
  originalPhotoAssetId: id, originalPhotoSha256: digest, photoCropSha256: digest,
  capMicroUsd: z.literal(4_000_000), originalAttempts: z.literal(1), authorizedAttempt: z.literal(2), requestKey: id,
  previousJudgeJson: z.string().max(250_000), previousJudgeSha256: digest, previousRowSha256: digest, rowInvariantSha256: digest,
  previousAssetId: id, protectedRows: z.array(z.object({ id, sha256: digest }).strict()).length(26),
  originalRequests: z.array(requestHash).min(1), createdAt: z.string().datetime() }).strict();
const pinSchema = pinBody.extend({ authorizationSha256: digest }).strict();
export type JourneyHeadPin = z.infer<typeof pinSchema>;
const check = (ok: unknown, why: string): void => { if (!ok) throw Error('JOURNEY_HEAD: ' + why); };
const keyOf = (gameId: string, hideId: string) => 'aud_journey_head_' + hash([gameId, hideId]).slice(0, 40);
const rowKeys = ['id', 'targetInstanceId', 'variant', 'status', 'attempts', 'assetId', 'rectJson', 'hitRectJson', 'headAnchorJson',
  'judgeJson', 'promptVersion', 'provider', 'model', 'costCents', 'rejectedAssetIdsJson', 'lastError'];
const rowHash = (row: Row) => hash(rowKeys.map(k => [k, row[k] ?? null]));
const invariant = (row: Row) => hash(rowKeys.filter(k => !['status', 'attempts', 'judgeJson', 'lastError'].includes(k)).map(k => [k, row[k] ?? null]));
const scoped = (db: Db) => ({ db, storage: new DbStorage(db) } as unknown as Container);

export function journeyHeadMarkerFor(p: JourneyHeadPin): JourneyHeadMarker {
  return journeyHeadMarkerSchema.parse({ version: JOURNEY_SOURCE_HEAD_VERSION, authorizationSha256: p.authorizationSha256,
    authoritySha256: p.authoritySha256, rowId: p.rowId, hideId: p.hideId, originalAttempts: 1, authorizedAttempt: 2,
    previousJudgeSha256: p.previousJudgeSha256, requestKey: p.requestKey });
}
export function journeyHeadCandidate(p: JourneyHeadPin, row: Row) {
  return row.id === p.rowId && (row.status === 'FAILED' && row.attempts === 1 && rowHash(row) === p.previousRowSha256
    || row.status === 'PENDING' && row.attempts === 2 && hash(journeyHeadMarker(row)) === hash(journeyHeadMarkerFor(p))
      && invariant(row) === p.rowInvariantSha256);
}
/** Absent pins are a cheap no-op for every historical world. There are only the
 * two named public SOURCE strategies, never an unbounded extra attempt list. */
export async function journeyHeadPinsOf(db: Db, gameId: string): Promise<JourneyHeadPin[]> {
  const records = await db.auditLog.findMany({ where: { id: { in: JOURNEY_SOURCE_HEAD_AUTHORITIES.map(a => keyOf(gameId, a.hideId)) } } });
  const result: JourneyHeadPin[] = [];
  for (const record of records) {
    const p = pinSchema.parse(JSON.parse(record.metaJson ?? 'null')), { authorizationSha256, ...body } = p;
    check(record.actorType === 'SYSTEM' && record.actorId === null && record.action === JOURNEY_SOURCE_HEAD_ACTION
      && record.entityType === 'Game' && record.entityId === gameId && p.gameId === gameId && p.worldId === gameId + ':board-wizard'
      && record.id === keyOf(gameId, p.hideId) && hash(body) === authorizationSha256, 'finite head authority changed');
    const a = JOURNEY_SOURCE_HEAD_AUTHORITIES.find(a => a.hideId === p.hideId);
    check(a && hash(a) === p.authoritySha256 && p.requestKey === a.hideId + ':' + a.pose + ':render:2'
      && sha(Buffer.from(p.previousJudgeJson)) === p.previousJudgeSha256, 'public recipe or original evidence changed');
    const policy = await singleMediumReviewPolicyOf(db, gameId), ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(db).read(p.worldId);
    check(policy?.authorizationSha256 === p.mediumAuthorizationSha256 && policy.identitySha256 === p.identitySha256
      && ledger && p.originalRequests.every(old => ledger.snapshot.requests.some(r => r.requestKey === old.requestKey && hash(r) === old.sha256)),
    'original MEDIUM birth authority, bills or full reserves changed');
    result.push(p);
  }
  return result;
}

async function context(c: Container, gameId: string, hideId: string, painting: boolean) {
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, orders: true, scenes: true } }), child = game?.childProfile;
  if (!game || game.deletedAt || !game.paidAt || !child || child.deletedAt || child.ownerId !== game.ownerId || child.ageYears !== 7
    || !child.identityAssetId || game.styleVersion !== 'local-patch-world-v1'
    || !(game.status === 'TARGETS_GENERATING' || !painting && ['READY', 'DELIVERED'].includes(game.status))
    || painting && (game.readyAt || game.configJson || !child.originalPhotoAssetId)
    || game.scenes.length !== 9 || game.scenes.some(s => s.sceneVersion !== 13)
    || game.orders.some(o => o.refundedAt || o.paymentStatus === 'REFUNDED')
    || !game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === 'PAID' && o.paidAt)) return null;
  const policy = await singleMediumReviewPolicyOf(c.db, gameId);
  const identity = await c.db.asset.findUnique({ where: { id: child.identityAssetId } });
  if (!policy || policy.sceneVersion !== 13 || !identity || identity.visibility !== 'PRIVATE' || identity.type !== 'IDENTITY_SHEET'
    || identity.status !== 'READY' || identity.deletedAt || identity.ownerId !== game.ownerId
    || sha(await c.storage.get(identity.storagePath)) !== policy.identitySha256) return null;
  if (!await identityApprovedForDisplay(c, child, 13)) return null;
  let photoSha256:string|null=null;
  if (child.originalPhotoAssetId) {
    const photo = await c.db.asset.findUnique({ where: { id: child.originalPhotoAssetId! } });
    if (!photo || photo.ownerId !== game.ownerId || photo.visibility !== 'PRIVATE' || photo.type !== 'ORIGINAL_PHOTO'
      || photo.status !== 'READY' || photo.deletedAt) return null;
    photoSha256=sha(await c.storage.get(photo.storagePath));
  }
  let photoCropSha256:string;try{photoCropSha256=hash(child.photoCropJson?JSON.parse(child.photoCropJson):null);}catch{return null;}
  const placement = await resolveLocalPatchBoardsForGame(c.db, gameId, 13), board = placement.boards.find(b => b.hides.some(h => h.id === hideId));
  const hide = board?.hides.find(h => h.id === hideId), parent = board && hide ? expectedAuthoredLocalPatchReturn(board, hide, 13, placement) : null;
  const authority = parent && journeyHeadAuthorityFor(parent);
  if (!board || !hide || !parent || !authority || hide.pose !== authority.pose) return null;
  const budget = await boardWizardBudgetOf(c).audit(gameId + ':board-wizard');
  if (budget.capMicroUsd !== 4_000_000 || budget.overCapMicroUsd || budget.conflictRequestKeys.length || budget.overrunRequestKeys.length) return null;
  return { game, child, policy, identity, board, hide, parent, authority, budget, photoSha256, photoCropSha256 };
}

/** A free, finite recipe enrollment, not a painting or an art approval. The two
 * heads are handled before optional window reviews while full bounds still fit. */
export async function resumeJourneySourceHead(c: Container, gameId: string, hideId: string, observeRefusal?: (why: string) => void) {
  const refuse = (why: string) => { observeRefusal?.(why); return false; };
  if (env().APP_ENV !== 'qa' || c.storage.id !== 'db' || !JOURNEY_SOURCE_HEAD_AUTHORITIES.some(a => a.hideId === hideId)) return refuse('qa-scope');
  return c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, gameId);
    const cc = { ...c, db: tx, storage: new DbStorage(tx) } as unknown as Container;
    const job = await tx.generationJob.findUnique({ where: { id: 'job_' + gameId } });
    if (!job || !['QUEUED', 'FAILED'].includes(job.status) || await tx.auditLog.findUnique({ where: { id: keyOf(gameId, hideId) } })) return refuse('job-or-existing-pin');
    const p = await context(cc, gameId, hideId, true);
    if (!p || p.budget.held || p.budget.remainingMicroUsd < LOCAL_PATCH_RESERVE.renderMicroUsd + JOURNEY_HEAD_REVIEW_COVERAGE_MICRO_USD) return refuse('payment-identity-or-full-capacity');
    const all = await tx.targetVariantAsset.findMany({ where: { variant: 'A', targetInstance: { gameScene: { gameId } } },
      include: { targetInstance: { include: { gameScene: true } } } });
    const row = all.find(r => r.targetInstance.gameScene.sceneSlug === p.board.board && r.targetInstance.targetId === p.hide.targetId);
    if (all.length !== 27 || !row || row.provider !== 'local-patch' || row.status !== 'FAILED' || row.attempts !== 1 || !row.assetId) return refuse('original27-or-first-failed-row');
    const previous = JSON.parse(row.judgeJson ?? 'null');
    if (previous?.hide !== hideId || previous.pose !== p.hide.pose || previous.reviewState !== 'board-review-complete'
      || previous.journeyHeadRecovery !== undefined || previous.retainedWindow !== undefined || hash(previous.authoredReturn) !== hash(p.parent)) return refuse('unfinished-original-evidence');
    const existing = await journeyHeadPinsOf(tx, gameId);
    for (const old of existing) {
      const sibling = all.find(r => r.id === old.rowId), asset = sibling?.assetId ? await tx.asset.findUnique({ where: { id: sibling.assetId } }) : null;
      if (!sibling || !asset || sibling.status !== 'GENERATED' || !await hasLocalPatchPublicationPolicy(cc, { gameId, sceneVersion: 13,
        hideId: old.hideId, variantId: sibling.id, attempts: sibling.attempts, identityAssetId: p.identity.id, identitySha256: p.policy.identitySha256,
        assetId: asset.id, imageSha256: sha(await cc.storage.get(asset.storagePath)), geometrySha256: localPatchPublicationGeometryHash(sibling), judgeJson: sibling.judgeJson }))
        return refuse('previous-head-awaits-ordinary-pass');
    }
    const ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(tx).read(gameId + ':board-wizard');
    if (!ledger || ledger.snapshot.requests.some(r => r.state === 'pending')) return refuse('pending-purchase');
    await readSettledTargetRaw(tx, gameId, hideId + ':' + p.hide.pose + ':render:1');
    const requestKey = hideId + ':' + p.hide.pose + ':render:2';
    if (ledger.snapshot.requests.some(r => r.requestKey === requestKey) || await new PrismaRetainedPurchaseStore(tx).get(gameId + ':board-wizard', requestKey)) return refuse('second-purchase-exists');
    const body = pinBody.parse({ version: JOURNEY_SOURCE_HEAD_VERSION, gameId, worldId: gameId + ':board-wizard', ownerId: p.game.ownerId,
      rowId: row.id, hideId, authoritySha256: hash(p.authority), identityAssetId: p.identity.id, identitySha256: p.policy.identitySha256,
      mediumAuthorizationSha256: p.policy.authorizationSha256, originalPhotoAssetId:p.child.originalPhotoAssetId, originalPhotoSha256:p.photoSha256, photoCropSha256:p.photoCropSha256, capMicroUsd: 4_000_000, originalAttempts: 1, authorizedAttempt: 2, requestKey,
      previousJudgeJson: row.judgeJson, previousJudgeSha256: sha(Buffer.from(row.judgeJson!)), previousRowSha256: rowHash(row), rowInvariantSha256: invariant(row), previousAssetId: row.assetId,
      protectedRows: all.filter(r => r.id !== row.id).map(r => ({ id: r.id, sha256: rowHash(r) })),
      originalRequests: ledger.snapshot.requests.map(r => ({ requestKey: r.requestKey, sha256: hash(r) })), createdAt: new Date().toISOString() });
    const pin = pinSchema.parse({ ...body, authorizationSha256: hash(body) });
    const revision = await tx.worldBudgetLedger.updateMany({ where: { worldId: pin.worldId, revision: ledger.revision }, data: { revision: { increment: 1 } } });
    check(revision.count === 1, 'concurrent finite head enrollment');
    await tx.auditLog.create({ data: { id: keyOf(gameId, hideId), actorType: 'SYSTEM', action: JOURNEY_SOURCE_HEAD_ACTION, entityType: 'Game', entityId: gameId, metaJson: JSON.stringify(pin) } });
    await tx.generationJob.update({ where: { id: job.id }, data: { status: 'QUEUED', currentStep: 'local-patch', lastError: null } });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
}

export async function requireJourneyHeadPurchase(c: Container, gameId: string, rowId: string) {
  const pin = (await journeyHeadPinsOf(c.db, gameId)).find(p => p.rowId === rowId), row = await c.db.targetVariantAsset.findUnique({ where: { id: rowId } });
  check(pin && row && journeyHeadCandidate(pin, row), 'no current finite SOURCE-head purchase');
  const p = await context(c, gameId, pin!.hideId, true);
  check(p && hash(p.authority) === pin!.authoritySha256 && p.policy.identitySha256 === pin!.identitySha256
    && p.child.originalPhotoAssetId===pin!.originalPhotoAssetId&&p.photoSha256===pin!.originalPhotoSha256&&p.photoCropSha256===pin!.photoCropSha256, 'current payment, identity, photo, crop or public SOURCE changed');
  const existing = await boardWizardBudgetOf(c).readRequest(pin!.worldId, pin!.requestKey);
  if (!existing) check(!p!.budget.held && p!.budget.remainingMicroUsd >= LOCAL_PATCH_RESERVE.renderMicroUsd + JOURNEY_HEAD_REVIEW_COVERAGE_MICRO_USD,
    'image and full bounded ordinary MEDIUM coverage do not fit');
  return { pin: pin!, marker: journeyHeadMarkerFor(pin!), authority: p!.authority };
}

/** Free recovery of the one settled head that stopped at the old provider-size
 * guard. It never re-enters painting or increments an attempt or cost. */
export async function restoreJourneyHeadProviderFrame(c: Container, gameId: string, hideId: string,
  readArt: ReadArt = readShippedBoardArt, observeRefusal?: (why: string) => void) {
  const refuse = (why: string) => { observeRefusal?.(why); return false; };
  if (env().APP_ENV !== 'qa' || c.storage.id !== 'db') return refuse('qa-only');
  return c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, gameId);
    const cc = { ...c, db: tx, storage: new DbStorage(tx) } as unknown as Container;
    const p = await context(cc, gameId, hideId, false), pin = (await journeyHeadPinsOf(tx, gameId)).find(x => x.hideId === hideId);
    const job = await tx.generationJob.findUnique({ where: { id: 'job_' + gameId } });
    const auditId = 'aud_journey_frame_' + hash([gameId, hideId]).slice(0, 40);
    if (!p || !pin || !job || !['QUEUED', 'FAILED'].includes(job.status) || p.game.readyAt || p.game.configJson
      || p.child.originalPhotoAssetId !== pin.originalPhotoAssetId || p.photoSha256 !== pin.originalPhotoSha256
      || p.photoCropSha256 !== pin.photoCropSha256 || await tx.auditLog.findUnique({ where: { id: auditId } })) return refuse('current-pin-or-once');
    const row = await tx.targetVariantAsset.findUnique({ where: { id: pin.rowId } });
    const old = JSON.parse(row?.judgeJson ?? 'null');
    if (!row || row.status !== 'FAILED' || row.attempts !== 2 || old?.renderFault !== 'JOURNEY_HEAD: paid RAW is not native512x768'
      || hash(journeyHeadMarker(row)) !== hash(journeyHeadMarkerFor(pin)) || old.boardReview !== undefined) return refuse('not-unreviewed-size-refusal');
    const ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(tx).read(pin.worldId);
    if (!ledger || ledger.snapshot.requests.some(x => x.state === 'pending')) return refuse('pending-purchase');
    const siblings = await tx.targetVariantAsset.findMany({ where: { id: { in: pin.protectedRows.map(x => x.id) } } });
    if (siblings.length !== 26 || !pin.protectedRows.every(x => siblings.some(r => r.id === x.id && rowHash(r) === x.sha256))) return refuse('sibling-drift');
    const paid = await readSettledTargetRaw(tx, gameId, pin.requestKey), decoded = await normalizeJourneyHeadProviderPng(paid.original);
    if (!decoded.frame.resized || decoded.frame.width !== 768 || decoded.frame.height !== 1152
      || hash(paid.wire.journeyHeadRecovery) !== hash(journeyHeadMarkerFor(pin)) || hash(paid.wire.authoredReturn) !== hash(p.parent)) return refuse('exact-paid-frame');
    const before = await readArt(p.authority.source.art, p.authority.source.sha256), made = await applyJourneyHeadPixels(before, paid.normalized, p.authority);
    const bounded = await composeBoundedLocalPatch(before, p.authority.crop, made.png, maskForHide(p.hide),
      { requireAligned: true, playerReview: true, returnRect: p.hide.returnRect });
    if (!bounded.usable) return refuse('reproduced-join-refused');
    const shipping = await sharp(bounded.candidate).extract(p.authority.crop).png().toBuffer();
    check(sha(shipping) === sha(made.png), 'free normalized replay changed native head composition');
    const measured = await localPatchGeometry({ contentVersion: 13, boardPng: before, patchPng: shipping,
      board: p.authority.source, hide: p.hide, journeyHead: p.authority });
    const geometry = { rectJson: JSON.stringify(measured.geometry.rect), hitRectJson: JSON.stringify(measured.geometry.hitRect), headAnchorJson: JSON.stringify(measured.geometry.anchor) };
    const candidateSha256 = sha(shipping), assetId = 'ast_jnh_frame_' + hash([gameId, hideId, candidateSha256]).slice(0, 24);
    const storagePath = 'game/' + assetId + '.png';
    const receipt = { ...old, verdict: null, renderFault: null, wireFault: null, seam: bounded.report,
      compositionVersion: AUTHORED_PATCH_COMPOSITION_VERSION, compositionPermission: bounded.compositionPermission,
      journeyHeadComposition: made.proof, journeyHeadFrame: decoded.frame, judgedSha256: candidateSha256,
      geometrySha256: localPatchPublicationGeometryHash(geometry), geometryBasis: measured.basis,
      measuredFraction: Number(measured.measuredFraction.toFixed(4)), headPolicyVersion: TARGET_HEAD_VISIBLE_VERSION, reviewState: 'pending-board-review' };
    const retired = JSON.parse(row.rejectedAssetIdsJson ?? '[]');
    check(Array.isArray(retired) && retired.every(x => typeof x === 'string'), 'rejected inventory changed');
    const revision = await tx.worldBudgetLedger.updateMany({ where: { worldId: pin.worldId, revision: ledger.revision }, data: { revision: { increment: 1 } } });
    check(revision.count === 1, 'concurrent paid-frame replay');
    await tx.auditLog.create({ data: { id: auditId, actorType: 'SYSTEM', action: JOURNEY_HEAD_FRAME_REPLAY_ACTION,
      entityType: 'Game', entityId: gameId, metaJson: JSON.stringify({ version: decoded.frame.version, pinSha256: pin.authorizationSha256,
        rowId: row.id, hideId, assetId, candidateSha256, frame: decoded.frame, previousRow: row, previousRowSha256: hash(row),
        originalRequests: ledger.snapshot.requests.map(r => ({ requestKey: r.requestKey, sha256: hash(r) })), providerCalls: 0, approvalTransferred: false }) } });
    await tx.asset.create({ data: { id: assetId, ownerId: p.game.ownerId, type: 'TARGET_SPRITE', visibility: 'GAME', status: 'READY',
      storagePath, mimeType: 'image/png', width: 512, height: 768, bytes: shipping.length, costCents: 0, provider: 'local-patch', providerRequestId: gameId } });
    await new DbStorage(tx).put(storagePath, shipping, 'image/png');
    await tx.targetVariantAsset.update({ where: { id: row.id }, data: { status: 'GENERATED', assetId, ...geometry, lastError: null,
      judgeJson: JSON.stringify(receipt), rejectedAssetIdsJson: JSON.stringify([...new Set([...retired, ...(row.assetId ? [row.assetId] : [])])]) } });
    await tx.targetInstance.update({ where: { id: row.targetInstanceId }, data: { status: 'GENERATED', spriteKind: 'image', spriteAssetId: assetId } });
    await tx.gameScene.update({ where: { id: p.game.scenes.find(s => s.sceneSlug === p.board.board)!.id }, data: { generationStatus: 'NEEDS_REGENERATION', configJson: null } });
    await tx.generationJob.update({ where: { id: job.id }, data: { status: 'QUEUED', currentStep: 'local-patch', lastError: null } });
    const after = await PrismaWorldBudgetStore.forReadOnlyTransaction(tx).read(pin.worldId);
    check(hash(after?.snapshot) === hash(ledger.snapshot), 'free frame replay changed a bill');
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
}
export async function fenceJourneyHeadPurchase(db: Db, gameId: string, rowId: string, marker: JourneyHeadMarker) {
  const pin = (await journeyHeadPinsOf(db, gameId)).find(p => p.rowId === rowId), row = await db.targetVariantAsset.findUnique({ where: { id: rowId } });
  check(pin && row && hash(marker) === hash(journeyHeadMarkerFor(pin)) && journeyHeadCandidate(pin, row), 'finite painting checkpoint changed');
  const siblings = await db.targetVariantAsset.findMany({ where: { id: { in: pin!.protectedRows.map(r => r.id) } } });
  check(siblings.length === 26 && pin!.protectedRows.every(r => siblings.some(s => s.id === r.id && rowHash(s) === r.sha256)), 'another original row changed during the painting');
}

export async function journeyHeadMaskPng(a: JourneyHeadAuthority) {
  const alpha = journeyHeadAlpha(a), pixels = Buffer.alloc(512 * 768 * 4, 255);
  for (let i = 0; i < alpha.length; i++) pixels[i * 4 + 3] = 255 - alpha[i]!;
  return sharp(pixels, { raw: { width: 512, height: 768, channels: 4 } }).png().toBuffer();
}
export async function applyJourneyHeadPixels(before: Buffer, raw: Buffer, a: JourneyHeadAuthority) {
  check(sha(before) === a.sourcePngSha256, 'SOURCE PNG differs');
  const source = await sharp(before).extract(a.crop).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const paid = await sharp(raw).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const made = composeJourneySourceHead(a, { data: source.data, width: source.info.width, height: source.info.height, channels: source.info.channels },
    { data: paid.data, width: paid.info.width, height: paid.info.height, channels: paid.info.channels });
  return { png: await sharp(Buffer.from(made.pixels), { raw: { width: 512, height: 768, channels: 4 } }).png().toBuffer(), proof: made.proof };
}
export async function journeyHeadPublicationAuthorized(db: Db, input: { gameId: string; variantId: string; hideId: string; attempts: number; sceneVersion: number; judgeJson: string | null }) {
  try {
    const pin = (await journeyHeadPinsOf(db, input.gameId)).find(p => p.rowId === input.variantId), marker = journeyHeadMarker(input);
    return !!pin && input.sceneVersion === 13 && input.hideId === pin.hideId && input.attempts === 2 && hash(marker) === hash(journeyHeadMarkerFor(pin));
  } catch { return false; }
}
export async function journeyHeadCompositionMatches(db: Db, input: { gameId: string; hideId: string; receipt: Record<string, any>; beforePng?: Buffer; variantId?:string; assetId?:string; identitySha256?:string }, readArt: ReadArt = readShippedBoardArt) {
  try {
    const pin = (await journeyHeadPinsOf(db, input.gameId)).find(p => p.hideId === input.hideId), marker = journeyHeadMarker({ judgeJson: JSON.stringify(input.receipt) });
    if (!pin || hash(marker) !== hash(journeyHeadMarkerFor(pin))) return false;
    const p = await context(scoped(db), input.gameId, input.hideId, false), row = await db.targetVariantAsset.findUnique({ where: { id: pin.rowId } });
    if (!p || !row || row.attempts !== 2 || row.status !== 'GENERATED'
      ||input.variantId!==undefined&&input.variantId!==pin.rowId||input.assetId!==undefined&&input.assetId!==row.assetId
      ||input.identitySha256!==undefined&&input.identitySha256!==pin.identitySha256
      ||p.photoCropSha256!==pin.photoCropSha256||p.child.originalPhotoAssetId!==null&&p.child.originalPhotoAssetId!==pin.originalPhotoAssetId
      ||p.photoSha256!==null&&p.photoSha256!==pin.originalPhotoSha256||hash(JSON.parse(row.judgeJson ?? 'null')) !== hash(input.receipt)
      || hash(input.receipt.authoredReturn) !== hash(p.parent) || input.receipt.authoredRecovery !== undefined) return false;
    const paid = await readSettledTargetRaw(db, input.gameId, pin.requestKey);
    if (hash(paid.wire.authoredReturn) !== hash(p.parent) || hash(paid.wire.journeyHeadRecovery) !== hash(marker)) return false;
    if (row.assetId?.startsWith('ast_jnh_frame_')) {
      const frame = (await normalizeJourneyHeadProviderPng(paid.original)).frame;
      const record = await db.auditLog.findUnique({ where: { id: 'aud_journey_frame_' + hash([input.gameId, input.hideId]).slice(0, 40) } });
      const saved = JSON.parse(record?.metaJson ?? 'null');
      if (!record || record.actorType !== 'SYSTEM' || record.actorId !== null || record.action !== JOURNEY_HEAD_FRAME_REPLAY_ACTION
        || record.entityType !== 'Game' || record.entityId !== input.gameId || saved?.pinSha256 !== pin.authorizationSha256
        || saved.rowId !== row.id || saved.assetId !== row.assetId || saved.candidateSha256 !== input.receipt.judgedSha256
        || saved.providerCalls !== 0 || saved.approvalTransferred !== false || hash(saved.frame) !== hash(frame)
        || hash(input.receipt.journeyHeadFrame) !== hash(frame) || hash(saved.previousRow) !== saved.previousRowSha256) return false;
      const ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(db).read(pin.worldId);
      if (!ledger || !Array.isArray(saved.originalRequests) || !saved.originalRequests.every((old: { requestKey: string; sha256: string }) =>
        ledger.snapshot.requests.some(r => r.requestKey === old.requestKey && hash(r) === old.sha256))) return false;
    }
    const before = input.beforePng ?? await readArt(p.authority.source.art, p.authority.source.sha256), made = await applyJourneyHeadPixels(before, paid.normalized, p.authority);
    const measured = await localPatchGeometry({ contentVersion: 13, boardPng: before, patchPng: made.png, board: p.authority.source, hide: p.hide, journeyHead: p.authority });
    const geometry = { rectJson: JSON.stringify(measured.geometry.rect), hitRectJson: JSON.stringify(measured.geometry.hitRect), headAnchorJson: JSON.stringify(measured.geometry.anchor) };
    const previous = JSON.parse(pin.previousJudgeJson), asset = row.assetId ? await db.asset.findUnique({ where: { id: row.assetId } }) : null;
    return !!asset && asset.id.startsWith('ast_jnh_') && asset.ownerId === p.game.ownerId && asset.visibility === 'GAME' && asset.status === 'READY'
      && asset.type === 'TARGET_SPRITE' && asset.provider === 'local-patch' && asset.providerRequestId === input.gameId && !asset.deletedAt
      && sha(made.png) === input.receipt.judgedSha256 && sha(await new DbStorage(db).get(asset.storagePath)) === input.receipt.judgedSha256
      && hash(made.proof) === hash(input.receipt.journeyHeadComposition)
      && localPatchPublicationGeometryHash(geometry) === input.receipt.geometrySha256 && localPatchPublicationGeometryHash(row) === input.receipt.geometrySha256
      && input.receipt.geometryBasis === measured.basis && input.receipt.measuredFraction === Number(measured.measuredFraction.toFixed(4))
      && hash(input.receipt.selfRepair) === hash(previous.selfRepair) && hash(input.receipt.guidedFrameRecovery) === hash(previous.guidedFrameRecovery);
  } catch { return false; }
}
