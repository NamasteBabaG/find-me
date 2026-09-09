import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import {
  auditWorldBudget, WorldBudgetError, WORLD_BUDGET_SCOPES,
  type BudgetJson, type WorldBudgetSnapshot,
} from "../../services/generation/world-budget";
import type { AtomicWorldBudgetStore, VersionedWorldBudgetSnapshot } from "./world-budget-repository";

export const WORLD_BUDGET_LEDGER_SCHEMA_VERSION = 1;
// Prisma Int is signed 32-bit in both supported databases. Never wrap/reset it.
export const WORLD_BUDGET_LEDGER_MAX_REVISION = 2_147_483_647;

export class WorldBudgetStoreError extends Error {
  constructor(readonly code: "invalid_ledger" | "unsupported_version" | "revision_exhausted", message: string) {
    super(message); this.name = "WorldBudgetStoreError";
  }
}
function fail(code: WorldBudgetStoreError["code"], message: string): never { throw new WorldBudgetStoreError(code, message); }

const nonempty = z.string().refine(value => value.trim().length > 0);
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const jsonValue: z.ZodType<BudgetJson> = z.lazy(() => z.union([
  z.null(), z.boolean(), z.number().finite(), z.string(), z.array(jsonValue), z.record(jsonValue),
]));
const evidenceSchema = z.object({
  providerNamespace: nonempty, providerRequestId: nonempty, usageId: nonempty,
  rawUsage: z.record(jsonValue).refine(value => Object.keys(value).length > 0),
  model: nonempty, amountMicroUsd: money,
  costBasis: z.enum(["provider-billed", "conservative-upper-estimate"]),
}).strict();
const base = {
  requestKey: nonempty, scope: z.enum(WORLD_BUDGET_SCOPES), operationFingerprint: nonempty,
  reserveMicroUsd: money, origin: z.enum(["reserved", "imported"]),
  unknownReasons: z.array(nonempty),
  conflicts: z.array(z.object({ reason: nonempty, evidence: evidenceSchema }).strict()),
};
const requestSchema = z.discriminatedUnion("state", [
  z.object({ ...base, state: z.literal("pending") }).strict(),
  z.object({ ...base, state: z.literal("unknown") }).strict(),
  z.object({ ...base, state: z.literal("settled"), evidence: evidenceSchema }).strict(),
  z.object({ ...base, state: z.literal("linked"), evidence: evidenceSchema, canonicalRequestKey: nonempty }).strict(),
]);
const snapshotSchema = z.object({ worldId: nonempty, requests: z.array(requestSchema) }).strict();
const revisionSchema = z.number().int().min(0).max(WORLD_BUDGET_LEDGER_MAX_REVISION);

// This is a metadata-only ledger, not a request/response or exception dump.
// Reject credential/header fields and common credential-shaped strings. This
// is defense in depth, NOT a claim to detect arbitrary secrets hidden in IDs.
// Callers must pass opaque nonsecret IDs, hashes, usage, and sanitized reasons.
const forbiddenKey = /^(authorization|proxy.?authorization|api.?key|access.?token|refresh.?token|client.?secret|password|cookie|set.?cookie|headers|prompt|messages|image|images|base64|__proto__|prototype|constructor)$/i;
const credentialValue = /(?:\bsk-[a-z0-9_-]{8,}|\bbearer\s+\S+|\b(?:postgres(?:ql)?|mysql):\/\/|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;
function metadataOnly(value: unknown, seen = new Set<object>()) {
  if (typeof value === "string") {
    if (credentialValue.test(value)) fail("invalid_ledger", "Ledger metadata must not contain credentials");
    return;
  }
  if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || seen.has(value)) fail("invalid_ledger", "Ledger must contain finite, acyclic plain JSON metadata");
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail("invalid_ledger", "Ledger must contain plain JSON metadata");
  seen.add(value);
  for (const [key, item] of Object.entries(value)) {
    if (forbiddenKey.test(key)) fail("invalid_ledger", "Ledger metadata must not contain credentials, headers or generation inputs");
    metadataOnly(item, seen);
  }
  seen.delete(value);
}

/** Strict shape, every individual bill/link, then aggregate arithmetic. */
function checkedSnapshot(worldId: string, input: unknown): WorldBudgetSnapshot {
  // Inspect before Zod/JSON serialization so NaN, cycles, class instances and
  // credential fields cannot be silently dropped/coerced into persisted data.
  metadataOnly(input);
  const parsed = snapshotSchema.safeParse(input);
  if (!parsed.success || parsed.data.worldId !== worldId) fail("invalid_ledger", "Ledger snapshot shape or world binding is invalid");
  const snapshot: WorldBudgetSnapshot = parsed.data;
  const keys = new Set<string>(), charges = new Set<string>();
  try {
    for (const request of snapshot.requests) {
      if (keys.has(request.requestKey)) fail("invalid_ledger", "Duplicate ledger request key");
      keys.add(request.requestKey);
      const canonical = request.state === "linked" ? snapshot.requests.find(item => item.requestKey === request.canonicalRequestKey) : undefined;
      if (request.state === "linked" && (!canonical || canonical.state !== "settled" || canonical.scope !== request.scope || canonical.operationFingerprint !== request.operationFingerprint)) fail("invalid_ledger", "Invalid canonical ledger link");
      auditWorldBudget({ worldId, requests: canonical ? [canonical, request] : [request] });
      if (request.state === "settled") {
        const id = JSON.stringify([request.evidence.providerNamespace, request.evidence.providerRequestId]);
        if (charges.has(id)) fail("invalid_ledger", "Duplicate canonical ledger charge");
        charges.add(id);
      }
    }
    try { auditWorldBudget(snapshot); }
    catch (error) {
      // Preserve validated external bills even when their SUM cannot be safely
      // represented. The repository's next entry audit remains fail-closed.
      if (!(error instanceof WorldBudgetError && error.code === "arithmetic_overflow")) throw error;
    }
  } catch (error) {
    if (error instanceof WorldBudgetStoreError) throw error;
    fail("invalid_ledger", "Ledger accounting invariants are invalid");
  }
  return snapshot;
}
function checkedWorldId(worldId: string) {
  if (!nonempty.safeParse(worldId).success) fail("invalid_ledger", "A nonempty world ID is required");
  metadataOnly(worldId);
}
function checkedRevision(revision: number) {
  if (!revisionSchema.safeParse(revision).success) fail("invalid_ledger", "Invalid ledger revision");
}

/** Only the model's known worldId uniqueness is a confirmed insert conflict. */
function worldIdCollision(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
    && error.meta?.modelName === "WorldBudgetLedger"
    && Array.isArray(error.meta.target) && error.meta.target.length === 1 && error.meta.target[0] === "worldId";
}

/**
 * Concrete primary-database CAS; inject a normal Prisma client, NOT a read
 * replica, caching extension or an enclosing uncommitted transaction client.
 * Each awaited create/updateMany is one database autocommit. No app mutex,
 * blind upsert, retry, deletion/reset or hidden network dispatch is provided.
 * Store/database exceptions propagate: their commit outcome may be unknown.
 * Durability ultimately depends on the configured database/storage guarantees.
 *
 * Schema convention: edit prisma/schema.prisma, regenerate the checked-in
 * SQLite fixture with `npm run db:sql`, then regenerate the local client with
 * `npm run db:client:local`. These are schema/client generation, not DB pushes.
 * The current repository has no checked-in migration history; production's
 * generated Postgres schema comes from scripts/prisma-generate.mjs. A future
 * reviewed migration must diff the approved PREVIOUS Postgres schema against
 * the new generated schema and contain only the additive ledger table. Never
 * apply a from-empty test-schema script to an existing DB. Applying a migration
 * or guarded db push to QA/production is a separate, explicitly targeted step.
 */
export class PrismaWorldBudgetStore implements AtomicWorldBudgetStore {
  // Full client type excludes Prisma.TransactionClient: permission must not
  // escape before an enclosing caller-owned transaction actually commits.
  constructor(private readonly db: PrismaClient) {}

  async read(worldId: string): Promise<VersionedWorldBudgetSnapshot | null> {
    checkedWorldId(worldId);
    const row = await this.db.worldBudgetLedger.findUnique({
      where: { worldId }, select: { worldId: true, schemaVersion: true, revision: true, snapshotJson: true },
    });
    if (row === null) return null;
    if (row.schemaVersion !== WORLD_BUDGET_LEDGER_SCHEMA_VERSION) fail("unsupported_version", "Unsupported world budget ledger schema version");
    checkedRevision(row.revision);
    if (row.worldId !== worldId || typeof row.snapshotJson !== "string") fail("invalid_ledger", "Invalid stored ledger row");
    let json: unknown;
    try { json = JSON.parse(row.snapshotJson); }
    catch { fail("invalid_ledger", "Stored ledger is not valid JSON"); }
    return { revision: row.revision, snapshot: checkedSnapshot(worldId, json) };
  }

  async insertIfAbsent(worldId: string, nextSnapshot: WorldBudgetSnapshot): Promise<boolean> {
    checkedWorldId(worldId);
    const snapshotJson = JSON.stringify(checkedSnapshot(worldId, nextSnapshot));
    try {
      await this.db.worldBudgetLedger.create({ data: { worldId, revision: 0, schemaVersion: WORLD_BUDGET_LEDGER_SCHEMA_VERSION, snapshotJson }, select: { worldId: true } });
      return true;
    } catch (error) {
      if (worldIdCollision(error)) return false;
      throw error;
    }
  }

  async compareAndSwap(worldId: string, expectedRevision: number, nextSnapshot: WorldBudgetSnapshot): Promise<boolean> {
    checkedWorldId(worldId); checkedRevision(expectedRevision);
    if (expectedRevision === WORLD_BUDGET_LEDGER_MAX_REVISION) fail("revision_exhausted", "Ledger revision exhausted; no reset or write is allowed");
    const snapshotJson = JSON.stringify(checkedSnapshot(worldId, nextSnapshot));
    const result = await this.db.worldBudgetLedger.updateMany({
      where: { worldId, revision: expectedRevision, schemaVersion: WORLD_BUDGET_LEDGER_SCHEMA_VERSION },
      data: { snapshotJson, revision: { increment: 1 } },
    });
    if (result.count === 1) return true;
    if (result.count === 0) return false;
    return fail("invalid_ledger", "Atomic ledger update returned an impossible row count");
  }
}
