import type { AdventureBook } from "@/domain/adventure/book-schema";
import { emptyAdventureProgress, readAdventureProgress, type AdventureProgress } from "@/domain/adventure/progress";
import type { AlbumSyncState } from "./album-sync";
import { progressStorageKey } from "./storage-scope";

/**
 * The album kept in this browser. It is the whole truth for a guest (a child
 * on the shared link) and a cache for the owner, whose truth is the family
 * account (see album-sync). A grandparent's browser never touches the family's
 * album, exactly like game progress.
 *
 * A saved album that no longer reads (another release of the book, tampering,
 * a corrupt write) is reported, never silently replaced by a fresh one: the
 * stars a child collected are not something to lose to a parse error. And a
 * browser that cannot write (private mode, quota) is reported too: the album
 * then lives for this sitting only, and nobody is told it was kept.
 */
const KEY = (gameId: string, scope?: string) => progressStorageKey("album", gameId, scope);

/** What the player is told about the album: the account's state, or this browser's trouble with its own copy. */
export type AlbumStatus = AlbumSyncState | "unreadable" | "unsaved";

export type LoadedAlbum = { ok: true; progress: AdventureProgress; fresh: boolean } | { ok: false; reason: "unreadable" };

export function loadAlbum(gameId: string, book: AdventureBook, scope?: string): LoadedAlbum {
  if (typeof window === "undefined") return { ok: true, progress: emptyAdventureProgress(gameId, book), fresh: true };
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY(gameId, scope));
  } catch {
    if (scope) return { ok: false, reason: "unreadable" };
    raw = null;
  }
  if (raw === null) return { ok: true, progress: emptyAdventureProgress(gameId, book), fresh: true };
  try {
    return { ok: true, progress: readAdventureProgress(JSON.parse(raw), gameId, book), fresh: false };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}

/** True when this browser kept the album. False is not silent: the caller shows it. */
export function saveAlbum(progress: AdventureProgress, scope?: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(KEY(progress.gameId, scope), JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export function clearAlbum(gameId: string, scope?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(gameId, scope));
  } catch {
    /* ignore */
  }
}
