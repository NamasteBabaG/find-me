import { describe, expect, it } from "vitest";
import { auditWorldBudget, type WorldBudgetSnapshot } from "../generation/world-budget";
import { KINGDOM_IMAGE_INTERRUPTION_POLICY, kingdomImageInterruptionBackoffMs } from "../generation/kingdom-image-interruption";
import { localPatchHideForVersion } from "../scene/local-patch-family-hide";

// kingdom-image-interruption/v1 (review P0-2, image half): the ledger's own rule for recorded recoveries.
const HIDES = ["castlegate-detectives-hide-2", "cloudcity-detectives-hide-3", "nightcarnival-detectives-hide-1"];
const keyOf = (hideId: string, attempt = 1) => `${hideId}:${localPatchHideForVersion(hideId, 13)!.hide.pose}:render:${attempt}`;
function snapshot(policyId: string, keys = HIDES.map(id => keyOf(id))): WorldBudgetSnapshot {
  const worldId = "kingdom-domain-synthetic:board-wizard", reason = "synthetic painting returned no image";
  return { worldId,
    requests: [...new Set(keys)].map(requestKey => ({ requestKey, scope: "image", operationFingerprint: "a".repeat(64), reserveMicroUsd: 150_000,
      origin: "reserved", state: "unknown", unknownReasons: [reason], conflicts: [] })),
    unknownContinuationApprovals: keys.map((requestKey, i) => ({ version: "world-automatic-image-recovery/v1", worldId, approvalId: `auto-image-${i}`,
      requestKey, scope: "image", operationFingerprint: "a".repeat(64), reserveMicroUsd: 150_000, unknownReasons: [reason], policyId,
      authorizationSha256: String(i).repeat(64), authorizedAt: "2026-11-19T00:00:00.000Z" })),
  } as unknown as WorldBudgetSnapshot;
}

describe("kingdom-image-interruption/v1", () => {
  it("records a recovery on any number of hides; every interrupted charge stays reserved and counted in full", () => {
    const audit = auditWorldBudget(snapshot(KINGDOM_IMAGE_INTERRUPTION_POLICY), 7_000_000);
    expect(audit).toMatchObject({ held: false, reservedMicroUsd: 450_000, committedMicroUsd: 450_000, settledMicroUsd: 0 });
    expect(audit.unknownRequestKeys).toHaveLength(3);
  });

  it("leaves the earlier policy exactly as it was: at most two hides", () => {
    expect(() => auditWorldBudget(snapshot("local-patch-image-interruption/v1"), 7_000_000)).toThrow("At most two distinct interrupted hides");
  });

  it("recovers one interrupted request once, and only a first attempt", () => {
    const first = keyOf(HIDES[0]!);
    expect(() => auditWorldBudget(snapshot(KINGDOM_IMAGE_INTERRUPTION_POLICY, [first, first]), 7_000_000)).toThrow("recovers at most once");
    expect(() => auditWorldBudget(snapshot(KINGDOM_IMAGE_INTERRUPTION_POLICY, [keyOf(HIDES[0]!, 2)]), 7_000_000)).toThrow("bounded collection image interruption");
  });

  it("waits from the third interruption on: 1, 2, 4, 8, 16, then 30 minutes", () => {
    expect(Array.from({ length: 9 }, (_, i) => kingdomImageInterruptionBackoffMs(i + 1) / 60_000)).toEqual([0, 0, 1, 2, 4, 8, 16, 30, 30]);
    expect(kingdomImageInterruptionBackoffMs(0)).toBe(0); expect(kingdomImageInterruptionBackoffMs(Number.NaN)).toBe(0);
  });
});
