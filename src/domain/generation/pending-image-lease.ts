import { z } from "zod";

export const PENDING_IMAGE_LEASE_VERSION = "local-patch-pending-image-lease/v1" as const;
/** Longer than a complete image call and retention window, and equal to the
 * world's takeover lease. A changed claim alone never abandons an image. */
export const PENDING_IMAGE_LEASE_MS = 6 * 60_000;
const id = z.string().min(1).max(240), digest = z.string().regex(/^[a-f0-9]{64}$/);
export const pendingImageObservationSchema = z.object({
  version: z.literal(PENDING_IMAGE_LEASE_VERSION), gameId: id, worldId: id,
  sceneVersion: z.union([z.literal(12), z.literal(13)]), rowId: id, requestKey: id,
  operationFingerprint: digest, reserveMicroUsd: z.literal(120000),
  authorizationSha256: digest, identitySha256: digest,
  observedClaim: z.number().int().positive(), observedAt: z.string().datetime(),
}).strict();
export type PendingImageObservation = z.infer<typeof pendingImageObservationSchema>;
export const abandonedImageProofSchema = pendingImageObservationSchema.extend({
  closedClaim: z.number().int().positive(), closedAt: z.string().datetime(),
}).strict().refine(p => p.worldId === p.gameId + ":board-wizard"
  && p.closedClaim > p.observedClaim
  && Date.parse(p.closedAt) - Date.parse(p.observedAt) >= PENDING_IMAGE_LEASE_MS);

export function pendingImageLeaseExpired(observation: PendingImageObservation, claim: number, now: number): boolean {
  return Number.isSafeInteger(claim) && claim > observation.observedClaim
    && Number.isFinite(now) && now - Date.parse(observation.observedAt) >= PENDING_IMAGE_LEASE_MS;
}
