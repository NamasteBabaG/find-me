import { z } from "zod";
import { CelebrationKind, SoundCue, TargetAnimation, Unit, AmbientAnimation } from "../scene/schema";
import { isPackageTier, type PackageTier } from "../package";

/**
 * GameConfig — everything the player runtime needs, and nothing more.
 *
 * It is composed once per game (SceneComposer) and stored on Game.configJson.
 * It must NEVER contain the original photo, the parent's email, or any
 * owner-only data: the same JSON is shipped to anyone holding the play link.
 * All copy is already in the game's locale and personalised.
 */

/** A rectangle in fractions of the scene art (0..1), the same space slots use. */
const ArtRectSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().positive().max(1), h: z.number().positive().max(1) });
export type ArtRect = z.infer<typeof ArtRectSchema>;

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
    /**
     * Slot patch: the sprite is a piece of the world with the child painted in
     * (see docs/SPRITE_PATCHES.md). Drawn at this rect (fractions of the art)
     * instead of the slot anchor.
     */
    rect: ArtRectSchema.optional(),
    /**
     * Where the child inside the patch can be tapped (fractions of the art).
     * The patch rect can carry shadow and repainted scenery, so this is the
     * child's own footprint. Falls back to `rect`.
     */
    hitRect: ArtRectSchema.optional(),
    /** Top-centre of the head (fractions of the art): bubbles and hints point here. */
    anchor: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  }),
]);
export type SpriteRef = z.infer<typeof SpriteRefSchema>;

export const TargetAdjustSchema = z.object({
  dx: z.number().min(-0.2).max(0.2).default(0),
  dy: z.number().min(-0.2).max(0.2).default(0),
  scale: z.number().min(0.5).max(2).default(1),
});
export type TargetAdjust = z.infer<typeof TargetAdjustSchema>;

/** A slot with its hint already localised. */
export const PlaySlotSchema = z.object({
  id: z.string(),
  x: Unit,
  y: Unit,
  scale: z.number(),
  rotation: z.number().default(0),
  zIndex: z.number().int().default(10),
  layer: z.enum(["front", "behindForeground"]).default("front"),
  flip: z.boolean().default(false),
  hintZone: z.object({ x: Unit, y: Unit, r: z.number() }),
  hintText: z.string(),
});
export type PlaySlot = z.infer<typeof PlaySlotSchema>;

export const TargetConfigSchema = z.object({
  id: z.string(),
  targetType: z.string(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** Already personalised ("Find Noa with the float ring"). */
  mission: z.string(),
  item: z.string(),
  success: z.array(z.string()).min(1),
  animation: TargetAnimation,
  slots: z.tuple([PlaySlotSchema, PlaySlotSchema]),
  sprite: SpriteRefSchema,
  /** Per-variant sprites (slot patches differ between hiding spot A and B); `sprite` stays the default/fallback. */
  spriteByVariant: z.object({ A: SpriteRefSchema.optional(), B: SpriteRefSchema.optional() }).optional(),
  adjust: TargetAdjustSchema.optional(),
});
export type TargetConfig = z.infer<typeof TargetConfigSchema>;

export const PlayAmbientSchema = z.object({
  id: z.string(),
  label: z.string(),
  x: Unit,
  y: Unit,
  w: z.number(),
  h: z.number(),
  animation: AmbientAnimation,
  sound: SoundCue.optional(),
  reaction: z.string().optional(),
  glyph: z.string().optional(),
  cooldownMs: z.number().int().default(1500),
});
export type PlayAmbient = z.infer<typeof PlayAmbientSchema>;

export const PlayBonusSchema = z.object({
  id: z.string(),
  name: z.string(),
  sprite: z.string(),
  scale: z.number(),
  prompt: z.string(),
  slots: z.tuple([PlaySlotSchema, PlaySlotSchema]),
});

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
  ambient: z.array(PlayAmbientSchema),
  bonus: PlayBonusSchema.optional(),
  celebration: z.object({ kind: CelebrationKind, completeText: z.string() }),
  collectible: z.object({ id: z.string(), name: z.string(), icon: z.string() }),
  sounds: z.object({ ambient: SoundCue.optional() }).default({}),
});
export type SceneConfig = z.infer<typeof SceneConfigSchema>;

/**
 * The world the boards belong to, already localised and personalised: the map,
 * the journey order, and what the child is collecting along it.
 *
 * Optional, so a config written before worlds existed still parses and simply
 * falls back to the plain list of boards.
 */
export const PlayWorldSchema = z.object({
  slug: z.string(),
  version: z.number().int(),
  name: z.string(),
  tagline: z.string(),
  intro: z.string(),
  map: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    art: z.string().min(1),
    artPortrait: z.string().optional(),
    palette: z.object({ sky: z.string(), ground: z.string(), accent: z.string() }),
  }),
  nodes: z
    .array(
      z.object({
        boardSlug: z.string(),
        routeIndex: z.number().int().positive(),
        x: Unit,
        y: Unit,
        iconAsset: z.string().optional(),
        labelAnchor: z.enum(["top", "bottom", "start", "end"]),
        markerScale: z.number().positive(),
        travelStyle: z.enum(["walk", "hop", "sail", "float", "rocket"]),
      }),
    )
    .min(1),
  collectible: z.object({ id: z.string(), name: z.string(), piece: z.string(), icon: z.string() }),
  completion: z.object({ title: z.string(), text: z.string(), icon: z.string() }),
});
export type PlayWorld = z.infer<typeof PlayWorldSchema>;

export const GameConfigSchema = z.object({
  version: z.literal(1),
  gameId: z.string(),
  locale: z.enum(["en", "he"]),
  child: z.object({
    name: z.string(),
    /** Signed URL of the illustrated sticker used on the cover, map and passport. */
    avatarUrl: z.string(),
  }),
  styleVersion: z.string(),
  packageTier: z.custom<PackageTier>(isPackageTier),
  scenes: z.array(SceneConfigSchema).min(1),
  /** The journey these boards form. Absent in configs written before worlds. */
  world: PlayWorldSchema.optional(),
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
