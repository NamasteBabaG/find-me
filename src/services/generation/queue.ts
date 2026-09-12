import { statusOf } from "../game-status";
import type { Container } from "../container";
import { LEASE_MS as PIPELINE_LEASE_MS, RESUMABLE_STATUSES, runGenerationPipeline } from "./pipeline";
import { FIXED_WORLD_STYLE_PREFIX, isFixedWorldStyle } from "./fixed-world-stage-record";
import { BOARD_WIZARD_STYLE, boardWizardEnabled, runBoardConditionedWizardSlice } from "./board-conditioned-wizard";
import { LOCAL_PATCH_LEASE_MS, LOCAL_PATCH_NEEDS_RELEASE, LOCAL_PATCH_STYLE, localPatchPainterDeps, runLocalPatchWorldSlice } from "./local-patch-world";

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
  const before = await c.db.game.findUnique({ where: { id }, select: { status: true, styleVersion: true } });
  if (!before) return { gameId: id, status: null, pending: false };
  if (before.styleVersion === LOCAL_PATCH_STYLE) {
    if (["PAID", "AVATAR_GENERATING", "GENERATION_FAILED"].includes(before.status)) {
      // The pinned engine owns its identity contract from the first preview.
      // The pipeline returns after approval; it never paints legacy targets.
      await runGenerationPipeline(c, id, { deadlineAt: now + budgetMs, hardDeadlineAt: now + hardMs });
      const after = await c.db.game.findUnique({ where: { id }, select: { status: true } });
      const status = after ? statusOf(after) : null;
      return { gameId: id, status, pending: status !== null && ["PAID", "AVATAR_GENERATING", "GENERATION_FAILED", "TARGETS_GENERATING"].includes(status) };
    }
    // Routed before its painter exists, deliberately: a style with no adapter
    // must stop here saying so, not fall through to the legacy painter and
    // quietly produce a game made by a different engine.
    const painter = localPatchPainterDeps(c);
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
