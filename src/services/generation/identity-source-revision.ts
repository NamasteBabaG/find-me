import { Prisma } from "@prisma/client";
import { DbStorage } from "../../infra/storage/db";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { newId } from "../../lib/ids";
import { avatarDisplayFromSheet } from "../../infra/generation/avatar-cut";
import { qaCharacterPromptVersion } from "../../infra/generation/character-prompt";
import type { CropBox } from "../../infra/generation/types";
import { boardConditioningHash as hash } from "./board-conditioned-source";
import { boardWizardBudgetOf, boardWizardWorldId, assertGenerationSpendAllowed } from "./board-conditioned-wizard";
import { buildBoardWizardIdentityStyle } from "./board-wizard-identity-style";
import { sha256Bytes } from "./fixed-sprite";
import { worldsOwned } from "../world-catalog.service";
import { identityProvenanceSchema, identityReceiptReadyForPublication,
  requireBoardWizardIdentityApproval, reviewBoardWizardIdentity, identityReviewRequestKey, identityGateReceiptSchema } from "./board-wizard-identity-gate";
import { applyLeanReviewRecovery, planLeanReviewRecovery } from "./lean-review-recovery";
import { parkedHoldSha256, leanReviewRecoveryOf } from "./lean-review-recovery-pin";
import { subjectUpgradeOf } from "./subject-enrollment";
import { continueAdmittedReviewInterruptions, type ContinuationWhy } from "./subject-upgrade";
import { advanceContinuityInBackground, backgroundReviewWaiting } from "./continuity-background";
import { fenceLocalPatchImages } from "./local-patch-lifecycle";
import { IDENTITY_SOURCE_REVISION, IDENTITY_REVISION_START_ACTION, IDENTITY_REVISION_COMMIT_ACTION,
  identityRevisionStartSchema, identityRevisionCandidateSchema, identityRevisionCommitSchema, identityRevisionStartId, identityRevisionCandidateId,
  identityRevisionCommitId, identityRevisionStartOf, identityRevisionCommitOf, identityRevisionHeldOf, identityRevisionContinuationGrant, identityRevisionRetryId, IDENTITY_REVISION_RETRY_ACTION, type IdentityRevisionStart } from "./identity-source-revision-state";

export class IdentitySourceRevisionFailure extends Error {
  constructor(readonly code: "source-contract" | "image-unresolved" | "candidates-exhausted" | "cap_exceeded", message: string) {
    super(`IDENTITY_REVISION: ${message}`); this.name = "IdentitySourceRevisionFailure";
  }
}
function demand(ok: unknown, message: string, code: "source-contract" | "cap_exceeded" | "candidates-exhausted" = "source-contract"): asserts ok { if (!ok) throw new IdentitySourceRevisionFailure(code, message); }
export const IDENTITY_SOURCE_REVISION_CONFIRMATION = "repair-this-world-reference-from-full-source-v1";
const CANDIDATES = 3;
export function isIdentityRevisionDatabaseTransient(e: unknown): boolean {
  const code = e instanceof Prisma.PrismaClientKnownRequestError ? e.code : e instanceof Prisma.PrismaClientInitializationError ? e.errorCode : null;
  return !!code && ["P2034", "P2024", "P1001", "P1002", "P1008", "P1017"].includes(code);
}
async function retainWhileInMemory<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await work(); } catch (error) { if (!isIdentityRevisionDatabaseTransient(error) || attempt >= 2) throw error; }
  }
}

const inTransaction = (c: Container, tx: Prisma.TransactionClient): Container => ({ ...c,
  db: tx as unknown as Container["db"], storage: new DbStorage(tx as unknown as Container["db"]) });
const PLAN_VERSION = "paid-identity-source-revision-plan/v1";

async function administrator(c: Container, operatorId: string) {
  const user = await c.db.user.findUnique({ where: { id: operatorId }, select: { email: true } });
  demand(user && (c.adminEmails ?? []).some(email => email.trim().toLowerCase() === user.email.trim().toLowerCase()), "authorized administrator required");
}
async function source(c: Container, gameId: string) {
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true, scenes: true, orders: true } });
  const child = game.childProfile;
  demand(env().APP_ENV === "qa" && c.storage.id === "db" && game.styleVersion === "local-patch-world-v1", "QA local-patch DB world required");
  demand(game.status === "TARGETS_GENERATING" && !game.deletedAt && !game.readyAt && !game.configJson && game.ownerId, "delivered, stopped or deleted worlds cannot be revised");
  demand(game.scenes.length === 9 && game.scenes.every(s => s.sceneVersion === 12) && worldsOwned(game.scenes.map(s => s.sceneSlug)).length === 1, "one complete nine-board v12 world required");
  demand(game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    && !game.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt), "confirmed, unrefunded owner payment required");
  demand(child && !child.deletedAt && child.ownerId === game.ownerId && child.ageYears && child.originalPhotoAssetId && child.identityAssetId && child.avatarAssetId, "live owned source profile required");
  demand(await c.db.game.count({ where: { childProfileId: child.id, deletedAt: null, NOT: { id: gameId } } }) === 0, "shared profiles cannot be revised by a one-world repair");
  demand(await c.db.childProfile.count({ where: { id: { not: child.id }, deletedAt: null,
    OR: [{ identityAssetId: child.identityAssetId }, { avatarAssetId: child.avatarAssetId }] } }) === 0,
    "shared canonical assets cannot receive a one-world rejection");
  const [photo, sheet] = await Promise.all([c.db.asset.findUniqueOrThrow({ where: { id: child.originalPhotoAssetId } }), c.db.asset.findUniqueOrThrow({ where: { id: child.identityAssetId } })]);
  demand([photo, sheet].every(a => a.ownerId === game.ownerId && a.visibility === "PRIVATE" && a.status === "READY" && !a.deletedAt)
    && photo.type === "ORIGINAL_PHOTO" && sheet.type === "IDENTITY_SHEET", "private source assets unavailable");
  const [photoBytes, sheetBytes] = await Promise.all([c.storage.get(photo.storagePath), c.storage.get(sheet.storagePath)]);
  const original = await subjectUpgradeOf(c.db, gameId);
  demand(original && !original.identityRevision && original.identityAssetId === sheet.id && original.identitySha256 === sha256Bytes(sheetBytes)
    && original.photoAssetId === photo.id && original.photoSha256 === sha256Bytes(photoBytes) && original.ageYears === child.ageYears, "original enrollment/source changed");
  const painted = await c.db.auditLog.findFirst({ where: { action: "sheet:painted", entityType: "Asset", entityId: sheet.id }, orderBy: { createdAt: "desc" } });
  const provenance = identityProvenanceSchema.parse(JSON.parse(painted?.metaJson ?? "{}").identityProvenance);
  demand(provenance.photoAssetId === photo.id && provenance.photoSha256 === sha256Bytes(photoBytes) && provenance.ageYears === child.ageYears
    && hash(provenance.crop) === hash(child.photoCropJson ? JSON.parse(child.photoCropJson) : null), "retained painting provenance differs from source");
  const job = await c.db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
  demand(job.status === "FAILED" && job.currentStep === "local-patch:needs-release", "only a safely parked world may enter reference repair");
  return { game, child, photo, photoBytes, sheet, sheetBytes, original, provenance, job };
}

async function configuredSource(c: Container, s: Awaited<ReturnType<typeof source>>) {
  demand(c.avatars.id === "openai" && c.avatars.createCharacter && env().OPENAI_API_KEY?.trim(), "configured existing QA image/review providers required");
  await assertGenerationSpendAllowed(c, s.game.ownerId!);
  const world = worldsOwned(s.game.scenes.map(scene => scene.sceneSlug))[0]!;
  const atlas = await buildBoardWizardIdentityStyle(undefined, "board-matched-identity/v6", world.slug === "kingdom" ? "kingdom" : "journey");
  demand(atlas.catalogSha256 === s.provenance.style.catalogSha256 && atlas.atlasSha256 === s.provenance.style.atlasSha256, "retained board style changed");
  return atlas;
}

async function revisionInventory(c: Container, gameId: string) {
  return c.db.targetVariantAsset.findMany({ where: { variant: "A", targetInstance: { gameScene: { gameId } } }, orderBy: { id: "asc" },
    select: { id: true, targetInstanceId: true, status: true, assetId: true, attempts: true, judgeJson: true } });
}

/** Read only, including the real historical budget/unknowns. No provider, reset or approval. */
export async function planIdentitySourceRevision(c: Container, gameId: string) {
  demand(!await identityRevisionStartOf(c.db, gameId), "this world already has a reference revision; resume its retained operation");
  const s = await source(c, gameId), budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(gameId);
  await configuredSource(c, s); // No irreversible start before provider/source qualification.
  demand(!(await backgroundReviewWaiting(c.db, gameId, { inFlightOnly: true })).size, "retained background answers are still in flight; read them before source revision");
  const pin = await leanReviewRecoveryOf(c.db, gameId);
  const recovery = pin ? null : await planLeanReviewRecovery(c, { gameId });
  demand(pin ? pin.mode === "existing-world" && pin.binding.jobId === s.job.id && pin.binding.holdSha256 === parkedHoldSha256(s.job)
    : recovery?.eligible && recovery.binding, "the existing review interruption is not safely continuable under its real ledger");
  const recoveryPlanSha256 = pin?.mode === "existing-world" ? pin.planSha256 : recovery!.planSha256;
  const audit = await budget.audit(worldId);
  demand(audit.capMicroUsd === 4_000_000 && audit.remainingMicroUsd >= 900_000 && !audit.pendingRequestKeys.length, "one identity plus its HIGH review must fit the existing four-dollar cap");
  let last = 1;
  for (let n = 1; n <= 16; n++) if (await budget.readRequest(worldId, `wizard:identity:${n}`)) last = n;
  demand(last < 16, "identity attempt bound exhausted", "candidates-exhausted");
  const rows = await revisionInventory(c, gameId);
  const existingPictures = Math.min(27, new Set(rows.filter(row => !!row.assetId).map(row => row.targetInstanceId)).size);
  const binding = { gameId, ownerId: s.game.ownerId!, childId: s.child.id, oldIdentityAssetId: s.sheet.id, oldIdentitySha256: sha256Bytes(s.sheetBytes),
    oldAvatarAssetId: s.child.avatarAssetId!, photoAssetId: s.photo.id, photoSha256: sha256Bytes(s.photoBytes), ageYears: s.child.ageYears!,
    cropSha256: hash(s.provenance.crop), originalEnrollmentSha256: hash(s.original), jobId: s.job.id, jobHoldSha256: parkedHoldSha256(s.job),
    recoveryPlanSha256, firstAttempt: last + 1,
    provenance: identityProvenanceSchema.parse({ ...s.provenance, repair: undefined, promptVersion: qaCharacterPromptVersion("board-matched-identity/v6"),
      style: { ...s.provenance.style, version: "board-matched-identity/v6" } }) };
  const plan = { version: PLAN_VERSION, binding, previousAppearancesSha256: hash(rows), capMicroUsd: audit.capMicroUsd,
    committedMicroUsd: audit.committedMicroUsd, unknownMicroUsd: audit.reservedMicroUsd, remainingMicroUsd: audit.remainingMicroUsd,
    maxNewIdentityCandidates: CANDIDATES, retainAndContinueUnresolvedReferenceAttempts: true, all27MustRequalify: true, releaseCurrentIdentity: false,
    completion: { requiredAppearances: 27, existingPictures,
      newPicturesStillNeeded: 27 - existingPictures, currentCanonicalReviewsStillNeeded: 27,
      completionWithinCapGuaranteed: false, imageAndReviewAdmissionMicroUsd: 900_000 } };
  return { ...plan, planSha256: hash(plan) };
}

/** Explicit operator entry point. The caller has authenticated its administrator before supplying operatorId.
 * Start adds a dispatch/publication barrier BEFORE granting any old review continuation. It never rewrites a bill,
 * resets a job/hide counter, approves art, edits the original enrollment or changes payment. */
export async function beginIdentitySourceRevision(c: Container, input: { gameId: string; operatorId: string; expectedPlanSha256: string }) {
  await administrator(c, input.operatorId);
  const existing = await identityRevisionStartOf(c.db, input.gameId);
  if (existing) { demand(existing.operatorId === input.operatorId && existing.planSha256 === input.expectedPlanSha256, "another revision is already retained"); return existing; }
  const plan = await planIdentitySourceRevision(c, input.gameId);
  demand(plan.planSha256 === input.expectedPlanSha256, "the source or budget changed; read a new plan");
  const record = identityRevisionStartSchema.parse({ version: IDENTITY_SOURCE_REVISION, ...plan.binding, operatorId: input.operatorId,
    planSha256: plan.planSha256, authorizedAt: new Date().toISOString() });
  await c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, input.gameId);
    const live = await source(inTransaction(c, tx), input.gameId);
    demand(parkedHoldSha256(live.job) === record.jobHoldSha256 && live.child.identityAssetId === record.oldIdentityAssetId
      && sha256Bytes(live.photoBytes) === record.photoSha256 && hash(live.original) === record.originalEnrollmentSha256, "source changed while holding");
    const locked = await tx.generationJob.updateMany({ where: { id: live.job.id, status: "FAILED", currentStep: "local-patch:needs-release",
      attempts: live.job.attempts, updatedAt: live.job.updatedAt, lastError: live.job.lastError }, data: { updatedAt: live.job.updatedAt } });
    demand(locked.count === 1, "the parked job changed before reference authorization");
    demand(hash(await revisionInventory(inTransaction(c, tx), input.gameId)) === plan.previousAppearancesSha256,
      "the retained picture inventory changed before source authorization");
    const currentPin = await leanReviewRecoveryOf(tx, input.gameId);
    if (currentPin) demand(currentPin.mode === "existing-world" && currentPin.planSha256 === record.recoveryPlanSha256
      && currentPin.binding.holdSha256 === record.jobHoldSha256, "another continuation was authorized meanwhile");
    else await applyLeanReviewRecovery(inTransaction(c, tx), { gameId: input.gameId, operatorId: input.operatorId, expectedPlanSha256: record.recoveryPlanSha256 }, tx);
    await tx.auditLog.create({ data: { id: identityRevisionStartId(input.gameId), actorType: "ADMIN", actorId: input.operatorId,
      action: IDENTITY_REVISION_START_ACTION, entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify(record) } });
    await tx.auditLog.create({ data: { id: `aud_identity_revision_rejected_${input.gameId}`, actorType: "ADMIN", actorId: input.operatorId,
      action: "generation:identity-source-rejected", entityType: "Asset", entityId: record.oldIdentityAssetId,
      metaJson: JSON.stringify({ version: IDENTITY_SOURCE_REVISION, gameId: input.gameId, startSha256: hash(record) }) } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  return record;
}

async function fence(c: Container, tx: Prisma.TransactionClient, start: IdentityRevisionStart) {
  await fenceLocalPatchImages(tx, start.gameId);
  demand(!await identityRevisionCommitOf(tx, start.gameId), "revision already committed");
  const s = await source(inTransaction(c, tx), start.gameId);
  demand(s.child.id === start.childId && s.game.ownerId === start.ownerId && s.child.identityAssetId === start.oldIdentityAssetId
    && s.child.avatarAssetId === start.oldAvatarAssetId && sha256Bytes(s.photoBytes) === start.photoSha256 && sha256Bytes(s.sheetBytes) === start.oldIdentitySha256
    && hash(s.provenance.crop) === start.cropSha256 && parkedHoldSha256(s.job) === start.jobHoldSha256, "the parked source changed");
}


const REFERENCE_INTENT_STALE_MS = 6 * 60_000;
async function continueReferenceFailures(c: Container, start: IdentityRevisionStart, write: <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>) {
  const worldId = boardWizardWorldId(start.gameId), budget = boardWizardBudgetOf(c), failed = new Set<number>();
  let waiting = false;
  for (let n = start.firstAttempt; n < start.firstAttempt + CANDIDATES; n++) {
    const candidateKey = identityRevisionCandidateId(start.gameId, n);
    const candidateRow = await c.db.auditLog.findUnique({ where: { id: candidateKey } });
    const candidate = candidateRow ? identityRevisionCandidateSchema.parse(JSON.parse(candidateRow.metaJson ?? "null")) : null;
    if (candidate) demand(candidate.startSha256 === hash(start) && candidate.gameId === start.gameId && candidate.attempt === n
      && candidateRow?.actorType === "SYSTEM" && candidateRow.actorId === null && candidateRow.action === "generation:identity-source-revision-candidate"
      && candidateRow.entityId === start.gameId && candidateRow.metaJson === JSON.stringify(candidate), "candidate continuation differs from authorized source");
    const kind = candidate ? "review" : "image", intentId = `${candidateKey}_${candidate ? "review_intent" : "dispatch"}`;
    const intent = await c.db.auditLog.findUnique({ where: { id: intentId } });
    if (!intent) continue;
    const binding = JSON.parse(intent.metaJson ?? "null");
    const expectedKey = candidate ? `wizard:identity-style:1:${candidate.identityAssetId}` : `wizard:identity:${n}`;
    const expected = { version: IDENTITY_SOURCE_REVISION, startSha256: hash(start), attempt: n, requestKey: expectedKey,
      operationFingerprint: binding?.operationFingerprint, ...(candidate ? { identityAssetId: candidate.identityAssetId, sheetSha256: candidate.sheetSha256 } : {}) };
    demand(intent.actorType === "SYSTEM" && intent.actorId === null && intent.entityType === "Game" && intent.entityId === start.gameId
      && intent.action === (candidate ? "generation:identity-source-review-intent" : "generation:identity-source-dispatch-intent")
      && /^[a-f0-9]{64}$/.test(binding?.operationFingerprint ?? "") && intent.metaJson === JSON.stringify(expected), "reference continuation intent differs");
    let request = await budget.readRequest(worldId, expectedKey);
    if (!request) continue; // An intent before reservation can finish its never-bought question normally.
    demand(request.operationFingerprint === binding.operationFingerprint && request.scope === (candidate ? "judge" : "identity")
      && request.reserveMicroUsd === (candidate ? 400_000 : 500_000) && !request.conflicts.length, "reference continuation refers to another reservation");
    let receipt = null;
    if (candidate) {
      const row = await c.db.auditLog.findFirst({ where: { action: "board-wizard:identity-style-reviewed", entityType: "Asset", entityId: candidate.identityAssetId }, orderBy: { createdAt: "desc" } });
      receipt = row ? identityGateReceiptSchema.parse(JSON.parse(row.metaJson ?? "null")) : null;
      if (receipt) demand(receipt.fingerprint === request.operationFingerprint && receipt.identityAssetId === candidate.identityAssetId
        && receipt.sheetSha256 === candidate.sheetSha256 && receipt.provenance.style.version === "board-matched-identity/v6", "reference review continuation differs from candidate");
      if (receipt?.checks) continue; // A real visual decision, including a refusal, follows the normal quality path.
    }
    if (request.state === "pending") {
      if (Date.now() - intent.createdAt.getTime() < REFERENCE_INTENT_STALE_MS) { waiting = true; continue; }
      await budget.markUnknown(worldId, expectedKey, "Bound reference intent ended without a retained complete response; full reservation retained");
      request = await budget.readRequest(worldId, expectedKey);
    }
    if (request?.state === "unknown" && !await budget.readContinuationApproval(worldId, expectedKey)) {
      const grant = identityRevisionContinuationGrant(start, n, kind, request);
      const authorized = boardWizardBudgetOf(c, 1, { authorizeUnknownContinuation: async incoming => {
        await write(async () => undefined);
        return JSON.stringify({ ...grant, version: "world-unknown-continuation/v1", worldId }) === JSON.stringify(incoming);
      } });
      await authorized.authorizeUnknownContinuation(worldId, grant);
    }
    // Unknown outcome or paid-but-unretained result consumes this candidate. It is never bought/reviewed again under the old key.
    failed.add(n);
  }
  return { failed, waiting };
}

/** One bounded new candidate per invocation. Re-entry replays its assets/review; a lost or unpriceable dispatch
 * remains reserved, never silently bought again. All three new candidates share the same source/volume contract. */
export async function advanceIdentitySourceRevision(c: Container, input: { gameId: string; operatorId: string; deadlineAt?: number }) {
  await administrator(c, input.operatorId);
  const committed = await identityRevisionCommitOf(c.db, input.gameId);
  if (committed) {
    const effective = await subjectUpgradeOf(c.db, input.gameId);
    demand(effective?.identityRevision && effective.identityAssetId === committed.newIdentityAssetId
      && effective.identitySha256 === committed.newIdentitySha256, "retained commit lacks its verified active subject context");
    return { state: "committed" as const, receipt: committed };
  }
  const start = await identityRevisionStartOf(c.db, input.gameId);
  demand(start && start.operatorId === input.operatorId, "an explicit source-revision plan must be retained first");
  const s = await source(c, input.gameId);
  await assertGenerationSpendAllowed(c, start.ownerId);
  demand(c.avatars.id === "openai" && c.avatars.createCharacter && env().OPENAI_API_KEY?.trim(), "configured existing QA image/review providers required");
  const write = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => c.db.$transaction(async tx => { await fence(c, tx, start); return work(tx); },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  await write(async () => undefined);
  // This pin admits only the old review interruptions named in the original plan. Their reserves stay in full.
  const pin = await leanReviewRecoveryOf(c.db, input.gameId);
  demand(pin?.mode === "existing-world" && pin.planSha256 === start.recoveryPlanSha256 && pin.binding.holdSha256 === start.jobHoldSha256,
    "the atomic source start lacks its bound historical continuation");
  // Existing provider answers must keep being read while the rejected reference blocks ordinary world ticks.
  if ((await backgroundReviewWaiting(c.db, input.gameId, { inFlightOnly: true })).size) {
    await advanceContinuityInBackground(c, input.gameId, { deadlineAt: Math.min(input.deadlineAt ?? Infinity, Date.now() + 20_000) });
    if ((await backgroundReviewWaiting(c.db, input.gameId, { inFlightOnly: true })).size) return { state: "deferred" as const };
  }
  const referenceRecovery = await continueReferenceFailures(c, start, write);
  if (referenceRecovery.waiting) return { state: "deferred" as const };
  const why: ContinuationWhy = {};
  const continued = await continueAdmittedReviewInterruptions(c, input.gameId, {}, input.deadlineAt ?? Date.now() + 240_000,
    tx => fence(c, tx, start), why);
  if (continued === "partial" || continued === "blocked" && why.transient) return { state: "deferred" as const };
  demand(continued === "done" || continued === "none", `historical review continuation ${continued}; no new image was bought`);
  const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(input.gameId);
  demand(!(await budget.audit(worldId)).held, "historical accounting still blocks new spending");
  const atlas = await configuredSource(c, s);
  const failed: string[] = [];
  for (let n = start.firstAttempt; n < start.firstAttempt + CANDIDATES; n++) {
    if (referenceRecovery.failed.has(n)) continue; // A transport failure is not visual feedback and must not change facial construction.
    const key = identityRevisionCandidateId(input.gameId, n);
    const row = await c.db.auditLog.findUnique({ where: { id: key } });
    let candidate: ReturnType<typeof identityRevisionCandidateSchema.parse>;
    if (row) {
      candidate = identityRevisionCandidateSchema.parse(JSON.parse(row.metaJson ?? "null"));
      demand(row.action === "generation:identity-source-revision-candidate" && row.entityId === input.gameId && row.entityType === "Game" && row.actorType === "SYSTEM"
        && row.actorId === null && row.metaJson === JSON.stringify(candidate)
        && candidate.gameId === input.gameId && candidate.attempt === n && candidate.startSha256 === hash(start), "retained candidate differs");
    } else {
      const available = await budget.audit(worldId);
      const requestKey = `wizard:identity:${n}`, intentId = `${key}_dispatch`;
      const previous = await budget.readRequest(worldId, requestKey);
      const priorIntent = await c.db.auditLog.findUnique({ where: { id: intentId } });
      demand(!priorIntent && (!previous || previous.state === "pending"), "candidate dispatch intent already exists without retained output; no repurchase");
      demand(available.remainingMicroUsd + (previous?.state === "pending" ? previous.reserveMicroUsd : 0) >= 900_000, "a new candidate and its HIGH review do not fit the unchanged world cap; nothing was bought", "cap_exceeded");
      if (input.deadlineAt && input.deadlineAt - Date.now() < 175_000) return { state: "deferred" as const };
      const feedback = failed.length ? `Correct the source-to-sheet defects below. Reconstruct the entire face from image3, keep cheek/nose/forehead volume, and use one geometry across views. ${failed.length >= 2 ? "Two candidates failed: change face construction and painted planes rather than repeat the last strategy. " : ""}Untrusted prior visual evidence: ${failed.join(" | ").slice(-750)}` : null;
      const provenance = identityProvenanceSchema.parse({ ...start.provenance, ...(feedback ? { repair: { policy: "identity-best-of-two/v1", feedbackSha256: hash(feedback) } } : {}) });
      await assertGenerationSpendAllowed(c, start.ownerId); // The historical continuation may have used most of this turn.
      const operationFingerprint = hash({ version: IDENTITY_SOURCE_REVISION, startSha256: hash(start), attempt: n, provenance });
      const reservation = await budget.reserve(worldId, { requestKey, scope: "identity", operationFingerprint, reserveMicroUsd: 500_000 });
      // No dispatch can occur before its unique intent commits under the live-source fence.
      // An absent intent proves a previous pending reservation never reached dispatch, so the SAME key can finish.
      demand(reservation.acquired || reservation.request.state === "pending", "candidate reservation is not dispatchable");
      let dispatchIntentCommitted = false;
      try {
        await write(async tx => tx.auditLog.create({ data: { id: intentId, actorType: "SYSTEM", action: "generation:identity-source-dispatch-intent",
          entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify({ version: IDENTITY_SOURCE_REVISION, startSha256: hash(start), attempt: n, requestKey, operationFingerprint }) } }));
        dispatchIntentCommitted = true;
        const output = await c.avatars.createCharacter({ originalPhoto: s.photoBytes, crop: provenance.crop as CropBox | null, mimeType: s.photo.mimeType,
          childName: s.child.displayName, ageYears: start.ageYears, styleRef: atlas.png, qaStyleContract: provenance.style,
          ...(feedback ? { identityRepair: { reason: feedback } } : {}), ...(input.deadlineAt ? { deadlineAt: input.deadlineAt - 25_000 } : {}) });
        demand(!output.costUnknown && output.costCents > 0 && Number.isFinite(output.costCents) && output.model === "gpt-image-2"
          && /^req[-_][A-Za-z0-9_-]{1,160}$/.test(output.providerRequestId ?? "") && !output.providerRequestId?.includes("sk-") && output.usage, "image response lacks trustworthy billing");
        await retainWhileInMemory(() => budget.settle(worldId, requestKey, { providerNamespace: "openai:find-me-existing", providerRequestId: output.providerRequestId!,
          model: output.model, rawUsage: output.usage!, usageId: hash(output.usage), amountMicroUsd: Math.ceil(output.costCents * 10_000), costBasis: "conservative-upper-estimate" }));
        demand(output.sheetWidth === 1024 && output.sheetHeight === 1024, "canonical sheet dimensions differ");
        const avatar = await avatarDisplayFromSheet(output.sheetPng, output.sheetWidth), identityAssetId = newId("ast"), avatarAssetId = newId("ast");
        candidate = identityRevisionCandidateSchema.parse({ version: IDENTITY_SOURCE_REVISION, gameId: input.gameId, startSha256: hash(start), attempt: n,
          identityAssetId, avatarAssetId, sheetSha256: sha256Bytes(output.sheetPng) });
        try { await retainWhileInMemory(() => write(async tx => {
          for (const asset of [{ id: identityAssetId, type: "IDENTITY_SHEET", visibility: "PRIVATE", png: output.sheetPng, width: output.sheetWidth, height: output.sheetHeight },
            { id: avatarAssetId, type: "AVATAR", visibility: "GAME", png: avatar, width: 512, height: 512 }]) {
            const path = `${asset.visibility.toLowerCase()}/${asset.id}.png`;
            await tx.fileBlob.create({ data: { key: path, contentType: "image/png", data: new Uint8Array(asset.png) } });
            await tx.asset.create({ data: { id: asset.id, ownerId: start.ownerId, type: asset.type, visibility: asset.visibility, storagePath: path, mimeType: "image/png",
              bytes: asset.png.length, width: asset.width, height: asset.height, provider: "openai", providerRequestId: output.providerRequestId,
              costCents: asset.id === identityAssetId ? Math.round(output.costCents) : 0 } });
          }
          await tx.auditLog.create({ data: { id: newId("aud"), actorType: "SYSTEM", action: "sheet:painted", entityType: "Asset", entityId: identityAssetId,
            metaJson: JSON.stringify({ gameId: input.gameId, costCents: output.costCents, costUnknown: false, requestId: output.providerRequestId, model: output.model, usage: output.usage, identityProvenance: provenance }) } });
          // Existing deletion graph retains every unselected candidate and the original canonical assets.
          await tx.auditLog.create({ data: { id: newId("aud"), actorType: "SYSTEM", action: "identity-best-of-two:candidate", entityType: "Game", entityId: input.gameId,
            metaJson: JSON.stringify({ childId: start.childId, first: { identityAssetId: start.oldIdentityAssetId, avatarAssetId: start.oldAvatarAssetId },
              second: { identityAssetId, avatarAssetId }, sourceRevision: IDENTITY_SOURCE_REVISION }) } });
          await tx.auditLog.create({ data: { id: key, actorType: "SYSTEM", action: "generation:identity-source-revision-candidate", entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify(candidate) } });
        })); } catch (error) {
          const retained = await c.db.auditLog.findUnique({ where: { id: key } });
          if (retained?.metaJson !== JSON.stringify(candidate) || retained.action !== "generation:identity-source-revision-candidate") throw error;
        }
      } catch (error) {
        if (!dispatchIntentCommitted) {
          const intent = await c.db.auditLog.findUnique({ where: { id: intentId } });
          if (!intent) throw error; // Known no dispatch: keep pending, propagate a temporary DB failure to the normal queue.
        }
        const request = await budget.readRequest(worldId, requestKey);
        if (request?.state === "pending") await budget.markUnknown(worldId, requestKey, "Reference revision has no trustworthy retained complete response; no automatic repurchase");
        // This explicit source grant includes bounded next candidates, never a resend of this key.
        return { state: "retry" as const, attempt: n };
      }
    }
    const asset = await c.db.asset.findUniqueOrThrow({ where: { id: candidate.identityAssetId } });
    demand(asset.ownerId === start.ownerId && asset.status === "READY" && !asset.deletedAt && asset.visibility === "PRIVATE" && asset.type === "IDENTITY_SHEET", "candidate is not owned private live imagery");
    const sheet = await c.storage.get(asset.storagePath);
    demand(sha256Bytes(sheet) === candidate.sheetSha256 && candidate.sheetSha256 !== start.oldIdentitySha256, "candidate pixels changed or repeat the rejected reference unchanged");
    const avatar = await c.db.asset.findUniqueOrThrow({ where: { id: candidate.avatarAssetId } });
    demand(avatar.ownerId === start.ownerId && avatar.status === "READY" && !avatar.deletedAt && avatar.type === "AVATAR" && avatar.visibility === "GAME"
      && sha256Bytes(await c.storage.get(avatar.storagePath)) === sha256Bytes(await avatarDisplayFromSheet(sheet, 1024)), "candidate avatar does not derive from its sheet");
    const painted = await c.db.auditLog.findFirstOrThrow({ where: { action: "sheet:painted", entityType: "Asset", entityId: candidate.identityAssetId }, orderBy: { createdAt: "desc" } });
    const provenance = identityProvenanceSchema.parse(JSON.parse(painted.metaJson!).identityProvenance);
    demand(hash({ ...provenance, repair: undefined }) === hash({ ...start.provenance, repair: undefined }), "candidate source contract differs from authorized revision");
    if (input.deadlineAt && input.deadlineAt - Date.now() < 205_000) return { state: "deferred" as const };
    let receipt;
    try { receipt = await reviewBoardWizardIdentity({ db: c.db, budget, apiKey: env().OPENAI_API_KEY!, write,
      recordFullSourceIntent: async ({ requestKey, fingerprint }) => {
        const id = `${key}_review_intent`, record = { version: IDENTITY_SOURCE_REVISION, startSha256: hash(start), attempt: n,
          requestKey, operationFingerprint: fingerprint, identityAssetId: candidate.identityAssetId, sheetSha256: candidate.sheetSha256 };
        await write(async tx => {
          const saved = await tx.auditLog.findUnique({ where: { id } });
          if (saved) { demand(saved.metaJson === JSON.stringify(record) && saved.actorType === "SYSTEM" && saved.actorId === null
            && saved.action === "generation:identity-source-review-intent" && saved.entityId === input.gameId, "reference review intent changed"); return; }
          await tx.auditLog.create({ data: { id, actorType: "SYSTEM", action: "generation:identity-source-review-intent", entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify(record) } });
        });
      },
      beforeDispatch: async () => { await assertGenerationSpendAllowed(c, start.ownerId); await write(async () => undefined); } },
      { gameId: input.gameId, identityAssetId: candidate.identityAssetId, sheet, photo: s.photoBytes, atlas: atlas.png, provenance, contentVersion: 12, deadlineAt: input.deadlineAt });
    } catch (error) {
      if (isIdentityRevisionDatabaseTransient(error)) throw error;
      const key = identityReviewRequestKey({ identityAssetId: candidate.identityAssetId, provenance });
      if (await budget.readRequest(worldId, key)) return { state: "retry" as const, attempt: n };
      throw error;
    }
    if (!identityReceiptReadyForPublication(receipt, 12)) {
      if (!receipt.checks || !receipt.requestId || !receipt.costMicroUsd) return { state: "retry" as const, attempt: n };
      demand("sourceFaceVisible" in receipt.checks && receipt.checks.sourceFaceVisible === "pass", "the full original photo lacks usable unambiguous face evidence; repainting the same source cannot repair it");
      failed.push(JSON.stringify({ checks: receipt.checks, reason: receipt.reason }));
      if (!row) return { state: "retry" as const, attempt: n, checks: receipt.checks }; // One new candidate per invocation.
      continue;
    }
    await requireBoardWizardIdentityApproval(c, budget, { gameId: input.gameId, identityAssetId: candidate.identityAssetId, sheetSha256: candidate.sheetSha256,
      catalogSha256: provenance.style.catalogSha256, photoAssetId: start.photoAssetId, ageYears: start.ageYears, crop: provenance.crop, contentVersion: 12 });
    const commit = identityRevisionCommitSchema.parse({ version: IDENTITY_SOURCE_REVISION, gameId: input.gameId, startSha256: hash(start), originalEnrollmentSha256: start.originalEnrollmentSha256,
      oldIdentityAssetId: start.oldIdentityAssetId, oldIdentitySha256: start.oldIdentitySha256, newIdentityAssetId: candidate.identityAssetId, newIdentitySha256: candidate.sheetSha256,
      newAvatarAssetId: candidate.avatarAssetId, reviewFingerprint: receipt.fingerprint, operatorId: input.operatorId, committedAt: new Date().toISOString() });
    await write(async tx => {
      demand(!(await boardWizardBudgetOf({ ...c, db: tx as unknown as Container["db"] }).audit(worldId)).held, "revision spending must be accounted before resumption");
      await tx.childProfile.update({ where: { id: start.childId }, data: { identityAssetId: candidate.identityAssetId, avatarAssetId: candidate.avatarAssetId } });
      await tx.auditLog.create({ data: { id: identityRevisionCommitId(input.gameId), actorType: "ADMIN", actorId: input.operatorId,
        action: IDENTITY_REVISION_COMMIT_ACTION, entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify(commit) } });
      // Reassessment, not erasure: every previous image, verdict, request, attempt and bill remains intact.
      await tx.gameScene.updateMany({ where: { gameId: input.gameId }, data: { generationStatus: "NEEDS_REGENERATION" } });
      await tx.generationJob.update({ where: { id: start.jobId }, data: { status: "QUEUED", currentStep: "local-patch", lastError: null } });
    });
    return { state: "committed" as const, receipt: commit };
  }
  throw new IdentitySourceRevisionFailure("candidates-exhausted", "three new reference candidates failed; diagnosis retained and world stays held");
}


export const IDENTITY_SOURCE_RETRY_CONFIRMATION = "retry-the-same-bound-reference-operation-v1";
export async function retryIdentitySourceRevision(c: Container, input: { gameId: string; operatorId: string; expectedHeldId: string }) {
  await administrator(c, input.operatorId);
  const start = await identityRevisionStartOf(c.db, input.gameId);
  demand(start && !await identityRevisionCommitOf(c.db, input.gameId), "only a pending explicit source revision can resume");
  const s = await source(c, input.gameId); await configuredSource(c, s);
  await c.db.$transaction(async tx => {
    await fence(c, tx, start);
    const held = await identityRevisionHeldOf(tx, input.gameId);
    demand(held?.id === input.expectedHeldId, "the held diagnosis changed; read it again");
    const record = { version: "identity-source-revision-retry/v1", gameId: input.gameId, heldId: held.id,
      heldSha256: hash([held.id, held.metaJson]), operatorId: input.operatorId };
    await tx.auditLog.create({ data: { id: identityRevisionRetryId(held.id), actorType: "ADMIN", actorId: input.operatorId, action: IDENTITY_REVISION_RETRY_ACTION,
      entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify(record) } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}


export async function identitySourceRevisionSupported(c: Container, gameId: string): Promise<boolean> {
  try { await source(c, gameId); return true; } catch { return false; }
}
