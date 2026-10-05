/** Owner-only navigation data. It never belongs in the shareable GameConfig. */
export type FamilyWorldStatus = "ready" | "preparing" | "payment_pending" | "attention" | "available" | "unavailable";
export type FamilyWorldCard = {
  worldSlug: string;
  name: string;
  tagline: string;
  icon: string;
  gameId: string | null;
  status: FamilyWorldStatus;
  current: boolean;
  completedPlaces: number | null;
  totalPlaces: number;
  foundTargets: number | null;
  totalTargets: number;
  playHref: string | null;
  purchaseHref: string | null;
};
export type FamilyWorlds = { childId: string; currentGameId: string; worlds: FamilyWorldCard[] };

export function familyWorldPlayHref(childId: string, gameId: string, worldSlug: string): string {
  return `/family/${encodeURIComponent(childId)}/play/${encodeURIComponent(gameId)}?world=${encodeURIComponent(worldSlug)}`;
}
export function familyWorldPurchaseHref(childId: string, worldSlug: string, currentGameId: string): string {
  return `/family/${encodeURIComponent(childId)}/worlds/${encodeURIComponent(worldSlug)}/purchase?returnGame=${encodeURIComponent(currentGameId)}`;
}

/** One card per world. Keep the game being played, then an existing playable
 * purchase, before a newer unfinished duplicate. Never pool siblings' progress. */
export function selectFamilyWorldCards(cards: readonly (FamilyWorldCard & { updatedAt: number; order: number })[]): FamilyWorldCard[] {
  const byWorld = new Map<string, FamilyWorldCard & { updatedAt: number; order: number }>();
  const priority = (card: FamilyWorldCard) => card.current ? 0 : card.status === "ready" ? 1 : card.gameId ? 2 : 3;
  for (const card of cards) {
    const old = byWorld.get(card.worldSlug);
    if (!old || priority(card) < priority(old) || priority(card) === priority(old) && card.updatedAt > old.updatedAt) byWorld.set(card.worldSlug, card);
  }
  return [...byWorld.values()].sort((a, b) => priority(a) - priority(b) || (a.gameId && b.gameId ? b.updatedAt - a.updatedAt : a.order - b.order))
    .map(({ updatedAt: _updatedAt, order: _order, ...card }) => card);
}
