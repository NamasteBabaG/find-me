import { describe, it, expect } from "vitest";
import { CasWorldBudgetRepository, type AtomicWorldBudgetStore } from "../../../infra/db/world-budget-repository";
import { boardWizardBudget, type BoardWizardBudgetGrant } from "../board-wizard-budget";
import type { WorldBudgetSnapshot } from "../world-budget";

function repository() {
  let saved: { revision: number; snapshot: WorldBudgetSnapshot } | null = null;
  const store: AtomicWorldBudgetStore = {
    read: async () => structuredClone(saved),
    insertIfAbsent: async (_id, snapshot) => { if (saved) return false; saved = { revision: 0, snapshot: structuredClone(snapshot) }; return true; },
    compareAndSwap: async (_id, revision, snapshot) => { if (!saved || saved.revision !== revision) return false; saved = { revision: revision + 1, snapshot: structuredClone(snapshot) }; return true; },
  };
  return new CasWorldBudgetRepository(store);
}
const evidence = (id: string, amountMicroUsd: number) => ({ providerNamespace: "fixture", providerRequestId: id, usageId: id, rawUsage: { tokens: 1 }, model: "gpt-image-2", amountMicroUsd, costBasis: "conservative-upper-estimate" as const });
const image = (key: string, reserveMicroUsd = 150_000) => ({ requestKey: key, scope: "image" as const, operationFingerprint: key, reserveMicroUsd });
const KEYS = ["amazon-detectives-hide-3:standing:render:2", "greatwall-detectives-hide-1:standing:render:2", "paris-detectives-hide-1:standing:render:2"];
const set = (requests = KEYS.map(requestKey => ({ requestKey, reserveMicroUsd: 150_000 }))) => ({ baseCapMicroUsd: 4_000_000 as const, requests });
const grant = (over: Partial<BoardWizardBudgetGrant> = {}) => async (worldId: string): Promise<BoardWizardBudgetGrant> =>
  ({ worldId, capMicroUsd: 5_000_000, authorizationSha256: "a".repeat(64), imageAboveBaseSet: set(), ...over });
const WORLD = "tail-world";

/** The measured game: 3327349 settled and an UNKNOWN 411231 still held whole. */
async function measured(resolve = grant()) {
  const repo = repository(), b = boardWizardBudget(repo, 1, { authorizeUnknownContinuation: async () => true }, resolve);
  await b.importSettled(WORLD, { scope: "image", operationFingerprint: "old", evidence: evidence("old-paid", 3_327_349) });
  await b.reserve(WORLD, { requestKey: "lost-review", scope: "judge", operationFingerprint: "lost", reserveMicroUsd: 411_231 });
  await b.markUnknown(WORLD, "lost-review", "synthetic lost answer");
  const unknown = (await b.readRequest(WORLD, "lost-review"))!;
  // The UNKNOWN stays counted in full; only different requests may proceed.
  await b.authorizeUnknownContinuation(WORLD, { approvalId: "synthetic-existing-human-continuation", requestKey: "lost-review", scope: unknown.scope,
    operationFingerprint: unknown.operationFingerprint, reserveMicroUsd: unknown.reserveMicroUsd, unknownReasons: unknown.unknownReasons,
    operatorId: "owner", authorizationSha256: "d".repeat(64), authorizedAt: new Date().toISOString() });
  return b;
}

describe("finite Sunburst image set above the original four dollars", () => {
  it("admits exactly the named images and their reviews up to a hard five, UNKNOWN included", async () => {
    const b = await measured();
    expect(await b.audit(WORLD)).toMatchObject({ capMicroUsd: 5_000_000, committedMicroUsd: 3_738_580, held: false });
    for (const key of KEYS) {
      expect((await b.reserve(WORLD, image(key))).acquired).toBe(true);
      expect((await b.reserve(WORLD, { requestKey: "review-" + key, scope: "judge", operationFingerprint: "r-" + key, reserveMicroUsd: 250_000 })).acquired).toBe(true);
    }
    expect(await b.audit(WORLD)).toMatchObject({ committedMicroUsd: 4_938_580, held: false });
    await expect(b.reserve(WORLD, { requestKey: "one-more-review", scope: "judge", operationFingerprint: "x", reserveMicroUsd: 61_421 }))
      .rejects.toMatchObject({ code: "cap_exceeded" });
    expect((await b.reserve(WORLD, { requestKey: "last-review", scope: "judge", operationFingerprint: "y", reserveMicroUsd: 61_420 })).acquired).toBe(true);
    expect(await b.audit(WORLD)).toMatchObject({ committedMicroUsd: 5_000_000, remainingMicroUsd: 0 });
  });
  it("keeps every other image and scope at four dollars, and every existing bill", async () => {
    const b = await measured(), before = await b.audit(WORLD);
    for (const scope of ["identity", "sheet", "repair", "image"] as const)
      await expect(b.reserve(WORLD, { ...image("other-" + scope, 300_000), scope })).rejects.toMatchObject({ code: "cap_exceeded" });
    await expect(b.reserve(WORLD, image("attempt-2-alias", 300_000))).rejects.toMatchObject({ code: "cap_exceeded" });
    expect(await b.audit(WORLD)).toEqual(before);
    expect((await b.reserve(WORLD, image("small-other", 261_420))).acquired).toBe(true);
  });
  it("refuses a named key with the wrong scope or reservation even below four dollars", async () => {
    const b = boardWizardBudget(repository(), 1, {}, grant());
    await expect(b.reserve(WORLD, image(KEYS[0]!, 149_999))).rejects.toMatchObject({ code: "invalid_input" });
    await expect(b.reserve(WORLD, { ...image(KEYS[1]!), scope: "judge" })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(b.reserve(WORLD, { ...image(KEYS[2]!), scope: "repair" })).rejects.toMatchObject({ code: "invalid_input" });
    expect(await b.readRequest(WORLD, KEYS[0]!)).toBeNull();
  });
  it.each([
    ["no named key", { imageAboveBaseSet: set([]) }],
    ["four keys", { imageAboveBaseSet: set([...KEYS, "x:standing:render:2"].map(requestKey => ({ requestKey, reserveMicroUsd: 150_000 }))) }],
    ["duplicate keys", { imageAboveBaseSet: set([KEYS[0]!, KEYS[0]!].map(requestKey => ({ requestKey, reserveMicroUsd: 150_000 }))) }],
    ["a different reservation", { imageAboveBaseSet: set([{ requestKey: KEYS[0]!, reserveMicroUsd: 400_000 }]) }],
    ["a malformed key", { imageAboveBaseSet: set([{ requestKey: "bad key", reserveMicroUsd: 150_000 }]) }],
    ["a six-dollar ceiling", { capMicroUsd: 6_000_000 as const }],
    ["a wrong base", { imageAboveBaseSet: { ...set(), baseCapMicroUsd: 5_000_000 as unknown as 4_000_000 } }],
    ["the single-image v1 rule beside it", { imageAboveBaseOnly: { baseCapMicroUsd: 4_000_000 as const, requestKey: KEYS[2]!, reserveMicroUsd: 150_000 } }],
  ])("refuses a grant with %s", async (_label, over) => {
    const b = boardWizardBudget(repository(), 1, {}, grant(over));
    await expect(b.reserve(WORLD, image(KEYS[0]!))).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("leaves the single-image v1 rule and the default four dollars unchanged", async () => {
    const v1 = boardWizardBudget(repository(), 1, {}, async worldId => ({ worldId, capMicroUsd: 5_000_000, authorizationSha256: "a".repeat(64),
      imageAboveBaseOnly: { baseCapMicroUsd: 4_000_000, requestKey: KEYS[2]!, reserveMicroUsd: 150_000 } }));
    await v1.importSettled(WORLD, { scope: "image", operationFingerprint: "old", evidence: evidence("old-paid", 3_900_000) });
    await expect(v1.reserve(WORLD, image(KEYS[0]!))).rejects.toMatchObject({ code: "cap_exceeded" });
    expect((await v1.reserve(WORLD, image(KEYS[2]!))).acquired).toBe(true);
    const plain = boardWizardBudget(repository());
    await plain.importSettled(WORLD, { scope: "image", operationFingerprint: "old", evidence: evidence("old-paid", 3_900_000) });
    expect(await plain.audit(WORLD)).toMatchObject({ capMicroUsd: 4_000_000 });
    await expect(plain.reserve(WORLD, image(KEYS[0]!))).rejects.toMatchObject({ code: "cap_exceeded" });
  });
});
