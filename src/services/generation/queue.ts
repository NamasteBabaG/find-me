import { statusOf } from "../game-status";
import type { Container } from "../container";
import { LEASE_MS as PIPELINE_LEASE_MS, RESUMABLE_STATUSES, runGenerationPipeline } from "./pipeline";
import { FIXED_WORLD_STYLE_PREFIX, isFixedWorldStyle } from "./fixed-world-stage-record";
import { BOARD_WIZARD_STYLE, boardWizardEnabled, runBoardConditionedWizardSlice } from "./board-conditioned-wizard";
import { LOCAL_PATCH_LEASE_MS, LOCAL_PATCH_NEEDS_RELEASE, LOCAL_PATCH_QUALITY_FAILED, LOCAL_PATCH_RECOVERY_BUDGET_WAIT, LOCAL_PATCH_RECOVERY_BACKOFF_MS, LOCAL_PATCH_STYLE, localPatchPainterDeps, runLocalPatchWorldSlice } from "./local-patch-world";
import { selfRepairEnabled } from "../../domain/scene/local-patch-self-repair";
import { transitionGame } from "../game-status";
import { SYSTEM } from "../audit.service";

/**
 * Moving generation forward a slice at a time.
 *
 * With a real image model a three-world game is one identity sheet plus nine
 * hiding spots — about ten minutes — which no serverless request will survive.
 * The pipeline was always resumable, so the queue is just "run it again, with a
 * deadline, until there is nothing left". Two things call this: the page the
 * parent is watching (the client as the clock) and a cron (so it finishes even
 * if they close the tab).
 */

export interface TickResult {
  gameId: string | null;
  status: string | null;
  /** Whether the game still needs another tick. */
  pending: boolean;
  /** Why it is waiting for a person, when it is. */
  attention?: string | null;
}

/** The oldest game that still has work to do. */
export async function nextPendingGame(c: Container): Promise<string | null> {
  const game = await c.db.game.findFirst({
    // Fixed-from-birth games await their qualified import/manual QA, not this
    // painter. Selecting the oldest fixed PAID game would starve legacy work.
    //
    // And a world parked for a person is not a candidate at all. Parking is on
    // the JOB while the game stays TARGETS_GENERATING, so the oldest parked game
    // kept being chosen, its slice kept declining, and every runnable game
    // behind it waited on a decision nobody had made yet. It can still be ticked
    // directly, by an operator who knows what they are looking at.
    where: { status: { in: [...RESUMABLE_STATUSES] }, deletedAt: null,
      jobs: { none: { currentStep: LOCAL_PATCH_NEEDS_RELEASE } },
      // A minute cron must not spend its turn nudging a healthy paid render
      // already held by another worker. Match the world claimant's strict
      // takeover boundary; queued/released jobs remain immediately runnable.
      AND: [
        { OR: [{ jobs: { none: { currentStep: LOCAL_PATCH_QUALITY_FAILED } } }, { orders: {
          some: { paymentStatus: "PAID", paidAt: { not: null }, refundedAt: null },
          none: { OR: [{ paymentStatus: "REFUNDED" }, { refundedAt: { not: null } }] },
        } }] },
        { NOT: { jobs: { some: { currentStep: LOCAL_PATCH_RECOVERY_BUDGET_WAIT, updatedAt: { gt: new Date(Date.now() - LOCAL_PATCH_RECOVERY_BACKOFF_MS) } } } } },
        { NOT: { jobs: { some: { currentStep: LOCAL_PATCH_QUALITY_FAILED } }, OR: [
          { scenes: { none: {} } }, { scenes: { some: { sceneVersion: { not: 10 } } } },
        ] } },
        { NOT: { styleVersion: LOCAL_PATCH_STYLE, status: "TARGETS_GENERATING", jobs: { some: {
          status: "RUNNING", updatedAt: { gte: new Date(Date.now() - LOCAL_PATCH_LEASE_MS) },
        } } } },
        { NOT: { styleVersion: LOCAL_PATCH_STYLE, status: { in: ["PAID", "AVATAR_GENERATING", "GENERATION_FAILED"] }, jobs: { some: {
          status: "RUNNING", updatedAt: { gte: new Date(Date.now() - PIPELINE_LEASE_MS) },
        } } } },
      ],
      ...(boardWizardEnabled() ? { OR: [{ styleVersion: BOARD_WIZARD_STYLE }, { NOT: { styleVersion: { startsWith: FIXED_WORLD_STYLE_PREFIX } } }] } : { NOT: { styleVersion: { startsWith: FIXED_WORLD_STYLE_PREFIX } } }) },
    orderBy: { paidAt: "asc" },
    select: { id: true },
  });
  return game?.id ?? null;
}

/**
 * Do as much of one game as fits in `budgetMs`, then return. Safe to call
 * concurrently: every step is idempotent and a finished hiding spot is skipped.
 */
export async function tickGeneration(c: Container, gameId: string | null, budgetMs: number, hardMs = 270_000): Promise<TickResult> {
  const now = Date.now();
  const id = gameId ?? (await nextPendingGame(c));
  if (!id) return { gameId: null, status: null, pending: false };
  const before = await c.db.game.findUnique({ where: { id }, select: { status: true, styleVersion: true, scenes: { select: { sceneVersion: true } } } });
  if (!before) return { gameId: id, status: null, pending: false };
  if (before.styleVersion === LOCAL_PATCH_STYLE) {
    const terminal = await c.db.generationJob.findUnique({ where: { id: `job_${id}` }, select: { currentStep: true, lastError: true } });
    if (terminal?.currentStep === LOCAL_PATCH_QUALITY_FAILED) {
      if (before.scenes.length !== 9 || !before.scenes.every(scene => selfRepairEnabled(scene.sceneVersion)))
        return { gameId: id, status: statusOf(before), pending: false, attention: terminal.lastError };
      await resumeAutomaticLocalPatchRecovery(c, id);
      return { gameId: id, status: (await c.db.game.findUniqueOrThrow({ where: { id } })).status, pending: true, attention: null };
    }
    if (["PAID", "AVATAR_GENERATING", "GENERATION_FAILED"].includes(before.status)) {
      // The pinned engine owns its identity contract from the first preview.
      // The pipeline returns after approval; it never paints legacy targets.
      await runGenerationPipeline(c, id, { deadlineAt: now + budgetMs, hardDeadlineAt: now + hardMs });
      const after = await c.db.game.findUnique({ where: { id }, select: { status: true } });
      const status = after ? statusOf(after) : null;
      return { gameId: id, status, pending: status !== null && ["PAID", "AVATAR_GENERATING", "GENERATION_FAILED", "TARGETS_GENERATING"].includes(status) };
    }
    // Missing spend configuration must stop this pinned engine, never fall
    // through to the legacy painter and quietly generate a different game.
    const painter = localPatchPainterDeps(c, before.scenes[0]?.sceneVersion);
    if (!painter) return { gameId: id, status: statusOf(before), pending: false };
    const result = await runLocalPatchWorldSlice(c, painter, id, { hardDeadlineAt: now + hardMs });
    const after = await c.db.game.findUnique({ where: { id }, select: { status: true } });
    return { gameId: id, status: after ? statusOf(after) : null, pending: result.pending, attention: result.attention };
  }
  if (before.styleVersion === BOARD_WIZARD_STYLE) {
    if (!boardWizardEnabled()) return { gameId: id, status: statusOf(before), pending: false };
    const result = await runBoardConditionedWizardSlice(c, id, { hardDeadlineAt: now + hardMs });
    const after = await c.db.game.findUnique({ where: { id }, select: { status: true } });
    return { gameId: id, status: after ? statusOf(after) : null, pending: result.pending };
  }
  // No READY claim: keep the real held status while declining legacy polling.
  if (isFixedWorldStyle(before.styleVersion)) return { gameId: id, status: statusOf(before), pending: false };
  await runGenerationPipeline(c, id, { deadlineAt: now + budgetMs, hardDeadlineAt: now + hardMs });
  const after = await c.db.game.findUnique({ where: { id }, select: { status: true, styleVersion: true } });
  const status = after ? statusOf(after) : null;
  return { gameId: id, status, pending: status !== null && after !== null && !isFixedWorldStyle(after.styleVersion) && RESUMABLE_STATUSES.includes(status) };
}

/** Upgrade a concluded quality refusal, never a refund, accounting hold or live
 * request. The paid game resumes its original rows/identity/ledger, not generation
 * from scratch. No admin action or fabricated quality approval is involved. */
export async function resumeAutomaticLocalPatchRecovery(c: Container, gameId: string): Promise<void> {
  await c.db.$transaction(async tx => {
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { scenes: true, orders: true } });
    const job = await tx.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
    if (game.status !== "GENERATION_FAILED" || game.deletedAt || game.configJson || game.readyAt || game.styleVersion !== LOCAL_PATCH_STYLE
      || game.scenes.length !== 9 || !game.scenes.every(scene => selfRepairEnabled(scene.sceneVersion))
      || job.status !== "DONE" || job.currentStep !== LOCAL_PATCH_QUALITY_FAILED
      || !game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
      || game.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt)) return;
    const claimed = await tx.generationJob.updateMany({ where: { id: job.id, status: "DONE", attempts: job.attempts, currentStep: LOCAL_PATCH_QUALITY_FAILED },
      data: { status: "QUEUED", currentStep: "local-patch", lastError: null, attempts: { increment: 1 } } });
    if (claimed.count !== 1) return;
    await transitionGame(c, gameId, "TARGETS_GENERATING", SYSTEM, { reason: "automatic-quality-recovery", preservedExistingTargets: true }, tx);
    await tx.game.update({ where: { id: gameId }, data: { lastError: null } });
  }, { timeout: 30_000 });
}
