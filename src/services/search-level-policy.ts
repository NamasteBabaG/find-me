import type { Prisma } from "@prisma/client";

export const SEARCH_LEVEL_POLICY_VERSION = "search-level-choice/v1";
export const SEARCH_LEVEL_POLICY_ACTION = "create:search-level-asked";
const idOf = (gameId: string) => `aud_search_level_${gameId}`;
const meta = () => JSON.stringify({ version: SEARCH_LEVEL_POLICY_VERSION });

/**
 * Written atomically with a NEW draft whose parent is shown the Explorers and
 * Detectives cards. Only such a draft must answer before payment: a flag or a
 * release that changes later never makes an existing draft, or an open payment,
 * answer a question it was not asked. No child data in this pin.
 */
export async function pinSearchLevelChoice(db: Prisma.TransactionClient, gameId: string) {
  await db.auditLog.create({ data: { id: idOf(gameId), actorType: "SYSTEM", action: SEARCH_LEVEL_POLICY_ACTION,
    entityType: "Game", entityId: gameId, metaJson: meta() } });
}

export async function searchLevelAsked(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string): Promise<boolean> {
  const row = await db.auditLog.findUnique({ where: { id: idOf(gameId) } });
  if (!row) return false;
  if (row.actorType !== "SYSTEM" || row.actorId !== null || row.action !== SEARCH_LEVEL_POLICY_ACTION
    || row.entityType !== "Game" || row.entityId !== gameId || row.metaJson !== meta()) {
    throw Error("Pinned search level policy is invalid; refusing a fallback");
  }
  return true;
}
