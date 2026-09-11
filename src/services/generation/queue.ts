import { statusOf } from "../game-status";
import type { Container } from "../container";
import { RESUMABLE_STATUSES, runGenerationPipeline } from "./pipeline";
import { FIXED_WORLD_STYLE_PREFIX, isFixedWorldStyle } from "./fixed-world-stage-record";
import { BOARD_WIZARD_STYLE, boardWizardEnabled, runBoardConditionedWizardSlice } from "./board-conditioned-wizard";
import { LOCAL_PATCH_STYLE, localPatchPainterDeps, runLocalPatchWorldSlice } from "./local-patch-world";

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
}

/** The oldest game that still has work to do. */
export async function nextPendingGame(c: Container): Promise<string | null> {
  const game = await c.db.game.findFirst({
    // Fixed-from-birth games await their qualified import/manual QA, not this
    // painter. Selecting the oldest fixed PAID game would starve legacy work.
    where: { status: { in: [...RESUMABLE_STATUSES] }, deletedAt: null,
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
    // Routed before its painter exists, deliberately: a style with no adapter
    // must stop here saying so, not fall through to the legacy painter and
    // quietly produce a game made by a different engine.
    const painter = localPatchPainterDeps(c);
    if (!painter) return { gameId: id, status: statusOf(before), pending: false };
    const result = await runLocalPatchWorldSlice(c, painter, id, { hardDeadlineAt: now + hardMs });
    const after = await c.db.game.findUnique({ where: { id }, select: { status: true } });
    return { gameId: id, status: after ? statusOf(after) : null, pending: result.pending };
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
