import { SUBJECT_READER, V1_POSE_PLAN_CHECKS, poseOnlyV1Refusal, readSubjectAnswer } from "../../domain/generation/subject-policy";
import { QUALITY_READER_STRICT, localPatchQualityDisposition } from "./local-patch-judge";
import { qualityStageReader, readQualityStage, subjectStageRaw, type DualReviewProof } from "./local-patch-dual-evidence";
import { subjectPlanOfHide } from "./subject-enrollment";

/**
 * subject-rejudge/v1 (18 October 2026). local-patch-subject/v1 refused some appearances only because
 * the child's arms, head turn or expression differed from its plan; the owner has since said that a
 * natural pose is valid (local-patch-subject/v2). Such an appearance is not repainted: its SAME
 * pixels are asked the v2 subject question once, reusing the quality and continuity answers already
 * paid for. Nothing old is relabelled: the v1 refusal stays in the record, and only a new v2 answer,
 * bound to these pixels, can accept them.
 */
export const SUBJECT_REJUDGE_VERSION = "subject-rejudge/v1" as const;

type Row = { readonly status: string; readonly assetId: string | null; readonly lastError: string | null; readonly judgeJson: string | null };

/**
 * Whether this row awaits its v2 re-judgment: FAILED after a completed review of its current pixels,
 * whose quality answer (read by its own reader) passes, whose v1 subject answer, read again in full by the
 * v1 reader at the enrolled age, refused the pose plan alone (poseOnlyV1Refusal: every check of who the child
 * is, their age, face and hat passed, and no other located or unclassified defect), and with no paid
 * self-repair phase in flight. A row that already has a v2 subject stage never qualifies again.
 */
export function subjectRejudgePending(row: Row, ageYears: number): boolean {
  if (row.status !== "FAILED" || !row.assetId || !row.lastError?.startsWith("quality-retry:")) return false;
  let receipt: Record<string, unknown> & { boardReview?: { dual?: DualReviewProof }; selfRepair?: { phase?: string } };
  try { receipt = JSON.parse(row.judgeJson ?? "null"); } catch { return false; }
  if (!receipt || receipt.reviewState !== "board-review-complete" || typeof receipt.hide !== "string") return false;
  const proof = receipt.boardReview?.dual, subject = proof?.subject;
  if (!proof?.quality || !subject || subject.reader !== SUBJECT_READER || proof.imageSha256 !== receipt.judgedSha256 || proof.hideId !== receipt.hide) return false;
  // Both records must agree: the checks the refusal named, and the complete answer read again.
  const failed: unknown = subject.failedChecks;
  if (!Array.isArray(failed) || !failed.length || !failed.every(code => typeof code === "string" && V1_POSE_PLAN_CHECKS.has(code))) return false;
  const plan = subjectPlanOfHide(receipt.hide);
  if (!plan || !poseOnlyV1Refusal(readSubjectAnswer(subjectStageRaw(subject), { hideId: receipt.hide, ageYears, plan }))) return false;
  if (receipt.selfRepair?.phase === "diagnosing" || receipt.selfRepair?.phase === "applying") return false;
  const verdict = readQualityStage(proof.quality, receipt.hide);
  return !!verdict && localPatchQualityDisposition(verdict, 12, { hideId: receipt.hide, reader: qualityStageReader(proof.quality) ?? QUALITY_READER_STRICT }).state === "acceptable";
}
