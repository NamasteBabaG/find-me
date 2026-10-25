import { SINGLE_VISUAL_REVIEW_VERSION, readSingleVisualReview } from "../../domain/generation/single-visual-review";
import { isSingleLowReviewPolicy } from "../../domain/generation/visual-review-policy";
import { nativeMaskTailPublicationAuthorized } from "./detectives-completion-budget";
import { singleLowReviewAuthorization as detectivesSingleReviewAuthorization } from "./single-low-policy";
import { hasLocalPatchCapability } from "../../domain/scene/local-patch-family";
import type { Prisma } from "@prisma/client";
import { localPatchRuntimeContinuityVerdict } from "../../domain/scene/local-patch-body-continuity";
import { SELF_REPAIR_COMPOSITION_VERSION, SELF_REPAIR_VERSION, selfRepairDecisionSchema } from "../../domain/scene/local-patch-self-repair";
import { localPatchQualityDisposition, QUALITY_READER_STRICT } from "./local-patch-judge";
import { dualVisualReviewVersion } from "./visual-review-release";
import { qualityStageReader, readContinuityStage, readQualityStage, subjectStageRaw, sourceNeighborPublicationMatches, verifiedDualStage, type DualReviewProof } from "./local-patch-dual-evidence";
import { PLAYER_REVIEW_MODE } from "./local-patch-player-review";
import { LOCAL_PATCH_COMPOSITION_VERSION } from "./local-patch-seam";
import { AUTHORED_PATCH_COMPOSITION_VERSION } from "../../domain/scene/local-patch-return-region";
import { AUTHORED_RECOVERY_COMPOSITION_VERSION } from "../../domain/scene/local-patch-authored-recovery";
import { authoredLocalPatchPublicationMatches, authoredLocalPatchReviewBinding } from "./local-patch-authored-return";
import type { LocalPatchPublicationBinding } from "./local-patch-publication-policy";
import { poseOnlyV1Refusal, readSubjectAnswer, readSubjectAnswerV2, SUBJECT_POLICY_V2, SUBJECT_POLICY_VERSION, SUBJECT_READER,
  SUBJECT_READER_V2 } from "../../domain/generation/subject-policy";
import { SUBJECT_QUALITY_BUNDLE_VERSION } from "../../domain/generation/subject-quality-bundle";
import { subjectPlanOfHide, subjectPlanSha256, subjectUpgradeOf, type SubjectUpgradeReceipt } from "./subject-enrollment";
import { isLeanWorld } from "./lean-release";

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** An Opus pass alone cannot publish. Re-read BOTH retained answers and their
 * settled receipts on every publication/protection read, not a boolean flag.
 * Each answer is read by the reader its decision names, and only by one its
 * question allows: a stage written before readers were named keeps its
 * historical strict reading, and a re-reading must describe that exact text. */
export async function allowedDualPublication(db: Prisma.TransactionClient, input: LocalPatchPublicationBinding): Promise<boolean> {
  try {
    if (!await nativeMaskTailPublicationAuthorized(db, input)) return false;
    const version = await dualVisualReviewVersion(db, input.gameId);
    const receipt = JSON.parse(input.judgeJson ?? "null"), review = receipt?.boardReview;
    const proof = review?.dual as DualReviewProof | undefined;
    const single = proof?.single === SINGLE_VISUAL_REVIEW_VERSION;
    const authority = single ? await detectivesSingleReviewAuthorization(db, input.gameId) : null;
    if (single && (!authority || authority.identitySha256 !== input.identitySha256 || input.sceneVersion !== authority.sceneVersion
      || !proof?.continuity || !proof.subject || !isSingleLowReviewPolicy(proof.quality.policy)
      || ![proof.continuity, proof.subject].every(stage => stage.requestKey === proof.quality.requestKey && stage.fingerprint === proof.quality.fingerprint
        && stage.raw === proof.quality.raw && equal(stage.policy, proof.quality.policy) && stage.costMicroUsd === proof.quality.costMicroUsd)
      || readSingleVisualReview(proof.quality.raw)?.doubt !== false)) return false;
    if (!single && proof && isSingleLowReviewPolicy(proof.quality.policy)) return false;
    if (!version || proof?.sceneVersion !== (input.sceneVersion === 13 ? 13 : undefined) || !hasLocalPatchCapability(input.sceneVersion, "integratedQuality") || review?.version !== version || review.effort !== (single ? "low" : "high")
      || review.assessmentMode !== PLAYER_REVIEW_MODE || review.reviewScope !== "ready-only/v1"
      || !equal(review.reviewedHideIds, [input.hideId]) || receipt.reviewState !== "board-review-complete"
      || receipt.wireFault !== null || receipt.renderFault != null || receipt.judgedSha256 !== input.imageSha256
      || receipt.geometrySha256 !== input.geometrySha256 || proof?.version !== version
      || proof.hideId !== input.hideId || proof.imageSha256 !== input.imageSha256 || proof.geometrySha256 !== input.geometrySha256
      || proof.identitySha256 !== input.identitySha256 || !proof.quality || !proof.continuity) return false;
    if (!await authoredLocalPatchPublicationMatches(db, input)) return false;
    if (!await sourceNeighborPublicationMatches(db, input, proof.quality)) return false;
    if (!equal(proof.authoredReturn, receipt.authoredReturn) || !equal(proof.authoredRecovery, receipt.authoredRecovery)) return false;
    if (receipt.compositionVersion !== LOCAL_PATCH_COMPOSITION_VERSION && receipt.compositionVersion !== AUTHORED_PATCH_COMPOSITION_VERSION && receipt.compositionVersion !== AUTHORED_RECOVERY_COMPOSITION_VERSION) {
      if (receipt.compositionVersion !== SELF_REPAIR_COMPOSITION_VERSION || receipt.selfRepair?.version !== SELF_REPAIR_VERSION
        || receipt.selfRepair.phase !== "awaiting-review" || !selfRepairDecisionSchema.safeParse(receipt.selfRepair.decision).success
        || receipt.recoveryComposition?.outsideChangedPixels !== 0 || receipt.recoveryComposition?.protectedChangedPixels !== 0) return false;
    }
    if (review.compositionVersion !== receipt.compositionVersion) return false;
    const authoredReviewBinding = authoredLocalPatchReviewBinding({ ...input, authoredReturn: proof.authoredReturn, ...(proof.authoredRecovery ? { authoredRecovery: proof.authoredRecovery } : {}) });
    const worldId = `${input.gameId}:board-wizard`;
    // An enrolled world: its continuity may be a background answer, and every appearance
    // also needs its own subject approval. A pass written before the enrollment has none.
    const upgrade = await subjectUpgradeOf(db, input.gameId);
    // A lean world (local-patch-lean/v1) is judged by Sol alone, under its own policies, and is always enrolled.
    const lean = await isLeanWorld(db, input.gameId);
    if (lean && !upgrade) return false;
    if (!await verifiedDualStage(db, worldId, proof.quality, "scene-quality", { allowLean: lean, allowSingle: single, authoredReviewBinding })
      || !await verifiedDualStage(db, worldId, proof.continuity, "head-continuity", { allowBackground: !!upgrade, allowLean: lean, allowSingle: single, authoredReviewBinding })) return false;
    if (upgrade && !await allowedSubject(db, worldId, upgrade, proof, input, lean, single)) return false;
    // Each answer is read by the reader its decision names, never a newer one.
    const quality = readQualityStage(proof.quality, input.hideId, input.sceneVersion);
    const continuity = readContinuityStage(proof.continuity, input.hideId, version);
    return review.raw === proof.quality.raw && review.model === proof.quality.model
      && equal(quality, receipt.verdict)
      && localPatchQualityDisposition(quality ?? null, input.sceneVersion, { hideId: input.hideId, reader: qualityStageReader(proof.quality) ?? QUALITY_READER_STRICT }).state === "acceptable"
      && !!continuity && localPatchRuntimeContinuityVerdict(continuity).disposition === "pass";
  } catch { return false; }
}

/** The subject stage re-read on every publication/protection read: its own settled bill,
 * the enrolled photograph and age, this hide's plan, and an explicit pass of every check its
 * policy decides by: all eight under v1; under v2 the five of who the child is, with no
 * collection refusal. Each stage is read only by its own policy's reader. */
async function allowedSubject(db: Prisma.TransactionClient, worldId: string, upgrade: SubjectUpgradeReceipt, proof: DualReviewProof,
  input: LocalPatchPublicationBinding, lean = false, single = false): Promise<boolean> {
  const subject = proof.subject, plan = subjectPlanOfHide(input.hideId, input.sceneVersion);
  const v2 = subject?.subjectPolicy === SUBJECT_POLICY_V2 && subject.reader === SUBJECT_READER_V2;
  if (!subject || !plan || !(v2 || subject.subjectPolicy === SUBJECT_POLICY_VERSION && subject.reader === SUBJECT_READER)
    || subject.collectionRefusal !== undefined
    || subject.photoSha256 !== upgrade.photoSha256 || subject.planSha256 !== subjectPlanSha256(plan) || upgrade.identitySha256 !== input.identitySha256) return false;
  const game = await db.game.findUnique({ where: { id: input.gameId }, include: { childProfile: true } });
  if (!game || game.ownerId !== upgrade.ownerId || game.childProfile?.ageYears !== upgrade.ageYears
    || game.childProfile.identityAssetId !== upgrade.identityAssetId) return false;
  if (!await verifiedDualStage(db, worldId, subject, "scene-quality", { allowLean: lean, allowSingle: single,
    authoredReviewBinding: authoredLocalPatchReviewBinding({ ...input, authoredReturn: proof.authoredReturn, ...(proof.authoredRecovery ? { authoredRecovery: proof.authoredRecovery } : {}) }) })) return false;
  // A lean world's subject reading always came with its quality answer (one Sol request).
  if (lean && subject.combined !== SUBJECT_QUALITY_BUNDLE_VERSION) return false;
  if (subject.combined && (!proof.quality.subjectBundle || proof.quality.subjectBundle.version !== subject.combined
    || proof.quality.subjectBundle.photoSha256 !== subject.photoSha256 || proof.quality.subjectBundle.planSha256 !== subject.planSha256
    || (proof.quality.subjectBundle.subjectPolicy ?? SUBJECT_POLICY_VERSION) !== subject.subjectPolicy
    || subject.requestKey !== proof.quality.requestKey || subject.fingerprint !== proof.quality.fingerprint || subject.raw !== proof.quality.raw
    || subject.costMicroUsd !== proof.quality.costMicroUsd || !equal(subject.sourceNeighbors, proof.quality.sourceNeighbors))) return false;
  const expected = { hideId: input.hideId, ageYears: upgrade.ageYears, plan };
  const reading = v2 ? readSubjectAnswerV2(subjectStageRaw(subject), expected) : readSubjectAnswer(subjectStageRaw(subject), expected);
  if (!reading.ok || reading.disposition !== "pass") return false;
  // A v1 answer about these pixels that a v2 answer replaced may only have refused the pose plan
  // (subject-rejudge/v1): the inner answer of a separate bundle, and any answer kept as superseded.
  const v1Admits = (raw: string | null) => {
    const old = readSubjectAnswer(raw, expected);
    return old.ok && (old.disposition === "pass" || poseOnlyV1Refusal(old));
  };
  const bundle = proof.quality.subjectBundle;
  if (bundle && !subject.combined) {
    const inner = subjectStageRaw({ raw: proof.quality.raw, combined: SUBJECT_QUALITY_BUNDLE_VERSION,
      ...(proof.quality.sourceNeighbors ? { sourceNeighbors: proof.quality.sourceNeighbors } : {}) });
    if (bundle.subjectPolicy === SUBJECT_POLICY_V2) {
      const own = readSubjectAnswerV2(inner, expected);
      if (!own.ok || own.disposition !== "pass") return false;
    } else if (!v1Admits(inner)) return false;
  }
  const superseded = proof.supersededSubject;
  if (superseded && (superseded.subjectPolicy !== SUBJECT_POLICY_VERSION || superseded.reader !== SUBJECT_READER
    || superseded.photoSha256 !== upgrade.photoSha256 || superseded.planSha256 !== subjectPlanSha256(plan) || !v1Admits(subjectStageRaw(superseded)))) return false;
  return true;
}
