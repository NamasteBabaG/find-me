import { createHash } from "node:crypto";
import type { WorldChargeEvidence, WorldBudgetScope } from "./world-budget";

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
  /**
   * `null` when the provider answered but its charge cannot be stated - no
   * usage, or a model with no rate. The bytes were still paid for, so they are
   * kept; what must not happen is settling an amount nobody can support, which
   * records a guess as an invoice and reads as free.
   */
  readonly evidence: WorldChargeEvidence | null;
  readonly unknownReason: string | null;
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

/**
 * A store saying no, and whether saying it again would help.
 *
 * `permanent` means the RECORD is unusable and no retry changes that - a bill
 * this store cannot hold, a payload too large. Everything else (a database that
 * did not answer, a concurrent writer) is transient and must not be mistaken for
 * it: treating a blip as permanent would hold a world over nothing.
 *
 * Declared here, beside the interface, so a caller can tell the two apart
 * without knowing which store it is talking to.
 */
export class RetainedPurchaseRefused extends Error {
  constructor(message: string, readonly permanent: boolean) {
    super(message);
    this.name = "RetainedPurchaseRefused";
  }
}
