import { z } from "zod";

export const ProgressEventInput = z.object({
  eventType: z.enum(["scene_started", "target_found", "hint_used", "scene_completed", "game_completed", "game_replayed", "scene_unlocked", "journey_finished"]),
  sceneSlug: z.string().min(1).max(160).optional(),
  targetId: z.string().min(1).max(160).optional(),
  hintsUsed: z.number().int().min(0).max(99).default(0),
});

export const ProgressBatchInput = z.object({
  gameId: z.string().min(1).max(160),
  anonymousSessionId: z.string().min(8).max(64),
  deviceType: z.enum(["phone", "tablet", "desktop"]).optional(),
  // Refuse cardinality before Zod v3 visits and accumulates issues for every element.
  events: z.unknown().superRefine((value, ctx) => {
    if (Array.isArray(value) && value.length > 50) {
      ctx.addIssue({ code: z.ZodIssueCode.too_big, type: "array", maximum: 50, inclusive: true, fatal: true });
    }
  }).pipe(z.array(ProgressEventInput).max(50)),
});
