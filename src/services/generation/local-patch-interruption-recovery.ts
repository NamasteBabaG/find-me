import type { Container } from "../container";
import { CasWorldBudgetRepository } from "../../infra/db/world-budget-repository";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { fixedSourceFailureReceiptSchema } from "../../infra/generation/fixed-source-diagnostics";
import { boardWizardBudget } from "./board-wizard-budget";
import { boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { LocalPatchRetainedPurchaseStore, fenceLocalPatchImages } from "./local-patch-lifecycle";
import { RETAINED_RENDER_VERSION } from "./local-patch-render";
import { sha256Bytes } from "./fixed-sprite";
import { WorldBudgetError, type WorldAutomaticImageRecovery, type WorldBudget } from "./world-budget";
import type { Prisma } from "@prisma/client";
import { interruptedLocalPatchImageRequest } from "../../domain/scene/local-patch-image-request";

export const IMAGE_INTERRUPTION_POLICY = "local-patch-image-interruption/v1" as const;
const hash = (value: unknown) => sha256Bytes(Buffer.from(JSON.stringify(value)));

/** Delivery may use a fully verified replacement while the missing attempt's
 * reserve remains open. A live request, ordinary operator grant, billing
 * conflict or an unapproved unknown never crosses this publication boundary. */
export async function localPatchBudgetReadyForPublication(budget: Pick<WorldBudget, "audit" | "readContinuationApproval">,
  worldId: string, contentVersion: number | undefined): Promise<boolean> {
  const audit = await budget.audit(worldId);
  if (audit.held || audit.pendingRequestKeys.length) return false;
  if (audit.reservedMicroUsd === 0) return true;
  if (contentVersion !== 12 || !audit.unknownRequestKeys.length) return false;
  for (const key of audit.unknownRequestKeys) {
    const version = (await budget.readContinuationApproval(worldId, key))?.version;
    if (version !== "world-automatic-image-recovery/v1" && version !== "world-automatic-review-recovery/v1") return false;
  }
  return true;
}

/** One replacement for an interrupted first image, at most two different hides
 * per world. The missing charge stays UNKNOWN and fully reserved forever until
 * authentic evidence arrives. No retry of its key, budget increase or approval
 * of its pixels. Billing conflicts and available unpriced pictures stay held. */
export async function recoverLocalPatchImageInterruptions(c: Container, gameId: string,
  fence?: (tx: Prisma.TransactionClient) => Promise<void>): Promise<number> {
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { scenes: true, orders: true } });
  if (!game || game.styleVersion !== "local-patch-world-v1" || game.status !== "TARGETS_GENERATING" || game.deletedAt
    || game.configJson || !game.ownerId || game.scenes.length !== 9 || game.scenes.some(s => s.sceneVersion !== 12)
    || !game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    || game.orders.some(o => o.refundedAt || o.paymentStatus === "REFUNDED")) return 0;
  const worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c), audit = await budget.audit(worldId);
  if (audit.overCapMicroUsd || audit.conflictRequestKeys.length || audit.overrunRequestKeys.length) return 0;
  const store = new LocalPatchRetainedPurchaseStore(c, gameId, budget);
  let recovered = 0;
  for (const requestKey of audit.unknownRequestKeys) {
    const authored = interruptedLocalPatchImageRequest(requestKey);
    if (!authored || authored.attempt !== 1) continue;
    const scene = game.scenes.find(s => s.sceneSlug === authored.board.board);
    const hide = authored.hide;
    if (!scene || !hide) continue;
    const row = await c.db.targetVariantAsset.findFirst({ where: { variant: "A", targetInstance: { gameSceneId: scene.id, targetId: hide.targetId } } });
    if (!row || row.attempts !== 1 || row.assetId || row.provider !== "local-patch") continue;
    const priorReceipt = JSON.parse(row.judgeJson ?? "{}");
    const unfinishedTransition = row.status === "FAILED" && row.lastError?.startsWith("image-interruption:")
      && priorReceipt.imageInterruption?.requestKey === requestKey && !priorReceipt.renderFault;
    if (row.status !== "PENDING" && !unfinishedTransition) continue;
    const request = await budget.readRequest(worldId, requestKey), retained = await store.get(worldId, requestKey);
    if (!request || request.state !== "unknown" || request.origin !== "reserved" || request.scope !== "image" || request.conflicts.length) continue;
    let diagnostic: unknown = null;
    if (retained) {
      if (retained.evidence || retained.operationFingerprint !== request.operationFingerprint) continue;
      let envelope: { version?: string; bytesBase64?: unknown; failureReceipt?: unknown };
      try { envelope = JSON.parse(retained.bytes.toString()); } catch { continue; }
      if (envelope.version !== RETAINED_RENDER_VERSION || envelope.bytesBase64 !== null) continue;
      const parsed = fixedSourceFailureReceiptSchema.safeParse(envelope.failureReceipt);
      if (!parsed.success || parsed.data.worldId !== worldId || parsed.data.requestKey !== requestKey || parsed.data.billing !== "unknown") continue;
      const d = parsed.data;
      // Authentication, invalid inputs, policy refusals and malformed successful
      // responses need their own fix; blindly buying them again is not recovery.
      if (["invalid_api_key", "insufficient_quota", "model_not_found", "permission_denied", "access_denied", "content_policy_violation", "moderation_blocked"].includes(d.providerErrorCode ?? "")) continue;
      if (!(d.reason === "transport" && (d.transport === "timeout" || d.transport === "network-or-runtime")
        || d.httpStatus !== null && [408, 429, 500, 502, 503, 504].includes(d.httpStatus))) continue;
      diagnostic = d;
    } else {
      // Legacy adapter discarded the typed transport receipt. Only its exact
      // missing-result marker qualifies, not arbitrary unknown billing evidence.
      const legacy = `${requestKey} failed after dispatch: LOCAL_PATCH_PAINTER: ${requestKey} was dispatched and no usable image came back (cost_unknown: Request billing is unknown; reservation retained and no retry dispatched)`;
      if (request.unknownReasons.length !== 1 || request.unknownReasons[0] !== legacy) continue;
    }
    const proof = { policyId: IMAGE_INTERRUPTION_POLICY, gameId, ownerId: game.ownerId, sceneId: scene.id,
      variantId: row.id, requestKey, operationFingerprint: request.operationFingerprint, unknownReasons: request.unknownReasons, diagnostic };
    const proofHash = hash(proof), approvalId = `auto-image-${proofHash}`;
    const prior = await budget.readContinuationApproval(worldId, requestKey);
    if (unfinishedTransition && (prior?.version !== "world-automatic-image-recovery/v1" || prior.approvalId !== priorReceipt.imageInterruption.recoveryId)) continue;
    const recovery: WorldAutomaticImageRecovery = { version: "world-automatic-image-recovery/v1", worldId, approvalId,
      requestKey, scope: "image", operationFingerprint: request.operationFingerprint, reserveMicroUsd: request.reserveMicroUsd,
      unknownReasons: request.unknownReasons, policyId: IMAGE_INTERRUPTION_POLICY, authorizationSha256: proofHash,
      authorizedAt: prior?.version === "world-automatic-image-recovery/v1" ? prior.authorizedAt : row.updatedAt.toISOString() };
    const recoveringBudget = boardWizardBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(c.db)), 1,
      { authorizeAutomaticImageRecovery: async captured => JSON.stringify(captured) === JSON.stringify(recovery) });
    try { await recoveringBudget.authorizeAutomaticImageRecovery(worldId, recovery); }
    catch (error) {
      if (error instanceof WorldBudgetError && ["invalid_snapshot", "world_held", "invalid_input"].includes(error.code)) continue;
      throw error;
    }
    await c.db.$transaction(async tx => {
      await fenceLocalPatchImages(tx, gameId); await fence?.(tx);
      const live = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { orders: true } });
      if (live.status !== "TARGETS_GENERATING" || live.ownerId !== game.ownerId || live.configJson
        || live.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt)) throw Error("Interrupted game changed before recovery");
      const changed = await tx.targetVariantAsset.updateMany({ where: { id: row.id, status: row.status, attempts: 1, assetId: null, judgeJson: row.judgeJson },
        data: { status: "FAILED", lastError: "image-interruption: no image returned; unknown charge remains fully reserved; use the next attempt",
          judgeJson: JSON.stringify({ ...priorReceipt, renderFault: "image-interruption: no image returned; the next image requires a new request key",
            imageInterruption: { ...proof, recoveryId: approvalId, reservedMicroUsd: request.reserveMicroUsd } }) } });
      if (changed.count !== 1) return;
      await tx.targetInstance.update({ where: { id: row.targetInstanceId }, data: { status: "FAILED" } });
      await tx.auditLog.upsert({ where: { id: approvalId }, update: {}, create: { id: approvalId, actorType: "SYSTEM",
        action: IMAGE_INTERRUPTION_POLICY, entityType: "Game", entityId: gameId, metaJson: JSON.stringify(proof) } });
      await tx.generationJob.updateMany({ where: { id: `job_${gameId}`, status: "FAILED", currentStep: "local-patch:needs-release" },
        data: { status: "QUEUED", currentStep: "local-patch", lastError: null } });
      recovered++;
    });
  }
  return recovered;
}
