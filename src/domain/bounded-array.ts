import { z } from "zod";

/** Reject collection cardinality before Zod3 visits elements or accumulates their issues. */
export function boundedArray<T extends z.ZodTypeAny>(element: T, maximum: number) {
  return z.unknown().superRefine((value, ctx) => {
    if (Array.isArray(value) && value.length > maximum) {
      ctx.addIssue({ code: z.ZodIssueCode.too_big, type: "array", maximum, inclusive: true, fatal: true });
    }
  }).pipe(z.array(element).max(maximum));
}
