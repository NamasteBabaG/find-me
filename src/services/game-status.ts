import type { Prisma } from "@prisma/client";
import { assertTransition, isGameStatus, type GameStatus } from "@/domain/order-state";
import type { Container } from "./container";
import { audit, type Actor } from "./audit.service";

export function statusOf(game: { status: string }): GameStatus {
  if (!isGameStatus(game.status)) throw new Error(`Corrupt game status "${game.status}"`);
  return game.status;
}

/** Enough of a client to move a game and write its trail, so the move can join a caller's transaction. */
export type GameStatusDb = Pick<Prisma.TransactionClient, "game" | "auditLog">;

/**
 * Another writer changed the game between the read and the write, so this
 * transition was refused rather than applied on top of a state it never saw.
 *
 * The caller decides what that means: a webhook re-reads and answers, a
 * pipeline slice gives up its turn. Never retry blindly — the state it wanted
 * to move away from is gone.
 */
export class GameStatusConflict extends Error {
  constructor(
    public readonly gameId: string,
    public readonly from: GameStatus,
    public readonly to: GameStatus,
  ) {
    super(`Game ${gameId} was not ${from} any more; ${from} → ${to} refused`);
    this.name = "GameStatusConflict";
  }
}

/**
 * How a game changes status on the ordinary path: validated against the state
 * machine, with the audit trail and the milestone timestamps.
 *
 * Not the only writer, and the comment that said so was wrong. The
 * board-conditioned and wizard engines write `status` directly inside their
 * own fenced transactions (`board-conditioned-qa-job`, `board-wizard-*`,
 * `board-conditioned-deletion`), because their move has to commit with rows
 * this function knows nothing about. Those paths own their own atomicity;
 * everything else comes through here.
 *
 * The write is a compare-and-set on the status that was read. Without the
 * fence, a delete, a refund or a cancel landing between the read and the write
 * was silently overwritten — a DELETED game came back as AVATAR_GENERATING
 * with its `deletedAt` still set, and the trail recorded a move that never
 * happened. A losing writer now raises `GameStatusConflict` instead.
 *
 * Callers that must be atomic with other rows (payment, deletion) pass their
 * own `db`, so the move and its audit entry commit with them.
 */
export async function transitionGame(c: Container, gameId: string, to: GameStatus, actor: Actor, meta?: Record<string, unknown>, db: GameStatusDb = c.db): Promise<void> {
  const game = await db.game.findUniqueOrThrow({ where: { id: gameId }, select: { status: true } });
  const from = statusOf(game);
  if (from === to) return;
  assertTransition(from, to);
  const now = new Date();
  const moved = await db.game.updateMany({
    where: { id: gameId, status: from },
    data: {
      status: to,
      ...(to === "PAID" ? { paidAt: now } : {}),
      ...(to === "READY" ? { readyAt: now } : {}),
      ...(to === "DELIVERED" ? { deliveredAt: now } : {}),
      ...(to === "DELETED" ? { deletedAt: now } : {}),
    },
  });
  if (moved.count !== 1) throw new GameStatusConflict(gameId, from, to);
  await audit(c, actor, `status:${from}->${to}`, "Game", gameId, meta, db);
}
