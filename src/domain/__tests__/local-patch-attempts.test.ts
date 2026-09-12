import { describe, expect, it } from "vitest";
import { localPatchAttemptPlan, nextLocalPatchAttempt } from "../scene/local-patch-attempts";

describe("one final QA repair after the normal world pass", () => {
  it("does not repair an early failure before untouched or interrupted normal hides", () => {
    expect(localPatchAttemptPlan([{ status: "FAILED", attempts: 2 }, undefined, { status: "PENDING", attempts: 2 }], true))
      .toEqual({ finalRepair: false, indices: [1, 2] });
  });
  it("repairs only failures and resumes the same third attempt", () => {
    const rows = [{ status: "GENERATED", attempts: 1 }, { status: "FAILED", attempts: 2 }, { status: "PENDING", attempts: 3 }];
    expect(localPatchAttemptPlan(rows, true)).toEqual({ finalRepair: true, indices: [1, 2] });
    expect(nextLocalPatchAttempt(rows[2]!, 3)).toEqual({ attempt: 3, exhausted: false });
    expect(nextLocalPatchAttempt({ status: "FAILED", attempts: 3 }, 3).exhausted).toBe(true);
    expect(localPatchAttemptPlan([{ status: "FAILED", attempts: 3 }], true).indices).toEqual([]);
  });
  it("does not expand the normal non-QA allowance", () => {
    expect(localPatchAttemptPlan([{ status: "FAILED", attempts: 2 }], false).indices).toEqual([]);
    expect(nextLocalPatchAttempt({ status: "FAILED", attempts: 2 }).exhausted).toBe(true);
  });
});
