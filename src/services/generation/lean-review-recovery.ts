import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import {
  LEAN_REVIEW_RECOVERY, LEAN_REVIEW_RECOVERY_ACTION, LEAN_REVIEW_RECOVERY_TERMS, leanReviewRecoveryAuditId, parseLeanReviewRecoveryReceipt,
  type LeanReviewRecoveryBinding, type LeanReviewRecoveryReceipt,
} from "../../domain/generation/lean-review-recovery";
import { WORLD_AUTOMATIC_REVIEW_RECOVERY_V1_LIMIT, WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT, type WorldBudgetAudit } from "../../domain/generation/world-budget";
import { boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { backgroundRoundOfKey } from "./continuity-background";
import { isLeanWorld } from "./lean-release";
import { leanReviewRecoveryOf, parkedHoldSha256 } from "./lean-review-recovery-pin";
import { LocalPatchRetainedPurchaseStore } from "./local-patch-lifecycle";
import { admittedInterruption, providerFailureRefusal } from "./local-patch-review-interruption-recovery";
import { LOCAL_PATCH_NEEDS_RELEASE, LOCAL_PATCH_STYLE } from "./local-patch-world";
import { SUBJECT_REVIEW_RECOVERY, subjectUpgradeOf } from "./subject-enrollment";

/**
 * The explicit path for ONE existing lean world that its continuation quota (two under v1, four under v2) parked for a
 * person (local-patch-lean-review-recovery/v1). Identifiers are always supplied; nothing here names a customer.
 *
 * `plan` reads only. `apply` writes one pin, bound to exactly what the plan read: the job's hold (its id, the moment its
 * reason was written and the reason), every unknown charge no earlier record continued, and the ledger (its audit and
 * continuation counts). It never writes the game or the job, never releases, reprices, settles or deletes anything, and
 * never reads an earlier approval differently. The scheduled tick then gives the bound hold its turns
 * (local-patch-parked-wake/v1), and the world's own slice continues it under v3 within every bound, or replaces the hold
 * with exactly why it cannot.
 */
const PLAN_VERSION = "local-patch-lean-review-recovery-plan/v1" as const;
/** What an administrator ticks on the order page to release one world (never a page-load or cron side effect). */
export const LEAN_REVIEW_RECOVERY_CONFIRMATION = "release-this-world-under-local-patch-lean-review-recovery-v1";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
/** The hold the continuation writes once v1 and v2 are spent (recoverPreparedLocalPatchReviews), verbatim, naming the key it held. */
export const SPENT_CONTINUATIONS_HOLD = new RegExp(`^local-patch-continue-in-slice/v1: the world's automatic review continuations are spent `
  + `\\(${WORLD_AUTOMATIC_REVIEW_RECOVERY_V1_LIMIT}/${WORLD_AUTOMATIC_REVIEW_RECOVERY_V1_LIMIT} under v1, ${WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT}/${WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT} under v2\\); `
  + "(self-repair:board:[a-z0-9-]+:[0-9a-f]{64}) stays reserved in full until a person reconciles or authorizes it$");

export type LeanReviewRecoveryPlan = {
  readonly version: typeof PLAN_VERSION; readonly gameId: string; readonly eligible: boolean; readonly refusals: readonly string[];
  readonly terms: typeof LEAN_REVIEW_RECOVERY_TERMS;
  /** What `apply` binds; null when nothing can be bound. */
  readonly binding: LeanReviewRecoveryBinding | null;
  readonly ledger: { readonly capMicroUsd: number; readonly settledMicroUsd: number; readonly reservedMicroUsd: number; readonly committedMicroUsd: number;
    readonly remainingMicroUsd: number; readonly unknownRequests: number; readonly continuations: Readonly<Record<string, number>> } | null;
  /** Every unknown charge no earlier record continued: its reservation, the interruption it is, and why it may not continue, if so. */
  readonly held: readonly { readonly requestKey: string; readonly reserveMicroUsd: number; readonly shape: "timeout" | "provider-failed" | null;
    readonly refusal: string | null }[];
  readonly planSha256: string;
};

export class LeanReviewRecoveryRefused extends Error {
  constructor(readonly refusals: readonly string[]) { super(`LEAN_REVIEW_RECOVERY: refused: ${refusals.join("; ")}`); this.name = "LeanReviewRecoveryRefused"; }
}

/** The ledger exactly as read: its audit and how many continuations of each version it holds. */
function ledgerSha256(audit: WorldBudgetAudit, continuations: Readonly<Record<string, number>>): string {
  const sorted = (keys: readonly string[]) => [...keys].sort();
  return sha(JSON.stringify({ capMicroUsd: audit.capMicroUsd, settledMicroUsd: audit.settledMicroUsd, reservedMicroUsd: audit.reservedMicroUsd,
    committedMicroUsd: audit.committedMicroUsd, pending: sorted(audit.pendingRequestKeys), unknown: sorted(audit.unknownRequestKeys),
    overrun: sorted(audit.overrunRequestKeys), conflict: sorted(audit.conflictRequestKeys), linked: sorted(audit.linkedRequestKeys),
    continuations: Object.entries(continuations).sort(([a], [b]) => a.localeCompare(b)) }));
}
const paidGame = (game: { ownerId: string | null; orders: { userId: string | null; paymentStatus: string; paidAt: Date | null; refundedAt: Date | null }[] }) =>
  game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
  && !game.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt);

/** Read-only. Never reserves, writes, asks a provider or changes the queue. */
export async function planLeanReviewRecovery(c: Container, input: { gameId: string }): Promise<LeanReviewRecoveryPlan> {
  const refusals: string[] = [];
  const refuse = (reason: string) => { refusals.push(reason); };
  const seal = (plan: Omit<LeanReviewRecoveryPlan, "planSha256">): LeanReviewRecoveryPlan => ({ ...plan, planSha256: sha(JSON.stringify(plan)) });
  const empty = { version: PLAN_VERSION, gameId: input.gameId, terms: LEAN_REVIEW_RECOVERY_TERMS, binding: null, ledger: null, held: [] } as const;
  const game = await c.db.game.findUnique({ where: { id: input.gameId }, include: { scenes: true, orders: true } });
  if (!game) return seal({ ...empty, eligible: false, refusals: ["no such game"] });
  if (game.styleVersion !== LOCAL_PATCH_STYLE) refuse("not a local-patch world");
  if (game.status !== "TARGETS_GENERATING" || game.deletedAt || game.configJson || game.readyAt)
    refuse(`the world is ${game.status}, not in generation; a delivered, deleted or stopped world is never resumed`);
  if (game.scenes.length !== 9 || game.scenes.some(s => s.sceneVersion !== 12)) refuse("the world is not one complete nine-board v12 world");
  if (!paidGame(game)) refuse("there is no confirmed, unrefunded payment by the owner");
  if (!await isLeanWorld(c.db, game.id)) refuse("the world is not a lean world (local-patch-lean/v1)");
  const upgrade = await subjectUpgradeOf(c.db, game.id);
  if (!upgrade || upgrade.reviewRecovery !== SUBJECT_REVIEW_RECOVERY || upgrade.ownerId !== game.ownerId) refuse("the world is not enrolled in the subject review recovery");
  try { if (await leanReviewRecoveryOf(c.db, game.id)) refuse(`the world already carries ${LEAN_REVIEW_RECOVERY}`); }
  catch (error) { refuse(error instanceof Error ? error.message : String(error)); }

  const job = await c.db.generationJob.findUnique({ where: { id: `job_${game.id}` } });
  const named = job?.lastError ? SPENT_CONTINUATIONS_HOLD.exec(job.lastError)?.[1] ?? null : null;
  if (!job) refuse("the world has no generation job");
  else if (job.status !== "FAILED" || job.currentStep !== LOCAL_PATCH_NEEDS_RELEASE) refuse(`the job is ${job.status} at ${job.currentStep ?? "no step"}, not parked for a person`);
  else if (!named) refuse("the job's hold is not the spent-continuations hold this release resumes");

  // The ledger, read as it is: nothing is released, repriced or settled here.
  const worldId = boardWizardWorldId(game.id), budget = boardWizardBudgetOf(c), audit = await budget.audit(worldId);
  if (audit.overCapMicroUsd || audit.overrunRequestKeys.length || audit.conflictRequestKeys.length) refuse("the ledger has an overrun, a conflict or is over its cap");
  if (audit.pendingRequestKeys.length) refuse("a supplier request is still pending; wait for its genuine outcome");
  const continuations = await budget.countContinuationApprovals(worldId);
  if ((continuations["world-automatic-review-recovery/v1"] ?? 0) < WORLD_AUTOMATIC_REVIEW_RECOVERY_V1_LIMIT
    || (continuations["world-automatic-review-recovery/v2"] ?? 0) < WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT)
    refuse("the world's v1 and v2 continuations are not spent; the ordinary continuation serves it");
  const store = new LocalPatchRetainedPurchaseStore(c, game.id, budget);
  const held: { requestKey: string; reserveMicroUsd: number; shape: "timeout" | "provider-failed" | null; refusal: string | null }[] = [];
  for (const requestKey of audit.unknownRequestKeys) {
    if (await budget.readContinuationApproval(worldId, requestKey)) continue;
    const request = await budget.readRequest(worldId, requestKey);
    const retained = requestKey.startsWith("self-repair:board:") ? await store.get(worldId, requestKey) : null;
    const round = retained ? await backgroundRoundOfKey(c.db, game.id, worldId, requestKey) : null;
    const admitted = retained && !retained.evidence && round ? await admittedInterruption(c, game.id, worldId, requestKey, retained) : null;
    // Read as v3 would read it once the pin exists: its kind, and its image's default-tier bound.
    const refusal = admitted?.shape === "provider-failed" ? await providerFailureRefusal(c, game.id, worldId, requestKey, { pinned: true }) : null;
    held.push({ requestKey, reserveMicroUsd: request?.reserveMicroUsd ?? 0, shape: admitted?.shape ?? null, refusal });
    if (!admitted) refuse(`${requestKey} is an unknown charge the automatic continuation does not admit; it stays held for a person`);
    if (refusal) refuse(refusal);
  }
  if (!held.length) refuse("no unknown charge awaits a continuation");
  if (named && !held.some(one => one.requestKey === named)) refuse(`the hold names ${named}, which is not an uncontinued unknown charge`);

  const ledger = { capMicroUsd: audit.capMicroUsd, settledMicroUsd: audit.settledMicroUsd, reservedMicroUsd: audit.reservedMicroUsd,
    committedMicroUsd: audit.committedMicroUsd, remainingMicroUsd: audit.remainingMicroUsd, unknownRequests: audit.unknownRequestKeys.length, continuations };
  const binding: LeanReviewRecoveryBinding | null = job && held.length ? { worldId, jobId: job.id, holdSha256: parkedHoldSha256(job),
    heldRequestKeys: held.map(one => one.requestKey).sort(), ledgerSha256: ledgerSha256(audit, continuations) } : null;
  return seal({ version: PLAN_VERSION, gameId: game.id, eligible: !refusals.length && !!binding, refusals, terms: LEAN_REVIEW_RECOVERY_TERMS,
    binding, ledger, held });
}

/**
 * Writes the existing-world pin for the exact plan a person read, and nothing else. The job and the ledger are read again
 * inside one serializable transaction and compared with the plan's binding; neither is written (a write would move the
 * hold the pin binds). Applying the same plan again changes nothing; a different one is refused.
 */
export async function applyLeanReviewRecovery(c: Container, input: { gameId: string; operatorId: string; expectedPlanSha256: string }, transaction?: Prisma.TransactionClient)
  : Promise<{ applied: boolean; receipt: LeanReviewRecoveryReceipt }> {
  const same = (pin: LeanReviewRecoveryReceipt | null) => pin?.mode === "existing-world" && pin.planSha256 === input.expectedPlanSha256 && pin.operatorId === input.operatorId;
  const existing = await leanReviewRecoveryOf(c.db, input.gameId);
  if (existing) {
    if (same(existing)) return { applied: false, receipt: existing };
    throw new LeanReviewRecoveryRefused([`the world already carries another ${LEAN_REVIEW_RECOVERY} pin`]);
  }
  const plan = await planLeanReviewRecovery(c, input);
  if (!plan.eligible || !plan.binding) throw new LeanReviewRecoveryRefused(plan.refusals.length ? plan.refusals : ["the plan is incomplete"]);
  if (plan.planSha256 !== input.expectedPlanSha256) throw new LeanReviewRecoveryRefused(["the world changed since the plan was read; read it again"]);
  const binding = plan.binding;
  const receipt: LeanReviewRecoveryReceipt = { version: LEAN_REVIEW_RECOVERY, gameId: input.gameId, terms: LEAN_REVIEW_RECOVERY_TERMS, mode: "existing-world",
    binding, operatorId: input.operatorId, planSha256: plan.planSha256, authorizedAt: new Date().toISOString() };
  if (!parseLeanReviewRecoveryReceipt(structuredClone(receipt), input.gameId)) throw new LeanReviewRecoveryRefused(["the operator or the binding is not a bounded identifier"]);
  try {
    const retain = async (tx: Prisma.TransactionClient) => {
      const job = await tx.generationJob.findUnique({ where: { id: binding.jobId } });
      const game = await tx.game.findUnique({ where: { id: input.gameId }, include: { orders: true } });
      if (!job || parkedHoldSha256(job) !== binding.holdSha256 || job.status !== "FAILED" || job.currentStep !== LOCAL_PATCH_NEEDS_RELEASE
        || !game || game.status !== "TARGETS_GENERATING" || game.deletedAt || game.configJson || game.readyAt || !paidGame(game))
        throw new LeanReviewRecoveryRefused(["the world or its hold changed while it was released; nothing was written"]);
      const budget = boardWizardBudgetOf({ ...c, db: tx as unknown as Container["db"] });
      const audit = await budget.audit(binding.worldId), continuations = await budget.countContinuationApprovals(binding.worldId);
      if (ledgerSha256(audit, continuations) !== binding.ledgerSha256)
        throw new LeanReviewRecoveryRefused(["the ledger changed while the world was released; nothing was written"]);
      await tx.auditLog.create({ data: { id: leanReviewRecoveryAuditId(input.gameId), actorType: "ADMIN", actorId: input.operatorId,
        action: LEAN_REVIEW_RECOVERY_ACTION, entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify(receipt) } });
    };
    if (transaction) await retain(transaction);
    else await c.db.$transaction(retain, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const winner = await leanReviewRecoveryOf(c.db, input.gameId);
    if (same(winner)) return { applied: false, receipt: winner! };
    throw new LeanReviewRecoveryRefused([`the world already carries another ${LEAN_REVIEW_RECOVERY} pin`]);
  }
  return { applied: true, receipt };
}
