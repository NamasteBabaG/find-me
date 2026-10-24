import { z } from "zod";

/** Patched Zod 4 rejects cardinality before visiting collection elements. */
export function boundedArray<T extends z.ZodType>(element: T, maximum: number) {
  return z.array(element).max(maximum);
}
