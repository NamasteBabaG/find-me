import { isAfterPayment, isEditableDraft, isGameStatus } from "./order-state";
import { validChildAge } from "./child-appearance";

/** Purchase lifecycle is independent of play progress and challenge preferences. */
export function worldPurchaseState(game: { id: string; status: string; deletedAt: Date | null; draftToken: string | null; hasPhoto: boolean; paid: boolean }) {
  if (game.deletedAt || !isGameStatus(game.status) || ["DELETED", "REFUNDED", "CANCELLED"].includes(game.status)) return "closed" as const;
  if (game.paid && isAfterPayment(game.status)) return game.status === "READY" || game.status === "DELIVERED" ? "ready" as const : "preparing" as const;
  return isEditableDraft(game.status) && game.draftToken ? game.hasPhoto ? "checkout" as const : "photo" as const : "preparing" as const;
}

/** Only our route builder creates return URLs; no request URL is redirected to. */
export function worldPurchaseHref(childId: string, worldSlug: string, returnGameId?: string | null, ageYears?: number | null): string {
  const base = `/family/${encodeURIComponent(childId)}/worlds/${encodeURIComponent(worldSlug)}/purchase`;
  const query = new URLSearchParams();
  if (returnGameId) query.set("returnGame", returnGameId);
  if (validChildAge(ageYears)) query.set("ageYears", String(ageYears));
  return query.size ? `${base}?${query}` : base;
}

export function worldPurchaseDraftHref(gameId: string, phase: "photo" | "checkout"): string {
  return `${phase === "photo" ? "/create/photo" : "/checkout"}?${new URLSearchParams({ game: gameId })}`;
}

/** The family login validates this local route again before issuing a link. */
export function worldPurchaseSignInHref(next: string): string {
  return `/family?${new URLSearchParams({ next })}`;
}

export function worldPurchaseReturnHref(childId: string, ownedReturnGameId?: string | null): string {
  return ownedReturnGameId ? `/family/${encodeURIComponent(childId)}/play/${encodeURIComponent(ownedReturnGameId)}` : `/family/${encodeURIComponent(childId)}`;
}
