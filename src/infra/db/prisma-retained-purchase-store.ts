import { Prisma, type PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  RETAINED_PURCHASE_VERSION, RetainedPurchaseRefused, retainedPayloadDigest,
  type RetainedPurchase, type RetainedPurchaseStore,
} from "../../services/generation/paid-operation";
import { WORLD_BUDGET_SCOPES, WorldBudgetError, sameChargeEvidence, validateChargeEvidence } from "../../services/generation/world-budget";
import type { WorldChargeEvidence } from "../../services/generation/world-budget";

/**
 * Where a paid answer lives between being bought and being settled - on disk,
 * not in this process.
 *
 * `purchaseOnce` is written so that an interruption costs a restart rather than
 * a second purchase, and that promise is only as durable as the thing holding
 * the bytes. Every test so far has held them in a `Map`, which survives exactly
 * as long as the process that bought them: the restart the design is about is
 * the one case a Map cannot answer.
 *
 * Three properties, and each one is a way the money can be lost:
 *
 * 1. **Put-if-absent, never overwrite.** A retained record is the only evidence
 *    that a charge happened. Overwriting one loses the answer that was paid for
 *    and can hand a later reader somebody else's picture. Identical bytes are a
 *    no-op; different bytes under the same address stop everything.
 * 2. **A corrupt record is raised, never reported as absent.** "Nothing was
 *    retained" is a claim `purchaseOnce` acts on, and acting on it wrongly is
 *    how a paid render gets bought again. Unreadable is a fact for a person.
 * 3. **A bill is refused here if settlement would refuse it later.** The ledger
 *    owns that rule and exports it; keeping a bill this store knows cannot be
 *    recorded only moves the refusal to after the money has moved.
 *
 * The bytes are a child's likeness on the image route, so the keys are
 * enumerable by world (`retainedPurchaseKeysFor`) and deletion can find every
 * one of them without discovering a new store.
 */

const PREFIX = "private:retained-purchase:v1:";
const CONTENT_TYPE = "application/vnd.findme.retained-purchase+json";

export const RETAINED_PURCHASE_LIMITS = Object.freeze({
  /** One render at the sizes this route buys, with room to spare. */
  payloadBytes: 12 * 1024 * 1024,
  recordBytes: 17 * 1024 * 1024,
  /**
   * How long a reason for having no bill may be. ONE number, used by the write
   * and by the read, because two different answers to that question is how a
   * record got written and then could not be read back - which loses a paid
   * answer to a diagnostic string being wordy.
   */
  unknownReasonChars: 2000,
});

/**
 * A refusal, and whether it is worth trying again.
 *
 * The three that describe the RECORD are permanent: no retry makes an unusable
 * bill usable. A read that did not happen and a concurrent writer are not, and
 * a caller that mistook one for the other would hold a world over a blip.
 */
const PERMANENT = new Set(["invalid-scope", "invalid-record", "oversized", "corrupt"]);
export class RetainedPurchaseError extends RetainedPurchaseRefused {
  constructor(readonly code: "invalid-scope" | "invalid-record" | "oversized" | "corrupt" | "conflict" | "storage-unavailable", message: string) {
    super(`RETAINED_PURCHASE: ${message}`, PERMANENT.has(code));
    this.name = "RetainedPurchaseError";
  }
}
function fail(code: RetainedPurchaseError["code"], message: string): never { throw new RetainedPurchaseError(code, message); }

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** Bounded, non-secret identifiers only: these become a storage key. */
function checkedScope(worldId: string, requestKey: string) {
  if (typeof worldId !== "string" || !/^[A-Za-z0-9_:.-]{1,240}$/.test(worldId)) fail("invalid-scope", "a bounded nonsecret world identifier is required");
  if (typeof requestKey !== "string" || !/^[A-Za-z0-9_:.-]{1,240}$/.test(requestKey)) fail("invalid-scope", "a bounded nonsecret request key is required");
  return { worldId, requestKey };
}

/** The address of one retained purchase. The world is part of it, not a caller convention. */
export function retainedPurchaseKey(worldId: string, requestKey: string): string {
  checkedScope(worldId, requestKey);
  return `${PREFIX}${sha256(JSON.stringify([worldId, requestKey]))}`;
}

/** Every address a world could be holding, for deletion and for inventory. */
export function retainedPurchaseKeysFor(worldId: string, requestKeys: readonly string[]): string[] {
  return requestKeys.map(key => retainedPurchaseKey(worldId, key));
}

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().min(1).max(500);
const json: z.ZodType<unknown> = z.lazy(() => z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(json)]));
const evidenceSchema = z.object({
  providerNamespace: text, providerRequestId: text, usageId: text,
  rawUsage: z.record(json), model: text,
  amountMicroUsd: z.number().int().nonnegative(),
  costBasis: z.enum(["provider-billed", "conservative-upper-estimate"]),
}).strict();

const envelopeSchema = z.object({
  version: z.literal(RETAINED_PURCHASE_VERSION),
  worldId: text, requestKey: text,
  scope: z.enum(WORLD_BUDGET_SCOPES),
  // Bounded text, not a digest: how a caller fingerprints its operation is the
  // caller's business and the ledger does not dictate it either. A format rule
  // invented here would refuse a legitimate record at the worst moment.
  operationFingerprint: text,
  payloadSha256: digest,
  evidence: evidenceSchema.nullable(),
  unknownReason: z.string().min(1).max(RETAINED_PURCHASE_LIMITS.unknownReasonChars).nullable(),
  bytesBase64: z.string().max(Math.ceil(RETAINED_PURCHASE_LIMITS.payloadBytes * 4 / 3) + 4),
}).strict();

/**
 * A record whose bill and whose reason for having none disagree is not a record
 * anyone can act on: `purchaseOnce` routes on exactly this distinction - settle
 * from the retained bill, or finish the unknown-charge hold.
 */
function checkedRecord(worldId: string, requestKey: string, value: RetainedPurchase): RetainedPurchase {
  checkedScope(worldId, requestKey);
  if (!value || typeof value !== "object") fail("invalid-record", "a retained purchase is required");
  if (value.version !== RETAINED_PURCHASE_VERSION) fail("invalid-record", `retained purchases are ${RETAINED_PURCHASE_VERSION}, not ${String(value.version)}`);
  if (value.worldId !== worldId || value.requestKey !== requestKey) fail("invalid-scope", "a retained purchase may only be stored at its own address");
  if (!(WORLD_BUDGET_SCOPES as readonly string[]).includes(value.scope)) fail("invalid-record", "unknown budget scope");
  if (!text.safeParse(value.operationFingerprint).success) fail("invalid-record", "an operation fingerprint is required");
  if (!Buffer.isBuffer(value.bytes) || value.bytes.length === 0) fail("invalid-record", "the bytes that were paid for are required");
  if (value.bytes.length > RETAINED_PURCHASE_LIMITS.payloadBytes) fail("oversized", "retained payload byte limit exceeded");
  if (retainedPayloadDigest(value.bytes) !== value.payloadSha256) fail("invalid-record", "retained bytes do not match their own digest");
  let unknownReason = value.unknownReason;
  if (value.evidence === null) {
    if (typeof unknownReason !== "string" || !unknownReason.trim()) fail("invalid-record", "a purchase with no bill must say why it has none");
    // Shortened, never refused. The reason is a diagnostic; the bytes beside it
    // were paid for, and refusing the record over the length of an explanation
    // throws away the thing that cost money.
    const limit = RETAINED_PURCHASE_LIMITS.unknownReasonChars;
    if (unknownReason.length > limit) unknownReason = `${unknownReason.slice(0, limit - 3)}...`;
  } else {
    if (value.unknownReason !== null) fail("invalid-record", "a purchase cannot carry both a bill and a reason for having none");
    if (!evidenceSchema.safeParse(value.evidence).success) fail("invalid-record", "the retained bill is not a bill this ledger records");
    // The ledger's own rule, not a second copy of it. A bill kept here that
    // settlement would refuse is a refusal arriving after the money moved.
    try { validateChargeEvidence(value.evidence); }
    catch (error) {
      if (error instanceof WorldBudgetError) fail("invalid-record", `the retained bill would be refused at settlement: ${error.message}`);
      throw error;
    }
  }
  return unknownReason === value.unknownReason ? value : { ...value, unknownReason };
}

function payloadOf(value: RetainedPurchase): Buffer {
  const envelope = {
    version: value.version, worldId: value.worldId, requestKey: value.requestKey, scope: value.scope,
    operationFingerprint: value.operationFingerprint, payloadSha256: value.payloadSha256,
    evidence: value.evidence, unknownReason: value.unknownReason,
    bytesBase64: value.bytes.toString("base64"),
  };
  const bytes = Buffer.from(JSON.stringify(envelope), "utf8");
  if (bytes.length > RETAINED_PURCHASE_LIMITS.recordBytes) fail("oversized", "retained record byte limit exceeded");
  return bytes;
}

function uniqueKeyConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
    && error.meta?.modelName === "FileBlob" && Array.isArray(error.meta.target)
    && error.meta.target.length === 1 && error.meta.target[0] === "key";
}

type Client = Pick<PrismaClient, "fileBlob">;

export class PrismaRetainedPurchaseStore implements RetainedPurchaseStore {
  constructor(private readonly db: Client) {}

  private async read(worldId: string, requestKey: string): Promise<Buffer | null> {
    const key = retainedPurchaseKey(worldId, requestKey);
    let row;
    // A read that did not happen is not a read that found nothing: answering
    // "nothing retained" on a database blip is how a paid render is bought
    // again. The caller sees an error and reconciles.
    try { row = await this.db.fileBlob.findUnique({ where: { key } }); }
    catch { fail("storage-unavailable", "the retained purchase could not be read; reconcile before any paid dispatch"); }
    if (!row) return null;
    if (row.contentType !== CONTENT_TYPE || row.data.byteLength > RETAINED_PURCHASE_LIMITS.recordBytes) fail("corrupt", "retained record content type or size is invalid");
    return Buffer.from(row.data);
  }

  async put(worldId: string, requestKey: string, value: RetainedPurchase): Promise<void> {
    const checked = checkedRecord(worldId, requestKey, value);
    const bytes = payloadOf(checked);
    // What the write accepts, the read must return. Asserting it here rather
    // than trusting two schemas to agree: they did not, and a record that could
    // be written and not read back is a paid answer lost to a validation
    // asymmetry nobody would have noticed until a restart needed it.
    let roundTrip: RetainedPurchase;
    try { roundTrip = decode(worldId, requestKey, bytes); }
    catch (error) { fail("invalid-record", `this record would not survive being read back: ${error instanceof Error ? error.message : String(error)}`); }
    const sameBill = roundTrip.evidence === null && checked.evidence === null
      || !!roundTrip.evidence && !!checked.evidence && sameChargeEvidence(roundTrip.evidence, checked.evidence);
    if (!roundTrip.bytes.equals(checked.bytes) || roundTrip.unknownReason !== checked.unknownReason
      || roundTrip.operationFingerprint !== checked.operationFingerprint || !sameBill) {
      // The BILL as well as the bytes. Comparing everything but the receipt let
      // a usage map be altered on its way to disk and then settled in its
      // altered form, which is a different charge than the one that arrived.
      //
      // Honestly: no input can reach this line today. Canonicalisation at the
      // purchase boundary and the strict schema above close every route I can
      // construct, so this is a belt and there is no test that tightens it. It
      // stays because the next field added to a receipt should not be able to
      // reopen the hole quietly.
      fail("invalid-record", "this record would not come back the way it went in");
    }
    const existing = await this.read(worldId, requestKey);
    if (existing) {
      // Writing the same answer twice is a restart; writing a different one is
      // an answer being lost. Only the second is an error, and it is a stop.
      if (!existing.equals(bytes)) fail("conflict", `${requestKey} already holds a different retained purchase; the earlier answer was paid for and must not be overwritten`);
      return;
    }
    try {
      await this.db.fileBlob.create({ data: { key: retainedPurchaseKey(worldId, requestKey), contentType: CONTENT_TYPE, data: new Uint8Array(bytes) } });
    } catch (error) {
      if (!uniqueKeyConflict(error)) fail("storage-unavailable", "the retained purchase was not confirmed; retain the charge and reconcile without redispatch");
      const winner = await this.read(worldId, requestKey);
      if (!winner || !winner.equals(bytes)) fail("conflict", `${requestKey} was retained concurrently with different content`);
    }
  }

  async get(worldId: string, requestKey: string): Promise<RetainedPurchase | null> {
    const bytes = await this.read(worldId, requestKey);
    if (bytes === null) return null;
    return decode(worldId, requestKey, bytes);
  }
}

/** The only way a stored record becomes a `RetainedPurchase` again. */
function decode(worldId: string, requestKey: string, bytes: Buffer): RetainedPurchase {
    let parsed: unknown;
    try { parsed = JSON.parse(bytes.toString("utf8")); }
    catch { return fail("corrupt", `${requestKey} holds a retained purchase that cannot be read`); }
    const envelope = envelopeSchema.safeParse(parsed);
    if (!envelope.success) fail("corrupt", `${requestKey} holds a retained purchase whose shape is invalid`);
    const wire = envelope.data;
    const payload = Buffer.from(wire.bytesBase64, "base64");
    // Base64 is not a checksum and `Buffer.from` does not complain: a record
    // whose encoding is not canonical is a record somebody edited.
    if (payload.toString("base64") !== wire.bytesBase64) fail("corrupt", `${requestKey} holds a noncanonical retained payload`);
    const record: RetainedPurchase = {
      version: RETAINED_PURCHASE_VERSION,
      worldId: wire.worldId, requestKey: wire.requestKey, scope: wire.scope,
      operationFingerprint: wire.operationFingerprint, payloadSha256: wire.payloadSha256,
      evidence: (wire.evidence ?? null) as WorldChargeEvidence | null,
      unknownReason: wire.unknownReason, bytes: payload,
    };
    // Re-checked on the way out, against the address it was asked for. The
    // envelope is the only thing that proves whose purchase this is, and a
    // record that reaches `purchaseOnce` unverified is one that can answer a
    // request with another request's picture.
    return checkedRecord(worldId, requestKey, record);
}
