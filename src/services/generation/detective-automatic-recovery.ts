import type { Prisma } from "@prisma/client";
import { leanReviewRecoveryOf } from "./lean-review-recovery-pin";
import { resolveLocalPatchBoardsForGame } from "./source-placement-release";

/** Prospective Detective recovery is qualified by its original fresh-world
 * receipt and its independently verified whole-family pin. A historical
 * operator release can never qualify this new family. Reads only. */
export async function detectiveAutomaticRecoveryQualified(db: Pick<Prisma.TransactionClient, "auditLog" | "game">, gameId: string): Promise<boolean> {
  try {
    if ((await leanReviewRecoveryOf(db, gameId))?.mode !== "new-world") return false;
    const context = await resolveLocalPatchBoardsForGame(db, gameId, 13);
    return context.sceneVersion === 13 && context.release?.baseSceneVersion === 13;
  } catch { return false; }
}
