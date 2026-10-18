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

/** Why a remaining appearance has nothing automatic left to start, or null when it still has work. */
export type LocalPatchRest = { readonly hideId: string; readonly rest: "spent" | "evidence" | "waiting" | null; readonly evidenceKind?: string };

/** What a world knows about one remaining appearance when it decides whether that appearance is at rest. */
export type LocalPatchRestFacts = {
  readonly hideId: string;
  /** Its evidence recovery, if any: a question still to ask, an outage being waited out, or none left. */
  readonly evidence: { readonly retry: boolean; readonly waiting: boolean; readonly exhausted: boolean; readonly kind?: string } | null;
  /** Review work owed on its current pixels: a v2 re-judgment, or a player review. */
  readonly reviewOwed: boolean;
  /** Its repair cycles under local-patch-subject/v2 are spent, so another cycle may not start. */
  readonly repairSpent: boolean;
};

/**
 * An appearance's rest, in precedence: any work still owed on its current pixels (an evidence question to ask,
 * a re-judgment or player review) means it is not at rest, whatever its repair count; then an outage is waited
 * out; then no evidence question left; then spent repair cycles. Spent cycles end new paintings, never a review
 * still owed on the last one.
 */
export function localPatchRestOf(facts: LocalPatchRestFacts): LocalPatchRest {
  const { hideId, evidence } = facts;
  if (facts.reviewOwed || evidence?.retry) return { hideId, rest: null };
  if (evidence?.waiting) return { hideId, rest: "waiting" };
  if (evidence?.exhausted) return { hideId, rest: "evidence", ...(evidence.kind ? { evidenceKind: evidence.kind } : {}) };
  return { hideId, rest: facts.repairSpent ? "spent" : null };
}

/**
 * What a world does when every remaining appearance is at rest: wait out a provider outage, or stop with every
 * name and its reason (spent repair cycles, no evidence question left, or any mixture). Null while any work
 * remains. The single-reason wording is the historical one, word for word.
 */
export function localPatchRestDecision(rests: readonly LocalPatchRest[]): { readonly action: "wait" } | { readonly action: "park"; readonly reason: string } | null {
  if (!rests.length || rests.some(r => r.rest === null)) return null;
  if (rests.some(r => r.rest === "waiting")) return { action: "wait" };
  const spent = rests.filter(r => r.rest === "spent"), unanswered = rests.filter(r => r.rest === "evidence");
  const kinds = [...new Set(unanswered.map(r => r.evidenceKind ?? "unclassified"))];
  const spentText = `spent their ${SUBJECT_V2_REPAIR_CYCLES} automatic repair cycles under local-patch-subject/v2 (${spent.map(r => r.hideId).join(", ")}); nothing more is bought for them`;
  const evidenceText = `no automatic evidence question left (${kinds.join(", ")}); no image is redrawn for an unreadable answer`;
  const reason = !unanswered.length ? `local-patch: ${spent.length} appearances ${spentText}.`
    : !spent.length ? `local-patch: ${rests.length} appearances have ${evidenceText}.`
    : `local-patch: nothing automatic is left for ${rests.length} appearances: ${spent.length} ${spentText}; ${unanswered.length} have ${evidenceText} (${unanswered.map(r => r.hideId).join(", ")}).`;
  return { action: "park", reason: `${reason} A service decision is required; no parent approval is requested.` };
}

/** A self-repair state's place in that order: its paid tries, whether a phase is in flight (a frozen cycle's
 * diagnosis or its plan: never abandoned for another one), and whether it may start another cycle. */
export function selfRepairProgress(state: { readonly phase?: string; readonly cycle?: number; readonly subjectV2Cycles?: number } | null | undefined,
  attempts: number): Pick<ProgressCandidate, "inFlight" | "served" | "exhausted"> {
  const inFlight = state?.phase === "diagnosing" || state?.phase === "applying";
  const startsNew = !state || state.phase === "awaiting-review" || state.phase === "rejected";
  return { inFlight, served: attempts + (state?.cycle ?? 0), exhausted: startsNew && (state?.subjectV2Cycles ?? 0) >= SUBJECT_V2_REPAIR_CYCLES };
}
