import { z } from "zod";

/** Authoring data, not a render prompt and not a purchasable scene catalog. */
export const AdventureId = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/);
export const AdventureText = z.object({ en: z.string().trim().min(1).max(600), he: z.string().trim().min(1).max(600) }).strict();
export const Sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const AdventureRect = z.object({
  x: z.number().min(0).lt(1), y: z.number().min(0).lt(1),
  w: z.number().positive().max(1), h: z.number().positive().max(1),
}).strict().refine(r => r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9, "Rectangle must fit inside the art");
export type AdventureRect = z.infer<typeof AdventureRect>;

export function overlaps(a: AdventureRect, b: AdventureRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
export function contains(outer: AdventureRect, inner: AdventureRect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w + 1e-9 && inner.y + inner.h <= outer.y + outer.h + 1e-9;
}

export const DiscoverySchema = z.object({
  id: AdventureId,
  name: AdventureText,
  hint: AdventureText,
  /** No rarity economy in v1. The category describes content, not value. */
  category: z.enum(["animal", "plant", "object", "character"]),
  description: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("story"), text: AdventureText }).strict(),
    z.object({ kind: z.literal("fact"), text: AdventureText, sourceUrl: z.string().url().startsWith("https://") }).strict(),
  ]),
  /** The whole visible object, also protected from every personal patch. */
  visibleRect: AdventureRect,
  hitRect: AdventureRect,
  /** Reuse existing shared board pixels. No new picture or paid operation. */
  cardCrop: AdventureRect,
}).strict().superRefine((d, ctx) => {
  if (!contains(d.visibleRect, d.hitRect)) ctx.addIssue({ code: "custom", path: ["hitRect"], message: "Hit region must lie on the visible object" });
  if (!contains(d.cardCrop, d.visibleRect)) ctx.addIssue({ code: "custom", path: ["cardCrop"], message: "Card crop must contain the visible object" });
});

/** The pilot's art direction, as literals so a plan cannot drift from the brief
 * (docs/SEARCH_BOARDS_BRIEF_2026-09-14.md). 16:9 landscape belongs to THIS pilot;
 * the book, geometry and album never assume an aspect ratio. */
const DirectionSchema = z.object({
  orientation: z.literal("landscape"),
  aspect: z.literal("16:9"),
  /** "Vertical" is about the drawing, not the file: activity spread over the whole height and width. */
  spread: z.literal("activity-across-width-and-height"),
  perspective: z.literal("shallow"),
  scaleTreatment: z.literal("similar-size-people"),
  /** Rich storybook illustration: hand-drawn line, painted shading, distinct faces. Never photo, glossy 3D or one generic face. */
  illustration: z.literal("storybook-hand-drawn"),
  /** The approved reference decides face, hair and age; the place decides clothing, light, colour and shadow. */
  identityPrecedence: z.literal("reference-face-hair-age"),
  locationCues: z.array(AdventureText).min(2).max(12),
  microStories: z.array(AdventureText).min(2).max(16),
}).strict();
const PlanBase = {
  boardSlug: AdventureId,
  worldSlug: AdventureId,
  name: AdventureText,
  direction: DirectionSchema,
  /** Planning target; actual shipped counts are read from GameConfig. */
  plannedHides: z.literal(5),
};

export const DraftAdventureBoardSchema = z.object({
  ...PlanBase, status: z.literal("planned"),
  discoveryIdeas: z.array(z.object({ id: AdventureId, name: AdventureText, category: z.enum(["animal", "plant", "object", "character"]) }).strict()).min(1).max(3),
}).strict();

export const ReadyAdventureBoardSchema = z.object({
  ...PlanBase, status: z.literal("ready"),
  sceneVersion: z.number().int().positive(),
  art: z.object({
    /** Shared, local board asset only. A private/signed child asset is not content. */
    base: z.string().regex(/^\/scenes\/[a-z0-9_-]+\/[a-z0-9_-]+\.(webp|png|jpg)$/),
    sha256: Sha256,
    width: z.number().int().positive(), height: z.number().int().positive(),
  }).strict().refine(a => Math.abs(a.width * 9 - a.height * 16) <= 16, "The search-board pilot requires 16:9 landscape art"),
  /** Reviewed return rectangles, not just the small face/hit rectangles. */
  personalZones: z.array(AdventureRect).min(1).max(10),
  discoveries: z.array(DiscoverySchema).min(1).max(3),
  postcard: z.object({ id: AdventureId, title: AdventureText, targetId: AdventureId, crop: AdventureRect }).strict(),
}).strict().superRefine((board, ctx) => {
  const ids = board.discoveries.map(d => d.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["discoveries"], message: "Discovery ids must be unique within a board" });
  board.discoveries.forEach((d, i) => {
    if (board.personalZones.some(r => overlaps(r, d.cardCrop))) ctx.addIssue({ code: "custom", path: ["discoveries", i], message: "A personal patch could repaint this discovery/card" });
    if (board.discoveries.slice(0, i).some(other => overlaps(d.hitRect, other.hitRect))) ctx.addIssue({ code: "custom", path: ["discoveries", i, "hitRect"], message: "Discovery hit regions must not overlap" });
  });
});

export const AdventureBoardSchema = z.union([DraftAdventureBoardSchema, ReadyAdventureBoardSchema]);
export const AdventureCatalogSchema = z.object({
  version: z.literal(1),
  releaseId: AdventureId,
  boards: z.array(AdventureBoardSchema).min(1).max(81),
}).strict().superRefine((catalog, ctx) => {
  if (new Set(catalog.boards.map(b => b.boardSlug)).size !== catalog.boards.length) ctx.addIssue({ code: "custom", path: ["boards"], message: "Board slugs must be unique" });
});

export type AdventureCatalog = z.infer<typeof AdventureCatalogSchema>;
export type ReadyAdventureBoard = z.infer<typeof ReadyAdventureBoardSchema>;
