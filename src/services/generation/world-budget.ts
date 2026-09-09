/**
 * Request-level world budget. No HTTP, database adapter, retries or cancellation.
 * All amounts are integer micro-USD: 1 USD = 1,000,000 micro-USD.
 *
 * This is NOT a production atomicity claim. An adapter must implement the
 * serializable/durable transaction contract below before callers may rely on it.
 */
export const WORLD_BUDGET_CAP_MICRO_USD = 5_000_000;
export const WORLD_BUDGET_SCOPES = ["identity", "sheet", "image", "judge", "repair"] as const;
export type WorldBudgetScope = typeof WORLD_BUDGET_SCOPES[number];
export type BudgetJson = null | boolean | number | string | readonly BudgetJson[] | { readonly [key: string]: BudgetJson };

export interface WorldChargeEvidence {
  /** Provider AND billing account/project namespace; never a credential. */
  providerNamespace: string;
  providerRequestId: string;
  /** Stable receipt/usage hash, not a new random ID on each reconciliation. */
  usageId: string;
  rawUsage: BudgetJson;
  model: string;
  amountMicroUsd: number;
  /** An upper estimate is retained as an estimate, not presented as an invoice. */
  costBasis: "provider-billed" | "conservative-upper-estimate";
}

export interface WorldReservationInput {
  /** One key per HTTP attempt, reused after a crash; never one key per atlas cell. */
  requestKey: string;
  scope: WorldBudgetScope;
  /** Pins the actual operation: model/settings, prompt and input identities. */
  operationFingerprint: string;
  reserveMicroUsd: number;
}

interface RequestBase extends WorldReservationInput {
  origin: "reserved" | "imported";
  unknownReasons: readonly string[];
  /** Conflicting external evidence is retained and holds the world for reconciliation. */
  conflicts: readonly { reason: string; evidence: WorldChargeEvidence }[];
}

export type WorldBudgetRequest = RequestBase & (
  | { state: "pending" | "unknown" }
  | { state: "settled"; evidence: WorldChargeEvidence }
  | { state: "linked"; evidence: WorldChargeEvidence; canonicalRequestKey: string }
);

export interface WorldBudgetSnapshot {
  worldId: string;
  requests: readonly WorldBudgetRequest[];
}

export interface WorldBudgetTransaction {
  /** Complete, isolated snapshot for this world at transaction start. */
  readonly snapshot: WorldBudgetSnapshot;
  createRequest(request: WorldBudgetRequest): Promise<void>;
  updateRequest(requestKey: string, request: WorldBudgetRequest): Promise<void>;
}

export interface WorldBudgetRepository {
  /**
   * MUST serialize all transactions for one world, across processes/workers,
   * including phantom inserts, imports and settlements; commit every write
   * durably before resolving, and roll back all writes when the callback throws.
   * An empty world has an empty snapshot, created inside this same transaction.
   * Enforce unique (worldId, requestKey) and one canonical settled charge per
   * (worldId, providerNamespace, providerRequestId). "linked" rows are aliases.
   *
   * Callback replay after serialization failure is allowed: it performs no HTTP.
   * Process-local mutexes or read/write JSON files are NOT sufficient adapters.
   */
  transactWorld<T>(worldId: string, work: (tx: WorldBudgetTransaction) => Promise<T>): Promise<T>;
}

export type WorldBudgetErrorCode = "invalid_input" | "invalid_snapshot" | "arithmetic_overflow" | "key_conflict" | "request_missing" | "world_held" | "cap_exceeded" | "evidence_conflict";
export class WorldBudgetError extends Error {
  constructor(readonly code: WorldBudgetErrorCode, message: string) { super(message); this.name = "WorldBudgetError"; }
}

export interface WorldBudgetAudit {
  worldId: string;
  capMicroUsd: number;
  settledMicroUsd: number;
  /** Includes every pending AND unknown reservation, without expiration. */
  reservedMicroUsd: number;
  committedMicroUsd: number;
  remainingMicroUsd: number;
  overCapMicroUsd: number;
  held: boolean;
  canReserve: boolean;
  state: "open" | "held" | "exhausted";
  pendingRequestKeys: string[];
  unknownRequestKeys: string[];
  overrunRequestKeys: string[];
  conflictRequestKeys: string[];
  linkedRequestKeys: string[];
  byScope: Record<WorldBudgetScope, { settledMicroUsd: number; reservedMicroUsd: number }>;
}

const IMPORT_PREFIX = "@import/";
const fail = (code: WorldBudgetErrorCode, message: string): never => { throw new WorldBudgetError(code, message); };
function nonempty(value: string, label: string) {
  if (typeof value !== "string" || !value.trim()) fail("invalid_input", `${label} must be a nonempty string`);
}
function money(value: number, label: string, allowZero = true) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) fail("invalid_input", `${label} must be a ${allowZero ? "nonnegative" : "positive"} safe integer in micro-USD`);
}
function add(a: number, b: number) {
  const value = a + b;
  if (!Number.isSafeInteger(value)) fail("arithmetic_overflow", "Budget arithmetic exceeds safe integer precision; reconcile persisted request evidence before continuing");
  return value;
}
function scope(value: WorldBudgetScope) {
  if (!(WORLD_BUDGET_SCOPES as readonly string[]).includes(value)) fail("invalid_input", "Unknown budget scope");
}
/** Canonical JSON also rejects NaN, undefined, cyclic or non-JSON usage evidence. */
function json(value: BudgetJson, seen = new Set<object>()): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== "object" || value === null || seen.has(value)) return fail("invalid_input", "Usage evidence must be finite, acyclic JSON");
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return fail("invalid_input", "Usage evidence must be plain JSON");
  seen.add(value);
  const result = Array.isArray(value)
    ? `[${value.map(item => json(item, seen)).join(",")}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${json((value as { [key: string]: BudgetJson })[key]!, seen)}`).join(",")}}`;
  seen.delete(value);
  return result;
}
function evidence(value: WorldChargeEvidence) {
  nonempty(value.providerNamespace, "providerNamespace"); nonempty(value.providerRequestId, "providerRequestId");
  nonempty(value.usageId, "usageId"); nonempty(value.model, "model"); money(value.amountMicroUsd, "amountMicroUsd");
  if (value.costBasis !== "provider-billed" && value.costBasis !== "conservative-upper-estimate") fail("invalid_input", "An explicit cost basis is required");
  if (value.rawUsage === null || typeof value.rawUsage !== "object" || Array.isArray(value.rawUsage) || Object.keys(value.rawUsage).length === 0) fail("invalid_input", "Nonempty raw usage evidence is required to settle; otherwise mark unknown");
  json(value.rawUsage);
}
function chargeIdentity(value: WorldChargeEvidence) { return JSON.stringify([value.providerNamespace, value.providerRequestId]); }
function sameEvidence(a: WorldChargeEvidence, b: WorldChargeEvidence) { return json(a as unknown as BudgetJson) === json(b as unknown as BudgetJson); }
function snapshotWith(snapshot: WorldBudgetSnapshot, request: WorldBudgetRequest): WorldBudgetSnapshot {
  return { worldId: snapshot.worldId, requests: [...snapshot.requests.filter(item => item.requestKey !== request.requestKey), request] };
}

/** Pure audit; corrupt/duplicate canonical rows fail closed instead of undercounting. */
export function auditWorldBudget(snapshot: WorldBudgetSnapshot): WorldBudgetAudit {
  nonempty(snapshot.worldId, "worldId");
  const byScope = Object.fromEntries(WORLD_BUDGET_SCOPES.map(item => [item, { settledMicroUsd: 0, reservedMicroUsd: 0 }])) as WorldBudgetAudit["byScope"];
  const pendingRequestKeys: string[] = [], unknownRequestKeys: string[] = [], overrunRequestKeys: string[] = [], conflictRequestKeys: string[] = [], linkedRequestKeys: string[] = [];
  let settledMicroUsd = 0, reservedMicroUsd = 0;
  const keys = new Set<string>(), charges = new Set<string>();
  for (const request of snapshot.requests) {
    nonempty(request.requestKey, "requestKey"); nonempty(request.operationFingerprint, "operationFingerprint"); scope(request.scope);
    if (keys.has(request.requestKey)) fail("invalid_snapshot", "Duplicate request key in world snapshot");
    keys.add(request.requestKey);
    if (request.origin !== "reserved" && request.origin !== "imported") fail("invalid_snapshot", "Invalid request origin");
    money(request.reserveMicroUsd, "reserveMicroUsd", request.origin === "imported");
    if (request.origin === "imported" && (request.reserveMicroUsd !== 0 || request.state !== "settled")) fail("invalid_snapshot", "Imported requests must be settled with no fabricated reservation");
    if (!Array.isArray(request.unknownReasons) || !Array.isArray(request.conflicts)) fail("invalid_snapshot", "Missing audit history");
    request.unknownReasons.forEach(reason => nonempty(reason, "unknown reason"));
    for (const conflict of request.conflicts) { nonempty(conflict.reason, "conflict reason"); evidence(conflict.evidence); }
    if (request.conflicts.length) conflictRequestKeys.push(request.requestKey);
    if (request.state === "pending" || request.state === "unknown") {
      (request.state === "pending" ? pendingRequestKeys : unknownRequestKeys).push(request.requestKey);
      if (request.state === "unknown" && !request.unknownReasons.length) fail("invalid_snapshot", "Unknown request requires a reason");
      reservedMicroUsd = add(reservedMicroUsd, request.reserveMicroUsd);
      byScope[request.scope].reservedMicroUsd = add(byScope[request.scope].reservedMicroUsd, request.reserveMicroUsd);
    } else if (request.state === "settled" || request.state === "linked") {
      evidence(request.evidence);
      if (request.origin === "reserved" && request.evidence.amountMicroUsd > request.reserveMicroUsd) overrunRequestKeys.push(request.requestKey);
      if (request.state === "linked") {
        const canonical = snapshot.requests.find(item => item.requestKey === request.canonicalRequestKey);
        if (!canonical || canonical.state !== "settled" || !sameEvidence(canonical.evidence, request.evidence)) fail("invalid_snapshot", "Linked request lacks an identical canonical settled charge");
        linkedRequestKeys.push(request.requestKey);
      } else {
        const id = chargeIdentity(request.evidence);
        if (charges.has(id)) fail("invalid_snapshot", "Duplicate canonical provider request charge");
        charges.add(id);
        settledMicroUsd = add(settledMicroUsd, request.evidence.amountMicroUsd);
        byScope[request.scope].settledMicroUsd = add(byScope[request.scope].settledMicroUsd, request.evidence.amountMicroUsd);
      }
    } else fail("invalid_snapshot", "Invalid request state");
  }
  const committedMicroUsd = add(settledMicroUsd, reservedMicroUsd);
  const overCapMicroUsd = Math.max(0, committedMicroUsd - WORLD_BUDGET_CAP_MICRO_USD);
  const remainingMicroUsd = Math.max(0, WORLD_BUDGET_CAP_MICRO_USD - committedMicroUsd);
  const held = Boolean(unknownRequestKeys.length || overrunRequestKeys.length || conflictRequestKeys.length || overCapMicroUsd);
  return { worldId: snapshot.worldId, capMicroUsd: WORLD_BUDGET_CAP_MICRO_USD, settledMicroUsd, reservedMicroUsd, committedMicroUsd, remainingMicroUsd, overCapMicroUsd, held, canReserve: !held && remainingMicroUsd > 0, state: held ? "held" : remainingMicroUsd === 0 ? "exhausted" : "open", pendingRequestKeys, unknownRequestKeys, overrunRequestKeys, conflictRequestKeys, linkedRequestKeys, byScope };
}

export interface WorldBudgetResult { request: WorldBudgetRequest; audit: WorldBudgetAudit }
export interface WorldReserveResult extends WorldBudgetResult {
  /** ONLY true grants permission for one HTTP attempt. False never grants retry permission. */
  acquired: boolean;
}

export class WorldBudget {
  constructor(private readonly repository: WorldBudgetRepository) {}

  private transact<T>(worldId: string, work: (tx: WorldBudgetTransaction) => Promise<T>) {
    nonempty(worldId, "worldId");
    return this.repository.transactWorld(worldId, async tx => {
      if (tx.snapshot.worldId !== worldId) fail("invalid_snapshot", "Repository returned the wrong world");
      auditWorldBudget(tx.snapshot);
      return work(tx);
    });
  }

  async audit(worldId: string): Promise<WorldBudgetAudit> { return this.transact(worldId, async tx => auditWorldBudget(tx.snapshot)); }

  /** Read-only binding check for durable generation checkpoints; never renews a reservation. */
  async readRequest(worldId: string, requestKey: string): Promise<WorldBudgetRequest | null> {
    nonempty(requestKey, "requestKey");
    return this.transact(worldId, async tx => structuredClone(tx.snapshot.requests.find(request => request.requestKey === requestKey) ?? null));
  }

  async reserve(worldId: string, input: WorldReservationInput): Promise<WorldReserveResult> {
    nonempty(input.requestKey, "requestKey"); nonempty(input.operationFingerprint, "operationFingerprint"); scope(input.scope); money(input.reserveMicroUsd, "reserveMicroUsd", false);
    if (input.requestKey.startsWith(IMPORT_PREFIX)) fail("invalid_input", "Reserved import key prefix");
    // Clone caller data before awaiting storage: mutable inputs cannot change a reservation.
    input = structuredClone(input);
    return this.transact(worldId, async tx => {
      const existing = tx.snapshot.requests.find(item => item.requestKey === input.requestKey);
      const audit = auditWorldBudget(tx.snapshot);
      if (existing) {
        if (existing.origin !== "reserved" || existing.scope !== input.scope || existing.operationFingerprint !== input.operationFingerprint || existing.reserveMicroUsd !== input.reserveMicroUsd) fail("key_conflict", "Request key already pins different operation inputs or reservation");
        return { acquired: false, request: structuredClone(existing), audit };
      }
      if (audit.held) fail("world_held", "World has unresolved cost, overrun or conflicting evidence; no new request may dispatch");
      if (input.reserveMicroUsd > audit.remainingMicroUsd) fail("cap_exceeded", "Reservation exceeds the five-dollar world budget");
      const request: WorldBudgetRequest = { ...input, origin: "reserved", state: "pending", unknownReasons: [], conflicts: [] };
      const nextAudit = auditWorldBudget(snapshotWith(tx.snapshot, request));
      await tx.createRequest(structuredClone(request));
      return { acquired: true, request, audit: nextAudit };
    });
  }

  async markUnknown(worldId: string, requestKey: string, reason: string): Promise<WorldBudgetResult> {
    nonempty(requestKey, "requestKey"); nonempty(reason, "reason");
    return this.transact(worldId, async tx => {
      const existing = tx.snapshot.requests.find(item => item.requestKey === requestKey);
      if (!existing) return fail("request_missing", "Cannot mark an unreserved request unknown");
      // A late timeout/error cannot reopen a successfully settled request.
      if (existing.state === "settled" || existing.state === "linked") return { request: structuredClone(existing), audit: auditWorldBudget(tx.snapshot) };
      const request: WorldBudgetRequest = { ...existing, state: "unknown", unknownReasons: [...new Set([...existing.unknownReasons, reason])] };
      await tx.updateRequest(requestKey, structuredClone(request));
      return { request, audit: auditWorldBudget(snapshotWith(tx.snapshot, request)) };
    });
  }

  private async conflict(tx: WorldBudgetTransaction, request: WorldBudgetRequest, incoming: WorldChargeEvidence, reason: string) {
    const conflicts = request.conflicts.some(item => sameEvidence(item.evidence, incoming)) ? request.conflicts : [...request.conflicts, { reason, evidence: incoming }];
    await tx.updateRequest(request.requestKey, structuredClone({ ...request, conflicts }));
    // Return the error; throwing inside the transaction would roll back the hold.
    return { error: new WorldBudgetError("evidence_conflict", reason) };
  }

  private async persistCharge(tx: WorldBudgetTransaction, request: WorldBudgetRequest, create: boolean) {
    if (create) await tx.createRequest(structuredClone(request));
    else await tx.updateRequest(request.requestKey, structuredClone(request));
    try { return { result: { request, audit: auditWorldBudget(snapshotWith(tx.snapshot, request)) } }; }
    catch (error) {
      // Each external amount may be a valid safe integer while their sum is not.
      // Keep the exact per-request bill, commit, then fail closed outside this
      // transaction. Subsequent audits/reservations also fail closed; never
      // revert to a smaller pending reservation or manufacture a numeric total.
      if (error instanceof WorldBudgetError && error.code === "arithmetic_overflow") return { error };
      throw error;
    }
  }

  /** Missing/invalid response evidence must be followed by markUnknown, never a retry. */
  async settle(worldId: string, requestKey: string, incoming: WorldChargeEvidence): Promise<WorldBudgetResult> {
    nonempty(requestKey, "requestKey"); evidence(incoming); incoming = structuredClone(incoming);
    const outcome = await this.transact(worldId, async tx => {
      const existing = tx.snapshot.requests.find(item => item.requestKey === requestKey);
      if (!existing) return fail("request_missing", "Reserve before dispatch; use importSettled for already-billed external requests");
      if (existing.state === "settled" || existing.state === "linked") {
        if (!sameEvidence(existing.evidence, incoming)) return this.conflict(tx, existing, incoming, "A settled request cannot be overwritten by different cost, usage or provider evidence");
        return { result: { request: structuredClone(existing), audit: auditWorldBudget(tx.snapshot) } };
      }
      const canonical = tx.snapshot.requests.find(item => item.state === "settled" && chargeIdentity(item.evidence) === chargeIdentity(incoming));
      if (canonical && canonical.state === "settled" && !sameEvidence(canonical.evidence, incoming)) return this.conflict(tx, existing, incoming, "Provider request ID already has conflicting settled evidence");
      if (canonical && (canonical.scope !== existing.scope || canonical.operationFingerprint !== existing.operationFingerprint)) return this.conflict(tx, existing, incoming, "Provider receipt belongs to a different operation scope or fingerprint; reservation remains unresolved");
      const request: WorldBudgetRequest = canonical
        ? { ...existing, state: "linked", evidence: incoming, canonicalRequestKey: canonical.requestKey }
        : { ...existing, state: "settled", evidence: incoming };
      // Persist FULL external cost, even above the reserve or cap. Audit then
      // holds the world; never clamp, substitute zero, or throw away the bill.
      return this.persistCharge(tx, request, false);
    });
    if ("error" in outcome) throw outcome.error;
    return outcome.result;
  }

  /**
   * Imports real prior request evidence, never a new network permission.
   * Atlas consumers reuse the returned canonical key; they do not import a cost
   * per cell. De-duplication is per world + provider/account + request ID.
   */
  async importSettled(worldId: string, input: { scope: WorldBudgetScope; operationFingerprint: string; evidence: WorldChargeEvidence }): Promise<WorldBudgetResult> {
    scope(input.scope); nonempty(input.operationFingerprint, "operationFingerprint"); evidence(input.evidence); input = structuredClone(input);
    const outcome = await this.transact(worldId, async tx => {
      const existing = tx.snapshot.requests.find(item => item.state === "settled" && chargeIdentity(item.evidence) === chargeIdentity(input.evidence));
      if (existing && existing.state === "settled") {
        if (!sameEvidence(existing.evidence, input.evidence)) return this.conflict(tx, existing, input.evidence, "Imported provider request ID conflicts with existing cost or usage");
        if (existing.scope !== input.scope || existing.operationFingerprint !== input.operationFingerprint) return this.conflict(tx, existing, input.evidence, "Imported request metadata must describe the original operation, not a different operation or consuming atlas cell");
        return { result: { request: structuredClone(existing), audit: auditWorldBudget(tx.snapshot) } };
      }
      const request: WorldBudgetRequest = { requestKey: `${IMPORT_PREFIX}${chargeIdentity(input.evidence)}`, origin: "imported", state: "settled", scope: input.scope, operationFingerprint: input.operationFingerprint, reserveMicroUsd: 0, evidence: input.evidence, unknownReasons: [], conflicts: [] };
      // Imports must record already incurred costs even when the world is held
      // or this reveals an exceeded cap. This never authorizes another call.
      return this.persistCharge(tx, request, true);
    });
    if ("error" in outcome) throw outcome.error;
    return outcome.result;
  }
}
