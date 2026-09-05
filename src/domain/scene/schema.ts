import { z } from "zod";
import { TARGETS_PER_SCENE } from "../package";

/**
 * SceneDefinition — the authoring contract for a world.
 *
 * A scene is a fixed, shared asset (art + level design). Only the child's
 * sprites and per-game configuration are personal. Scenes are authored as
 * JSON in /content/scenes/<slug>/scene.json (see docs/SCENE_AUTHORING.md)
 * and validated with `validateSceneDefinition` at load time and in CI.
 *
 * All coordinates are normalized (0..1) against the base art size so the
 * same scene works on every viewport. All copy is bilingual (en/he); the
 * game is composed in the locale the parent purchased in.
 */

export const Unit = z.number().min(0).max(1);

/** Every player-facing string ships in both languages. */
export const LocalizedTextSchema = z.object({ en: z.string().min(1), he: z.string().min(1) });
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

export const TARGET_ANIMATIONS = ["bounce", "wave", "wiggle", "spin", "float", "peek", "salute", "jump"] as const;
export const TargetAnimation = z.enum(TARGET_ANIMATIONS);
export type TargetAnimation = z.infer<typeof TargetAnimation>;

export const CELEBRATION_KINDS = ["bubbles", "stars", "leaves", "confetti", "crowd", "fruit", "sparkles", "hearts", "snow"] as const;
export const CelebrationKind = z.enum(CELEBRATION_KINDS);
export type CelebrationKind = z.infer<typeof CelebrationKind>;

export const AMBIENT_ANIMATIONS = ["hop", "spin", "shake", "pop", "slide", "blink", "bounce", "float", "flash"] as const;
export const AmbientAnimation = z.enum(AMBIENT_ANIMATIONS);
export type AmbientAnimation = z.infer<typeof AmbientAnimation>;

export const SOUND_CUES = ["pop", "tap", "success", "fanfare", "splash", "chirp", "whoosh", "boing", "twinkle", "crowd", "waves", "jungle", "space"] as const;
export const SoundCue = z.enum(SOUND_CUES);
export type SoundCue = z.infer<typeof SoundCue>;

export const ART_STATUSES = ["placeholder", "draft", "final"] as const;

export const SlotSchema = z.object({
  id: z.string().min(1),
  /** Anchor point (sprite centre), normalized to base art. */
  x: Unit,
  y: Unit,
  /** Sprite height as a fraction of scene height. Spec target: ~0.04 / 0.03 / 0.025. */
  scale: z.number().min(0.015).max(0.25),
  rotation: z.number().min(-45).max(45).default(0),
  zIndex: z.number().int().min(0).max(100).default(10),
  /** `behindForeground` renders under the foreground overlay so the art occludes part of the sprite. */
  layer: z.enum(["front", "behindForeground"]).default("front"),
  flip: z.boolean().default(false),
  /** Level-2 hint: the glowing area. Radius is a fraction of scene width. Must contain (x,y). */
  hintZone: z.object({ x: Unit, y: Unit, r: z.number().min(0.03).max(0.5) }),
  /** Level-1 hint: a gentle verbal nudge specific to this hiding spot. */
  hintText: LocalizedTextSchema,
});
export type Slot = z.infer<typeof SlotSchema>;

export const TargetSchema = z.object({
  id: z.string().min(1),
  /** Stable key such as "beach_float" → body template + future generation prompt. */
  targetType: z.string().min(1),
  bodyTemplate: z.string().min(1),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** e.g. "Find {name} with the float ring" */
  mission: LocalizedTextSchema,
  /** Short noun phrase used in bubbles, e.g. "a float ring". */
  item: LocalizedTextSchema,
  /** Lines the child says when found. Rotated between plays. */
  success: z.array(LocalizedTextSchema).min(1),
  animation: TargetAnimation,
  /** Exactly two hiding spots: A (canonical, first play) and B (replay). */
  slots: z.tuple([SlotSchema, SlotSchema]),
});
export type Target = z.infer<typeof TargetSchema>;

export const AmbientSchema = z.object({
  id: z.string().min(1),
  /** Accessible label + admin label. */
  label: LocalizedTextSchema,
  x: Unit,
  y: Unit,
  w: z.number().min(0.01).max(1),
  h: z.number().min(0.01).max(1),
  animation: AmbientAnimation,
  sound: SoundCue.optional(),
  /** Optional funny bubble. */
  reaction: LocalizedTextSchema.optional(),
  /** Optional emoji/glyph shown while the art is a placeholder. */
  glyph: z.string().optional(),
  cooldownMs: z.number().int().min(0).max(10000).default(1500),
});
export type Ambient = z.infer<typeof AmbientSchema>;

export const BonusSchema = z.object({
  id: z.string().min(1),
  name: LocalizedTextSchema,
  /** Sprite src (public path). */
  sprite: z.string().min(1),
  scale: z.number().min(0.015).max(0.25),
  prompt: LocalizedTextSchema,
  slots: z.tuple([SlotSchema, SlotSchema]),
});
export type Bonus = z.infer<typeof BonusSchema>;

export const SceneDefinitionSchema = z.object({
  id: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9-]*$/, "slug must be kebab-case"),
  name: LocalizedTextSchema,
  tagline: LocalizedTextSchema,
  version: z.number().int().min(1),
  active: z.boolean(),
  artStatus: z.enum(ART_STATUSES),
  art: z.object({
    width: z.number().int().min(320),
    height: z.number().int().min(320),
    base: z.string().min(1),
    foreground: z.string().optional(),
    thumbnail: z.string().min(1),
    palette: z.object({ sky: z.string(), ground: z.string(), accent: z.string() }),
  }),
  /** Optional 1–2s establishing pan on entry. */
  intro: z
    .object({
      from: z.object({ x: Unit, y: Unit, zoom: z.number().min(1).max(4) }),
      to: z.object({ x: Unit, y: Unit, zoom: z.number().min(1).max(4) }),
      durationMs: z.number().int().min(300).max(4000).default(1600),
    })
    .optional(),
  targets: z.array(TargetSchema).length(TARGETS_PER_SCENE),
  ambient: z.array(AmbientSchema).min(2).max(6),
  bonus: BonusSchema.optional(),
  celebration: z.object({
    kind: CelebrationKind,
    /** e.g. "You found {name} three times at the beach!" */
    completeText: LocalizedTextSchema,
  }),
  collectible: z.object({ id: z.string().min(1), name: LocalizedTextSchema, icon: z.string().min(1) }),
  sounds: z.object({ ambient: SoundCue.optional() }).default({}),
});
export type SceneDefinition = z.infer<typeof SceneDefinitionSchema>;

// ─── Validation beyond the shape ─────────────────────────────

export interface SceneValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function mentionsName(t: LocalizedText): boolean {
  return t.en.includes("{name}") && t.he.includes("{name}");
}

/**
 * Is this hint worth showing a child?
 *
 * 108 of 162 hiding spots shipped with "Look near the banner." / "חפשו ליד
 * המקום הזה." — the scaffold a world is authored from, never replaced. The
 * mission already names what she hides by; the hint is the sentence that
 * narrows the picture, so it has to say something the mission does not.
 * Returns the problem, or null.
 */
export function hintProblem(hint: LocalizedText, mission: LocalizedText, item: LocalizedText): string | null {
  const en = hint.en.trim();
  const he = hint.he.trim();
  if (en.length < 12 || he.length < 8) return "too short to narrow the search";
  // The scaffold is "Look near the <target id>." — one word. "Look near the
  // flower seller at the bottom left." is a real hint and stays.
  if (/^Look near the \w+\.?$/i.test(en)) return `"${en}" is the authoring placeholder`;
  if (/^חפשו ליד המקום הזה\.?$/.test(he)) return `"${he}" is the authoring placeholder`;
  const strip = (t: string) => t.replace(/\{name\}/g, "").replace(/[.!?,]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (strip(en) === strip(mission.en) || strip(he) === strip(mission.he)) return "repeats the mission word for word";
  if (strip(en) === strip(item.en) || strip(he) === strip(item.he)) return "only names the item again";
  return null;
}

export function validateSceneDefinition(input: unknown): SceneValidation & { scene?: SceneDefinition } {
  const parsed = SceneDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
      warnings: [],
    };
  }
  const scene = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  const slotIds = new Set<string>();
  const targetIds = new Set<string>();
  const seenDifficulty: number[] = [];

  for (const target of scene.targets) {
    if (targetIds.has(target.id)) errors.push(`duplicate target id "${target.id}"`);
    targetIds.add(target.id);
    seenDifficulty.push(target.difficulty);

    for (const slot of target.slots) {
      if (slotIds.has(slot.id)) errors.push(`duplicate slot id "${slot.id}"`);
      slotIds.add(slot.id);
      const d = dist(slot.x, slot.y, slot.hintZone.x, slot.hintZone.y);
      if (d > slot.hintZone.r) {
        errors.push(`slot "${slot.id}": hintZone does not contain the anchor (distance ${d.toFixed(3)} > r ${slot.hintZone.r})`);
      }
      // A hint the child cannot use is a hole in the game, not a style note:
      // it fails an active scene outright and only warns while authoring.
      const hint = hintProblem(slot.hintText, target.mission, target.item);
      if (hint) (scene.active ? errors : warnings).push(`slot "${slot.id}": hint ${hint}`);
      if (slot.scale > 0.08) warnings.push(`slot "${slot.id}": scale ${slot.scale} is large; children should have to look`);
      if (slot.scale < 0.02) warnings.push(`slot "${slot.id}": scale ${slot.scale} may be too small to recognise a face`);
    }
    const [a, b] = target.slots;
    if (dist(a.x, a.y, b.x, b.y) < 0.08) {
      warnings.push(`target "${target.id}": slots A and B are very close — replay will feel the same`);
    }
    if (!mentionsName(target.mission)) warnings.push(`target "${target.id}": mission copy does not mention {name} in both languages`);
  }

  const sortedDifficulty = [...seenDifficulty].sort((x, y) => x - y);
  if (sortedDifficulty.join() !== "1,2,3") {
    warnings.push(`difficulties are ${seenDifficulty.join(",")}; expected one each of 1,2,3 (easy → hard)`);
  }

  // Targets should not overlap each other in the same variant set.
  const anchorsA = scene.targets.map((t) => t.slots[0]);
  for (let i = 0; i < anchorsA.length; i++) {
    for (let j = i + 1; j < anchorsA.length; j++) {
      const p = anchorsA[i]!;
      const q = anchorsA[j]!;
      if (dist(p.x, p.y, q.x, q.y) < 0.06) warnings.push(`slots "${p.id}" and "${q.id}" are very close in variant A`);
    }
  }

  const ambientIds = new Set<string>();
  for (const a of scene.ambient) {
    if (ambientIds.has(a.id)) errors.push(`duplicate ambient id "${a.id}"`);
    ambientIds.add(a.id);
    if (a.x + a.w > 1.0001 || a.y + a.h > 1.0001) errors.push(`ambient "${a.id}" extends outside the scene`);
  }

  if (scene.bonus) {
    for (const slot of scene.bonus.slots) {
      if (slotIds.has(slot.id)) errors.push(`duplicate slot id "${slot.id}" (bonus)`);
      slotIds.add(slot.id);
    }
  }

  if (!mentionsName(scene.celebration.completeText)) warnings.push("celebration.completeText does not mention {name} in both languages");
  // Publish gate: a world children actually play must have finished art. Draft art
  // is fine while authoring — just not with active: true.
  if (scene.artStatus !== "final" && scene.active) errors.push(`scene is active with ${scene.artStatus} art — set artStatus to "final" or active to false`);

  return { ok: errors.length === 0, errors, warnings, scene };
}
