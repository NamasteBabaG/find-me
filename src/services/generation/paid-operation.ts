import type { WorldBudgetRequest, WorldChargeEvidence, WorldBudgetScope } from "./world-budget";

/**
 * One purchase that survives being interrupted anywhere.
 *
 * The scripts did reserve → call → settle, and kept the bytes afterwards. That
 * leaves two windows where money moves and nothing is left to show for it:
 *
 *   reserve ──► call ──► [A] ──► retain ──► [B] ──► settle
 *
 * At **A** the provider has been paid and the process dies before anything is
 * written down: the reservation is all that remains, and nobody can tell whether
 * it was ever dispatched. At **B** the bytes exist but the ledger still says
 * pending, and a naive restart buys the same picture a second time.
 *
 * So the retained record carries the bytes AND the charge evidence, written as
 * one thing before the ledger is settled. A restart after **B** settles from
 * what was retained rather than paying again; a restart after **A** finds a
 * reservation with nothing behind it and REFUSES to retry, because an unknown
 * charge is not a free one and only a person can decide to spend again.
 *
 * Nothing here knows what was bought. A render and a judgement are the same kind
 * of purchase, which is the point: the scripts budgeted the first and forgot the
 * second, and a ledger that reads 29.60c for a round that cost 38.85c is not a
 * ceiling.
 */

/** What a retained purchase keeps: the thing bought, and the bill for it. */
export type RetainedPurchase = { readonly bytes: Buffer; readonly evidence: WorldChargeEvidence };

export interface RetainedPurchaseStore {
  /** Written as one record, before the ledger is settled. */
  put(key: string, value: RetainedPurchase): Promise<void>;
  get(key: string): Promise<RetainedPurchase | null>;
}

/** The narrow slice of the world budget a purchase needs. */
export interface PurchaseLedger {
  readRequest(worldId: string, requestKey: string): Promise<WorldBudgetRequest | null>;
  reserve(worldId: string, input: {
    requestKey: string; scope: WorldBudgetScope; operationFingerprint: string; reserveMicroUsd: number;
  }): Promise<{ acquired: boolean }>;
  settle(worldId: string, requestKey: string, evidence: WorldChargeEvidence): Promise<unknown>;
  markUnknown(worldId: string, requestKey: string, reason: string): Promise<unknown>;
}

export type PurchaseOutcome =
  /** Bought now, or recovered without paying again. */
  | { kind: "bought"; bytes: Buffer; evidence: WorldChargeEvidence; replayed: boolean; settledFromRetained: boolean }
  /** A charge that may have happened and cannot be described. Never auto-retried. */
  | { kind: "unresolved"; reason: string };

export type PurchaseInput = {
  readonly worldId: string;
  readonly requestKey: string;
  readonly scope: WorldBudgetScope;
  /** Everything that decides what is being bought. A different one is a different purchase. */
  readonly operationFingerprint: string;
  readonly reserveMicroUsd: number;
  /** Dispatches to the provider. Called at most once per request key, ever. */
  readonly buy: () => Promise<RetainedPurchase>;
};

const settledStates = new Set(["settled", "linked"]);

export async function purchaseOnce(
  deps: { ledger: PurchaseLedger; store: RetainedPurchaseStore },
  input: PurchaseInput,
): Promise<PurchaseOutcome> {
  const { worldId, requestKey } = input;
  const existing = await deps.ledger.readRequest(worldId, requestKey);

  if (existing && settledStates.has(existing.state)) {
    // Paid for and written down. The only question is whether we still have it.
    const retained = await deps.store.get(requestKey);
    if (retained) return { kind: "bought", bytes: retained.bytes, evidence: retained.evidence, replayed: true, settledFromRetained: false };
    // Settled with nothing kept: buying it again would charge twice for one
    // picture, and pretending it is free would understate the world.
    return { kind: "unresolved", reason: `${requestKey} was paid for and its result was not kept; re-buying would charge twice` };
  }

  if (existing) {
    // A reservation with no settlement. If the bytes and the bill were retained,
    // the call got through and only the last write was lost - settle from what
    // is on disk. Otherwise the dispatch is genuinely unknown.
    const retained = await deps.store.get(requestKey);
    if (retained) {
      await deps.ledger.settle(worldId, requestKey, retained.evidence);
      return { kind: "bought", bytes: retained.bytes, evidence: retained.evidence, replayed: true, settledFromRetained: true };
    }
    const reason = `${requestKey} holds a reservation with nothing retained behind it; the provider may have been billed`;
    await deps.ledger.markUnknown(worldId, requestKey, reason);
    return { kind: "unresolved", reason };
  }

  const reserved = await deps.ledger.reserve(worldId, {
    requestKey, scope: input.scope, operationFingerprint: input.operationFingerprint, reserveMicroUsd: input.reserveMicroUsd,
  });
  if (!reserved.acquired) return { kind: "unresolved", reason: `${requestKey} could not be reserved` };

  let bought: RetainedPurchase;
  try {
    bought = await input.buy();
  } catch (error) {
    // Dispatched and lost. The reservation stays, deliberately: it is the only
    // record that something may have been spent here.
    const reason = `${requestKey} failed after dispatch: ${error instanceof Error ? error.message : String(error)}`;
    await deps.ledger.markUnknown(worldId, requestKey, reason);
    return { kind: "unresolved", reason };
  }

  // Bytes and bill together, BEFORE the ledger is settled. This is the whole
  // recovery story: after this line an interruption costs a restart, not a
  // second purchase.
  await deps.store.put(requestKey, bought);
  await deps.ledger.settle(worldId, requestKey, bought.evidence);
  return { kind: "bought", bytes: bought.bytes, evidence: bought.evidence, replayed: false, settledFromRetained: false };
}
