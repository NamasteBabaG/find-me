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
type OriginalSubjectUpgradeReceipt = z.infer<typeof subjectUpgradeReceiptSchema>;
export const SUBJECT_IDENTITY_REVISION_VERSION = "local-patch-subject-upgrade/identity-revision-v2" as const;
export type SubjectUpgradeReceipt = (OriginalSubjectUpgradeReceipt & { identityRevision?: never })
  | (Omit<OriginalSubjectUpgradeReceipt, "version"> & { version: typeof SUBJECT_IDENTITY_REVISION_VERSION;
    identityRevision: { version: "paid-identity-source-revision/v1"; originalEnrollmentSha256: string; commitSha256: string } });

/** The world's enrollment, or null when it has none. Throws on a corrupt or foreign row. */
export async function subjectUpgradeOf(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string): Promise<SubjectUpgradeReceipt | null> {
  const row = await db.auditLog.findUnique({ where: { id: subjectUpgradeAuditId(gameId) } });
  if (!row) return null;
  let parsed: OriginalSubjectUpgradeReceipt | null = null;
  try {
    const value = subjectUpgradeReceiptSchema.safeParse(JSON.parse(row.metaJson ?? "null"));
    if (value.success) parsed = value.data;
  } catch { parsed = null; }
  if (!parsed || row.metaJson !== JSON.stringify(parsed) || row.actorType !== parsed.actorType || row.actorId !== parsed.operatorId
    || parsed.actorType === "USER" && parsed.operatorId !== parsed.ownerId
    || (parsed.actorType === "SYSTEM") !== (parsed.operatorId === SYSTEM_ENROLLMENT_OPERATOR)
    || row.action !== SUBJECT_UPGRADE_ACTION || row.entityType !== "Game" || row.entityId !== gameId || parsed.gameId !== gameId)
    throw Error("Subject upgrade enrollment is invalid; refusing a fallback");
  // The original row stays byte-for-byte v1. Only an explicit, automatically reviewed source revision
  // yields a distinct active v2 context; old pixels/verdicts never gain its new canonical binding.
  const { identityRevisionStateOf } = await import("./identity-source-revision-state");
  const { start, commit } = await identityRevisionStateOf(db, gameId); // validates the immutable chain
  if (!commit) return parsed;
  const { boardConditioningHash } = await import("./board-conditioned-source");
  if (!start || commit.originalEnrollmentSha256 !== boardConditioningHash(parsed) || commit.oldIdentityAssetId !== parsed.identityAssetId
    || commit.oldIdentitySha256 !== parsed.identitySha256 || start.ownerId !== parsed.ownerId || start.photoAssetId !== parsed.photoAssetId
    || start.photoSha256 !== parsed.photoSha256 || start.ageYears !== parsed.ageYears)
    throw Error("Subject identity revision differs from its immutable original enrollment");
  const review = await db.auditLog.findFirst({ where: { action: "board-wizard:identity-style-reviewed", entityType: "Asset", entityId: commit.newIdentityAssetId }, orderBy: { createdAt: "desc" } });
  const { identityGateReceiptSchema, identityReceiptReadyForPublication } = await import("./board-wizard-identity-gate");
  const receipt = identityGateReceiptSchema.parse(JSON.parse(review?.metaJson ?? "null"));
  if (review?.actorType !== "SYSTEM" || receipt.provenance.style.version !== "board-matched-identity/v6" || !identityReceiptReadyForPublication(receipt, 12)
    || receipt.fingerprint !== commit.reviewFingerprint || receipt.identityAssetId !== commit.newIdentityAssetId || receipt.sheetSha256 !== commit.newIdentitySha256
    || receipt.provenance.photoAssetId !== parsed.photoAssetId || receipt.provenance.photoSha256 !== parsed.photoSha256 || receipt.provenance.ageYears !== parsed.ageYears)
    throw Error("Subject identity revision lacks its real full-source review");
  return { ...parsed, version: SUBJECT_IDENTITY_REVISION_VERSION, identityAssetId: commit.newIdentityAssetId, identitySha256: commit.newIdentitySha256,
    identityRevision: { version: commit.version, originalEnrollmentSha256: commit.originalEnrollmentSha256, commitSha256: boardConditioningHash(commit) } };
}

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
export const subjectPlanSha256 = (plan: SubjectPlan) => sha(subjectPlanCanonical(plan));

/** The subject plan of one v12 hide, by its authored id; null for any other id. */
export function subjectPlanOfHide(hideId: string): SubjectPlan | null {
  const boardId = /^([a-z]+)-v12-[123]$/.exec(hideId)?.[1];
  const board = boardId ? localPatchBoardForVersion(boardId, 12) : null;
  return board ? subjectPlanFor(board, hideId) : null;
}
