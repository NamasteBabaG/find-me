/**
 * What one independent HIGH review question reserves before dispatch.
 *
 * Releases v1 and v2 keep the historical flat bound. From v3 (the release new QA
 * worlds pin) a question reserves the most it can cost:
 * - its INPUT, bounded by a pinned token ceiling for that role's fixed evidence
 *   shape and charged at the ordinary rate with no cache discount;
 * - plus its OUTPUT cap, which the request itself sends: Opus `max_tokens` 6,500,
 *   thinking included; Sol `max_completion_tokens` 4,096, reasoning included.
 *
 * Observed in the first full v19/v3 QA world (14 October, 30 Opus and 31 Sol
 * questions over nine boards): Opus input 15,181 to 17,842 tokens, Sol 4,028 to
 * 4,687. The ceilings below are 1.7× and 2.1× those maxima.
 *
 * A flat 0.30 USD parked that world one cent short: 0.289913 USD remained, while
 * its last two questions could cost at most 0.25 USD and 0.066 USD.
 *
 * The tests prove each reservation covers the rate card's charge at its input
 * ceiling and full output cap. A question already in the ledger keeps the
 * reservation it was made with; the ledger pins it.
 */
export type DualReviewRole = "quality" | "continuity";

export const DUAL_REVIEW_LEGACY_RESERVE_MICRO_USD = 300_000;
/** Pinned ceilings on a v3 question's input tokens (images and text). */
export const DUAL_REVIEW_V3_INPUT_TOKEN_BOUND: Readonly<Record<DualReviewRole, number>> = Object.freeze({ quality: 30_000, continuity: 10_000 });
/** That input at the ordinary rate plus the output cap the request sends, in micro-USD:
 * Opus 30,000 × 4 + 6,500 × 20 = 250,000; Sol 10,000 × 2.5 + 4,096 × 10 = 65,960, rounded up. */
export const DUAL_REVIEW_V3_RESERVE_MICRO_USD: Readonly<Record<DualReviewRole, number>> = Object.freeze({ quality: 250_000, continuity: 66_000 });

/** Every amount a dual review question may have been reserved with, per role. */
export const dualReviewReserves = (role: DualReviewRole): readonly number[] =>
  [DUAL_REVIEW_LEGACY_RESERVE_MICRO_USD, DUAL_REVIEW_V3_RESERVE_MICRO_USD[role]];
export const DUAL_REVIEW_RESERVES_MICRO_USD: readonly number[] =
  [...new Set([...dualReviewReserves("quality"), ...dualReviewReserves("continuity")])];

/** The reservation for a NEW question of this role under the pinned release. */
export function dualReviewReserveMicroUsd(boundedRelease: boolean, role: DualReviewRole): number {
  return boundedRelease ? DUAL_REVIEW_V3_RESERVE_MICRO_USD[role] : DUAL_REVIEW_LEGACY_RESERVE_MICRO_USD;
}

/** What a dual question is bought with: the reservation already in the ledger for its
 * request key (a v3 question reserved before these bounds keeps its flat amount, or its
 * replay would be refused as a different purchase), else a new question's amount. */
export function dualQuestionReserveMicroUsd(stored: number | undefined, boundedRelease: boolean, role: DualReviewRole): number {
  return stored ?? dualReviewReserveMicroUsd(boundedRelease, role);
}
