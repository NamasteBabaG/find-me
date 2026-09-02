import { z } from "zod";
import { newId } from "@/lib/ids";
import type { Container } from "./container";

/**
 * Aggregate play telemetry. Progress itself lives in the player's browser;
 * the server only sees coarse events for product research (no coordinates,
 * no names).
 */
export const ProgressEventInput = z.object({
  eventType: z.enum(["scene_started", "target_found", "hint_used", "scene_completed", "game_completed", "game_replayed"]),
  sceneSlug: z.string().optional(),
  targetId: z.string().optional(),
  hintsUsed: z.number().int().min(0).max(99).default(0),
});

export const ProgressBatchInput = z.object({
  gameId: z.string(),
  anonymousSessionId: z.string().min(8).max(64),
  deviceType: z.enum(["phone", "tablet", "desktop"]).optional(),
  events: z.array(ProgressEventInput).max(50),
});

export async function recordProgress(c: Container, input: z.infer<typeof ProgressBatchInput>): Promise<void> {
  let session = await c.db.playSession.findFirst({ where: { gameId: input.gameId, anonymousSessionId: input.anonymousSessionId } });
  if (!session) {
    session = await c.db.playSession.create({ data: { id: newId("ply"), gameId: input.gameId, anonymousSessionId: input.anonymousSessionId, deviceType: input.deviceType ?? null } });
  }
  if (input.events.length === 0) return;
  await c.db.progressEvent.createMany({
    data: input.events.map((e) => ({ id: newId("prg"), sessionId: session.id, sceneSlug: e.sceneSlug ?? null, targetId: e.targetId ?? null, eventType: e.eventType, hintsUsed: e.hintsUsed })),
  });
  if (input.events.some((e) => e.eventType === "game_completed") && !session.completedAt) {
    await c.db.playSession.update({ where: { id: session.id }, data: { completedAt: new Date() } });
  }
  for (const e of input.events) c.analytics.track(e.eventType, { gameId: input.gameId, sceneSlug: e.sceneSlug, targetId: e.targetId, hintsUsed: e.hintsUsed, deviceType: input.deviceType }, { anonymousId: input.anonymousSessionId });
}
