import { parseProgress, type GameProgress } from "@/domain/game/progress";

/**
 * Progress lives in the player's own browser. A grandparent opening the
 * link plays from scratch and never touches the family's progress.
 */
const KEY = (gameId: string) => `findme:progress:v1:${gameId}`;

export function loadProgress(gameId: string): GameProgress {
  if (typeof window === "undefined") return parseProgress(null, gameId);
  try {
    return parseProgress(window.localStorage.getItem(KEY(gameId)), gameId);
  } catch {
    return parseProgress(null, gameId);
  }
}

export function saveProgress(progress: GameProgress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(progress.gameId), JSON.stringify(progress));
  } catch {
    /* private mode / quota — the game still works for this session */
  }
}

export function clearProgress(gameId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(gameId));
  } catch {
    /* ignore */
  }
}
