type DraftOwnership = { draftToken: string | null; ownerId: string | null };

/** Cookie-draft and account ownership used by the parent's creation flow. */
export function draftBelongsTo(game: DraftOwnership, draftToken: string | null, userId: string | null): boolean {
  if (draftToken && game.draftToken === draftToken) return true;
  if (userId && game.ownerId === userId) return true;
  return false;
}

/**
 * Creation/status administration also permits a verified admin session. This
 * is not the play, family-passport, participant or signed-asset access rule.
 * Callers retain their lifecycle checks and their own 403/404 response policy.
 */
export function canManageGameCreation(game: DraftOwnership, draftToken: string | null, userId: string | null, isAdmin: boolean): boolean {
  return draftBelongsTo(game, draftToken, userId) || isAdmin;
}
