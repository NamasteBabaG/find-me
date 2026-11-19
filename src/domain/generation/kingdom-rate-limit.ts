/**
 * kingdom-rate-limit-recovery/v1 (kingdom-generation/v6 only), closing review finding P0-2.
 *
 * A Sol create the provider refused with HTTP 429 and its documented error envelope created nothing and billed nothing
 * (already settled at zero by the documented-refusal rule). Under earlier pins that refusal parked the whole world for a
 * person. A rate limit is a transient condition: the same pixels are asked again after a backoff, as a NEW question
 * (its own fingerprint and key, so the zero-settled key stays closed), and only after the per-image bound is spent does
 * the world park with an alert. Credential, policy and request refusals (400/401/403/404/413) keep parking at once.
 */
export const KINGDOM_RATE_LIMIT_RECOVERY = "kingdom-rate-limit-recovery/v1" as const;
export const KINGDOM_RATE_LIMIT_STATUS = 429;
/** Rate-limited creates about one image before the world parks: 1+2+4+8+16+30+30+30 minutes, about two hours. */
export const KINGDOM_RATE_LIMIT_MAX_PER_IMAGE = 8;

/** The wait before the next question after `refusals` rate-limited creates about the same pixels. */
export function kingdomRateLimitBackoffMs(refusals: number): number {
  if (!Number.isSafeInteger(refusals) || refusals < 1) return 0;
  return Math.min(30, 2 ** (refusals - 1)) * 60_000;
}

export type RateLimitDecision =
  | { readonly action: "ask"; readonly refusals: number }
  | { readonly action: "wait"; readonly refusals: number; readonly retryAt: number }
  | { readonly action: "park"; readonly refusals: number };

/** From the refusals recorded about one image (their times), what the next question may do now. Pure. */
export function kingdomRateLimitDecision(refusedAt: readonly number[], now: number): RateLimitDecision {
  const refusals = refusedAt.length;
  if (!refusals) return { action: "ask", refusals };
  if (refusals >= KINGDOM_RATE_LIMIT_MAX_PER_IMAGE) return { action: "park", refusals };
  const retryAt = Math.max(...refusedAt) + kingdomRateLimitBackoffMs(refusals);
  return now < retryAt ? { action: "wait", refusals, retryAt } : { action: "ask", refusals };
}

/** The direction a re-asked question carries; it also gives the new question its own fingerprint. */
export function kingdomRateLimitDirection(refusals: number): string {
  return refusals > 0 ? `\nPROVIDER RETRY ${refusals}: an identical earlier request was rate-limited before it was created; nothing was answered.` : "";
}
