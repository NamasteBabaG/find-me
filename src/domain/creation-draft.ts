/** A non-secret game ID selects the tab's draft; server ownership still authorizes every request.
 * Never include a draft capability or private image URL in a navigation link. */
export function creationDraftHref(step: "name" | "photo" | "package" | "scenes" | "checkout", gameId?: string): string {
  const path = step === "checkout" ? "/checkout" : step === "name" ? "/create" : "/create/" + step;
  return gameId ? path + "?" + new URLSearchParams({ draft: gameId }) : path;
}
