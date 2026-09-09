/**
 * The production world run: nine boards, twenty-seven hides, its own ledger.
 *
 * Guy authorised up to $4 for ONE world including identity, renders, extraction,
 * measurement, judging and retries. That is a ceiling, not a claim that $4 has
 * been shown to be enough. Development spend lives in its own ledgers and is
 * reported separately - it is never netted against this one.
 *
 * Generation stays GPT Image 2 LOW. The production brief said MEDIUM, but every
 * accepted result on this route was made at LOW, Guy approved LOW after a matched
 * comparison in which he saw no difference, and the measured defect here is that
 * the sprite already carries 2-3x the board's fine detail - MEDIUM adds more of
 * exactly the wrong thing. HIGH and AUTO remain out, and there is still no
 * automatic retry: a hide gets one more attempt by deliberate choice, never by
 * a loop.
 */
export const WORLD_PRODUCTION_ID = "world-production-20260909";
export const WORLD_PRODUCTION_ROOT = "work/world-production-20260909";
export const WORLD_PRODUCTION_POLICY = Object.freeze({
  id: WORLD_PRODUCTION_ID,
  limitCents: 400,
  imageModel: "gpt-image-2",
  imageQuality: "low",
  judgeModel: "gpt-5.6-sol",
  judgeEffort: "high",
  noAutomaticRetries: true,
} as const);

/** Conservative reservations, sized from what these calls have actually billed. */
export const WORLD_PRODUCTION_RESERVES = Object.freeze({
  /** LOW sources have billed 2.81-3.02c; the headroom covers a dearer one. */
  sourceCents: 6,
  /** Sol HIGH source observations have billed 5.6-11.9c. */
  measureCents: 20,
  /** Sol HIGH composite reviews have billed 2.8-11.3c. */
  judgeCents: 16,
} as const);
