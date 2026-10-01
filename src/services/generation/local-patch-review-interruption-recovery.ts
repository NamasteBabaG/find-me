import type { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { CasWorldBudgetRepository } from "../../infra/db/world-budget-repository";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { interruptedLocalPatchReviewRequest } from "../../domain/scene/local-patch-review-request";
import { boardWizardBudget } from "./board-wizard-budget";
import type { prepareLocalPatchBoardReview } from "./local-patch-board-review";
import { fenceLocalPatchImages, LocalPatchRetainedPurchaseStore } from "./local-patch-lifecycle";
import { sha256Bytes } from "./fixed-sprite";
import { WorldBudgetError, type WorldAutomaticReviewRecovery } from "./world-budget";

export const REVIEW_INTERRUPTION_POLICY = "local-patch-review-interruption/v1" as const;
type Prepared = Extract<Awaited<ReturnType<typeof prepareLocalPatchBoardReview>>, { ready: true }>;

/** A new evidence question, never a re-buy or a quality approval. Only an exact
 * retained no-response transport failure qualifies. The full unknown charge
 * stays reserved; at most two such continuations fit the unchanged world cap. */
export async function recoverPreparedLocalPatchReview(c: Container, prepared: Prepared,
  fence?: (tx: Prisma.TransactionClient) => Promise<void>): Promise<boolean> {
  const { game, scene, request, requestKey, fingerprint, worldId, budget } = prepared;
  if (scene.sceneVersion !== 12 || prepared.extraPlan || request.reviewScope !== "ready-only/v1"
    || request.hides.length !== 1 || !interruptedLocalPatchReviewRequest(requestKey, fingerprint)) return false;
  const selected = prepared.entries.find(e => e.hide.id === request.hides[0]!.hideId);
  if (!selected || prepared.protectedRows.has(selected.row.id)) return false;
  const live = await c.db.game.findUnique({ where: { id: game.id }, include: { scenes: true, orders: true } });
  const paid = (value: NonNullable<typeof live>) => value.orders.some(o => o.userId === value.ownerId
    && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    && !value.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt);
  if (!live || live.ownerId !== game.ownerId || live.deletedAt || live.configJson || live.readyAt
    || live.status !== "TARGETS_GENERATING" || live.styleVersion !== "local-patch-world-v1"
    || live.scenes.length !== 9 || live.scenes.some(s => s.sceneVersion !== 12) || !paid(live)) return false;
  const audit = await budget.audit(worldId);
  if (audit.overCapMicroUsd || audit.conflictRequestKeys.length || audit.overrunRequestKeys.length) return false;
  const held = await budget.readRequest(worldId, requestKey);
  if (!held || held.state !== "unknown" || held.origin !== "reserved" || held.scope !== "judge"
    || held.operationFingerprint !== fingerprint || held.reserveMicroUsd !== 300_000 || held.conflicts.length) return false;
  const retained = await new LocalPatchRetainedPurchaseStore(c, game.id, budget).get(worldId, requestKey);
  if (!retained || retained.evidence || retained.operationFingerprint !== fingerprint
    || retained.unknownReason !== "Grouped review charge could not be verified") return false;
  let reply: Record<string, unknown>;
  try { reply = JSON.parse(retained.bytes.toString()); } catch { return false; }
  // HTTP errors, authentication/quota refusals, unpriced usable answers, wrong
  // models and malformed successful replies are not transport interruptions.
  if (!reply || reply.wireFault !== "timeout" || reply.costUnknown !== true
    || ["raw", "usage", "requestId", "model", "finishReason"].some(key => reply[key] !== null)) return false;
  const proof = { policyId: REVIEW_INTERRUPTION_POLICY, gameId: game.id, ownerId: game.ownerId, sceneId: scene.id,
    variantId: selected.row.id, hideId: selected.hide.id, assetId: selected.asset.id, imageSha256: selected.imageSha256,
    geometrySha256: selected.geometrySha256, identitySha256: sha256Bytes(prepared.sheet), attempts: selected.row.attempts,
    evidenceReviewAttempt: prepared.evidenceReviewAttempt, requestKey, operationFingerprint: fingerprint,
    unknownReasons: held.unknownReasons, retainedPayloadSha256: retained.payloadSha256, wireFault: "timeout" };
  const proofHash = sha256Bytes(Buffer.from(JSON.stringify(proof))), approvalId = `auto-review-${proofHash}`;
  const prior = await budget.readContinuationApproval(worldId, requestKey);
  const recovery: WorldAutomaticReviewRecovery = { version: "world-automatic-review-recovery/v1", worldId, approvalId,
    requestKey, scope: "judge", operationFingerprint: fingerprint, reserveMicroUsd: held.reserveMicroUsd,
    unknownReasons: held.unknownReasons, policyId: REVIEW_INTERRUPTION_POLICY, authorizationSha256: proofHash,
    authorizedAt: prior?.version === "world-automatic-review-recovery/v1" ? prior.authorizedAt : selected.row.updatedAt.toISOString() };
  const recoveringBudget = boardWizardBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(c.db)), 1,
    { authorizeAutomaticReviewRecovery: async captured => JSON.stringify(captured) === JSON.stringify(recovery) });
  try { await recoveringBudget.authorizeAutomaticReviewRecovery(worldId, recovery); }
  catch (error) {
    if (error instanceof WorldBudgetError && ["invalid_input", "invalid_snapshot", "world_held"].includes(error.code)) return false;
    throw error;
  }
  return c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, game.id); await fence?.(tx);
    const currentGame = await tx.game.findUniqueOrThrow({ where: { id: game.id }, include: { scenes: true, orders: true } });
    if (currentGame.status !== "TARGETS_GENERATING" || currentGame.ownerId !== game.ownerId || currentGame.configJson
      || currentGame.deletedAt || currentGame.readyAt || !paid(currentGame)
      || currentGame.scenes.length !== 9 || currentGame.scenes.some(s => s.sceneVersion !== 12))
      throw Error("Interrupted review game changed before recovery");
    const changed = await tx.targetVariantAsset.updateMany({ where: { id: selected.row.id, status: selected.row.status,
      assetId: selected.asset.id, attempts: selected.row.attempts, judgeJson: selected.row.judgeJson,
      rectJson: selected.row.rectJson, hitRectJson: selected.row.hitRectJson, headAnchorJson: selected.row.headAnchorJson },
      data: { status: "FAILED", lastError: "quality-unresolved: review transport interrupted; inspect the same pixels again",
        judgeJson: JSON.stringify({ ...JSON.parse(selected.row.judgeJson!), reviewState: "board-review-complete", verdict: null,
          wireFault: "timeout", reviewInterruption: { ...proof, recoveryId: approvalId, reservedMicroUsd: held.reserveMicroUsd },
          boardReview: { version: prepared.reviewVersion, fingerprint, requestKey, reviewScope: "ready-only/v1",
            ...(request.assessmentMode ? { assessmentMode: request.assessmentMode } : {}),
            reviewedHideIds: [selected.hide.id], evidenceReviewAttempt: prepared.evidenceReviewAttempt,
            evidenceReviewedAt: new Date().toISOString(), raw: null, model: null, costUnknown: true } }) } });
    if (changed.count !== 1) return false;
    await tx.targetInstance.update({ where: { id: selected.row.targetInstanceId }, data: { status: "FAILED" } });
    await tx.auditLog.upsert({ where: { id: approvalId }, update: {}, create: { id: approvalId, actorType: "SYSTEM",
      action: REVIEW_INTERRUPTION_POLICY, entityType: "Game", entityId: game.id, metaJson: JSON.stringify(proof) } });
    await tx.generationJob.updateMany({ where: { id: `job_${game.id}`, status: "FAILED", currentStep: "local-patch:needs-release" },
      data: { status: "QUEUED", currentStep: "local-patch", lastError: null } });
    return true;
  }, { timeout: 30_000 });
}
