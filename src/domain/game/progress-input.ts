import { z } from "zod";
import { boundedArray } from "../bounded-array";

export const ProgressEventInput = z.object({
  eventType: z.enum(["scene_started", "target_found", "hint_used", "scene_completed", "game_completed", "game_replayed", "scene_unlocked", "journey_finished"]),
  sceneSlug: z.string().min(1).max(160).optional(),
  targetId: z.string().min(1).max(160).optional(),
  hintsUsed: z.number().int().min(0).max(99).prefault(0),
});

export const ProgressBatchInput = z.object({
  gameId: z.string().min(1).max(160),
  anonymousSessionId: z.string().min(8).max(64),
  deviceType: z.enum(["phone", "tablet", "desktop"]).optional(),
  events: boundedArray(ProgressEventInput, 50),
});
