/** A prospective purchase allowance, never an observed provider price. A new
 * painting must leave the full ordinary assessment allowance available too. */
export const SUNBURST_IMAGE_RESERVE_MICRO_USD = 150_000;
export const SUNBURST_REVIEW_COVERAGE_MICRO_USD = 250_000;
export const SUNBURST_MIN_CAPACITY_MICRO_USD = SUNBURST_IMAGE_RESERVE_MICRO_USD + SUNBURST_REVIEW_COVERAGE_MICRO_USD;

/** Each unreviewed paid picture still owes its own complete assessment. */
export function sunburstPaintRequiredCapacity(unreviewedPictures: number): number {
  if (!Number.isSafeInteger(unreviewedPictures) || unreviewedPictures < 0 || unreviewedPictures > 26)
    throw Error("Sunburst review debt must belong to the other26 appearances");
  return SUNBURST_IMAGE_RESERVE_MICRO_USD + SUNBURST_REVIEW_COVERAGE_MICRO_USD * (1 + unreviewedPictures);
}
