import { z } from "zod";
import { AdventureId, AdventureRect, Sha256, contains, overlaps } from "./content";
import { AssetId, BookImageSchema } from "./image-binding";

const Copy = z.string().trim().min(1).max(600);
export const BookDiscoverySchema = z.object({
  id: AdventureId, name: Copy, hint: Copy,
  category: z.enum(["animal", "plant", "object", "character"]),
  description: Copy, descriptionKind: z.enum(["story", "fact"]),
  sourceUrl: z.string().url().startsWith("https://").optional(),
  hitRect: AdventureRect, cardCrop: AdventureRect,
}).strict().superRefine((discovery, ctx) => {
  if (!contains(discovery.cardCrop, discovery.hitRect)) ctx.addIssue({ code: "custom", path: ["hitRect"], message: "A discovery must be inside its card crop" });
  if ((discovery.descriptionKind === "fact") !== Boolean(discovery.sourceUrl)) ctx.addIssue({ code: "custom", path: ["sourceUrl"], message: "Facts require a source; stories are not facts" });
});

/** Frozen per-game entitlement/content snapshot; never a live view of the shop. */
export const AdventureBookSchema = z.object({
  version: z.literal(1), releaseId: AdventureId,
  avatarAssetId: AssetId,
  /** Preserve current serial rendering and three-find advance rules. */
  mode: z.literal("serial-collection-v1"),
  boards: z.array(z.object({
    boardSlug: AdventureId, worldSlug: AdventureId,
    sceneVersion: z.number().int().positive(), artSha256: Sha256,
    art: z.object({ base: z.string().regex(/^\/scenes\/[a-z0-9_-]+\/[a-z0-9_-]+\.(webp|png|jpg)$/), width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
    targetIds: z.array(AdventureId).min(3).max(5),
    targetImages: z.array(z.object({ targetId: AdventureId, A: BookImageSchema, B: BookImageSchema }).strict()).min(3).max(5),
    findsRequiredToAdvance: z.literal(3),
    discoveries: z.array(BookDiscoverySchema).min(1).max(3),
    postcard: z.object({ id: AdventureId, title: Copy, targetId: AdventureId, crop: AdventureRect }).strict(),
  }).strict()).min(1).max(81),
}).strict().superRefine((book, ctx) => {
  if (new Set(book.boards.map(b => b.boardSlug)).size !== book.boards.length) ctx.addIssue({ code: "custom", path: ["boards"], message: "Duplicate book board" });
  book.boards.forEach((b, i) => {
    if (new Set(b.targetIds).size !== b.targetIds.length) ctx.addIssue({ code: "custom", path: ["boards", i, "targetIds"], message: "Duplicate target" });
    if (b.targetImages.length !== b.targetIds.length || new Set(b.targetImages.map(t => t.targetId)).size !== b.targetIds.length || b.targetImages.some(t => !b.targetIds.includes(t.targetId))) ctx.addIssue({ code: "custom", path: ["boards", i, "targetImages"], message: "Every target needs exactly one published image binding" });
    if (new Set(b.discoveries.map(d => d.id)).size !== b.discoveries.length) ctx.addIssue({ code: "custom", path: ["boards", i, "discoveries"], message: "Duplicate discovery" });
    if (!b.targetIds.includes(b.postcard.targetId)) ctx.addIssue({ code: "custom", path: ["boards", i, "postcard"], message: "Postcard must refer to a shipped target" });
    if (b.discoveries.some((d, n) => b.discoveries.slice(0, n).some(other => overlaps(d.hitRect, other.hitRect)))) ctx.addIssue({ code: "custom", path: ["boards", i, "discoveries"], message: "Discovery hit regions overlap" });
  });
});
export type AdventureBook = z.infer<typeof AdventureBookSchema>;
