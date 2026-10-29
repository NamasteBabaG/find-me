import type { Container } from "../container";
import { guidedFrameMarker, guidedFrameVersionMatches } from "../../domain/generation/guided-frame-recovery";
import { qaCompletionGuidedRepair } from "../../domain/generation/qa-completion-recovery";
import { readSingleVisualReview } from "../../domain/generation/single-visual-review";
import { readQaCompletionCapacity } from "./qa-completion-capacity";
import { singleLowReviewAuthorization } from "./single-low-policy";
import { boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { PrismaRetainedPurchaseStore } from "../../infra/db/prisma-retained-purchase-store";
import { sameChargeEvidence } from "./world-budget";
import { sha256Bytes } from "./fixed-sprite";
import { backgroundRoundOfKey, roundAnswered } from "./continuity-background";

/** The guided third preserves an already completed cycle from attempt2. Only
 * the unchanged, source-bound completion grant may start a NEW remaining cycle
 * at attempt3. It never changes an old paid diagnostic question or its key. */
export async function qaGuidedRepairContextTransition(c: Container, input: {
  gameId: string; ownerId: string; sceneVersion: number; hideId: string; pose: string; previousContextSha256: string; contextSha256: string;
  row: { id: string; status: string; attempts: number; assetId: string | null; judgeJson: string | null };
}) {
  const { row, gameId } = input, marker = guidedFrameMarker(row), receipt = JSON.parse(row.judgeJson ?? "null"), state = receipt?.selfRepair;
  if (!marker || !guidedFrameVersionMatches(marker, input.sceneVersion) || !qaCompletionGuidedRepair(row, input.sceneVersion, true)
    || !state || !["awaiting-review", "rejected"].includes(state.phase) || state.contextSha256 !== input.previousContextSha256
    || state.subjectV2Cycles !== marker.repairCyclesPreserved || marker.repairCyclesPreserved < 1) return null;
  const worldId = boardWizardWorldId(gameId), grant = await readQaCompletionCapacity(c, worldId), original = await singleLowReviewAuthorization(c.db, gameId);
  if (!grant || !original || original.authorizationSha256 !== marker.authorizationSha256 || original.sceneVersion !== input.sceneVersion) return null;
  const source = await c.db.asset.findUnique({ where: { id: marker.sourceAssetId } });
  if (!source || source.deletedAt || source.status !== "READY" || source.type !== "TARGET_SPRITE" || source.visibility !== "GAME"
    || source.providerRequestId !== gameId || source.ownerId !== input.ownerId
    || sha256Bytes(await c.storage.get(source.storagePath)) !== marker.sourceImageSha256) return null;
  const budget = boardWizardBudgetOf(c), store = new PrismaRetainedPurchaseStore(c.db);
  const paid = async (key: string, scope: "image" | "judge") => {
    const bill = await budget.readRequest(worldId, key), kept = await store.get(worldId, key);
    return bill && ["settled", "linked"].includes(bill.state) && bill.scope === scope && !bill.conflicts.length
      && "evidence" in bill && kept?.evidence && kept.scope === scope && kept.operationFingerprint === bill.operationFingerprint
      && sameChargeEvidence(kept.evidence, bill.evidence) ? kept : null;
  };
  const review = await paid(marker.sourceReviewRequestKey, "judge"), third = await paid(`${input.hideId}:${input.pose}:render:3`, "image");
  if (!review || !third) return null;
  const wire = JSON.parse(review.bytes.toString()), reading = readSingleVisualReview(wire.raw);
  const round = await backgroundRoundOfKey(c.db, gameId, worldId, marker.sourceReviewRequestKey), binding = round?.intent?.binding;
  if (wire.policy?.effort !== "medium" || wire.policy?.model !== "gpt-6.1-sol" || wire.model !== "gpt-6.1-sol"
    || !reading || reading.doubt !== false || !round || !roundAnswered(round) || binding?.variantId !== row.id || binding?.hideId !== input.hideId
    || binding?.imageSha256 !== marker.sourceImageSha256 || wire.fingerprint !== review.operationFingerprint
    || round.intent?.fingerprint !== review.operationFingerprint) return null;
  // A newly started cycle must never reuse a diagnostic key already bought in
  // the old context. Existing in-flight phases do not qualify above.
  if (await budget.readRequest(worldId, `self-repair:${input.hideId}:diagnosis:${state.cycle + 1}`)) return null;
  return { version: "qa-guided-repair-context/v1" as const, authorizationSha256: grant.authorizationSha256,
    previousContextSha256: state.contextSha256, contextSha256: input.contextSha256,
    priorStateSha256: sha256Bytes(Buffer.from(JSON.stringify(state))), originalAttempts: 2, currentAttempts: 3,
    priorCyclesPreserved: marker.repairCyclesPreserved, sourceImageSha256: marker.sourceImageSha256, sourceReviewRequestKey: marker.sourceReviewRequestKey,
    sourceReviewFingerprint: review.operationFingerprint, thirdPaintingFingerprint: third.operationFingerprint };
}
