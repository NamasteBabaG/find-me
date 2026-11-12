import { Prisma } from '@prisma/client';
import { z } from 'zod';
import sharp from 'sharp';
import type { Container } from '../container';
import { env } from '../../lib/env';
import { DbStorage } from '../../infra/storage/db';
import { PrismaWorldBudgetStore } from '../../infra/db/prisma-world-budget-store';
import { PrismaRetainedPurchaseStore } from '../../infra/db/prisma-retained-purchase-store';
import { CasWorldBudgetRepository } from '../../infra/db/world-budget-repository';
import { fixedSourceFailureReceiptSchema } from '../../infra/generation/fixed-source-diagnostics';
import { JOURNEY_SOURCE_HEAD_AUTHORITIES } from '../../../content/detectives/journey-source-head-v2';
import { JOURNEY_SUNBURST_TAIL_AUTHORITIES } from '../../../content/detectives/journey-sunburst-tail-v1';
import { JOURNEY_SUNBURST_TAIL_VERSION, JOURNEY_SUNBURST_TAIL_ACTION, JOURNEY_SUNBURST_TAIL_HIDE_IDS,
  journeySunburstTailPinId, journeySunburstTailAuthorityFor, type JourneySunburstTailHideId } from '../../domain/generation/journey-sunburst-tail';
import { qaSunburstTailOperationOf } from '../../domain/generation/qa-sunburst-tail-completion';
import { qaSunburstTailCompletionActive } from './qa-sunburst-tail-completion';
import { JOURNEY_SOURCE_HEAD_VERSION, JOURNEY_SOURCE_HEAD_ACTION, JOURNEY_HEAD_REVIEW_COVERAGE_MICRO_USD,
  journeyHeadHash as hash, journeyHeadBytesHash as sha, journeyHeadAlpha, journeyHeadAuthorityFor,
  journeyHeadMarker, journeyHeadMarkerSchema, composeJourneySourceHead, JOURNEY_HEAD_FRAME_REPLAY_ACTION,
  JOURNEY_SUNBURST_HEAD_VERSION, JOURNEY_SUNBURST_HEAD_ACTION, JOURNEY_SUNBURST_HEAD_HIDE_ID, JOURNEY_SUNBURST_HEAD_PAINTER,
  journeyHeadPinId, journeySunburstHeadPinId, journeyWallReplacementId,
  JOURNEY_WALL_REPLACEMENT_HIDE, JOURNEY_WALL_REPLACEMENT_KEY, JOURNEY_WALL_REPLACEMENT_ACTION,
  journeyWallProviderRetryId, JOURNEY_WALL_PROVIDER_RETRY_ACTION, JOURNEY_WALL_PROVIDER_RETRY_KEY,
  type JourneyHeadAuthority, type JourneyHeadMarker } from '../../domain/generation/journey-source-head';
import { SUNBURST_IMAGE_RESERVE_MICRO_USD, SUNBURST_REVIEW_COVERAGE_MICRO_USD } from '../../domain/generation/sunburst-painter';
import { LOCAL_PATCH_SUNBURST_IMAGE_POLICY, localPatchRenderPolicySha256 } from '../../infra/generation/openai-local-patch';
import { QA_FIVE_COMPLETION_CAP } from '../../domain/generation/qa-five-dollar-completion';
import { qaFiveCompletionActive } from './qa-five-dollar-completion';
import { normalizeJourneyHeadProviderPng } from './journey-head-provider-frame';
import { maskForHide } from '../../domain/scene/local-patch-hides';
import { TARGET_HEAD_VISIBLE_VERSION } from '../../domain/generation/target-head-return';
import { localPatchReadyReviewOwed } from '../../domain/scene/local-patch-progress';
import { composeBoundedLocalPatch } from './local-patch-seam';
import { AUTHORED_PATCH_COMPOSITION_VERSION } from '../../domain/scene/local-patch-return-region';
import { LOCAL_PATCH_RESERVE, RETAINED_RENDER_VERSION } from './local-patch-render';
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
import { getMatchingUnknownContinuationApproval, WorldBudget, type WorldUnknownContinuationApproval } from './world-budget';

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
/** journey-source-head-sunburst/v1: the same finite second purchase, for Paris
 * only, bound to the active explicit five-dollar completion and the reviewed
 * Sunburst image policy. Never a game-wide painter pin. */
const SUNBURST_HEAD_POLICY_SHA256 = localPatchRenderPolicySha256(LOCAL_PATCH_SUNBURST_IMAGE_POLICY);
const sunburstPinBody = pinBody.extend({ version: z.literal(JOURNEY_SUNBURST_HEAD_VERSION), hideId: z.literal(JOURNEY_SUNBURST_HEAD_HIDE_ID),
  capMicroUsd: z.literal(QA_FIVE_COMPLETION_CAP), completionAuthorizationSha256: digest, painterRelease: z.literal(JOURNEY_SUNBURST_HEAD_PAINTER),
  imagePolicySha256: z.literal(SUNBURST_HEAD_POLICY_SHA256), imageReserveMicroUsd: z.literal(SUNBURST_IMAGE_RESERVE_MICRO_USD),
  reviewCoverageMicroUsd: z.literal(SUNBURST_REVIEW_COVERAGE_MICRO_USD) }).strict();
const sunburstPinSchema = sunburstPinBody.extend({ authorizationSha256: digest }).strict();
/** A distinct finite tail pin; released v2 and single-Paris/v1 records keep
 * their exact schemas and ids. No paid game's global painter is re-pinned. */
const sunburstTailPinBody = sunburstPinBody.extend({ version: z.literal(JOURNEY_SUNBURST_TAIL_VERSION),
  hideId: z.enum(JOURNEY_SUNBURST_TAIL_HIDE_IDS) }).strict();
const sunburstTailPinSchema = sunburstTailPinBody.extend({ authorizationSha256: digest }).strict();
const wallReplacementPlanSchema = sunburstTailPinBody.extend({
  version: z.literal(JOURNEY_WALL_REPLACEMENT_ACTION),
  hideId: z.literal(JOURNEY_WALL_REPLACEMENT_HIDE),
  requestKey: z.literal(JOURNEY_WALL_REPLACEMENT_KEY),
  originalAttempts: z.literal(2),
  authorizedAttempt: z.literal(3),
  priorHeadAuthorizationSha256: digest,
  rejectedPayloadSha256: digest,
  ledgerRevision: z.number().int().nonnegative(),
  jobSha256: digest,
  committedMicroUsd: z.number().int().nonnegative(),
}).omit({ createdAt: true }).strict();
const wallReplacementPinSchema = wallReplacementPlanSchema.extend({
  operatorId: id,
  ownerAuthorizationSha256: digest,
  planSha256: digest,
  createdAt: z.string().datetime(),
  authorizationSha256: digest,
}).strict();
const wallProviderRetryPlanSchema = wallReplacementPlanSchema.extend({
  version: z.literal(JOURNEY_WALL_PROVIDER_RETRY_ACTION),
  requestKey: z.literal(JOURNEY_WALL_PROVIDER_RETRY_KEY),
  originalAttempts: z.literal(3),
  authorizedAttempt: z.literal(4),
  pendingRowSha256: digest,
  failedOperationFingerprint: digest,
  unknownReasons: z.array(z.string().min(1)).min(1),
}).strict();
const wallProviderRetryPinSchema = wallProviderRetryPlanSchema.extend(wallReplacementPinSchema.pick({
  operatorId: true, ownerAuthorizationSha256: true, planSha256: true, createdAt: true, authorizationSha256: true,
}).shape).strict();
type JourneyWallReplacementPin = z.infer<typeof wallReplacementPinSchema>;
type JourneyWallProviderRetryPin = z.infer<typeof wallProviderRetryPinSchema>;
type WallSupplement = JourneyWallReplacementPin | JourneyWallProviderRetryPin;
export type JourneyHeadMediumPin = z.infer<typeof pinSchema>;
export type JourneySunburstHeadPin = z.infer<typeof sunburstPinSchema>;
export type JourneySunburstTailPin = z.infer<typeof sunburstTailPinSchema>;
export type JourneyHeadPin = JourneyHeadMediumPin | JourneySunburstHeadPin | JourneySunburstTailPin | WallSupplement;
export const isJourneySunburstTailPin = (p: JourneyHeadPin): p is JourneySunburstTailPin | WallSupplement =>
  p.version === JOURNEY_SUNBURST_TAIL_VERSION || p.version === JOURNEY_WALL_REPLACEMENT_ACTION || p.version === JOURNEY_WALL_PROVIDER_RETRY_ACTION;
export const isJourneySunburstHeadPin = (p: JourneyHeadPin): p is JourneySunburstHeadPin | JourneySunburstTailPin | WallSupplement =>
  p.version === JOURNEY_SUNBURST_HEAD_VERSION || isJourneySunburstTailPin(p);
/** Typed routing state for the one Sunburst head; null for every v2 head. */
export type JourneySunburstHeadState = { readonly painterRelease: typeof JOURNEY_SUNBURST_HEAD_PAINTER; readonly imagePolicySha256: string;
  readonly subjectQuality: 'high'; readonly imageReserveMicroUsd: number; readonly reviewCoverageMicroUsd: number;
  readonly completionAuthorizationSha256: string; readonly requestKey: string; readonly hideId: JourneySunburstTailHideId };
export function journeySunburstHeadState(p: JourneyHeadPin): JourneySunburstHeadState | null {
  return isJourneySunburstHeadPin(p) ? { painterRelease: p.painterRelease, imagePolicySha256: p.imagePolicySha256, subjectQuality: 'high',
    imageReserveMicroUsd: p.imageReserveMicroUsd, reviewCoverageMicroUsd: p.reviewCoverageMicroUsd,
    completionAuthorizationSha256: p.completionAuthorizationSha256, requestKey: p.requestKey, hideId: p.hideId } : null;
}
const check = (ok: unknown, why: string): void => { if (!ok) throw Error('JOURNEY_HEAD: ' + why); };
const keyOf = journeyHeadPinId;
const rowKeys = ['id', 'targetInstanceId', 'variant', 'status', 'attempts', 'assetId', 'rectJson', 'hitRectJson', 'headAnchorJson',
  'judgeJson', 'promptVersion', 'provider', 'model', 'costCents', 'rejectedAssetIdsJson', 'lastError'];
const rowHash = (row: Row) => hash(rowKeys.map(k => [k, row[k] ?? null]));
const invariant = (row: Row) => hash(rowKeys.filter(k => !['status', 'attempts', 'judgeJson', 'lastError'].includes(k)).map(k => [k, row[k] ?? null]));
const scoped = (db: Db) => ({ db, storage: new DbStorage(db) } as unknown as Container);

export function journeyHeadMarkerFor(p: JourneyHeadPin): JourneyHeadMarker {
  return journeyHeadMarkerSchema.parse({ version: isJourneySunburstTailPin(p) ? JOURNEY_SUNBURST_TAIL_VERSION : JOURNEY_SOURCE_HEAD_VERSION, authorizationSha256: p.authorizationSha256,
    authoritySha256: p.authoritySha256, rowId: p.rowId, hideId: p.hideId, originalAttempts: p.originalAttempts, authorizedAttempt: p.authorizedAttempt,
    previousJudgeSha256: p.previousJudgeSha256, requestKey: p.requestKey,
    ...(isJourneySunburstHeadPin(p) ? { painterRelease: p.painterRelease } : {}) });
}
export function journeyHeadCandidate(p: JourneyHeadPin, row: Row) {
  return row.id === p.rowId && (row.status === 'FAILED' && row.attempts === p.originalAttempts && rowHash(row) === p.previousRowSha256
    || row.status === 'PENDING' && row.attempts === p.authorizedAttempt && hash(journeyHeadMarker(row)) === hash(journeyHeadMarkerFor(p))
      && invariant(row) === p.rowInvariantSha256);
}

/** The supplement is a single owner-admin decision under the existing ceiling.
 * Its ledger history is also checked by the budget resolver before dispatch. */
const wallSupplementId = (gameId: string, retry: boolean) => retry ? journeyWallProviderRetryId(gameId) : journeyWallReplacementId(gameId);
function wallProviderContinuation(pin: JourneyWallProviderRetryPin): WorldUnknownContinuationApproval {
  return {
    version: 'world-unknown-continuation/v1', worldId: pin.worldId, approvalId: journeyWallProviderRetryId(pin.gameId),
    requestKey: JOURNEY_WALL_REPLACEMENT_KEY, scope: 'image', operationFingerprint: pin.failedOperationFingerprint,
    reserveMicroUsd: pin.imageReserveMicroUsd, unknownReasons: pin.unknownReasons, operatorId: pin.operatorId,
    authorizationSha256: pin.authorizationSha256, authorizedAt: pin.createdAt,
  };
}
async function readWallSupplement(db: Db, gameId: string, retry: boolean) {
  const record = await db.auditLog.findUnique({ where: { id: wallSupplementId(gameId, retry) } });
  if (!record) return null;
  if (record.metaJson === null) {
    const game = await db.game.findUnique({ where: { id: gameId }, select: { status: true, deletedAt: true } });
    check(game?.status === 'DELETED' && game.deletedAt, 'replacement evidence missing');
    return null;
  }
  const pin = (retry ? wallProviderRetryPinSchema : wallReplacementPinSchema).parse(JSON.parse(record.metaJson));
  const { authorizationSha256, ...body } = pin;
  const { operatorId, ownerAuthorizationSha256: _decision, planSha256, createdAt: _created, ...plan } = body;
  check(record.actorType === 'ADMIN' && record.actorId === operatorId && pin.ownerId === operatorId
    && record.action === pin.version && record.entityType === 'Game' && record.entityId === gameId
    && pin.gameId === gameId && pin.worldId === gameId + ':board-wizard'
    && hash(plan) === planSha256 && hash(body) === authorizationSha256
    && sha(Buffer.from(pin.previousJudgeJson)) === pin.previousJudgeSha256, 'invalid replacement authority');
  const ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(db).read(pin.worldId);
  check(ledger && pin.originalRequests.every(old => ledger.snapshot.requests.some(r => r.requestKey === old.requestKey && hash(r) === old.sha256)),
    'replacement ledger history changed');
  if (pin.version === JOURNEY_WALL_PROVIDER_RETRY_ACTION) {
    const continuation = getMatchingUnknownContinuationApproval(ledger!.snapshot, JOURNEY_WALL_REPLACEMENT_KEY);
    check(hash(continuation) === hash(wallProviderContinuation(pin)), 'provider retry continuation changed');
  }
  return pin;
}
export const readJourneyWallReplacementPin = (db: Db, gameId: string) => readWallSupplement(db, gameId, false);
export const readJourneyWallProviderRetryPin = (db: Db, gameId: string) => readWallSupplement(db, gameId, true);
/** Absent pins are a cheap no-op for every historical world. There are only the
 * two named public SOURCE strategies, never an unbounded extra attempt list. */
export async function journeyHeadPinsOf(db: Db, gameId: string): Promise<JourneyHeadPin[]> {
  const records = await db.auditLog.findMany({ where: { id: { in: [...JOURNEY_SOURCE_HEAD_AUTHORITIES.map(a => keyOf(gameId, a.hideId)), journeySunburstHeadPinId(gameId),
    ...JOURNEY_SUNBURST_TAIL_HIDE_IDS.map(h => journeySunburstTailPinId(gameId, h))] } } });
  const result: JourneyHeadPin[] = [];
  for (const record of records) {
    const tail = record.action === JOURNEY_SUNBURST_TAIL_ACTION, sunburst = record.action === JOURNEY_SUNBURST_HEAD_ACTION;
    const p: JourneyHeadPin = (tail ? sunburstTailPinSchema : sunburst ? sunburstPinSchema : pinSchema).parse(JSON.parse(record.metaJson ?? 'null')), { authorizationSha256, ...body } = p;
    check(record.actorType === 'SYSTEM' && record.actorId === null && record.action === (tail ? JOURNEY_SUNBURST_TAIL_ACTION : sunburst ? JOURNEY_SUNBURST_HEAD_ACTION : JOURNEY_SOURCE_HEAD_ACTION)
      && record.entityType === 'Game' && record.entityId === gameId && p.gameId === gameId && p.worldId === gameId + ':board-wizard'
      && record.id === (tail ? journeySunburstTailPinId(gameId, p.hideId as JourneySunburstTailHideId) : sunburst ? journeySunburstHeadPinId(gameId) : keyOf(gameId, p.hideId)) && hash(body) === authorizationSha256, 'finite head authority changed');
    const a = (tail ? JOURNEY_SUNBURST_TAIL_AUTHORITIES : JOURNEY_SOURCE_HEAD_AUTHORITIES).find(a => a.hideId === p.hideId);
    check(a && hash(a) === p.authoritySha256 && p.requestKey === a.hideId + ':' + a.pose + ':render:2'
      && sha(Buffer.from(p.previousJudgeJson)) === p.previousJudgeSha256, 'public recipe or original evidence changed');
    const policy = await singleMediumReviewPolicyOf(db, gameId), ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(db).read(p.worldId);
    check(policy?.authorizationSha256 === p.mediumAuthorizationSha256 && policy.identitySha256 === p.identitySha256
      && ledger && p.originalRequests.every(old => ledger.snapshot.requests.some(r => r.requestKey === old.requestKey && hash(r) === old.sha256)),
    'original MEDIUM birth authority, bills or full reserves changed');
    result.push(p);
  }
  check(new Set(result.map(p => p.hideId)).size === result.length, 'two finite head authorities name one appearance');
  const replacement = await readJourneyWallReplacementPin(db, gameId);
  if (replacement) {
    const index = result.findIndex(p => p.hideId === JOURNEY_WALL_REPLACEMENT_HIDE);
    const prior = result[index];
    check(prior?.version === JOURNEY_SUNBURST_TAIL_VERSION && prior.authorizationSha256 === replacement.priorHeadAuthorizationSha256
      && prior.completionAuthorizationSha256 === replacement.completionAuthorizationSha256
      && prior.rowId === replacement.rowId && prior.authoritySha256 === replacement.authoritySha256
      && prior.identityAssetId === replacement.identityAssetId && prior.identitySha256 === replacement.identitySha256
      && prior.originalPhotoSha256 === replacement.originalPhotoSha256 && prior.mediumAuthorizationSha256 === replacement.mediumAuthorizationSha256
      && prior.originalPhotoAssetId === replacement.originalPhotoAssetId && prior.photoCropSha256 === replacement.photoCropSha256
      && prior.ownerId === replacement.ownerId, 'replacement does not extend its exact original head');
    result[index] = replacement;
  }
  const retry = await readJourneyWallProviderRetryPin(db, gameId);
  if (retry) {
    const index = result.findIndex(p => p.hideId === JOURNEY_WALL_REPLACEMENT_HIDE);
    check(replacement && result[index] === replacement && retry.priorHeadAuthorizationSha256 === replacement.authorizationSha256
      && retry.completionAuthorizationSha256 === replacement.completionAuthorizationSha256 && retry.rowId === replacement.rowId
      && retry.authoritySha256 === replacement.authoritySha256 && retry.identitySha256 === replacement.identitySha256
      && retry.originalPhotoSha256 === replacement.originalPhotoSha256 && retry.photoCropSha256 === replacement.photoCropSha256
      && retry.ownerId === replacement.ownerId, 'provider retry does not extend its exact third dispatch');
    result[index] = retry;
  }
  return result;
}

async function context(c: Container, gameId: string, hideId: string, painting: boolean, tailMode = false) {
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
  const authority = parent && (tailMode ? journeySunburstTailAuthorityFor(parent) : journeyHeadAuthorityFor(parent));
  if (!board || !hide || !parent || !authority || hide.pose !== authority.pose) return null;
  const budget = await boardWizardBudgetOf(c).audit(gameId + ':board-wizard');
  // The original four dollars, or exactly the verified explicit five-dollar
  // completion of THIS game (no other widened ceiling admits a finite head).
  const five = budget.capMicroUsd === QA_FIVE_COMPLETION_CAP ? await qaFiveCompletionActive(c, gameId) : null;
  const tail = budget.capMicroUsd === QA_FIVE_COMPLETION_CAP ? await qaSunburstTailCompletionActive(c, gameId) : null;
  if (budget.capMicroUsd !== 4_000_000 && !five && !tail || budget.overCapMicroUsd || budget.conflictRequestKeys.length || budget.overrunRequestKeys.length) return null;
  return { game, child, policy, identity, board, hide, parent, authority, budget, photoSha256, photoCropSha256, five, tail };
}

const wallSeamRefusal = 'quality-seam: JOURNEY_HEAD: protected SOURCE exterior exceeds unchanged24 limit';
const wallTailCapacity = 2 * (SUNBURST_IMAGE_RESERVE_MICRO_USD + SUNBURST_REVIEW_COVERAGE_MICRO_USD);

async function wallReplacementPlan(c: Container, gameId: string) {
  check(env().APP_ENV === 'qa' && c.storage.id === 'db', 'replacement is QA only');
  const p = await context(c, gameId, JOURNEY_WALL_REPLACEMENT_HIDE, true, true);
  check(p?.tail && p.budget.capMicroUsd === QA_FIVE_COMPLETION_CAP && !p.budget.held
    && p.budget.remainingMicroUsd >= wallTailCapacity, 'replacement and Paris full coverage required');
  const tail = p!.tail!;
  const wall = qaSunburstTailOperationOf(tail, JOURNEY_WALL_REPLACEMENT_HIDE);
  const paris = qaSunburstTailOperationOf(tail, JOURNEY_SUNBURST_HEAD_HIDE_ID);
  const pins = await journeyHeadPinsOf(c.db, gameId);
  const prior = pins.find(pin => pin.hideId === JOURNEY_WALL_REPLACEMENT_HIDE);
  check(prior?.version === JOURNEY_SUNBURST_TAIL_VERSION && prior.completionAuthorizationSha256 === tail.authorizationSha256
    && wall?.rowId === prior.rowId && wall?.requestKey === prior.requestKey && paris
    && !pins.some(pin => pin.hideId === paris.hideId), 'replacement requires its spent wall pin and unstarted Paris');
  if (prior?.version !== JOURNEY_SUNBURST_TAIL_VERSION || !paris) throw Error('JOURNEY_HEAD: replacement prerequisites');
  const job = await c.db.generationJob.findUniqueOrThrow({ where: { id: 'job_' + gameId } });
  check(['FAILED', 'QUEUED'].includes(job.status), 'replacement job is active');
  const rows = await c.db.targetVariantAsset.findMany({ where: { variant: 'A', targetInstance: { gameScene: { gameId } } } });
  const row = rows.find(r => r.id === prior.rowId), parisRow = rows.find(r => r.id === paris.rowId);
  check(rows.length === 27 && row && row.status === 'FAILED' && row.attempts === 2
    && row.assetId === prior.previousAssetId && row.provider === 'local-patch'
    && parisRow?.status === 'FAILED' && parisRow.attempts === 1
    && sha(Buffer.from(parisRow.judgeJson ?? '')) === paris.previousJudgeSha256, 'original finite tail rows changed');
  const receipt = JSON.parse(row!.judgeJson ?? 'null');
  check(receipt?.renderFault === wallSeamRefusal && receipt.verdict === null && receipt.wireFault === null
    && receipt.boardReview === undefined && hash(receipt.authoredReturn) === hash(p!.parent)
    && hash(journeyHeadMarker(row!)) === hash(journeyHeadMarkerFor(prior)), 'expected unreviewed exterior-seam refusal');
  check(rows.every(other => other.id === prior.rowId || other.id === paris.rowId
    || other.status === 'GENERATED' && !localPatchReadyReviewOwed(other, { required: true })
      && JSON.parse(other.judgeJson ?? 'null')?.qualityDisposition?.state === 'acceptable'), '25 ordinary approvals required');
  const ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(c.db).read(prior.worldId);
  check(ledger && !ledger.snapshot.requests.some(request => request.state === 'pending'
    || request.requestKey === JOURNEY_WALL_REPLACEMENT_KEY || request.requestKey === paris.requestKey)
    && !await new PrismaRetainedPurchaseStore(c.db).get(prior.worldId, JOURNEY_WALL_REPLACEMENT_KEY), 'replacement or Paris purchase already exists');
  const paid = await readSettledTargetRaw(c.db, gameId, prior.requestKey);
  check(hash(paid.wire.journeyHeadRecovery) === hash(journeyHeadMarkerFor(prior))
    && hash(paid.wire.authoredReturn) === hash(p!.parent), 'rejected paid evidence differs');
  const { authorizationSha256: priorHeadAuthorizationSha256, createdAt: _time, ...original } = prior;
  return wallReplacementPlanSchema.parse({ ...original, version: JOURNEY_WALL_REPLACEMENT_ACTION,
    originalAttempts: 2, authorizedAttempt: 3, requestKey: JOURNEY_WALL_REPLACEMENT_KEY, priorHeadAuthorizationSha256,
    previousJudgeJson: row!.judgeJson, previousJudgeSha256: sha(Buffer.from(row!.judgeJson!)), previousRowSha256: rowHash(row!),
    rowInvariantSha256: invariant(row!), rejectedPayloadSha256: paid.kept.payloadSha256,
    protectedRows: rows.filter(other => other.id !== row!.id).map(other => ({ id: other.id, sha256: rowHash(other) }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    originalRequests: ledger!.snapshot.requests.map(request => ({ requestKey: request.requestKey, sha256: hash(request) })),
    ledgerRevision: ledger!.revision, jobSha256: hash(job), committedMicroUsd: p!.budget.committedMicroUsd });
}

/** A third-dispatch server failure can be left reserved while exactly one
 * new key is authorized. A retained image, missing receipt or any other
 * unresolved charge must go through its own reconciliation. */
async function wallProviderRetryPlan(c: Container, gameId: string) {
  const p = await context(c, gameId, JOURNEY_WALL_REPLACEMENT_HIDE, true, true);
  const prior = await readJourneyWallReplacementPin(c.db, gameId);
  check(p?.tail && prior?.version === JOURNEY_WALL_REPLACEMENT_ACTION && p.budget.held
    && p.budget.capMicroUsd === QA_FIVE_COMPLETION_CAP && p.budget.remainingMicroUsd >= wallTailCapacity
    && prior.completionAuthorizationSha256 === p.tail.authorizationSha256 && prior.authoritySha256 === hash(p.authority)
    && prior.identityAssetId === p.identity.id && prior.identitySha256 === p.policy.identitySha256
    && prior.originalPhotoAssetId === p.child.originalPhotoAssetId && prior.originalPhotoSha256 === p.photoSha256
    && prior.photoCropSha256 === p.photoCropSha256 && prior.mediumAuthorizationSha256 === p.policy.authorizationSha256
    && prior.ownerId === p.game.ownerId, 'provider retry requires the exact held five-dollar tail and full coverage');
  if (!p?.tail || prior?.version !== JOURNEY_WALL_REPLACEMENT_ACTION) throw Error('JOURNEY_HEAD: provider retry prerequisites');
  const paris = qaSunburstTailOperationOf(p.tail, JOURNEY_SUNBURST_HEAD_HIDE_ID);
  const job = await c.db.generationJob.findUniqueOrThrow({ where: { id: 'job_' + gameId } });
  const rows = await c.db.targetVariantAsset.findMany({ where: { variant: 'A', targetInstance: { gameScene: { gameId } } } });
  const row = rows.find(r => r.id === prior.rowId), parisRow = rows.find(r => r.id === paris?.rowId);
  check(job.status === 'FAILED' && paris && rows.length === 27 && row?.status === 'PENDING' && row.attempts === 3
    && invariant(row) === prior.rowInvariantSha256 && hash(journeyHeadMarker(row)) === hash(journeyHeadMarkerFor(prior))
    && parisRow?.status === 'FAILED' && parisRow.attempts === 1 && sha(Buffer.from(parisRow.judgeJson ?? '')) === paris.previousJudgeSha256
    && prior.protectedRows.every(saved => rows.some(r => r.id === saved.id && rowHash(r) === saved.sha256))
    && rows.filter(r => r.id !== row.id && r.id !== parisRow.id).every(r => r.status === 'GENERATED'
      && JSON.parse(r.judgeJson ?? 'null')?.qualityDisposition?.state === 'acceptable')
    && !await c.db.auditLog.findUnique({ where: { id: journeySunburstTailPinId(gameId, JOURNEY_SUNBURST_HEAD_HIDE_ID) } }),
  'provider retry requires its exact pending row, 25 approvals and unstarted Paris');
  const ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(c.db).read(prior.worldId);
  if (!ledger || !row || !paris) throw Error('JOURNEY_HEAD: provider retry rows or ledger missing');
  const requests = ledger.snapshot.requests;
  const failed = requests.find(r => r.requestKey === JOURNEY_WALL_REPLACEMENT_KEY);
  const retained = new PrismaRetainedPurchaseStore(c.db);
  check(failed?.state === 'unknown' && failed.scope === 'image' && failed.reserveMicroUsd === SUNBURST_IMAGE_RESERVE_MICRO_USD
    && requests.every(r => r.state !== 'pending' && (r.state !== 'unknown' || (r === failed
      ? !getMatchingUnknownContinuationApproval(ledger.snapshot, r.requestKey)
      : !!getMatchingUnknownContinuationApproval(ledger.snapshot, r.requestKey))))
    && !requests.some(r => r.requestKey === JOURNEY_WALL_PROVIDER_RETRY_KEY || r.requestKey === paris.requestKey)
    && !await retained.get(prior.worldId, JOURNEY_WALL_PROVIDER_RETRY_KEY) && !await retained.get(prior.worldId, paris.requestKey),
  'exact single unapproved reservation required, with neither next purchase started');
  if (failed?.state !== 'unknown') throw Error('JOURNEY_HEAD: third dispatch is not UNKNOWN');
  const kept = await retained.get(prior.worldId, failed.requestKey);
  const wire = kept && JSON.parse(kept.bytes.toString('utf8'));
  const failure = fixedSourceFailureReceiptSchema.safeParse(wire?.failureReceipt);
  // The retained envelope binds the ledger fingerprint; the embedded receipt
  // records the provider transport's separate request fingerprint.
  check(kept?.scope === 'image' && kept.evidence === null && kept.operationFingerprint === failed.operationFingerprint
    && kept.unknownReason === 'image-charge-evidence-incomplete-or-model-unexpected'
    && wire?.version === RETAINED_RENDER_VERSION && typeof wire.rejected === 'string' && wire.bytesBase64 === null
    && hash(wire.authoredReturn) === hash(p.parent) && hash(wire.journeyHeadRecovery) === hash(journeyHeadMarkerFor(prior))
    && failure.success && failure.data.worldId === prior.worldId && failure.data.requestKey === failed.requestKey
    && failure.data.billing === 'unknown' && failure.data.reason === 'charge-evidence'
    && failure.data.httpStatus === 500 && failure.data.providerErrorType === 'server_error' && failure.data.transport === null
    && failure.data.jsonStatus === 'parsed' && failure.data.requestIdStatus === 'safe' && !!failure.data.requestId
    && failure.data.requestedModel === 'gpt-image-2.6-sunburst' && failure.data.requestedQuality === 'high'
    && failure.data.returnedModel === 'absent' && !failure.data.usage.present && !failure.data.usage.valid,
  'the retained third dispatch must prove HTTP 500 without image or usage');
  const { authorizationSha256: priorHeadAuthorizationSha256, operatorId: _operator, ownerAuthorizationSha256: _authority,
    createdAt: _time, planSha256: _plan, ...original } = prior;
  return wallProviderRetryPlanSchema.parse({ ...original, version: JOURNEY_WALL_PROVIDER_RETRY_ACTION,
    originalAttempts: 3, authorizedAttempt: 4, requestKey: JOURNEY_WALL_PROVIDER_RETRY_KEY, priorHeadAuthorizationSha256,
    pendingRowSha256: rowHash(row), previousJudgeJson: row.judgeJson, previousJudgeSha256: sha(Buffer.from(row.judgeJson!)),
    previousRowSha256: rowHash({ ...row, status: 'FAILED' }), rejectedPayloadSha256: kept!.payloadSha256,
    failedOperationFingerprint: failed.operationFingerprint, unknownReasons: failed.unknownReasons,
    originalRequests: requests.map(request => ({ requestKey: request.requestKey, sha256: hash(request) })),
    ledgerRevision: ledger.revision, jobSha256: hash(job), committedMicroUsd: p.budget.committedMicroUsd });
}

export async function previewJourneyWallReplacement(c: Container, gameId: string, retry = false) {
  check(env().APP_ENV === 'qa' && c.storage.id === 'db', 'replacement is QA only');
  const recorded = await readWallSupplement(c.db, gameId, retry);
  const plan = recorded ?? await (retry ? wallProviderRetryPlan(c, gameId) : wallReplacementPlan(c, gameId));
  return { recorded: !!recorded, planSha256: recorded?.planSha256 ?? hash(plan), capMicroUsd: QA_FIVE_COMPLETION_CAP,
    committedMicroUsd: plan.committedMicroUsd, requiredMicroUsd: wallTailCapacity,
    requestKey: plan.requestKey, authorizationSha256: recorded?.authorizationSha256 };
}

export async function authorizeJourneyWallReplacement(c: Container, input: {
  gameId: string; operatorId: string; expectedPlanSha256: string; ownerAuthorizationSha256: string;
}, retry = false) {
  check(env().APP_ENV === 'qa' && c.storage.id === 'db', 'replacement is QA only');
  const { gameId, operatorId } = input;
  const actor = await c.db.user.findUnique({ where: { id: operatorId }, select: { email: true } });
  check(actor && c.adminEmails?.some(email => email.trim().toLowerCase() === actor.email.trim().toLowerCase()),
    'replacement requires an owner administrator');
  digest.parse(input.ownerAuthorizationSha256);
  return c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, gameId);
    const cc = { ...c, db: tx, storage: new DbStorage(tx) } as unknown as Container;
    const existing = await readWallSupplement(tx, gameId, retry);
    if (existing) {
      check(existing.operatorId === operatorId && existing.planSha256 === input.expectedPlanSha256
        && existing.ownerAuthorizationSha256 === input.ownerAuthorizationSha256, 'replacement already recorded with other evidence');
      return existing;
    }
    const plan = await (retry ? wallProviderRetryPlan(cc, gameId) : wallReplacementPlan(cc, gameId));
    check(plan.ownerId === operatorId && hash(plan) === input.expectedPlanSha256, 'replacement plan changed');
    const body = { ...plan, operatorId, ownerAuthorizationSha256: input.ownerAuthorizationSha256,
      planSha256: input.expectedPlanSha256, createdAt: new Date().toISOString() };
    const pin = (retry ? wallProviderRetryPinSchema : wallReplacementPinSchema).parse({ ...body, authorizationSha256: hash(body) });
    if (pin.version === JOURNEY_WALL_PROVIDER_RETRY_ACTION) {
      const { worldId, version: _version, ...approval } = wallProviderContinuation(pin);
      const store = PrismaWorldBudgetStore.forContinuationApprovalTransaction(tx);
      check((await store.read(worldId))?.revision === plan.ledgerRevision, 'provider retry ledger changed concurrently');
      const budget = new WorldBudget(new CasWorldBudgetRepository(store), {
        authorizeUnknownContinuation: async incoming => hash(incoming) === hash(wallProviderContinuation(pin)),
      });
      check((await budget.authorizeUnknownContinuation(worldId, approval)).acquired, 'provider continuation already exists');
      const row = await tx.targetVariantAsset.findUniqueOrThrow({ where: { id: pin.rowId } });
      check(rowHash(row) === pin.pendingRowSha256, 'provider retry row changed');
      const closed = await tx.targetVariantAsset.updateMany({ where: { id: row.id, status: 'PENDING', attempts: 3,
        updatedAt: row.updatedAt }, data: { status: 'FAILED' } });
      check(closed.count === 1, 'provider retry row changed concurrently');
    } else {
      const revision = await tx.worldBudgetLedger.updateMany({ where: { worldId: pin.worldId, revision: plan.ledgerRevision },
        data: { revision: { increment: 1 } } });
      check(revision.count === 1, 'replacement ledger changed concurrently');
    }
    await tx.auditLog.create({ data: { id: wallSupplementId(gameId, retry), action: pin.version,
      actorType: 'ADMIN', actorId: operatorId, entityType: 'Game', entityId: gameId, metaJson: JSON.stringify(pin) } });
    await tx.generationJob.update({ where: { id: 'job_' + gameId }, data: { status: 'QUEUED', currentStep: 'local-patch', lastError: null } });
    return pin;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
}

/** A free, finite recipe enrollment, not a painting or an art approval. The two
 * heads are handled before optional window reviews while full bounds still fit. */
export async function resumeJourneySourceHead(c: Container, gameId: string, hideId: string, observeRefusal?: (why: string) => void) {
  return enrollJourneyHead(c, gameId, hideId, false, observeRefusal);
}

/** journey-source-head-sunburst/v1: the same free finite enrollment for the ONE
 * Paris head, bound to the active explicit five-dollar completion whose named
 * next operation it is. It buys nothing and never changes the game's painter pin. */
export async function resumeJourneySunburstHead(c: Container, gameId: string, observeRefusal?: (why: string) => void) {
  return enrollJourneyHead(c, gameId, JOURNEY_SUNBURST_HEAD_HIDE_ID, true, observeRefusal);
}

/** Free enrollment of ONE member of the owner's immutable finite tail. No
 * provider call, row/attempt change, transferred verdict or painter re-pin. */
export async function resumeJourneySunburstTailHead(c: Container, gameId: string, hideId: string, observeRefusal?: (why: string) => void) {
  return enrollJourneyHead(c, gameId, hideId, true, observeRefusal, true);
}

async function enrollJourneyHead(c: Container, gameId: string, hideId: string, sunburst: boolean, observeRefusal?: (why: string) => void, tailMode = false) {
  const refuse = (why: string) => { observeRefusal?.(why); return false; };
  if (env().APP_ENV !== 'qa' || c.storage.id !== 'db'
    || !(tailMode ? JOURNEY_SUNBURST_TAIL_AUTHORITIES : JOURNEY_SOURCE_HEAD_AUTHORITIES).some(a => a.hideId === hideId)
    || sunburst && !tailMode && hideId !== JOURNEY_SUNBURST_HEAD_HIDE_ID) return refuse('qa-scope');
  return c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, gameId);
    const cc = { ...c, db: tx, storage: new DbStorage(tx) } as unknown as Container;
    const job = await tx.generationJob.findUnique({ where: { id: 'job_' + gameId } });
    // Exactly one finite second purchase per appearance, whichever painter.
    if (!job || !['QUEUED', 'FAILED'].includes(job.status) || await tx.auditLog.findUnique({ where: { id: keyOf(gameId, hideId) } })
      || hideId === JOURNEY_SUNBURST_HEAD_HIDE_ID && await tx.auditLog.findUnique({ where: { id: journeySunburstHeadPinId(gameId) } })
      || (JOURNEY_SUNBURST_TAIL_HIDE_IDS as readonly string[]).includes(hideId) && await tx.auditLog.findUnique({ where: { id: journeySunburstTailPinId(gameId, hideId as JourneySunburstTailHideId) } })) return refuse('job-or-existing-pin');
    const p = await context(cc, gameId, hideId, true, tailMode);
    const need = sunburst ? SUNBURST_IMAGE_RESERVE_MICRO_USD + SUNBURST_REVIEW_COVERAGE_MICRO_USD : LOCAL_PATCH_RESERVE.renderMicroUsd + JOURNEY_HEAD_REVIEW_COVERAGE_MICRO_USD;
    if (!p || p.budget.held || p.budget.remainingMicroUsd < need) return refuse('payment-identity-or-full-capacity');
    // The five-dollar grant was justified by THIS Sunburst head: while it is
    // active, its named appearance cannot be re-enrolled as a MEDIUM v2 head.
    if (!sunburst && (p.five?.plan.nextOperation.hideId === hideId || p.tail && qaSunburstTailOperationOf(p.tail, hideId))) return refuse('five-dollar-grant-names-sunburst-head');
    if (sunburst && (!(tailMode ? p.tail : p.five) || p.budget.capMicroUsd !== QA_FIVE_COMPLETION_CAP)) return refuse('explicit-five-dollar-completion-required');
    const all = await tx.targetVariantAsset.findMany({ where: { variant: 'A', targetInstance: { gameScene: { gameId } } },
      include: { targetInstance: { include: { gameScene: true } } } });
    const row = all.find(r => r.targetInstance.gameScene.sceneSlug === p.board.board && r.targetInstance.targetId === p.hide.targetId);
    if (all.length !== 27 || !row || row.provider !== 'local-patch' || row.status !== 'FAILED' || row.attempts !== 1 || !row.assetId) return refuse('original27-or-first-failed-row');
    // This game's global painter remains MEDIUM. Finish existing paid-picture
    // assessments before enrolling its one finite Sunburst head; their later
    // mutation is also barred by the protected-row fence before dispatch.
    if (sunburst && all.some(other => other.id !== row.id && localPatchReadyReviewOwed(other, { required: true })))
      return refuse('other-paid-pictures-await-ordinary-review');
    const previous = JSON.parse(row.judgeJson ?? 'null');
    if (previous?.hide !== hideId || previous.pose !== p.hide.pose || previous.reviewState !== 'board-review-complete'
      || previous.journeyHeadRecovery !== undefined || !tailMode && previous.retainedWindow !== undefined || hash(previous.authoredReturn) !== hash(p.parent)) return refuse('unfinished-original-evidence');
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
    if (tailMode && p.tail) {
      const unbought = p.tail.plan.operations.filter(op => !ledger.snapshot.requests.some(r => r.requestKey === op.requestKey));
      if (p.budget.remainingMicroUsd < unbought.reduce((sum, op) => sum + op.requiredMicroUsd, 0)) return refuse('full-remaining-tail-capacity');
    }
    await readSettledTargetRaw(tx, gameId, hideId + ':' + p.hide.pose + ':render:1');
    const requestKey = hideId + ':' + p.hide.pose + ':render:2';
    if (ledger.snapshot.requests.some(r => r.requestKey === requestKey) || await new PrismaRetainedPurchaseStore(tx).get(gameId + ':board-wizard', requestKey)) return refuse('second-purchase-exists');
    if (sunburst) {
      const next = tailMode ? qaSunburstTailOperationOf(p.tail!, hideId) : p.five!.plan.nextOperation;
      if (!next || next.hideId !== hideId || next.rowId !== row.id || next.requestKey !== requestKey || next.previousJudgeSha256 !== sha(Buffer.from(row.judgeJson!)))
        return refuse('five-dollar-named-operation-changed');
    }
    const common = { gameId, worldId: gameId + ':board-wizard', ownerId: p.game.ownerId,
      rowId: row.id, hideId, authoritySha256: hash(p.authority), identityAssetId: p.identity.id, identitySha256: p.policy.identitySha256,
      mediumAuthorizationSha256: p.policy.authorizationSha256, originalPhotoAssetId:p.child.originalPhotoAssetId, originalPhotoSha256:p.photoSha256, photoCropSha256:p.photoCropSha256 };
    const tail = { originalAttempts: 1, authorizedAttempt: 2, requestKey,
      previousJudgeJson: row.judgeJson, previousJudgeSha256: sha(Buffer.from(row.judgeJson!)), previousRowSha256: rowHash(row), rowInvariantSha256: invariant(row), previousAssetId: row.assetId,
      protectedRows: all.filter(r => r.id !== row.id).map(r => ({ id: r.id, sha256: rowHash(r) })),
      originalRequests: ledger.snapshot.requests.map(r => ({ requestKey: r.requestKey, sha256: hash(r) })), createdAt: new Date().toISOString() };
    const body = sunburst
      ? (tailMode ? sunburstTailPinBody : sunburstPinBody).parse({ version: tailMode ? JOURNEY_SUNBURST_TAIL_VERSION : JOURNEY_SUNBURST_HEAD_VERSION, ...common, capMicroUsd: QA_FIVE_COMPLETION_CAP, ...tail,
        completionAuthorizationSha256: (tailMode ? p.tail! : p.five!).authorizationSha256, painterRelease: JOURNEY_SUNBURST_HEAD_PAINTER, imagePolicySha256: SUNBURST_HEAD_POLICY_SHA256,
        imageReserveMicroUsd: SUNBURST_IMAGE_RESERVE_MICRO_USD, reviewCoverageMicroUsd: SUNBURST_REVIEW_COVERAGE_MICRO_USD })
      : pinBody.parse({ version: JOURNEY_SOURCE_HEAD_VERSION, ...common, capMicroUsd: 4_000_000, ...tail });
    const pin = (tailMode ? sunburstTailPinSchema : sunburst ? sunburstPinSchema : pinSchema).parse({ ...body, authorizationSha256: hash(body) });
    const revision = await tx.worldBudgetLedger.updateMany({ where: { worldId: pin.worldId, revision: ledger.revision }, data: { revision: { increment: 1 } } });
    check(revision.count === 1, 'concurrent finite head enrollment');
    await tx.auditLog.create({ data: { id: tailMode ? journeySunburstTailPinId(gameId, hideId as JourneySunburstTailHideId) : sunburst ? journeySunburstHeadPinId(gameId) : keyOf(gameId, hideId), actorType: 'SYSTEM',
      action: tailMode ? JOURNEY_SUNBURST_TAIL_ACTION : sunburst ? JOURNEY_SUNBURST_HEAD_ACTION : JOURNEY_SOURCE_HEAD_ACTION, entityType: 'Game', entityId: gameId, metaJson: JSON.stringify(pin) } });
    if (tailMode) {
      const wake = await tx.generationJob.updateMany({ where: { id: job.id, status: job.status, attempts: job.attempts, updatedAt: job.updatedAt },
        data: { status: 'QUEUED', currentStep: 'local-patch', lastError: null } });
      check(wake.count === 1, 'concurrent finite tail job enrollment');
    } else await tx.generationJob.update({ where: { id: job.id }, data: { status: 'QUEUED', currentStep: 'local-patch', lastError: null } });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
}

export async function requireJourneyHeadPurchase(c: Container, gameId: string, rowId: string) {
  const pin = (await journeyHeadPinsOf(c.db, gameId)).find(p => p.rowId === rowId), row = await c.db.targetVariantAsset.findUnique({ where: { id: rowId } });
  check(pin && row && journeyHeadCandidate(pin, row), 'no current finite SOURCE-head purchase');
  const p = await context(c, gameId, pin!.hideId, true, isJourneySunburstTailPin(pin!));
  check(p && hash(p.authority) === pin!.authoritySha256 && p.policy.identitySha256 === pin!.identitySha256
    && p.child.originalPhotoAssetId===pin!.originalPhotoAssetId&&p.photoSha256===pin!.originalPhotoSha256&&p.photoCropSha256===pin!.photoCropSha256, 'current payment, identity, photo, crop or public SOURCE changed');
  const sunburst = journeySunburstHeadState(pin!);
  // The Sunburst head stays bound to the exact active grant it was enrolled under.
  if (sunburst) check(p!.budget.capMicroUsd === QA_FIVE_COMPLETION_CAP && (isJourneySunburstTailPin(pin!) ? p!.tail : p!.five)?.authorizationSha256 === sunburst.completionAuthorizationSha256,
    'explicit five-dollar completion authority changed');
  const existing = await boardWizardBudgetOf(c).readRequest(pin!.worldId, pin!.requestKey);
  if (!existing) check(!p!.budget.held && p!.budget.remainingMicroUsd >= (pin!.version === JOURNEY_WALL_REPLACEMENT_ACTION || pin!.version === JOURNEY_WALL_PROVIDER_RETRY_ACTION ? wallTailCapacity
    : sunburst ? sunburst.imageReserveMicroUsd + sunburst.reviewCoverageMicroUsd : LOCAL_PATCH_RESERVE.renderMicroUsd + JOURNEY_HEAD_REVIEW_COVERAGE_MICRO_USD),
    sunburst ? 'Sunburst image and full ordinary assessment coverage do not fit' : 'image and full bounded ordinary MEDIUM coverage do not fit');
  return { pin: pin!, marker: journeyHeadMarkerFor(pin!), authority: p!.authority, sunburst };
}

/** Only this verified, consumed operator authorization can carry its one
 * unresolved image reserve into a playable world. */
export async function journeyWallProviderRetryPublishable(db: Db, gameId: string, approval: WorldUnknownContinuationApproval) {
  if (approval.requestKey !== JOURNEY_WALL_REPLACEMENT_KEY || approval.approvalId !== journeyWallProviderRetryId(gameId)) return false;
  const retry = (await journeyHeadPinsOf(db, gameId)).find(p => p.version === JOURNEY_WALL_PROVIDER_RETRY_ACTION);
  if (!retry || hash(approval) !== hash(wallProviderContinuation(retry))) return false;
  const row = await db.targetVariantAsset.findUnique({ where: { id: retry.rowId } });
  if (!row || row.status !== 'GENERATED' || row.attempts !== retry.authorizedAttempt
    || hash(journeyHeadMarker(row)) !== hash(journeyHeadMarkerFor(retry))
    || JSON.parse(row.judgeJson ?? 'null')?.qualityDisposition?.state !== 'acceptable') return false;
  const replacement = await readSettledTargetRaw(db, gameId, retry.requestKey);
  return hash(replacement.wire.journeyHeadRecovery) === hash(journeyHeadMarkerFor(retry));
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
    const pin = (await journeyHeadPinsOf(tx, gameId)).find(x => x.hideId === hideId);
    const p = await context(cc, gameId, hideId, false, !!pin && isJourneySunburstTailPin(pin));
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
    return !!pin && input.sceneVersion === 13 && input.hideId === pin.hideId && input.attempts === pin.authorizedAttempt && hash(marker) === hash(journeyHeadMarkerFor(pin));
  } catch { return false; }
}

/** A transport interruption changes the review state, not the paid pixels.
 * Recheck the live held request and its system proof before the same image can
 * be prepared again. Publication still requires a generated, approved row. */
async function journeyInterruptedReviewMatches(db: Db, pin: JourneyHeadPin, row: Row, receipt: Record<string, any>) {
  const interruption = receipt.reviewInterruption;
  if (row.status !== 'FAILED' || receipt.reviewState !== 'board-review-complete' || receipt.verdict !== null
    || interruption?.policyId !== 'single-sol-medium-transport-recovery/v1' || interruption.single !== 'single-sol-medium/v1'
    || interruption.variantId !== row.id || interruption.assetId !== row.assetId || interruption.hideId !== pin.hideId
    || interruption.imageSha256 !== receipt.judgedSha256 || interruption.geometrySha256 !== receipt.geometrySha256
    || interruption.identitySha256 !== pin.identitySha256 || interruption.attempts !== row.attempts
    || typeof interruption.requestKey !== 'string' || receipt.boardReview?.requestKey !== interruption.requestKey) return false;
  const ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(db).read(pin.worldId);
  const approval = ledger && getMatchingUnknownContinuationApproval(ledger.snapshot, interruption.requestKey);
  if (approval?.version !== 'world-automatic-review-recovery/v5' || approval.policyId !== interruption.policyId
    || approval.approvalId !== interruption.recoveryId || approval.operationFingerprint !== interruption.operationFingerprint
    || approval.reserveMicroUsd !== interruption.reservedMicroUsd || approval.variantId !== row.id
    || approval.imageSha256 !== receipt.judgedSha256) return false;
  const { recoveryId, reservedMicroUsd, ...proof } = interruption;
  return sha(Buffer.from(JSON.stringify(proof))) === approval.authorizationSha256
    && await (await import('./detectives-completion-budget')).singleLowContinuationPublishable(db, pin.gameId, approval);
}

export async function journeyHeadCompositionMatches(db: Db, input: { gameId: string; hideId: string; receipt: Record<string, any>; beforePng?: Buffer; variantId?:string; assetId?:string; identitySha256?:string; allowInterruptedReview?: boolean }, readArt: ReadArt = readShippedBoardArt) {
  try {
    const pin = (await journeyHeadPinsOf(db, input.gameId)).find(p => p.hideId === input.hideId), marker = journeyHeadMarker({ judgeJson: JSON.stringify(input.receipt) });
    if (!pin || hash(marker) !== hash(journeyHeadMarkerFor(pin))) return false;
    const p = await context(scoped(db), input.gameId, input.hideId, false, isJourneySunburstTailPin(pin)), row = await db.targetVariantAsset.findUnique({ where: { id: pin.rowId } });
    if (!p || !row || row.attempts !== pin.authorizedAttempt
      ||input.variantId!==undefined&&input.variantId!==pin.rowId||input.assetId!==undefined&&input.assetId!==row.assetId
      ||input.identitySha256!==undefined&&input.identitySha256!==pin.identitySha256
      ||p.photoCropSha256!==pin.photoCropSha256||p.child.originalPhotoAssetId!==null&&p.child.originalPhotoAssetId!==pin.originalPhotoAssetId
      ||p.photoSha256!==null&&p.photoSha256!==pin.originalPhotoSha256||hash(JSON.parse(row.judgeJson ?? 'null')) !== hash(input.receipt)
      || hash(input.receipt.authoredReturn) !== hash(p.parent) || input.receipt.authoredRecovery !== undefined) return false;
    if (row.status !== 'GENERATED' && (!input.allowInterruptedReview || !await journeyInterruptedReviewMatches(db, pin, row, input.receipt))) return false;
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
