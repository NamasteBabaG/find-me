import { z } from "zod";
import { AmbientSchema, BonusSchema, CelebrationKind, SlotSchema, SoundCue, TargetAnimation } from "../scene/schema";
import type { PackageTier } from "../package";

/**
 * GameConfig — everything the player runtime needs, and nothing more.
 *
 * It is composed once per game (SceneComposer) and stored on Game.configJson.
 * It must NEVER contain the original photo, the parent's email, or any
 * owner-only data: the same JSON is shipped to anyone holding the play link.
 */

export const SpriteRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("composed"),
    /** Signed URL of the face sticker (AVATAR asset). */
    faceUrl: z.string().min(1),
    bodyTemplate: z.string().min(1),
  }),
  z.object({
    kind: z.literal("image"),
    /** Signed URL of a fully generated transparent sprite. */
    url: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
]);
export type SpriteRef = z.infer<typeof SpriteRefSchema>;

export const TargetAdjustSchema = z.object({
  dx: z.number().min(-0.2).max(0.2).default(0),
  dy: z.number().min(-0.2).max(0.2).default(0),
  scale: z.number().min(0.5).max(2).default(1),
});
export type TargetAdjust = z.infer<typeof TargetAdjustSchema>;

export const TargetConfigSchema = z.object({
  id: z.string(),
  targetType: z.string(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** Already personalised ("מצאו את נועה עם גלגל ים צהוב"). */
  mission: z.string(),
  item: z.string(),
  success: z.array(z.string()).min(1),
  animation: TargetAnimation,
  slots: z.tuple([SlotSchema, SlotSchema]),
  sprite: SpriteRefSchema,
  adjust: TargetAdjustSchema.optional(),
});
export type TargetConfig = z.infer<typeof TargetConfigSchema>;

export const SceneConfigSchema = z.object({
  slug: z.string(),
  version: z.number().int(),
  name: z.string(),
  tagline: z.string(),
  artStatus: z.enum(["placeholder", "draft", "final"]),
  art: z.object({
    width: z.number().int(),
    height: z.number().int(),
    base: z.string(),
    foreground: z.string().optional(),
    thumbnail: z.string(),
    palette: z.object({ sky: z.string(), ground: z.string(), accent: z.string() }),
  }),
  intro: z
    .object({
      from: z.object({ x: z.number(), y: z.number(), zoom: z.number() }),
      to: z.object({ x: z.number(), y: z.number(), zoom: z.number() }),
      durationMs: z.number().int(),
    })
    .optional(),
  targets: z.array(TargetConfigSchema).length(3),
  ambient: z.array(AmbientSchema),
  bonus: BonusSchema.optional(),
  celebration: z.object({ kind: CelebrationKind, completeText: z.string() }),
  collectible: z.object({ id: z.string(), name: z.string(), icon: z.string() }),
  sounds: z.object({ ambient: SoundCue.optional() }).default({}),
});
export type SceneConfig = z.infer<typeof SceneConfigSchema>;

export const GameConfigSchema = z.object({
  version: z.literal(1),
  gameId: z.string(),
  child: z.object({
    name: z.string(),
    /** Signed URL of the illustrated sticker used on the cover, map and passport. */
    avatarUrl: z.string(),
  }),
  styleVersion: z.string(),
  packageTier: z.custom<PackageTier>((v) => v === "SMALL" || v === "BIG" || v === "WORLD"),
  scenes: z.array(SceneConfigSchema).min(1),
  gift: z
    .object({
      fromName: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
  composedAt: z.string(),
});
export type GameConfig = z.infer<typeof GameConfigSchema>;

export function parseGameConfig(json: string): GameConfig {
  return GameConfigSchema.parse(JSON.parse(json));
}
