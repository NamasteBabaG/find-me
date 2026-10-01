import { parseRound, type PlayRound } from "@/domain/game/round";
import type { GameConfig } from "@/domain/game/config";

const key = (gameId: string) => `findme:round:v1:${gameId}`;

export function loadRound(config: GameConfig): PlayRound | null {
  try { return typeof window === "undefined" ? null : parseRound(window.localStorage.getItem(key(config.gameId)), config); }
  catch { return null; }
}

export function saveRound(round: PlayRound): boolean {
  try {
    if (typeof window === "undefined") return false;
    window.localStorage.setItem(key(round.gameId), JSON.stringify(round));
    return true;
  } catch { return false; }
}
