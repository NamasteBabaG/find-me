import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { FIXED_SOURCE_PAYLOAD_BYTES, FIXED_SOURCE_SETTINGS, fixedSourceSettings, type FixedSourceResult } from "../../generation/openai-fixed-source";
import { BOARD_POSE_OBSERVER_SETTINGS } from "../../generation/board-pose-observer";
import { sha256Bytes } from "../../../services/generation/fixed-sprite";
import { auditWorldBudget } from "../../../services/generation/world-budget";
import type { BoardMeasurement } from "../../../services/generation/board-conditioned-generation";
import { BOARD_CHECKPOINT_LIMITS, PrismaBoardConditionedCheckpointStore, boardConditionedCheckpointKeys } from "../board-conditioned-checkpoints";
import { fixedSourceFailureReceipt } from "../../generation/fixed-source-diagnostics";
import { boardObserverFailureSchema } from "../../generation/board-observer-diagnostics";

type Source = Extract<FixedSourceResult, { kind: "generated" }>;
let scratch: string, databaseUrl: string, db: PrismaClient, png: Buffer;
let sequence = 0;
const clients: PrismaClient[] = [];
const board = "tokyo";
const hash = (text: string) => sha256Bytes(Buffer.from(text));
const storageKey = (world: string, kind = "source", boardId = board) => `private:board-conditioned-checkpoint:v1:${hash(JSON.stringify([world, boardId]))}:${kind}`;
function world() { return `checkpoint-test-${++sequence}`; }
function connection() {
  if (!scratch || !databaseUrl?.startsWith("file:")) throw new Error("Disposable database required");
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  clients.push(client); return client;
}
beforeAll(async () => {
  // Only this explicitly-created temporary SQLite database is ever written.
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-board-checkpoints-"));
  databaseUrl = `file:${path.join(scratch, "checkpoint-test.db").replace(/\\/g, "/")}`;
  db = connection(); await applyTestSchema(db);
  png = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "transparent" } })
    .composite([{ input: Buffer.from('<svg width="1024" height="1024"><rect x="10" y="10" width="30" height="80" fill="red"/></svg>') }]).png().toBuffer();
}, 30_000);
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => {
  await Promise.all(clients.map(client => client.$disconnect()));
  if (scratch) {
    const resolved = realpathSync(scratch);
    if (path.dirname(resolved) !== realpathSync(tmpdir()) || !path.basename(resolved).startsWith("findme-board-checkpoints-")) throw new Error("Refusing cleanup outside disposable checkpoint test directory");
    rmSync(resolved, { recursive: true, force: true });
  }
});

function source(worldId: string): Source {
  const capture: Source["capture"] = {
    settings: { ...FIXED_SOURCE_SETTINGS }, sourceGroupKey: "fixture:board-specific:tokyo",
    // Nonalphabetical order is deliberate: provider fingerprint uses JSON.stringify.
    policy: { timeoutMs: 1000, reserveMicroUsd: 100_000, providerNamespace: "synthetic:checkpoint",
      rateCard: { imageOutput: 32, id: "fixture-rates", textInput: 5, imageInput: 8 } },
    promptSha256: hash("synthetic prompt hash only"), inputOrder: ["style", "identity"],
    styleSha256: hash("synthetic board atlas"), identitySha256: hash("synthetic identity"),
  };
  return {
    kind: "generated", png: Buffer.from(png), pngSha256: sha256Bytes(png), fingerprint: hash(JSON.stringify(capture)), capture,
    evidence: { providerNamespace: "synthetic:checkpoint", providerRequestId: "fixture-image-request", usageId: "fixture-image-usage",
      rawUsage: { input_tokens: 5, output_tokens: 10, input_tokens_details: { text_tokens: 2, image_tokens: 3 } }, model: "gpt-image-2", amountMicroUsd: 345,
      costBasis: "conservative-upper-estimate" },
    modelProvenance: "requested-endpoint-model-not-returned", audit: auditWorldBudget({ worldId, requests: [] }), semanticApproval: "pending",
  };
}
function measurement(s: Source): BoardMeasurement {
  return { sheetSha256: s.pngSha256, fingerprint: hash("synthetic source observation"), status: "ok",
    sources: ["front-peek", "side-lean", "wave-peek"].map((pose, i) => ({ slotId: `tokyo-${i}`, pose,
      eye: { x: 10 + i * 300, y: 50 }, chin: { x: 11 + i * 300, y: 70 },
      protectedFacePolygon: [{ x: i * 300, y: 40 }, { x: 30 + i * 300, y: 40 }, { x: 30 + i * 300, y: 69 }, { x: i * 300, y: 69 }] })),
    evidence: { ...s.evidence, providerRequestId: "fixture-observer-request", usageId: "fixture-observer-usage", model: "gpt-5.6-sol" },
  };
}
async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ name: "BoardConditionedCheckpointError", code });
}
async function row(worldId: string, kind = "source") {
  return db.fileBlob.findUniqueOrThrow({ where: { key: storageKey(worldId, kind) } });
}
async function mutate(worldId: string, change: (payload: Record<string, unknown>, envelope: Record<string, unknown>) => void, kind = "source") {
  const stored = await row(worldId, kind), envelope = JSON.parse(Buffer.from(stored.data).toString());
  const payload = JSON.parse(envelope.payload); change(payload, envelope);
  envelope.payload = JSON.stringify(payload); envelope.payloadSha256 = hash(envelope.payload);
  await db.fileBlob.update({ where: { key: stored.key }, data: { data: Buffer.from(JSON.stringify(envelope)) } });
}
function barrier(parties = 2) {
  let arrived = 0, release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  return async () => { if (++arrived <= parties) { if (arrived === parties) release(); await waiting; } };
}
function raceInitialReads(...connections: PrismaClient[]) {
  const wait = barrier(connections.length);
  for (const client of connections) {
    const read = client.fileBlob.findUnique.bind(client.fileBlob);
    vi.spyOn(client.fileBlob, "findUnique").mockImplementation((async (args: Prisma.FileBlobFindUniqueArgs) => {
      const result = await read(args); await wait(); return result;
    }) as unknown as typeof client.fileBlob.findUnique);
  }
}

describe("private immutable board-conditioned checkpoints in real disposable SQLite", () => {
  it("retains bounded observer failures by exact source/measurement attempt without rewriting the paid source", async () => {
    const id = world(), s = source(id), store = new PrismaBoardConditionedCheckpointStore(db);
    const diagnostic = boardObserverFailureSchema.parse({ version: "board-observer-failure/v1", worldId: id, requestKey: `board:${board}:measure:1`,
      fingerprint: hash("original observation"), sourceImageSha256: s.pngSha256, sourceRgbaSha256: hash("rgba"), wireImageSha256: hash("wire"), promptSha256: hash("prompt"),
      stage: "response-body", failure: "timeout", elapsedMs: 90001, billing: "unknown", httpStatus: 200, requestId: "req_original", requestIdStatus: "safe",
      requestedModel: "gpt-5.6-sol", effort: BOARD_POSE_OBSERVER_SETTINGS.effort, returnedModel: "absent", usage: { promptTokens: null, completionTokens: null, totalTokens: null } });
    await expectCode(store.putObservationFailure(id, board, diagnostic), "corrupt-checkpoint"); // no source, no unrelated receipt
    await store.putSource(id, board, s); const sourceBytes = Buffer.from((await row(id)).data);
    await store.putObservationFailure(id, board, diagnostic); await store.putObservationFailure(id, board, diagnostic);
    expect(await new PrismaBoardConditionedCheckpointStore(connection()).getObservationFailure(id, board)).toEqual(diagnostic);
    expect(await store.getObservationFailure(id, board, 2)).toBeNull();
    expect(await store.getMeasurement(id, board)).toBeNull(); expect(await store.getSource(id, board)).toEqual(s);
    expect(Buffer.from((await row(id)).data)).toEqual(sourceBytes); expect(await db.worldBudgetLedger.count()).toBe(0);
    await expectCode(store.putObservationFailure(id, board, { ...diagnostic, elapsedMs: 1 }), "checkpoint-conflict");
    await expectCode(store.putObservationFailure(id, board, { ...diagnostic, sourceImageSha256: "f".repeat(64) }), "corrupt-checkpoint");
    await expectCode(store.putObservationFailure(id, board, { ...diagnostic, requestKey: "board:other:measure:1" }), "corrupt-checkpoint");
    await expectCode(store.putObservationFailure(id, board, { ...diagnostic, headers: { authorization: "secret" } } as typeof diagnostic), "corrupt-checkpoint");
    await expectCode(store.putObservationFailure(id, board, { ...diagnostic, elapsedMs: 3_600_001 }), "corrupt-checkpoint");
    const second = { ...diagnostic, requestKey: `board:${board}:measure:2`, transportTimeoutMs: 180_000 };
    await store.putObservationFailure(id, board, second, 2);
    expect(await store.getObservationFailure(id, board, 2)).toEqual(second);
    // Both retained source attempts use distinct exact deletion inventory.
    await store.putSource(id, `${board}--attempt-2`, s);
    await store.putObservationFailure(id, `${board}--attempt-2`, second, 2);
    const firstKey = boardConditionedCheckpointKeys(id, board).observationFailure;
    const secondKey = boardConditionedCheckpointKeys(id, `${board}--attempt-2`, 2).observationFailure;
    expect(firstKey).not.toBe(secondKey);
    expect(await db.fileBlob.findUnique({ where: { key: secondKey } })).not.toBeNull();
    await db.fileBlob.deleteMany({ where: { key: { in: [firstKey, secondKey] } } });
    expect(await store.getObservationFailure(id, board)).toBeNull();
    expect(await store.getSource(id, board)).toEqual(s);
  });
  it("keeps a second observation independently immutable against the same original source", async () => {
    const id = world(), store = new PrismaBoardConditionedCheckpointStore(db), s = source(id), first = measurement(s);
    await store.putSource(id, board, s); await store.putMeasurement(id, board, first);
    const originalBytes = Buffer.from((await row(id, "measurement")).data);
    const second = structuredClone(first); second.sources![0]!.eye.x += 1; second.evidence.providerRequestId = "fixture-observer-second";
    await store.putMeasurement(id, board, second, 2);
    expect(await store.getMeasurement(id, board)).toEqual(first);
    expect(await new PrismaBoardConditionedCheckpointStore(connection()).getMeasurement(id, board, 2)).toEqual(second);
    expect(Buffer.from((await row(id, "measurement")).data)).toEqual(originalBytes);
    expect(await store.getSource(id, board)).toEqual(s);
    const keys = boardConditionedCheckpointKeys(id, board, 2);
    expect(keys.source).toBe(storageKey(id)); expect(keys.measurement).not.toBe(storageKey(id, "measurement"));
    expect((await db.fileBlob.findUniqueOrThrow({ where: { key: keys.measurement } })).contentType).toBe("application/vnd.findme.board-conditioned-checkpoint+json");
    await expectCode(store.putMeasurement(id, board, { ...second, sheetSha256: "f".repeat(64) }, 2), "invalid-measurement");
    await expectCode(store.putMeasurement(id, board, first, 2), "checkpoint-conflict");
    await expectCode(store.getMeasurement(id, board, 3 as 2), "invalid-scope");
  });
  it("round-trips MEDIUM and observed standing anatomy before any live dispatch", async () => {
    const id = world(), store = new PrismaBoardConditionedCheckpointStore(db), s = source(id);
    s.capture.settings = { ...s.capture.settings, quality: "medium", version: "fixed-source-medium/v1" };
    s.capture.policy.quality = "medium";
    s.fingerprint = hash(JSON.stringify(s.capture));
    await store.putSource(id, board, s);
    expect((await store.getSource(id, board))?.capture.settings.quality).toBe("medium");
    const m = measurement(s);
    m.sources![0]!.standing = { complete: true, crown: { x: 10, y: 10 }, leftSole: { x: 15, y: 200 }, rightSole: { x: 25, y: 200 } };
    await store.putMeasurement(id, board, m);
    expect((await store.getMeasurement(id, board))?.sources?.[0]?.standing).toEqual(m.sources![0]!.standing);
  });
  it("saves the shared 27-cell world sheet, and still refuses a size the settings do not match", async () => {
    // The twenty-seven-cell sheet is one paid render. If this schema learns its
    // size only after the render, the sheet is bought and then refused at save -
    // which has already happened twice on this route. So the save path is proven
    // here, before anything at that size is ever dispatched.
    const id = world(), store = new PrismaBoardConditionedCheckpointStore(db), s = source(id);
    // A REAL sheet at the world size, not a 1024 fixture relabelled: the point is
    // that the actual bytes survive the round trip, not that the settings string
    // persists. Twenty-seven blobs on a transparent 4K ground is the shape the
    // shared sheet really has.
    const cells = Array.from({ length: 27 }, (_, i) => ({
      input: Buffer.from('<svg width="340" height="600"><rect width="340" height="600" rx="40" fill="rgb(200,120,90)"/></svg>'),
      left: (i % 9) * 426 + 40, top: Math.floor(i / 9) * 720 + 60,
    }));
    const sheet = await sharp({ create: { width: 3840, height: 2160, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(cells).png().toBuffer();
    s.png = sheet; s.pngSha256 = sha256Bytes(sheet);
    s.capture.settings = { ...fixedSourceSettings("low", "3840x2160") };
    s.capture.policy.size = "3840x2160";
    s.fingerprint = hash(JSON.stringify(s.capture));
    await store.putSource(id, board, s);
    const saved = await store.getSource(id, board);
    expect(saved?.capture.settings.size).toBe("3840x2160");
    expect(saved?.capture.settings.version).toBe("fixed-source-low-3840x2160/v1");
    expect(saved?.png.equals(sheet)).toBe(true);
    const meta = await sharp(saved!.png).metadata();
    expect([meta.width, meta.height]).toEqual([3840, 2160]);

    // Strictness is intact: a policy claiming the world size while the settings
    // still say 1024 is a disagreement, not something to persist.
    // Same world, so the only defect under test is the size disagreement itself.
    const bad = source(id);
    bad.capture.policy.size = "3840x2160";
    bad.fingerprint = hash(JSON.stringify(bad.capture));
    await expect(store.putSource(id, "paris", bad)).rejects.toThrow();
  });
  it("keeps the provider payload bound inside what this store will actually save", () => {
    // A payload the adapter accepts but this store refuses is a sheet that was
    // paid for and then thrown away. Asserting against the adapter's own exported
    // ceiling, not a copy of the number, is what makes a change on either side
    // alone fail here instead of in a paid render.
    expect(FIXED_SOURCE_PAYLOAD_BYTES).toBe((BOARD_CHECKPOINT_LIMITS.sourcePngBytes * 4) / 3);
  });
  it("saves the three-sheet plan's own size and its extra reference atlases", async () => {
    // 1280x2160 is the size actually being bought: same 426x720 cell as 4K, but
    // below the resolution the provider calls experimental. Extra atlases exist
    // because one 1024-square reference cannot carry nine boards of local light.
    const id = world(), store = new PrismaBoardConditionedCheckpointStore(db), s = source(id);
    const sheet = await sharp({ create: { width: 1280, height: 2160, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: Buffer.from('<svg width="340" height="600"><rect width="340" height="600" fill="rgb(180,140,110)"/></svg>'), left: 40, top: 60 }])
      .png().toBuffer();
    s.png = sheet; s.pngSha256 = sha256Bytes(sheet);
    s.capture.settings = { ...fixedSourceSettings("medium", "1280x2160") };
    s.capture.policy.quality = "medium";
    s.capture.policy.size = "1280x2160";
    s.capture.inputOrder = ["style", "identity", "reference-1", "reference-2"];
    s.capture.referenceSha256 = [hash("board light atlas a"), hash("board light atlas b")];
    s.fingerprint = hash(JSON.stringify(s.capture));
    await store.putSource(id, board, s);
    const saved = await store.getSource(id, board);
    expect(saved?.capture.settings.version).toBe("fixed-source-medium-1280x2160/v1");
    expect(saved?.capture.referenceSha256).toHaveLength(2);
    expect(saved?.capture.inputOrder).toEqual(["style", "identity", "reference-1", "reference-2"]);
    expect((await sharp(saved!.png).metadata()).width).toBe(1280);

    // An order that does not account for every atlas is a mismatch, not a detail.
    const bad = source(id);
    bad.capture.inputOrder = ["style", "identity"];
    bad.capture.referenceSha256 = [hash("board light atlas a")];
    bad.fingerprint = hash(JSON.stringify(bad.capture));
    await expect(store.putSource(id, "paris", bad)).rejects.toThrow();
  });
  it("saves an OPAQUE local patch, which has no transparent pixel to cut", async () => {
    // A local patch is the board's own crop with the child drawn into it. The
    // schema pinned background to "transparent", so this would have been bought
    // and then refused at save - the same fault as the size and the effort.
    const id = world(), store = new PrismaBoardConditionedCheckpointStore(db), s = source(id);
    const patch = await sharp({ create: { width: 768, height: 1152, channels: 4, background: { r: 120, g: 90, b: 60, alpha: 255 } } }).png().toBuffer();
    s.png = patch; s.pngSha256 = sha256Bytes(patch);
    s.capture.settings = { ...fixedSourceSettings("medium", "768x1152", "opaque") };
    s.capture.policy.quality = "medium";
    s.capture.policy.size = "768x1152";
    s.capture.policy.background = "opaque";
    s.fingerprint = hash(JSON.stringify(s.capture));
    await store.putSource(id, board, s);
    const saved = await store.getSource(id, board);
    expect(saved?.capture.settings.background).toBe("opaque");
    expect(saved?.capture.settings.version).toBe("fixed-source-medium-768x1152-opaque/v1");
    expect(saved?.png.equals(patch)).toBe(true);
  });
  it("exports only exact scoped lifecycle keys and rejects invalid scope", () => {
    const id = world();
    expect(boardConditionedCheckpointKeys(id, board)).toEqual({ source: storageKey(id), measurement: storageKey(id, "measurement"), sourceFailure: storageKey(id, "source-failure"), observationFailure: storageKey(id, "observation-failure") });
    expect(() => boardConditionedCheckpointKeys(id, "../outside")).toThrow();
  });
  it("durably retains sanitized failure before any source image exists, without settling a charge", async () => {
    const id=world(), store=new PrismaBoardConditionedCheckpointStore(db);
    const receipt=fixedSourceFailureReceipt({worldId:id,requestKey:`board:${board}:source:1`,fingerprint:hash("failure-input"),quality:"medium",
      reason:"charge-evidence",billing:"unknown",jsonStatus:"parsed",response:new Response(null,{status:429,headers:{"x-request-id":"req_failure_test"}}),
      json:{error:{code:"insufficient_quota",type:"insufficient_quota",message:"never retain provider messages"}}});
    expect(await store.getSourceFailure(id,board)).toBeNull();
    await store.putSourceFailure(id,board,receipt);await store.putSourceFailure(id,board,receipt);
    expect(await new PrismaBoardConditionedCheckpointStore(connection()).getSourceFailure(id,board)).toEqual(receipt);
    expect(await store.getSource(id,board)).toBeNull();expect(await db.worldBudgetLedger.count()).toBe(0);
    expect(Buffer.from((await row(id,"source-failure")).data).toString()).not.toContain("never retain provider messages");
    await expectCode(store.putSourceFailure(id,board,{...receipt,httpStatus:401}),"checkpoint-conflict");
    await expectCode(store.putSourceFailure(id,"other-board",receipt),"corrupt-checkpoint");
    await expectCode(store.putSourceFailure(id,board,{...receipt,message:"unexpected extra field"} as typeof receipt),"corrupt-checkpoint");
    await mutate(id,p=>{p.providerErrorCode="raw-private-error";},"source-failure");
    await expectCode(store.getSourceFailure(id,board),"corrupt-checkpoint");
  });
  it("roundtrips exact PNG and capture order across independent clients without Asset or budget writes", async () => {
    const id = world(), s = source(id), store = new PrismaBoardConditionedCheckpointStore(db);
    expect(await store.getSource(id, board)).toBeNull(); expect(await store.getMeasurement(id, board)).toBeNull();
    await store.putSource(id, board, s);
    const reopened = new PrismaBoardConditionedCheckpointStore(connection()), read = (await reopened.getSource(id, board))!;
    expect(read).toEqual(s); expect(Buffer.isBuffer(read.png)).toBe(true);
    expect(JSON.stringify(read.capture)).toBe(JSON.stringify(s.capture)); expect(hash(JSON.stringify(read.capture))).toBe(s.fingerprint);
    const stored = await row(id);
    expect(stored.key.startsWith("private:")).toBe(true); expect(stored.key).not.toContain(id); expect(stored.key).not.toContain(board);
    expect(stored.contentType).toBe("application/vnd.findme.board-conditioned-checkpoint+json");
    read.png.fill(0); read.capture.policy.rateCard.id = "mutated-return-value";
    expect(await reopened.getSource(id, board)).toEqual(s);
    expect(await db.asset.count()).toBe(0); expect(await db.worldBudgetLedger.count()).toBe(0);
  });

  it("same content is idempotent, including harmless metadata key reorder; changed receipt conflicts", async () => {
    const id = world(), s = source(id), store = new PrismaBoardConditionedCheckpointStore(db);
    await store.putSource(id, board, s); const before = await row(id);
    const reordered = { ...s, evidence: Object.fromEntries(Object.entries(s.evidence).reverse()) } as Source;
    await store.putSource(id, board, reordered); expect(await row(id)).toEqual(before);
    await expectCode(store.putSource(id, board, { ...s, evidence: { ...s.evidence, amountMicroUsd: 346 } }), "checkpoint-conflict");
    expect(await store.getSource(id, board)).toEqual(s);
  });

  it("snapshots mutable caller bytes and metadata before its first async read", async () => {
    const id = world(), s = source(id), expected = source(id), store = new PrismaBoardConditionedCheckpointStore(db);
    const pending = store.putSource(id, board, s);
    s.png.fill(0); s.capture.policy.rateCard.id = "caller-mutated"; s.evidence.amountMicroUsd = 999;
    await pending; expect(await store.getSource(id, board)).toEqual(expected);
  });

  it.each([false, true])("actual same-key create race, different content=%s", async different => {
    const id = world(), a = connection(), b = connection(), s = source(id);
    const sa = new PrismaBoardConditionedCheckpointStore(a), sb = new PrismaBoardConditionedCheckpointStore(b);
    raceInitialReads(a, b);
    const other = { ...s, evidence: { ...s.evidence, amountMicroUsd: different ? 999 : s.evidence.amountMicroUsd } };
    const results = await Promise.allSettled([sa.putSource(id, board, s), sb.putSource(id, board, other)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(different ? 1 : 2);
    if (different) expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "checkpoint-conflict" } });
    expect(await db.fileBlob.count({ where: { key: storageKey(id) } })).toBe(1);
  });

  it("retains committed bytes after lost acknowledgement; exact retry does not rewrite or bill", async () => {
    const id = world(), s = source(id), c = connection(), store = new PrismaBoardConditionedCheckpointStore(c);
    const create = c.fileBlob.create.bind(c.fileBlob);
    const spy = vi.spyOn(c.fileBlob, "create").mockImplementationOnce((async (args: Prisma.FileBlobCreateArgs) => {
      await create(args); throw new Error("child-private-image sk-secret_do_not_echo after commit");
    }) as unknown as typeof c.fileBlob.create);
    let failure: unknown; try { await store.putSource(id, board, s); } catch (e) { failure = e; }
    expect(failure).toMatchObject({ code: "storage-unavailable" });
    expect(String(failure)).not.toMatch(/child-private-image|sk-secret/);
    const before = await row(id); await store.putSource(id, board, s);
    expect(await row(id)).toEqual(before); expect(spy).toHaveBeenCalledTimes(1);
    expect(await store.getSource(id, board)).toEqual(s); expect(await db.worldBudgetLedger.count()).toBe(0);
  });

  it.each(["arbitrary", "wrong-model", "wrong-target"])("does not swallow or leak an unrelated create error: %s", async type => {
    const id = world(), c = connection(), store = new PrismaBoardConditionedCheckpointStore(c);
    const error = type === "arbitrary" ? new Error("PRIVATE CHILD BYTES sk-secret_do_not_echo") : new Prisma.PrismaClientKnownRequestError("PRIVATE CHILD BYTES", {
      code: "P2002", clientVersion: Prisma.prismaVersion.client,
      meta: { modelName: type === "wrong-model" ? "Asset" : "FileBlob", target: [type === "wrong-target" ? "data" : "key"] },
    });
    vi.spyOn(c.fileBlob, "create").mockRejectedValueOnce(error);
    await expectCode(store.putSource(id, board, source(id)), "storage-unavailable");
    expect(await c.fileBlob.count({ where: { key: storageKey(id) } })).toBe(0);
  });

  it("sanitizes failed reads and never interprets them as missing checkpoints", async () => {
    const c = connection(), store = new PrismaBoardConditionedCheckpointStore(c);
    vi.spyOn(c.fileBlob, "findUnique").mockRejectedValueOnce(new Error("postgres://secret:password@host/private"));
    await expectCode(store.getSource(world(), board), "storage-unavailable");
  });

  it("scopes both kinds to world plus board, rejecting copied records from another scope", async () => {
    const id = world(), other = world(), store = new PrismaBoardConditionedCheckpointStore(db);
    await store.putSource(id, board, source(id));
    expect(await store.getSource(other, board)).toBeNull(); expect(await store.getSource(id, "amazon")).toBeNull();
    const stored = await row(id);
    await db.fileBlob.create({ data: { key: storageKey(other), data: stored.data, contentType: stored.contentType } });
    await expectCode(store.getSource(other, board), "corrupt-checkpoint");
  });

  it.each(["", "../secret", "https://host", "white space", "x".repeat(241)])("rejects invalid scope without reading: %s", async bad => {
    const c = connection(), store = new PrismaBoardConditionedCheckpointStore(c), read = vi.spyOn(c.fileBlob, "findUnique");
    await expectCode(store.getSource(bad, board), "invalid-scope");
    await expectCode(store.getMeasurement(world(), bad), "invalid-scope");
    expect(read).not.toHaveBeenCalled();
  });

  it.each(["bytes", "fingerprint", "world", "namespace", "model", "quality", "approval"])("rejects invalid generated source binding: %s", async field => {
    const id = world(), s = source(id), store = new PrismaBoardConditionedCheckpointStore(db);
    if (field === "bytes") s.png = Buffer.from("changed source bytes");
    if (field === "fingerprint") s.fingerprint = "0".repeat(64);
    if (field === "world") s.audit.worldId = "another-world";
    if (field === "namespace") s.evidence.providerNamespace = "another:provider";
    if (field === "model") s.evidence.model = "different-model";
    if (field === "quality") (s.capture.settings as { quality: string }).quality = "high";
    if (field === "approval") (s as { semanticApproval: string }).semanticApproval = "approved";
    await expectCode(store.putSource(id, board, s), "invalid-source");
    expect(await store.getSource(id, board)).toBeNull();
  });

  it("bounds source bytes before storage and rejects credential or cyclic metadata without echo", async () => {
    const id = world(), s = source(id), store = new PrismaBoardConditionedCheckpointStore(db);
    await expectCode(store.putSource(id, board, { ...s, png: Buffer.alloc(BOARD_CHECKPOINT_LIMITS.sourcePngBytes + 1) }), "oversized");
    for (const rawUsage of [{ apiKey: "private" }, { nested: "Bearer forbidden-private-token" }, { count: Number.NaN }]) {
      await expectCode(store.putSource(id, board, { ...s, evidence: { ...s.evidence, rawUsage: rawUsage as unknown as Source["evidence"]["rawUsage"] } }), "corrupt-checkpoint");
    }
    const cyclic: Record<string, unknown> = {}; cyclic.loop = cyclic;
    await expectCode(store.putSource(id, board, { ...s, evidence: { ...s.evidence, rawUsage: cyclic as never } }), "corrupt-checkpoint");
    expect(await store.getSource(id, board)).toBeNull();
  });

  it("rejects sparse arrays and accessors without executing child-supplied getters", async () => {
    const id = world(), s = source(id), getter = vi.fn(() => "secret"), store = new PrismaBoardConditionedCheckpointStore(db);
    Object.defineProperty(s, "png", { enumerable: true, get: getter });
    await expectCode(store.putSource(id, board, s), "invalid-source"); expect(getter).not.toHaveBeenCalled();
    const sparse = new Array(2);
    await expectCode(store.putSource(id, board, { ...source(id), evidence: { ...source(id).evidence, rawUsage: { sparse } } }), "corrupt-checkpoint");
    const accessor = [0]; Object.defineProperty(accessor, 0, { get: getter });
    await expectCode(store.putSource(id, board, { ...source(id), evidence: { ...source(id).evidence, rawUsage: { accessor } } }), "corrupt-checkpoint");
    expect(getter).not.toHaveBeenCalled();
  });

  it.each(["envelope-hash", "version", "board", "kind", "base64", "image-hash", "capture", "unknown-field", "shadow-capture", "shadow-png", "content-type", "record-size"])("fails closed on stored corruption: %s", async field => {
    const id = world(), store = new PrismaBoardConditionedCheckpointStore(db);
    await store.putSource(id, board, source(id));
    if (field === "content-type" || field === "record-size" || field === "envelope-hash") {
      const stored = await row(id), envelope = JSON.parse(Buffer.from(stored.data).toString()); envelope.payloadSha256 = "0".repeat(64);
      await db.fileBlob.update({ where: { key: stored.key }, data: field === "content-type" ? { contentType: "image/png" }
        : { data: field === "record-size" ? Buffer.alloc(BOARD_CHECKPOINT_LIMITS.sourceRecordBytes + 1) : Buffer.from(JSON.stringify(envelope)) } });
    } else await mutate(id, (p, e) => {
      if (field === "version") e.version = 2;
      if (field === "board") e.boardId = "amazon";
      if (field === "kind") e.kind = "measurement";
      if (field === "base64") p.pngBase64 = "Zh=="; // decodes but is not canonical base64
      if (field === "image-hash") p.pngSha256 = "0".repeat(64);
      if (field === "capture") p.captureJson = JSON.stringify({ malformed: true });
      if (field === "unknown-field") p.childPrivateData = "must not be silently ignored";
      if (field === "shadow-capture") p.capture = { alternative: true };
      if (field === "shadow-png") p.png = { type: "Buffer", data: [123] };
    });
    await expectCode(store.getSource(id, board), "corrupt-checkpoint");
  });

  it("stores observation separately, bound to an existing same-board source, with idempotent retry", async () => {
    const id = world(), s = source(id), m = measurement(s), store = new PrismaBoardConditionedCheckpointStore(db);
    await expectCode(store.putMeasurement(id, board, m), "invalid-measurement");
    await store.putSource(id, board, s);
    await expectCode(store.putMeasurement(id, board, { ...m, sheetSha256: "0".repeat(64) }), "invalid-measurement");
    await store.putMeasurement(id, board, m); const stored = await row(id, "measurement");
    await store.putMeasurement(id, board, m); expect(await row(id, "measurement")).toEqual(stored);
    expect(await new PrismaBoardConditionedCheckpointStore(connection()).getMeasurement(id, board)).toEqual(m);
    expect(await db.fileBlob.count({ where: { key: { in: [storageKey(id), storageKey(id, "measurement")] } } })).toBe(2);
    await expectCode(store.putMeasurement(id, board, { ...m, fingerprint: hash("different observation") }), "checkpoint-conflict");
    expect(await store.getSource(id, board)).toEqual(s);
  });

  it.each(["uncertain", "invalid"] as const)("retains a billed %s observation without turning it into an approved result", async status => {
    const id = world(), s = source(id), store = new PrismaBoardConditionedCheckpointStore(db);
    const m = { ...measurement(s), status, sources: null };
    await store.putSource(id, board, s); await store.putMeasurement(id, board, m);
    expect(await store.getMeasurement(id, board)).toEqual(m);
  });

  it("rejects malformed successful observations and fails reads if their bound source is corrupted", async () => {
    const id = world(), s = source(id), m = measurement(s), store = new PrismaBoardConditionedCheckpointStore(db);
    await store.putSource(id, board, s);
    await expectCode(store.putMeasurement(id, board, { ...m, sources: null }), "invalid-measurement");
    await expectCode(store.putMeasurement(id, board, { ...m, sources: [m.sources![0]!, m.sources![0]!, m.sources![1]!] }), "invalid-measurement");
    await store.putMeasurement(id, board, m);
    await mutate(id, p => { p.pngSha256 = "0".repeat(64); });
    await expectCode(store.getMeasurement(id, board), "corrupt-checkpoint");
  });

  it("snapshots observation metadata before awaiting its source lookup", async () => {
    const id = world(), s = source(id), m = measurement(s), expected = measurement(s), store = new PrismaBoardConditionedCheckpointStore(db);
    await store.putSource(id, board, s);
    const pending = store.putMeasurement(id, board, m); m.sources![0]!.eye.x = 999; m.evidence.amountMicroUsd = 999;
    await pending; expect(await store.getMeasurement(id, board)).toEqual(expected);
  });

  it.each([undefined, 180_000])("persists legacy/new observer receipt (transport %s) and long response text without truncation", async transportTimeoutMs => {
    const id = world(), s = source(id), m = measurement(s), store = new PrismaBoardConditionedCheckpointStore(db);
    m.evidence.amountMicroUsd = 1000;
    m.receipt = {
      version: "board-pose-observation-receipt/v1", fingerprint: m.fingerprint, sourceImageSha256: m.sheetSha256,
      sourceRgbaSha256: hash("rgba"), wireImageSha256: hash("wire"), promptSha256: hash("observer prompt"),
      slots: m.sources!.map(({ slotId, pose }) => ({ slotId, pose })), coordinates: "native-1024-sheet-pixel-edges",
      modelRequested: "gpt-5.6-sol", modelReturned: m.evidence.model, effort: BOARD_POSE_OBSERVER_SETTINGS.effort, requestId: m.evidence.providerRequestId,
      responseId: "fixture-observer-response", httpStatus: 200, serviceTier: "default", finishReason: "stop",
      responseText: "  " + JSON.stringify({ cells: m.sources, reason: "Observed source only. ".repeat(1500) }) + "\n",
      rawUsage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }, costUnknown: false, costCents: 0.1, attempts: 1,
      ...(transportTimeoutMs === undefined ? {} : { transportTimeoutMs }),
    };
    expect(m.receipt.responseText!.length).toBeGreaterThan(30_000);
    await store.putSource(id, board, s); await store.putMeasurement(id, board, m);
    expect(await store.getMeasurement(id, board)).toEqual(m);
    for (const invalidTimeout of [0, 240_001, 1.5]) {
      const invalid = structuredClone(m); invalid.receipt!.transportTimeoutMs = invalidTimeout;
      await expectCode(store.putMeasurement(id, board, invalid), "invalid-measurement");
    }
    const changed = structuredClone(m); changed.receipt!.responseText += "changed";
    await expectCode(store.putMeasurement(id, board, changed), "checkpoint-conflict");
    for (const field of ["sourceImageSha256", "fingerprint", "requestId"] as const) {
      const invalid = structuredClone(m); invalid.receipt![field] = hash("wrong");
      await expectCode(store.putMeasurement(id, board, invalid), "invalid-measurement");
    }
    const unknown = structuredClone(m); unknown.receipt!.costUnknown = true;
    await expectCode(store.putMeasurement(id, board, unknown), "invalid-measurement");
  });
});
