import { detectiveAutomaticRecoveryQualified } from "./detective-automatic-recovery";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT } from "../../domain/generation/world-budget";
import { BACKGROUND_REVIEW_TRANSPORT, type BackgroundReviewBinding } from "../../domain/generation/background-review-round";
import { SUBJECT_POLICY_VERSION, SUBJECT_READER_V2, readSubjectAnswer, readSubjectAnswerV2, subjectPlanCanonical, subjectPlansForBoard } from "../../domain/generation/subject-policy";
import { localPatchBoardForVersion } from "../../domain/scene/local-patch-catalog";
import { validChildAge } from "../../domain/child-appearance";
import { worldsOwned } from "../world-catalog.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { prepareLocalPatchBoardReview, type LocalPatchBoardReviewDeps } from "./local-patch-board-review";
import { dualReviewQuestionCandidates } from "./local-patch-dual-review";
import { subjectStageRaw, type DualReviewProof } from "./local-patch-dual-evidence";
import { readLocalPatchExtraAttemptPlan } from "./local-patch-extra-attempt";
import { LocalPatchRetainedPurchaseStore } from "./local-patch-lifecycle";
import { admittedInterruption, continuationRecorded, isAutomaticReviewApproval, providerFailureRefusal, recoverPreparedLocalPatchReview,
  recoverPreparedLocalPatchReviews } from "./local-patch-review-interruption-recovery";
import { backgroundReviewWaiting, backgroundRoundOfKey } from "./continuity-background";
import { DUAL_VISUAL_REVIEW_V3, dualVisualReviewVersion } from "./visual-review-release";
import { sha256Bytes } from "./fixed-sprite";
import {
  SUBJECT_REVIEW_RECOVERY, SUBJECT_UPGRADE_ACTION, SUBJECT_UPGRADE_VERSION, subjectPlanOfHide, subjectUpgradeAuditId, subjectUpgradeOf,
  subjectUpgradeReceiptSchema, type SubjectUpgradeReceipt,
} from "./subject-enrollment";

/**
 * The opt-in, same-world upgrade of one paid local-patch world still in generation:
 * a read-only preflight, and a fenced, idempotent apply that writes the immutable
 * enrollment (subject-enrollment.ts) and then runs the ordinary interrupted-review
 * recovery. Identifiers are always supplied by the caller; nothing here names a
 * customer. Nothing is deleted, repriced, re-settled or overwritten: every paid row,
 * receipt, image and the original identity stay exactly as they are, and the normal
 * queue continues the world under the new requirements for all 27 appearances.
 */
const PLAN_VERSION = "local-patch-subject-upgrade-plan/v1";
/** The world worker's takeover window (local-patch-world.ts LOCAL_PATCH_LEASE_MS). */
const LEASE_MS = 6 * 60_000;
const BLOCKING_STEPS = ["local-patch:quality-failed", "local-patch:recovery-exhausted"];
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const NO_RESPONSE_REASON = "Grouped review charge could not be verified";

export type SubjectUpgradePlan = {
  readonly version: typeof PLAN_VERSION; readonly gameId: string;
  readonly eligible: boolean; readonly refusals: readonly string[]; readonly alreadyEnrolled: boolean;
  /** The enrollment apply would write, less its operator fields. */
  readonly receipt: Omit<SubjectUpgradeReceipt, "operatorId" | "actorType" | "authorizationSha256" | "enrolledAt"> | null;
  readonly budget: {
    readonly capMicroUsd: number; readonly settledMicroUsd: number; readonly reservedMicroUsd: number;
    readonly committedMicroUsd: number; readonly remainingMicroUsd: number; readonly held: boolean;
    readonly unknown: readonly { readonly requestKey: string; readonly reserveMicroUsd: number; readonly continuedBy: string | null;
      readonly noResponse: boolean; readonly boundHideId: string | null }[];
    readonly reviewRecoveryV1: number; readonly reviewRecoveryV2: number; readonly reviewRecoveryV2Needed: number;
  } | null;
  readonly job: { readonly status: string; readonly currentStep: string | null; readonly activeLease: boolean } | null;
  readonly hides: readonly { readonly hideId: string; readonly status: string | null; readonly attempts: number;
    readonly subjectApproved: boolean; readonly warmHat: boolean }[];
  readonly subjectReviewsNeeded: number;
  readonly planSha256: string;
};

export class SubjectUpgradeRefused extends Error {
  constructor(readonly refusals: readonly string[]) { super(`SUBJECT_UPGRADE: refused: ${refusals.join("; ")}`); this.name = "SubjectUpgradeRefused"; }
}

/** Read-only. Never reserves, writes, asks a provider or changes the queue. */
export async function planSubjectUpgrade(c: Container, input: { gameId: string; ownerId: string },
  deps: Pick<LocalPatchBoardReviewDeps, "readBoardArt"> = {}): Promise<SubjectUpgradePlan> {
  const refusals: string[] = [];
  const refuse = (reason: string) => { refusals.push(reason); };
  const game = await c.db.game.findUnique({ where: { id: input.gameId }, include: { scenes: { orderBy: { orderIndex: "asc" } }, orders: true, childProfile: true } });
  const empty = { version: PLAN_VERSION, gameId: input.gameId, alreadyEnrolled: false, receipt: null, budget: null, job: null, hides: [], subjectReviewsNeeded: 0 } as const;
  if (!game || game.ownerId !== input.ownerId) return seal({ ...empty, eligible: false, refusals: ["no game of this owner"] });
  const alreadyEnrolled = !!await subjectUpgradeOf(c.db, game.id);
  if (game.styleVersion !== "local-patch-world-v1") refuse("not a local-patch world");
  if (game.status !== "TARGETS_GENERATING" || game.deletedAt || game.configJson || game.readyAt) refuse(`the world is ${game.status}, not in generation; a delivered, deleted or stopped world is never upgraded`);
  if (game.scenes.length !== 9 || game.scenes.some(s => s.sceneVersion !== 12) || worldsOwned(game.scenes.map(s => s.sceneSlug)).length !== 1)
    refuse("the world is not one complete nine-board v12 world");
  if (!game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    || game.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt)) refuse("there is no confirmed, unrefunded payment by the owner");
  if (await dualVisualReviewVersion(c.db, game.id) !== DUAL_VISUAL_REVIEW_V3) refuse("the world is not pinned to dual review v3");
  if (await readLocalPatchExtraAttemptPlan(c, game.id)) refuse("an extra-attempt authority is open for this world");
  if (!c.visualReview || !c.backgroundReview) refuse("the HIGH review transports (synchronous and background) are not both configured");
  const child = game.childProfile;
  let identitySha256: string | null = null, photoSha256: string | null = null;
  if (!child || child.deletedAt || child.ownerId !== game.ownerId || !validChildAge(child.ageYears) || !child.identityAssetId) refuse("the child profile, its age or its identity is not live");
  else {
    const identity = await c.db.asset.findUnique({ where: { id: child.identityAssetId } });
    if (!identity || identity.ownerId !== game.ownerId || identity.type !== "IDENTITY_SHEET" || identity.visibility !== "PRIVATE"
      || identity.status !== "READY" || identity.deletedAt) refuse("the original identity is not a live private asset of this owner");
    else identitySha256 = sha256Bytes(await c.storage.get(identity.storagePath));
    const photo = child.originalPhotoAssetId ? await c.db.asset.findUnique({ where: { id: child.originalPhotoAssetId } }) : null;
    if (!photo || photo.ownerId !== game.ownerId || photo.type !== "ORIGINAL_PHOTO" || photo.visibility !== "PRIVATE" || photo.status !== "READY" || photo.deletedAt)
      refuse("the privately owned original photograph is no longer available; the subject review cannot accept anything without it");
    else photoSha256 = sha256Bytes(await c.storage.get(photo.storagePath));
  }
  const boards = game.scenes.map(scene => localPatchBoardForVersion(scene.sceneSlug, 12));
  let planSha256: string | null = null;
  try { planSha256 = sha(JSON.stringify(boards.map(board => board ? subjectPlansForBoard(board).map(subjectPlanCanonical) : null))); }
  catch (error) { refuse(error instanceof Error ? error.message : String(error)); }
  if (boards.some(board => !board)) refuse("a board has no authored v12 placements");

  const job = await c.db.generationJob.findUnique({ where: { id: `job_${game.id}` } });
  const activeLease = !!job && job.status === "RUNNING" && job.updatedAt.getTime() > Date.now() - LEASE_MS;
  if (!job) refuse("the world has no generation job");
  else if (activeLease) refuse("a worker holds the world's lease; apply after it yields, never alongside it");
  else if (job.currentStep && BLOCKING_STEPS.includes(job.currentStep)) refuse(`the job is parked at ${job.currentStep}, which this upgrade does not reopen`);

  // The ledger, read as it is: nothing is released, repriced or settled here.
  const worldId = boardWizardWorldId(game.id), budget = boardWizardBudgetOf(c), audit = await budget.audit(worldId);
  if (audit.overCapMicroUsd || audit.overrunRequestKeys.length || audit.conflictRequestKeys.length) refuse("the ledger has an overrun, conflict or is over its cap");
  if (audit.pendingRequestKeys.length) refuse("a supplier request is still pending; wait for its genuine outcome before changing the world policy");
  const store = new LocalPatchRetainedPurchaseStore(c, game.id, budget);
  const candidates = new Map<string, string>();
  const version = await dualVisualReviewVersion(c.db, game.id);
  const uncontinued = await Promise.all(audit.unknownRequestKeys.map(async key => await budget.readContinuationApproval(worldId, key) ? null : key));
  const unknownBoards = new Set(uncontinued.flatMap(key => key ? /^self-repair:board:([a-z]+):/.exec(key)?.[1] ?? [] : []));
  if (version && game.status === "TARGETS_GENERATING" && !game.deletedAt) for (const scene of game.scenes) {
    if (!unknownBoards.has(scene.sceneSlug)) continue;
    for (const hide of localPatchBoardForVersion(scene.sceneSlug, 12)?.hides ?? []) {
    try {
      const prepared = await prepareLocalPatchBoardReview(c, { gameId: game.id, sceneId: scene.id }, deps,
        { includePlayerCandidates: true, playerReview: true, onlyHideId: hide.id });
      if (!prepared.ready) continue;
      for (const candidate of await dualReviewQuestionCandidates(c, prepared, version)) candidates.set(candidate.requestKey, prepared.request.hides[0]!.hideId);
    } catch (error) {
      // Reported as a refusal with its reason, never an eligible plan.
      refuse(`${scene.sceneSlug} cannot prepare its review evidence: ${(error instanceof Error ? error.message : String(error)).slice(0, 200)}`);
    }
    }
  }
  const unknown: { requestKey: string; reserveMicroUsd: number; continuedBy: string | null; noResponse: boolean; boundHideId: string | null }[] = [];
  let v1 = 0, v2 = 0, needed = 0;
  for (const requestKey of audit.unknownRequestKeys) {
    const request = await budget.readRequest(worldId, requestKey), approval = await budget.readContinuationApproval(worldId, requestKey);
    if (approval?.version === "world-automatic-review-recovery/v1") v1++;
    if (approval?.version === "world-automatic-review-recovery/v2") v2++;
    const retained = await store.get(worldId, requestKey);
    let noResponse = false;
    if (retained && !retained.evidence && retained.unknownReason === NO_RESPONSE_REASON) {
      try {
        const reply = JSON.parse(retained.bytes.toString()) as Record<string, unknown>;
        noResponse = reply.wireFault === "timeout" && reply.costUnknown === true && ["raw", "usage", "requestId", "model", "finishReason"].every(key => reply[key] === null);
      } catch { noResponse = false; }
    }
    const boundHideId = candidates.get(requestKey) ?? null;
    if (!approval) {
      if (!noResponse || !requestKey.startsWith("self-repair:board:")) refuse(`${requestKey} is an unknown charge that is not a no-response review interruption; it stays held for a person`);
      else if (!boundHideId) refuse(`${requestKey} is not bound to any current candidate question; it cannot be continued automatically`);
      else needed++;
    }
    unknown.push({ requestKey, reserveMicroUsd: request?.reserveMicroUsd ?? 0, continuedBy: approval?.version ?? null, noResponse, boundHideId });
  }
  if (v2 + needed > WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT) refuse(`${needed} further interrupted reviews exceed the enrolled bound of ${WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT}`);

  const rows = await c.db.targetVariantAsset.findMany({ where: { variant: "A", targetInstance: { gameScene: { gameId: game.id } } },
    include: { targetInstance: { select: { targetId: true, gameSceneId: true } } } });
  const hides = game.scenes.flatMap((scene, index) => (boards[index]?.hides ?? []).map(hide => {
    const row = rows.find(r => r.targetInstance.gameSceneId === scene.id && r.targetInstance.targetId === hide.targetId);
    const plan = subjectPlanOfHide(hide.id);
    let subjectApproved = false;
    try {
      const receipt = JSON.parse(row?.judgeJson ?? "null"), proof = receipt?.boardReview?.dual as DualReviewProof | undefined;
      const read = proof?.subject?.reader === SUBJECT_READER_V2 ? readSubjectAnswerV2 : readSubjectAnswer;
      const reading = proof?.subject && plan && child?.ageYears ? read(subjectStageRaw(proof.subject), { hideId: hide.id, ageYears: child.ageYears, plan }) : null;
      subjectApproved = row?.status === "GENERATED" && proof?.imageSha256 === receipt?.judgedSha256 && !!reading?.ok && reading.disposition === "pass";
    } catch { subjectApproved = false; }
    return { hideId: hide.id, status: row?.status ?? null, attempts: row?.attempts ?? 0, subjectApproved, warmHat: !!plan?.warmHat };
  }));
  const receipt = child && identitySha256 && photoSha256 && planSha256 && child.identityAssetId && child.originalPhotoAssetId && validChildAge(child.ageYears)
    ? { version: SUBJECT_UPGRADE_VERSION, gameId: game.id, ownerId: game.ownerId!, subjectPolicy: SUBJECT_POLICY_VERSION,
      continuityTransport: BACKGROUND_REVIEW_TRANSPORT, reviewRecovery: SUBJECT_REVIEW_RECOVERY, dualReviewRelease: DUAL_VISUAL_REVIEW_V3,
      photoAssetId: child.originalPhotoAssetId, photoSha256, identityAssetId: child.identityAssetId, identitySha256, ageYears: child.ageYears, planSha256 } as const
    : null;
  if (!receipt && !refusals.length) refuse("the enrollment's bindings could not be established");
  return seal({ version: PLAN_VERSION, gameId: game.id, eligible: !refusals.length, refusals, alreadyEnrolled, receipt,
    budget: { capMicroUsd: audit.capMicroUsd, settledMicroUsd: audit.settledMicroUsd, reservedMicroUsd: audit.reservedMicroUsd,
      committedMicroUsd: audit.committedMicroUsd, remainingMicroUsd: audit.remainingMicroUsd, held: audit.held, unknown,
      reviewRecoveryV1: v1, reviewRecoveryV2: v2, reviewRecoveryV2Needed: needed },
    job: job ? { status: job.status, currentStep: job.currentStep, activeLease } : null,
    hides, subjectReviewsNeeded: hides.filter(h => !h.subjectApproved).length });
}

/** The plan with its digest: the apply refuses any plan that is not the one the operator read. */
function seal(plan: Omit<SubjectUpgradePlan, "planSha256">): SubjectUpgradePlan {
  return { ...plan, planSha256: sha(JSON.stringify(plan)) };
}

/**
 * Fenced and idempotent. Writes the enrollment only for the exact plan the operator
 * read, only while no worker holds the lease, and in the same transaction that proves
 * the job and the world have not moved. Then the ordinary recovery continues the
 * interrupted review(s) it can, which re-queues the world through the normal queue.
 * Applying again changes nothing and runs the same recovery again.
 */
export async function applySubjectUpgrade(c: Container, input: { gameId: string; ownerId: string; operatorId: string; actorType?: "ADMIN" | "USER"; expectedPlanSha256: string },
  deps: Pick<LocalPatchBoardReviewDeps, "readBoardArt"> = {}): Promise<{ applied: boolean; receipt: SubjectUpgradeReceipt; recovered: number }> {
  if (input.actorType === "USER" && input.operatorId !== input.ownerId) throw new SubjectUpgradeRefused(["an owner may enroll only their own world"]);
  const existing = await subjectUpgradeOf(c.db, input.gameId);
  if (existing) {
    if (existing.ownerId !== input.ownerId) throw new SubjectUpgradeRefused(["the world is enrolled for another owner"]);
    return { applied: false, receipt: existing, recovered: await recoverEnrolledReviewInterruptions(c, input.gameId, deps) };
  }
  const plan = await planSubjectUpgrade(c, input, deps);
  if (!plan.eligible || !plan.receipt || !plan.job || !plan.budget) throw new SubjectUpgradeRefused(plan.refusals.length ? plan.refusals : ["the plan is incomplete"]);
  const expectedBudget = plan.budget;
  if (plan.planSha256 !== input.expectedPlanSha256) throw new SubjectUpgradeRefused(["the world changed since the preflight; read the plan again"]);
  const receipt = subjectUpgradeReceiptSchema.parse({ ...plan.receipt, operatorId: input.operatorId, actorType: input.actorType ?? "ADMIN",
    authorizationSha256: sha(JSON.stringify({ operatorId: input.operatorId, planSha256: plan.planSha256 })), enrolledAt: new Date().toISOString() });
  const id = subjectUpgradeAuditId(input.gameId), metaJson = JSON.stringify(receipt);
  try {
    await c.db.$transaction(async tx => {
      // Same Game -> Job order as deletion and generation's private-write fence.
      const live = await tx.game.updateMany({ where: { id: input.gameId, ownerId: input.ownerId, status: "TARGETS_GENERATING", deletedAt: null,
        configJson: null, readyAt: null, styleVersion: "local-patch-world-v1" }, data: { styleVersion: "local-patch-world-v1" } });
      const job = await tx.generationJob.findUniqueOrThrow({ where: { id: `job_${input.gameId}` } });
      // The job exactly as the plan read it, and no live lease: a write that changes nothing proves it.
      const fenced = await tx.generationJob.updateMany({ where: { id: job.id, status: plan.job!.status, currentStep: plan.job!.currentStep,
        NOT: { status: "RUNNING", updatedAt: { gt: new Date(Date.now() - LEASE_MS) } } }, data: { status: plan.job!.status } });
      if (fenced.count !== 1 || live.count !== 1) throw new SubjectUpgradeRefused(["the world or its job changed while enrolling; nothing was written"]);
      const current = await tx.game.findUniqueOrThrow({ where: { id: input.gameId }, include: { childProfile: true, scenes: true, orders: true } });
      const child = current.childProfile;
      const currentBudget = await boardWizardBudgetOf({ ...c, db: tx as unknown as Container["db"] }).audit(boardWizardWorldId(input.gameId));
      const privateAssets = await tx.asset.findMany({ where: { id: { in: [receipt.photoAssetId, receipt.identityAssetId] }, ownerId: receipt.ownerId,
        visibility: "PRIVATE", status: "READY", deletedAt: null } });
      if (!child || child.deletedAt || child.ownerId !== receipt.ownerId || child.ageYears !== receipt.ageYears
        || child.originalPhotoAssetId !== receipt.photoAssetId || child.identityAssetId !== receipt.identityAssetId
        || privateAssets.length !== 2 || !privateAssets.some(a => a.id === receipt.photoAssetId && a.type === "ORIGINAL_PHOTO")
        || !privateAssets.some(a => a.id === receipt.identityAssetId && a.type === "IDENTITY_SHEET")
        || current.scenes.length !== 9 || current.scenes.some(s => s.sceneVersion !== 12)
        || !current.orders.some(o => o.userId === receipt.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
        || current.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt)
        || currentBudget.pendingRequestKeys.length || currentBudget.overCapMicroUsd || currentBudget.conflictRequestKeys.length || currentBudget.overrunRequestKeys.length
        || currentBudget.capMicroUsd !== expectedBudget.capMicroUsd || currentBudget.committedMicroUsd !== expectedBudget.committedMicroUsd
        || JSON.stringify(currentBudget.unknownRequestKeys) !== JSON.stringify(expectedBudget.unknown.map(r => r.requestKey)))
        throw new SubjectUpgradeRefused(["payment, child, private evidence or ledger changed while enrolling; nothing was written"]);
      await tx.auditLog.create({ data: { id, actorType: receipt.actorType, actorId: input.operatorId, action: SUBJECT_UPGRADE_ACTION,
        entityType: "Game", entityId: input.gameId, metaJson } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const winner = await subjectUpgradeOf(c.db, input.gameId);
    if (!winner || winner.ownerId !== input.ownerId) throw error;
    return { applied: false, receipt: winner, recovered: await recoverEnrolledReviewInterruptions(c, input.gameId, deps) };
  }
  return { applied: true, receipt, recovered: await recoverEnrolledReviewInterruptions(c, input.gameId, deps) };
}

/** Room one targeted preparation needs before it starts: one appearance's evidence takes 40 to 70 s on real art. */
export const CONTINUE_PREPARE_NEED_MS = 75_000;

/**
 * local-patch-continue-in-slice/v1. The interrupted review answers holding this enrolled world's ledger, grouped by
 * the image each asked about (its background round's binding: appearance, variant, pixels). A cheap read: ledger,
 * retained records, round records. "blocked" when any uncontinued unknown answer is one the automatic continuation does
 * not admit (`admittedInterruption`) or cannot locate, so a person decides; an empty map when none is open.
 * A continuation is complete only once its image recorded it (`continuationRecorded`): an automatic approval written
 * by a pass that then stopped, or whose fence refused the image's write, stays open and is finished, never skipped.
 * Any other approval (a person's) is a decision already made. `why.reason` names exactly what blocks it.
 */
export async function openAdmittedInterruptions(c: Container, gameId: string, why: ContinuationWhy = {})
  : Promise<Map<string, { binding: BackgroundReviewBinding; requestKeys: string[] }> | "blocked"> {
  const blocked = (reason: string) => { why.reason = reason; return "blocked" as const; };
  // Not a world this continuation serves: nothing of it is blocked, so no reason replaces the world's own.
  if (!await subjectUpgradeOf(c.db, gameId)) return "blocked";
  const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(gameId), audit = await budget.audit(worldId);
  if (audit.unknownRequestKeys.length) {
    const selected = await c.db.game.findUnique({ where: { id: gameId }, include: { scenes: true } });
    if (selected?.scenes.some(scene => scene.sceneVersion === 13) && !await detectiveAutomaticRecoveryQualified(c.db, gameId))
      return blocked("Detective continuation requires its original fresh-world receipt and exact whole-family pin");
  }
  if (audit.overCapMicroUsd) return blocked(`the world ledger is over its cap by ${audit.overCapMicroUsd} micro-USD`);
  if (audit.conflictRequestKeys.length) return blocked(`charge evidence conflicts on ${audit.conflictRequestKeys.join(", ")}`);
  if (audit.overrunRequestKeys.length) return blocked(`charges exceed their reservations on ${audit.overrunRequestKeys.join(", ")}`);
  const store = new LocalPatchRetainedPurchaseStore(c, gameId, budget);
  const open = new Map<string, { binding: BackgroundReviewBinding; requestKeys: string[] }>();
  for (const requestKey of audit.unknownRequestKeys) {
    const approval = await budget.readContinuationApproval(worldId, requestKey);
    if (approval && (!isAutomaticReviewApproval(approval) || await continuationRecorded(c, gameId, approval))) continue;
    const retained = requestKey.startsWith("self-repair:board:") ? await store.get(worldId, requestKey) : null;
    const round = retained ? await backgroundRoundOfKey(c.db, gameId, worldId, requestKey) : null;
    const admitted = retained && !retained.evidence && round ? await admittedInterruption(c, gameId, worldId, requestKey, retained) : null;
    if (!retained || retained.evidence || !round || !admitted)
      return blocked(`${requestKey} is an unknown charge the automatic continuation does not admit (${!retained ? "no retained review answer"
        : retained.evidence ? "its retained answer carries a bill" : !round ? "no background round" : retained.unknownReason ?? "no reason recorded"})`
        + "; a person reconciles or authorizes it");
    // local-patch-lean-review-recovery/v1: a provider-declared failure of a kind never asked again (or past its image's
    // bound in a pinned world) stops here with exactly why, before a slice could yield to continue it.
    const refusal = admitted.shape === "provider-failed" ? await providerFailureRefusal(c, gameId, worldId, requestKey) : null;
    if (refusal) return blocked(`${refusal}; a person reconciles or authorizes it`);
    const image = `${round.intent.binding.variantId}:${round.intent.binding.imageSha256}`;
    open.set(image, { binding: round.intent.binding, requestKeys: [...(open.get(image)?.requestKeys ?? []), requestKey] });
  }
  return open;
}

/**
 * Whether this unknown answer's automatic continuation was already made and recorded on its image: the evidence a
 * world parked on it can be resumed by, once an earlier pass continued it and stopped before releasing (Codex round 17).
 */
export async function reviewContinuationRecorded(c: Container, gameId: string, requestKey: string): Promise<boolean> {
  if (!requestKey.startsWith("self-repair:board:")) return false;
  const approval = await boardWizardBudgetOf(c).readContinuationApproval(boardWizardWorldId(gameId), requestKey);
  return !!approval && await continuationRecorded(c, gameId, approval);
}

/**
 * Every open interruption of this world (`openAdmittedInterruptions`) continued: each image's interrupted questions
 * together, only that appearance prepared, one image at a time while `deadlineAt` leaves room. Nothing is bought, and
 * the job is left as it is. Returns "blocked" (a person decides; `why.reason` says exactly why), "none" (nothing
 * open), "partial" (time ran out; the next pass continues the rest) or "done". `fence`: the claim of the slice that
 * continues, checked inside each write.
 */
export async function continueAdmittedReviewInterruptions(c: Container, gameId: string,
  deps: Pick<LocalPatchBoardReviewDeps, "readBoardArt">, deadlineAt: number,
  fence?: (tx: Prisma.TransactionClient) => Promise<void>, why: ContinuationWhy = {}): Promise<"blocked" | "none" | "partial" | "done"> {
  const blocked = (reason: string) => { why.reason = reason; return "blocked" as const; };
  const open = await openAdmittedInterruptions(c, gameId, why);
  if (open === "blocked") return "blocked";
  if (!open.size) return "none";
  const version = await dualVisualReviewVersion(c.db, gameId);
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { scenes: true } });
  if (!version || !game || game.status !== "TARGETS_GENERATING" || game.deletedAt) return blocked("the game is no longer a paid world in generation under a dual review release");
  // A question still asked about the same image ends first: an image's interruptions are continued together, never one
  // ahead of a sibling question of its own round. Meanwhile the world stays queued and its slices poll that round, as
  // for any question in flight (cancelled at its deadline, ended by whatever the provider reports, or `missing`).
  const asking = await backgroundReviewWaiting(c.db, gameId, { inFlightOnly: true });
  let deferred = false;
  for (const [image, { binding, requestKeys }] of open) {
    if (asking.has(image)) { deferred = true; continue; }
    if (deadlineAt - Date.now() < CONTINUE_PREPARE_NEED_MS) return "partial";
    const scene = game.scenes.find(s => requestKeys[0]!.startsWith(`self-repair:board:${s.sceneSlug}:`));
    if (!scene || requestKeys.some(key => !key.startsWith(`self-repair:board:${scene.sceneSlug}:`)))
      return blocked(`${requestKeys.join(", ")} name no single board of this world`);
    const prepared = await prepareLocalPatchBoardReview(c, { gameId, sceneId: scene.id }, deps,
      { includePlayerCandidates: true, playerReview: true, onlyHideId: binding.hideId });
    const entry = prepared.ready ? prepared.entries.find(e => e.hide.id === binding.hideId) : undefined;
    // Only the pixels the questions asked about: another image is another question. Either refusal below is also what a
    // pass sees when a concurrent pass has just continued this image, so it is marked transient.
    if (!prepared.ready || !entry || entry.row.id !== binding.variantId || entry.imageSha256 !== binding.imageSha256) {
      why.transient = true;
      return blocked(`${requestKeys.join(", ")}: the appearance ${binding.hideId} is no longer the image those questions asked about`);
    }
    const candidates = await dualReviewQuestionCandidates(c, prepared, version);
    const questions = requestKeys.map(requestKey => candidates.find(item => item.requestKey === requestKey));
    if (questions.some(q => !q)) { why.transient = true; return blocked(`${requestKeys.join(", ")}: the interrupted questions cannot be rebuilt on the same pixels`); }
    if (!await recoverPreparedLocalPatchReviews(c, prepared,
      questions.map(q => ({ ...q! })),
      fence, { releaseParkedJob: false, admitProviderFailed: true, roundCandidates: candidates, why })) return blocked(why.reason ?? `${requestKeys.join(", ")}: not continued`);
  }
  return deferred ? "partial" : "done";
}

/** Why the automatic continuation cannot go on, in words a person can act on. `transient`: a concurrent pass may have
 * just continued the same image (its pixels, question or row moved under this one), so another turn decides. */
export type ContinuationWhy = { reason?: string; transient?: boolean };

/**
 * What a resumption does once every interruption it saw was continued, read fresh: release the hold when the ledger is
 * free; explain it only when a permanent blocker is found now; otherwise wait for another turn. The ledger can be held
 * again by an interruption that arrived meanwhile (a concurrent tick's background sweep marks another answer unknown,
 * Codex round 21): one the continuation admits is continued by a later turn, never explained as a stop.
 */
export async function resumptionAfterContinuation(c: Container, gameId: string)
  : Promise<{ action: "release" } | { action: "retry" } | { action: "explain"; reason: string }> {
  if (!(await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId))).held) return { action: "release" };
  const why: ContinuationWhy = {};
  return await openAdmittedInterruptions(c, gameId, why) === "blocked" && why.reason ? { action: "explain", reason: why.reason } : { action: "retry" };
}

/**
 * An enrolled world's interrupted dual-review questions, found again by rebuilding
 * each board's current candidate questions (read-only) and continued through the
 * ordinary recovery (v1 while its two records last, then v2). Nothing is bought; a
 * continuation retains the whole unknown charge and re-queues the world.
 */
export async function recoverEnrolledReviewInterruptions(c: Container, gameId: string,
  deps: Pick<LocalPatchBoardReviewDeps, "readBoardArt"> = {}): Promise<number> {
  if (!await subjectUpgradeOf(c.db, gameId)) return 0;
  const version = await dualVisualReviewVersion(c.db, gameId);
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { scenes: true } });
  if (!version || !game || game.status !== "TARGETS_GENERATING" || game.deletedAt
    || game.scenes.some(scene => scene.sceneVersion === 13) && !await detectiveAutomaticRecoveryQualified(c.db, gameId)) return 0;
  const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(gameId), audit = await budget.audit(worldId);
  const pending = await Promise.all(audit.unknownRequestKeys.filter(key => key.startsWith("self-repair:board:"))
    .map(async key => await budget.readContinuationApproval(worldId, key) ? null : key));
  const unknown = new Set(pending.filter((key): key is string => key !== null));
  let recovered = 0;
  for (const scene of game.scenes) {
    if (!unknown.size) break;
    if (![...unknown].some(key => key.startsWith(`self-repair:board:${scene.sceneSlug}:`))) continue;
    for (const hide of localPatchBoardForVersion(scene.sceneSlug, scene.sceneVersion)?.hides ?? []) {
    if (!unknown.size) break;
    const prepared = await prepareLocalPatchBoardReview(c, { gameId, sceneId: scene.id }, deps,
      { includePlayerCandidates: true, playerReview: true, onlyHideId: hide.id });
    if (!prepared.ready) continue;
    for (const candidate of await dualReviewQuestionCandidates(c, prepared, version)) {
      if (!unknown.has(candidate.requestKey)) continue;
      if (await recoverPreparedLocalPatchReview(c, { ...prepared, requestKey: candidate.requestKey, fingerprint: candidate.fingerprint },
        undefined, { ...candidate })) { recovered++; unknown.delete(candidate.requestKey); }
      break;
    }
    }
  }
  return recovered;
}
