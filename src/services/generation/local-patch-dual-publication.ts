import type { Prisma } from "@prisma/client";
import { visualReviewPolicy } from "../../domain/generation/visual-review-policy";
import { SELF_REPAIR_COMPOSITION_VERSION, SELF_REPAIR_VERSION, selfRepairDecisionSchema } from "../../domain/scene/local-patch-self-repair";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { PrismaRetainedPurchaseStore } from "../../infra/db/prisma-retained-purchase-store";
import { sameChargeEvidence } from "./world-budget";
import { parseVisualSceneVerdicts } from "./visual-review";
import { localPatchQualityDisposition } from "./local-patch-judge";
import { DUAL_VISUAL_REVIEW_VERSION } from "./visual-review-release";
import { readContinuity, runtimeContinuityDisposition, visualStageReadable, type DualReviewProof, type DualReviewStage } from "./local-patch-dual-evidence";
import { PLAYER_REVIEW_MODE } from "./local-patch-player-review";
import { LOCAL_PATCH_COMPOSITION_VERSION } from "./local-patch-seam";
import type { LocalPatchPublicationBinding } from "./local-patch-publication-policy";

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** An Opus pass alone cannot publish. Re-read BOTH retained answers and their
 * settled receipts on every publication/protection read, not a boolean flag. */
export async function allowedDualPublication(db: Prisma.TransactionClient, input: LocalPatchPublicationBinding): Promise<boolean> {
  try {
    const receipt = JSON.parse(input.judgeJson ?? "null"), review = receipt?.boardReview;
    const proof = review?.dual as DualReviewProof | undefined;
    if (input.sceneVersion !== 12 || review?.version !== DUAL_VISUAL_REVIEW_VERSION || review.effort !== "high"
      || review.assessmentMode !== PLAYER_REVIEW_MODE || review.reviewScope !== "ready-only/v1"
      || !equal(review.reviewedHideIds, [input.hideId]) || receipt.reviewState !== "board-review-complete"
      || receipt.wireFault !== null || receipt.renderFault != null || receipt.judgedSha256 !== input.imageSha256
      || receipt.geometrySha256 !== input.geometrySha256 || proof?.version !== DUAL_VISUAL_REVIEW_VERSION
      || proof.hideId !== input.hideId || proof.imageSha256 !== input.imageSha256 || proof.geometrySha256 !== input.geometrySha256
      || proof.identitySha256 !== input.identitySha256 || !proof.quality || !proof.continuity) return false;
    if (receipt.compositionVersion !== LOCAL_PATCH_COMPOSITION_VERSION) {
      if (receipt.compositionVersion !== SELF_REPAIR_COMPOSITION_VERSION || receipt.selfRepair?.version !== SELF_REPAIR_VERSION
        || receipt.selfRepair.phase !== "awaiting-review" || !selfRepairDecisionSchema.safeParse(receipt.selfRepair.decision).success
        || receipt.recoveryComposition?.outsideChangedPixels !== 0 || receipt.recoveryComposition?.protectedChangedPixels !== 0) return false;
    }
    if (review.compositionVersion !== receipt.compositionVersion) return false;
    const worldId = `${input.gameId}:board-wizard`;
    const ledger = await PrismaWorldBudgetStore.forContinuationApprovalTransaction(db).read(worldId);
    if (!ledger) return false;
    const retainedStore = new PrismaRetainedPurchaseStore(db);
    for (const [stage, role] of [[proof.quality, "scene-quality"], [proof.continuity, "head-continuity"]] as const) {
      if (!equal(stage.policy, visualReviewPolicy(role, "high")) || !visualStageReadable(stage)
        || !Number.isSafeInteger(stage.attempt) || stage.attempt < 1
        || !/^self-repair:board:[a-z]+:[a-f0-9]{64}$/.test(stage.requestKey)
        || !stage.requestKey.endsWith(`:${stage.fingerprint}`)) return false;
      const bill = ledger.snapshot.requests.find(r => r.requestKey === stage.requestKey);
      const retained = await retainedStore.get(worldId, stage.requestKey);
      if (!bill || !["settled", "linked"].includes(bill.state) || !("evidence" in bill) || bill.scope !== "judge"
        || bill.operationFingerprint !== stage.fingerprint || bill.evidence.model !== stage.policy.model
        || bill.evidence.providerNamespace !== `${stage.policy.provider}:find-me-existing`
        || !retained?.evidence || retained.operationFingerprint !== stage.fingerprint
        || !sameChargeEvidence(retained.evidence, bill.evidence) || stage.costMicroUsd !== bill.evidence.amountMicroUsd) return false;
      const wire = JSON.parse(retained.bytes.toString()) as DualReviewStage & { costUnknown?: boolean };
      if (wire.costUnknown !== false || wire.fingerprint !== stage.fingerprint || !equal(wire.policy, stage.policy)
        || wire.raw !== stage.raw || wire.model !== stage.model || wire.wireFault !== stage.wireFault
        || wire.finishReason !== stage.finishReason) return false;
    }
    const quality = parseVisualSceneVerdicts(proof.quality.raw, [input.hideId], 12, "ready-only/v1", PLAYER_REVIEW_MODE)[input.hideId];
    return review.raw === proof.quality.raw && review.model === proof.quality.model
      && equal(quality, receipt.verdict) && localPatchQualityDisposition(quality ?? null, 12, { hideId: input.hideId }).state === "acceptable"
      && runtimeContinuityDisposition(readContinuity(proof.continuity.raw, `${input.hideId}:people`)) === "pass";
  } catch { return false; }
}
