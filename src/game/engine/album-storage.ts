import type { AdventureBook } from "@/domain/adventure/book-schema";
import { emptyAdventureProgress, readAdventureProgress, type AdventureProgress } from "@/domain/adventure/progress";

/**
 * The album kept in this browser. It is the whole truth for a guest (a child
 * on the shared link) and a cache for the owner, whose truth is the family
 * account (see album-sync). A grandparent's browser never touches the family's
 * album, exactly like game progress.
 *
 * A saved album that no longer reads (another release of the book, tampering,
 * a corrupt write) is reported, never silently replaced by a fresh one: the
 * stars a child collected are not something to lose to a parse error.
 */
const KEY = (gameId: string) => `findme:album:v1:${gameId}`;

export type LoadedAlbum = { ok: true; progress: AdventureProgress; fresh: boolean } | { ok: false; reason: "unreadable" };

export function loadAlbum(gameId: string, book: AdventureBook): LoadedAlbum {
  if (typeof window === "undefined") return { ok: true, progress: emptyAdventureProgress(gameId, book), fresh: true };
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY(gameId));
  } catch {
    raw = null;
  }
  if (raw === null) return { ok: true, progress: emptyAdventureProgress(gameId, book), fresh: true };
  try {
    return { ok: true, progress: readAdventureProgress(JSON.parse(raw), gameId, book), fresh: false };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}

export function saveAlbum(progress: AdventureProgress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(progress.gameId), JSON.stringify(progress));
  } catch {
    /* private mode / quota — the album still lives for this sitting */
  }
}

export function clearAlbum(gameId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(gameId));
  } catch {
    /* ignore */
  }
}
