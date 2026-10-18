import { describe, expect, it } from "vitest";
import { WorldBudget, WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT, type WorldAutomaticReviewRecoveryV2Input } from "../world-budget";
import { CasWorldBudgetRepository, type AtomicWorldBudgetStore, type VersionedWorldBudgetSnapshot } from "../../../infra/db/world-budget-repository";
import { boardWizardBudget } from "../board-wizard-budget";
import { localPatchBudgetReadyForPublication } from "../local-patch-interruption-recovery";

function repository() {
  const rows = new Map<string, VersionedWorldBudgetSnapshot>();
  const store: AtomicWorldBudgetStore = {
    read: async id => structuredClone(rows.get(id) ?? null),
    insertIfAbsent: async (id, snapshot) => { if (rows.has(id)) return false; rows.set(id, { revision: 0, snapshot: structuredClone(snapshot) }); return true; },
    compareAndSwap: async (id, revision, snapshot) => {
      if (rows.get(id)?.revision !== revision) return false;
      rows.set(id, { revision: revision + 1, snapshot: structuredClone(snapshot) }); return true;
    },
  };
  return { rows, repository: new CasWorldBudgetRepository(store) };
}
const letters = "abcdefgh".split("");
/** Synthetic interrupted Sol continuity questions, each reserved at the v3 continuity amount. */
const inputs = letters.map(letter => ({ requestKey: `self-repair:board:newyork:${letter.repeat(64)}`, scope: "judge" as const,
  operationFingerprint: letter.repeat(64), reserveMicroUsd: 66_000 }));
const v1 = (index: number) => ({ ...inputs[index]!, approvalId: `review-${index}`, policyId: "local-patch-review-interruption/v1" as const,
  unknownReasons: ["no response"], authorizationSha256: "d".repeat(64), authorizedAt: "2026-10-17T01:00:00.000Z" });
const v2 = (index: number): WorldAutomaticReviewRecoveryV2Input => ({ ...inputs[index]!, approvalId: `review-v2-${index}`,
  policyId: "local-patch-review-interruption/v2", unknownReasons: ["no response"], authorizationSha256: "e".repeat(64), authorizedAt: "2026-10-18T01:00:00.000Z" });

describe("enrolled review recovery v2: v1 exact, the third interruption continued with its reservation kept", () => {
  it("keeps v1 at two, admits the third only as v2 with its trusted verifier, and keeps all three charges counted", async () => {
    const f = repository();
    const budget = boardWizardBudget(f.repository, 1, { authorizeAutomaticReviewRecovery: async () => true, authorizeAutomaticReviewRecoveryV2: async () => true });
    for (const input of inputs.slice(0, 3)) await budget.reserve("world", input);
    for (const input of inputs.slice(0, 3)) await budget.markUnknown("world", input.requestKey, "no response");
    await budget.authorizeAutomaticReviewRecovery("world", v1(0));
    await budget.authorizeAutomaticReviewRecovery("world", v1(1));
    // The historical bound is unchanged: a third v1 record is still refused.
    await expect(budget.authorizeAutomaticReviewRecovery("world", v1(2))).rejects.toMatchObject({ code: "invalid_snapshot" });
    expect(await budget.audit("world")).toMatchObject({ held: true, reservedMicroUsd: 198_000 });
    // No verifier, no v2: an un-enrolled world can never write one.
    await expect(boardWizardBudget(f.repository).authorizeAutomaticReviewRecoveryV2("world", v2(2))).rejects.toMatchObject({ code: "invalid_input" });
    await expect(new WorldBudget(f.repository).authorizeAutomaticReviewRecoveryV2("world", v2(2))).rejects.toMatchObject({ code: "invalid_input" });
    expect(await budget.authorizeAutomaticReviewRecoveryV2("world", v2(2))).toMatchObject({ acquired: true });
    expect(await budget.authorizeAutomaticReviewRecoveryV2("world", v2(2))).toMatchObject({ acquired: false });
    // The whole unknown reservation of every interruption stays counted; only the hold lifts.
    expect(await budget.audit("world")).toMatchObject({ held: false, reservedMicroUsd: 198_000, settledMicroUsd: 0, unknownRequestKeys: inputs.slice(0, 3).map(i => i.requestKey) });
    // Publication accepts the v2 record only for a world that says it is enrolled.
    expect(await localPatchBudgetReadyForPublication(budget, "world", 12)).toBe(false);
    expect(await localPatchBudgetReadyForPublication(budget, "world", 12, { reviewRecoveryV2: true })).toBe(true);
    expect(await localPatchBudgetReadyForPublication(budget, "world", 11, { reviewRecoveryV2: true })).toBe(false);
  });
  it("never continues one interruption twice, and stops at its own bound", async () => {
    const f = repository();
    const budget = boardWizardBudget(f.repository, 1, { authorizeAutomaticReviewRecovery: async () => true, authorizeAutomaticReviewRecoveryV2: async () => true });
    for (const input of inputs) await budget.reserve("world", input);
    for (const input of inputs) await budget.markUnknown("world", input.requestKey, "no response");
    await budget.authorizeAutomaticReviewRecovery("world", v1(0));
    await expect(budget.authorizeAutomaticReviewRecoveryV2("world", { ...v2(0), approvalId: "again" })).rejects.toMatchObject({ code: "invalid_snapshot" });
    for (let i = 1; i <= WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT; i++) await budget.authorizeAutomaticReviewRecoveryV2("world", v2(i));
    await expect(budget.authorizeAutomaticReviewRecoveryV2("world", v2(WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT + 1))).rejects.toMatchObject({ code: "invalid_snapshot" });
    expect(f.rows.get("world")!.snapshot.unknownContinuationApprovals).toHaveLength(1 + WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT);
  });
  it("refuses a v2 record for anything but an interrupted v12 review reservation", async () => {
    const f = repository();
    const budget = boardWizardBudget(f.repository, 1, { authorizeAutomaticReviewRecoveryV2: async () => true });
    await budget.reserve("world", inputs[0]!); await budget.markUnknown("world", inputs[0]!.requestKey, "no response");
    const before = structuredClone(f.rows.get("world"));
    for (const override of [{ scope: "image" as const }, { reserveMicroUsd: 1 }, { operationFingerprint: "z".repeat(64) },
      { requestKey: `self-repair:board:missing:${"a".repeat(64)}` }])
      await expect(budget.authorizeAutomaticReviewRecoveryV2("world", { ...v2(0), ...override })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(budget.authorizeAutomaticReviewRecoveryV2("world", { ...v2(0), unknownReasons: ["another reason"] })).rejects.toMatchObject({ code: "key_conflict" });
    expect(f.rows.get("world")).toEqual(before);
  });
});
