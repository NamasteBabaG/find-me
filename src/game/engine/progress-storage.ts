import { parseProgress, type GameProgress } from "@/domain/game/progress";
import { progressStorageKey } from "./storage-scope";

/**
 * Progress lives in the player's own browser. A grandparent opening the
 * link plays from scratch and never touches the family's progress.
 */
const KEY = (gameId: string, scope?: string) => progressStorageKey("progress", gameId, scope);

export function loadProgress(gameId: string, scope?: string): GameProgress {
  if (typeof window === "undefined") return parseProgress(null, gameId);
  try {
    return parseProgress(window.localStorage.getItem(KEY(gameId, scope)), gameId);
  } catch {
    return parseProgress(null, gameId);
  }
}

export function saveProgress(progress: GameProgress, scope?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(progress.gameId, scope), JSON.stringify(progress));
  } catch {
    /* private mode / quota — the game still works for this session */
  }
}

export function clearProgress(gameId: string, scope?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(gameId, scope));
  } catch {
    /* ignore */
  }
}
