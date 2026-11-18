import type { BackgroundReviewRound } from './background-review-round';
import { SUNBURST_MIN_CAPACITY_MICRO_USD, SUNBURST_REVIEW_COVERAGE_MICRO_USD } from './sunburst-painter';
import { leanReviewPolicyOf } from './visual-review-policy';

export const KINGDOM_FLEX_OVERLOAD_COOLDOWN_MS = 10 * 60_000;
export const KINGDOM_COMPACT_REVIEW = 'kingdom-native-compact/v1';
export const KINGDOM_PLAYABILITY_REVIEW = 'kingdom-native-compact/v2';
export const KINGDOM_GAMEPLAY_NEIGHBOR_REVIEW = 'kingdom-native-compact/v3';
export type KingdomReviewEvidence = typeof KINGDOM_COMPACT_REVIEW | typeof KINGDOM_PLAYABILITY_REVIEW | typeof KINGDOM_GAMEPLAY_NEIGHBOR_REVIEW;

export function kingdomFlexOverloaded(rounds: readonly BackgroundReviewRound[]) {
  return rounds.some(({ intent, terminal }) => leanReviewPolicyOf(intent.policyVersion ?? '')?.serviceTier === 'flex'
    && terminal?.kind === 'outcome' && terminal.providerStatus === 'failed' && terminal.errorCode === 'server_is_overloaded');
}

/** The next image needs a single paint and a full same-image review budget. */
export function kingdomPaintLimit(owesReview: boolean): 0 | 1 {
  return owesReview ? 0 : 1;
}

/** Applies only to a new Flex create. Polls and an admitted Default follow-up stay available. */
export function kingdomFlexCreateAllowed(rounds: readonly BackgroundReviewRound[], requestKey: string, now: number, stopAfterOverload = false) {
  if (stopAfterOverload && kingdomFlexOverloaded(rounds)) return false;
  return !rounds.some(round => {
    if (round.intent.requestKey === requestKey) return false;
    if (!round.terminal) return round.claimAt !== null;
    return round.terminal.kind === 'outcome' && round.terminal.errorCode === 'server_is_overloaded'
      && now < round.terminal.at + KINGDOM_FLEX_OVERLOAD_COOLDOWN_MS;
  });
}

/** Observed upper prices from qualified Kingdom receipts, for a serial tail projection.
 * Actual admission still takes each complete reservation atomically. */
const OBSERVED_PAINT_MICRO_USD = 65_861;
const OBSERVED_DEFAULT_REVIEW_MICRO_USD = 96_775;
export const KINGDOM_APPEARANCE_COUNT = 27;
export function kingdomDefaultTailPeak(paints: number, reviewsOnly: number) {
  if (!Number.isSafeInteger(paints) || !Number.isSafeInteger(reviewsOnly) || paints < 0 || reviewsOnly < 0
    || paints + reviewsOnly > KINGDOM_APPEARANCE_COUNT)
    throw Error('KINGDOM_GENERATION: invalid tail counts');
  if (paints > 0) return (paints - 1) * (OBSERVED_PAINT_MICRO_USD + OBSERVED_DEFAULT_REVIEW_MICRO_USD)
    + reviewsOnly * OBSERVED_DEFAULT_REVIEW_MICRO_USD + SUNBURST_MIN_CAPACITY_MICRO_USD;
  return reviewsOnly === 0 ? 0 : (reviewsOnly - 1) * OBSERVED_DEFAULT_REVIEW_MICRO_USD + SUNBURST_REVIEW_COVERAGE_MICRO_USD;
}
