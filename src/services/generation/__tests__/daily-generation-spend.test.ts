import { describe, expect, it } from "vitest";
import { sumDailyGenerationSpend } from "../daily-generation-spend";
import type { WorldBudgetRequest, WorldBudgetSnapshot } from "../world-budget";

const bill = (key: string, amount = 50_000, scope: "image" | "identity" | "judge" = "image"): WorldBudgetRequest => ({
  requestKey: key, scope, operationFingerprint: "same-operation", reserveMicroUsd: 150_000, origin: "reserved", unknownReasons: [], conflicts: [], state: "settled",
  evidence: { providerNamespace: "openai:find-me-existing", providerRequestId: `req_${key}`, usageId: `usage-${key}`, rawUsage: { total_tokens: 1 }, model: "gpt-image-2", amountMicroUsd: amount, costBasis: "conservative-upper-estimate" },
});
const world = (requests: WorldBudgetRequest[], id = "game:board-wizard"): WorldBudgetSnapshot => ({ worldId: id, requests });
const assets = [{ provider: "local-patch", providerRequestId: "game", costCents: 5 }, { provider: "openai", providerRequestId: "req_identity", costCents: 7 }];
const spots = [{ provider: "local-patch", gameId: "game", costCents: 5 }];
describe("daily generation spend uses each purchase once", () => {
  it("does not triple-count the ledger, shipping asset and variant display costs", () => {
    expect(sumDailyGenerationSpend({ assets, spots, ledgers: [world([bill("image"), bill("identity", 70_000, "identity"), bill("judge", 130_000, "judge")])] }))
      .toMatchObject({ totalCents: 25, coveredAssets: 2, coveredSpots: 1, legacyAssetCents: 0, legacySpotCents: 0 });
  });
  it("keeps pending and unknown reservations in full, even without returned pictures", () => {
    const base = { scope: "image" as const, operationFingerprint: "pending-operation", reserveMicroUsd: 120_000, origin: "reserved" as const, unknownReasons: [], conflicts: [] };
    expect(sumDailyGenerationSpend({ assets: [], spots: [], ledgers: [world([{ ...base, requestKey: "pending", state: "pending" },
      { ...base, requestKey: "unknown", state: "unknown", unknownReasons: ["timeout"] }])] })).toMatchObject({ totalCents: 24, reservationsMicroUsd: 240_000 });
  });
  it("still includes unrelated and historical costs, including a world without a ledger", () => {
    expect(sumDailyGenerationSpend({ assets: [...assets, { provider: "legacy", providerRequestId: null, costCents: 9 }],
      spots: [...spots, { provider: "local-patch", gameId: "uncovered", costCents: 11 }], ledgers: [world([bill("image"), bill("identity", 70_000, "identity")])] }))
      .toMatchObject({ totalCents: 32, legacyAssetCents: 9, legacySpotCents: 11 });
  });
  it("an empty or identity-only world cannot hide image display costs", () => {
    expect(sumDailyGenerationSpend({ assets, spots, ledgers: [world([])] }).totalCents).toBe(17);
    expect(sumDailyGenerationSpend({ assets, spots, ledgers: [world([bill("identity", 70_000, "identity")])] }).totalCents).toBe(17);
  });
  it("counts a reused canonical provider receipt once across two worlds", () => {
    expect(sumDailyGenerationSpend({ assets: [], spots: [], ledgers: [world([bill("identity", 70_000, "identity")], "one:board-wizard"),
      world([bill("identity", 70_000, "identity")], "two:board-wizard")] }).totalCents).toBe(7);
  });
  it("does not subtract the same bill again for linked receipt aliases", () => {
    const original = bill("image"); if (original.state !== "settled") throw Error("fixture");
    expect(sumDailyGenerationSpend({ assets: [], spots: [], ledgers: [world([original,
      { ...original, requestKey: "alias", state: "linked", canonicalRequestKey: "image" }])] }).totalCents).toBe(5);
  });
  it("never treats corrupt ledger data as zero spend", () => {
    expect(() => sumDailyGenerationSpend({ assets, spots, ledgers: [world([bill("same"), bill("same")])] })).toThrow();
  });
});
