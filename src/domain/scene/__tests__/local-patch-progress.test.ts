import { describe, expect, it } from "vitest";
import { SUBJECT_V2_REPAIR_CYCLES, localPatchProgressOrder, selfRepairProgress, type ProgressCandidate } from "../local-patch-progress";

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
