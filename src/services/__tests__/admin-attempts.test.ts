import { describe, expect, it } from "vitest";
import { attemptsForAdmin, parseJudge } from "../admin.service";

/**
 * What the admin page shows per attempt comes from the ledger alone, and an
 * attempt written before a field existed says so instead of pretending.
 */
describe("attempts for the admin page", () => {
  it("names the stage, the pictures and the judgement of each attempt", () => {
    const usageJson = JSON.stringify({ ledger: { exactCents: 12.3, attempts: [
      { at: "2026-09-08T00:00:00Z", outcome: "rejected: does not show Noa: torso ends over sand", failedAt: "judge", problem: "does not show Noa: torso ends over sand", rollCents: 7, matteCents: 3.2, judgeCents: 0.68, evidenceAssetId: "ast_r1", matteEvidenceAssetIds: ["ast_m1", "ast_m2"], patchAssetId: "ast_p1", compositeAssetId: "ast_c1", judgeImageAssetIds: ["ast_j1", "ast_j2"], judgement: { verdict: "bad", reason: "torso ends over sand", model: "gpt-4o-2024-11-20", policy: "screen:fast", checks: { bodyPlacement: "fail" } }, hiddenFraction: 0.55 },
      { at: "2026-09-08T00:05:00Z", outcome: "rejected: extraction: 55% of what was kept was already in the scene", extractionProblem: "55% of what was kept was already in the scene", failedAt: "matte", rollCents: 7, matteCents: 6.4, judgeCents: 0, evidenceAssetId: "ast_r2", matteEvidenceAssetId: "ast_m3" },
      { at: "2026-09-07T00:00:00Z", outcome: "rejected: does not show Noa: old row", rollCents: 2, judgeCents: 0.7, evidenceAssetId: "ast_r0" },
      { at: "2026-09-08T00:10:00Z", outcome: "accepted", rollCents: 7, matteCents: 3.2, judgeCents: 3.1, evidenceAssetId: "ast_r3", patchAssetId: "ast_p3", compositeAssetId: "ast_c3", judgement: { verdict: "ok", reason: "fine", reviews: [{ model: "gpt-4o-2024-11-20", verdict: "ok", reason: "a" }, { model: "gpt-5.6-sol", verdict: "ok", reason: "b" }] } },
    ] } });
    const a = attemptsForAdmin(usageJson);
    expect(a.map((x) => x.stage)).toEqual(["judge", "matte", "unrecorded", "accepted"]);
    expect(a[0]).toMatchObject({ n: 1, renderAssetId: "ast_r1", matteAssetIds: ["ast_m1", "ast_m2"], patchAssetId: "ast_p1", compositeAssetId: "ast_c1", judgeImageAssetIds: ["ast_j1", "ast_j2"], hiddenFraction: 0.55 });
    expect(a[0]!.cents).toBeCloseTo(10.88);
    expect(a[0]!.judge).toMatchObject({ verdict: "bad", model: "gpt-4o-2024-11-20", policy: "screen:fast", checks: { bodyPlacement: "fail" } });
    expect(a[1]).toMatchObject({ matteAssetIds: ["ast_m3"], patchAssetId: null, compositeAssetId: null, problem: "55% of what was kept was already in the scene", judge: null });
    expect(a[2]).toMatchObject({ stage: "unrecorded", judge: null, renderAssetId: "ast_r0" });
    expect(a[3]!.judge?.reviews).toHaveLength(2);
    expect(attemptsForAdmin(null)).toEqual([]);
    expect(attemptsForAdmin("not json")).toEqual([]);
  });
  it("tells an undecided review from a missing one", () => {
    expect(parseJudge(null)).toBeNull();
    expect(parseJudge(JSON.stringify({ verdict: "unknown", reason: "timed out", model: "gpt-5.6-sol" }))).toMatchObject({ verdict: "unknown", model: "gpt-5.6-sol" });
    expect(parseJudge(JSON.stringify({ verdict: "ok", reason: "", checks: { identity: "pass" } }))?.checks).toEqual({ identity: "pass" });
  });
});
