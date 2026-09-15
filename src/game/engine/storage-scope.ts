/** New pilot caches never read or migrate the legacy guest/owner shared key. */
export function progressStorageKey(kind: "album" | "progress", gameId: string, scope?: string): string {
  return scope
    ? `findme:${kind}:v2:${encodeURIComponent(scope)}:${encodeURIComponent(gameId)}`
    : `findme:${kind}:v1:${gameId}`;
}
