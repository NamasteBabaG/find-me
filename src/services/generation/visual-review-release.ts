import type { Prisma } from "@prisma/client";
import { visualReviewPolicy } from "../../domain/generation/visual-review-policy";

export const DUAL_VISUAL_REVIEW_VERSION = "local-patch-dual-high/v1";
export const DUAL_VISUAL_REVIEW_ACTION = "generation:visual-review-policy";
const idOf = (gameId: string) => `aud_visual_policy_${gameId}`;
const policy = () => ({ version: DUAL_VISUAL_REVIEW_VERSION,
  quality: visualReviewPolicy("scene-quality", "high"), continuity: visualReviewPolicy("head-continuity", "high") });

/** Written atomically with a NEW draft. A deployment flag never changes an
 * existing game's paid questions or approvals. No child data in this pin. */
export async function pinVisualReviewRelease(db: Prisma.TransactionClient, gameId: string) {
  await db.auditLog.create({ data: { id: idOf(gameId), actorType: "SYSTEM", action: DUAL_VISUAL_REVIEW_ACTION,
    entityType: "Game", entityId: gameId, metaJson: JSON.stringify(policy()) } });
}

export async function hasDualVisualReview(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string): Promise<boolean> {
  const row = await db.auditLog.findUnique({ where: { id: idOf(gameId) } });
  if (!row) return false;
  if (row.actorType !== "SYSTEM" || row.actorId !== null || row.action !== DUAL_VISUAL_REVIEW_ACTION
    || row.entityType !== "Game" || row.entityId !== gameId || row.metaJson !== JSON.stringify(policy()))
    throw Error("Pinned visual review policy is invalid; refusing a fallback");
  return true;
}
