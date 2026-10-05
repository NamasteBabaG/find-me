/** Only a sound choice is shared across games; no player/progress data. */
export const MUTE_PREFERENCE_KEY = "findme:audio:v1";

export function readMutePreference(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(MUTE_PREFERENCE_KEY);
    if (!raw || raw.length > 128) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const saved = value as Record<string, unknown>;
    return Object.keys(saved).length === 2 && saved.version === 1 && typeof saved.muted === "boolean" ? saved.muted : null;
  } catch { return null; }
}

export function writeMutePreference(muted: boolean): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(MUTE_PREFERENCE_KEY, JSON.stringify({ version: 1, muted })); }
  catch { /* The current choice still works when browser storage is unavailable. */ }
}
