import { createHash } from "node:crypto";
import type { WorldBudgetRequest, WorldChargeEvidence, WorldBudgetScope } from "./world-budget";

/**
 * One purchase that survives being interrupted, and never answers with somebody
 * else's picture.
 *
 * The scripts did reserve → call → settle and kept the bytes afterwards. That
 * leaves two windows where money moves and nothing is left to show for it:
 *
 *   reserve ──► call ──► [A] ──► retain ──► [B] ──► settle
 *
 * At **A** the provider has been paid and the process dies before anything is
 * written down. At **B** the bytes exist, the ledger still says pending, and a
 * naive restart buys the same picture again. So the retained record carries the
 * bytes AND the bill, written as one thing before the ledger settles: a restart
 * after B settles from what was retained; a restart after A refuses, because an
 * unknown charge is not a free one.
 *
 * THE SECOND HALF, and the more dangerous one: a replay has to prove it is
 * replaying the same operation. A first version keyed only on
 * `(worldId, requestKey)` and returned whatever was retained there, so a request
 * whose fingerprint had changed - a different photograph, a different prompt, a
 * different crop - got the previous result handed back as if it were its own.
 * That is not "avoiding a duplicate purchase"; on a product that draws children,
 * it is answering with the wrong child.
 *
 * Every replay therefore checks four things against the authoritative ledger row
 * and the retained envelope: same world, same request, same operation
 * fingerprint, same scope - plus the payload digest and the bill. Anything that
 * does not line up is `unresolved`: a thing for a person to reconcile, never a
 * silent replay and never an automatic second purchase.
 */

export const RETAINED_PURCHASE_VERSION = "retained-purchase/v1";

/**
 * What a retained purchase keeps. Enough to prove, later and by itself, which
 * operation it belongs to - not just what came back.
 */
export type RetainedPurchase = {
  readonly version: typeof RETAINED_PURCHASE_VERSION;
  readonly worldId: string;
  readonly requestKey: string;
  readonly scope: WorldBudgetScope;
  readonly operationFingerprint: string;
  /** Of `bytes`, so a swapped payload is caught even when the receipt matches. */
  readonly payloadSha256: string;
  readonly evidence: WorldChargeEvidence;
  readonly bytes: Buffer;
};

export const retainedPayloadDigest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/**
 * The world is part of the address, not a caller convention.
 *
 * The ledger is keyed on `(worldId, requestKey)` and the store was keyed on the
 * request alone, so two worlds using the same hide id shared one slot and the
 * second overwrote the first. Both take the world here, so the mistake cannot be
 * made from the outside.
 */
export interface RetainedPurchaseStore {
  put(worldId: string, requestKey: string, value: RetainedPurchase): Promise<void>;
  get(worldId: string, requestKey: string): Promise<RetainedPurchase | null>;
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
  /**
   * Somebody else holds this reservation and has not come back yet. Nothing is
   * dispatched and NOTHING IS MARKED: a healthy worker still waiting on a
   * provider is not a lost dispatch, and calling it one can hold a whole world.
   * Deciding a lease is dead belongs to whoever owns the lease.
   */
  | { kind: "in-progress"; reason: string }
  /** A charge that may have happened, or a mismatch. Never auto-retried. */
  | { kind: "unresolved"; reason: string };

export type PurchaseInput = {
  readonly worldId: string;
  readonly requestKey: string;
  readonly scope: WorldBudgetScope;
  /** Everything that decides what is being bought. A different one is a different purchase. */
  readonly operationFingerprint: string;
  readonly reserveMicroUsd: number;
  /** Dispatches to the provider. Called at most once per request key, ever. */
  readonly buy: () => Promise<{ bytes: Buffer; evidence: WorldChargeEvidence }>;
};

const settledStates = new Set(["settled", "linked"]);
const sameBill = (a: WorldChargeEvidence, b: WorldChargeEvidence) =>
  a.providerRequestId === b.providerRequestId && a.usageId === b.usageId && a.providerNamespace === b.providerNamespace;

/** Why this retained record is not this request's, or null when it is. */
function envelopeMismatch(retained: RetainedPurchase, input: PurchaseInput): string | null {
  if (retained.version !== RETAINED_PURCHASE_VERSION) return `retained record is ${retained.version}, not ${RETAINED_PURCHASE_VERSION}`;
  if (retained.worldId !== input.worldId) return `retained record belongs to world ${retained.worldId}`;
  if (retained.requestKey !== input.requestKey) return `retained record belongs to request ${retained.requestKey}`;
  if (retained.scope !== input.scope) return `retained record is scope ${retained.scope}, this request is ${input.scope}`;
  if (retained.operationFingerprint !== input.operationFingerprint) return "retained record is a different operation: the inputs changed";
  if (retainedPayloadDigest(retained.bytes) !== retained.payloadSha256) return "retained bytes do not match their own digest";
  return null;
}

/** Why the ledger row is not this request's, or null when it is. */
function requestMismatch(existing: WorldBudgetRequest, input: PurchaseInput): string | null {
  if (existing.scope !== input.scope) return `the ledger holds scope ${existing.scope}, this request is ${input.scope}`;
  if (existing.operationFingerprint !== input.operationFingerprint) return "the ledger holds a different operation under this key: the inputs changed";
  return null;
}

export async function purchaseOnce(
  deps: { ledger: PurchaseLedger; store: RetainedPurchaseStore },
  input: PurchaseInput,
): Promise<PurchaseOutcome> {
  const { worldId, requestKey } = input;
  const existing = await deps.ledger.readRequest(worldId, requestKey);

  if (existing) {
    // Before anything is replayed or reconciled: is this even the same purchase?
    // `WorldBudget.reserve` makes this comparison, and the replay branches used
    // to return before ever reaching it.
    const wrong = requestMismatch(existing, input);
    if (wrong) return { kind: "unresolved", reason: `${requestKey}: ${wrong}` };
  }

  const retained = existing ? await deps.store.get(worldId, requestKey) : null;
  if (retained) {
    const wrong = envelopeMismatch(retained, input);
    if (wrong) return { kind: "unresolved", reason: `${requestKey}: ${wrong}` };
  }

  if (existing && settledStates.has(existing.state)) {
    const bill = (existing as Extract<WorldBudgetRequest, { state: "settled" }>).evidence;
    if (!retained) {
      // Paid for and not kept. Buying again would charge twice for one picture;
      // calling it free would understate the world.
      return { kind: "unresolved", reason: `${requestKey} was paid for and its result was not kept; re-buying would charge twice` };
    }
    // The retained receipt is compared with the bill the ledger actually holds,
    // rather than trusted because it was sitting in the right slot.
    if (!sameBill(retained.evidence, bill)) {
      return { kind: "unresolved", reason: `${requestKey}: the retained result carries a different receipt (${retained.evidence.providerRequestId}) than the settled charge (${bill.providerRequestId})` };
    }
    return { kind: "bought", bytes: retained.bytes, evidence: retained.evidence, replayed: true, settledFromRetained: false };
  }

  if (existing) {
    // A reservation with no settlement.
    if (retained) {
      // The call got through and only the last write was lost: settle from what
      // is on disk rather than paying again.
      await deps.ledger.settle(worldId, requestKey, retained.evidence);
      return { kind: "bought", bytes: retained.bytes, evidence: retained.evidence, replayed: true, settledFromRetained: true };
    }
    // Nothing retained. This is EITHER a worker still waiting on its provider OR
    // a dispatch that was lost - and from here the two look identical, so it
    // says so instead of guessing. Marking it unknown on a guess can hold an
    // entire world while a healthy call is still in flight.
    return { kind: "in-progress", reason: `${requestKey} is reserved with nothing retained yet: either still in flight, or a dispatch that was lost` };
  }

  const reserved = await deps.ledger.reserve(worldId, {
    requestKey, scope: input.scope, operationFingerprint: input.operationFingerprint, reserveMicroUsd: input.reserveMicroUsd,
  });
  if (!reserved.acquired) return { kind: "in-progress", reason: `${requestKey} is held by another worker` };

  let bought: { bytes: Buffer; evidence: WorldChargeEvidence };
  try {
    bought = await input.buy();
  } catch (error) {
    // Dispatched and lost by this worker, which DOES know its own call failed.
    const reason = `${requestKey} failed after dispatch: ${error instanceof Error ? error.message : String(error)}`;
    await deps.ledger.markUnknown(worldId, requestKey, reason);
    return { kind: "unresolved", reason };
  }

  // Bytes, bill and the identity of the operation, together, BEFORE the ledger
  // is settled. After this line an interruption costs a restart, not a second
  // purchase - and the record can prove whose purchase it was.
  await deps.store.put(worldId, requestKey, {
    version: RETAINED_PURCHASE_VERSION, worldId, requestKey, scope: input.scope,
    operationFingerprint: input.operationFingerprint,
    payloadSha256: retainedPayloadDigest(bought.bytes), evidence: bought.evidence, bytes: bought.bytes,
  });
  await deps.ledger.settle(worldId, requestKey, bought.evidence);
  return { kind: "bought", bytes: bought.bytes, evidence: bought.evidence, replayed: false, settledFromRetained: false };
}

/**
 * Give up on a reservation this caller knows is abandoned.
 *
 * Separate from `purchaseOnce` on purpose: only whoever owns the lease can tell
 * a dead worker from a slow provider, and the conservative unknown-charge mark
 * is destructive enough that guessing is worse than waiting.
 */
export async function abandonReservation(ledger: PurchaseLedger, worldId: string, requestKey: string, reason: string): Promise<void> {
  await ledger.markUnknown(worldId, requestKey, `${requestKey} abandoned: ${reason}; the provider may have been billed`);
}
