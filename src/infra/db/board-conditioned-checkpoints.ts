import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { FixedSourceResult } from "../generation/openai-fixed-source";
import { fixedSourceFailureReceiptSchema, type FixedSourceFailureReceipt } from "../generation/fixed-source-diagnostics";
import type { BoardConditionedCheckpointStore, BoardMeasurement } from "../../services/generation/board-conditioned-generation";
import { sha256Bytes } from "../../services/generation/fixed-sprite";

type GeneratedSource = Extract<FixedSourceResult, { kind: "generated" }>;
type Kind = "source" | "measurement" | "source-failure";
type Client = Pick<PrismaClient, "fileBlob">;
const CONTENT_TYPE = "application/vnd.findme.board-conditioned-checkpoint+json";
const PREFIX = "private:board-conditioned-checkpoint:v1:";
export const BOARD_CHECKPOINT_LIMITS = Object.freeze({
  sourcePngBytes: 18 * 1024 * 1024,
  sourceRecordBytes: 26 * 1024 * 1024,
  measurementRecordBytes: 256 * 1024,
  metadataBytes: 256 * 1024,
});

export class BoardConditionedCheckpointError extends Error {
  constructor(readonly code: "invalid-scope" | "invalid-source" | "invalid-measurement" | "oversized" | "corrupt-checkpoint" | "checkpoint-conflict" | "storage-unavailable", message: string) {
    super(`BOARD_CHECKPOINT: ${message}`); this.name = "BoardConditionedCheckpointError";
  }
}
function fail(code: BoardConditionedCheckpointError["code"], message: string): never { throw new BoardConditionedCheckpointError(code, message); }
const hash = (text: string) => sha256Bytes(Buffer.from(text, "utf8"));
function scope(worldId: string, boardId: string) {
  if (typeof worldId !== "string" || !/^[A-Za-z0-9_:-]{1,240}$/.test(worldId)
    || typeof boardId !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(boardId)) fail("invalid-scope", "trusted nonsecret world and board identifiers are required");
  return { worldId, boardId };
}
function key(worldId: string, boardId: string, kind: Kind) {
  scope(worldId, boardId);
  return `${PREFIX}${hash(JSON.stringify([worldId, boardId]))}:${kind}`;
}
/** Exact private inventory for authorized lifecycle cleanup; not public URLs. */
function measuredBoard(boardId: string, attempt: 1 | 2) {
  if (attempt !== 1 && attempt !== 2) fail("invalid-scope", "Only two immutable observations are allowed");
  return attempt === 1 ? boardId : `${boardId}--measurement-2`;
}
export function boardConditionedCheckpointKeys(worldId: string, boardId: string, measurementAttempt: 1 | 2 = 1) {
  return { source: key(worldId, boardId, "source"), measurement: key(worldId, measuredBoard(boardId, measurementAttempt), "measurement"), sourceFailure: key(worldId, boardId, "source-failure") };
}
const forbiddenKey = /^(authorization|proxy.?authorization|api.?key|access.?token|refresh.?token|client.?secret|password|cookie|headers|prompt|messages|image|images|base64|__proto__|prototype|constructor)$/i;
const credential = /(?:\bsk-[a-z0-9_-]{8,}|\bbearer\s+\S+|\b(?:postgres(?:ql)?|mysql):\/\/|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;
/** Bounded plain metadata only; never invoke toJSON or serialize a Buffer here. */
function metadataJson(value: unknown): string {
  const seen = new Set<object>(); let nodes = 0, bytes = 0;
  function counted(s: string) {
    bytes += Buffer.byteLength(s);
    if (bytes > BOARD_CHECKPOINT_LIMITS.metadataBytes) fail("oversized", "checkpoint metadata byte limit exceeded");
    return s;
  }
  function visit(v: unknown, depth: number, trail = ""): string {
    if (++nodes > 20_000 || depth > 32) fail("oversized", "checkpoint metadata exceeds its structural limit");
    if (typeof v === "string") {
      if (v.length > 65_536) fail("oversized", "checkpoint metadata string is too large");
      if (credential.test(v)) fail("corrupt-checkpoint", "checkpoint metadata cannot contain credentials");
      return counted(JSON.stringify(v));
    }
    if (v === null || typeof v === "boolean" || typeof v === "number" && Number.isFinite(v)) return counted(JSON.stringify(v));
    if (typeof v !== "object" || v === null || seen.has(v)
      || !Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) fail("corrupt-checkpoint", "checkpoint metadata must be finite acyclic plain JSON");
    seen.add(v);
    let text: string;
    if (Array.isArray(v)) {
      if (v.length > 20_000) fail("oversized", "checkpoint metadata array is too large");
      counted("[]" + ",".repeat(Math.max(0, v.length - 1)));
      text = `[${Array.from({ length: v.length }, (_, i) => {
        const property = Object.getOwnPropertyDescriptor(v, i);
        if (!property || !Object.hasOwn(property, "value")) fail("corrupt-checkpoint", "checkpoint arrays must be dense plain JSON without accessors");
        return visit(property.value, depth + 1, `${trail}.${i}`);
      }).join(",")}]`;
    }
    else text = `{${Object.keys(v).sort().map(k => {
      if (forbiddenKey.test(k) && !(trail === "audit.byScope" && k === "image")) fail("corrupt-checkpoint", "checkpoint metadata contains a forbidden field");
      const property = Object.getOwnPropertyDescriptor(v, k)!;
      if (!Object.hasOwn(property, "value")) fail("corrupt-checkpoint", "checkpoint metadata cannot contain accessors");
      return `${counted(JSON.stringify(k) + ":")}${visit(property.value, depth + 1, trail ? `${trail}.${k}` : k)}`;
    }).join(",")}}`;
    seen.delete(v); return text;
  }
  const text = visit(value, 0);
  if (Buffer.byteLength(text) > BOARD_CHECKPOINT_LIMITS.metadataBytes) fail("oversized", "checkpoint metadata byte limit exceeded");
  return text;
}

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().min(1).max(500).refine(s => s.trim() === s);
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positive = money.refine(n => n > 0);
const json: z.ZodType<unknown> = z.lazy(() => z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(json)]));
const evidence = z.object({
  providerNamespace: text, providerRequestId: text, usageId: text, rawUsage: z.record(json).refine(v => Object.keys(v).length > 0),
  model: text, amountMicroUsd: money, costBasis: z.enum(["provider-billed", "conservative-upper-estimate"]),
}).strict();
const keys = z.array(text).max(1000);
const scopeMoney = z.object({ settledMicroUsd: money, reservedMicroUsd: money }).strict();
const audit = z.object({
  worldId: text, capMicroUsd: money, settledMicroUsd: money, reservedMicroUsd: money, committedMicroUsd: money,
  remainingMicroUsd: money, overCapMicroUsd: money, held: z.boolean(), canReserve: z.boolean(), state: z.enum(["open", "held", "exhausted"]),
  pendingRequestKeys: keys, unknownRequestKeys: keys, overrunRequestKeys: keys, conflictRequestKeys: keys, linkedRequestKeys: keys,
  byScope: z.object({ identity: scopeMoney, sheet: scopeMoney, image: scopeMoney, judge: scopeMoney, repair: scopeMoney }).strict(),
}).strict();
const capture = z.object({
  settings: z.object({
    version: z.enum(["fixed-source-low/v1", "fixed-source-medium/v1"]), model: z.literal("gpt-image-2"), quality: z.enum(["low", "medium"]), size: z.literal("1024x1024"),
    background: z.literal("transparent"), output_format: z.literal("png"), n: z.literal(1),
  }).strict(),
  sourceGroupKey: text,
  policy: z.object({ reserveMicroUsd: positive, providerNamespace: text,
    rateCard: z.object({ id: text, textInput: positive, imageInput: positive, imageOutput: positive }).strict(), timeoutMs: z.number().int().min(1000).max(240000), quality: z.enum(["low", "medium"]).optional() }).strict(),
  promptSha256: sha, inputOrder: z.tuple([z.literal("style"), z.literal("identity")]), styleSha256: sha, identitySha256: sha,
}).strict().refine(c => c.settings.quality === (c.policy.quality ?? "low") && c.settings.version === `fixed-source-${c.settings.quality}/v1`, "Quality policy and settings must agree");
const sourceMeta = z.object({
  kind: z.literal("generated"), pngSha256: sha, fingerprint: sha, capture,
  evidence, modelProvenance: z.enum(["response-confirmed", "requested-endpoint-model-not-returned"]), audit, semanticApproval: z.literal("pending"),
}).strict();
const point = z.object({ x: z.number().finite().nonnegative(), y: z.number().finite().nonnegative() }).strict();
const observationReceipt = z.object({
  version: z.literal("board-pose-observation-receipt/v1"), fingerprint: sha, sourceImageSha256: sha, sourceRgbaSha256: sha,
  wireImageSha256: sha, promptSha256: sha, slots: z.array(z.object({ slotId: text, pose: text }).strict()).length(3),
  coordinates: z.literal("native-1024-sheet-pixel-edges"), modelRequested: z.literal("gpt-5.6-sol"), modelReturned: text.nullable(), effort: z.literal("high"),
  requestId: text.nullable(), responseId: text.nullable(), httpStatus: z.number().int().min(100).max(599).nullable(),
  serviceTier: text.nullable(), finishReason: text.nullable(),
  // Keep the full bounded model JSON verbatim, not the short identifier limit.
  responseText: z.string().max(65_536).nullable(), rawUsage: z.record(json).nullable(),
  costUnknown: z.boolean(), costCents: z.number().finite().nonnegative(), attempts: z.literal(1),
}).strict();
const measurementSchema = z.object({
  sheetSha256: sha, fingerprint: sha, status: z.enum(["ok", "uncertain", "invalid"]),
  sources: z.array(z.object({ slotId: text, pose: text, eye: point, chin: point, protectedFacePolygon: z.array(point).min(3).max(64),
    standing: z.object({ complete: z.boolean(), crown: point, leftSole: point, rightSole: point }).strict().optional(),
  }).strict()).max(3).nullable(),
  evidence, receipt: observationReceipt.optional(),
  /** Cells the source reviewer could not settle; composition decides. Optional so
   * measurements checkpointed before 9 September 2026 still load unchanged. */
  completenessDeferred: z.array(z.object({ slotId: text, visibleHeadArmsComplete: z.boolean().nullable(), reason: text }).strict()).max(3).optional(),
}).strict().superRefine((m, ctx) => {
  if (m.status === "ok" && (!m.sources || m.sources.length !== 3 || new Set(m.sources.map(s => s.slotId)).size !== 3)) ctx.addIssue({ code: "custom", message: "Successful observation requires three distinct sources" });
  // A deferral may only name a cell this sheet actually observed.
  if (m.completenessDeferred?.length && (new Set(m.completenessDeferred.map(d => d.slotId)).size !== m.completenessDeferred.length
    || m.completenessDeferred.some(d => !m.sources?.some(s => s.slotId === d.slotId)))) {
    ctx.addIssue({ code: "custom", message: "Deferred completeness must name distinct observed slots" });
  }
  const r = m.receipt;
  if (r && (r.fingerprint !== m.fingerprint || r.sourceImageSha256 !== m.sheetSha256 || r.requestId !== m.evidence.providerRequestId
    || r.modelReturned !== m.evidence.model || r.costUnknown || Math.ceil(r.costCents * 10_000) !== m.evidence.amountMicroUsd
    || new Set(r.slots.map(s => s.slotId)).size !== 3 || m.sources?.some((s, i) => s.slotId !== r.slots[i]?.slotId || s.pose !== r.slots[i]?.pose))) {
    ctx.addIssue({ code: "custom", message: "Observation receipt must bind its known charge, sheet and source assignment" });
  }
});
type SourceWire = Omit<GeneratedSource, "png" | "capture"> & { pngBase64: string; captureJson: string };
const sourceWireSchema = sourceMeta.omit({ capture: true }).extend({
  pngBase64: z.string().max(BOARD_CHECKPOINT_LIMITS.sourcePngBytes * 4 / 3),
  captureJson: z.string().max(BOARD_CHECKPOINT_LIMITS.metadataBytes),
}).strict();

function checkedSource(worldId: string, value: unknown): GeneratedSource {
  if (!value || typeof value !== "object") fail("invalid-source", "generated source is required");
  const properties = Object.getOwnPropertyDescriptors(value);
  if (!Object.hasOwn(properties.png ?? {}, "value") || Object.values(properties).some(p => !Object.hasOwn(p, "value"))) fail("invalid-source", "source must contain plain data fields");
  const png: unknown = properties.png!.value;
  const meta = Object.fromEntries(Object.entries(properties).filter(([k, p]) => k !== "png" && p.enumerable).map(([k, p]) => [k, p.value])) as Omit<GeneratedSource, "png">;
  if (!Buffer.isBuffer(png) || !png.length) fail("invalid-source", "source PNG bytes are required");
  if (png.length > BOARD_CHECKPOINT_LIMITS.sourcePngBytes) fail("oversized", "source PNG byte limit exceeded");
  metadataJson(meta);
  if (!sourceMeta.safeParse(meta).success || sha256Bytes(png) !== meta.pngSha256
    || hash(JSON.stringify(meta.capture)) !== meta.fingerprint || meta.audit.worldId !== worldId
    || meta.evidence.model !== meta.capture.settings.model || meta.evidence.providerNamespace !== meta.capture.policy.providerNamespace) {
    fail("invalid-source", "source hash, fingerprint, scope or receipt shape is invalid");
  }
  // Persist the original capture key order: the provider fingerprint currently
  // hashes JSON.stringify(capture), not a sorted-key representation.
  return { ...JSON.parse(metadataJson(meta)), capture: JSON.parse(JSON.stringify(meta.capture)), png: Buffer.from(png) } as GeneratedSource;
}
function checkedMeasurement(value: unknown): BoardMeasurement {
  const snapshot = JSON.parse(metadataJson(value));
  if (!measurementSchema.safeParse(snapshot).success) fail("invalid-measurement", "observation receipt shape is invalid");
  return snapshot as BoardMeasurement;
}
function sourcePayload(source: GeneratedSource): string {
  const { png, capture: inputCapture, ...meta } = source;
  const canonical = JSON.parse(metadataJson(meta)) as Record<string, unknown>;
  // PNG and exact capture order are the only purpose-specific wire strings.
  return JSON.stringify({ ...canonical, captureJson: JSON.stringify(inputCapture), pngBase64: png.toString("base64") });
}
function record(worldId: string, boardId: string, kind: Kind, payload: string): Buffer {
  const bytes = Buffer.from(JSON.stringify({ version: 1, kind, worldId, boardId, payloadSha256: hash(payload), payload }), "utf8");
  if (bytes.length > (kind === "source" ? BOARD_CHECKPOINT_LIMITS.sourceRecordBytes : BOARD_CHECKPOINT_LIMITS.measurementRecordBytes)) fail("oversized", "checkpoint record byte limit exceeded");
  return bytes;
}
function uniqueKeyConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
    && error.meta?.modelName === "FileBlob" && Array.isArray(error.meta.target)
    && error.meta.target.length === 1 && error.meta.target[0] === "key";
}
const envelope = z.object({ version: z.literal(1), kind: z.enum(["source", "measurement", "source-failure"]), worldId: z.string(), boardId: z.string(), payloadSha256: sha, payload: z.string() }).strict();

/** Private job checkpoint adapter, not an ownership or billing authority.
 * Inject the primary Prisma client, never a replica. An authorized fenced QA
 * write may inject a transaction only when its outer wrapper awaits the full
 * commit before reporting checkpoint success to the engine. Never dispatch a
 * provider or budget operation inside that write transaction. No Asset rows,
 * public URLs, upsert, delete, provider calls or
 * ledger writes are performed. Caller must authorize the world/board scope and
 * revalidate each stored charge against its durable world budget on every use. */
export class PrismaBoardConditionedCheckpointStore implements BoardConditionedCheckpointStore {
  constructor(private readonly db: Client) {}

  private async read(worldId: string, boardId: string, kind: Kind): Promise<Buffer | null> {
    const storageKey = key(worldId, boardId, kind);
    let row;
    try { row = await this.db.fileBlob.findUnique({ where: { key: storageKey } }); }
    catch { fail("storage-unavailable", "checkpoint read was not confirmed; reconcile before any paid dispatch"); }
    if (!row) return null;
    const limit = kind === "source" ? BOARD_CHECKPOINT_LIMITS.sourceRecordBytes : BOARD_CHECKPOINT_LIMITS.measurementRecordBytes;
    if (row.contentType !== CONTENT_TYPE || row.data.byteLength > limit) fail("corrupt-checkpoint", "checkpoint content type or size is invalid");
    return Buffer.from(row.data);
  }
  private payload(worldId: string, boardId: string, kind: Kind, bytes: Buffer): unknown {
    try {
      const parsed = envelope.safeParse(JSON.parse(bytes.toString("utf8")));
      if (!parsed.success || parsed.data.kind !== kind || parsed.data.worldId !== worldId || parsed.data.boardId !== boardId
        || hash(parsed.data.payload) !== parsed.data.payloadSha256) fail("corrupt-checkpoint", "checkpoint version, scope or content hash is invalid");
      return JSON.parse(parsed.data.payload);
    } catch { fail("corrupt-checkpoint", "checkpoint content is corrupt or belongs to another scope"); }
  }
  private async put(worldId: string, boardId: string, kind: Kind, bytes: Buffer) {
    const storageKey = key(worldId, boardId, kind), existing = await this.read(worldId, boardId, kind);
    if (existing) {
      if (!existing.equals(bytes)) fail("checkpoint-conflict", "immutable checkpoint already contains different content");
      return;
    }
    try { await this.db.fileBlob.create({ data: { key: storageKey, contentType: CONTENT_TYPE, data: new Uint8Array(bytes) } }); }
    catch (error) {
      if (!uniqueKeyConflict(error)) fail("storage-unavailable", "checkpoint commit outcome is unresolved; retain the charge and reconcile without redispatch");
      const winner = await this.read(worldId, boardId, kind);
      if (!winner || !winner.equals(bytes)) fail("checkpoint-conflict", "a concurrent writer stored different immutable content");
    }
  }
  async putSource(worldId: string, boardId: string, source: GeneratedSource): Promise<void> {
    scope(worldId, boardId);
    const checked = checkedSource(worldId, source), bytes = record(worldId, boardId, "source", sourcePayload(checked));
    await this.put(worldId, boardId, "source", bytes);
  }
  async getSource(worldId: string, boardId: string): Promise<GeneratedSource | null> {
    const bytes = await this.read(worldId, boardId, "source");
    if (!bytes) return null;
    try {
      const value = this.payload(worldId, boardId, "source", bytes);
      if (!sourceWireSchema.safeParse(value).success) fail("corrupt-checkpoint", "invalid checkpoint source wire shape");
      const wire = value as SourceWire;
      if (!wire || typeof wire.pngBase64 !== "string" || wire.pngBase64.length > BOARD_CHECKPOINT_LIMITS.sourcePngBytes * 4 / 3
        || wire.pngBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(wire.pngBase64) || typeof wire.captureJson !== "string") fail("corrupt-checkpoint", "invalid checkpoint source encoding");
      const png = Buffer.from(wire.pngBase64, "base64");
      if (png.toString("base64") !== wire.pngBase64) fail("corrupt-checkpoint", "noncanonical checkpoint source encoding");
      const { pngBase64: _encoded, captureJson, ...meta } = wire;
      return checkedSource(worldId, { ...meta, capture: JSON.parse(captureJson), png });
    } catch { fail("corrupt-checkpoint", "stored source cannot be verified"); }
  }
  async putMeasurement(worldId: string, boardId: string, result: BoardMeasurement, measurementAttempt: 1 | 2 = 1): Promise<void> {
    scope(worldId, boardId);
    const storedBoard = measuredBoard(boardId, measurementAttempt);
    const checked = checkedMeasurement(result), bytes = record(worldId, storedBoard, "measurement", metadataJson(checked));
    const source = await this.getSource(worldId, boardId);
    if (!source || source.pngSha256 !== checked.sheetSha256) fail("invalid-measurement", "observation must bind the existing source at this world and board");
    await this.put(worldId, storedBoard, "measurement", bytes);
  }
  async getMeasurement(worldId: string, boardId: string, measurementAttempt: 1 | 2 = 1): Promise<BoardMeasurement | null> {
    const storedBoard = measuredBoard(boardId, measurementAttempt);
    const bytes = await this.read(worldId, storedBoard, "measurement");
    if (!bytes) return null;
    let result: BoardMeasurement;
    try { result = checkedMeasurement(this.payload(worldId, storedBoard, "measurement", bytes)); }
    catch { return fail("corrupt-checkpoint", "stored observation cannot be verified"); }
    const source = await this.getSource(worldId, boardId);
    if (!source || source.pngSha256 !== result.sheetSha256) fail("corrupt-checkpoint", "stored observation has no matching scoped source");
    return result;
  }
  /** Sanitized receipt only. It is diagnostic evidence, never a charge settlement
   * or permission to release a reservation/retry. Exists even with no source PNG. */
  async putSourceFailure(worldId: string, boardId: string, receipt: FixedSourceFailureReceipt): Promise<void> {
    scope(worldId, boardId);
    const json = metadataJson(receipt), parsed = fixedSourceFailureReceiptSchema.safeParse(JSON.parse(json));
    if (Buffer.byteLength(json) > 8192 || !parsed.success || parsed.data.worldId !== worldId
      || parsed.data.requestKey !== `board:${boardId.replace(/--attempt-2$/, "")}:source:1`) fail("corrupt-checkpoint", "failure receipt scope or allowed fields are invalid");
    await this.put(worldId, boardId, "source-failure", record(worldId, boardId, "source-failure", json));
  }
  async getSourceFailure(worldId: string, boardId: string): Promise<FixedSourceFailureReceipt | null> {
    const bytes = await this.read(worldId, boardId, "source-failure");
    if (!bytes) return null;
    const parsed = fixedSourceFailureReceiptSchema.safeParse(this.payload(worldId, boardId, "source-failure", bytes));
    if (!parsed.success || parsed.data.worldId !== worldId
      || parsed.data.requestKey !== `board:${boardId.replace(/--attempt-2$/, "")}:source:1`) fail("corrupt-checkpoint", "stored failure receipt scope or allowed fields are invalid");
    return parsed.data;
  }
}
