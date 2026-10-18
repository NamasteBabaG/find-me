import { SUBJECT_READER } from "../../domain/generation/subject-policy";
import { QUALITY_READER_STRICT, localPatchQualityDisposition } from "./local-patch-judge";
import { qualityStageReader, readQualityStage, type DualReviewProof } from "./local-patch-dual-evidence";

/**
 * subject-rejudge/v1 (18 October 2026). local-patch-subject/v1 refused some appearances only because
 * the child's arms, head turn or expression differed from its plan; the owner has since said that a
 * natural pose is valid (local-patch-subject/v2). Such an appearance is not repainted: its SAME
 * pixels are asked the v2 subject question once, reusing the quality and continuity answers already
 * paid for. Nothing old is relabelled: the v1 refusal stays in the record, and only a new v2 answer,
 * bound to these pixels, can accept them.
 */
export const SUBJECT_REJUDGE_VERSION = "subject-rejudge/v1" as const;
const POSE_PLAN: ReadonlySet<string> = new Set(["plannedAction", "plannedHead", "plannedExpression"]);

type Row = { readonly status: string; readonly assetId: string | null; readonly lastError: string | null; readonly judgeJson: string | null };

/**
 * Whether this row awaits its v2 re-judgment: FAILED after a completed review of its current pixels,
 * whose quality answer (read by its own reader) passes, whose v1 subject stage refused it for the pose
 * plan alone (every check of who the child is, their age, face and hat passed), and with no paid
 * self-repair phase in flight. A row that already has a v2 subject stage never qualifies again.
 */
export function subjectRejudgePending(row: Row): boolean {
  if (row.status !== "FAILED" || !row.assetId || !row.lastError?.startsWith("quality-retry:")) return false;
  let receipt: Record<string, unknown> & { boardReview?: { dual?: DualReviewProof }; selfRepair?: { phase?: string } };
  try { receipt = JSON.parse(row.judgeJson ?? "null"); } catch { return false; }
  if (!receipt || receipt.reviewState !== "board-review-complete" || typeof receipt.hide !== "string") return false;
  const proof = receipt.boardReview?.dual, subject = proof?.subject;
  if (!proof?.quality || !subject || subject.reader !== SUBJECT_READER || proof.imageSha256 !== receipt.judgedSha256 || proof.hideId !== receipt.hide) return false;
  const failed = subject.failedChecks;
  if (!Array.isArray(failed) || !failed.length || !failed.every(code => POSE_PLAN.has(code))) return false;
  if (receipt.selfRepair?.phase === "diagnosing" || receipt.selfRepair?.phase === "applying") return false;
  const verdict = readQualityStage(proof.quality, receipt.hide);
  return !!verdict && localPatchQualityDisposition(verdict, 12, { hideId: receipt.hide, reader: qualityStageReader(proof.quality) ?? QUALITY_READER_STRICT }).state === "acceptable";
}
