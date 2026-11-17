import type { BackgroundReviewRound } from './background-review-round';

export const KINGDOM_FLEX_OVERLOAD_COOLDOWN_MS = 10 * 60_000;

/** The next image needs a single paint and a full same-image review budget. */
export function kingdomPaintLimit(owesReview: boolean): 0 | 1 {
  return owesReview ? 0 : 1;
}

/** Applies only to a new Flex create. Polls and an admitted Default follow-up stay available. */
export function kingdomFlexCreateAllowed(rounds: readonly BackgroundReviewRound[], requestKey: string, now: number) {
  return !rounds.some(round => {
    if (round.intent.requestKey === requestKey) return false;
    if (!round.terminal) return round.claimAt !== null;
    return round.terminal.kind === 'outcome' && round.terminal.errorCode === 'server_is_overloaded'
      && now < round.terminal.at + KINGDOM_FLEX_OVERLOAD_COOLDOWN_MS;
  });
}
