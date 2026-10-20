import { describe, expect, it } from "vitest";
import { WorldBudget, WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT, WORLD_AUTOMATIC_REVIEW_RECOVERY_V3_LIMIT, type WorldAutomaticReviewRecoveryV2Input,
  type WorldAutomaticReviewRecoveryV3Input } from "../world-budget";
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

describe("lean review recovery v3 (local-patch-lean-review-recovery/v1): after v1 and v2, bounded, every unknown still counted", () => {
  /** Synthetic interrupted lean bundle questions, each reserved at the lean quality amount, with hexadecimal fingerprints. */
  const lean = Array.from({ length: 2 + WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT + WORLD_AUTOMATIC_REVIEW_RECOVERY_V3_LIMIT + 1 }, (_, i) => {
    const fingerprint = (i + 16).toString(16).padStart(2, "0").repeat(32);
    return { requestKey: `self-repair:board:newyork:${fingerprint}`, scope: "judge" as const, operationFingerprint: fingerprint, reserveMicroUsd: 200_000 };
  });
  const record = (i: number) => ({ ...lean[i]!, unknownReasons: ["provider ended it failed"], authorizationSha256: "f".repeat(64), authorizedAt: "2026-10-20T14:00:00.000Z" });
  const recV1 = (i: number) => ({ ...record(i), approvalId: `lean-v1-${i}`, policyId: "local-patch-review-interruption/v1" as const });
  const recV2 = (i: number): WorldAutomaticReviewRecoveryV2Input => ({ ...record(i), approvalId: `lean-v2-${i}`, policyId: "local-patch-review-interruption/v2" });
  const recV3 = (i: number): WorldAutomaticReviewRecoveryV3Input => ({ ...record(i), approvalId: `lean-v3-${i}`, policyId: "local-patch-review-interruption/v3" });
  const verified = { authorizeAutomaticReviewRecovery: async () => true, authorizeAutomaticReviewRecoveryV2: async () => true, authorizeAutomaticReviewRecoveryV3: async () => true };
  async function spent(f: ReturnType<typeof repository>, count: number) {
    const budget = boardWizardBudget(f.repository, 1, verified);
    for (const input of lean.slice(0, count)) await budget.reserve("world", input);
    for (const input of lean.slice(0, count)) await budget.markUnknown("world", input.requestKey, "provider ended it failed");
    await budget.authorizeAutomaticReviewRecovery("world", recV1(0)); await budget.authorizeAutomaticReviewRecovery("world", recV1(1));
    for (let i = 2; i < 2 + WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT; i++) await budget.authorizeAutomaticReviewRecoveryV2("world", recV2(i));
    return budget;
  }

  it("needs its own trusted verifier, keeps every reservation whole, and is idempotent on its approval", async () => {
    const f = repository(), budget = await spent(f, 7), seventh = 6;
    // The second lean QA world's state, synthetically: seven unknown answers, six continued, the seventh holding the ledger.
    expect(await budget.audit("world")).toMatchObject({ held: true, reservedMicroUsd: 1_400_000, settledMicroUsd: 0 });
    await expect(budget.authorizeAutomaticReviewRecoveryV2("world", recV2(seventh))).rejects.toMatchObject({ code: "invalid_snapshot" });
    await expect(boardWizardBudget(f.repository, 1, { ...verified, authorizeAutomaticReviewRecoveryV3: undefined })
      .authorizeAutomaticReviewRecoveryV3("world", recV3(seventh))).rejects.toMatchObject({ code: "invalid_input" });
    await expect(boardWizardBudget(f.repository, 1, { ...verified, authorizeAutomaticReviewRecoveryV3: async () => false })
      .authorizeAutomaticReviewRecoveryV3("world", recV3(seventh))).rejects.toMatchObject({ code: "invalid_input" });
    expect(await budget.authorizeAutomaticReviewRecoveryV3("world", recV3(seventh))).toMatchObject({ acquired: true });
    expect(await budget.authorizeAutomaticReviewRecoveryV3("world", recV3(seventh))).toMatchObject({ acquired: false });
    await expect(budget.authorizeAutomaticReviewRecoveryV3("world", { ...recV3(seventh), authorizationSha256: "0".repeat(64) })).rejects.toMatchObject({ code: "key_conflict" });
    // Only the hold lifts: all seven reservations stay counted in full.
    expect(await budget.audit("world")).toMatchObject({ held: false, reservedMicroUsd: 1_400_000, settledMicroUsd: 0, unknownRequestKeys: lean.slice(0, 7).map(i => i.requestKey) });
    expect(await budget.countContinuationApprovals("world")).toEqual({ "world-automatic-review-recovery/v1": 2,
      "world-automatic-review-recovery/v2": WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT, "world-automatic-review-recovery/v3": 1 });
    // Publication accepts a v3 record only for a world that says it carries the pin.
    expect(await localPatchBudgetReadyForPublication(budget, "world", 12, { reviewRecoveryV2: true })).toBe(false);
    expect(await localPatchBudgetReadyForPublication(budget, "world", 12, { reviewRecoveryV2: true, reviewRecoveryV3: true })).toBe(true);
  });

  it("stops at its own bound and never continues an interruption an earlier record continued", async () => {
    const f = repository(), budget = await spent(f, lean.length);
    for (const i of [0, 2]) await expect(budget.authorizeAutomaticReviewRecoveryV3("world", { ...recV3(i), approvalId: `again-${i}` }))
      .rejects.toMatchObject({ code: "invalid_snapshot" });
    const first = 2 + WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT;
    for (let i = first; i < first + WORLD_AUTOMATIC_REVIEW_RECOVERY_V3_LIMIT; i++) await budget.authorizeAutomaticReviewRecoveryV3("world", recV3(i));
    await expect(budget.authorizeAutomaticReviewRecoveryV3("world", recV3(first + WORLD_AUTOMATIC_REVIEW_RECOVERY_V3_LIMIT))).rejects.toMatchObject({ code: "invalid_snapshot" });
    expect(f.rows.get("world")!.snapshot.unknownContinuationApprovals).toHaveLength(first + WORLD_AUTOMATIC_REVIEW_RECOVERY_V3_LIMIT);
  });

  it("refuses a v3 record for anything but an interrupted v12 review reservation", async () => {
    const f = repository(), budget = boardWizardBudget(f.repository, 1, verified);
    await budget.reserve("world", lean[0]!); await budget.markUnknown("world", lean[0]!.requestKey, "provider ended it failed");
    const before = structuredClone(f.rows.get("world"));
    for (const override of [{ scope: "image" as const }, { reserveMicroUsd: 1 }, { operationFingerprint: "e".repeat(64) },
      { requestKey: `self-repair:board:missing:${lean[0]!.operationFingerprint}` }, { policyId: "local-patch-review-interruption/v2" as never }])
      await expect(budget.authorizeAutomaticReviewRecoveryV3("world", { ...recV3(0), ...override })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(budget.authorizeAutomaticReviewRecoveryV3("world", { ...recV3(0), unknownReasons: ["another reason"] })).rejects.toMatchObject({ code: "key_conflict" });
    expect(f.rows.get("world")).toEqual(before);
  });

  it("refuses the next reservation before anything is sent once unknown charges leave no room under four dollars", async () => {
    const f = repository(), budget = await spent(f, 18), first = 2 + WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT;
    for (let i = first; i < 18; i++) await budget.authorizeAutomaticReviewRecoveryV3("world", recV3(i));
    // 18 unknown answers at 0.20, every one continued: 3.60 of the 4.00 committed, none of it released by a continuation.
    expect(await budget.audit("world")).toMatchObject({ held: false, committedMicroUsd: 3_600_000, remainingMicroUsd: 400_000, settledMicroUsd: 0 });
    const question = (digit: string, reserveMicroUsd: number) => ({ requestKey: `self-repair:board:newyork:${digit.repeat(64)}`, scope: "judge" as const,
      operationFingerprint: digit.repeat(64), reserveMicroUsd });
    expect(await budget.reserve("world", question("8", 200_000))).toMatchObject({ acquired: true });
    await expect(budget.reserve("world", question("9", 250_000))).rejects.toMatchObject({ code: "cap_exceeded" });
    expect(await budget.readRequest("world", question("9", 250_000).requestKey)).toBeNull();
    expect(await budget.audit("world")).toMatchObject({ committedMicroUsd: 3_800_000 });
  });
});
