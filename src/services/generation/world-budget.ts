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

/** An operator's explicit permission to continue while retaining one unknown
 * reservation in full. This is NOT provider usage, settlement or retry proof. */
export interface WorldUnknownContinuationApproval extends WorldReservationInput {
  version: "world-unknown-continuation/v1";
  worldId: string;
  approvalId: string;
  unknownReasons: readonly string[];
  operatorId: string;
  authorizationSha256: string;
  authorizedAt: string;
}
export type WorldUnknownContinuationInput = Omit<WorldUnknownContinuationApproval, "version" | "worldId">;
export interface WorldBudgetOptions {
  /** Trusted operator entrypoint supplies this verifier after authenticating the
   * actor/grant. A JSON caller's self-asserted role is not authorization. */
  authorizeUnknownContinuation?: (approval: Readonly<WorldUnknownContinuationApproval>) => Promise<boolean>;
}

export interface WorldBudgetSnapshot {
  worldId: string;
  requests: readonly WorldBudgetRequest[];
  unknownContinuationApprovals?: readonly WorldUnknownContinuationApproval[];
}

export interface WorldBudgetTransaction {
  /** Complete, isolated snapshot for this world at transaction start. */
  readonly snapshot: WorldBudgetSnapshot;
  createRequest(request: WorldBudgetRequest): Promise<void>;
  updateRequest(requestKey: string, request: WorldBudgetRequest): Promise<void>;
  /** Optional for historical/read-only adapters; missing support fails closed. */
  appendUnknownContinuationApproval?(approval: WorldUnknownContinuationApproval): Promise<void>;
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
  return { ...snapshot, requests: [...snapshot.requests.filter(item => item.requestKey !== request.requestKey), request] };
}

export function validateUnknownContinuationApproval(value: WorldUnknownContinuationApproval): void {
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) fail("invalid_input", "A plain continuation approval is required");
  const expected = ["version", "worldId", "approvalId", "requestKey", "scope", "operationFingerprint", "reserveMicroUsd", "unknownReasons", "operatorId", "authorizationSha256", "authorizedAt"].sort();
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(expected) || Object.values(Object.getOwnPropertyDescriptors(value)).some(p => !Object.hasOwn(p, "value"))) fail("invalid_input", "Continuation approval has unexpected fields");
  if (value.version !== "world-unknown-continuation/v1") fail("invalid_input", "Unknown continuation approval version");
  for (const key of ["worldId", "approvalId", "requestKey", "operationFingerprint", "operatorId"] as const) {
    const text = value[key];
    if (typeof text !== "string" || !/^[A-Za-z0-9_:.@/-]{1,500}$/.test(text) || text.includes("://") || /^sk-/i.test(text)) fail("invalid_input", "Continuation approval requires bounded nonsecret identifiers");
  }
  scope(value.scope); money(value.reserveMicroUsd, "reserveMicroUsd", false);
  if (!Array.isArray(value.unknownReasons) || !value.unknownReasons.length || value.unknownReasons.length > 32
    || new Set(value.unknownReasons).size !== value.unknownReasons.length
    || value.unknownReasons.some(reason => typeof reason !== "string" || !reason.trim() || reason.length > 500)) fail("invalid_input", "Exact bounded unknown-reason history is required");
  if (typeof value.authorizationSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.authorizationSha256)) fail("invalid_input", "Explicit operator authorization evidence hash is required");
  if (typeof value.authorizedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.authorizedAt)
    || !Number.isFinite(Date.parse(value.authorizedAt)) || new Date(value.authorizedAt).toISOString() !== value.authorizedAt) fail("invalid_input", "Canonical approval timestamp required");
  json(value as unknown as BudgetJson);
}
/** Validate append-only historical approvals even after their request settles. */
export function validateWorldUnknownContinuationApprovals(snapshot: WorldBudgetSnapshot): void {
  if (snapshot.unknownContinuationApprovals === undefined) return;
  if (!Array.isArray(snapshot.unknownContinuationApprovals) || snapshot.unknownContinuationApprovals.length > 128) fail("invalid_snapshot", "Invalid continuation approval history");
  const ids = new Set<string>();
  for (const approval of snapshot.unknownContinuationApprovals) {
    validateUnknownContinuationApproval(approval);
    const request = snapshot.requests.find(r => r.requestKey === approval.requestKey);
    if (ids.has(approval.approvalId) || approval.worldId !== snapshot.worldId || !request || request.origin !== "reserved"
      || request.scope !== approval.scope || request.operationFingerprint !== approval.operationFingerprint || request.reserveMicroUsd !== approval.reserveMicroUsd
      || !Array.isArray(request.unknownReasons) || approval.unknownReasons.some((reason: string) => !request.unknownReasons.includes(reason))) fail("invalid_snapshot", "Continuation approval no longer binds its original world/request/history");
    ids.add(approval.approvalId);
  }
}
/** Pure exact matching; never converts the request into a known charge. */
export function getMatchingUnknownContinuationApproval(snapshot: WorldBudgetSnapshot, requestKey: string): WorldUnknownContinuationApproval | null {
  validateWorldUnknownContinuationApprovals(snapshot);
  const request = snapshot.requests.find(r => r.requestKey === requestKey);
  if (!request || request.state !== "unknown" || request.conflicts.length) return null;
  const approval = snapshot.unknownContinuationApprovals?.find(a => a.requestKey === requestKey && json(a.unknownReasons) === json(request.unknownReasons));
  return approval ? structuredClone(approval) : null;
}

/** Pure audit; corrupt/duplicate canonical rows fail closed instead of undercounting. */
export function auditWorldBudget(snapshot: WorldBudgetSnapshot): WorldBudgetAudit {
  nonempty(snapshot.worldId, "worldId");
  validateWorldUnknownContinuationApprovals(snapshot);
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
  const held = Boolean(unknownRequestKeys.some(key => !getMatchingUnknownContinuationApproval(snapshot, key)) || overrunRequestKeys.length || conflictRequestKeys.length || overCapMicroUsd);
  return { worldId: snapshot.worldId, capMicroUsd: WORLD_BUDGET_CAP_MICRO_USD, settledMicroUsd, reservedMicroUsd, committedMicroUsd, remainingMicroUsd, overCapMicroUsd, held, canReserve: !held && remainingMicroUsd > 0, state: held ? "held" : remainingMicroUsd === 0 ? "exhausted" : "open", pendingRequestKeys, unknownRequestKeys, overrunRequestKeys, conflictRequestKeys, linkedRequestKeys, byScope };
}

export interface WorldBudgetResult { request: WorldBudgetRequest; audit: WorldBudgetAudit }
export interface WorldReserveResult extends WorldBudgetResult {
  /** ONLY true grants permission for one HTTP attempt. False never grants retry permission. */
  acquired: boolean;
}

export class WorldBudget {
  constructor(private readonly repository: WorldBudgetRepository, private readonly options: WorldBudgetOptions = {}) {}

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

  async readContinuationApproval(worldId: string, requestKey: string): Promise<WorldUnknownContinuationApproval | null> {
    nonempty(requestKey, "requestKey");
    return this.transact(worldId, async tx => getMatchingUnknownContinuationApproval(tx.snapshot, requestKey));
  }

  async authorizeUnknownContinuation(worldId: string, input: WorldUnknownContinuationInput): Promise<{ acquired: boolean; approval: WorldUnknownContinuationApproval; audit: WorldBudgetAudit }> {
    const approval: WorldUnknownContinuationApproval = { ...input, version: "world-unknown-continuation/v1", worldId };
    validateUnknownContinuationApproval(approval);
    const captured = structuredClone(approval);
    if (!this.options.authorizeUnknownContinuation || await this.options.authorizeUnknownContinuation(structuredClone(captured)) !== true) fail("invalid_input", "Explicit authenticated operator continuation authority is required");
    return this.transact(worldId, async tx => {
      const previous = tx.snapshot.unknownContinuationApprovals?.find(a => a.approvalId === captured.approvalId);
      if (previous) {
        if (json(previous as unknown as BudgetJson) !== json(captured as unknown as BudgetJson)) fail("key_conflict", "Immutable continuation approval ID already pins different evidence");
        return { acquired: false, approval: structuredClone(previous), audit: auditWorldBudget(tx.snapshot) };
      }
      const request = tx.snapshot.requests.find(r => r.requestKey === captured.requestKey);
      if (!request || request.state !== "unknown" || request.origin !== "reserved" || request.conflicts.length
        || request.scope !== captured.scope || request.operationFingerprint !== captured.operationFingerprint || request.reserveMicroUsd !== captured.reserveMicroUsd
        || json(request.unknownReasons) !== json(captured.unknownReasons)) fail("key_conflict", "Approval must bind the exact currently unknown request and reason history");
      if (!tx.appendUnknownContinuationApproval) fail("invalid_input", "Repository cannot durably retain a continuation approval");
      const next: WorldBudgetSnapshot = { ...tx.snapshot, unknownContinuationApprovals: [...(tx.snapshot.unknownContinuationApprovals ?? []), captured] };
      const audit = auditWorldBudget(next);
      await tx.appendUnknownContinuationApproval!(structuredClone(captured));
      return { acquired: true, approval: captured, audit };
    });
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
