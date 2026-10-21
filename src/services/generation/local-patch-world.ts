import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { type LocalPatchBoard, type LocalPatchHide } from "../../domain/scene/local-patch-hides";
import { ALL_LOCAL_PATCH_BOARDS, localPatchBoardForVersion, isLocalPatchAdvisoryVersion, isLocalPatchStrictVersion } from "../../domain/scene/local-patch-catalog";
import { worldsOwned } from "../world-catalog.service";
import { deliverLocalPatchNotifications } from "../local-patch-notifications";
import { GenerationPaused, boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { retainedPurchaseKeysFor } from "../../infra/db/prisma-retained-purchase-store";
import { buyLocalPatch, localPatchImagePolicyForVersion, localPatchRenderPolicySha256 } from "../../infra/generation/openai-local-patch";
import { fenceLocalPatchImages } from "./local-patch-lifecycle";
import { env } from "../../lib/env";
import { identityRevisionPending } from "./identity-source-revision-state";
import { finishLocalPatchGame } from "./local-patch-player";
import { deliverGameMail } from "../publish.service";
import { SYSTEM } from "../audit.service";
import { prepareLocalPatchBoardReview, reviewLocalPatchBoard, localPatchBoardReviewKeys, type LocalPatchBoardReviewDeps } from "./local-patch-board-review";
import { transitionGame } from "../game-status";
import { LOCAL_PATCH_MIN_PROVIDER_MS, LOCAL_PATCH_PHASE_MARGIN_MS } from "./local-patch-render";
import { localPatchAttemptPlan, localPatchSettled, localPatchFinalRepairAllowed, LOCAL_PATCH_NORMAL_ATTEMPTS } from "../../domain/scene/local-patch-attempts";
import { localPatchNeedsRecomposition, recomposeLocalPatchHide } from "./local-patch-recompose";
import { runLocalPatchPaidRepair, LOCAL_PATCH_PAID_REPAIR_ACTION, LocalPatchPaidRepairError } from "./local-patch-paid-repair";
import { readLocalPatchExtraAttemptPlan } from "./local-patch-extra-attempt";
import { needsSelfRepair, selfRepairEnabled } from "../../domain/scene/local-patch-self-repair";
import { needsPlayerReview, playerReviewEnabled } from "./local-patch-player-review";
import { runLocalPatchSelfRepair, SELF_REPAIR_REQUEST_ACTION, type SelfRepairDeps } from "./local-patch-self-repair";
import { WorldBudgetError } from "./world-budget";
import { recoverLocalPatchImageInterruptions } from "./local-patch-interruption-recovery";
import { recoverPreparedLocalPatchReview } from "./local-patch-review-interruption-recovery";
import { activateLocalPatchEmergencyBudget } from "./local-patch-budget-recovery";
import { localPatchEvidenceRecovery, LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS } from "./local-patch-review-recovery";
import { localPatchRetainedAnswerUndecided, localPatchContinuityPending } from "./local-patch-dual-evidence";
import { hasDualVisualReview } from "./visual-review-release";
import { localPatchPainterRelease, painterReleasePolicy, type LocalPatchPainterRelease } from "./painter-release";
import { advanceQualityBatches } from "./quality-batch";
import { subjectUpgradeOf } from "./subject-enrollment";
import { subjectRejudgePending } from "./subject-rejudge";
import { LOCAL_PATCH_BOARD_REVIEW_MIN_MS, localPatchBoardAwaitsProvider, localPatchProgressOrder, localPatchRestDecision, localPatchRestOf,
  localPatchReviewFits, selfRepairProgress, type LocalPatchRest } from "../../domain/scene/local-patch-progress";
import { continueAdmittedReviewInterruptions, openAdmittedInterruptions, recoverEnrolledReviewInterruptions, resumptionAfterContinuation,
  reviewContinuationRecorded, type ContinuationWhy } from "./subject-upgrade";
import { advanceContinuityInBackground } from "./continuity-background";
import { enrollLeanWorld } from "./lean-enrollment";
import { isLeanWorld } from "./lean-release";
import { boundLeanRecoveryHold } from "./lean-review-recovery-pin";
import { leanSubjectOnlyRefusal } from "./lean-repair";
import {
  LOCAL_PATCH_MAX_ATTEMPTS, LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT, runLocalPatchHide,
  type LocalPatchHideDeps, type LocalPatchHideOutcome,
} from "./local-patch-hide";

/**
 * A world's version-pinned hides, one slice at a time, under a lease.
 *
 * The hide itself is the unit of work and it already survives being interrupted.
 * What this adds is the part a queue needs: deciding WHICH hide is next, holding
 * the work while it runs so two workers cannot paint the same child twice, and
 * letting a dead worker's claim be taken over without anyone declaring it dead
 * by hand.
 *
 * There is no capsule. The state of a world is the rows themselves - a hide is
 * done when its variant row says so - which means there is nothing to keep in
 * step with the truth and nothing that can disagree with it.
 *
 * The lease is a takeover window, not a lock: a worker that stops answering for
 * `LOCAL_PATCH_LEASE_MS` can be replaced. That is safe here precisely because
 * the layer underneath refuses to buy the same request key twice - a taken-over
 * worker's half-finished hide is replayed, not repurchased - so the worst a
 * wrong takeover costs is a duplicated free read.
 */

/** Games this engine owns. Nothing else may route here, and it routes nowhere else. */
export const LOCAL_PATCH_STYLE = "local-patch-world-v1";
/** After this long without a heartbeat, another worker may take the work. */
export const LOCAL_PATCH_LEASE_MS = 6 * 60_000;
/** A slice that cannot finish one paid hide should not start one. */
export const LOCAL_PATCH_MIN_SLICE_MS = 240_000;
/** How many hides one tick paints unless told otherwise. */
export const LOCAL_PATCH_HIDES_PER_SLICE = 1;
/**
 * The job is parked here when a reservation is held for something that was
 * never dispatched.
 *
 * A durable marker rather than a returned string, because the distinction is
 * invisible from the ledger: the next tick would see an ordinary pending
 * reservation, read it as a worker still waiting, and queue itself again
 * forever without buying or finishing anything. This is what stops that, and
 * what tells whoever looks why.
 */
export const LOCAL_PATCH_NEEDS_RELEASE = "local-patch:needs-release";
/** Terminal visual/technical quality failure, not an accounting operator hold. */
export const LOCAL_PATCH_QUALITY_FAILED = "local-patch:quality-failed";
/** Operational budget outage: stay in generation, retry with backoff, never ask the parent to approve pictures. */
export const LOCAL_PATCH_RECOVERY_BUDGET_WAIT = "local-patch:recovery-budget-wait";
export const LOCAL_PATCH_RECOVERY_BACKOFF_MS = 60 * 60_000;
export const LEAN_RECOVERY_BACKOFF_MS = 3 * 60_000;
export const LOCAL_PATCH_EVIDENCE_RETRY_WAIT = "local-patch:evidence-retry-wait";
/**
 * No automatic action remains within policy: every unfinished appearance has
 * used its evidence questions, or the next required purchase cannot fit the
 * authorized world budget and nothing in flight can return capacity. Parked
 * for a service decision, said so to the parent, and never polled: waiting
 * cannot change it. Nothing is deleted, approved or handed to the parent.
 */
export const LOCAL_PATCH_RECOVERY_EXHAUSTED = "local-patch:recovery-exhausted";
const PARKED_STEPS = [LOCAL_PATCH_NEEDS_RELEASE, LOCAL_PATCH_RECOVERY_EXHAUSTED];
export const LOCAL_PATCH_CONTINUE_IN_SLICE = "local-patch-continue-in-slice/v1";
/**
 * The hold the engine itself writes when a review answer's charge cannot be stated (`paid-operation.ts`):
 * `<requestKey>: the result is kept but its charge cannot be stated (…)`, or `…: the provider answered and its charge
 * cannot be stated (…)`. A review refused before anything was reserved names its key too, and is not this.
 */
export const LOCAL_PATCH_INTERRUPTION_HOLD = /^self-repair:board:[a-z0-9-]+:[0-9a-f]{64}: (the result is kept but|the provider answered and) its charge cannot be stated \(/;

/**
 * local-patch-continue-in-slice/v1 (Codex rounds 14 to 16). An enrolled world whose ledger is held only by review answers
 * the automatic continuation admits (`openAdmittedInterruptions`) is never parked for a person: it yields, queued, and
 * stays a candidate of the scheduled selection; the next slice starts by continuing them
 * (`continueAdmittedReviewInterruptions`) under its own claim, so no parked job is ever released.
 *
 * A world parked before this existed is resumed in its own slice (a tick that names it, or the scheduled tick's
 * local-patch-parked-wake/v1 turn), and only when the hold the engine recorded names one of its own review interruptions
 * (`<requestKey>: …`): one still open, or one an earlier pass already continued and recorded on its image (that pass may
 * have stopped before the next image or the release). The job is re-queued only once nothing is open and the ledger is
 * no longer held, compared on the hold it observed, so a hold placed meanwhile stays.
 *
 * A refusal that waiting cannot change replaces the engine's own interruption hold with exactly why (Codex round 19), on
 * the same comparison: the park then says what a person must reconcile or authorize, and is never woken again. Time
 * running out, a question still in flight, or a refusal a concurrent resumption of the same image can cause (`transient`)
 * leaves the hold for the next turn. Any other hold is left as it is.
 *
 * local-patch-lean-review-recovery/v1: a hold a person released this world from (`boundLeanRecoveryHold`: the exact
 * job, reason and moment they read) is resumed the same way, on the held requests their release names.
 */
async function resumeParkedInterruption(c: Container, gameId: string, observed: { id: string; lastError: string | null; updatedAt: Date },
  deps: Pick<LocalPatchBoardReviewDeps, "readBoardArt">, deadlineAt: number): Promise<void> {
  if (await identityRevisionPending(c.db, gameId)) return;
  const unchanged = { id: observed.id, status: "FAILED", currentStep: LOCAL_PATCH_NEEDS_RELEASE, lastError: observed.lastError, updatedAt: observed.updatedAt };
  const bound = await boundLeanRecoveryHold(c.db, gameId, observed);
  const writeUnrevisedHold = async (data: { lastError: string | null; status?: string; currentStep?: string }) => c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, gameId);
    if (!await identityRevisionPending(tx, gameId)) await tx.generationJob.updateMany({ where: unchanged, data });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const explain = async (reason: string) => { if (bound || LOCAL_PATCH_INTERRUPTION_HOLD.test(observed.lastError ?? ""))
    await writeUnrevisedHold({ lastError: `${LOCAL_PATCH_CONTINUE_IN_SLICE}: ${reason}`.slice(0, 500) }); };
  const why: ContinuationWhy = {};
  const open = await openAdmittedInterruptions(c, gameId, why);
  if (open === "blocked") return explain(why.reason ?? "the automatic continuation cannot serve this world");
  const named = bound ? bound.heldRequestKeys : [observed.lastError?.split(": ")[0] ?? ""];
  for (const key of named) if (![...open.values()].some(item => item.requestKeys.includes(key)) && !await reviewContinuationRecorded(c, gameId, key))
    return explain(`${key} is neither an interruption the automatic continuation admits nor one it already continued and recorded`);
  if (open.size) {
    const continued = await continueAdmittedReviewInterruptions(c, gameId, deps, deadlineAt, undefined, why);
    // A concurrent resumption (the scheduled turn and the owner's tick) may have just continued the same image: never
    // explained over, so its own release is not undone; the next turn decides from what was recorded.
    if (continued === "blocked" && !why.transient) return explain(why.reason ?? `${named.join(", ")}: not continued`);
    if (continued !== "done") return;
  }
  const next = await resumptionAfterContinuation(c, gameId);
  if (next.action === "explain") return explain(next.reason);
  if (next.action === "retry") return;
  await writeUnrevisedHold({ status: "QUEUED", currentStep: "local-patch", lastError: null });
}

export type LocalPatchSliceResult = {
  readonly gameId: string;
  /** There is still runnable work: another tick should come. */
  readonly pending: boolean;
  /** Nothing was claimed - somebody else holds it, or it is not this engine's. */
  readonly claimed: boolean;
  readonly paused: boolean;
  /** Why this world is waiting for a person, when it is. Durable on the job too. */
  readonly attention: string | null;
  readonly outcomes: readonly LocalPatchHideOutcome[];
  /** Boards this build cannot paint, and why. Named rather than left to fail one by one. */
  readonly blocked: readonly { readonly boardId: string; readonly reason: string }[];
};


/**
 * Can this build paint this board at all?
 *
 * Authoring may introduce an unsupported board later. Refuse that explicitly
 * instead of discovering a laptop-only input after a paid identity stage.
 */
export function localPatchBoardBlockedReason(board: LocalPatchBoard): string | null {
  return board.art.startsWith("public/") ? null
    : `${board.board} is authored from ${board.art}, which is not shipped art`;
}

export function localPatchBoardFor(sceneSlug: string, version = 6): LocalPatchBoard | null {
  return localPatchBoardForVersion(sceneSlug, version);
}

/** Scheduling hint: an accepted row already carries a subject stage for its current pixels. */
export function subjectStageCurrent(row: { judgeJson: string | null }, expectedIdentitySha256?: string): boolean {
  try {
    const receipt = JSON.parse(row.judgeJson ?? "null"), dual = receipt?.boardReview?.dual;
    return !!dual?.subject && dual.imageSha256 === receipt.judgedSha256
      && (!expectedIdentitySha256 || dual.identitySha256 === expectedIdentitySha256);
  } catch { return false; }
}

export async function runLocalPatchWorldSlice(c: Container, deps: LocalPatchHideDeps, gameId: string, options: {
  readonly hardDeadlineAt?: number;
  readonly maxHides?: number;
  /** Synthetic provider injection; production uses the same existing credential. */
  readonly boardJudge?: LocalPatchBoardReviewDeps["judge"];
  /** Synthetic correction review; production still uses the existing key. */
  readonly repairJudge?: Parameters<typeof runLocalPatchPaidRepair>[2]["judge"];
  readonly diagnose?: SelfRepairDeps["diagnose"];
} = {}): Promise<LocalPatchSliceResult> {
  const empty = { gameId, outcomes: [], blocked: [] as { boardId: string; reason: string }[], attention: null as string | null };
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { scenes: { orderBy: { orderIndex: "asc" } } } });
  if (!game || game.deletedAt || game.styleVersion !== LOCAL_PATCH_STYLE) return { ...empty, pending: false, claimed: false, paused: false };
  // A refund or an operator stop is a dispatch barrier. Never resurrect a
  // stopped game by ticking it directly.
  if (game.status !== "TARGETS_GENERATING") return { ...empty, pending: false, claimed: false, paused: false };
  if (await identityRevisionPending(c.db, gameId)) return { ...empty, pending: false, claimed: false, paused: true,
    attention: "The rejected reference is undergoing a bound source revision; no board is bought or published" };
  const advisory = game.scenes.length > 0 && game.scenes.every(scene => isLocalPatchAdvisoryVersion(scene.sceneVersion));
  const strict = game.scenes.length > 0 && game.scenes.every(scene => isLocalPatchStrictVersion(scene.sceneVersion));
  const automatic = game.scenes.length === 9 && game.scenes.every(scene => selfRepairEnabled(scene.sceneVersion));
  if (game.scenes.some(scene => isLocalPatchAdvisoryVersion(scene.sceneVersion))
    && (!advisory || new Set(game.scenes.map(scene => scene.sceneVersion)).size !== 1)) {
    throw new Error("LOCAL_PATCH_WORLD: mixed legacy and five-hide scene versions are not a valid world");
  }
  // The catalog can offer several worlds under one content version. A purchase
  // still owns one complete nine-board world; reject a mixed selection before
  // recovery, reservation or provider dispatch can spend against it.
  if (game.scenes.length >= 9 && (game.scenes.length !== 9 || worldsOwned(game.scenes.map(scene => scene.sceneSlug)).length !== 1)) {
    throw new Error("LOCAL_PATCH_WORLD: all nine boards must belong to one complete world");
  }
  // local-patch-slice-pacing/v1: the provider passes below name each question whose answer the provider has just
  // said is still running (nothing in its board can move before it ends), take turns among their rounds, and stop
  // with room for one board review.
  const stillRunning = new Set<string>();
  const pollDeadlineAt = options.hardDeadlineAt === undefined ? undefined
    : options.hardDeadlineAt - LOCAL_PATCH_BOARD_REVIEW_MIN_MS - LOCAL_PATCH_PHASE_MARGIN_MS;
  // Existing provider work is reconciled before a held job or sibling scheduling can
  // defer it beyond the background response's short retention. No new request here.
  // A job parked for a person reviews nothing this slice: its responses get the whole slice. The world's claim
  // counter, one step per slice, decides where each pass starts.
  if (automatic && await subjectUpgradeOf(c.db, gameId)) {
    const ahead = await c.db.generationJob.findUnique({ where: { id: `job_${gameId}` }, select: { currentStep: true, attempts: true } });
    const parked = !!ahead?.currentStep && PARKED_STEPS.includes(ahead.currentStep);
    await advanceContinuityInBackground(c, gameId, { deadlineAt: parked ? options.hardDeadlineAt : pollDeadlineAt, running: stillRunning,
      turn: ahead?.attempts ?? 0 });
  }
  // A v7 hide buys only its image. Reuse the dispatch boundary's conservative
  // minimum, then let it recheck after reservation and bound the actual call.
  const minHideMs = advisory ? LOCAL_PATCH_MIN_PROVIDER_MS.render + LOCAL_PATCH_PHASE_MARGIN_MS : LOCAL_PATCH_MIN_SLICE_MS;
  if (options.hardDeadlineAt !== undefined && options.hardDeadlineAt - Date.now() < minHideMs) {
    return { ...empty, pending: true, claimed: false, paused: false };
  }

  let job = await c.db.generationJob.findUnique({ where: { id: `job_${gameId}` } });
  if (!job) return { ...empty, pending: false, claimed: false, paused: false };
  // local-patch-continue-in-slice/v1: a world the engine parked on one of its own interruptions that is now admitted.
  if (automatic && job.currentStep === LOCAL_PATCH_NEEDS_RELEASE && await subjectUpgradeOf(c.db, gameId)) {
    await resumeParkedInterruption(c, gameId, job, { readBoardArt: deps.readBoardArt },
      (options.hardDeadlineAt ?? Date.now() + 270_000) - LOCAL_PATCH_PHASE_MARGIN_MS);
    job = await c.db.generationJob.findUniqueOrThrow({ where: { id: job.id } });
  }
  if (automatic && job.currentStep === LOCAL_PATCH_NEEDS_RELEASE) {
    await recoverLocalPatchImageInterruptions(c, gameId);
    const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(gameId);
    const audit = await budget.audit(worldId);
    if (game.scenes.every(scene => scene.sceneVersion === 12) && audit.unknownRequestKeys.some(key => key.startsWith("self-repair:board:"))) {
      for (const scene of game.scenes) {
        const prepared = await prepareLocalPatchBoardReview(c, { gameId, sceneId: scene.id }, { readBoardArt: deps.readBoardArt });
        if (prepared.ready && audit.unknownRequestKeys.includes(prepared.requestKey)) await recoverPreparedLocalPatchReview(c, prepared);
        else if (playerReviewEnabled() && (!prepared.ready || !prepared.extraPlan)) {
          const calibrated = await prepareLocalPatchBoardReview(c, { gameId, sceneId: scene.id }, { readBoardArt: deps.readBoardArt },
            { includePlayerCandidates: true, playerReview: true });
          if (calibrated.ready && audit.unknownRequestKeys.includes(calibrated.requestKey))
            await recoverPreparedLocalPatchReview(c, calibrated);
        }
      }
      // An enrolled world's dual questions have their own keys (quality, continuity, subject);
      // the ordinary recovery continues each one it can find again, within its bounds.
      if (await subjectUpgradeOf(c.db, gameId)) await recoverEnrolledReviewInterruptions(c, gameId, { readBoardArt: deps.readBoardArt });
    }
    job = await c.db.generationJob.findUniqueOrThrow({ where: { id: job.id } });
  }
  // A lean world waits minutes, not an hour, for its in-flight answers to settle under its ceiling:
  // a Sol answer settles in minutes (local-patch-lean/v1).
  if (job.currentStep === LOCAL_PATCH_RECOVERY_BUDGET_WAIT && job.updatedAt.getTime() > Date.now()
    - (await isLeanWorld(c.db, gameId) ? LEAN_RECOVERY_BACKOFF_MS : LOCAL_PATCH_RECOVERY_BACKOFF_MS))
    return { ...empty, pending: true, claimed: false, paused: false };
  if (job.currentStep === LOCAL_PATCH_EVIDENCE_RETRY_WAIT && job.updatedAt.getTime() > Date.now() - LOCAL_PATCH_EVIDENCE_RETRY_BACKOFF_MS)
    return { ...empty, pending: true, claimed: false, paused: false };

  // The claim, and the takeover in the same statement: either this job is not
  // running, or whoever had it has not said anything for a lease. `attempts`
  // moves with it, so every write below can prove it belongs to THIS claim.
  //
  // `attempts` is IN THE CONDITION, not only in the increment. Without it the
  // claim succeeded while the token was computed from the earlier read, so a
  // worker that claimed and released in between left this one holding a number
  // that matched nothing: every fence failed, its own release matched no row,
  // and the job sat occupied until the lease ran out. Losing the race is fine -
  // the next tick takes it - but believing you won it with the wrong number is
  // not.
  // A job parked for a person is not a job to take. Every OTHER failure stays
  // claimable, because those do get better by trying again.
  if (job.currentStep && PARKED_STEPS.includes(job.currentStep)) {
    return { ...empty, pending: false, claimed: false, paused: false, attention: job.lastError ?? job.currentStep };
  }
  const claimed = await c.db.generationJob.updateMany({
    where: { id: job.id, attempts: job.attempts,
      // Both halves written as explicit alternatives, because `not` on a
      // nullable column does NOT match a null one - SQL compares a null to
      // anything as unknown, so a fresh job whose step is null would have been
      // unclaimable and nothing would ever have been painted again.
      AND: [
        { OR: [{ currentStep: null }, { currentStep: { notIn: PARKED_STEPS } }] },
        { OR: [{ status: { not: "RUNNING" } }, { updatedAt: { lt: new Date(Date.now() - LOCAL_PATCH_LEASE_MS) } }] },
      ] },
    data: { status: "RUNNING", attempts: { increment: 1 }, currentStep: "local-patch", lastError: null },
  });
  if (!claimed.count) return { ...empty, pending: true, claimed: false, paused: false };
  const claim = job.attempts + 1;

  /**
   * Proof, inside the transaction that writes a target, that this worker still
   * holds the work and the game is still one that may receive child imagery.
   * A taken-over worker finishing a slow render writes nothing.
   */
  const fence = async (tx: Prisma.TransactionClient) => {
    const held = await tx.generationJob.updateMany({
      where: { id: job.id, attempts: claim, status: "RUNNING", currentStep: "local-patch" },
      data: { currentStep: "local-patch" },
    });
    const live = await tx.game.updateMany({
      where: { id: gameId, status: "TARGETS_GENERATING", deletedAt: null, styleVersion: LOCAL_PATCH_STYLE },
      data: { styleVersion: LOCAL_PATCH_STYLE },
    });
    if (held.count !== 1 || live.count !== 1) throw new Error("LOCAL_PATCH_WORLD: this claim is no longer ours; a stale worker may not write child imagery");
  };
  const failStrictQuality = async (reason: string) => c.db.$transaction(async tx => {
    await fence(tx);
    await transitionGame({ ...c, db: tx as Container["db"] }, gameId, "GENERATION_FAILED", SYSTEM, { reason });
    await tx.game.update({ where: { id: gameId }, data: { lastError: reason, configJson: null } });
    await tx.generationJob.update({ where: { id: job.id }, data: { status: "DONE", currentStep: LOCAL_PATCH_QUALITY_FAILED, lastError: reason } });
  });
  const parkExhausted = async (reason: string) => c.db.$transaction(async tx => {
    await fence(tx);
    await tx.generationJob.update({ where: { id: job.id }, data: { status: "FAILED", currentStep: LOCAL_PATCH_RECOVERY_EXHAUSTED, lastError: reason.slice(0, 500) } });
  });
  /** A refused reservation either waits for capacity that can still appear, or
   * parks with its exact reason. `parked` is null while waiting can help. */
  const deferBudget = async (error: unknown): Promise<{ parked: string | null } | null> => {
    if (!automatic || !(error instanceof WorldBudgetError) || error.code !== "cap_exceeded") return null;
    if (await activateLocalPatchEmergencyBudget(c, gameId, error, fence)) return { parked: null };
    const audit = await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId));
    if (audit.pendingRequestKeys.length) {
      // A reservation still in flight can settle below its hold and return capacity.
      await c.db.$transaction(async tx => {
        await fence(tx);
        await tx.generationJob.update({ where: { id: job.id }, data: { status: "QUEUED", currentStep: LOCAL_PATCH_RECOVERY_BUDGET_WAIT,
          lastError: "Automatic recovery needs service budget capacity; no parent quality approval is required. " + error.message } });
      });
      return { parked: null };
    }
    // The ceiling is fixed, its one automatic extension is spent or does not
    // apply, and nothing in flight can return capacity: another hour cannot help.
    // The ledger's own ceiling refuses without naming the reservation; only
    // the narrower commercial cap attaches it. Nothing is invented here.
    // A reservation of unknown outcome stays held until a person reconciles it.
    const needed = error.refusedReservation?.reserveMicroUsd, unknown = audit.unknownRequestKeys.length;
    const reason = `local-patch: no automatic action remains within the authorized world budget; the next required purchase ${needed ? `reserves ${needed} and ` : "does not fit: "}`
      + `${audit.remainingMicroUsd} of ${audit.capMicroUsd} micro-USD remain with nothing in flight`
      + (unknown ? ` that can settle on its own (${unknown} of unknown outcome await reconciliation)` : "")
      + ". A service decision is required; no parent approval is requested.";
    await parkExhausted(reason);
    return { parked: reason };
  };

  // local-patch-lean/v1: a lean world enrolls itself in the subject policy before anything is painted, and
  // never paints without it: a refusal parks the world with its reason, having bought nothing.
  if (automatic) {
    let enrollment: Awaited<ReturnType<typeof enrollLeanWorld>>;
    try { enrollment = await enrollLeanWorld(c, gameId, fence); }
    catch (error) {
      await c.db.generationJob.updateMany({ where: { id: job.id, attempts: claim, status: "RUNNING" },
        data: { status: "FAILED", lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500) } });
      throw error;
    }
    if (enrollment.state === "refused") {
      await parkExhausted(enrollment.reason);
      return { ...empty, pending: false, claimed: true, paused: false, attention: enrollment.reason };
    }
  }

  // A staged correction is a separate REVIEW-ONLY state. Never let an older
  // failure, a rejected sibling, or an interrupted tick fall into image retries.
  try {
    const { runLocalPatchQualityPilot } = await import("./local-patch-quality-pilot");
    const pilot = await runLocalPatchQualityPilot(c, gameId, { ...deps, fence }, options.hardDeadlineAt);
    if (pilot) {
      if (pilot.pending) await c.db.$transaction(async tx => { await fence(tx); await tx.generationJob.update({ where: { id: job.id },
        data: { status: "QUEUED", currentStep: "local-patch", lastError: null } }); });
      return { ...empty, claimed: true, paused: false, ...pilot };
    }
    const repair = await runLocalPatchPaidRepair(c, gameId, { fence, apiKey: deps.apiKey,
      deadlineAt: options.hardDeadlineAt, judge: options.repairJudge });
    if (repair.state !== "none" && !(automatic && repair.state === "blocked")) {
      if (repair.state === "committed") {
        await finishLocalPatchGame(c, gameId, fence);
        await deliverLocalPatchNotifications(c, gameId, { deadlineAt: options.hardDeadlineAt }).catch(error => console.error("[local-patch] ready; repair notification unavailable", error));
      } else if (repair.state === "blocked") await failStrictQuality(repair.reason ?? "The paid-image correction did not pass visual review");
      else await c.db.$transaction(async tx => { await fence(tx); await tx.generationJob.update({ where: { id: job.id }, data: {
        status: repair.state === "held" ? "FAILED" : "QUEUED", currentStep: repair.state === "held" ? LOCAL_PATCH_NEEDS_RELEASE : "local-patch",
        lastError: repair.reason } }); });
      return { ...empty, claimed: true, pending: repair.state === "pending", paused: false,
        attention: repair.state === "blocked" || repair.state === "held" ? repair.reason : null };
    }
  } catch (error) {
    const reason = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    const refused = error instanceof LocalPatchPaidRepairError || /^LOCAL_PATCH_(PLAYER|REPAIR_REVIEW|QUALITY_PILOT):/.test(reason);
    await c.db.generationJob.updateMany({ where: { id: job.id, attempts: claim, status: "RUNNING", currentStep: "local-patch" },
      data: { status: "FAILED", currentStep: refused ? LOCAL_PATCH_NEEDS_RELEASE : "local-patch", lastError: reason } });
    if (error instanceof GenerationPaused) return { ...empty, claimed: true, pending: false, paused: true, attention: null };
    // A transient DB write/lost acknowledgement does not authorize a fresh
    // image or require an operator: the same durable repair branch replays.
    return { ...empty, claimed: true, pending: !refused, paused: false, attention: refused ? reason : null };
  }

  const blocked: { boardId: string; reason: string }[] = [];
  const work: { board: LocalPatchBoard; hide: LocalPatchHide; sceneId: string }[] = [];
  for (const scene of game.scenes) {
    const board = localPatchBoardFor(scene.sceneSlug, scene.sceneVersion);
    if (!board) { blocked.push({ boardId: scene.sceneSlug, reason: `${scene.sceneSlug} has no authored local-patch placements` }); continue; }
    const reason = localPatchBoardBlockedReason(board);
    if (reason) { blocked.push({ boardId: scene.sceneSlug, reason }); continue; }
    for (const hide of board.hides) work.push({ board, hide, sceneId: scene.id });
  }

  let rows = await c.db.targetVariantAsset.findMany({
    where: { variant: LOCAL_PATCH_VARIANT, targetInstance: { gameScene: { gameId } } },
    include: { targetInstance: { select: { targetId: true, gameSceneId: true } } },
  });
  const stateOf = (sceneId: string, targetId: string) =>
    rows.find(r => r.targetInstance.gameSceneId === sceneId && r.targetInstance.targetId === targetId);
  // Correct deterministic clipping from the retained current purchase BEFORE
  // planning another image attempt. Old decisions are archived, not transferred
  // onto changed pixels; a fresh board review will bind the new composition.
  if (strict) {
    const stale = work.filter(item => {
      const row = stateOf(item.sceneId, item.hide.targetId);
      return row && localPatchNeedsRecomposition(row, game.scenes.find(scene => scene.id === item.sceneId)!.sceneVersion, playerReviewEnabled());
    });
    const refreshLimit = Math.max(1, options.maxHides ?? 5);
    try {
      for (const item of stale.slice(0, refreshLimit)) {
        await recomposeLocalPatchHide(c, { gameId, ...item }, { fence, readBoardArt: deps.readBoardArt });
        const scene = game.scenes.find(value => value.id === item.sceneId)!;
        scene.generationStatus = "NEEDS_REGENERATION";
      }
    } catch (error) {
      const attention = (error instanceof Error ? error.message : String(error)).slice(0, 500);
      await c.db.$transaction(async tx => { await fence(tx); await tx.generationJob.update({ where: { id: job.id },
        data: { status: "FAILED", currentStep: LOCAL_PATCH_NEEDS_RELEASE, lastError: attention } }); });
      return { ...empty, pending: false, claimed: true, paused: false, attention };
    }
    if (stale.length > refreshLimit) {
      await c.db.$transaction(async tx => { await fence(tx); await tx.generationJob.update({ where: { id: job.id },
        data: { status: "QUEUED", currentStep: "local-patch", lastError: null } }); });
      return { ...empty, pending: true, claimed: true, paused: false };
    }
    if (stale.length) rows = await c.db.targetVariantAsset.findMany({
      where: { variant: LOCAL_PATCH_VARIANT, targetInstance: { gameScene: { gameId } } },
      include: { targetInstance: { select: { targetId: true, gameSceneId: true } } },
    });
  }
  // The worker can stop after committing an unreadable review but before the
  // terminal game transition. That is still unresolved evidence on restart,
  // never permission to buy another image merely to obtain a different judge.
  const extraPlan = await readLocalPatchExtraAttemptPlan(c, gameId);
  // local-patch-continue-in-slice/v1. A ledger held only by review answers the automatic continuation admits does not
  // park the world: it yields, queued (a candidate of the scheduled selection), and its next slice continues them first.
  // A continuation this slice already tried and could not complete parks the world, never yields it again, and the park
  // says exactly why (`blockedWhy`): a person reads what to reconcile or authorize, never only that the ledger is held.
  let continuationBlocked = false;
  const blockedWhy: ContinuationWhy = {};
  const continuable = async () => {
    if (!automatic || extraPlan || continuationBlocked) return false;
    const open = await openAdmittedInterruptions(c, gameId, blockedWhy);
    return open !== "blocked" && open.size > 0;
  };
  const parkReason = (fallback: string) => blockedWhy.reason ? `${LOCAL_PATCH_CONTINUE_IN_SLICE}: ${blockedWhy.reason}`.slice(0, 500) : fallback;
  const yieldToContinue = async () => {
    await c.db.$transaction(async tx => { await fence(tx); await tx.generationJob.update({ where: { id: job.id },
      data: { status: "QUEUED", currentStep: "local-patch", lastError: null } }); });
    return { ...empty, claimed: true, pending: true, paused: false };
  };
  // First, while this slice has its time, under its own claim: one image at a time, each prepared alone. Also when the
  // ledger is not held: an approval whose image never recorded it (its pass stopped) is finished here.
  if (automatic && !extraPlan && await subjectUpgradeOf(c.db, gameId)) {
    const continued = await continueAdmittedReviewInterruptions(c, gameId, { readBoardArt: deps.readBoardArt },
      (options.hardDeadlineAt ?? Date.now() + 270_000) - LOCAL_PATCH_PHASE_MARGIN_MS, fence, blockedWhy);
    if (continued === "partial") return yieldToContinue();
    continuationBlocked = continued === "blocked";
  }
  const reviewedScenes = new Set<string>();
  let deferredBudgetError: WorldBudgetError | null = null;
  // local-patch-slice-pacing/v1. A free decision asks no provider, and a review may only send a question, but neither is
  // free of time: each rebuilds one board's evidence (identity, original art, the patch and its panels) and commits it.
  // One is started only while this slice can finish it, the claim is handed back with the rest still runnable, and each
  // is timed by board so a slow one shows in the logs. A board whose questions only await their provider is not rebuilt.
  let longestReviewMs = 0;
  const reviewFits = () => options.hardDeadlineAt === undefined || localPatchReviewFits(options.hardDeadlineAt - Date.now(), longestReviewMs);
  const timedReview = async <T extends { readonly state: string }>(board: string, kind: "retained" | "first" | "complete", review: () => Promise<T>) => {
    const started = Date.now();
    let state = "failed";
    try { const outcome = await review(); state = outcome.state; return outcome; }
    finally {
      const ms = Date.now() - started;
      longestReviewMs = Math.max(longestReviewMs, ms);
      console.info("[local-patch] board review", { gameId, board, kind, state, ms });
    }
  };
  const awaitingBoards = new Set<string>();
  // Scheduling only: publication re-verifies every subject stage, bill and binding.
  const subjectUpgrade = automatic && !extraPlan ? await subjectUpgradeOf(c.db, gameId) : null;
  // local-patch-lean/v1: an appearance whose second painting was refused only for who the child is (its quality and
  // continuity answers passed; the subject reading refused) is painted a third time with the reviewer's located
  // reasons, as its second was, and no paid diagnosis. Any other refusal, and a third one, goes to self-repair.
  const leanWorld = !!subjectUpgrade && await isLeanWorld(c.db, gameId);
  const leanThirdPainting = (row: { status: string; attempts: number; judgeJson: string | null } | undefined) => leanWorld && !!row
    && row.status === "FAILED" && row.attempts === LOCAL_PATCH_NORMAL_ATTEMPTS && leanSubjectOnlyRefusal(row.judgeJson, subjectUpgrade!.ageYears);
  /** A v1 pose-plan refusal awaiting its v2 question about the same pixels (subject-rejudge/v1), read at the enrolled age. */
  const rejudgePending = (row: Parameters<typeof subjectRejudgePending>[0]) => !!subjectUpgrade && subjectRejudgePending(row, subjectUpgrade.ageYears);
  // A board also owes its v2 re-judgments (subject-rejudge/v1), whatever status the board itself carries.
  const subjectPendingScenes = (current: typeof rows) => new Set(subjectUpgrade ? game.scenes.filter(scene => current.some(row =>
    row.targetInstance.gameSceneId === scene.id && (row.status === "GENERATED" && !subjectStageCurrent(row, subjectUpgrade?.identityRevision ? subjectUpgrade.identitySha256 : undefined) || rejudgePending(row))))
    .map(scene => scene.id) : []);
  const subjectPending = subjectPendingScenes(rows);
  // Review retained pixels before buying diagnostics or replacements. A failed
  // sibling is no reason to withhold the independent ready appearance.
  if (automatic && !extraPlan) {
    const dual = await hasDualVisualReview(c.db, gameId);
    const reload = async () => { rows = await c.db.targetVariantAsset.findMany({
      where: { variant: LOCAL_PATCH_VARIANT, targetInstance: { gameScene: { gameId } } },
      include: { targetInstance: { select: { targetId: true, gameSceneId: true } } },
    }); };
    // Free work first, all of it: an answer already paid for, whose question now
    // uses a corrected reader, is decided before anything is reserved or bought.
    // A world never waits for budget while a retained answer could decide it.
    // An enrolled world decides a retained answer with its subject review on the
    // ordinary route; the free reading refuses it after rebuilding the board's
    // evidence, so it is not asked here (local-patch-slice-pacing/v1).
    if (dual && !subjectUpgrade) for (const scene of game.scenes) {
      if (scene.sceneVersion !== 12) continue;
      for (let turn = 0; turn < 3 && rows.some(row => row.targetInstance.gameSceneId === scene.id && localPatchRetainedAnswerUndecided(row)); turn++) {
        // Out of time is not out of options: yield the claim with the rest of the
        // free work runnable. The next tick starts here again, before anything
        // paid, and nothing is parked for a reason a later tick resolves.
        if (!reviewFits()) {
          await c.db.$transaction(async tx => { await fence(tx); await tx.generationJob.update({ where: { id: job.id },
            data: { status: "QUEUED", currentStep: "local-patch", lastError: null } }); });
          return { ...empty, claimed: true, pending: true, paused: false };
        }
        let decided;
        try {
          decided = await timedReview(scene.sceneSlug, "retained", () => reviewLocalPatchBoard(c, { gameId, sceneId: scene.id },
            { fence, apiKey: deps.apiKey, judge: options.boardJudge, readBoardArt: deps.readBoardArt }, { decideRetained: true }));
        } catch (error) {
          await c.db.generationJob.updateMany({ where: { id: job.id, attempts: claim, status: "RUNNING" },
            data: { status: "FAILED", lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500) } });
          throw error;
        }
        if (!decided.decidedRetained) break;
        scene.generationStatus = decided.state === "done" ? "GENERATED" : "NEEDS_REGENERATION";
        await c.db.$transaction(async tx => { await fence(tx); await tx.gameScene.update({ where: { id: scene.id },
          data: { generationStatus: scene.generationStatus } }); });
        await reload();
      }
    }
    // Every open Message Batches round, before any review: polled, cancelled at its
    // deadline, or settled and linked once its batch has ended. Nothing is bought.
    // A round it cannot advance stops the slice with its reason, as a review does.
    if (dual) {
      try { await advanceQualityBatches(c, gameId, fence, options.hardDeadlineAt, { running: stillRunning, turn: claim,
        ...(pollDeadlineAt === undefined ? {} : { pollDeadlineAt }) }); }
      catch (error) {
        await c.db.generationJob.updateMany({ where: { id: job.id, attempts: claim, status: "RUNNING" },
          data: { status: "FAILED", lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500) } });
        throw error;
      }
    }
    // A first image and a first review for every appearance outrank another
    // question about a picture that already had one, so the budget can still
    // finish the other appearances before it pays for a second round.
    const reviewedOnce = (row: (typeof rows)[number]) => {
      try { return JSON.parse(row.judgeJson ?? "null")?.reviewState === "board-review-complete"; } catch { return false; }
    };
    const reviewedAcceptable = (row: (typeof rows)[number]) => {
      try { const receipt = JSON.parse(row.judgeJson ?? "null");
        return receipt?.reviewState === "board-review-complete" && receipt.qualityDisposition?.state === "acceptable";
      } catch { return false; }
    };
    /** Review work on an appearance's current pixels: exactly what gives its board firstWork or retry below. */
    const reviewWork = (row: (typeof rows)[number]) => !!subjectUpgrade && row.status === "GENERATED" && !subjectStageCurrent(row, subjectUpgrade?.identityRevision ? subjectUpgrade.identitySha256 : undefined)
      || rejudgePending(row) || playerReviewEnabled() && needsPlayerReview(row) || row.status === "GENERATED" && !reviewedAcceptable(row)
      || !!localPatchEvidenceRecovery(row)?.retry;
    const sentKey = (row: (typeof rows)[number]) => {
      try { const sha = JSON.parse(row.judgeJson ?? "null")?.judgedSha256; return typeof sha === "string" ? `${row.id}:${sha}` : null; } catch { return null; }
    };
    const firstPassComplete = work.every(item => {
      const row = stateOf(item.sceneId, item.hide.targetId);
      return !!row && row.status !== "PENDING" && (row.status !== "GENERATED" || reviewedOnce(row));
    });
    const plans = game.scenes.map(scene => {
      const sceneRows = rows.filter(row => row.targetInstance.gameSceneId === scene.id);
      const ready = sceneRows.filter(row => row.status === "GENERATED");
      // An enrolled world re-assesses every accepted appearance that has no subject stage
      // for its current pixels, even on a board already marked complete.
      const subjectWork = subjectPending.has(scene.id);
      // Planning only: incomplete boards with exclusively concluded approvals
      // have no new evidence to review. Final assembly still validates every
      // actual image/geometry/identity binding, including tampered pixels.
      // A v1 pose-plan refusal awaits its v2 subject question about the same pixels (subject-rejudge/v1).
      const firstWork = subjectWork || sceneRows.some(rejudgePending)
        || sceneRows.some(row => playerReviewEnabled() && needsPlayerReview(row)) || ready.some(row => {
        try { const receipt = JSON.parse(row.judgeJson ?? "null");
          return receipt?.reviewState !== "board-review-complete" || receipt.qualityDisposition?.state !== "acceptable";
        } catch { return true; }
      });
      return { scene, ready, firstWork, continuityPending: sceneRows.some(localPatchContinuityPending), retry: sceneRows.some(row => localPatchEvidenceRecovery(row)?.retry),
        awaiting: localPatchBoardAwaitsProvider(sceneRows.filter(reviewWork).map(sentKey), stillRunning) };
    }).sort((a, b) => Number(!a.continuityPending) - Number(!b.continuityPending) || Number(!a.firstWork) - Number(!b.firstWork));
    for (const plan of plans) if (plan.awaiting) awaitingBoards.add(plan.scene.id);
    for (const { scene, ready, firstWork, retry } of plans) {
      if (scene.sceneVersion !== 12 || scene.generationStatus === "GENERATED" && !subjectPending.has(scene.id)) continue;
      if (!(firstWork || retry) && ready.length !== localPatchBoardFor(scene.sceneSlug, scene.sceneVersion)?.hides.length) continue;
      if (!firstWork && retry && !firstPassComplete) continue;
      // Every question it owes is sent: decided by a later slice, once its answer arrives.
      if (awaitingBoards.has(scene.id)) continue;
      // local-patch-slice-pacing/v1: no board is started that the slice cannot finish; the next tick takes the rest.
      if (!reviewFits()) break;
      try {
        const review = await timedReview(scene.sceneSlug, "first", () => reviewLocalPatchBoard(c, { gameId, sceneId: scene.id, deadlineAt: options.hardDeadlineAt },
          { fence, apiKey: deps.apiKey, judge: options.boardJudge, readBoardArt: deps.readBoardArt }));
        reviewedScenes.add(scene.id);
        if (review.state === "held") {
          if (await continuable()) return yieldToContinue();
          const attention = parkReason(review.reason ?? "Review charge requires reconciliation");
          await c.db.$transaction(async tx => { await fence(tx); await tx.generationJob.update({ where: { id: job.id },
            data: { status: "FAILED", currentStep: LOCAL_PATCH_NEEDS_RELEASE, lastError: attention } }); });
          return { ...empty, claimed: true, pending: false, paused: false, attention };
        }
        scene.generationStatus = review.state === "done" ? "GENERATED" : "NEEDS_REGENERATION";
        await c.db.$transaction(async tx => { await fence(tx); await tx.gameScene.update({ where: { id: scene.id },
          data: { generationStatus: scene.generationStatus } }); });
        // One paid assessment per slice. Do not spend the provider window on
        // every board before the worker can durably yield its claim.
        if ((dual || playerReviewEnabled()) && review.costCents > 0) break;
      } catch (error) {
        if (error instanceof WorldBudgetError && error.code === "cap_exceeded") { deferredBudgetError = error; continue; }
        if (error instanceof GenerationPaused) {
          await c.db.$transaction(async tx => { await fence(tx); await tx.generationJob.update({ where: { id: job.id },
            data: { status: "QUEUED", currentStep: "local-patch" } }); });
          return { ...empty, claimed: true, pending: false, paused: true };
        }
        await c.db.generationJob.updateMany({ where: { id: job.id, attempts: claim, status: "RUNNING" },
          data: { status: "FAILED", lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500) } });
        throw error;
      }
    }
    if (reviewedScenes.size) await reload();
  }
  const unresolvedQuality = strict && rows.find(row => row.status === "FAILED" && row.lastError?.startsWith("quality-unresolved:"));
  if (unresolvedQuality && !automatic) {
    const attention = `local-patch: ${unresolvedQuality.lastError}`;
    await failStrictQuality(attention);
    return { ...empty, pending: false, claimed: true, paused: false, attention };
  }

  const allowRepair = localPatchFinalRepairAllowed(env().APP_ENV, strict);
  const attemptLimit = allowRepair ? LOCAL_PATCH_MAX_ATTEMPTS : LOCAL_PATCH_NORMAL_ATTEMPTS;
  const extraRows = new Set(extraPlan?.selected.map(entry => entry.rowId));
  if (extraPlan && extraPlan.others.some(entry => rows.find(row => row.id === entry.rowId)?.status === "FAILED")) {
    const attention = "local-patch: an unchanged sibling did not pass its first review; no additional image is authorized for that appearance";
    await failStrictQuality(attention);
    return { ...empty, pending: false, claimed: true, paused: false, attention };
  }
  // The extra allowance belongs to named rows, never to this engine or to a
  // restarted invocation. All other delivered pixels are protected by the grant.
  const settledHide = (row: { id: string; status: string; attempts: number } | undefined) => extraPlan
    ? !row || !extraRows.has(row.id) || localPatchSettled(row, 4)
    : localPatchSettled(row, attemptLimit);
  const plan = localPatchAttemptPlan(work.map(item => stateOf(item.sceneId, item.hide.targetId)), allowRepair);
  const normalReviewsPending = strict && game.scenes.some(scene => scene.generationStatus !== "GENERATED"
    && localPatchBoardFor(scene.sceneSlug, scene.sceneVersion)?.hides.every(hide => stateOf(scene.id, hide.targetId)?.status === "GENERATED"));
  // A rendered but not reviewed normal candidate may still require attempt2.
  // Finish those reviews before handing any earlier failure its last attempt.
  // An enrolled world schedules by local-patch-progress/v1: paid work in flight first, then the
  // appearance with the fewest paid tries, so every appearance advances before any gets another cycle.
  const progress = !!subjectUpgrade && automatic && !extraPlan;
  const selfRepairOf = (row: { judgeJson: string | null } | undefined) => {
    try { return JSON.parse(row?.judgeJson ?? "{}").selfRepair as Parameters<typeof selfRepairProgress>[0]; } catch { return null; }
  };
  const automaticWork = automatic && !extraPlan ? work.filter(item => {
    const row = stateOf(item.sceneId, item.hide.targetId);
    return needsSelfRepair(row) && !leanThirdPainting(row) && !(game.scenes.find(scene => scene.id === item.sceneId)?.sceneVersion === 12
      && (localPatchEvidenceRecovery(row!) || playerReviewEnabled() && needsPlayerReview(row!)))
      // Re-asked under v2 about the same pixels before any repair (subject-rejudge/v1).
      && !rejudgePending(row!);
  }).sort((a, b) => {
    const cycle = (item: typeof a) => {
      try {
        const state = JSON.parse(stateOf(item.sceneId, item.hide.targetId)?.judgeJson ?? "{}").selfRepair;
        // Resume a frozen purchase/plan before beginning another one. Fairness
        // applies between completed cycles, never by abandoning a paid phase.
        return state && ["diagnosing", "applying"].includes(state.phase) ? -1 : state?.cycle ?? 0;
      } catch { return 0; }
    };
    return cycle(a) - cycle(b);
  }) : [];
  const todo = extraPlan ? work.filter(item => {
    const row = stateOf(item.sceneId, item.hide.targetId);
    return row && extraRows.has(row.id) && ((row.status === "FAILED" && row.attempts === 3)
      || (row.status === "PENDING" && row.attempts === 4));
  }) : (progress
    // Every unsettled appearance is a candidate; the progress order, not the tier, decides who goes first.
    ? work.filter(item => !settledHide(stateOf(item.sceneId, item.hide.targetId)))
    : plan.indices.map(index => work[index]!)).filter(item => {
    if (automaticWork.includes(item)) return false;
    const candidate = stateOf(item.sceneId, item.hide.targetId);
    if (automatic && game.scenes.find(scene => scene.id === item.sceneId)?.sceneVersion === 12 && candidate && localPatchEvidenceRecovery(candidate)) return false;
    if (playerReviewEnabled() && candidate && needsPlayerReview(candidate)) return false;
    if (candidate && rejudgePending(candidate)) return false;
    // A ready appearance is reviewed, never repainted ahead of its review.
    if (progress && candidate?.status === "GENERATED") return false;
    if (!plan.finalRepair || !normalReviewsPending) return true;
    const row = stateOf(item.sceneId, item.hide.targetId);
    // Reviews gate a NEW final purchase, never recovery of one already started.
    return row?.status === "PENDING" && row.attempts === LOCAL_PATCH_MAX_ATTEMPTS;
  });
  const outcomes: LocalPatchHideOutcome[] = [];
  const limit = Math.max(1, options.maxHides ?? (advisory ? 5 : LOCAL_PATCH_HIDES_PER_SLICE));
  let paused = false;
  let attention: string | null = null;

  // local-patch-progress/v1: one order for repairs and renders; an appearance whose repair cycles
  // under the current subject policy are spent is left out (and reported below, never repurchased).
  const order = (item: (typeof work)[number]) => work.indexOf(item);
  const ordered = progress ? localPatchProgressOrder([
    ...automaticWork.map(item => { const row = stateOf(item.sceneId, item.hide.targetId);
      return { item, kind: "repair" as const, order: order(item), ...selfRepairProgress(selfRepairOf(row), row?.attempts ?? 0) }; }),
    ...todo.map(item => { const row = stateOf(item.sceneId, item.hide.targetId);
      return { item, kind: "render" as const, order: order(item), inFlight: row?.status === "PENDING", served: row?.attempts ?? 0, exhausted: false }; }),
  ]) : null;

  try {
    // A new failure after recovery returns here with its actual review evidence.
    // The engine diagnoses again; no terminal quality status or parent gate.
    let repairsStarted = 0;
    const repairOne = async (item: (typeof work)[number]) => {
      try {
        await runLocalPatchSelfRepair(c, { gameId, ...item, deadlineAt: options.hardDeadlineAt },
          { ...deps, fence, diagnose: options.diagnose });
        repairsStarted++;
      } catch (error) {
        if (error instanceof WorldBudgetError && error.code === "cap_exceeded") { deferredBudgetError = error; return; }
        throw error;
      }
      game.scenes.find(scene => scene.id === item.sceneId)!.generationStatus = "NEEDS_REGENERATION";
    };
    // Historical order: every repair first, then the renders.
    for (const item of ordered ? [] : automaticWork) {
      if (repairsStarted >= limit) break;
      if (options.hardDeadlineAt !== undefined && options.hardDeadlineAt - Date.now() < minHideMs) break;
      await repairOne(item);
    }
    // local-patch-progress/v1 takes repairs and renders as one ordered list.
    for (const entry of ordered ?? todo.map(item => ({ item, kind: "render" as const }))) {
      const item = entry.item;
      if (entry.kind === "repair") {
        if (repairsStarted >= limit) continue;
        if (options.hardDeadlineAt !== undefined && options.hardDeadlineAt - Date.now() < minHideMs) break;
        await repairOne(item);
        continue;
      }
      if (outcomes.length >= limit) { if (ordered) continue; break; }
      if (options.hardDeadlineAt !== undefined && options.hardDeadlineAt - Date.now() < minHideMs) break;
      let outcome: LocalPatchHideOutcome;
      try { outcome = await runLocalPatchHide(c, { ...deps, fence }, { gameId, board: item.board, hide: item.hide,
        finalRepair: !!extraPlan || plan.finalRepair || leanThirdPainting(stateOf(item.sceneId, item.hide.targetId)),
        ...(extraPlan ? { extraAttemptAuthorizationId: extraPlan.authorizationId } : {}),
        ...(options.hardDeadlineAt === undefined ? {} : { deadlineAt: options.hardDeadlineAt }) }); }
      catch (error) {
        if (automatic && error instanceof WorldBudgetError && error.code === "cap_exceeded") { deferredBudgetError = error; continue; }
        throw error;
      }
      outcomes.push(outcome);
      if (outcome.state === "held") {
        attention = outcome.reason;
        // Written HERE, not with the rest of the bookkeeping at the end. A
        // reservation is committed for something nobody dispatched, and the only
        // record of that is this decision; a failed read on the way to the end of
        // the slice would lose it and leave the job looking like ordinary work.
        await c.db.generationJob.updateMany({ where: { id: job.id, attempts: claim },
          data: { status: "FAILED", currentStep: LOCAL_PATCH_NEEDS_RELEASE, lastError: (outcome.reason ?? LOCAL_PATCH_NEEDS_RELEASE).slice(0, 500) } });
        break;
      }
      // A world that cannot buy anything is not a world to keep buying in.
      if (outcome.state === "stopped") break;
    }
  } catch (error) {
    const deferred = error instanceof GenerationPaused ? null : await deferBudget(error);
    if (error instanceof GenerationPaused) paused = true;
    else if (deferred) return { ...empty, pending: !deferred.parked, claimed: true, paused: false, attention: deferred.parked, outcomes, blocked };
    else {
      await c.db.generationJob.updateMany({ where: { id: job.id, attempts: claim }, data: { status: "FAILED", lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500) } });
      throw error;
    }
  }

  // Per board, once its three hides have all come to rest. Written whether they
  // landed or not: a board with a hide nobody could paint is not GENERATED, and
  // saying it is has already let a board ship with the child missing from it.
  let after = await c.db.targetVariantAsset.findMany({
    where: { variant: LOCAL_PATCH_VARIANT, targetInstance: { gameScene: { gameId } } },
    include: { targetInstance: { select: { targetId: true, gameSceneId: true } } },
  });
  let pendingReviews = 0;
  // Do not open fresh Opus work while a saved quality receipt still needs Sol,
  // including a checkpoint created in the first review phase of THIS slice.
  let continuityPending = automatic && !extraPlan && after.some(localPatchContinuityPending);
  const subjectAfter = subjectPendingScenes(after);
  for (const scene of game.scenes) {
    const board = localPatchBoardFor(scene.sceneSlug, scene.sceneVersion);
    if (!board || localPatchBoardBlockedReason(board)) continue;
    // Its questions await their provider: nothing to rebuild or decide yet, and the world is neither finished nor at rest.
    if (awaitingBoards.has(scene.id)) { pendingReviews++; continue; }
    const mine = board.hides.map(hide => after.find(r => r.targetInstance.gameSceneId === scene.id && r.targetInstance.targetId === hide.targetId));
    if (!mine.every(settledHide)) continue;
    // A complete board of an enrolled world still owes subject approvals: never READY before them.
    if (scene.generationStatus === "GENERATED" && subjectAfter.has(scene.id)) { pendingReviews++; continue; }
    let good = mine.every(row => row && (row.status === "GENERATED" || row.status === "APPROVED"));
    const reviewOnlyReady = !!extraPlan && mine.every(row => row && (row.status === "GENERATED"
      || row.status === "FAILED" && extraPlan.reviewOnly.some(entry => entry.rowId === row.id)));
    if (advisory && (good || reviewOnlyReady) && scene.generationStatus !== "GENERATED") {
      if (scene.sceneVersion === 12 && continuityPending && !mine.some(row => row && localPatchContinuityPending(row))) { pendingReviews++; continue; }
      if (reviewedScenes.has(scene.id)) { pendingReviews++; continue; }
      if (attention || paused) { pendingReviews++; continue; }
      // local-patch-slice-pacing/v1: a review this slice cannot finish is the next tick's.
      if (!reviewFits()) { pendingReviews++; continue; }
      try {
        const reviewed = await timedReview(scene.sceneSlug, "complete", () => reviewLocalPatchBoard(c, { gameId, sceneId: scene.id,
          ...(options.hardDeadlineAt === undefined ? {} : { deadlineAt: options.hardDeadlineAt }) }, {
          fence, apiKey: deps.apiKey, judge: options.boardJudge, readBoardArt: deps.readBoardArt,
        }));
        if (automatic && !extraPlan && scene.sceneVersion === 12 && reviewed.costCents > 0) {
          after = await c.db.targetVariantAsset.findMany({ where: { variant: LOCAL_PATCH_VARIANT, targetInstance: { gameScene: { gameId } } },
            include: { targetInstance: { select: { targetId: true, gameSceneId: true } } } });
          continuityPending = after.some(localPatchContinuityPending);
        }
        if (reviewed.state === "blocked") {
          if (automatic) {
            await c.db.$transaction(async tx => { await fence(tx); await tx.gameScene.update({ where: { id: scene.id }, data: { generationStatus: "NEEDS_REGENERATION" } }); });
            continue;
          }
          attention = `local-patch: ${reviewed.reason ?? "required quality evidence unavailable"}`;
          await failStrictQuality(attention);
          return { gameId, pending: false, claimed: true, paused: false, attention, outcomes, blocked };
        }
        if (reviewed.state === "retry") {
          await c.db.$transaction(async tx => { await fence(tx); await tx.gameScene.update({ where: { id: scene.id }, data: { generationStatus: "NEEDS_REGENERATION" } }); });
          continue;
        }
        if (reviewed.state === "done") good = true;
        if (reviewed.state !== "done") {
          pendingReviews++;
          if (reviewed.state === "held") {
            // Held only by interruptions the automatic continuation admits: queued for the next slice, never parked.
            if (await continuable()) return { ...await yieldToContinue(), outcomes, blocked };
            attention = parkReason(reviewed.reason ?? "local-patch: grouped review requires charge reconciliation");
            await c.db.$transaction(async tx => {
              await fence(tx);
              await tx.generationJob.update({ where: { id: job.id }, data: {
                status: "FAILED", currentStep: LOCAL_PATCH_NEEDS_RELEASE, lastError: attention,
              } });
            });
          }
          continue;
        }
      } catch (error) {
        if (error instanceof GenerationPaused) { paused = true; pendingReviews++; continue; }
        if (automatic && error instanceof WorldBudgetError && error.code === "cap_exceeded") { deferredBudgetError = error; pendingReviews++; continue; }
        await c.db.generationJob.updateMany({ where: { id: job.id, attempts: claim, status: "RUNNING" },
          data: { status: "FAILED", lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500) } });
        throw error;
      }
    }
    if (!attention) await c.db.$transaction(async tx => {
      await fence(tx);
      await tx.gameScene.update({ where: { id: scene.id }, data: { generationStatus: good ? "GENERATED" : "NEEDS_REGENERATION" } });
    });
  }

  // A grouped quality review can conclude new FAILED rows. Use those committed
  // decisions, not the pre-review snapshot, for retries and final readiness.
  if (strict) after = await c.db.targetVariantAsset.findMany({
    where: { variant: LOCAL_PATCH_VARIANT, targetInstance: { gameScene: { gameId } } },
    include: { targetInstance: { select: { targetId: true, gameSceneId: true } } },
  });

  // Include failed normal attempts that were deliberately absent from this
  // slice's todo. The final normal completion must queue the repair pass.
  const left = work.filter(item => {
    const row = after.find(r => r.targetInstance.gameSceneId === item.sceneId && r.targetInstance.targetId === item.hide.targetId);
    return !settledHide(row) || automatic && !extraPlan && (needsSelfRepair(row) || !!row && !!localPatchEvidenceRecovery(row));
  });
  // A world the ledger is holding cannot authorise anything, so another tick
  // would read the same rows, buy nothing and ask again forever. Held is a
  // state for a person, not a state to poll.
  if (automatic) await recoverLocalPatchImageInterruptions(c, gameId, fence);
  const held = (await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId))).held;
  // Held only by interruptions the automatic continuation admits: queued for the next slice, never parked.
  if (held && !attention && await continuable()) return { ...await yieldToContinue(), outcomes, blocked };
  if (held && !attention) {
    attention = parkReason("local-patch: the world ledger is held; reconcile its unresolved charge before continuing");
    await c.db.$transaction(async tx => {
      await fence(tx);
      await tx.generationJob.update({ where: { id: job.id }, data: {
        status: "FAILED", currentStep: LOCAL_PATCH_NEEDS_RELEASE, lastError: attention,
      } });
    });
  }
  // Only a complete nine-board world can become a playable product. A refused
  // hide never falls back to an avatar/body sprite and never becomes READY.
  if (!left.length && !pendingReviews && !paused && !held && !attention && game.scenes.length === 9) {
    const failures = work.filter(item => {
      const row = after.find(r => r.targetInstance.gameSceneId === item.sceneId && r.targetInstance.targetId === item.hide.targetId);
      return !row || !["GENERATED", "APPROVED"].includes(row.status);
    });
    const expected = game.scenes.reduce((sum, scene) => sum + (localPatchBoardFor(scene.sceneSlug, scene.sceneVersion)?.hides.length ?? 0), 0);
    if (!blocked.length && !failures.length && work.length === expected) {
      await finishLocalPatchGame(c, gameId, fence);
      // Readiness is already committed. Notification failure must never turn
      // a playable world back into a failed generation job.
      await (advisory ? deliverLocalPatchNotifications(c, gameId, { deadlineAt: options.hardDeadlineAt }) : deliverGameMail(c, gameId, SYSTEM)).catch(error => console.error(`[local-patch] ${gameId}: ready, notification unavailable`, error));
      return { gameId, pending: false, claimed: true, paused: false, attention: null, outcomes, blocked };
    }
    attention = `local-patch: ${failures.length} appearances ${advisory ? "have no usable asset after technical recovery" : "require review"}; ${blocked.length} boards unavailable`;
    if (strict) {
      await failStrictQuality(attention);
      return { gameId, pending: false, claimed: true, paused: false, attention, outcomes, blocked };
    }
    await c.db.$transaction(async tx => {
      await fence(tx);
      await tx.game.update({ where: { id: gameId }, data: { status: "MANUAL_REVIEW", lastError: attention, configJson: null } });
      await tx.generationJob.update({ where: { id: job.id }, data: { status: "DONE", currentStep: null, lastError: attention } });
    });
  }
  // The claim goes back either way: the next tick re-takes it. Holding it open
  // for the lease would make a paused world wait six minutes for nothing.
  //
  // Unless a person has to look. Then it is parked WITH the reason, where the
  // job status screen reads it, and no tick takes it again until somebody says
  // so - because the thing that is stuck is a committed reservation, and no
  // amount of retrying resolves one of those.
  // A parked job was already written the moment it was parked; leaving it alone
  // here is the point, not an omission.
  if (!attention) {
    const deferred = deferredBudgetError ? await deferBudget(deferredBudgetError) : null;
    if (deferred) return { gameId, pending: !deferred.parked, claimed: true, paused: false, attention: deferred.parked, outcomes, blocked };
    // What is left when nothing automatic remains to start for any of it: appearances whose repair cycles under
    // local-patch-subject/v2 are spent (local-patch-progress/v1), appearances with no evidence question left, or
    // a transport outage still being waited out. Any mixture of the first two stops the world with every name
    // and its reason; nothing more is bought for them.
    const rests: LocalPatchRest[] = left.map(item => {
      const row = after.find(r => r.targetInstance.gameSceneId === item.sceneId && r.targetInstance.targetId === item.hide.targetId);
      const recovery = automatic && row ? localPatchEvidenceRecovery(row) : null, diagnosis = recovery?.step?.diagnosis;
      return localPatchRestOf({ hideId: item.hide.id,
        evidence: recovery ? { retry: recovery.retry, waiting: recovery.waiting, exhausted: recovery.exhausted,
          ...(diagnosis ? { kind: `${diagnosis.role} ${diagnosis.kind}` } : {}) } : null,
        reviewOwed: !!row && (rejudgePending(row) || playerReviewEnabled() && needsPlayerReview(row)),
        repairSpent: progress && !!row && needsSelfRepair(row) && selfRepairProgress(selfRepairOf(row), row.attempts).exhausted });
    });
    const rest = pendingReviews ? null : localPatchRestDecision(rests);
    if (rest?.action === "wait") {
      await c.db.$transaction(async tx => { await fence(tx); await tx.generationJob.update({ where: { id: job.id }, data: {
        status: "QUEUED", currentStep: LOCAL_PATCH_EVIDENCE_RETRY_WAIT,
        lastError: "Judge evidence is waiting out a provider outage; automatic retry follows service backoff within its fixed question limit. No image redraw or parent approval.",
      } }); });
      return { gameId, pending: true, claimed: true, paused: false, attention: null, outcomes, blocked };
    }
    if (rest?.action === "park") {
      await parkExhausted(rest.reason);
      return { gameId, pending: false, claimed: true, paused: false, attention: rest.reason, outcomes, blocked };
    }
    await c.db.generationJob.updateMany({ where: { id: job.id, attempts: claim, status: "RUNNING", currentStep: "local-patch" },
      data: { status: left.length || pendingReviews ? "QUEUED" : "DONE", currentStep: left.length || pendingReviews ? "local-patch" : null } });
  }

  return { gameId, pending: (left.length > 0 || pendingReviews > 0) && !paused && !held && !attention, claimed: true, paused, attention, outcomes, blocked };
}

/**
 * The painter this box can buy a local patch with, or nothing.
 *
 * `null` is not a placeholder any more - it is the answer whenever this box is
 * not configured to spend: no key, or a provider that is not the real one. The
 * queue REFUSES the style in that case rather than letting it fall through to
 * the legacy painter, which is the whole reason the route was wired before the
 * adapter existed.
 *
 * The kill switch, the tester list and the daily ceiling are NOT asked here.
 * They are asked per hide, inside the claim, by the same function that answers
 * them for the board engine - so a world that pauses mid-slice stops at the
 * next hide rather than at the next deploy.
 *
 * `release` is the game's own painter pin (`localPatchPainterForGame`); without
 * one the content version decides, as it always has.
 */
export function localPatchPainterDeps(_c: Container, contentVersion = 6, release: LocalPatchPainterRelease | null = null): LocalPatchHideDeps | null {
  const e = env();
  const apiKey = e.OPENAI_API_KEY?.trim();
  if (e.GENERATION_PROVIDER !== "openai" || !apiKey) return null;
  const policy = release ? painterReleasePolicy(release, contentVersion) : localPatchImagePolicyForVersion(contentVersion);
  return {
    apiKey,
    renderPolicySha256: localPatchRenderPolicySha256(policy),
    render: async input => buyLocalPatch(apiKey, input, { policy: input.subjectPhotoPng
      ? input.subjectQuality === "low" ? painterReleasePolicy("local-patch-painter/low-v1", 12) : localPatchImagePolicyForVersion(12) : policy }),
  };
}

/** The painter of one game: the release pinned when its draft was created, never
 * the deployment's current setting. Every paid painting of the game, repairs
 * included, is bought through what this returns. */
export async function localPatchPainterForGame(c: Container, gameId: string, contentVersion: number | undefined): Promise<LocalPatchHideDeps | null> {
  return localPatchPainterDeps(c, contentVersion, await localPatchPainterRelease(c.db, gameId));
}

/**
 * Everything private this engine can have written for one game.
 *
 * A local patch is the child drawn into a picture, and a retained purchase is
 * the same child in the bytes that were paid for. Both have to be findable by
 * whoever deletes a game, and "findable" cannot mean "whoever wrote the deletion
 * routine remembered this engine exists" - that is how a resumed attempt once
 * left a child's image behind after a deletion that reported success.
 *
 * Derived from every authored placement rather than only the current scene
 * rows, so removing a scene or losing its pointer does not hide a paid reply.
 *
 * Called inside the deletion transaction, after its Game -> Job fence.
 */
export async function localPatchPrivateInventory(c: { db: Pick<Prisma.TransactionClient, "gameScene" | "targetInstance" | "targetVariantAsset" | "asset" | "auditLog"> }, gameId: string): Promise<{
  readonly assetIds: string[];
  readonly storagePaths: string[];
  readonly retainedPurchaseKeys: string[];
}> {
  const rows = await c.db.targetVariantAsset.findMany({
    where: { targetInstance: { gameScene: { gameId } } },
    select: { assetId: true, rejectedAssetIdsJson: true },
  });
  const assetIds = new Set<string>();
  for (const target of await c.db.targetInstance.findMany({ where: { gameScene: { gameId } }, select: { spriteAssetId: true } })) {
    if (target.spriteAssetId) assetIds.add(target.spriteAssetId);
  }
  for (const row of rows) {
    if (row.assetId) assetIds.add(row.assetId);
    if (!row.rejectedAssetIdsJson) continue;
    try {
      const parsed: unknown = JSON.parse(row.rejectedAssetIdsJson);
      if (Array.isArray(parsed)) for (const id of parsed) if (typeof id === "string") assetIds.add(id);
    } catch { /* an unreadable pointer is reported by the asset scan, not swallowed here */ }
  }
  // Also everything this engine wrote FOR this game, whatever any row says.
  // A picture kept by a worker that then lost its claim is never named by a
  // row - the write that would have named it is the one the fence refused -
  // and a child nobody can find is exactly what deletion must not leave.
  const written = await c.db.asset.findMany({
    where: { provider: LOCAL_PATCH_PROVIDER, providerRequestId: gameId },
    select: { id: true, storagePath: true },
  });
  for (const asset of written) assetIds.add(asset.id);
  const named = assetIds.size
    ? await c.db.asset.findMany({ where: { id: { in: [...assetIds] } }, select: { id: true, storagePath: true } })
    : [];
  const assets = [...new Map([...written, ...named].map(a => [a.id, a])).values()];

  const worldId = boardWizardWorldId(gameId);
  const requestKeys: string[] = ["canonical-age:identity:1"];
  for (const board of ALL_LOCAL_PATCH_BOARDS) {
    for (const hide of board.hides) {
      for (let attempt = 1; attempt <= LOCAL_PATCH_MAX_ATTEMPTS; attempt++) {
        requestKeys.push(`${hide.id}:${hide.pose}:render:${attempt}`, `${hide.id}:${hide.pose}:judge:${attempt}`);
      }
    }
  }
  for (const boardId of new Set(ALL_LOCAL_PATCH_BOARDS.map(board => board.board))) {
    for (const version of [8, 9, 10, 11, 12]) requestKeys.push(...localPatchBoardReviewKeys(boardId, version));
  }
  const extraPlan = await readLocalPatchExtraAttemptPlan(c as Pick<Container, "db">, gameId);
  if (extraPlan) requestKeys.push(...extraPlan.selected.map(entry => entry.requestKey), ...extraPlan.reviewRequestKeys);
  // These keys are frozen BEFORE a repair dispatch, so a crash before the
  // result-row write cannot orphan the private retained judge evidence.
  for (const audit of await c.db.auditLog.findMany({ where: { action: LOCAL_PATCH_PAID_REPAIR_ACTION, entityType: "Game", entityId: gameId }, select: { metaJson: true } })) {
    const b = JSON.parse(audit.metaJson ?? "null");
    if (!b || b.gameId !== gameId || !Array.isArray(b.reviews)) throw new Error("LOCAL_PATCH_WORLD: repair deletion inventory is corrupt");
    for (const review of b.reviews) {
      if (typeof review.requestKey !== "string" || !review.requestKey.startsWith("repair:") || review.requestKey.length > 250) throw new Error("LOCAL_PATCH_WORLD: repair request inventory is invalid");
      requestKeys.push(review.requestKey);
    }
  }
  for (const audit of await c.db.auditLog.findMany({ where: { action: SELF_REPAIR_REQUEST_ACTION, entityType: "Game", entityId: gameId }, select: { metaJson: true } })) {
    const value = JSON.parse(audit.metaJson ?? "null");
    if (typeof value?.requestKey !== "string" || value.requestKey.length > 250
      || !(value.requestKey.startsWith("self-repair:") || value.requestKey.includes(":self-repair:"))) throw Error("Invalid automatic recovery deletion inventory");
    requestKeys.push(value.requestKey);
  }
  return {
    assetIds: [...assetIds],
    storagePaths: assets.map(a => a.storagePath),
    retainedPurchaseKeys: retainedPurchaseKeysFor(worldId, requestKeys),
  };
}
