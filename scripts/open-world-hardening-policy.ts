/** Additional development authority given explicitly by Guy on 9 September.
 * This is NOT a raised per-customer production cap and never resets old spend. */
export const OPEN_WORLD_HARDENING_POLICY = Object.freeze({
  id: "open-world-hardening-20260909", limitCents: 400,
  imageModel: "gpt-image-2", imageQuality: "medium",
  judgeModel: "gpt-5.6-sol", judgeEffort: "high", noAutomaticRetries: true,
} as const);
export const OPEN_WORLD_HARDENING_ROOT = "work/open-world-hardening-20260909";
export const OPEN_WORLD_HARDENING_CUMULATIVE_CENTS = 800;
export const OPEN_WORLD_HARDENING_PRIOR_LEDGER = "work/world-production-20260909/budget/requests.json";
