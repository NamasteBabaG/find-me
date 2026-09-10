import {
  auditWorldBudget, WorldBudgetError, validateWorldUnknownContinuationApprovals, validateUnknownContinuationApproval,
  type WorldBudgetRepository, type WorldBudgetRequest, type WorldBudgetSnapshot, type WorldBudgetTransaction,
} from "../../services/generation/world-budget";

export interface VersionedWorldBudgetSnapshot {
  /** Monotonic, non-reused safe integer. The initial persisted revision is 0. */
  revision: number;
  snapshot: WorldBudgetSnapshot;
}

/**
 * Storage boundary, NOT an implemented database/durability guarantee.
 *
 * A concrete store must provide linearizable primary reads and atomic,
 * durable conditional writes across independent processes/workers. A true
 * result means the complete write committed durably before it was returned.
 * False means a confirmed conflict AND no write by this operation. An exception
 * can mean an unknown commit outcome and must never be converted to false.
 *
 * Never delete/recreate a live world row, reuse a revision, or reset its ledger:
 * those create an ABA race and can renew an already-spent world allowance.
 * Snapshots include ALL scopes/requests for a world in one atomic record.
 * No process mutex, JSON file or test fake establishes production durability.
 */
export interface AtomicWorldBudgetStore {
  read(worldId: string): Promise<VersionedWorldBudgetSnapshot | null>;
  /** Atomically insert nextSnapshot at revision 0 iff worldId does not exist. */
  insertIfAbsent(worldId: string, nextSnapshot: WorldBudgetSnapshot): Promise<boolean>;
  /** Atomically replace snapshot AND increment revision by 1 iff it matches. */
  compareAndSwap(worldId: string, expectedRevision: number, nextSnapshot: WorldBudgetSnapshot): Promise<boolean>;
}

export type WorldBudgetRepositoryErrorCode = "invalid_store" | "invalid_transaction" | "transaction_closed" | "conflict_exhausted";
export class WorldBudgetRepositoryError extends Error {
  constructor(readonly code: WorldBudgetRepositoryErrorCode, message: string) { super(message); this.name = "WorldBudgetRepositoryError"; }
}
export const WORLD_BUDGET_CAS_DEFAULT_ATTEMPTS = 8;
const MAX_ATTEMPTS = 32;
function fail(code: WorldBudgetRepositoryErrorCode, message: string): never { throw new WorldBudgetRepositoryError(code, message); }
function validWorldId(worldId: string) {
  if (typeof worldId !== "string" || !worldId.trim()) fail("invalid_transaction", "A nonempty world ID is required");
}
function snapshotShape(snapshot: WorldBudgetSnapshot, worldId: string) {
  if (!snapshot || typeof snapshot !== "object" || snapshot.worldId !== worldId || !Array.isArray(snapshot.requests)) fail("invalid_store", "Budget snapshot does not belong to the requested world or lacks its complete request list");
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}

/**
 * Validate every row/link and global uniqueness BEFORE aggregate arithmetic.
 * The budget service deliberately persists a valid external bill even when
 * the aggregate exceeds safe-integer precision, then throws outside commit.
 * Catching overflow on the first full audit alone would miss invalid later rows.
 */
function validateCommitSnapshot(snapshot: WorldBudgetSnapshot, worldId: string) {
  snapshotShape(snapshot, worldId);
  validateWorldUnknownContinuationApprovals(snapshot);
  const keys = new Set<string>(), canonicalCharges = new Set<string>();
  for (const request of snapshot.requests) {
    if (!request || typeof request !== "object") fail("invalid_transaction", "Invalid request row");
    const canonical = request.state === "linked" ? snapshot.requests.find(item => item.requestKey === request.canonicalRequestKey) : undefined;
    if (request.state === "linked" && (!canonical || canonical.state !== "settled")) fail("invalid_transaction", "Linked request must reference a canonical settled charge");
    auditWorldBudget({ worldId, requests: canonical ? [canonical, request] : [request] });
    if (canonical && (canonical.scope !== request.scope || canonical.operationFingerprint !== request.operationFingerprint)) fail("invalid_transaction", "Linked receipt must belong to the same operation scope and fingerprint");
    if (keys.has(request.requestKey)) fail("invalid_transaction", "Duplicate request key in staged snapshot");
    keys.add(request.requestKey);
    if (request.state === "settled") {
      const id = JSON.stringify([request.evidence.providerNamespace, request.evidence.providerRequestId]);
      if (canonicalCharges.has(id)) fail("invalid_transaction", "Duplicate canonical provider request in staged snapshot");
      canonicalCharges.add(id);
    }
  }
  try { auditWorldBudget(snapshot); }
  catch (error) {
    // Each bill remains an exact safe integer; the full sum is unrepresentable.
    // Preserve those validated bills. Future normal transactions fail closed
    // at their entry audit until a separate reconciliation path handles them.
    if (!(error instanceof WorldBudgetError && error.code === "arithmetic_overflow")) throw error;
  }
}

/**
 * Optimistic serializable snapshot adapter, conditional on the store contract.
 * No HTTP or non-replayable side effects may occur inside work(). Only the
 * result of a successful durable commit may escape a writing transaction.
 * A read-only transaction linearizes at its store read and needs no CAS write.
 */
export class CasWorldBudgetRepository implements WorldBudgetRepository {
  private readonly maxAttempts: number;
  constructor(private readonly store: AtomicWorldBudgetStore, options: { maxAttempts?: number } = {}) {
    this.maxAttempts = options.maxAttempts ?? WORLD_BUDGET_CAS_DEFAULT_ATTEMPTS;
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1 || this.maxAttempts > MAX_ATTEMPTS) fail("invalid_transaction", `CAS attempts must be an integer from 1 to ${MAX_ATTEMPTS}`);
  }

  async transactWorld<T>(worldId: string, work: (tx: WorldBudgetTransaction) => Promise<T>): Promise<T> {
    validWorldId(worldId);
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      // Store exceptions are intentionally not retried: a lost acknowledgement
      // after commit is not evidence that the write or request did not happen.
      const stored = await this.store.read(worldId);
      if (stored !== null && (!stored || !Number.isSafeInteger(stored.revision) || stored.revision < 0)) fail("invalid_store", "Store returned an invalid revision");
      const revision = stored === null ? null : stored.revision;
      const original = stored === null ? { worldId, requests: [] } : structuredClone(stored.snapshot);
      snapshotShape(original, worldId);
      auditWorldBudget(original);
      const rows: WorldBudgetRequest[] = [...structuredClone(original.requests)];
      const approvals = [...structuredClone(original.unknownContinuationApprovals ?? [])];
      let active = true, changed = false;
      const assertActive = () => { if (!active) fail("transaction_closed", "Transaction callback has finished; escaped writes are forbidden"); };
      const tx: WorldBudgetTransaction = {
        snapshot: freeze(structuredClone(original)),
        createRequest: async incoming => {
          assertActive();
          const request = structuredClone(incoming);
          if (rows.some(item => item.requestKey === request.requestKey)) fail("invalid_transaction", "Request key already exists");
          rows.push(request); changed = true;
        },
        updateRequest: async (requestKey, incoming) => {
          assertActive();
          const request = structuredClone(incoming), index = rows.findIndex(item => item.requestKey === requestKey);
          if (index < 0 || request.requestKey !== requestKey) fail("invalid_transaction", "Cannot update an absent request or change its key");
          const previous = rows[index]!;
          if (previous.scope !== request.scope || previous.operationFingerprint !== request.operationFingerprint || previous.reserveMicroUsd !== request.reserveMicroUsd || previous.origin !== request.origin) fail("invalid_transaction", "Immutable reservation metadata cannot change");
          rows[index] = request; changed = true;
        },
        appendUnknownContinuationApproval: async incoming => {
          assertActive();
          const approval = structuredClone(incoming); validateUnknownContinuationApproval(approval);
          if (approvals.some(a => a.approvalId === approval.approvalId)) fail("invalid_transaction", "Continuation approval IDs are append-only and unique");
          const request = rows.find(r => r.requestKey === approval.requestKey);
          if (!request || request.state !== "unknown" || request.conflicts.length || JSON.stringify(request.unknownReasons) !== JSON.stringify(approval.unknownReasons)) fail("invalid_transaction", "Continuation must authorize an existing exact unknown request");
          validateWorldUnknownContinuationApprovals({ worldId, requests: rows, unknownContinuationApprovals: [...approvals, approval] });
          approvals.push(approval); changed = true;
        },
      };
      let result: T;
      try { result = await work(tx); }
      finally { active = false; }
      if (!changed) return result;
      const next: WorldBudgetSnapshot = { worldId, requests: rows,
        ...(original.unknownContinuationApprovals !== undefined || approvals.length ? { unknownContinuationApprovals: approvals } : {}) };
      validateCommitSnapshot(next, worldId);
      if (revision === Number.MAX_SAFE_INTEGER) fail("invalid_store", "Revision cannot be incremented safely; no commit attempted");
      // Separate commit clone prevents a store retaining/mutating caller-owned
      // objects. Do NOT clone result: it may carry a WorldBudgetError instance.
      const committed = revision === null
        ? await this.store.insertIfAbsent(worldId, structuredClone(next))
        : await this.store.compareAndSwap(worldId, revision, structuredClone(next));
      if (committed === true) return result;
      if (committed !== false) fail("invalid_store", "Store must return an explicit true commit or false conflict");
      // Only a confirmed conflict permits a fresh read and callback replay.
      // The losing callback result, including acquired:true, is discarded.
    }
    return fail("conflict_exhausted", `World budget CAS failed after ${this.maxAttempts} confirmed conflicts; no dispatch permission returned`);
  }
}
