import type { Prisma } from "@prisma/client";
import { localPatchRuntimeContinuityVerdict } from "../../domain/scene/local-patch-body-continuity";
import { SELF_REPAIR_COMPOSITION_VERSION, SELF_REPAIR_VERSION, selfRepairDecisionSchema } from "../../domain/scene/local-patch-self-repair";
import { localPatchQualityDisposition, QUALITY_READER_STRICT } from "./local-patch-judge";
import { dualVisualReviewVersion } from "./visual-review-release";
import { qualityStageReader, readContinuityStage, readQualityStage, subjectStageRaw, verifiedDualStage, type DualReviewProof } from "./local-patch-dual-evidence";
import { PLAYER_REVIEW_MODE } from "./local-patch-player-review";
import { LOCAL_PATCH_COMPOSITION_VERSION } from "./local-patch-seam";
import type { LocalPatchPublicationBinding } from "./local-patch-publication-policy";
import { readSubjectAnswer, SUBJECT_POLICY_VERSION, SUBJECT_READER } from "../../domain/generation/subject-policy";
import { subjectPlanOfHide, subjectPlanSha256, subjectUpgradeOf, type SubjectUpgradeReceipt } from "./subject-enrollment";

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** An Opus pass alone cannot publish. Re-read BOTH retained answers and their
 * settled receipts on every publication/protection read, not a boolean flag.
 * Each answer is read by the reader its decision names, and only by one its
 * question allows: a stage written before readers were named keeps its
 * historical strict reading, and a re-reading must describe that exact text. */
export async function allowedDualPublication(db: Prisma.TransactionClient, input: LocalPatchPublicationBinding): Promise<boolean> {
  try {
    const version = await dualVisualReviewVersion(db, input.gameId);
    const receipt = JSON.parse(input.judgeJson ?? "null"), review = receipt?.boardReview;
    const proof = review?.dual as DualReviewProof | undefined;
    if (!version || input.sceneVersion !== 12 || review?.version !== version || review.effort !== "high"
      || review.assessmentMode !== PLAYER_REVIEW_MODE || review.reviewScope !== "ready-only/v1"
      || !equal(review.reviewedHideIds, [input.hideId]) || receipt.reviewState !== "board-review-complete"
      || receipt.wireFault !== null || receipt.renderFault != null || receipt.judgedSha256 !== input.imageSha256
      || receipt.geometrySha256 !== input.geometrySha256 || proof?.version !== version
      || proof.hideId !== input.hideId || proof.imageSha256 !== input.imageSha256 || proof.geometrySha256 !== input.geometrySha256
      || proof.identitySha256 !== input.identitySha256 || !proof.quality || !proof.continuity) return false;
    if (receipt.compositionVersion !== LOCAL_PATCH_COMPOSITION_VERSION) {
      if (receipt.compositionVersion !== SELF_REPAIR_COMPOSITION_VERSION || receipt.selfRepair?.version !== SELF_REPAIR_VERSION
        || receipt.selfRepair.phase !== "awaiting-review" || !selfRepairDecisionSchema.safeParse(receipt.selfRepair.decision).success
        || receipt.recoveryComposition?.outsideChangedPixels !== 0 || receipt.recoveryComposition?.protectedChangedPixels !== 0) return false;
    }
    if (review.compositionVersion !== receipt.compositionVersion) return false;
    const worldId = `${input.gameId}:board-wizard`;
    // An enrolled world: its continuity may be a background answer, and every appearance
    // also needs its own subject approval. A pass written before the enrollment has none.
    const upgrade = await subjectUpgradeOf(db, input.gameId);
    if (!await verifiedDualStage(db, worldId, proof.quality, "scene-quality")
      || !await verifiedDualStage(db, worldId, proof.continuity, "head-continuity", { allowBackground: !!upgrade })) return false;
    if (upgrade && !await allowedSubject(db, worldId, upgrade, proof, input)) return false;
    // Each answer is read by the reader its decision names, never a newer one.
    const quality = readQualityStage(proof.quality, input.hideId);
    const continuity = readContinuityStage(proof.continuity, input.hideId, version);
    return review.raw === proof.quality.raw && review.model === proof.quality.model
      && equal(quality, receipt.verdict)
      && localPatchQualityDisposition(quality ?? null, 12, { hideId: input.hideId, reader: qualityStageReader(proof.quality) ?? QUALITY_READER_STRICT }).state === "acceptable"
      && !!continuity && localPatchRuntimeContinuityVerdict(continuity).disposition === "pass";
  } catch { return false; }
}

/** The subject stage re-read on every publication/protection read: its own settled bill,
 * the enrolled photograph and age, this hide's plan, and an explicit pass of every check. */
async function allowedSubject(db: Prisma.TransactionClient, worldId: string, upgrade: SubjectUpgradeReceipt, proof: DualReviewProof,
  input: LocalPatchPublicationBinding): Promise<boolean> {
  const subject = proof.subject, plan = subjectPlanOfHide(input.hideId);
  if (!subject || !plan || subject.subjectPolicy !== SUBJECT_POLICY_VERSION || subject.reader !== SUBJECT_READER
    || subject.photoSha256 !== upgrade.photoSha256 || subject.planSha256 !== subjectPlanSha256(plan) || upgrade.identitySha256 !== input.identitySha256) return false;
  const game = await db.game.findUnique({ where: { id: input.gameId }, include: { childProfile: true } });
  if (!game || game.ownerId !== upgrade.ownerId || game.childProfile?.ageYears !== upgrade.ageYears
    || game.childProfile.identityAssetId !== upgrade.identityAssetId) return false;
  if (!await verifiedDualStage(db, worldId, subject, "scene-quality")) return false;
  if (subject.combined && (!proof.quality.subjectBundle || proof.quality.subjectBundle.version !== subject.combined
    || proof.quality.subjectBundle.photoSha256 !== subject.photoSha256 || proof.quality.subjectBundle.planSha256 !== subject.planSha256
    || subject.requestKey !== proof.quality.requestKey || subject.fingerprint !== proof.quality.fingerprint || subject.raw !== proof.quality.raw
    || subject.costMicroUsd !== proof.quality.costMicroUsd)) return false;
  const reading = readSubjectAnswer(subjectStageRaw(subject), { hideId: input.hideId, ageYears: upgrade.ageYears, plan });
  return reading.ok && reading.disposition === "pass";
}
