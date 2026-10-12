import type { Prisma } from "@prisma/client";
import { visualReviewPolicy } from "../../domain/generation/visual-review-policy";

/** The original pairing: Sol's runtime question summarises the crowd in two traces. */
export const DUAL_VISUAL_REVIEW_VERSION = "local-patch-dual-high/v1";
/** The same models, effort and policies; Sol answers one bounded entry per person. */
export const DUAL_VISUAL_REVIEW_V2 = "local-patch-dual-high/v2";
/** v1's continuity question and readers, exactly; Opus is also shown each returned
 * join magnified and asked whether every object and person continues across it
 * (`object-joins/v1`). Prompted by the v17 render's accepted New York sign seam. */
export const DUAL_VISUAL_REVIEW_V3 = "local-patch-dual-high/v3";
export const DUAL_VISUAL_REVIEW_VERSIONS = [DUAL_VISUAL_REVIEW_VERSION, DUAL_VISUAL_REVIEW_V2, DUAL_VISUAL_REVIEW_V3] as const;
export type DualVisualReviewVersion = typeof DUAL_VISUAL_REVIEW_VERSIONS[number];
/** The quality question a pinned release asks: v1 and v2 ask the historical one. */
export const QUALITY_QUESTION_OBJECT_JOINS = "object-joins/v1";
export const qualityQuestionFor = (version: DualVisualReviewVersion) => version === DUAL_VISUAL_REVIEW_V3 ? QUALITY_QUESTION_OBJECT_JOINS : undefined;
export const DUAL_VISUAL_REVIEW_ACTION = "generation:visual-review-policy";
const idOf = (gameId: string) => `aud_visual_policy_${gameId}`;
const policy = (version: DualVisualReviewVersion) => ({ version,
  quality: visualReviewPolicy("scene-quality", "high"), continuity: visualReviewPolicy("head-continuity", "high") });

export const isDualVisualReviewVersion = (value: unknown): value is DualVisualReviewVersion =>
  DUAL_VISUAL_REVIEW_VERSIONS.some(version => version === value);

/** Written atomically with a NEW draft. A deployment flag never changes an
 * existing game's paid questions or approvals. No child data in this pin. */
export async function pinVisualReviewRelease(db: Prisma.TransactionClient, gameId: string, version: DualVisualReviewVersion = DUAL_VISUAL_REVIEW_VERSION) {
  if (!isDualVisualReviewVersion(version)) throw Error("Unsupported visual review release");
  await db.auditLog.create({ data: { id: idOf(gameId), actorType: "SYSTEM", action: DUAL_VISUAL_REVIEW_ACTION,
    entityType: "Game", entityId: gameId, metaJson: JSON.stringify(policy(version)) } });
}

/** The exact pinned pairing, or null for a game without one. A pin that is not
 * byte-for-byte a known release is refused, never treated as the nearest one. */
export async function dualVisualReviewVersion(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string): Promise<DualVisualReviewVersion | null> {
  const row = await db.auditLog.findUnique({ where: { id: idOf(gameId) } });
  if (!row) return null;
  const version = DUAL_VISUAL_REVIEW_VERSIONS.find(known => row.metaJson === JSON.stringify(policy(known)));
  if (!version || row.actorType !== "SYSTEM" || row.actorId !== null || row.action !== DUAL_VISUAL_REVIEW_ACTION
    || row.entityType !== "Game" || row.entityId !== gameId) throw Error("Pinned visual review policy is invalid; refusing a fallback");
  return version;
}

export async function hasDualVisualReview(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string): Promise<boolean> {
  return (await dualVisualReviewVersion(db, gameId)) !== null;
}
