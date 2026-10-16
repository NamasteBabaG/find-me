import type { Prisma } from "@prisma/client";
import { env } from "../../lib/env";
import { DUAL_VISUAL_REVIEW_V3, dualVisualReviewVersion } from "./visual-review-release";

/**
 * How a game's Opus scene-quality questions are delivered, chosen once, when its
 * draft is created. A game without a pin asks them synchronously, exactly as
 * before this file.
 *
 * `anthropic-batch-v1`: the same question, the same model, effort and reader,
 * delivered by Anthropic's Message Batches at half the standard price. A question
 * still unanswered at the deadline is cancelled; only a result the provider
 * documents as unbilled (errored, canceled, expired) is asked again
 * synchronously. Everything else is decided by the round's own rules
 * (quality-batch-round.ts). Sol's continuity question is not changed.
 */
export const QUALITY_BATCH_CHANNEL = "local-patch-quality-channel/anthropic-batch-v1" as const;
export type QualityChannelRelease = typeof QUALITY_BATCH_CHANNEL;
export const QUALITY_CHANNEL_ACTION = "generation:quality-channel";
export const qualityChannelAuditId = (gameId: string) => `aud_quality_channel_${gameId}`;
/** The proposed policy (A2): a batch question unanswered after six hours is cancelled. */
export const QUALITY_BATCH_DEADLINE_MS = 6 * 60 * 60_000;
const receiptOf = (gameId: string) => ({ version: QUALITY_BATCH_CHANNEL, gameId, role: "scene-quality", model: "claude-opus-5-5",
  channel: "anthropic-message-batches", pricing: "half-of-visual-review-standard-2026-10-08", deadlineMs: QUALITY_BATCH_DEADLINE_MS,
  fallback: "synchronous, only after a documented-unbilled result", qualifiedWith: { visualReviewRelease: DUAL_VISUAL_REVIEW_V3 } });

/** The Opus quality question exists only under a dual review; v3 is the one the batch contract (E5) asked. */
export function qualityBatchQualified(input: { appEnv: string | undefined; reviewRelease: string | null | undefined }) {
  return input.appEnv === "qa" && input.reviewRelease === DUAL_VISUAL_REVIEW_V3;
}

/** Called ONLY in the transaction that creates a fresh local-patch draft, after
 * its review pin. A chosen channel outside its qualified configuration fails the
 * draft rather than delivering its questions some other way. */
export async function pinQualityChannel(tx: Prisma.TransactionClient, gameId: string, channel: QualityChannelRelease | undefined) {
  if (channel === undefined) return;
  if (channel !== QUALITY_BATCH_CHANNEL) throw Error("Unsupported quality channel");
  if (!qualityBatchQualified({ appEnv: env().APP_ENV, reviewRelease: await dualVisualReviewVersion(tx, gameId) }))
    throw Error("The batch quality channel is qualified only on QA with dual review v3");
  const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
  if (game.status !== "DRAFT" || game.styleVersion !== "local-patch-world-v1" || game.deletedAt || game.readyAt || game.configJson || game.paidAt
    || await tx.order.findFirst({ where: { gameId } })
    || await tx.generationJob.findFirst({ where: { gameId } })) throw Error("Only an unstarted new local-patch draft may receive a quality channel");
  await tx.auditLog.create({ data: { id: qualityChannelAuditId(gameId), actorType: "SYSTEM", action: QUALITY_CHANNEL_ACTION,
    entityType: "Game", entityId: gameId, metaJson: JSON.stringify(receiptOf(gameId)) } });
}

/** The exact pinned channel, or null for a game that asks synchronously. A pin
 * that is not byte-for-byte a known release is refused, never treated as the nearest one. */
export async function qualityChannelOf(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string): Promise<{ channel: QualityChannelRelease; deadlineMs: number } | null> {
  const row = await db.auditLog.findUnique({ where: { id: qualityChannelAuditId(gameId) } });
  if (!row) return null;
  if (row.actorType !== "SYSTEM" || row.actorId !== null || row.action !== QUALITY_CHANNEL_ACTION || row.entityType !== "Game"
    || row.entityId !== gameId || row.metaJson !== JSON.stringify(receiptOf(gameId))) throw Error("Pinned quality channel is invalid; refusing a fallback");
  return { channel: QUALITY_BATCH_CHANNEL, deadlineMs: QUALITY_BATCH_DEADLINE_MS };
}
