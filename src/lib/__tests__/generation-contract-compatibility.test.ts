import { describe, expect, it } from "vitest";
import * as budget from "../../domain/generation/world-budget";
import * as historicalBudget from "../../services/generation/world-budget";
import * as retained from "../../domain/generation/retained-purchase";
import * as historicalPurchase from "../../services/generation/paid-operation";
import { RetainedPurchaseError } from "../../infra/db/prisma-retained-purchase-store";

describe("generation contract relocation compatibility", () => {
  it("preserves one budget implementation and one error constructor for every historical import", () => {
    for (const name of Object.keys(budget) as (keyof typeof budget)[]) expect(historicalBudget[name], name).toBe(budget[name]);
    const error = new budget.WorldBudgetError("cap_exceeded", "synthetic budget refusal");
    expect(error).toBeInstanceOf(historicalBudget.WorldBudgetError);
    expect(historicalBudget.WORLD_BUDGET_CAP_MICRO_USD).toBe(5_000_000);
  });

  it("preserves retained-store refusal routing and persisted payload digests through the old entrypoint", () => {
    expect(historicalPurchase.RetainedPurchaseRefused).toBe(retained.RetainedPurchaseRefused);
    expect(historicalPurchase.RETAINED_PURCHASE_VERSION).toBe(retained.RETAINED_PURCHASE_VERSION);
    expect(historicalPurchase.retainedPayloadDigest).toBe(retained.retainedPayloadDigest);
    const refusal = new RetainedPurchaseError("oversized", "synthetic retained payload");
    expect(refusal).toBeInstanceOf(historicalPurchase.RetainedPurchaseRefused);
    expect(refusal.permanent).toBe(true);
    expect(retained.retainedPayloadDigest(Buffer.from("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
