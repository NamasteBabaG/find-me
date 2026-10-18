import { describe, expect, it } from "vitest";
import { LOCAL_PATCH_BOARD_REVIEW_MIN_MS, SUBJECT_V2_REPAIR_CYCLES, localPatchBoardAwaitsProvider, localPatchProgressOrder, localPatchRestDecision,
  localPatchRestOf, localPatchReviewFits, selfRepairProgress, type ProgressCandidate } from "../local-patch-progress";

/**
 * local-patch-progress/v1. The pilot's failure: every started self-repair ran before any second
 * attempt, a slice had room for about one paid step, and five appearances took a day of purchases
 * while twenty-two waited. Progress is another accepted appearance, not another cycle of the same one.
 */
type Item = ProgressCandidate & { readonly id: string };
const item = (id: string, over: Partial<ProgressCandidate> = {}): Item =>
  ({ id, inFlight: false, served: 1, order: Number(id.replace(/\D/g, "")), exhausted: false, ...over });

describe("local-patch-progress/v1", () => {
  it("serves the appearance with the fewest paid tries before another cycle of a repeatedly failing one", () => {
    // The historical shape: two appearances deep in self-repair, the rest waiting for their second attempt.
    const repairs = [item("h1", { served: 4 }), item("h2", { served: 3 })];
    const seconds = Array.from({ length: 5 }, (_, i) => item(`h${10 + i}`, { served: 1 }));
    expect(localPatchProgressOrder([...repairs, ...seconds]).map(i => i.id)).toEqual(["h10", "h11", "h12", "h13", "h14", "h2", "h1"]);
  });

  it("finishes paid work in flight first, then board order breaks ties", () => {
    const order = localPatchProgressOrder([item("h3"), item("h1"), item("h9", { served: 5, inFlight: true }), item("h2")]);
    expect(order.map(i => i.id)).toEqual(["h9", "h1", "h2", "h3"]);
  });

  it("leaves out an appearance whose cycles are spent, but never abandons one already in flight", () => {
    expect(localPatchProgressOrder([item("h1", { exhausted: true }), item("h2")]).map(i => i.id)).toEqual(["h2"]);
    expect(localPatchProgressOrder([item("h1", { exhausted: true, inFlight: true }), item("h2")]).map(i => i.id)).toEqual(["h1", "h2"]);
  });

  it("counts a self-repair's cycles as paid tries and bounds the cycles started under subject v2", () => {
    expect(selfRepairProgress(null, 2)).toEqual({ inFlight: false, served: 2, exhausted: false });
    expect(selfRepairProgress({ phase: "awaiting-review", cycle: 2, subjectV2Cycles: 2 }, 2)).toEqual({ inFlight: false, served: 4, exhausted: false });
    // A frozen cycle (its diagnosis or its plan) is finished before anything new.
    expect(selfRepairProgress({ phase: "diagnosing", cycle: 3, subjectV2Cycles: SUBJECT_V2_REPAIR_CYCLES }, 2))
      .toEqual({ inFlight: true, served: 5, exhausted: false });
    expect(selfRepairProgress({ phase: "applying", cycle: 3, subjectV2Cycles: SUBJECT_V2_REPAIR_CYCLES }, 2))
      .toEqual({ inFlight: true, served: 5, exhausted: false });
    // Only a new cycle is refused once the bound is reached; cycles from before v2 do not count against it.
    expect(selfRepairProgress({ phase: "rejected", cycle: 3, subjectV2Cycles: SUBJECT_V2_REPAIR_CYCLES }, 2).exhausted).toBe(true);
    expect(selfRepairProgress({ phase: "awaiting-review", cycle: 3, subjectV2Cycles: SUBJECT_V2_REPAIR_CYCLES }, 2).exhausted).toBe(true);
    expect(selfRepairProgress({ phase: "rejected", cycle: 7 }, 2).exhausted).toBe(false);
  });
});

describe("local-patch-slice-pacing/v1: a slice starts only the board reviews it can finish", () => {
  it("starts a board only with room for the longest one seen, and twice the longest this slice has done", () => {
    // QA, 18 October: a board took about 115 s and the next one started with 150 s left; the platform stopped the slice at 300 s.
    expect(LOCAL_PATCH_BOARD_REVIEW_MIN_MS).toBe(180_000);
    expect(localPatchReviewFits(265_000, 0)).toBe(true);
    expect(localPatchReviewFits(179_999, 0)).toBe(false);
    expect(localPatchReviewFits(150_000, 115_000)).toBe(false);
    // A quick board (nothing to rebuild) leaves room for the next; a slow one does not.
    expect(localPatchReviewFits(200_000, 40_000)).toBe(true);
    expect(localPatchReviewFits(229_999, 115_000)).toBe(false);
    expect(localPatchReviewFits(230_000, 115_000)).toBe(true);
  });

  it("skips a board only when every appearance with review work has its question sent and awaiting the provider", () => {
    const awaiting = new Set(["row-a:sha-a", "row-b:sha-b"]);
    expect(localPatchBoardAwaitsProvider(["row-a:sha-a"], awaiting)).toBe(true);
    expect(localPatchBoardAwaitsProvider(["row-a:sha-a", "row-b:sha-b"], awaiting)).toBe(true);
    // Another appearance still has work its review can do now; new pixels are a new question; nothing owed is nothing to skip.
    expect(localPatchBoardAwaitsProvider(["row-a:sha-a", "row-c:sha-c"], awaiting)).toBe(false);
    expect(localPatchBoardAwaitsProvider(["row-a:sha-new"], awaiting)).toBe(false);
    expect(localPatchBoardAwaitsProvider(["row-a:sha-a", null], awaiting)).toBe(false);
    expect(localPatchBoardAwaitsProvider([], awaiting)).toBe(false);
  });
});

describe("a world with nothing automatic left to start", () => {
  const TAIL = " A service decision is required; no parent approval is requested.";
  it("keeps working while any appearance has work, and waits out an outage", () => {
    expect(localPatchRestDecision([])).toBeNull();
    expect(localPatchRestDecision([{ hideId: "a", rest: "spent" }, { hideId: "b", rest: null }])).toBeNull();
    expect(localPatchRestDecision([{ hideId: "a", rest: "spent" }, { hideId: "b", rest: "waiting" }])).toEqual({ action: "wait" });
  });

  it("stops with the historical words for a single reason", () => {
    expect(localPatchRestDecision([{ hideId: "tokyo-v12-1", rest: "spent" }])).toEqual({ action: "park", reason:
      `local-patch: 1 appearances spent their ${SUBJECT_V2_REPAIR_CYCLES} automatic repair cycles under local-patch-subject/v2 (tokyo-v12-1); nothing more is bought for them.${TAIL}` });
    expect(localPatchRestDecision([{ hideId: "a", rest: "evidence", evidenceKind: "quality syntax" }, { hideId: "b", rest: "evidence" }])).toEqual({ action: "park", reason:
      `local-patch: 2 appearances have no automatic evidence question left (quality syntax, unclassified); no image is redrawn for an unreadable answer.${TAIL}` });
  });

  it("never rests an appearance that still owes a review on its last picture, whatever its repair count (Codex's case)", () => {
    const facts = (over: Partial<Parameters<typeof localPatchRestOf>[0]>) => ({ hideId: "a", evidence: null, reviewOwed: false, repairSpent: false, ...over });
    const ask = { retry: true, waiting: false, exhausted: false }, wait = { retry: false, waiting: true, exhausted: false };
    const none = { retry: false, waiting: false, exhausted: true, kind: "quality syntax" };
    expect(localPatchRestOf(facts({ repairSpent: true, evidence: ask }))).toEqual({ hideId: "a", rest: null });
    expect(localPatchRestOf(facts({ repairSpent: true, reviewOwed: true }))).toEqual({ hideId: "a", rest: null });
    expect(localPatchRestOf(facts({ repairSpent: true, evidence: wait }))).toEqual({ hideId: "a", rest: "waiting" });
    expect(localPatchRestOf(facts({ repairSpent: true, evidence: none }))).toEqual({ hideId: "a", rest: "evidence", evidenceKind: "quality syntax" });
    expect(localPatchRestOf(facts({ repairSpent: true }))).toEqual({ hideId: "a", rest: "spent" });
    expect(localPatchRestOf(facts({}))).toEqual({ hideId: "a", rest: null });
    // Third cycle's candidate awaiting an evidence retry, beside an evidence-exhausted sibling: keep working.
    expect(localPatchRestDecision([localPatchRestOf(facts({ repairSpent: true, evidence: ask })),
      localPatchRestOf(facts({ hideId: "b", evidence: none }))])).toBeNull();
  });

  it("stops a mixture of spent repairs and exhausted evidence, naming each appearance with its reason", () => {
    // The loop Codex found: one appearance's repairs spent, another's evidence questions spent; neither alone matched.
    const decision = localPatchRestDecision([{ hideId: "tokyo-v12-1", rest: "spent" }, { hideId: "paris-v12-2", rest: "evidence", evidenceKind: "continuity shape" }]);
    expect(decision).toEqual({ action: "park", reason: "local-patch: nothing automatic is left for 2 appearances: 1 spent their "
      + `${SUBJECT_V2_REPAIR_CYCLES} automatic repair cycles under local-patch-subject/v2 (tokyo-v12-1); nothing more is bought for them; 1 have no automatic `
      + `evidence question left (continuity shape); no image is redrawn for an unreadable answer (paris-v12-2).${TAIL}` });
  });
});
