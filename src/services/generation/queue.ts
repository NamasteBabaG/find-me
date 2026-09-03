import { statusOf } from "../game-status";
import type { Container } from "../container";
import { RESUMABLE_STATUSES, runGenerationPipeline } from "./pipeline";

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
    where: { status: { in: [...RESUMABLE_STATUSES] }, deletedAt: null },
    orderBy: { paidAt: "asc" },
    select: { id: true },
  });
  return game?.id ?? null;
}

/**
 * Do as much of one game as fits in `budgetMs`, then return. Safe to call
 * concurrently: every step is idempotent and a finished hiding spot is skipped.
 */
export async function tickGeneration(c: Container, gameId: string | null, budgetMs: number): Promise<TickResult> {
  const id = gameId ?? (await nextPendingGame(c));
  if (!id) return { gameId: null, status: null, pending: false };
  await runGenerationPipeline(c, id, { deadlineAt: Date.now() + budgetMs });
  const after = await c.db.game.findUnique({ where: { id }, select: { status: true } });
  const status = after ? statusOf(after) : null;
  return { gameId: id, status, pending: status !== null && RESUMABLE_STATUSES.includes(status) };
}
