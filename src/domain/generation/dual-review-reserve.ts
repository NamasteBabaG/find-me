/**
 * What one independent HIGH review question reserves before dispatch.
 *
 * Releases v1 and v2 keep the historical flat amount. From v3 (the release new QA
 * worlds pin) each role reserves what a question of up to 30,000 (Opus) or 10,016
 * (Sol) input tokens costs at the ordinary rate, plus the full output cap the
 * request sends: Opus `max_tokens` 6,500 with thinking, Sol
 * `max_completion_tokens` 4,096 with reasoning.
 *
 * The amount is enforced per question, not assumed. Before a NEW question is
 * reserved or sent, its input is bounded from the exact request (model, prompt,
 * labels, every image's size and detail; visual-review-input-bound.ts), and the
 * question is refused unless the most it can be billed fits this reservation
 * (dualQuestionAdmission). The largest request any current board can produce,
 * normal or self-repaired, in every evidence variant, fits: tested.
 *
 * A question already in the ledger keeps the reservation it was made with; the
 * ledger pins it.
 *
 * Why: a flat 0.30 USD parked the first full v19/v3 world (14 October) with
 * 0.289913 USD left. Its next question could cost at most 0.25 USD (Opus), and
 * the one after it 0.066 USD (Sol).
 */
export type DualReviewRole = "quality" | "continuity";

export const DUAL_REVIEW_LEGACY_RESERVE_MICRO_USD = 300_000;
/** In micro-USD: Opus 30,000 × 4 + 6,500 × 20 = 250,000; Sol 10,016 × 2.5 + 4,096 × 10 = 66,000. */
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
