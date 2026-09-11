import { describe, expect, it } from "vitest";
import { purchaseOnce, type PurchaseLedger, type RetainedPurchase, type RetainedPurchaseStore } from "../paid-operation";
import type { WorldBudgetRequest, WorldChargeEvidence } from "../world-budget";

/**
 * The two windows where money moves and nothing is left to show for it:
 *
 *   reserve ──► call ──► [A] ──► retain ──► [B] ──► settle
 *
 * A restart after B must settle from what was retained. A restart after A must
 * refuse to buy again, because an unknown charge is not a free one.
 */

const evidence = (id = "req-1"): WorldChargeEvidence => ({
  providerNamespace: "openai:test", providerRequestId: id, usageId: `usage-${id}`,
  rawUsage: { total: 1 }, model: "gpt-image-2", amountMicroUsd: 48_800, quality: "medium",
} as unknown as WorldChargeEvidence);

const bytes = (text: string) => Buffer.from(text);

function harness(seed: { request?: WorldBudgetRequest | null; retained?: RetainedPurchase | null } = {}) {
  const calls: string[] = [];
  let request = seed.request ?? null;
  let retained = seed.retained ?? null;
  const ledger: PurchaseLedger = {
    readRequest: async () => request,
    reserve: async (_w, input) => {
      calls.push("reserve");
      request = { ...input, origin: "reserved", state: "pending", unknownReasons: [], conflicts: [] } as unknown as WorldBudgetRequest;
      return { acquired: true };
    },
    settle: async (_w, _k, ev) => { calls.push("settle"); request = { ...(request as object), state: "settled", evidence: ev } as WorldBudgetRequest; },
    markUnknown: async (_w, _k, reason) => { calls.push("markUnknown"); request = { ...(request as object), state: "unknown", unknownReasons: [reason] } as WorldBudgetRequest; },
  };
  const store: RetainedPurchaseStore = {
    put: async (_k, value) => { calls.push("retain"); retained = value; },
    get: async () => retained,
  };
  return { ledger, store, calls, state: () => ({ request, retained }) };
}

const input = (buy: () => Promise<RetainedPurchase>) => ({
  worldId: "w", requestKey: "hide-1:render:1", scope: "image" as const,
  operationFingerprint: "f".repeat(64), reserveMicroUsd: 120_000, buy,
});

describe("one purchase that survives being interrupted", () => {
  it("reserves, buys, retains and only then settles", async () => {
    const h = harness();
    const result = await purchaseOnce(h, input(async () => ({ bytes: bytes("png"), evidence: evidence() })));
    expect(result).toMatchObject({ kind: "bought", replayed: false, settledFromRetained: false });
    // The order is the whole recovery story: after `retain` an interruption
    // costs a restart, not a second purchase.
    expect(h.calls).toEqual(["reserve", "retain", "settle"]);
  });

  it("replays a settled purchase instead of buying it again", async () => {
    const h = harness({
      request: { state: "settled", evidence: evidence() } as unknown as WorldBudgetRequest,
      retained: { bytes: bytes("the picture we already paid for"), evidence: evidence() },
    });
    let dispatched = false;
    const result = await purchaseOnce(h, input(async () => { dispatched = true; return { bytes: bytes("second"), evidence: evidence("req-2") }; }));
    expect(dispatched).toBe(false);
    expect(h.calls).toEqual([]);
    expect(result).toMatchObject({ kind: "bought", replayed: true });
    expect((result as { bytes: Buffer }).bytes.toString()).toBe("the picture we already paid for");
  });

  it("settles from what was retained when only the last write was lost", async () => {
    // Crash at B: the provider answered, the bytes and the bill are on disk, and
    // the ledger still says pending. A naive restart buys the same picture twice.
    const h = harness({
      request: { state: "pending" } as unknown as WorldBudgetRequest,
      retained: { bytes: bytes("already bought"), evidence: evidence("req-b") },
    });
    let dispatched = false;
    const result = await purchaseOnce(h, input(async () => { dispatched = true; return { bytes: bytes("again"), evidence: evidence("req-2") }; }));
    expect(dispatched).toBe(false);
    expect(h.calls).toEqual(["settle"]);
    expect(result).toMatchObject({ kind: "bought", replayed: true, settledFromRetained: true });
    expect(h.state().request).toMatchObject({ state: "settled" });
  });

  it("refuses to retry a reservation with nothing behind it", async () => {
    // Crash at A: the provider may have been billed and nothing describes it.
    // Only a person can decide to spend again here.
    const h = harness({ request: { state: "pending" } as unknown as WorldBudgetRequest, retained: null });
    let dispatched = false;
    const result = await purchaseOnce(h, input(async () => { dispatched = true; return { bytes: bytes("x"), evidence: evidence() }; }));
    expect(dispatched).toBe(false);
    expect(result).toMatchObject({ kind: "unresolved" });
    expect((result as { reason: string }).reason).toMatch(/may have been billed/);
    expect(h.calls).toEqual(["markUnknown"]);
  });

  it("will not silently re-buy a settled purchase whose result was thrown away", async () => {
    const h = harness({ request: { state: "settled", evidence: evidence() } as unknown as WorldBudgetRequest, retained: null });
    let dispatched = false;
    const result = await purchaseOnce(h, input(async () => { dispatched = true; return { bytes: bytes("x"), evidence: evidence() }; }));
    expect(dispatched).toBe(false);
    expect(result).toMatchObject({ kind: "unresolved" });
    expect((result as { reason: string }).reason).toMatch(/charge twice/);
  });

  it("keeps the reservation when the call itself fails, and does not call it free", async () => {
    const h = harness();
    const result = await purchaseOnce(h, input(async () => { throw new Error("socket closed"); }));
    expect(result).toMatchObject({ kind: "unresolved" });
    expect((result as { reason: string }).reason).toMatch(/socket closed/);
    expect(h.calls).toEqual(["reserve", "markUnknown"]);
    expect(h.state().request).toMatchObject({ state: "unknown" });
  });

  it("buys once across a restart at every boundary", async () => {
    // The property that matters, stated as a whole: run, interrupt, run again,
    // and the provider is dispatched exactly once.
    let dispatches = 0;
    const buy = async () => { dispatches++; return { bytes: bytes(`render ${dispatches}`), evidence: evidence(`req-${dispatches}`) }; };

    const first = harness();
    await purchaseOnce(first, input(buy));
    const after = first.state();

    // Restart carrying the durable state forward, as a new process would.
    const second = harness({ request: after.request, retained: after.retained });
    const result = await purchaseOnce(second, input(buy));

    expect(dispatches).toBe(1);
    expect(result).toMatchObject({ kind: "bought", replayed: true });
    expect((result as { bytes: Buffer }).bytes.toString()).toBe("render 1");
  });

  it("treats a render and a judgement as the same kind of purchase", async () => {
    // The scripts budgeted the first and forgot the second, and a ledger that
    // reads 29.60c for a round that cost 38.85c is not a ceiling.
    const h = harness();
    const judged = await purchaseOnce(h, {
      ...input(async () => ({ bytes: bytes(JSON.stringify({ verdict: "pass" })), evidence: evidence("req-judge") })),
      requestKey: "hide-1:judge:1", scope: "judge",
    });
    expect(judged).toMatchObject({ kind: "bought" });
    expect(h.calls).toEqual(["reserve", "retain", "settle"]);
  });
});
