import { parseRound, type PlayRound } from "@/domain/game/round";
import type { GameConfig } from "@/domain/game/config";

const key = (gameId: string, scope?: string) => `findme:round:v1:${scope ?? gameId}`;

export function loadRound(config: GameConfig, scope?: string): PlayRound | null {
  try { return typeof window === "undefined" ? null : parseRound(window.localStorage.getItem(key(config.gameId, scope)), config); }
  catch { return null; }
}

export function saveRound(round: PlayRound, scope?: string): boolean {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.setItem(key(round.gameId, scope), JSON.stringify(round));
    return true;
  } catch { return false; }
}
