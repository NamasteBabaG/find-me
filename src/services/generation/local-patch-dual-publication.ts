import type { Prisma } from "@prisma/client";
import { localPatchRuntimeContinuityVerdict } from "../../domain/scene/local-patch-body-continuity";
import { SELF_REPAIR_COMPOSITION_VERSION, SELF_REPAIR_VERSION, selfRepairDecisionSchema } from "../../domain/scene/local-patch-self-repair";
import { parseVisualSceneVerdicts } from "./visual-review";
import { localPatchQualityDisposition } from "./local-patch-judge";
import { dualVisualReviewVersion } from "./visual-review-release";
import { readContinuityStage, verifiedDualStage, type DualReviewProof } from "./local-patch-dual-evidence";
import { PLAYER_REVIEW_MODE } from "./local-patch-player-review";
import { LOCAL_PATCH_COMPOSITION_VERSION } from "./local-patch-seam";
import type { LocalPatchPublicationBinding } from "./local-patch-publication-policy";

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** An Opus pass alone cannot publish. Re-read BOTH retained answers and their
 * settled receipts on every publication/protection read, not a boolean flag.
 * The continuity answer is read by the reader its decision names, and only by
 * one the pinned question allows: a stage written before readers were named
 * keeps its historical strict reading. */
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
    if (!await verifiedDualStage(db, worldId, proof.quality, "scene-quality")
      || !await verifiedDualStage(db, worldId, proof.continuity, "head-continuity")) return false;
    const quality = parseVisualSceneVerdicts(proof.quality.raw, [input.hideId], 12, "ready-only/v1", PLAYER_REVIEW_MODE)[input.hideId];
    const continuity = readContinuityStage(proof.continuity, input.hideId, version);
    return review.raw === proof.quality.raw && review.model === proof.quality.model
      && equal(quality, receipt.verdict) && localPatchQualityDisposition(quality ?? null, 12, { hideId: input.hideId }).state === "acceptable"
      && !!continuity && localPatchRuntimeContinuityVerdict(continuity).disposition === "pass";
  } catch { return false; }
}
