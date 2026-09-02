import { assertTransition, isGameStatus, type GameStatus } from "@/domain/order-state";
import type { Container } from "./container";
import { audit, type Actor } from "./audit.service";

export function statusOf(game: { status: string }): GameStatus {
  if (!isGameStatus(game.status)) throw new Error(`Corrupt game status "${game.status}"`);
  return game.status;
}

/**
 * The only way a game changes status. Validates against the state machine,
 * writes the audit trail, and stamps timestamps for the milestones.
 */
export async function transitionGame(c: Container, gameId: string, to: GameStatus, actor: Actor, meta?: Record<string, unknown>): Promise<void> {
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, select: { status: true } });
  const from = statusOf(game);
  if (from === to) return;
  assertTransition(from, to);
  const now = new Date();
  await c.db.game.update({
    where: { id: gameId },
    data: {
      status: to,
      ...(to === "PAID" ? { paidAt: now } : {}),
      ...(to === "READY" ? { readyAt: now } : {}),
      ...(to === "DELIVERED" ? { deliveredAt: now } : {}),
      ...(to === "DELETED" ? { deletedAt: now } : {}),
    },
  });
  await audit(c, actor, `status:${from}->${to}`, "Game", gameId, meta);
}
