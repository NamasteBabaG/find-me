/**
 * Authoring sampler allowance, cents per 1024-square GPT Image 2 edit.
 * 2026-09-07 output-only prices: low 0.6, medium 5.3, high 21.1 cents.
 * Input is additional. HIGH's previous 20-cent reserve was below output alone.
 * These include a buffer for our fixed edit/reference inputs, not a universal
 * maximum for arbitrary image sizes, token counts, or future model prices.
 * Keep actual usage accounting and stop-on-unknown/over-budget checks in place.
 */
export const IMAGE_EDIT_RESERVE_CENTS: Readonly<Record<"low" | "medium" | "high", number>> = {
  low: 3,
  medium: 9,
  high: 30,
};
