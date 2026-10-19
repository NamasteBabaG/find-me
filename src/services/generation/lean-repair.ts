import { localPatchRuntimeContinuityVerdict } from "../../domain/scene/local-patch-body-continuity";
import { SUBJECT_CHECKS_V2, SUBJECT_COLLECTION_VARIETY, SUBJECT_POLICY_V2, SUBJECT_READER_V2, readSubjectAnswerV2 } from "../../domain/generation/subject-policy";
import { SUBJECT_QUALITY_BUNDLE_VERSION } from "../../domain/generation/subject-quality-bundle";
import { qualityStageReader, readContinuityStage, readQualityStage, subjectStageRaw, visualStageReadable, type DualReviewProof } from "./local-patch-dual-evidence";
import { localPatchQualityDisposition } from "./local-patch-judge";
import { isDualVisualReviewVersion } from "./visual-review-release";
import { subjectPlanOfHide } from "./subject-enrollment";

/**
 * Whether an appearance's last review refused it ONLY for who the child is (local-patch-lean/v1): such a refusal is
 * repainted a third time with the reviewer's located reasons, since a paid diagnosis could tell the painter nothing
 * more. Every part is read again from the receipt, under the reader its stage names, about exactly these pixels:
 * - the quality answer is acceptable (the bundle's quality part, before the subject result was applied);
 * - the continuity answer read beside it is readable and passes;
 * - the subject reading (local-patch-subject/v2, the bundle's) is a definite refusal: located failures, or a pass
 *   the collection refused for variety. Uncertainty is not a refusal of who the child is.
 * Anything else (a quality or continuity defect, an unread or uncertain answer) goes to self-repair and its diagnosis.
 */
export function leanSubjectOnlyRefusal(judgeJson: string | null, ageYears: number): boolean {
  try {
    const receipt = JSON.parse(judgeJson ?? "null"), dual = receipt?.boardReview?.dual as DualReviewProof | undefined;
    const hideId = receipt?.hide, plan = typeof hideId === "string" ? subjectPlanOfHide(hideId) : null;
    if (!dual || !plan || receipt.reviewState !== "board-review-complete" || typeof receipt.judgedSha256 !== "string"
      || dual.imageSha256 !== receipt.judgedSha256 || dual.hideId !== hideId || !isDualVisualReviewVersion(dual.version)) return false;
    const quality = dual.quality, continuity = dual.continuity, subject = dual.subject;
    if (!quality || !continuity || !subject) return false;
    const qualityReader = qualityStageReader(quality);
    if (!qualityReader || localPatchQualityDisposition(readQualityStage(quality, hideId), 12, { hideId, reader: qualityReader }).state !== "acceptable") return false;
    const read = visualStageReadable(continuity) ? readContinuityStage(continuity, hideId, dual.version) : null;
    if (!read || localPatchRuntimeContinuityVerdict(read).disposition !== "pass") return false;
    if (subject.subjectPolicy !== SUBJECT_POLICY_V2 || subject.reader !== SUBJECT_READER_V2 || subject.combined !== SUBJECT_QUALITY_BUNDLE_VERSION) return false;
    const codes: unknown = subject.failedChecks;
    if (!Array.isArray(codes) || !codes.length
      || !codes.every(code => (SUBJECT_CHECKS_V2 as readonly unknown[]).includes(code) || code === SUBJECT_COLLECTION_VARIETY)) return false;
    const reading = readSubjectAnswerV2(subjectStageRaw(subject), { hideId, ageYears, plan });
    return reading.ok && (reading.disposition === "repair" || reading.disposition === "pass" && typeof subject.collectionRefusal === "string");
  } catch { return false; }
}
