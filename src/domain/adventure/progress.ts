import { z } from "zod";
import { AdventureId } from "./content";
import { AdventureBookSchema, type AdventureBook } from "./book-schema";
import { AdventureError } from "./compose";

export const AdventureEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("target-found"), boardSlug: AdventureId, targetId: AdventureId, variant: z.enum(["A", "B"]) }).strict(),
  z.object({ kind: z.literal("discovery-found"), boardSlug: AdventureId, discoveryId: AdventureId }).strict(),
]);
export type AdventureEvent = z.infer<typeof AdventureEventSchema>;

/** No original photo, child name, signed asset URL or analytics payload here. */
export const AdventureProgressSchema = z.object({
  version: z.literal(1), gameId: z.string().min(1).max(160),
  /** Frozen content keeps earned collections independent of future shop releases. */
  book: AdventureBookSchema,
  finds: z.array(z.object({ boardSlug: AdventureId, targetId: AdventureId, variant: z.enum(["A", "B"]) }).strict()).max(405),
  discoveries: z.array(z.object({ boardSlug: AdventureId, discoveryId: AdventureId }).strict()).max(486),
}).strict();
export type AdventureProgress = z.infer<typeof AdventureProgressSchema>;

/** Key order is irrelevant; array order is authored content/route order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function emptyAdventureProgress(gameId: string, book: AdventureBook): AdventureProgress {
  return AdventureProgressSchema.parse({ version: 1, gameId, book, finds: [], discoveries: [] });
}

/** A corrected personal picture is not a new reward/content release. Strip only
 * image bindings, never child identity, target IDs, route, art or discoveries.
 * The replacement book must come from the game's trusted config, not a client.
 */
function rewardContent(book: AdventureBook) {
  return { ...book, boards: book.boards.map(board => ({ ...board,
    targetImages: board.targetImages.map(image => ({ targetId: image.targetId })),
  })) };
}

/** Corrupt or incompatible progress is an explicit error, NEVER a fresh album. */
export function readAdventureProgress(raw: unknown, gameId: string, book: AdventureBook): AdventureProgress {
  const parsed = AdventureProgressSchema.safeParse(raw);
  if (!parsed.success) throw new AdventureError("corrupt-progress");
  const state = parsed.data;
  if (state.gameId !== gameId) throw new AdventureError("wrong-book");
  if (canonical(state.book) !== canonical(book)) {
    const current = AdventureBookSchema.parse(book);
    if (canonical(rewardContent(state.book)) !== canonical(rewardContent(current))) throw new AdventureError("wrong-book");
    // Keep earned events, but never retain stale/untrusted asset references.
    state.book = current;
  }
  const keys = new Set<string>();
  for (const find of state.finds) {
    const board = book.boards.find(b => b.boardSlug === find.boardSlug);
    const key = `target:${find.boardSlug}:${find.targetId}`;
    if (!board?.targetIds.includes(find.targetId) || keys.has(key)) throw new AdventureError("corrupt-progress");
    keys.add(key);
  }
  for (const discovery of state.discoveries) {
    const board = book.boards.find(b => b.boardSlug === discovery.boardSlug);
    const key = `discovery:${discovery.boardSlug}:${discovery.discoveryId}`;
    if (!board?.discoveries.some(d => d.id === discovery.discoveryId) || keys.has(key)) throw new AdventureError("corrupt-progress");
    keys.add(key);
  }
  return state;
}

export function recordAdventureEvent(previous: AdventureProgress, gameId: string, book: AdventureBook, input: AdventureEvent): { progress: AdventureProgress; changed: boolean } {
  const state = readAdventureProgress(previous, gameId, book);
  const event = AdventureEventSchema.parse(input);
  const board = book.boards.find(b => b.boardSlug === event.boardSlug);
  if (!board) throw new AdventureError("not-owned", event.boardSlug);
  if (event.kind === "target-found") {
    if (!board.targetIds.includes(event.targetId)) throw new AdventureError("invalid-event", event.targetId);
    if (state.finds.some(f => f.boardSlug === event.boardSlug && f.targetId === event.targetId)) return { progress: state, changed: false };
    return { progress: { ...state, finds: [...state.finds, { boardSlug: event.boardSlug, targetId: event.targetId, variant: event.variant }] }, changed: true };
  }
  if (!board.discoveries.some(d => d.id === event.discoveryId)) throw new AdventureError("invalid-event", event.discoveryId);
  if (state.discoveries.some(d => d.boardSlug === event.boardSlug && d.discoveryId === event.discoveryId)) return { progress: state, changed: false };
  // Discoveries never depend on finding the child first, and never award a star.
  return { progress: { ...state, discoveries: [...state.discoveries, { boardSlug: event.boardSlug, discoveryId: event.discoveryId }] }, changed: true };
}

/** View model only: counters and rewards are derived, never accepted from clients. */
export function adventureAlbum(raw: AdventureProgress) {
  const progress = readAdventureProgress(raw, raw.gameId, raw.book);
  const boards = progress.book.boards.map(board => {
    const finds = progress.finds.filter(f => f.boardSlug === board.boardSlug);
    const complete = finds.length === board.targetIds.length;
    const postcardFind = finds.find(f => f.targetId === board.postcard.targetId);
    return {
      boardSlug: board.boardSlug, worldSlug: board.worldSlug,
      stars: { found: finds.length, total: board.targetIds.length },
      canAdvance: finds.length >= board.findsRequiredToAdvance, complete,
      /** Recipe resolves only a published game's existing scene/target; no new render. */
      postcard: complete && postcardFind ? { ...board.postcard, variant: postcardFind.variant, image: board.targetImages.find(t => t.targetId === board.postcard.targetId)![postcardFind.variant] } : null,
      discoveries: board.discoveries.map(d => ({ ...d, collected: progress.discoveries.some(found => found.boardSlug === board.boardSlug && found.discoveryId === d.id) })),
    };
  });
  return {
    boards,
    stars: { found: boards.reduce((n, b) => n + b.stars.found, 0), total: boards.reduce((n, b) => n + b.stars.total, 0) },
    postcards: { collected: boards.filter(b => b.postcard).length, total: boards.length },
    discoveries: { collected: progress.discoveries.length, total: boards.reduce((n, b) => n + b.discoveries.length, 0) },
    complete: boards.every(b => b.complete),
    allDiscoveries: boards.every(b => b.discoveries.every(d => d.collected)),
  };
}
