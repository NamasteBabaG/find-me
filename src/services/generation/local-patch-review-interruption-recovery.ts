import type { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { interruptedLocalPatchReviewRequest } from "../../domain/scene/local-patch-review-request";
import { boardWizardBudgetOf } from "./board-conditioned-wizard";
import type { prepareLocalPatchBoardReview } from "./local-patch-board-review";
import { fenceLocalPatchImages, LocalPatchRetainedPurchaseStore } from "./local-patch-lifecycle";
import { sha256Bytes } from "./fixed-sprite";
import { WorldBudgetError, type WorldAutomaticReviewRecovery, type WorldAutomaticReviewRecoveryV2 } from "./world-budget";
import type { EvidenceRole, EvidenceStrategy } from "../../domain/scene/local-patch-evidence-policy";
import { dualReviewReserves } from "../../domain/generation/dual-review-reserve";
import { SUBJECT_REVIEW_RECOVERY, subjectUpgradeOf } from "./subject-enrollment";
import { BACKGROUND_REVIEW_TRANSPORT } from "../../domain/generation/background-review-round";
import { backgroundRoundTerminal } from "./continuity-background";

export const REVIEW_INTERRUPTION_POLICY = "local-patch-review-interruption/v1" as const;
/** The same rules for a world enrolled in the subject upgrade, once its two v1 records are spent. */
export const REVIEW_INTERRUPTION_POLICY_V2 = "local-patch-review-interruption/v2" as const;
type Prepared = Extract<Awaited<ReturnType<typeof prepareLocalPatchBoardReview>>, { ready: true }>;
type Question = { role: EvidenceRole; strategy: EvidenceStrategy };
/** A background response the provider itself ended `failed`, with no text and no usage (first seen 19 October, Flex). */
export const PROVIDER_FAILED_SHAPE = "background-provider-failed/v1" as const;

/**
 * The retained shapes an automatic continuation admits, and nothing else:
 *  - `timeout`: no answer at all (a synchronous transport timeout: every field empty);
 *  - `provider-failed`: a background response its provider ended `failed`, with no answer text and no usage, read once
 *    from its own response id. Whether it was billed cannot be stated, so it stays an unknown charge, counted in full.
 * A provider-failed reply that carries usage or text, another status, or another reason is not an interruption.
 */
export function interruptionShape(unknownReason: string | null, reply: Record<string, unknown> | null): "timeout" | "provider-failed" | null {
  if (!reply) return null;
  if (unknownReason === "Grouped review charge could not be verified" && reply.wireFault === "timeout" && reply.costUnknown === true
    && ["raw", "usage", "requestId", "model", "finishReason"].every(key => reply[key] === null)) return "timeout";
  if (unknownReason === "Background review charge could not be verified" && reply.transport === BACKGROUND_REVIEW_TRANSPORT
    && reply.providerStatus === "failed" && reply.wireFault === "http" && reply.costUnknown === true && reply.finishReason === "failed"
    && reply.raw === null && reply.usage === null && typeof reply.requestId === "string" && reply.requestId === reply.responseId) return "provider-failed";
  return null;
}

/** A new evidence question, never a re-buy or a quality approval. Only an exact
 * retained no-response transport failure, or a background response its provider
 * ended `failed` with no text and no usage, qualifies (`interruptionShape`). The full unknown charge
 * stays reserved; at most two such continuations fit the unchanged world cap,
 * and an enrolled world (subject-enrollment.ts) at most four more (v2). */
export async function recoverPreparedLocalPatchReview(c: Container, prepared: Prepared,
  fence?: (tx: Prisma.TransactionClient) => Promise<void>,
  /** The interrupted question's role and variant, for the image's evidence log. */
  question: Question = { role: "quality", strategy: "standard/v1" }): Promise<boolean> {
  const upgrade = await subjectUpgradeOf(c.db, prepared.game.id);
  const enrolled = upgrade?.reviewRecovery === SUBJECT_REVIEW_RECOVERY && upgrade.ownerId === prepared.game.ownerId;
  if (await recoverInterruptedReview(c, prepared, fence, question, "v1", enrolled)) return true;
  return enrolled && recoverInterruptedReview(c, prepared, fence, question, "v2", true);
}

async function recoverInterruptedReview(c: Container, prepared: Prepared, fence: ((tx: Prisma.TransactionClient) => Promise<void>) | undefined,
  question: Question, release: "v1" | "v2",
  /** An enrolled world keeps the last complete proof beside the interruption, so its paid
   * continuity answer about the same pixels can still be reused; a historical world's bytes are unchanged. */
  keepProof: boolean): Promise<boolean> {
  const policyId = release === "v1" ? REVIEW_INTERRUPTION_POLICY : REVIEW_INTERRUPTION_POLICY_V2;
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
    || held.operationFingerprint !== fingerprint || !dualReviewReserves(question.role).includes(held.reserveMicroUsd) || held.conflicts.length) return false;
  const retained = await new LocalPatchRetainedPurchaseStore(c, game.id, budget).get(worldId, requestKey);
  if (!retained || retained.evidence || retained.operationFingerprint !== fingerprint) return false;
  let reply: Record<string, unknown>;
  try { reply = JSON.parse(retained.bytes.toString()); } catch { return false; }
  // HTTP errors, authentication/quota refusals, unpriced usable answers, wrong
  // models and malformed successful replies are not transport interruptions.
  const shape = interruptionShape(retained.unknownReason, reply);
  if (!shape) return false;
  // A background response the provider ended `failed` is admitted only as its round recorded it: that response, unpriced.
  if (shape === "provider-failed") {
    const terminal = await backgroundRoundTerminal(c.db, game.id, worldId, requestKey);
    if (terminal?.kind !== "outcome" || terminal.state !== "unpriced" || terminal.providerStatus !== "failed"
      || terminal.responseId !== reply.requestId) return false;
  }
  const wireFault = shape === "timeout" ? "timeout" : "http";
  const proof = { policyId, gameId: game.id, ownerId: game.ownerId, sceneId: scene.id,
    variantId: selected.row.id, hideId: selected.hide.id, assetId: selected.asset.id, imageSha256: selected.imageSha256,
    geometrySha256: selected.geometrySha256, identitySha256: sha256Bytes(prepared.sheet), attempts: selected.row.attempts,
    evidenceReviewAttempt: prepared.evidenceReviewAttempt, requestKey, operationFingerprint: fingerprint,
    unknownReasons: held.unknownReasons, retainedPayloadSha256: retained.payloadSha256, wireFault,
    ...(shape === "provider-failed" ? { providerFailed: PROVIDER_FAILED_SHAPE, responseId: reply.requestId } : {}) };
  const proofHash = sha256Bytes(Buffer.from(JSON.stringify(proof))), approvalId = release === "v1" ? `auto-review-${proofHash}` : `auto-review-v2-${proofHash}`;
  const prior = await budget.readContinuationApproval(worldId, requestKey);
  try {
    if (release === "v1") {
      const recovery: WorldAutomaticReviewRecovery = { version: "world-automatic-review-recovery/v1", worldId, approvalId,
        requestKey, scope: "judge", operationFingerprint: fingerprint, reserveMicroUsd: held.reserveMicroUsd,
        unknownReasons: held.unknownReasons, policyId: REVIEW_INTERRUPTION_POLICY, authorizationSha256: proofHash,
        authorizedAt: prior?.version === "world-automatic-review-recovery/v1" ? prior.authorizedAt : selected.row.updatedAt.toISOString() };
      await boardWizardBudgetOf(c, 1, { authorizeAutomaticReviewRecovery: async captured => JSON.stringify(captured) === JSON.stringify(recovery) })
        .authorizeAutomaticReviewRecovery(worldId, recovery);
    } else {
      const recovery: WorldAutomaticReviewRecoveryV2 = { version: "world-automatic-review-recovery/v2", worldId, approvalId,
        requestKey, scope: "judge", operationFingerprint: fingerprint, reserveMicroUsd: held.reserveMicroUsd,
        unknownReasons: held.unknownReasons, policyId: REVIEW_INTERRUPTION_POLICY_V2, authorizationSha256: proofHash,
        authorizedAt: prior?.version === "world-automatic-review-recovery/v2" ? prior.authorizedAt : selected.row.updatedAt.toISOString() };
      await boardWizardBudgetOf(c, 1, { authorizeAutomaticReviewRecoveryV2: async captured => JSON.stringify(captured) === JSON.stringify(recovery) })
        .authorizeAutomaticReviewRecoveryV2(worldId, recovery);
    }
  } catch (error) {
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
    const prior = JSON.parse(selected.row.judgeJson!);
    // The interrupted round counts against this image's fixed evidence total.
    const evidenceAttempts = [...(Array.isArray(prior.evidenceAttempts) ? prior.evidenceAttempts : []), { attempt: prepared.evidenceReviewAttempt,
      role: question.role, kind: "transport", code: wireFault, path: null, strategy: question.strategy, at: new Date().toISOString(), imageSha256: selected.imageSha256 }];
    const changed = await tx.targetVariantAsset.updateMany({ where: { id: selected.row.id, status: selected.row.status,
      assetId: selected.asset.id, attempts: selected.row.attempts, judgeJson: selected.row.judgeJson,
      rectJson: selected.row.rectJson, hitRectJson: selected.row.hitRectJson, headAnchorJson: selected.row.headAnchorJson },
      data: { status: "FAILED", lastError: shape === "timeout" ? "quality-unresolved: review transport interrupted; inspect the same pixels again"
          : "quality-unresolved: the provider ended the review failed; inspect the same pixels again",
        judgeJson: JSON.stringify({ ...prior, reviewState: "board-review-complete", verdict: null, evidenceAttempts,
          wireFault, reviewInterruption: { ...proof, recoveryId: approvalId, reservedMicroUsd: held.reserveMicroUsd },
          boardReview: { version: prepared.reviewVersion, fingerprint, requestKey, reviewScope: "ready-only/v1",
            ...(request.assessmentMode ? { assessmentMode: request.assessmentMode } : {}),
            reviewedHideIds: [selected.hide.id], evidenceReviewAttempt: prepared.evidenceReviewAttempt,
            evidenceReviewedAt: new Date().toISOString(), raw: null, model: null, costUnknown: true,
            ...(keepProof && prior.boardReview?.dual ? { dual: prior.boardReview.dual } : {}) } }) } });
    if (changed.count !== 1) return false;
    await tx.targetInstance.update({ where: { id: selected.row.targetInstanceId }, data: { status: "FAILED" } });
    await tx.auditLog.upsert({ where: { id: approvalId }, update: {}, create: { id: approvalId, actorType: "SYSTEM",
      action: policyId, entityType: "Game", entityId: game.id, metaJson: JSON.stringify(proof) } });
    await tx.generationJob.updateMany({ where: { id: `job_${game.id}`, status: "FAILED", currentStep: "local-patch:needs-release" },
      data: { status: "QUEUED", currentStep: "local-patch", lastError: null } });
    return true;
  }, { timeout: 30_000 });
}
