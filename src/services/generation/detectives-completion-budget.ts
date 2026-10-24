import { nativeMaskTailCandidate, nativeMaskTailMarker, nativeMaskTailMarkerSchema, nativeMaskTailEditRegion } from "../../domain/generation/native-mask-tail";
import { detectiveTailBindingSchema, detectiveTailReceiptBodySchema, detectiveTailReceiptSchema, detectivesTailId, detectivesTailResumeId, DETECTIVES_TAIL_BUDGET, DETECTIVES_TAIL_CAP, DETECTIVES_TAIL_ACTION, DETECTIVES_TAIL_RESUMED, type DetectiveTailReceipt } from "../../domain/generation/detectives-completion-budget";
import { guidedFrameCandidate, GUIDED_FRAME_MIN_CAPACITY_MICRO_USD } from "../../domain/generation/guided-frame-recovery";
import { isSingleLowReviewPolicy } from "../../domain/generation/visual-review-policy";
import { backgroundRoundOfKey, providerEndedFailed, backgroundRoundsOnImage, roundAnswered, backgroundPolicyOfIntent } from "./continuity-background";
import { localPatchPublicationGeometryHash } from "./local-patch-publication-policy";
import { authoredLocalPatchReviewBinding } from "./local-patch-authored-return";
import { admittedInterruption, providerFailureRefusal } from "./local-patch-review-interruption-recovery";
import type { WorldAutomaticReviewRecoveryV5 } from "./world-budget";
import { SINGLE_VISUAL_REVIEW_VERSION, readSingleVisualReview } from "../../domain/generation/single-visual-review";
import { DETECTIVE_PATCH_BOARDS } from "../../../content/detectives/runtime-release";
import { PrismaRetainedPurchaseStore } from "../../infra/db/prisma-retained-purchase-store";
import { savedApplyingRepairOf } from "./local-patch-self-repair";
import { LOCAL_PATCH_RESERVE } from "./local-patch-render";
import { LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT } from "./local-patch-hide";
import { sameChargeEvidence } from "./world-budget";
import { selfRepairDecisionSchema } from "../../domain/scene/local-patch-self-repair";
import { SUBJECT_V2_REPAIR_CYCLES } from "../../domain/scene/local-patch-progress";
import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { DbStorage } from "../../infra/storage/db";
import { PrismaWorldBudgetStore, WORLD_BUDGET_LEDGER_MAX_REVISION } from "../../infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../../infra/db/world-budget-repository";
import { auditWorldBudget } from "./world-budget";
import { applyBoardWizardBudgetCap, boardWizardBudget, type BoardWizardBudgetGrant } from "./board-wizard-budget";
import { boardConditioningHash as hash } from "./board-conditioned-source";
import { sha256Bytes } from "./fixed-sprite";
import { leanReleaseOf, leanReleaseReceipt } from "./lean-release";
import { sourcePlacementReleaseOf, resolveLocalPatchBoardsForGame, sourcePlacementForHide } from "./source-placement-release";
import { subjectUpgradeOf } from "./subject-enrollment";
import { identityGateReceiptOf, identityReceiptReadyForPublication, requireBoardWizardIdentityApproval } from "./board-wizard-identity-gate";
import { parkedHoldSha256 } from "./lean-review-recovery-pin";
import { identityRevisionPending } from "./identity-source-revision-state";
import { backgroundReviewWaiting } from "./continuity-background";
import { isGameStatus, isPlayable } from "../../domain/order-state";
import { detectiveBudgetBindingSchema, detectiveBudgetReceiptBodySchema, detectiveBudgetReceiptSchema,
  detectiveBudgetIdSchema, detectiveBudgetHashSchema, detectivesCompletionId, detectivesCompletionResumeId,
  DETECTIVES_COMPLETION_BUDGET, DETECTIVES_COMPLETION_CAP, DETECTIVES_COMPLETION_ACTION, DETECTIVES_COMPLETION_RESUMED,
  detectiveExtensionBindingSchema, detectiveExtensionReceiptBodySchema, detectiveExtensionReceiptSchema,
  detectivesExtensionId, detectivesExtensionResumeId, DETECTIVES_EXTENSION_BUDGET, DETECTIVES_EXTENSION_CAP,
  DETECTIVES_EXTENSION_ACTION, DETECTIVES_EXTENSION_RESUMED, type DetectiveExtensionReceipt, type DetectiveBudgetReceipt } from "../../domain/generation/detectives-completion-budget";

const EXHAUSTED = "local-patch:recovery-exhausted";
const worldOf = (gameId: string) => `${gameId}:board-wizard`;
function demand(ok: unknown, why: string): asserts ok { if (!ok) throw Error(`DETECTIVES_BUDGET: ${why}`); }
const transactionContainer = (c: Container, tx: Prisma.TransactionClient): Container => ({ ...c, db: tx as Container["db"], storage: new DbStorage(tx) });

async function current(c: Container, gameId: string) {
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "QA database storage required");
  const family = await sourcePlacementReleaseOf(c.db, gameId);
  demand(family?.baseSceneVersion === 13 && family.familyId === "journey-detectives/v1" && family.coverage.length === 27
    && await leanReleaseOf(c.db, gameId), "Exact original Detective and lean pins required");
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true, scenes: { orderBy: { orderIndex: "asc" } }, orders: true } });
  const child = game.childProfile;
  demand(!game.deletedAt && game.styleVersion === "local-patch-world-v1" && game.searchLevel === "detectives" && game.packageTier === "ONE_WORLD"
    && child && !child.deletedAt && child.ownerId === game.ownerId && child.identityAssetId && child.avatarAssetId && child.ageYears !== null,
  "Live owned Detective world and canonical profile required");
  const boards = [...new Set(family.coverage.map(hide => hide.boardId))];
  demand(game.scenes.length === 9 && new Set(game.scenes.map(scene => scene.sceneSlug)).size === 9 && game.scenes.every((scene, i) => scene.sceneVersion === 13 && boards.includes(scene.sceneSlug) && scene.orderIndex === i), "All nine original Detective boards required");
  const orders = game.orders.filter(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt);
  demand(orders.length > 0 && !game.orders.some(o => o.refundedAt || o.paymentStatus === "REFUNDED"), "Verified nonrefunded owner payment required");
  const paymentSha256 = hash(orders.map(o => ({ id: o.id, userId: o.userId, amountAgorot: o.amountAgorot, paidAt: o.paidAt!.toISOString() })).sort((a, b) => a.id.localeCompare(b.id)));
  const enrollment = await subjectUpgradeOf(c.db, gameId), review = await identityGateReceiptOf(c.db, child.identityAssetId);
  demand(enrollment && !enrollment.identityRevision && enrollment.ownerId === game.ownerId && enrollment.identityAssetId === child.identityAssetId
    && review && identityReceiptReadyForPublication(review, 13) && enrollment.identitySha256 === review.sheetSha256
    && enrollment.photoAssetId === review.provenance.photoAssetId && enrollment.photoSha256 === review.provenance.photoSha256
    && enrollment.ageYears === child.ageYears && review.provenance.ageYears === child.ageYears
    && hash(review.provenance.crop) === hash(child.photoCropJson ? JSON.parse(child.photoCropJson) : null), "Strict original full-source identity binding required");
  const identity = await c.db.asset.findUniqueOrThrow({ where: { id: child.identityAssetId } });
  const avatar = await c.db.asset.findUniqueOrThrow({ where: { id: child.avatarAssetId } });
  demand([identity, avatar].every(a => a.ownerId === game.ownerId && a.status === "READY" && !a.deletedAt)
    && identity.type === "IDENTITY_SHEET" && identity.visibility === "PRIVATE" && avatar.type === "AVATAR" && avatar.visibility === "GAME",
  "Live original private identity and owned game avatar required");
  return { game, child, family, enrollment, review, identity, avatar, paymentSha256 };
}

async function sourceCurrent(c: Container, state: Awaited<ReturnType<typeof current>>, photoId: string) {
  if (state.child.originalPhotoAssetId === photoId) {
    const photo = await c.db.asset.findUnique({ where: { id: photoId } });
    return photo?.ownerId === state.game.ownerId && photo.status === "READY" && photo.visibility === "PRIVATE" && !photo.deletedAt;
  }
  // Ordinary successful publication purges the source. It does not revoke the historical world's ceiling.
  if (state.child.originalPhotoAssetId !== null || !isGameStatus(state.game.status) || !isPlayable(state.game.status) || !state.game.configJson) return false;
  const rows = await c.db.auditLog.findMany({ where: { actorType: "SYSTEM", actorId: null, action: "local-patch:photo-purged-after-approval",
    entityType: "Asset", entityId: state.identity.id }, select: { metaJson: true } });
  return rows.some(row => JSON.parse(row.metaJson ?? "null")?.photoAssetId === photoId);
}

async function receiptOf(c: { db: Pick<Prisma.TransactionClient, "auditLog"> }, gameId: string): Promise<DetectiveBudgetReceipt | null> {
  const row = await c.db.auditLog.findUnique({ where: { id: detectivesCompletionId(gameId) } });
  if (!row) return null;
  const pin = detectiveBudgetReceiptSchema.parse(JSON.parse(row.metaJson ?? "null"));
  const { authorizationSha256, ...body } = pin;
  demand(row.actorType === "ADMIN" && row.actorId === pin.operatorId && row.action === DETECTIVES_COMPLETION_ACTION
    && row.entityType === "Game" && row.entityId === gameId && pin.gameId === gameId && pin.worldId === worldOf(gameId)
    && pin.operatorId === pin.ownerId && row.metaJson === JSON.stringify(pin) && authorizationSha256 === hash(body), "Invalid or foreign capacity receipt");
  const { planSha256: _plan, operatorId: _operator, ownerAuthorizationSha256: _evidence, authorizedAt: _at, automaticRelease: _release, ...rawBinding } = body;
  const binding = detectiveBudgetBindingSchema.parse(rawBinding);
  demand(pin.planSha256 === hash(binding), "The authorized plan hash changed");
  return pin;
}

async function matches(c: Container, pin: DetectiveBudgetReceipt | DetectiveExtensionReceipt | DetectiveTailReceipt, state: Awaited<ReturnType<typeof current>>) {
  return state.game.ownerId === pin.ownerId && state.child.id === pin.childId && state.child.identityAssetId === pin.identityAssetId
    && state.child.avatarAssetId === pin.avatarAssetId && state.child.ageYears === pin.ageYears && state.paymentSha256 === pin.paymentSha256
    && hash(state.child.photoCropJson ? JSON.parse(state.child.photoCropJson) : null) === pin.cropSha256
    && hash(state.game.scenes.map(scene => ({ id: scene.id, slug: scene.sceneSlug, version: scene.sceneVersion, order: scene.orderIndex }))) === pin.scenesSha256
    && hash(state.family) === pin.familySha256 && hash(leanReleaseReceipt(pin.gameId)) === pin.leanPinSha256
    && hash(state.enrollment) === pin.enrollmentSha256 && hash(state.review) === pin.reviewSha256
    && state.review.sheetSha256 === pin.identitySha256 && state.enrollment.photoSha256 === pin.photoSha256
    && state.enrollment.photoAssetId === pin.photoAssetId && await sourceCurrent(c, state, pin.photoAssetId);
}

/** A separate ADMIN grant, ahead of the unchanged four-dollar SYSTEM pin. No other world or default receives capacity. */
export async function readDetectivesCompletionBudget(c: Container, worldId: string): Promise<BoardWizardBudgetGrant | null> {
  if (env().APP_ENV !== "qa" || c.storage.id !== "db" || !/^[A-Za-z0-9_-]{1,160}:board-wizard$/.test(worldId)) return null;
  const pin = await receiptOf(c, worldId.slice(0, -":board-wizard".length));
  if (!pin) return null;
  // Corrupt immutable authority throws. Live deletion/refund/source changes withdraw capacity.
  let state;
  try { state = await current(c, pin.gameId); } catch { return null; }
  if (!await matches(c, pin, state)) return null;
  const extension = await extensionReceiptOf(c, pin.gameId);
  if (extension && extension.previousAuthorizationSha256 === pin.authorizationSha256
    && await originalCompletionResumed(c, pin) && await matches(c, extension, state)) {
    const tail = await tailReceiptOf(c, pin.gameId);
    if (tail && tail.previousAuthorizationSha256 === extension.authorizationSha256 && await extensionResumed(c, extension) && await matches(c, tail, state))
      return { worldId, capMicroUsd: DETECTIVES_TAIL_CAP, authorizationSha256: tail.authorizationSha256 };
    return { worldId, capMicroUsd: DETECTIVES_EXTENSION_CAP, authorizationSha256: extension.authorizationSha256 };
  }
  return { worldId, capMicroUsd: DETECTIVES_COMPLETION_CAP, authorizationSha256: pin.authorizationSha256 };
}

async function verifyAssetsAndBill(c: Container, state: Awaited<ReturnType<typeof current>>, store: ReturnType<typeof PrismaWorldBudgetStore.forReadOnlyTransaction>) {
  const { child, identity, avatar, review } = state;
  demand(child.originalPhotoAssetId === state.enrollment.photoAssetId && await sourceCurrent(c, state, state.enrollment.photoAssetId), "Original live private source required");
  demand(sha256Bytes(await c.storage.get(identity.storagePath)) === review.sheetSha256, "Canonical identity pixels changed");
  const budget = boardWizardBudget(new CasWorldBudgetRepository(store)); // Read-only; cannot reserve or dispatch inside a transaction.
  await requireBoardWizardIdentityApproval(c, budget, { gameId: state.game.id, identityAssetId: identity.id, sheetSha256: review.sheetSha256,
    catalogSha256: review.provenance.style.catalogSha256, photoAssetId: child.originalPhotoAssetId, ageYears: state.enrollment.ageYears,
    crop: child.photoCropJson ? JSON.parse(child.photoCropJson) : null, contentVersion: 13 });
  return sha256Bytes(await c.storage.get(avatar.storagePath));
}

/** Read-only plan: all history and unknown reservations remain counted; no source, image, grant, job or charge is changed. */
export async function planDetectivesCompletionBudget(c: Container, gameId: string) {
  detectiveBudgetIdSchema.parse(gameId);
  demand(!await c.db.auditLog.findUnique({ where: { id: detectivesCompletionId(gameId) } }), "The single grant already exists");
  const state = await current(c, gameId), { game, child } = state;
  demand(game.status === "TARGETS_GENERATING" && !game.readyAt && !game.configJson && !await identityRevisionPending(c.db, gameId), "Only unfinished original-identity work may receive capacity");
  demand(await c.db.game.count({ where: { childProfileId: child.id, deletedAt: null, NOT: { id: gameId } } }) === 0, "Shared profile refused");
  const job = await c.db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
  demand(job.gameId === gameId && job.status === "FAILED" && job.currentStep === EXHAUSTED
    && (job.lastError ?? "").startsWith("local-patch: no automatic action remains within the authorized world budget;"), "Exact budget-exhausted hold required");
  demand(!(await backgroundReviewWaiting(c.db, gameId, { inFlightOnly: true })).size, "Existing provider work must settle first");
  const store = PrismaWorldBudgetStore.forReadOnlyTransaction(c.db);
  const stored = await store.read(worldOf(gameId));
  demand(stored && stored.revision <= WORLD_BUDGET_LEDGER_MAX_REVISION - 2, "Safe existing ledger revision required");
  const audit = applyBoardWizardBudgetCap(auditWorldBudget(stored.snapshot));
  demand(!audit.held && !audit.pendingRequestKeys.length && !audit.conflictRequestKeys.length && !audit.overrunRequestKeys.length
    && audit.committedMicroUsd <= 4_000_000 && audit.remainingMicroUsd < 200_000, "A genuine four-dollar capacity stop without unresolved accounting holds is required");
  const avatarSha256 = await verifyAssetsAndBill(c, state, store);
  const binding = detectiveBudgetBindingSchema.parse({ version: DETECTIVES_COMPLETION_BUDGET, gameId, worldId: worldOf(gameId), ownerId: game.ownerId, childId: child.id,
    baseCapMicroUsd: 4_000_000, capMicroUsd: DETECTIVES_COMPLETION_CAP, familySha256: hash(state.family), scenesSha256: hash(game.scenes.map(scene => ({ id: scene.id, slug: scene.sceneSlug, version: scene.sceneVersion, order: scene.orderIndex }))), leanPinSha256: hash(leanReleaseReceipt(gameId)),
    enrollmentSha256: hash(state.enrollment), reviewSha256: hash(state.review), identityAssetId: state.identity.id, identitySha256: state.review.sheetSha256,
    avatarAssetId: state.avatar.id, avatarSha256, photoAssetId: state.enrollment.photoAssetId, photoSha256: state.enrollment.photoSha256,
    ageYears: child.ageYears, cropSha256: hash(child.photoCropJson ? JSON.parse(child.photoCropJson) : null), paymentSha256: state.paymentSha256,
    jobId: job.id, holdSha256: parkedHoldSha256(job), jobAttempts: job.attempts, ledgerSha256: hash(stored.snapshot), ledgerRevision: stored.revision,
    committedMicroUsd: audit.committedMicroUsd, reservedMicroUsd: audit.reservedMicroUsd,
    retainedUnknowns: stored.snapshot.requests.filter(r => r.state === "unknown").map(r => ({ requestKey: r.requestKey, operationFingerprint: r.operationFingerprint, reserveMicroUsd: r.reserveMicroUsd })) });
  return { binding, planSha256: hash(binding), state, job, stored };
}

async function administrator(c: Container, operatorId: string) {
  const actor = await c.db.user.findUnique({ where: { id: operatorId }, select: { email: true } });
  demand(actor && (c.adminEmails ?? []).some(email => email.trim().toLowerCase() === actor.email.trim().toLowerCase()), "Verified administrator required");
}

/** The explicitly authorized owner ADMIN records one cumulative six-dollar ceiling. Does not release or reset the job. */
export async function authorizeDetectivesCompletionBudget(c: Container, input: { gameId: string; operatorId: string; expectedPlanSha256: string; ownerAuthorizationSha256: string }) {
  const gameId = detectiveBudgetIdSchema.parse(input.gameId), operatorId = detectiveBudgetIdSchema.parse(input.operatorId);
  const expected = detectiveBudgetHashSchema.parse(input.expectedPlanSha256), evidence = detectiveBudgetHashSchema.parse(input.ownerAuthorizationSha256);
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "QA database required");
  await administrator(c, operatorId);
  const old = await receiptOf(c, gameId);
  if (old) {
    demand(old.operatorId === operatorId && old.planSha256 === expected && old.ownerAuthorizationSha256 === evidence, "Existing authorization differs");
    demand(await readDetectivesCompletionBudget(c, worldOf(gameId)), "Existing capacity is no longer current");
    return old;
  }
  const plan = await planDetectivesCompletionBudget(c, gameId);
  demand(plan.planSha256 === expected && plan.binding.ownerId === operatorId, "Owner administrator or capacity plan changed");
  return c.db.$transaction(async tx => {
    const scoped = transactionContainer(c, tx), fresh = await planDetectivesCompletionBudget(scoped, gameId);
    await administrator(scoped, operatorId);
    demand(fresh.planSha256 === expected && fresh.binding.ownerId === operatorId, "Source, authority, hold or ledger changed");
    const locked = await tx.game.updateMany({ where: { id: gameId, updatedAt: fresh.state.game.updatedAt, status: "TARGETS_GENERATING", deletedAt: null,
      ownerId: operatorId, childProfileId: fresh.binding.childId }, data: { updatedAt: new Date() } });
    const ledger = await tx.worldBudgetLedger.updateMany({ where: { worldId: fresh.binding.worldId, revision: fresh.stored.revision }, data: { revision: { increment: 1 } } });
    demand(locked.count === 1 && ledger.count === 1, "Concurrent capacity plan changed");
    const body = detectiveBudgetReceiptBodySchema.parse({ ...fresh.binding, planSha256: expected, operatorId, ownerAuthorizationSha256: evidence,
      authorizedAt: new Date().toISOString(), automaticRelease: false });
    const pin = detectiveBudgetReceiptSchema.parse({ ...body, authorizationSha256: hash(body) });
    await tx.auditLog.create({ data: { id: detectivesCompletionId(gameId), actorType: "ADMIN", actorId: operatorId, action: DETECTIVES_COMPLETION_ACTION,
      entityType: "Game", entityId: gameId, metaJson: JSON.stringify(pin) } });
    // Original lean pin, ledger snapshot bytes, job, bills, image verdicts and unknowns are untouched.
    return pin;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

/** Normal scheduled/owner tick consumes exactly the authorized hold, once. No provider dispatch or image approval here. */
export async function resumeDetectivesCompletionBudget(c: Container, gameId: string): Promise<boolean> {
  const pin = await receiptOf(c, gameId);
  if (!pin || await c.db.auditLog.findUnique({ where: { id: detectivesCompletionResumeId(gameId) } })) return false;
  const job = await c.db.generationJob.findUnique({ where: { id: pin.jobId } });
  if (!job || job.status !== "FAILED" || job.currentStep !== EXHAUSTED || job.attempts !== pin.jobAttempts || parkedHoldSha256(job) !== pin.holdSha256) return false;
  return c.db.$transaction(async tx => {
    const scoped = transactionContainer(c, tx), state = await current(scoped, gameId);
    demand(await matches(scoped, pin, state) && state.game.status === "TARGETS_GENERATING" && !state.game.readyAt && !state.game.configJson
      && !await identityRevisionPending(tx, gameId), "Current paid source world required for resumption");
    const locked = await tx.game.updateMany({ where: { id: gameId, updatedAt: state.game.updatedAt, status: "TARGETS_GENERATING", deletedAt: null,
      ownerId: pin.ownerId, childProfileId: pin.childId }, data: { updatedAt: new Date() } });
    const store = PrismaWorldBudgetStore.forReadOnlyTransaction(tx), stored = await store.read(pin.worldId);
    demand(locked.count === 1 && stored && stored.revision === pin.ledgerRevision + 1 && hash(stored.snapshot) === pin.ledgerSha256
      && !auditWorldBudget(stored.snapshot, DETECTIVES_COMPLETION_CAP).held, "Authorized original ledger changed before wake");
    demand(await verifyAssetsAndBill(scoped, state, store) === pin.avatarSha256, "Original avatar pixels changed");
    const ledger = await tx.worldBudgetLedger.updateMany({ where: { worldId: pin.worldId, revision: stored.revision }, data: { revision: { increment: 1 } } });
    const resumed = await tx.generationJob.updateMany({ where: { id: pin.jobId, gameId, status: "FAILED", currentStep: EXHAUSTED,
      attempts: pin.jobAttempts, updatedAt: job.updatedAt, lastError: job.lastError }, data: { status: "QUEUED", currentStep: "local-patch", lastError: null } });
    demand(ledger.count === 1 && resumed.count === 1, "Authorized hold was concurrently changed or resumed");
    await tx.auditLog.create({ data: { id: detectivesCompletionResumeId(gameId), actorType: "SYSTEM", action: DETECTIVES_COMPLETION_RESUMED,
      entityType: "Game", entityId: gameId, metaJson: JSON.stringify({ version: DETECTIVES_COMPLETION_BUDGET, authorizationSha256: pin.authorizationSha256,
        holdSha256: pin.holdSha256, jobAttempts: pin.jobAttempts, requestsPreserved: true, attemptsReset: false, providerCallsAdded: 0 }) } });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

/** Do not let an unrelated, ungranted or stale exhausted world block another world's turn. */
export async function nextDetectivesCompletionWake(c: Container, gameId: string | null): Promise<string | null> {
  if (env().APP_ENV !== "qa" || c.storage.id !== "db") return null;
  const jobs = await c.db.generationJob.findMany({ where: { ...(gameId ? { gameId } : {}), status: "FAILED", currentStep: { in: [EXHAUSTED, "local-patch:needs-release"] },
    game: { status: "TARGETS_GENERATING", deletedAt: null, searchLevel: "detectives", styleVersion: "local-patch-world-v1" } },
    orderBy: { updatedAt: "asc" }, select: { gameId: true } });
  for (const job of jobs) if (await resumeDetectivesCompletionTail(c, job.gameId).catch(() => false)
    || await resumeDetectivesCompletionExtension(c, job.gameId).catch(() => false)
    || await resumeDetectivesCompletionBudget(c, job.gameId).catch(() => false)
    || await resumeDetectivesApplyingRepair(c, job.gameId).catch(() => false)
    || await resumeDetectivesLowEngineRecovery(c, job.gameId).catch(() => false)
    || await (await import('./source-body-repair')).resumeSourceBodyGeometryRepair(c,job.gameId).catch(()=>false)) return job.gameId;
  return null;
}

// A historical stale budget refusal may have parked AFTER saving a paid plan.
// This is not new capacity: one wake per immutable paid diagnosis, with all
// existing source, identity, payment, unknown-charge and publication gates intact.
export async function resumeDetectivesApplyingRepair(c: Container, gameId: string): Promise<boolean> {
  if (env().APP_ENV !== "qa" || c.storage.id !== "db") return false;
  const pin = await receiptOf(c, gameId);
  if (!pin) return false;
  return c.db.$transaction(async tx => {
    const initial = await tx.auditLog.findUnique({where:{id:detectivesCompletionResumeId(gameId)}});
    let initialMeta: {version?:unknown;authorizationSha256?:unknown;holdSha256?:unknown};
    try { initialMeta=JSON.parse(initial?.metaJson ?? "null"); } catch { return false; }
    if (!initial || initial.actorType!=="SYSTEM" || initial.action!==DETECTIVES_COMPLETION_RESUMED
      || initial.entityType!=="Game" || initial.entityId!==gameId || initialMeta?.version!==DETECTIVES_COMPLETION_BUDGET
      || initialMeta.authorizationSha256!==pin.authorizationSha256 || initialMeta.holdSha256!==pin.holdSha256) return false;
    const scoped = transactionContainer(c, tx), state = await current(scoped, gameId);
    if (!await matches(scoped, pin, state) || state.game.status !== "TARGETS_GENERATING"
      || state.game.readyAt || state.game.configJson || await identityRevisionPending(tx, gameId)) return false;
    const job = await tx.generationJob.findUnique({ where: { id: pin.jobId } });
    if (!job || job.status !== "FAILED" || job.currentStep !== EXHAUSTED || job.attempts <= pin.jobAttempts
      || !(job.lastError ?? "").startsWith("local-patch: no automatic action remains within the authorized world budget;")) return false;
    const store = PrismaWorldBudgetStore.forReadOnlyTransaction(tx), stored = await store.read(pin.worldId);
    if (!stored || stored.revision >= WORLD_BUDGET_LEDGER_MAX_REVISION) return false;
    const audit = applyBoardWizardBudgetCap(auditWorldBudget(stored.snapshot, DETECTIVES_COMPLETION_CAP), DETECTIVES_COMPLETION_CAP);
    if (audit.held || audit.pendingRequestKeys.length || audit.remainingMicroUsd < LOCAL_PATCH_RESERVE.renderMicroUsd) return false;
    const candidates = await tx.targetVariantAsset.findMany({ where: { status:"FAILED", provider:LOCAL_PATCH_PROVIDER, variant:LOCAL_PATCH_VARIANT,
      targetInstance: { gameScene: { gameId, sceneVersion:13 } } },
      include: { targetInstance: { select: { gameSceneId:true,targetId:true } } }, orderBy: { id:"asc" } });
    for (const row of candidates) {
      const repair = savedApplyingRepairOf(row.judgeJson);
      if (!repair || repair.decision!.action !== "redraw-with-new-placement" || !repair.authoredDiagnosis || !repair.authoredContext
        || !repair.subjectV2Cycles || repair.subjectV2Cycles > SUBJECT_V2_REPAIR_CYCLES) continue;
      const scene = state.game.scenes.find(s=>s.id===row.targetInstance.gameSceneId);
      const hide = scene && DETECTIVE_PATCH_BOARDS.find(b=>b.board===scene.sceneSlug)?.hides.find(h=>h.targetId===row.targetInstance.targetId);
      if (!hide) continue;
      const diagnosis = repair.authoredDiagnosis, key = `self-repair:${hide.id}:diagnosis:${repair.cycle}`;
      if (diagnosis.requestKey !== key || stored.snapshot.requests.some(r=>r.requestKey===`${hide.id}:${hide.pose}:self-repair:${repair.cycle}`)) continue;
      const bill = stored.snapshot.requests.find(r=>r.requestKey===key);
      if (!bill || bill.state!=="settled" || bill.scope!=="judge" || bill.conflicts.length || bill.operationFingerprint!==diagnosis.operationFingerprint) continue;
      const retained = await new PrismaRetainedPurchaseStore(tx).get(pin.worldId,key);
      if (!retained?.evidence || !sameChargeEvidence(retained.evidence,bill.evidence)
        || retained.operationFingerprint!==diagnosis.operationFingerprint) continue;
      let answer: {raw?:unknown;authoredRecoveryContext?:unknown};
      try { answer=JSON.parse(retained.bytes.toString()); } catch { continue; }
      if (typeof answer.raw!=="string" || sha256Bytes(Buffer.from(answer.raw))!==diagnosis.rawSha256
        || JSON.stringify(answer.authoredRecoveryContext)!==JSON.stringify(repair.authoredContext)) continue;
      let decision;
      try { decision=selfRepairDecisionSchema.parse(JSON.parse(answer.raw)); } catch { continue; }
      if (JSON.stringify(decision)!==JSON.stringify(repair.decision)) continue;
      const auditId="aud_dar_"+hash({gameId,grant:pin.authorizationSha256,rowId:row.id,diagnosis}).slice(0,40);
      if (await tx.auditLog.findUnique({where:{id:auditId}})) continue;
      demand(await verifyAssetsAndBill(scoped,state,store)===pin.avatarSha256,"Original avatar pixels changed before checkpoint wake");
      const locked=await tx.game.updateMany({where:{id:gameId,updatedAt:state.game.updatedAt,status:"TARGETS_GENERATING",deletedAt:null,
        ownerId:pin.ownerId,childProfileId:pin.childId},data:{updatedAt:new Date()}});
      demand(locked.count===1,"Paid source changed before checkpoint wake");
      const ledger=await tx.worldBudgetLedger.updateMany({where:{worldId:pin.worldId,revision:stored.revision},data:{revision:{increment:1}}});
      const queued=await tx.generationJob.updateMany({where:{id:job.id,status:"FAILED",currentStep:EXHAUSTED,attempts:job.attempts,
        updatedAt:job.updatedAt,lastError:job.lastError},data:{status:"QUEUED",currentStep:"local-patch",lastError:null}});
      demand(ledger.count===1&&queued.count===1,"Applying checkpoint or ledger changed concurrently");
      await tx.auditLog.create({data:{id:auditId,actorType:"SYSTEM",action:"generation:detectives-applying-repair-resumed",
        entityType:"Game",entityId:gameId,metaJson:JSON.stringify({version:"paid-applying-checkpoint-wake/v1",worldId:pin.worldId,
          grantSha256:pin.authorizationSha256,rowId:row.id,diagnosis,previousHoldSha256:parkedHoldSha256(job),previousJobAttempts:job.attempts,
          capMicroUsd:audit.capMicroUsd,remainingMicroUsd:audit.remainingMicroUsd,nextRenderReserveMicroUsd:LOCAL_PATCH_RESERVE.renderMicroUsd,
          ledgerSnapshotSha256:hash(stored.snapshot),checkpointSha256:hash(repair),providerCallsAdded:0,attemptsReset:false,budgetChanged:false})}});
      return true;
    }
    return false;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30_000});
}


async function originalCompletionResumed(c: { db: Pick<Prisma.TransactionClient, "auditLog"> }, pin: DetectiveBudgetReceipt) {
  const row = await c.db.auditLog.findUnique({ where: { id: detectivesCompletionResumeId(pin.gameId) } });
  let body: { version?: unknown; authorizationSha256?: unknown; holdSha256?: unknown } | null;
  try { body = JSON.parse(row?.metaJson ?? "null"); } catch { return false; }
  return !!row && row.actorType === "SYSTEM" && row.actorId === null && row.action === DETECTIVES_COMPLETION_RESUMED
    && row.entityType === "Game" && row.entityId === pin.gameId && body?.version === DETECTIVES_COMPLETION_BUDGET
    && body.authorizationSha256 === pin.authorizationSha256 && body.holdSha256 === pin.holdSha256;
}

async function extensionReceiptOf(c: { db: Pick<Prisma.TransactionClient, "auditLog"> }, gameId: string): Promise<DetectiveExtensionReceipt | null> {
  const row = await c.db.auditLog.findUnique({ where: { id: detectivesExtensionId(gameId) } });
  if (!row) return null;
  const pin = detectiveExtensionReceiptSchema.parse(JSON.parse(row.metaJson ?? "null"));
  const { authorizationSha256, ...body } = pin;
  demand(row.actorType === "ADMIN" && row.actorId === pin.operatorId && row.action === DETECTIVES_EXTENSION_ACTION
    && row.entityType === "Game" && row.entityId === gameId && pin.gameId === gameId && pin.worldId === worldOf(gameId)
    && pin.operatorId === pin.ownerId && row.metaJson === JSON.stringify(pin) && authorizationSha256 === hash(body), "Invalid or foreign extension receipt");
  const { planSha256: _plan, operatorId: _operator, ownerAuthorizationSha256: _evidence, authorizedAt: _at, automaticRelease: _release, ...binding } = body;
  demand(pin.planSha256 === hash(detectiveExtensionBindingSchema.parse(binding)), "The extension plan changed");
  return pin;
}

/** A fresh owner decision for a genuine second capacity stop. No default or past receipt changes. */
export async function planDetectivesCompletionExtension(c: Container, gameId: string) {
  detectiveBudgetIdSchema.parse(gameId);
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "QA database required");
  demand(!await c.db.auditLog.findUnique({ where: { id: detectivesExtensionId(gameId) } }), "The single extension already exists");
  const prior = await receiptOf(c, gameId), state = await current(c, gameId), { game, child } = state;
  demand(prior && await matches(c, prior, state) && await originalCompletionResumed(c, prior), "Original consumed six-dollar authorization required");
  demand(game.status === "TARGETS_GENERATING" && !game.readyAt && !game.configJson && !await identityRevisionPending(c.db, gameId), "Only unfinished original-identity work may receive an extension");
  demand(await c.db.game.count({ where: { childProfileId: child.id, deletedAt: null, NOT: { id: gameId } } }) === 0, "Shared profile refused");
  const job = await c.db.generationJob.findUniqueOrThrow({ where: { id: prior.jobId } });
  demand(job.gameId === gameId && job.status === "FAILED" && job.currentStep === EXHAUSTED && job.attempts > prior.jobAttempts
    && (job.lastError ?? "").startsWith("local-patch: no automatic action remains within the authorized world budget;"), "Exact second budget-exhausted hold required");
  demand(!(await backgroundReviewWaiting(c.db, gameId, { inFlightOnly: true })).size, "Existing provider work must settle first");
  const store = PrismaWorldBudgetStore.forReadOnlyTransaction(c.db), stored = await store.read(prior.worldId);
  demand(stored && stored.revision <= WORLD_BUDGET_LEDGER_MAX_REVISION - 2, "Safe existing ledger revision required");
  const audit = applyBoardWizardBudgetCap(auditWorldBudget(stored.snapshot, DETECTIVES_COMPLETION_CAP), DETECTIVES_COMPLETION_CAP);
  demand(!audit.held && !audit.pendingRequestKeys.length && !audit.conflictRequestKeys.length && !audit.overrunRequestKeys.length
    && audit.committedMicroUsd > 4_000_000 && audit.committedMicroUsd <= DETECTIVES_COMPLETION_CAP && audit.remainingMicroUsd < 200_000,
  "A genuine six-dollar capacity stop without unresolved accounting holds is required");
  const avatarSha256 = await verifyAssetsAndBill(c, state, store);
  demand(avatarSha256 === prior.avatarSha256, "Original avatar pixels changed");
  const { authorizationSha256: _authorization, planSha256: _plan, operatorId: _operator, ownerAuthorizationSha256: _evidence,
    authorizedAt: _at, automaticRelease: _release, ...originalBinding } = prior;
  const binding = detectiveExtensionBindingSchema.parse({ ...originalBinding, version: DETECTIVES_EXTENSION_BUDGET,
    baseCapMicroUsd: DETECTIVES_COMPLETION_CAP, capMicroUsd: DETECTIVES_EXTENSION_CAP, reviewMode: SINGLE_VISUAL_REVIEW_VERSION, previousAuthorizationSha256: prior.authorizationSha256,
    jobAttempts: job.attempts, holdSha256: parkedHoldSha256(job), ledgerRevision: stored.revision, ledgerSha256: hash(stored.snapshot),
    committedMicroUsd: audit.committedMicroUsd, reservedMicroUsd: audit.reservedMicroUsd,
    retainedUnknowns: stored.snapshot.requests.filter(r => r.state === "unknown").map(r => ({ requestKey: r.requestKey, operationFingerprint: r.operationFingerprint, reserveMicroUsd: r.reserveMicroUsd })) });
  return { binding, planSha256: hash(binding), state, job, stored };
}

export async function authorizeDetectivesCompletionExtension(c: Container, input: { gameId: string; operatorId: string; expectedPlanSha256: string; ownerAuthorizationSha256: string }) {
  const gameId = detectiveBudgetIdSchema.parse(input.gameId), operatorId = detectiveBudgetIdSchema.parse(input.operatorId);
  const expected = detectiveBudgetHashSchema.parse(input.expectedPlanSha256), evidence = detectiveBudgetHashSchema.parse(input.ownerAuthorizationSha256);
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "QA database required");
  await administrator(c, operatorId);
  const old = await extensionReceiptOf(c, gameId);
  if (old) {
    demand(old.operatorId === operatorId && old.planSha256 === expected && old.ownerAuthorizationSha256 === evidence, "Existing extension differs");
    const authority = await readDetectivesCompletionBudget(c, worldOf(gameId));
    const tail = await tailReceiptOf(c, gameId);
    demand(authority?.capMicroUsd === DETECTIVES_EXTENSION_CAP && authority.authorizationSha256 === old.authorizationSha256
      || authority?.capMicroUsd === DETECTIVES_TAIL_CAP && tail?.authorizationSha256 === authority.authorizationSha256 && tail.previousAuthorizationSha256 === old.authorizationSha256, "Existing extension is no longer current");
    return old;
  }
  const plan = await planDetectivesCompletionExtension(c, gameId);
  demand(plan.planSha256 === expected && plan.binding.ownerId === operatorId, "Owner administrator or extension plan changed");
  return c.db.$transaction(async tx => {
    const scoped = transactionContainer(c, tx), fresh = await planDetectivesCompletionExtension(scoped, gameId);
    await administrator(scoped, operatorId);
    demand(fresh.planSha256 === expected && fresh.binding.ownerId === operatorId, "Source, authority, hold or ledger changed");
    const locked = await tx.game.updateMany({ where: { id: gameId, updatedAt: fresh.state.game.updatedAt, status: "TARGETS_GENERATING", deletedAt: null,
      ownerId: operatorId, childProfileId: fresh.binding.childId }, data: { updatedAt: new Date() } });
    const ledger = await tx.worldBudgetLedger.updateMany({ where: { worldId: fresh.binding.worldId, revision: fresh.stored.revision }, data: { revision: { increment: 1 } } });
    demand(locked.count === 1 && ledger.count === 1, "Concurrent extension plan changed");
    const body = detectiveExtensionReceiptBodySchema.parse({ ...fresh.binding, planSha256: expected, operatorId, ownerAuthorizationSha256: evidence,
      authorizedAt: new Date().toISOString(), automaticRelease: false });
    const pin = detectiveExtensionReceiptSchema.parse({ ...body, authorizationSha256: hash(body) });
    await tx.auditLog.create({ data: { id: detectivesExtensionId(gameId), actorType: "ADMIN", actorId: operatorId, action: DETECTIVES_EXTENSION_ACTION,
      entityType: "Game", entityId: gameId, metaJson: JSON.stringify(pin) } });
    return pin;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

/** The normal queue consumes only the new authorization's exact retained hold, once. */
export async function resumeDetectivesCompletionExtension(c: Container, gameId: string): Promise<boolean> {
  if (env().APP_ENV !== "qa" || c.storage.id !== "db") return false;
  const pin = await extensionReceiptOf(c, gameId);
  if (!pin || await c.db.auditLog.findUnique({ where: { id: detectivesExtensionResumeId(gameId) } })) return false;
  const job = await c.db.generationJob.findUnique({ where: { id: pin.jobId } });
  if (!job || job.status !== "FAILED" || job.currentStep !== EXHAUSTED || job.attempts !== pin.jobAttempts || parkedHoldSha256(job) !== pin.holdSha256) return false;
  return c.db.$transaction(async tx => {
    const scoped = transactionContainer(c, tx), state = await current(scoped, gameId), prior = await receiptOf(scoped, gameId);
    demand(prior && prior.authorizationSha256 === pin.previousAuthorizationSha256 && await originalCompletionResumed(scoped, prior)
      && await matches(scoped, prior, state) && await matches(scoped, pin, state) && state.game.status === "TARGETS_GENERATING"
      && !state.game.readyAt && !state.game.configJson && !await identityRevisionPending(tx, gameId), "Current paid source world and previous authority required for extension wake");
    const locked = await tx.game.updateMany({ where: { id: gameId, updatedAt: state.game.updatedAt, status: "TARGETS_GENERATING", deletedAt: null,
      ownerId: pin.ownerId, childProfileId: pin.childId }, data: { updatedAt: new Date() } });
    const store = PrismaWorldBudgetStore.forReadOnlyTransaction(tx), stored = await store.read(pin.worldId);
    demand(locked.count === 1 && stored && stored.revision === pin.ledgerRevision + 1 && hash(stored.snapshot) === pin.ledgerSha256
      && !auditWorldBudget(stored.snapshot, DETECTIVES_EXTENSION_CAP).held, "Authorized extension ledger changed before wake");
    demand(await verifyAssetsAndBill(scoped, state, store) === pin.avatarSha256, "Original avatar pixels changed");
    const ledger = await tx.worldBudgetLedger.updateMany({ where: { worldId: pin.worldId, revision: stored.revision }, data: { revision: { increment: 1 } } });
    const resumed = await tx.generationJob.updateMany({ where: { id: pin.jobId, gameId, status: "FAILED", currentStep: EXHAUSTED,
      attempts: pin.jobAttempts, updatedAt: job.updatedAt, lastError: job.lastError }, data: { status: "QUEUED", currentStep: "local-patch", lastError: null } });
    demand(ledger.count === 1 && resumed.count === 1, "Extension hold was concurrently changed or resumed");
    await tx.auditLog.create({ data: { id: detectivesExtensionResumeId(gameId), actorType: "SYSTEM", action: DETECTIVES_EXTENSION_RESUMED,
      entityType: "Game", entityId: gameId, metaJson: JSON.stringify({ version: DETECTIVES_EXTENSION_BUDGET, authorizationSha256: pin.authorizationSha256,
        previousAuthorizationSha256: pin.previousAuthorizationSha256, holdSha256: pin.holdSha256, jobAttempts: pin.jobAttempts,
        requestsPreserved: true, attemptsReset: false, providerCallsAdded: 0 }) } });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}


/** Exact experimental authority, read without purchases. Publication separately verifies all source and verdict bindings. */
export async function detectivesSingleReviewAuthorization(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string) {
  if (env().APP_ENV !== 'qa') return null;
  const c = { db }, extension = await extensionReceiptOf(c, gameId), prior = await receiptOf(c, gameId);
  if (!extension || !prior || extension.previousAuthorizationSha256 !== prior.authorizationSha256 || !await originalCompletionResumed(c, prior)) return null;
  return extension;
}

/** One software-repair wake per exact release mode, without capacity or attempt changes. */
export async function resumeDetectivesLowEngineRecovery(c: Container, gameId: string): Promise<boolean> {
  if (env().APP_ENV !== "qa" || c.storage.id !== "db") return false;
  return c.db.$transaction(async tx => {
    const scoped = transactionContainer(c, tx), pin = await extensionReceiptOf(scoped, gameId), prior = await receiptOf(scoped, gameId);
    if (!pin || !prior || !await originalCompletionResumed(scoped, prior)) return false;
    const state = await current(scoped, gameId);
    if (!await matches(scoped, pin, state) || state.game.status !== "TARGETS_GENERATING" || state.game.readyAt || state.game.configJson
      || await identityRevisionPending(tx, gameId)) return false;
    const job = await tx.generationJob.findUnique({ where: { id: pin.jobId } });
    if (!job || job.status !== "FAILED" || job.attempts <= pin.jobAttempts) return false;
    const exhausted = job.currentStep === EXHAUSTED && (job.lastError ?? "").startsWith("local-patch: no automatic action remains within the authorized world budget;");
    const interrupted = job.currentStep === "local-patch:needs-release" && (job.lastError ?? "").startsWith("local-patch-continue-in-slice/v1:")
      && (job.lastError ?? "").endsWith("the interrupted questions cannot be rebuilt on the same pixels");
    if (!exhausted && !interrupted) return false;
    const store = PrismaWorldBudgetStore.forReadOnlyTransaction(tx), stored = await store.read(pin.worldId);
    if (!stored || stored.revision >= WORLD_BUDGET_LEDGER_MAX_REVISION) return false;
    const audit = auditWorldBudget(stored.snapshot, DETECTIVES_EXTENSION_CAP);
    if (audit.pendingRequestKeys.length || audit.conflictRequestKeys.length || audit.overrunRequestKeys.length || audit.overCapMicroUsd
      || (await backgroundReviewWaiting(tx, gameId, { inFlightOnly: true })).size) return false;
    const rows = await tx.targetVariantAsset.findMany({ where: { provider: LOCAL_PATCH_PROVIDER, variant: LOCAL_PATCH_VARIANT,
      targetInstance: { gameScene: { gameId, sceneVersion:13 } } } });
    const wakeId = (mode: string) => "aud_low_engine_" + hash({ gameId, grant: pin.authorizationSha256, mode }).slice(0,40);
    let retainedProof: object | null = null;
    // This mode can only resume the business adoption of an immutable answer
    // that has already settled. It authorizes no new opinion, charge or cap.
    if (exhausted && !audit.held && !await tx.auditLog.findUnique({ where: { id: wakeId("retained-low-answer/v1") } })) {
      const retainedStore = new PrismaRetainedPurchaseStore(tx);
      for (const approval of stored.snapshot.unknownContinuationApprovals ?? []) {
        if (approval.version !== "world-automatic-review-recovery/v5" || approval.grantSha256 !== pin.authorizationSha256
          || !await singleLowContinuationPublishable(tx, gameId, approval)) continue;
        const row = rows.find(r => r.id === approval.variantId);
        let r; try { r = JSON.parse(row?.judgeJson ?? "null"); } catch { continue; }
        if (!row || row.status !== "FAILED" || !row.assetId || !row.lastError?.startsWith("quality-unresolved:")
          || r?.reviewState !== "board-review-complete" || r.verdict !== null || !r.wireFault
          || r.judgedSha256 !== approval.imageSha256 || r.boardReview?.requestKey !== approval.requestKey
          || r.reviewInterruption?.recoveryId !== approval.approvalId || r.reviewInterruption?.assetId !== row.assetId
          || r.reviewInterruption?.single !== SINGLE_VISUAL_REVIEW_VERSION
          || !Array.isArray(r.evidenceAttempts) || r.evidenceAttempts.filter((a: {single?:unknown;imageSha256?:unknown}) =>
            a.single === SINGLE_VISUAL_REVIEW_VERSION && a.imageSha256 === approval.imageSha256).length !== 1) continue;
        const unknown = stored.snapshot.requests.find(q => q.requestKey === approval.requestKey);
        const old = await backgroundRoundOfKey(tx, gameId, pin.worldId, approval.requestKey);
        if (!unknown || unknown.state !== "unknown" || unknown.operationFingerprint !== approval.operationFingerprint
          || unknown.reserveMicroUsd !== approval.reserveMicroUsd || !old || !isSingleLowReviewPolicy({ version: old.intent.policyVersion ?? "" })
          || old.intent.binding.variantId !== row.id || old.intent.binding.imageSha256 !== approval.imageSha256
          || old.intent.binding.identitySha256 !== pin.identitySha256 || old.intent.binding.geometrySha256 !== localPatchPublicationGeometryHash(row)) continue;
        const binding = old.intent.binding;
        let authored: string | undefined;
        try { authored = authoredLocalPatchReviewBinding({ hideId:binding.hideId,imageSha256:binding.imageSha256,
          geometrySha256:binding.geometrySha256,identitySha256:binding.identitySha256,authoredReturn:r.authoredReturn,
          ...(r.authoredRecovery ? { authoredRecovery:r.authoredRecovery } : {}) }); } catch { continue; }
        if (!authored || authored !== binding.authoredReviewBinding) continue;
        const asset = await tx.asset.findUnique({ where: { id: row.assetId } });
        if (!asset || asset.ownerId !== pin.ownerId || asset.type !== "TARGET_SPRITE" || asset.visibility !== "GAME" || asset.status !== "READY") continue;
        try { if (sha256Bytes(await scoped.storage.get(asset.storagePath)) !== binding.imageSha256) continue; } catch { continue; }
        for (const imageRound of await backgroundRoundsOnImage(tx, gameId, binding)) {
          if (imageRound.requestKey === approval.requestKey || imageRound.tier !== "default" || !roundAnswered(imageRound)) continue;
          const request = stored.snapshot.requests.find(q => q.requestKey === imageRound.requestKey);
          const round = await backgroundRoundOfKey(tx, gameId, pin.worldId, imageRound.requestKey);
          if (!request || request.state !== "settled" || request.scope !== "judge" || !round
            || request.operationFingerprint !== round.intent.fingerprint || request.reserveMicroUsd !== round.intent.reserveMicroUsd) continue;
          const policy = backgroundPolicyOfIntent(round.intent);
          if (!isSingleLowReviewPolicy(policy) || policy.serviceTier !== "default") continue;
          const kept = await retainedStore.get(pin.worldId, request.requestKey);
          if (!kept || !kept.evidence || kept.scope !== "judge" || kept.operationFingerprint !== request.operationFingerprint
            || !sameChargeEvidence(kept.evidence, request.evidence)) continue;
          let wire; try { wire=JSON.parse(kept.bytes.toString()); } catch { continue; }
          if (!wire || wire.model !== policy.model || wire.finishReason !== "stop" || wire.wireFault !== null || wire.costUnknown !== false
            || wire.providerStatus !== "completed" || wire.fingerprint !== request.operationFingerprint
            || wire.authoredReviewBinding !== binding.authoredReviewBinding || !readSingleVisualReview(wire.raw)
            || !wire.policy || Array.isArray(wire.policy) || Object.keys(wire.policy).length !== Object.keys(policy).length
            || !Object.entries(policy).every(([key,value]) => wire.policy[key] === value)) continue;
          retainedProof = { variantId:row.id,imageSha256:binding.imageSha256,geometrySha256:binding.geometrySha256,
            originalRequestKey:approval.requestKey,requestKey:request.requestKey,fingerprint:request.operationFingerprint,
            retainedPayloadSha256:kept.payloadSha256,continuationAuthorizationSha256:approval.authorizationSha256 };
          break;
        }
        if (retainedProof) break;
      }
    }
    const mode = retainedProof ? "retained-low-answer/v1" : interrupted ? "single-low-transport/v1" : "guided-frame/v1", id = wakeId(mode);
    if (await tx.auditLog.findUnique({ where: { id } })) return false;
    let proof: object;
    if (retainedProof) proof = retainedProof;
    else if (exhausted) {
      const candidate = rows.find(guidedFrameCandidate);
      if (!candidate || audit.held || audit.remainingMicroUsd < GUIDED_FRAME_MIN_CAPACITY_MICRO_USD) return false;
      proof = { variantId: candidate.id, candidateSha256: hash(candidate.judgeJson) };
    } else {
      const newlyUnknown = stored.snapshot.requests.filter(r => r.state === "unknown" && !pin.retainedUnknowns.some(old => old.requestKey === r.requestKey));
      if (newlyUnknown.length !== 1) return false;
      const request = newlyUnknown[0]!, round = await backgroundRoundOfKey(tx, gameId, pin.worldId, request.requestKey);
      const retained = await new PrismaRetainedPurchaseStore(tx).get(pin.worldId, request.requestKey);
      if (!round || !providerEndedFailed(round) || !isSingleLowReviewPolicy({ version: round.intent.policyVersion ?? "" })
        || round.intent.reserveMicroUsd !== request.reserveMicroUsd || round.intent.fingerprint !== request.operationFingerprint
        || !retained || retained.evidence || !await admittedInterruption(scoped, gameId, pin.worldId, request.requestKey, retained)
        || await providerFailureRefusal(scoped, gameId, pin.worldId, request.requestKey)) return false;
      const row = rows.find(r => r.id === round.intent.binding.variantId), receipt = row && JSON.parse(row.judgeJson ?? "null");
      if (!row || receipt?.judgedSha256 !== round.intent.binding.imageSha256 || row.status !== "GENERATED"
        || receipt.reviewState !== "pending-board-review") return false;
      proof = { requestKey: request.requestKey, fingerprint: request.operationFingerprint, imageSha256: round.intent.binding.imageSha256 };
    }
    demand(await verifyAssetsAndBill(scoped, state, store) === pin.avatarSha256, "Original pixels changed before LOW engine wake");
    const locked = await tx.game.updateMany({ where: { id:gameId, updatedAt:state.game.updatedAt, status:"TARGETS_GENERATING", deletedAt:null,
      ownerId:pin.ownerId,childProfileId:pin.childId }, data:{updatedAt:new Date()} });
    const ledger = await tx.worldBudgetLedger.updateMany({where:{worldId:pin.worldId,revision:stored.revision},data:{revision:{increment:1}}});
    const queued = await tx.generationJob.updateMany({where:{id:job.id,status:"FAILED",currentStep:job.currentStep,attempts:job.attempts,
      updatedAt:job.updatedAt,lastError:job.lastError},data:{status:"QUEUED",currentStep:"local-patch",lastError:null}});
    demand(locked.count===1 && ledger.count===1 && queued.count===1,"LOW recovery hold changed concurrently");
    await tx.auditLog.create({data:{id,actorType:"SYSTEM",action:"generation:detectives-low-engine-resumed",entityType:"Game",entityId:gameId,
      metaJson:JSON.stringify({version:retainedProof?"detectives-low-engine-wake/v2":"detectives-low-engine-wake/v1",mode,grantSha256:pin.authorizationSha256,
        holdSha256:parkedHoldSha256(job),proof,ledgerSha256:hash(stored.snapshot),attemptsReset:false,providerCallsAdded:0,budgetChanged:false})}});
    return true;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30_000});
}

export async function singleLowContinuationPublishable(db: Pick<Prisma.TransactionClient,"auditLog">, gameId: string, approval: WorldAutomaticReviewRecoveryV5): Promise<boolean> {
  const grant = await (await import("./single-low-policy")).singleLowReviewAuthorization(db, gameId);
  if (!grant || approval.worldId !== worldOf(gameId) || approval.grantSha256 !== grant.authorizationSha256) return false;
  const row = await db.auditLog.findUnique({where:{id:approval.approvalId}});
  let proof: Record<string,unknown>; try { proof=JSON.parse(row?.metaJson ?? "null"); } catch { return false; }
  return !!row && row.actorType === "SYSTEM" && row.actorId === null && row.action === "single-sol-low-transport-recovery/v1"
    && row.entityType === "Game" && row.entityId === gameId && proof?.single === SINGLE_VISUAL_REVIEW_VERSION
    && proof.grantSha256 === grant.authorizationSha256 && proof.variantId === approval.variantId && proof.imageSha256 === approval.imageSha256
    && proof.requestKey === approval.requestKey && proof.operationFingerprint === approval.operationFingerprint
    && typeof proof.retainedPayloadSha256 === "string" && /^[a-f0-9]{64}$/.test(proof.retainedPayloadSha256) && sha256Bytes(Buffer.from(JSON.stringify(proof))) === approval.authorizationSha256;
}

async function extensionResumed(c: {db:Pick<Prisma.TransactionClient,"auditLog">}, pin:DetectiveExtensionReceipt) {
  const row=await c.db.auditLog.findUnique({where:{id:detectivesExtensionResumeId(pin.gameId)}});
  let value; try {value=JSON.parse(row?.metaJson??"null");}catch{return false;}
  return !!row && row.actorType==="SYSTEM" && row.actorId===null && row.action===DETECTIVES_EXTENSION_RESUMED
    && row.entityType==="Game" && row.entityId===pin.gameId && value?.version===DETECTIVES_EXTENSION_BUDGET
    && value.authorizationSha256===pin.authorizationSha256 && value.holdSha256===pin.holdSha256;
}
async function tailReceiptOf(c:{db:Pick<Prisma.TransactionClient,"auditLog">},gameId:string):Promise<DetectiveTailReceipt|null> {
  const row=await c.db.auditLog.findUnique({where:{id:detectivesTailId(gameId)}}); if(!row)return null;
  const pin=detectiveTailReceiptSchema.parse(JSON.parse(row.metaJson??"null")),{authorizationSha256,...body}=pin;
  demand(row.actorType==="ADMIN" && row.actorId===pin.operatorId && row.action===DETECTIVES_TAIL_ACTION
    && row.entityType==="Game" && row.entityId===gameId && pin.gameId===gameId && pin.worldId===worldOf(gameId)
    && pin.operatorId===pin.ownerId && row.metaJson===JSON.stringify(pin) && authorizationSha256===hash(body),"Invalid or foreign finite-tail receipt");
  const {planSha256:_plan,operatorId:_operator,ownerAuthorizationSha256:_evidence,authorizedAt:_at,automaticRelease:_release,...binding}=body;
  demand(pin.planSha256===hash(detectiveTailBindingSchema.parse(binding)) && new Set(pin.tailRows.map(r=>r.rowId)).size===pin.tailRows.length
    && pin.tailRows.every(r=>r.mode==="guided-third" ? r.originalAttempts===2 && r.maxAttempt===3 && r.retainedRenderSha256===null
      : r.originalAttempts===3 && r.maxAttempt===4 && !!r.retainedRenderSha256),"Invalid finite-tail plan"); return pin;
}
const tailRowsOf=(c:Container,gameId:string)=>c.db.targetVariantAsset.findMany({where:{provider:LOCAL_PATCH_PROVIDER,variant:LOCAL_PATCH_VARIANT,
  targetInstance:{gameScene:{gameId,sceneVersion:13}}},orderBy:{id:"asc"},include:{targetInstance:{select:{targetId:true,gameSceneId:true}}}});
const tailRowInvariant=(row:Awaited<ReturnType<typeof tailRowsOf>>[number])=>hash(Object.fromEntries(Object.entries(row).filter(([k])=>!["attempts","status","lastError","updatedAt","judgeJson"].includes(k))));
const tailRowHash=(row:Awaited<ReturnType<typeof tailRowsOf>>[number])=>hash(row);
/** READ only. Each remaining appearance has one prospective painting, and one combined LOW assessment. */
export async function planDetectivesCompletionTail(c:Container,gameId:string) {
  detectiveBudgetIdSchema.parse(gameId); demand(!await tailReceiptOf(c,gameId),"The single finite-tail extension already exists");
  const prior=await extensionReceiptOf(c,gameId),original=await receiptOf(c,gameId),state=await current(c,gameId),{game,child}=state;
  demand(prior && original && prior.previousAuthorizationSha256===original.authorizationSha256 && await originalCompletionResumed(c,original)
    && await extensionResumed(c,prior) && await matches(c,prior,state),"Original consumed eight-dollar authorization required");
  demand(game.status==="TARGETS_GENERATING" && !game.readyAt && !game.configJson && !await identityRevisionPending(c.db,gameId),"Only unfinished original-identity work may receive a tail");
  demand(await c.db.game.count({where:{childProfileId:child.id,deletedAt:null,NOT:{id:gameId}}})===0,"Shared profile refused");
  const job=await c.db.generationJob.findUniqueOrThrow({where:{id:prior.jobId}});
  demand(job.gameId===gameId && job.status==="FAILED" && job.currentStep===EXHAUSTED && job.attempts>prior.jobAttempts
    && (job.lastError??"").startsWith("local-patch: no automatic action remains within the authorized world budget;"),"Exact eight-dollar exhausted hold required");
  demand(!(await backgroundReviewWaiting(c.db,gameId,{inFlightOnly:true})).size,"Existing provider work must settle first");
  const store=PrismaWorldBudgetStore.forReadOnlyTransaction(c.db),stored=await store.read(prior.worldId);
  demand(stored && stored.revision<=WORLD_BUDGET_LEDGER_MAX_REVISION-2,"Safe existing ledger revision required");
  const audit=auditWorldBudget(stored.snapshot,DETECTIVES_EXTENSION_CAP);
  demand(!audit.held && !audit.pendingRequestKeys.length && !audit.conflictRequestKeys.length && !audit.overrunRequestKeys.length
    && audit.committedMicroUsd>DETECTIVES_COMPLETION_CAP && audit.remainingMicroUsd<GUIDED_FRAME_MIN_CAPACITY_MICRO_USD,"Genuine eight-dollar capacity stop required");
  const rows=await tailRowsOf(c,gameId),pending=rows.filter(r=>r.status!=="GENERATED");
  demand(rows.length===27 && pending.length>=1 && pending.length<=4 && rows.filter(r=>r.status==="GENERATED").every(r=>{
    try {const j=JSON.parse(r.judgeJson??"null");return j?.reviewState==="board-review-complete" && j.verdict?.verdict==="pass" && j.wireFault===null;}catch{return false;}
  }),"All27 appearances and at most four diagnosed remaining failures required");
  const tailRows=[], placement=await resolveLocalPatchBoardsForGame(c.db,gameId,13);
  for(const row of pending) {
    const scene=game.scenes.find(s=>s.id===row.targetInstance.gameSceneId),hide=scene && DETECTIVE_PATCH_BOARDS.find(b=>b.board===scene.sceneSlug)?.hides.find(h=>h.targetId===row.targetInstance.targetId);
    demand(hide,"Exact authored tail hide required");
    if(guidedFrameCandidate(row) && row.status==="FAILED") {tailRows.push({rowId:row.id,hideId:hide.id,rowSha256:tailRowHash(row),rowInvariantSha256:tailRowInvariant(row),originalAttempts:2,maxAttempt:3,mode:"guided-third",retainedRenderSha256:null});continue;}
    const j=JSON.parse(row.judgeJson??"null");
    demand(nativeMaskTailCandidate(row),
      "A native-mask alternative needs the actual exhausted, stationary return-boundary failure");
    const source=sourcePlacementForHide(placement,hide.id);
    demand(source?.sourceNeighbors && j.authoredReturn?.sourcePlacement?.manifestSha256===placement.manifestSha256, "Exact source-head placement required before finite native-mask grant");
    nativeMaskTailEditRegion(j.authoredReturn.child,j.authoredReturn.local,source.sourceNeighbors.contract.neighbors.map(n=>({
      ...n.head,left:n.head.left-j.authoredReturn.crop.left,top:n.head.top-j.authoredReturn.crop.top })));
    const key=hide.id+":"+hide.pose+":render:3",bill=stored.snapshot.requests.find(r=>r.requestKey===key),retained=await new PrismaRetainedPurchaseStore(c.db).get(prior.worldId,key);
    demand(bill?.state==="settled" && bill.scope==="image" && !bill.conflicts.length && retained?.evidence && retained.scope==="image" && retained.operationFingerprint===bill.operationFingerprint
      && retained.unknownReason===null && sameChargeEvidence(retained.evidence,bill.evidence),"Exact settled third painting required for native-mask diagnosis");
    const result=JSON.parse(retained.bytes.toString());
    demand(result.version==="local-patch-render/v1" && result.rejected===null && typeof result.bytesBase64==="string"
      && JSON.stringify(result.authoredReturn)===JSON.stringify(j.authoredReturn),"Original third painting source/window binding changed");
    tailRows.push({rowId:row.id,hideId:hide.id,rowSha256:tailRowHash(row),rowInvariantSha256:tailRowInvariant(row),originalAttempts:3,maxAttempt:4,mode:"native-mask-fourth",retainedRenderSha256:retained.payloadSha256});
  }
  const avatarSha256=await verifyAssetsAndBill(c,state,store);demand(avatarSha256===prior.avatarSha256,"Original avatar pixels changed");
  const {authorizationSha256:_authorization,planSha256:_plan,operatorId:_operator,ownerAuthorizationSha256:_evidence,authorizedAt:_at,automaticRelease:_release,...oldBinding}=prior;
  const binding=detectiveTailBindingSchema.parse({...oldBinding,version:DETECTIVES_TAIL_BUDGET,baseCapMicroUsd:DETECTIVES_EXTENSION_CAP,capMicroUsd:DETECTIVES_TAIL_CAP,
    previousAuthorizationSha256:prior.authorizationSha256,jobAttempts:job.attempts,holdSha256:parkedHoldSha256(job),ledgerRevision:stored.revision,ledgerSha256:hash(stored.snapshot),
    committedMicroUsd:audit.committedMicroUsd,reservedMicroUsd:audit.reservedMicroUsd,allRowsSha256:hash(rows),tailRows,
    retainedUnknowns:stored.snapshot.requests.filter(r=>r.state==="unknown").map(r=>({requestKey:r.requestKey,operationFingerprint:r.operationFingerprint,reserveMicroUsd:r.reserveMicroUsd}))});
  return {binding,planSha256:hash(binding),state,job,stored};
}
export async function authorizeDetectivesCompletionTail(c:Container,input:{gameId:string;operatorId:string;expectedPlanSha256:string;ownerAuthorizationSha256:string}) {
  const gameId=detectiveBudgetIdSchema.parse(input.gameId),operatorId=detectiveBudgetIdSchema.parse(input.operatorId),expected=detectiveBudgetHashSchema.parse(input.expectedPlanSha256),evidence=detectiveBudgetHashSchema.parse(input.ownerAuthorizationSha256);
  demand(env().APP_ENV==="qa" && c.storage.id==="db","QA database required");await administrator(c,operatorId);
  const old=await tailReceiptOf(c,gameId);
  if(old){demand(old.operatorId===operatorId && old.planSha256===expected && old.ownerAuthorizationSha256===evidence,"Existing finite-tail authorization differs");
    const authority=await readDetectivesCompletionBudget(c,worldOf(gameId));demand(authority?.capMicroUsd===DETECTIVES_TAIL_CAP && authority.authorizationSha256===old.authorizationSha256,"Finite-tail authority is no longer current");return old;}
  const plan=await planDetectivesCompletionTail(c,gameId);demand(plan.planSha256===expected && plan.binding.ownerId===operatorId,"Owner administrator or finite-tail plan changed");
  return c.db.$transaction(async tx=>{const scoped=transactionContainer(c,tx),fresh=await planDetectivesCompletionTail(scoped,gameId);await administrator(scoped,operatorId);
    demand(fresh.planSha256===expected && fresh.binding.ownerId===operatorId,"Source, tail rows, hold or ledger changed");
    const locked=await tx.game.updateMany({where:{id:gameId,updatedAt:fresh.state.game.updatedAt,status:"TARGETS_GENERATING",deletedAt:null,ownerId:operatorId,childProfileId:fresh.binding.childId},data:{updatedAt:new Date()}});
    const ledger=await tx.worldBudgetLedger.updateMany({where:{worldId:fresh.binding.worldId,revision:fresh.stored.revision},data:{revision:{increment:1}}});demand(locked.count===1 && ledger.count===1,"Concurrent finite-tail plan changed");
    const body=detectiveTailReceiptBodySchema.parse({...fresh.binding,planSha256:expected,operatorId,ownerAuthorizationSha256:evidence,authorizedAt:new Date().toISOString(),automaticRelease:false});
    const pin=detectiveTailReceiptSchema.parse({...body,authorizationSha256:hash(body)});
    await tx.auditLog.create({data:{id:detectivesTailId(gameId),actorType:"ADMIN",actorId:operatorId,action:DETECTIVES_TAIL_ACTION,entityType:"Game",entityId:gameId,metaJson:JSON.stringify(pin)}});return pin;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30_000});
}
export async function resumeDetectivesCompletionTail(c:Container,gameId:string):Promise<boolean> {
  if(env().APP_ENV!=="qa" || c.storage.id!=="db")return false;
  const pin=await tailReceiptOf(c,gameId);if(!pin || await c.db.auditLog.findUnique({where:{id:detectivesTailResumeId(gameId)}}))return false;
  const job=await c.db.generationJob.findUnique({where:{id:pin.jobId}});if(!job || job.status!=="FAILED" || job.currentStep!==EXHAUSTED || job.attempts!==pin.jobAttempts || parkedHoldSha256(job)!==pin.holdSha256)return false;
  return c.db.$transaction(async tx=>{const scoped=transactionContainer(c,tx),state=await current(scoped,gameId),prior=await extensionReceiptOf(scoped,gameId);
    demand(prior && prior.authorizationSha256===pin.previousAuthorizationSha256 && await extensionResumed(scoped,prior) && await matches(scoped,pin,state)
      && state.game.status==="TARGETS_GENERATING" && !state.game.readyAt && !state.game.configJson && !await identityRevisionPending(tx,gameId),"Current paid source and prior extension required");
    demand(hash(await tailRowsOf(scoped,gameId))===pin.allRowsSha256,"Authorized finite-tail rows changed before wake");
    const locked=await tx.game.updateMany({where:{id:gameId,updatedAt:state.game.updatedAt,status:"TARGETS_GENERATING",deletedAt:null,ownerId:pin.ownerId,childProfileId:pin.childId},data:{updatedAt:new Date()}});
    const store=PrismaWorldBudgetStore.forReadOnlyTransaction(tx),stored=await store.read(pin.worldId);
    demand(locked.count===1 && stored && stored.revision===pin.ledgerRevision+1 && hash(stored.snapshot)===pin.ledgerSha256 && !auditWorldBudget(stored.snapshot,DETECTIVES_TAIL_CAP).held,"Authorized finite-tail ledger changed before wake");
    demand(await verifyAssetsAndBill(scoped,state,store)===pin.avatarSha256,"Original avatar pixels changed");
    const ledger=await tx.worldBudgetLedger.updateMany({where:{worldId:pin.worldId,revision:stored.revision},data:{revision:{increment:1}}});
    const resumed=await tx.generationJob.updateMany({where:{id:pin.jobId,gameId,status:"FAILED",currentStep:EXHAUSTED,attempts:pin.jobAttempts,updatedAt:job.updatedAt,lastError:job.lastError},data:{status:"QUEUED",currentStep:"local-patch",lastError:null}});
    demand(ledger.count===1 && resumed.count===1,"Finite-tail hold changed concurrently");
    await tx.auditLog.create({data:{id:detectivesTailResumeId(gameId),actorType:"SYSTEM",action:DETECTIVES_TAIL_RESUMED,entityType:"Game",entityId:gameId,metaJson:JSON.stringify({version:DETECTIVES_TAIL_BUDGET,authorizationSha256:pin.authorizationSha256,previousAuthorizationSha256:pin.previousAuthorizationSha256,holdSha256:pin.holdSha256,jobAttempts:pin.jobAttempts,requestsPreserved:true,attemptsReset:false,providerCallsAdded:0})}});return true;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30_000});
}
/** The LOW experiment keeps its original eight-dollar identity. A later capacity receipt cannot rebind old answers. */
export async function hasDetectivesLowCapacity(c:Container,gameId:string) {
  const grant=await detectivesSingleReviewAuthorization(c.db,gameId),authority=await readDetectivesCompletionBudget(c,worldOf(gameId));
  if(!grant || !authority)return false;
  if(authority.capMicroUsd===DETECTIVES_EXTENSION_CAP)return authority.authorizationSha256===grant.authorizationSha256;
  const tail=await tailReceiptOf(c,gameId);return authority.capMicroUsd===DETECTIVES_TAIL_CAP && tail?.authorizationSha256===authority.authorizationSha256 && tail.previousAuthorizationSha256===grant.authorizationSha256;
}
export async function detectivesNativeMaskTail(c:Container,gameId:string,rowId:string) {
  const pin=await tailReceiptOf(c,gameId);if(!pin || !await hasDetectivesLowCapacity(c,gameId) || !await c.db.auditLog.findUnique({where:{id:detectivesTailResumeId(gameId)}}))return null;
  const selected=pin.tailRows.find(r=>r.rowId===rowId && r.mode==="native-mask-fourth");return selected?{pin,selected}:null;
}

/** This renderer allowance cannot outlive its exact finite-tail row and consumed grant. */
export async function requireDetectivesNativeMaskTail(c:Container,gameId:string,rowId:string) {
  const tail=await detectivesNativeMaskTail(c,gameId,rowId);demand(tail,"No native-mask finite-tail authority");
  const row=(await tailRowsOf(c,gameId)).find(r=>r.id===rowId);demand(row && nativeMaskTailCandidate(row),"No current diagnosed native-mask candidate");
  const expected=nativeMaskTailMarkerSchema.parse({version:"single-low-native-mask-tail/v1",authorizationSha256:tail.pin.authorizationSha256,
    previousAuthorizationSha256:tail.pin.previousAuthorizationSha256,rowId,sourceRowSha256:tail.selected.rowSha256,
    retainedRenderSha256:tail.selected.retainedRenderSha256,originalAttempts:3,authorizedAttempt:4});
  demand(row.status==="FAILED" ? tailRowHash(row)===tail.selected.rowSha256 : tailRowInvariant(row)===tail.selected.rowInvariantSha256
    && JSON.stringify(nativeMaskTailMarker(row))===JSON.stringify(expected),"Finite-tail pixels, geometry or checkpoint changed");
  return expected;
}

/** Capacity proof for the prospective fourth painting, in addition to all ordinary visual/source publication checks. */
export async function nativeMaskTailPublicationAuthorized(db:Pick<Prisma.TransactionClient,"auditLog">,input:{gameId:string;variantId:string;hideId:string;attempts:number;sceneVersion:number;judgeJson:string|null}) {
  try {
    const value=JSON.parse(input.judgeJson??"null"),marker=nativeMaskTailMarker({judgeJson:input.judgeJson});
    if(value?.sourceBodyBirth!==undefined)return (await import("./detectives-operational-policy")).sourceBodyBirthPublicationAuthorized(db,input);
    if(value?.sourceBodyRepair!==undefined)return (await import('./source-body-repair-pin')).sourceBodyPublicationAuthorized(db,input);
    if(input.sceneVersion!==13)return value?.nativeMaskTail===undefined;
    if(input.attempts<=3 && value?.nativeMaskTail===undefined)return true;
    if(input.sceneVersion!==13 || input.attempts!==4 || !marker)return false;
    const pin=await tailReceiptOf({db},input.gameId),base=await detectivesSingleReviewAuthorization(db,input.gameId);
    if(!pin || !base || pin.previousAuthorizationSha256!==base.authorizationSha256 || marker.authorizationSha256!==pin.authorizationSha256
      || marker.previousAuthorizationSha256!==base.authorizationSha256 || marker.rowId!==input.variantId)return false;
    const row=pin.tailRows.find(r=>r.rowId===input.variantId && r.hideId===input.hideId && r.mode==="native-mask-fourth");
    if(!row || row.rowSha256!==marker.sourceRowSha256 || row.retainedRenderSha256!==marker.retainedRenderSha256)return false;
    const wake=await db.auditLog.findUnique({where:{id:detectivesTailResumeId(input.gameId)}});let proof;try{proof=JSON.parse(wake?.metaJson??"null");}catch{return false;}
    return !!wake && wake.actorType==="SYSTEM" && wake.actorId===null && wake.action===DETECTIVES_TAIL_RESUMED && wake.entityType==="Game"
      && wake.entityId===input.gameId && proof?.version===DETECTIVES_TAIL_BUDGET && proof.authorizationSha256===pin.authorizationSha256
      && proof.previousAuthorizationSha256===base.authorizationSha256 && proof.holdSha256===pin.holdSha256;
  }catch{return false;}
}

/** Existing ten-dollar authority for a qualified SOURCE repair. It adds no capacity, receipt or question. */
export async function detectivesSourceBodyRepairState(c:Container,gameId:string){const pin=await tailReceiptOf(c,gameId);demand(pin,"Only an existing consumed ten-dollar owner authorization can enter source repair");const state=await current(c,gameId);
 demand(pin&&await matches(c,pin,state)&&await hasDetectivesLowCapacity(c,gameId),'Original ten-dollar source authority required');
 const wake=await c.db.auditLog.findUnique({where:{id:detectivesTailResumeId(gameId)}});demand(wake&&wake.actorType==='SYSTEM'&&wake.actorId===null&&JSON.parse(wake.metaJson??'null')?.authorizationSha256===pin.authorizationSha256,'Original finite tail must have been consumed');
 const store=PrismaWorldBudgetStore.forReadOnlyTransaction(c.db),stored=await store.read(pin.worldId);demand(stored&&await verifyAssetsAndBill(c,state,store)===pin.avatarSha256,'Existing identity/avatar/source/accounting changed');
 return {pin,state,stored,rows:await tailRowsOf(c,gameId),job:await c.db.generationJob.findUniqueOrThrow({where:{id:pin.jobId}})};}
