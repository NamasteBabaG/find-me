import { describe, expect, it } from "vitest";
import { WorldBudget, WORLD_AUTOMATIC_REVIEW_RECOVERY_V3_LIMIT, WORLD_AUTOMATIC_REVIEW_RECOVERY_V4_LIMIT,
  type WorldAutomaticReviewRecoveryV4Input, type WorldReservationInput } from "../world-budget";
import { CasWorldBudgetRepository, type AtomicWorldBudgetStore, type VersionedWorldBudgetSnapshot } from "../../../infra/db/world-budget-repository";
import { boardWizardBudget } from "../board-wizard-budget";
import { localPatchBudgetReadyForPublication } from "../local-patch-interruption-recovery";
import { LEAN_CAPACITY_RECOVERY_LIMIT } from "../../../domain/generation/lean-capacity-recovery";

function fixture() {
  const rows = new Map<string, VersionedWorldBudgetSnapshot>();
  const store: AtomicWorldBudgetStore = {
    read: async id => structuredClone(rows.get(id) ?? null),
    insertIfAbsent: async (id, snapshot) => { if (rows.has(id)) return false; rows.set(id, { revision: 0, snapshot: structuredClone(snapshot) }); return true; },
    compareAndSwap: async (id, revision, snapshot) => {
      if (rows.get(id)?.revision !== revision) return false;
      rows.set(id, { revision: revision + 1, snapshot: structuredClone(snapshot) }); return true;
    },
  };
  const repository = new CasWorldBudgetRepository(store);
  const budget = boardWizardBudget(repository, 1, { authorizeAutomaticReviewRecovery: async () => true,
    authorizeAutomaticReviewRecoveryV2: async () => true, authorizeAutomaticReviewRecoveryV3: async () => true,
    authorizeAutomaticReviewRecoveryV4: async approval => approval.grantSha256 === "e".repeat(64) },
    async worldId => ({ worldId, capMicroUsd: 12_000_000, authorizationSha256: "f".repeat(64) }));
  return { rows, repository, budget };
}
const request = (n: number): WorldReservationInput => ({ requestKey: `self-repair:board:newyork:${n.toString(16).padStart(64, "0")}`,
  scope: "judge", operationFingerprint: n.toString(16).padStart(64, "0"), reserveMicroUsd: 66_000 });
const recovery = (n: number): WorldAutomaticReviewRecoveryV4Input => ({ ...request(n), approvalId: `synthetic-v4-${n}`,
  unknownReasons: ["Synthetic unpriced provider capacity failure"], policyId: "local-patch-review-interruption/v4",
  grantSha256: "e".repeat(64), authorizationSha256: "d".repeat(64), authorizedAt: "2026-10-21T00:00:00.000Z" });
async function unknowns(f: ReturnType<typeof fixture>, count: number) {
  for (let n = 1; n <= count; n++) await f.budget.reserve("world", request(n));
  for (let n = 1; n <= count; n++) await f.budget.markUnknown("world", request(n).requestKey, "Synthetic unpriced provider capacity failure");
}

describe("capacity recovery ledger v4 keeps all historical bounds and unknown money", () => {
  it("admits at most32 fresh continuations after the exact old2+4+12, without changing their bytes or reserves", async () => {
    expect(WORLD_AUTOMATIC_REVIEW_RECOVERY_V3_LIMIT).toBe(12);
    expect(WORLD_AUTOMATIC_REVIEW_RECOVERY_V4_LIMIT).toBe(LEAN_CAPACITY_RECOVERY_LIMIT);
    const f = fixture(); await unknowns(f, 51);
    for (let n = 1; n <= 18; n++) {
      const { grantSha256: _grant, ...base } = recovery(n);
      if (n <= 2) await f.budget.authorizeAutomaticReviewRecovery("world", { ...base, policyId: "local-patch-review-interruption/v1" });
      else if (n <= 6) await f.budget.authorizeAutomaticReviewRecoveryV2("world", { ...base, policyId: "local-patch-review-interruption/v2" });
      else await f.budget.authorizeAutomaticReviewRecoveryV3("world", { ...base, policyId: "local-patch-review-interruption/v3" });
    }
    const before = structuredClone(f.rows.get("world")!.snapshot);
    const { grantSha256: _newGrant, ...nineteenth } = recovery(19);
    await expect(f.budget.authorizeAutomaticReviewRecoveryV3("world", { ...nineteenth, policyId: "local-patch-review-interruption/v3" })).rejects.toMatchObject({ code: "invalid_snapshot" });
    for (let n = 19; n <= 50; n++) expect(await f.budget.authorizeAutomaticReviewRecoveryV4("world", recovery(n))).toMatchObject({ acquired: true });
    expect(await f.budget.authorizeAutomaticReviewRecoveryV4("world", recovery(19))).toMatchObject({ acquired: false });
    const saved = JSON.stringify(f.rows.get("world"));
    await expect(f.budget.authorizeAutomaticReviewRecoveryV4("world", recovery(51))).rejects.toMatchObject({ code: "invalid_snapshot" });
    expect(JSON.stringify(f.rows.get("world"))).toBe(saved);
    expect(f.rows.get("world")!.snapshot.requests).toEqual(before.requests);
    expect(f.rows.get("world")!.snapshot.unknownContinuationApprovals!.slice(0, 18)).toEqual(before.unknownContinuationApprovals);
    expect(await f.budget.audit("world")).toMatchObject({ reservedMicroUsd: 51 * 66_000, settledMicroUsd: 0, held: true, capMicroUsd: 12_000_000 });
    expect((await f.budget.countContinuationApprovals("world"))["world-automatic-review-recovery/v3"]).toBe(12);
  });

  it("refuses without a trusted verifier, with a different grant, or with unexpected fields, without mutating the account", async () => {
    const f = fixture(); await unknowns(f, 1); const before = JSON.stringify(f.rows.get("world"));
    await expect(new WorldBudget(f.repository).authorizeAutomaticReviewRecoveryV4("world", recovery(1))).rejects.toMatchObject({ code: "invalid_input" });
    await expect(f.budget.authorizeAutomaticReviewRecoveryV4("world", { ...recovery(1), grantSha256: "f".repeat(64) })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(f.budget.authorizeAutomaticReviewRecoveryV4("world", { ...recovery(1), fabricated: true } as never)).rejects.toMatchObject({ code: "invalid_input" });
    expect(JSON.stringify(f.rows.get("world"))).toBe(before);
  });

  it("refuses cross-version duplication and does not let a v4 record approve publication on its own", async () => {
    const f = fixture(); await unknowns(f, 1);
    const { grantSha256: _grant, ...base } = recovery(1);
    await f.budget.authorizeAutomaticReviewRecoveryV3("world", { ...base, policyId: "local-patch-review-interruption/v3" });
    const before = JSON.stringify(f.rows.get("world"));
    await expect(f.budget.authorizeAutomaticReviewRecoveryV4("world", recovery(1))).rejects.toMatchObject({ code: "key_conflict" });
    expect(JSON.stringify(f.rows.get("world"))).toBe(before);
    const second = fixture(); await unknowns(second, 1); await second.budget.authorizeAutomaticReviewRecoveryV4("world", recovery(1));
    expect(await localPatchBudgetReadyForPublication(second.budget, "world", 12)).toBe(false);
    expect(await localPatchBudgetReadyForPublication(second.budget, "world", 12, { capacityContinuation: async () => false })).toBe(false);
    expect(await localPatchBudgetReadyForPublication(second.budget, "world", 12, { capacityContinuation: async approval => approval.grantSha256 === recovery(1).grantSha256 })).toBe(true);
    expect(await second.budget.audit("world")).toMatchObject({ reservedMicroUsd: 66_000, settledMicroUsd: 0 });
  });
});
