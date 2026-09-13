import { describe, expect, it } from "vitest";
import { localPatchAttemptPlan, localPatchFinalRepairAllowed, nextLocalPatchAttempt } from "../scene/local-patch-attempts";

describe("one final QA repair after the normal world pass", () => {
  it("finishes every untouched hide before starting a second purchase", () => {
    const rows = [{ status: "FAILED", attempts: 1 }, { status: "GENERATED", attempts: 1 }, undefined,
      { status: "PENDING", attempts: 1 }];
    expect(localPatchAttemptPlan(rows, true)).toEqual({ finalRepair: false, indices: [2, 3] });
    rows[2] = { status: "GENERATED", attempts: 1 };
    rows[3] = { status: "FAILED", attempts: 1 };
    expect(localPatchAttemptPlan(rows, true)).toEqual({ finalRepair: false, indices: [0, 3] });
  });
  it("uses one retry policy in strict QA and production while preserving legacy limits", () => {
    expect(localPatchFinalRepairAllowed("qa", true)).toBe(true);
    expect(localPatchFinalRepairAllowed("production", true)).toBe(true);
    expect(localPatchFinalRepairAllowed("qa", false)).toBe(true);
    expect(localPatchFinalRepairAllowed("production", false)).toBe(false);
    expect(localPatchFinalRepairAllowed(undefined, false)).toBe(false);
  });
  it("does not repair an early failure before untouched or interrupted normal hides", () => {
    expect(localPatchAttemptPlan([{ status: "FAILED", attempts: 2 }, undefined, { status: "PENDING", attempts: 2 }], true))
      .toEqual({ finalRepair: false, indices: [1, 2] });
  });
  it("repairs only failures and resumes the same third attempt", () => {
    const rows = [{ status: "GENERATED", attempts: 1 }, { status: "FAILED", attempts: 2 }, { status: "PENDING", attempts: 3 }];
    expect(localPatchAttemptPlan(rows, true)).toEqual({ finalRepair: true, indices: [2] });
    expect(nextLocalPatchAttempt(rows[2]!, 3)).toEqual({ attempt: 3, exhausted: false });
    expect(nextLocalPatchAttempt({ status: "FAILED", attempts: 3 }, 3).exhausted).toBe(true);
    expect(localPatchAttemptPlan([{ status: "FAILED", attempts: 3 }], true).indices).toEqual([]);
  });
  it("recovers a started third attempt before new normal purchases without reviving approved rows", () => {
    expect(localPatchAttemptPlan([{ status: "FAILED", attempts: 1 }, undefined,
      { status: "PENDING", attempts: 3 }], true)).toEqual({ finalRepair: true, indices: [2] });
    expect(localPatchAttemptPlan([{ status: "GENERATED", attempts: 0 }, { status: "APPROVED", attempts: 0 },
      { status: "FAILED", attempts: 1 }], true)).toEqual({ finalRepair: false, indices: [2] });
  });
  it("does not expand the normal non-QA allowance", () => {
    expect(localPatchAttemptPlan([{ status: "FAILED", attempts: 2 }], false).indices).toEqual([]);
    expect(nextLocalPatchAttempt({ status: "FAILED", attempts: 2 }).exhausted).toBe(true);
  });
});
