/**
 * local-patch-progress/v1 (18 October 2026): what one slice of an enrolled world paints or repairs next.
 *
 * The historical order ran every started self-repair before any second attempt, and a slice has room
 * for about one paid step: a pilot spent a day of purchases on five appearances while twenty-two
 * waited for their second attempt. Progress is another accepted appearance, not another cycle of the
 * same one. So: first finish what is already paid for (a repair whose plan was bought, an attempt
 * already started), then serve the appearance that has had the fewest paid tries, in board order.
 * A repair that keeps failing stops after a bounded number of cycles under the current subject
 * policy, and the world reports it instead of paying for it again and again.
 */
export const LOCAL_PATCH_PROGRESS_VERSION = "local-patch-progress/v1" as const;
/** Self-repair cycles one appearance may start under local-patch-subject/v2 before it stops for a service decision. */
export const SUBJECT_V2_REPAIR_CYCLES = 3;

export type ProgressCandidate = {
  /** A paid step already bought or started: a repair plan to apply, or a started attempt to finish. */
  readonly inFlight: boolean;
  /** Paid tries the appearance already had: its attempts plus its self-repair cycles. */
  readonly served: number;
  /** Board order, then authored hide order. */
  readonly order: number;
  /** No further step may be started for it (its repair cycles are spent). */
  readonly exhausted: boolean;
};

/** The work in the order a slice takes it; exhausted appearances are left out. */
export function localPatchProgressOrder<T extends ProgressCandidate>(items: readonly T[]): T[] {
  return items.filter(item => !item.exhausted || item.inFlight)
    .sort((a, b) => Number(b.inFlight) - Number(a.inFlight) || a.served - b.served || a.order - b.order);
}

/** A self-repair state's place in that order: its paid tries, whether a phase is in flight (a frozen cycle's
 * diagnosis or its plan: never abandoned for another one), and whether it may start another cycle. */
export function selfRepairProgress(state: { readonly phase?: string; readonly cycle?: number; readonly subjectV2Cycles?: number } | null | undefined,
  attempts: number): Pick<ProgressCandidate, "inFlight" | "served" | "exhausted"> {
  const inFlight = state?.phase === "diagnosing" || state?.phase === "applying";
  const startsNew = !state || state.phase === "awaiting-review" || state.phase === "rejected";
  return { inFlight, served: attempts + (state?.cycle ?? 0), exhausted: startsNew && (state?.subjectV2Cycles ?? 0) >= SUBJECT_V2_REPAIR_CYCLES };
}
