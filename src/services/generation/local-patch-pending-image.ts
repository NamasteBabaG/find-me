import type { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { abandonedImageProofSchema, pendingImageObservationSchema, pendingImageLeaseExpired,
  PENDING_IMAGE_LEASE_VERSION } from "../../domain/generation/pending-image-lease";
import { interruptedLocalPatchImageRequest } from "../../domain/scene/local-patch-image-request";
import { boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { boardConditioningHash as hash } from "./board-conditioned-source";
import { LocalPatchRetainedPurchaseStore, fenceLocalPatchImages } from "./local-patch-lifecycle";
import { singleLowReviewAuthorization } from "./single-low-policy";
import type { WorldBudgetRequest } from "./world-budget";

const observationId = (gameId: string, key: string) => "aud_pending_image_" + hash([gameId, key]);
const closureId = (gameId: string, key: string) => "aud_abandoned_image_" + hash([gameId, key]);
const action = PENDING_IMAGE_LEASE_VERSION;
export const abandonedImageReason = (proof: unknown) => action + ":" + hash(proof);
function systemRecord(row: { actorType: string; actorId: string | null; entityType: string; entityId: string; action: string } | null, gameId: string) {
  return row?.actorType === "SYSTEM" && row.actorId === null && row.entityType === "Game" && row.entityId === gameId && row.action === action;
}

/** A receipt of the engine's own two observations, never an inferred provider
 * error or a zero bill. Only the prospective one-LOW policy can consume it. */
export async function abandonedLocalPatchImageProof(c: Pick<Container, "db">, gameId: string, request: WorldBudgetRequest, rowId: string) {
  const authority = await singleLowReviewAuthorization(c.db, gameId);
  if (authority?.kind !== "from-birth" || request.scope !== "image" || request.origin !== "reserved"
    || request.conflicts.length || !["pending", "unknown"].includes(request.state)) return null;
  const row = await c.db.auditLog.findUnique({ where: { id: closureId(gameId, request.requestKey) } });
  if (!systemRecord(row, gameId)) return null;
  let proof: ReturnType<typeof abandonedImageProofSchema.parse>;
  try { proof = abandonedImageProofSchema.parse(JSON.parse(row!.metaJson ?? "null")); } catch { return null; }
  const observation = await c.db.auditLog.findUnique({ where: { id: observationId(gameId, request.requestKey) } });
  const { closedClaim: _claim, closedAt: _at, ...original } = proof;
  if (!systemRecord(observation, gameId) || observation!.metaJson !== JSON.stringify(original)
    || proof.gameId !== gameId || proof.rowId !== rowId || proof.requestKey !== request.requestKey
    || proof.operationFingerprint !== request.operationFingerprint || proof.reserveMicroUsd !== request.reserveMicroUsd
    || proof.authorizationSha256 !== authority.authorizationSha256 || proof.identitySha256 !== authority.identitySha256
    || proof.sceneVersion !== authority.sceneVersion
    || (request.state === "unknown" ? request.unknownReasons.length !== 1 || request.unknownReasons[0] !== abandonedImageReason(proof)
      : request.unknownReasons.length !== 0)) return null;
  return proof;
}

/** Adopt no dispatch, release no money. A new claim first records an unanswered
 * first-image reservation. Only a later claim, after another full takeover
 * window, can conclude that no worker retained its answer. The existing image
 * interruption policy then decides whether its ONE replacement is allowed. */
export async function reconcilePendingLocalPatchImages(c: Container, gameId: string, claim: number,
  fence: (tx: Prisma.TransactionClient) => Promise<void>): Promise<number> {
  if (env().APP_ENV !== "qa" || c.storage.id !== "db") return 0;
  const authority = await singleLowReviewAuthorization(c.db, gameId);
  if (authority?.kind !== "from-birth") return 0;
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { scenes: true, orders: true } });
  if (!game || game.status !== "TARGETS_GENERATING" || game.styleVersion !== "local-patch-world-v1"
    || game.deletedAt || game.configJson || !game.ownerId || game.scenes.length !== 9
    || game.scenes.some(s => s.sceneVersion !== authority.sceneVersion)
    || !game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    || game.orders.some(o => o.refundedAt || o.paymentStatus === "REFUNDED")) return 0;
  const worldId = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c), audit = await budget.audit(worldId);
  if (audit.capMicroUsd !== 4000000 || audit.overCapMicroUsd || audit.conflictRequestKeys.length || audit.overrunRequestKeys.length) return 0;
  const store = new LocalPatchRetainedPurchaseStore(c, gameId, budget);
  let closed = 0;
  for (const key of audit.pendingRequestKeys) {
    const authored = interruptedLocalPatchImageRequest(key), request = await budget.readRequest(worldId, key);
    if (!authored || authored.attempt !== 1 || (authored.sceneVersion ?? 12) !== authority.sceneVersion
      || !request || request.state !== "pending" || request.scope !== "image" || request.origin !== "reserved"
      || request.reserveMicroUsd !== 120000 || request.conflicts.length || request.unknownReasons.length
      || await store.get(worldId, key)) continue;
    const scene = game.scenes.find(s => s.sceneSlug === authored.board.board);
    if (!scene) continue;
    const row = await c.db.targetVariantAsset.findFirst({ where: { variant: "A", provider: "local-patch", status: "PENDING",
      attempts: 1, assetId: null, targetInstance: { gameSceneId: scene.id, targetId: authored.hide.targetId } } });
    if (!row) continue;
    const id = observationId(gameId, key), observed = await c.db.auditLog.findUnique({ where: { id } });
    if (!observed) {
      await c.db.$transaction(async tx => {
        await fenceLocalPatchImages(tx, gameId); await fence(tx);
        const current = await tx.targetVariantAsset.findUnique({ where: { id: row.id } });
        if (!current || current.status !== "PENDING" || current.attempts !== 1 || current.assetId) return;
        const body = pendingImageObservationSchema.parse({ version: action, gameId, worldId, sceneVersion: authority.sceneVersion,
          rowId: row.id, requestKey: key, operationFingerprint: request.operationFingerprint, reserveMicroUsd: request.reserveMicroUsd,
          authorizationSha256: authority.authorizationSha256, identitySha256: authority.identitySha256,
          observedClaim: claim, observedAt: new Date().toISOString() });
        await tx.auditLog.upsert({ where: { id }, update: {}, create: { id, actorType: "SYSTEM", action,
          entityType: "Game", entityId: gameId, metaJson: JSON.stringify(body) } });
      });
      continue;
    }
    if (!systemRecord(observed, gameId)) continue;
    let value: unknown;
    try { value = JSON.parse(observed.metaJson ?? "null"); } catch { continue; }
    const parsed = pendingImageObservationSchema.safeParse(value);
    if (!parsed.success || observed.metaJson !== JSON.stringify(parsed.data)) continue;
    const observation = parsed.data;
    if (observation.gameId !== gameId || observation.worldId !== worldId || observation.rowId !== row.id
      || observation.requestKey !== key || observation.operationFingerprint !== request.operationFingerprint
      || observation.reserveMicroUsd !== request.reserveMicroUsd || observation.sceneVersion !== authority.sceneVersion
      || observation.authorizationSha256 !== authority.authorizationSha256 || observation.identitySha256 !== authority.identitySha256
      || !pendingImageLeaseExpired(observation, claim, Date.now())) continue;
    const closeId = closureId(gameId, key);
    await c.db.$transaction(async tx => {
      await fenceLocalPatchImages(tx, gameId); await fence(tx);
      const current = await tx.targetVariantAsset.findUnique({ where: { id: row.id } });
      const live = await tx.game.findUnique({ where: { id: gameId }, include: { orders: true } });
      if (!current || current.status !== "PENDING" || current.attempts !== 1 || current.assetId
        || !live || live.status !== "TARGETS_GENERATING" || live.deletedAt || live.configJson
        || live.orders.some(o => o.refundedAt || o.paymentStatus === "REFUNDED")) return;
      const proof = abandonedImageProofSchema.parse({ ...observation, closedClaim: claim, closedAt: new Date().toISOString() });
      await tx.auditLog.upsert({ where: { id: closeId }, update: {}, create: { id: closeId, actorType: "SYSTEM", action,
        entityType: "Game", entityId: gameId, metaJson: JSON.stringify(proof) } });
    });
    // Reconcile again after the observation commit. A retained answer always
    // wins; settlement remains the original purchase's normal replay path.
    if (await store.get(worldId, key)) continue;
    const proof = await abandonedLocalPatchImageProof(c, gameId, request, row.id);
    const current = await c.db.targetVariantAsset.findUnique({ where: { id: row.id } });
    if (!proof || !current || current.status !== "PENDING" || current.attempts !== 1 || current.assetId) continue;
    const result = await budget.markUnknown(worldId, key, abandonedImageReason(proof), { onlyPending: true });
    if (result.request.state === "unknown" && await abandonedLocalPatchImageProof(c, gameId, result.request, row.id)) closed++;
  }
  return closed;
}
