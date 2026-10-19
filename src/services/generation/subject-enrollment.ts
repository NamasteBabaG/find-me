import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { BACKGROUND_REVIEW_TRANSPORT } from "../../domain/generation/background-review-round";
import { SUBJECT_POLICY_VERSION, subjectPlanCanonical, subjectPlanFor, type SubjectPlan } from "../../domain/generation/subject-policy";
import { localPatchBoardForVersion } from "../../domain/scene/local-patch-catalog";
import { DUAL_VISUAL_REVIEW_V3 } from "./visual-review-release";

/**
 * One world's explicit, immutable enrollment in the subject upgrade: the subject
 * policy for every appearance, background Sol continuity for its new questions,
 * and the v2 review-interruption recovery. Written once by the fenced operator
 * entry point (subject-upgrade.ts) for a paid world still in generation. Absent:
 * the world keeps every historical contract exactly. A row that is not
 * byte-for-byte a known receipt is refused, never read as the nearest one.
 */
export const SUBJECT_UPGRADE_VERSION = "local-patch-subject-upgrade/v1" as const;
export const SUBJECT_UPGRADE_ACTION = "generation:subject-upgrade";
export const SUBJECT_REVIEW_RECOVERY = "world-automatic-review-recovery/v2" as const;
export const subjectUpgradeAuditId = (gameId: string) => `aud_subject_upgrade_${gameId}`;
/** The one SYSTEM operator: a lean world (local-patch-lean/v1) enrolls itself before its first painting (lean-enrollment.ts). */
export const SYSTEM_ENROLLMENT_OPERATOR = "system:local-patch-lean/v1" as const;

const hex = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().regex(/^[A-Za-z0-9_:.@/-]{1,200}$/).refine(value => !value.includes("://") && !/^sk-/i.test(value));
export const subjectUpgradeReceiptSchema = z.object({
  version: z.literal(SUBJECT_UPGRADE_VERSION), gameId: id, ownerId: id,
  subjectPolicy: z.literal(SUBJECT_POLICY_VERSION), continuityTransport: z.literal(BACKGROUND_REVIEW_TRANSPORT),
  reviewRecovery: z.literal(SUBJECT_REVIEW_RECOVERY), dualReviewRelease: z.literal(DUAL_VISUAL_REVIEW_V3),
  photoAssetId: id, photoSha256: hex, identityAssetId: id, identitySha256: hex,
  ageYears: z.number().int().min(2).max(10), operatorId: id, actorType: z.enum(["ADMIN", "USER", "SYSTEM"]), authorizationSha256: hex, planSha256: hex,
  enrolledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
}).strict();
export type SubjectUpgradeReceipt = z.infer<typeof subjectUpgradeReceiptSchema>;

/** The world's enrollment, or null when it has none. Throws on a corrupt or foreign row. */
export async function subjectUpgradeOf(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string): Promise<SubjectUpgradeReceipt | null> {
  const row = await db.auditLog.findUnique({ where: { id: subjectUpgradeAuditId(gameId) } });
  if (!row) return null;
  let parsed: SubjectUpgradeReceipt | null = null;
  try {
    const value = subjectUpgradeReceiptSchema.safeParse(JSON.parse(row.metaJson ?? "null"));
    if (value.success) parsed = value.data;
  } catch { parsed = null; }
  if (!parsed || row.metaJson !== JSON.stringify(parsed) || row.actorType !== parsed.actorType || row.actorId !== parsed.operatorId
    || parsed.actorType === "USER" && parsed.operatorId !== parsed.ownerId
    || (parsed.actorType === "SYSTEM") !== (parsed.operatorId === SYSTEM_ENROLLMENT_OPERATOR)
    || row.action !== SUBJECT_UPGRADE_ACTION || row.entityType !== "Game" || row.entityId !== gameId || parsed.gameId !== gameId)
    throw Error("Subject upgrade enrollment is invalid; refusing a fallback");
  return parsed;
}

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
export const subjectPlanSha256 = (plan: SubjectPlan) => sha(subjectPlanCanonical(plan));

/** The subject plan of one v12 hide, by its authored id; null for any other id. */
export function subjectPlanOfHide(hideId: string): SubjectPlan | null {
  const boardId = /^([a-z]+)-v12-[123]$/.exec(hideId)?.[1];
  const board = boardId ? localPatchBoardForVersion(boardId, 12) : null;
  return board ? subjectPlanFor(board, hideId) : null;
}
