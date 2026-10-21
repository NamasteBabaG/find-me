import { Prisma } from "@prisma/client";
import { DbStorage } from "../../infra/storage/db";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { boardConditioningHash as hash } from "./board-conditioned-source";
import { sha256Bytes } from "./fixed-sprite";
import { leanReleaseOf, leanReleaseReceipt } from "./lean-release";
import { leanReviewRecoveryOf, parkedHoldSha256 } from "./lean-review-recovery-pin";
import { identityRevisionPending, identityRevisionStateOf } from "./identity-source-revision-state";
import { readLeanCompletionBudget } from "./lean-completion-budget";
import { leanCapacityRecoveryOf } from "./lean-capacity-recovery-pin";
import { PrismaWorldBudgetStore, WORLD_BUDGET_LEDGER_MAX_REVISION } from "../../infra/db/prisma-world-budget-store";
import { auditWorldBudget, getMatchingUnknownContinuationApproval } from "./world-budget";
import { backgroundReviewWaiting, backgroundRoundOfKey, SOL_BACKGROUND_ACTION } from "./continuity-background";
import { leanReviewPolicyOf } from "../../domain/generation/visual-review-policy";
import { capacityBindingSchema, capacityEvidenceSchema, leanCapacityReceiptSchema, leanCapacityRecoveryId,
  LEAN_CAPACITY_RECOVERY, LEAN_CAPACITY_RECOVERY_ACTION, LEAN_CAPACITY_RECOVERY_CAP, LEAN_CAPACITY_RECOVERY_LIMIT,
  capacityFailureCode } from "../../domain/generation/lean-capacity-recovery";
import type { BoardWizardBudgetGrant } from "./board-wizard-budget";
import { isGameStatus, isPlayable } from "../../domain/order-state";
import { worldsOwned } from "../world-catalog.service";

function demand(ok: unknown, message: string): asserts ok { if (!ok) throw Error(`LEAN_CAPACITY: ${message}`); }
const paid = (game: { ownerId: string | null; orders: { userId: string; paymentStatus: string; paidAt: Date | null; refundedAt: Date | null }[] }) =>
  game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
  && !game.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt);

/** Immutable authority first, then revocable live capacity. A genuine late bill can still be recorded after revocation. */
export async function readLeanCapacityRecoveryBudget(c: Container, worldId: string): Promise<BoardWizardBudgetGrant | null> {
  if (env().APP_ENV !== "qa" || !/^[A-Za-z0-9_-]{1,160}:board-wizard$/.test(worldId)) return null;
  const gameId = worldId.slice(0, -":board-wizard".length), pin = await leanCapacityRecoveryOf(c.db, gameId);
  if (!pin) return null;
  const previous = await readLeanCompletionBudget(c, worldId);
  const { start, commit } = await identityRevisionStateOf(c.db, gameId);
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, orders: true } });
  if (!previous || c.storage.id !== "db" || !game || game.deletedAt || game.ownerId !== pin.ownerId || game.childProfileId !== pin.childId
    || game.styleVersion !== "local-patch-world-v1" || !game.childProfile || game.childProfile.deletedAt
    || game.childProfile.ownerId !== pin.ownerId || !paid(game) || !start || !commit
    || game.childProfile.identityAssetId !== commit.newIdentityAssetId || game.childProfile.avatarAssetId !== commit.newAvatarAssetId
    || !await sourcePhotoCurrent(c, game, game.childProfile.originalPhotoAssetId, start.photoAssetId, commit.newIdentityAssetId)
    || game.childProfile.ageYears !== start.ageYears
    || hash(game.childProfile.photoCropJson ? JSON.parse(game.childProfile.photoCropJson) : null) !== start.cropSha256) return null;
  return { worldId, capMicroUsd: LEAN_CAPACITY_RECOVERY_CAP, authorizationSha256: pin.authorizationSha256 };
}

/** The frozen source photograph, or its purge by the READY finalizer in the publication commit (local-patch-player.ts),
 * while the world stays playable (READY, then DELIVERED once its mail goes out). That purge is the world's own privacy
 * step, not a revocation: without it a published world past six dollars would audit as over its cap. Any other missing
 * photograph still withdraws the grant. */
async function sourcePhotoCurrent(c: Container, game: { status: string; configJson: string | null }, current: string | null,
  photoAssetId: string, identityAssetId: string) {
  if (current === photoAssetId) return true;
  if (current !== null || !isGameStatus(game.status) || !isPlayable(game.status) || !game.configJson) return false;
  const purges = await c.db.auditLog.findMany({ where: { actorType: "SYSTEM", action: "local-patch:photo-purged-after-approval",
    entityType: "Asset", entityId: identityAssetId }, select: { metaJson: true } });
  return purges.some(row => JSON.parse(row.metaJson ?? "null")?.photoAssetId === photoAssetId);
}

/** Positive same-canonical capacity evidence, tied to each currently retained image and its exact terminal round. */
async function capacityEvidence(c: Container, gameId: string, identitySha256: string, ownerId: string) {
  const variants = await c.db.targetVariantAsset.findMany({ where: { variant: "A", targetInstance: { gameScene: { gameId } } } });
  const assets = await c.db.asset.findMany({ where: { id: { in: variants.flatMap(v => v.assetId ? [v.assetId] : []) },
    ownerId, status: "READY", deletedAt: null } });
  const liveAssets = new Set(assets.map(a => a.id));
  const live = new Map(variants.filter(v => v.assetId && liveAssets.has(v.assetId) && v.judgeJson).map(v => [v.id, JSON.parse(v.judgeJson!) as { judgedSha256?: string; geometrySha256?: string }]));
  const intents = await c.db.auditLog.findMany({ where: { entityType: "Game", entityId: gameId, action: SOL_BACKGROUND_ACTION,
    id: { endsWith: "_intent" } }, select: { metaJson: true } });
  const proof: ReturnType<typeof capacityEvidenceSchema.parse>[] = [];
  for (const row of intents) {
    const envelope = JSON.parse(row.metaJson ?? "null"), key = envelope?.intent?.requestKey;
    if (envelope?.kind !== "intent" || typeof key !== "string") continue;
    const round = await backgroundRoundOfKey(c.db, gameId, `${gameId}:board-wizard`, key);
    if (!round || round.terminal?.kind !== "outcome" || round.terminal.state !== "unpriced"
      || round.terminal.providerStatus !== "failed" || !capacityFailureCode(round.terminal.errorCode)
      || leanReviewPolicyOf(round.intent.policyVersion ?? "")?.serviceTier !== "flex") continue;
    const image = live.get(round.intent.binding.variantId);
    if (!image || round.intent.binding.identitySha256 !== identitySha256 || image.judgedSha256 !== round.intent.binding.imageSha256
      || image.geometrySha256 !== round.intent.binding.geometrySha256) continue;
    const { hideId: _hideId, ...binding } = round.intent.binding;
    proof.push(capacityEvidenceSchema.parse({ roundId: round.intent.roundId, requestKey: key, ...binding,
      roundSha256: hash({ intent: round.intent, terminal: round.terminal }), errorCode: round.terminal.errorCode }));
  }
  return proof.sort((a, b) => a.roundId < b.roundId ? -1 : a.roundId > b.roundId ? 1 : 0);
}

/** Read only. No grant, continuation, provider dispatch, job release or art approval occurs in a plan. */
export async function planLeanCapacityRecovery(c: Container, gameId: string) {
  demand(/^[A-Za-z0-9_-]{1,160}$/.test(gameId), "Invalid game");
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "Qualified QA database storage required");
  demand(!await c.db.auditLog.findUnique({ where: { id: leanCapacityRecoveryId(gameId) } }), "The single capacity grant already exists");
  const worldId = `${gameId}:board-wizard`, six = await readLeanCompletionBudget(c, worldId);
  const { start, commit } = await identityRevisionStateOf(c.db, gameId);
  const lean = await leanReleaseOf(c.db, gameId), recovery = await leanReviewRecoveryOf(c.db, gameId);
  demand(six && start && commit && lean && recovery && !await identityRevisionPending(c.db, gameId), "Verified committed source and existing completion/recovery grants required");
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true, scenes: true, orders: true } });
  const child = game.childProfile;
  demand(game.status === "TARGETS_GENERATING" && !game.deletedAt && !game.configJson && !game.readyAt
    && game.styleVersion === "local-patch-world-v1" && game.ownerId === start.ownerId && game.childProfileId === start.childId
    && child && !child.deletedAt && child.ownerId === start.ownerId && paid(game), "Live paid source world required");
  demand(child.identityAssetId === commit.newIdentityAssetId && child.avatarAssetId === commit.newAvatarAssetId
    && child.originalPhotoAssetId === start.photoAssetId && child.ageYears === start.ageYears
    && hash(child.photoCropJson ? JSON.parse(child.photoCropJson) : null) === start.cropSha256, "Frozen source or canonical profile changed");
  demand(game.scenes.length === 9 && game.scenes.every(s => s.sceneVersion === 12)
    && worldsOwned(game.scenes.map(s => s.sceneSlug)).length === 1, "One complete nine-board v12 world required");
  demand(await c.db.game.count({ where: { childProfileId: child.id, deletedAt: null, NOT: { id: gameId } } }) === 0, "Shared profile refused");
  for (const [assetId, expected] of [[start.photoAssetId, start.photoSha256], [commit.newIdentityAssetId, commit.newIdentitySha256]]) {
    const asset = await c.db.asset.findUniqueOrThrow({ where: { id: assetId! } });
    demand(asset.ownerId === start.ownerId && asset.visibility === "PRIVATE" && asset.status === "READY" && !asset.deletedAt
      && sha256Bytes(await c.storage.get(asset.storagePath)) === expected, "Live exact private source assets required");
  }
  const { subjectUpgradeOf } = await import("./subject-enrollment");
  const upgrade = await subjectUpgradeOf(c.db, gameId);
  demand(upgrade?.identityRevision && upgrade.identityAssetId === commit.newIdentityAssetId && upgrade.identitySha256 === commit.newIdentitySha256,
    "Strict current-canonical source approval required");
  const job = await c.db.generationJob.findUniqueOrThrow({ where: { id: start.jobId } });
  demand(job.gameId === gameId && job.status === "FAILED" && job.currentStep === "local-patch:needs-release"
    && /^local-patch-continue-in-slice\/v1: the world's automatic review continuations are spent \(2\/2 under v1, 4\/4 under v2, (?:11|12)\/12 under v3\); self-repair:board:[a-z0-9-]+:[a-f0-9]{64} stays reserved in full until a person reconciles or authorizes it$/.test(job.lastError ?? ""),
    "Only the exact spent-continuations hold is eligible");
  demand(!(await backgroundReviewWaiting(c.db, gameId, { inFlightOnly: true })).size, "Read existing provider responses first");
  const stored = await new PrismaWorldBudgetStore(c.db).read(worldId);
  demand(stored && stored.revision < WORLD_BUDGET_LEDGER_MAX_REVISION, "Safe existing ledger required");
  const audit = auditWorldBudget(stored.snapshot, 6_000_000);
  demand(!audit.pendingRequestKeys.length && !audit.conflictRequestKeys.length && !audit.overrunRequestKeys.length
    && audit.committedMicroUsd < 6_000_000, "Pending, conflicting, overrun or over-cap ledger refused");
  const approvals = stored.snapshot.unknownContinuationApprovals ?? [];
  const count = (version: string) => approvals.filter(a => a.version === version).length;
  demand(count("world-automatic-review-recovery/v1") === 2 && count("world-automatic-review-recovery/v2") === 4
    && count("world-automatic-review-recovery/v3") >= 11, "The ledger does not evidence the spent historical continuation limits");
  const retainedUnknowns = stored.snapshot.requests.filter(r => r.state === "unknown").map(r => ({ requestKey: r.requestKey,
    operationFingerprint: r.operationFingerprint, reserveMicroUsd: r.reserveMicroUsd })).sort((a, b) => a.requestKey < b.requestKey ? -1 : 1);
  const heldRequestKeys = audit.unknownRequestKeys.filter(key => !getMatchingUnknownContinuationApproval(stored.snapshot, key)).sort();
  demand(heldRequestKeys.length > 0 && heldRequestKeys.length <= LEAN_CAPACITY_RECOVERY_LIMIT, "Bounded actual held questions required");
  const { boardWizardBudgetOf } = await import("./board-conditioned-wizard");
  const { LocalPatchRetainedPurchaseStore } = await import("./local-patch-lifecycle");
  const { admittedInterruption, providerFailureRefusal } = await import("./local-patch-review-interruption-recovery");
  const budget = boardWizardBudgetOf(c), store = new LocalPatchRetainedPurchaseStore(c, gameId, budget);
  for (const key of heldRequestKeys) {
    const retained = key.startsWith("self-repair:board:") ? await store.get(worldId, key) : null;
    const admitted = retained && !retained.evidence ? await admittedInterruption(c, gameId, worldId, key, retained) : null;
    const round = await backgroundRoundOfKey(c.db, gameId, worldId, key);
    demand(admitted?.shape === "provider-failed" && round?.terminal?.kind === "outcome" && capacityFailureCode(round.terminal.errorCode)
      && round.intent.binding.identitySha256 === commit.newIdentitySha256
      && !await providerFailureRefusal(c, gameId, worldId, key), "A held question is not an admitted capacity failure");
  }
  const evidence = await capacityEvidence(c, gameId, commit.newIdentitySha256, start.ownerId);
  demand(new Set(evidence.map(r => r.imageSha256)).size >= 2, "Capacity failure on two distinct current-canonical images required");
  const binding = capacityBindingSchema.parse({ version: LEAN_CAPACITY_RECOVERY, gameId, worldId, ownerId: start.ownerId, childId: start.childId,
    baseCapMicroUsd: 6_000_000, capMicroUsd: LEAN_CAPACITY_RECOVERY_CAP, maxContinuations: LEAN_CAPACITY_RECOVERY_LIMIT, newQuestionTier: "default",
    sourceStartSha256: hash(start), sourceCommitSha256: hash(commit), completionGrantSha256: six.authorizationSha256,
    leanPinSha256: hash(leanReleaseReceipt(gameId)), recoveryPinSha256: hash(recovery), identitySha256: commit.newIdentitySha256,
    jobId: job.id, holdSha256: parkedHoldSha256(job), ledgerSha256: hash(stored.snapshot), ledgerRevision: stored.revision,
    committedMicroUsd: audit.committedMicroUsd, reservedMicroUsd: audit.reservedMicroUsd, retainedUnknowns, heldRequestKeys, capacityEvidence: evidence });
  return { binding, planSha256: hash(binding), start, game, job, stored };
}

/** Explicit ADMIN authority, once. Preserves snapshot bytes and the observed job; only the normal fenced worker wakes it. */
export async function authorizeLeanCapacityRecovery(c: Container, input: { gameId: string; operatorId: string; expectedPlanSha256: string }) {
  demand(/^[A-Za-z0-9_-]{1,160}$/.test(input.gameId) && /^[A-Za-z0-9_-]{1,200}$/.test(input.operatorId)
    && /^[a-f0-9]{64}$/.test(input.expectedPlanSha256), "Invalid capacity authorization");
  const { gameId, operatorId, expectedPlanSha256 } = input;
  const operator = await c.db.user.findUnique({ where: { id: operatorId }, select: { email: true } });
  demand(operator && (c.adminEmails ?? []).some(email => email.trim().toLowerCase() === operator.email.trim().toLowerCase()), "Verified administrator required");
  const old = await leanCapacityRecoveryOf(c.db, gameId);
  if (old) {
    demand(old.operatorId === operatorId && old.planSha256 === expectedPlanSha256, "Existing capacity authorization differs");
    return old;
  }
  const plan = await planLeanCapacityRecovery(c, gameId);
  demand(plan.planSha256 === expectedPlanSha256 && plan.start.operatorId === operatorId, "Plan or authorized operator changed");
  return c.db.$transaction(async tx => {
    const scoped = { ...c, db: tx as unknown as Container["db"], storage: new DbStorage(tx) }, fresh = await planLeanCapacityRecovery(scoped, gameId);
    const actor = await tx.user.findUnique({ where: { id: operatorId }, select: { email: true } });
    demand(actor && (c.adminEmails ?? []).some(email => email.trim().toLowerCase() === actor.email.trim().toLowerCase())
      && fresh.planSha256 === expectedPlanSha256 && fresh.start.operatorId === operatorId, "Administrator, source, hold or ledger changed");
    const gameFence = await tx.game.updateMany({ where: { id: gameId, status: fresh.game.status, updatedAt: fresh.game.updatedAt,
      deletedAt: null, ownerId: fresh.game.ownerId, childProfileId: fresh.game.childProfileId }, data: { updatedAt: new Date() } });
    const ledgerFence = await tx.worldBudgetLedger.updateMany({ where: { worldId: fresh.binding.worldId, revision: fresh.stored.revision }, data: { revision: { increment: 1 } } });
    demand(gameFence.count === 1 && ledgerFence.count === 1, "Concurrent capacity plan changed");
    const body = { ...fresh.binding, planSha256: expectedPlanSha256, operatorId, authorizedAt: new Date().toISOString(), automaticRelease: false as const };
    const receipt = leanCapacityReceiptSchema.parse({ ...body, authorizationSha256: hash(body) });
    await tx.auditLog.create({ data: { id: leanCapacityRecoveryId(gameId), actorType: "ADMIN", actorId: operatorId,
      action: LEAN_CAPACITY_RECOVERY_ACTION, entityType: "Game", entityId: gameId, metaJson: JSON.stringify(receipt) } });
    return receipt;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}
