import { z } from "zod";
import type { PassportPreference } from "@/domain/passport/passport";

const Preference = z.object({ photoTargetId: z.string().nullable(), stampSeen: z.boolean(), seenDiscoveries: z.array(z.string()).max(6) });
const key = (gameId: string) => `findme:passport:v1:${gameId}`;
export function readPassportPreferences(gameId: string): Record<string, PassportPreference> {
  try { return z.record(Preference).parse(JSON.parse(localStorage.getItem(key(gameId)) ?? "{}")); } catch { return {}; }
}
export function keepPassportPreference(gameId: string, board: string, patch: Partial<PassportPreference>) {
  const all = readPassportPreferences(gameId);
  const old = all[board] ?? { photoTargetId: null, stampSeen: false, seenDiscoveries: [] };
  all[board] = { photoTargetId: patch.photoTargetId ?? old.photoTargetId, stampSeen: old.stampSeen || Boolean(patch.stampSeen), seenDiscoveries: [...new Set([...old.seenDiscoveries, ...patch.seenDiscoveries ?? []])] };
  try { localStorage.setItem(key(gameId), JSON.stringify(all)); return true; } catch { return false; }
}
