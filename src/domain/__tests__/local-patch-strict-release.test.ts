import { describe, expect, it } from "vitest";
import { findScene } from "../../../content/scenes";
import { isLocalPatchStrictVersion, localPatchBoardForVersion, LOCAL_PATCH_STRICT_SCENE_VERSION } from "../scene/local-patch-catalog";
import { localPatchAttemptPlan, nextLocalPatchAttempt } from "../scene/local-patch-attempts";

describe("explicit strict-quality release", () => {
  it("pins new scenes to8 while keeping the same five authored hides and historical7", () => {
    expect(LOCAL_PATCH_STRICT_SCENE_VERSION).toBe(8);
    for (const slug of ["newyork", "amazon", "paris", "marrakech", "giza", "tokyo", "greatwall", "sydney", "antarctica"]) {
      expect(findScene(slug, 8)).toMatchObject({ version: 8, appearancesPerBoard: 5, findsRequiredToAdvance: 3 });
      expect(findScene(slug, 7)?.version).toBe(7);
      expect(localPatchBoardForVersion(slug, 8)).toEqual(localPatchBoardForVersion(slug, 7));
      expect(findScene(slug, 8)?.targets).toEqual(findScene(slug, 7)?.targets);
    }
    expect([6, 7, undefined, 10].some(isLocalPatchStrictVersion)).toBe(false);
    expect(isLocalPatchStrictVersion(8)).toBe(true);
  });
  it("adds age-aware9 without replacing historical8 geometry or five-star rules", () => {
    for (const slug of ["newyork", "amazon", "paris", "marrakech", "giza", "tokyo", "greatwall", "sydney", "antarctica"]) {
      const old = findScene(slug, 8), current = findScene(slug, 9);
      expect(current).toEqual({ ...old, version: 9 });
      expect(localPatchBoardForVersion(slug, 9)).toEqual(localPatchBoardForVersion(slug, 8));
    }
    expect(isLocalPatchStrictVersion(9)).toBe(true);
  });
  it("runs concluded normal failures before final repair and never buys a fourth image", () => {
    const rows = [{ status: "FAILED", attempts: 2 }, { status: "PENDING", attempts: 1 }, { status: "GENERATED", attempts: 1 }];
    expect(localPatchAttemptPlan(rows, true)).toEqual({ finalRepair: false, indices: [1] });
    rows[1] = { status: "GENERATED", attempts: 1 };
    expect(localPatchAttemptPlan(rows, true)).toEqual({ finalRepair: true, indices: [0] });
    expect(nextLocalPatchAttempt({ status: "PENDING", attempts: 3 }, 3)).toEqual({ attempt: 3, exhausted: false });
    expect(nextLocalPatchAttempt({ status: "FAILED", attempts: 3 }, 3)).toEqual({ attempt: 4, exhausted: true });
    rows[0] = { status: "FAILED", attempts: 3 };
    expect(localPatchAttemptPlan(rows, true).indices).toEqual([]);
  });
});
