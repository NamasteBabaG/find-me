import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import {
  PrismaRetainedPurchaseStore, RetainedPurchaseError, retainedPurchaseKey,
} from "../prisma-retained-purchase-store";
import {
  RETAINED_PURCHASE_VERSION, purchaseOnce, retainedPayloadDigest,
  type RetainedPurchase,
} from "../../../services/generation/paid-operation";
import { WorldBudget, type WorldChargeEvidence } from "../../../services/generation/world-budget";
import { CasWorldBudgetRepository } from "../world-budget-repository";
import { PrismaWorldBudgetStore } from "../prisma-world-budget-store";

/**
 * The retained store, on disk, across process boundaries.
 *
 * Everything about `purchaseOnce` rests on one claim: an interruption costs a
 * restart, not a second purchase. Every test of it so far has kept the bytes in
 * a `Map` - which lives exactly as long as the process that bought them, so the
 * one case the design exists for is the one case a Map cannot answer. These use
 * REAL SQLite and, where it matters, a genuinely new client.
 */

let scratch: string, databaseUrl: string, db: PrismaClient;
const clients: PrismaClient[] = [];
let sequence = 0;
const world = () => `sqlite-retained-${++sequence}`;
function client() {
  if (!databaseUrl?.startsWith("file:") || !scratch) throw new Error("Disposable SQLite database has not been initialized");
  const result = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  clients.push(result);
  return result;
}

beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-retained-purchase-"));
  databaseUrl = `file:${path.join(scratch, "retained-test.db").replace(/\\/g, "/")}`;
  db = client();
  await applyTestSchema(db);
}, 120_000);

afterAll(async () => {
  await Promise.all(clients.map(item => item.$disconnect()));
  if (scratch) {
    const resolved = realpathSync(scratch);
    if (path.dirname(resolved) !== realpathSync(tmpdir()) || !path.basename(resolved).startsWith("findme-retained-purchase-")) {
      throw new Error("Refusing cleanup outside the isolated retained-purchase test directory");
    }
    rmSync(resolved, { recursive: true, force: true });
  }
});

afterEach(async () => { await db.worldBudgetLedger.deleteMany({}); });

const bill = (id: string, micro = 48_800): WorldChargeEvidence => ({
  providerNamespace: "openai:find-me-existing", providerRequestId: id, usageId: `usage-${id}`,
  rawUsage: { input_tokens: 10, output_tokens: 100 }, model: "gpt-image-2",
  amountMicroUsd: micro, costBasis: "provider-billed",
});

function record(worldId: string, requestKey: string, over: Partial<RetainedPurchase> = {}): RetainedPurchase {
  const bytes = over.bytes ?? Buffer.from(`the picture that was paid for at ${requestKey}`);
  return {
    version: RETAINED_PURCHASE_VERSION, worldId, requestKey, scope: "image",
    operationFingerprint: "a".repeat(64), payloadSha256: retainedPayloadDigest(bytes),
    evidence: bill("req-1"), unknownReason: null, bytes, ...over,
    ...(over.bytes ? { payloadSha256: retainedPayloadDigest(over.bytes) } : {}),
  };
}

describe("retained purchases on disk", () => {
  it("is still there for a process that did not buy it", async () => {
    const w = world();
    const bought = record(w, "sydney-2:render:1");
    await new PrismaRetainedPurchaseStore(db).put(w, bought.requestKey, bought);

    // A different client, as a restarted worker would build: nothing of the
    // first process is reachable from here except the database file.
    const restarted = new PrismaRetainedPurchaseStore(client());
    const found = await restarted.get(w, bought.requestKey);
    expect(found?.bytes.equals(bought.bytes)).toBe(true);
    expect(found?.evidence).toEqual(bought.evidence);
    expect(found?.operationFingerprint).toBe(bought.operationFingerprint);
  }, 60_000);

  it("keeps the first answer and refuses to be handed a different one", async () => {
    const w = world();
    const store = new PrismaRetainedPurchaseStore(db);
    const first = record(w, "sydney-2:render:1");
    await store.put(w, first.requestKey, first);
    // Writing the same answer again is a restart, not a fault.
    await expect(store.put(w, first.requestKey, record(w, first.requestKey))).resolves.toBeUndefined();

    const other = record(w, first.requestKey, { bytes: Buffer.from("a different child") });
    await expect(store.put(w, first.requestKey, other)).rejects.toThrow(/must not be overwritten/);
    expect((await store.get(w, first.requestKey))?.bytes.toString()).toContain("the picture that was paid for");
  }, 60_000);

  it("raises on a record it cannot read, rather than reporting nothing retained", async () => {
    // "Nothing was retained" is a claim purchaseOnce acts on, and acting on it
    // wrongly buys a paid render a second time.
    const w = world();
    await db.fileBlob.create({ data: { key: retainedPurchaseKey(w, "sydney-2:render:1"),
      contentType: "application/vnd.findme.retained-purchase+json", data: new Uint8Array(Buffer.from("{not json")) } });
    const store = new PrismaRetainedPurchaseStore(db);
    await expect(store.get(w, "sydney-2:render:1")).rejects.toBeInstanceOf(RetainedPurchaseError);
    await expect(store.get(w, "sydney-2:render:1")).rejects.toThrow(/cannot be read/);
  }, 60_000);

  it("refuses a bill that settlement would refuse anyway", async () => {
    // The judge receipts went out for two commits with no cost basis because
    // the fake ledger took anything. A store that keeps such a bill only moves
    // the refusal to after the money has moved.
    const w = world();
    const store = new PrismaRetainedPurchaseStore(db);
    const noBasis = { ...bill("req-1") } as Record<string, unknown>;
    delete noBasis.costBasis;
    await expect(store.put(w, "sydney-2:judge:1", record(w, "sydney-2:judge:1", { scope: "judge", evidence: noBasis as unknown as WorldChargeEvidence })))
      .rejects.toThrow(/not a bill this ledger records|refused at settlement/);

    const empty = { ...bill("req-1"), rawUsage: {} };
    await expect(store.put(w, "sydney-2:judge:1", record(w, "sydney-2:judge:1", { scope: "judge", evidence: empty })))
      .rejects.toThrow(/refused at settlement/);
  }, 60_000);

  it("will not let a purchase be stored at somebody else's address", async () => {
    const w = world();
    const store = new PrismaRetainedPurchaseStore(db);
    const mine = record(w, "sydney-2:render:1");
    await expect(store.put(w, "sydney-3:render:1", mine)).rejects.toThrow(/own address/);
    await expect(store.put(`${w}-other`, mine.requestKey, mine)).rejects.toThrow(/own address/);
  }, 60_000);

  it("keeps two worlds buying the same hide apart", async () => {
    // The ledger is keyed on the world; a store that was not gave the second
    // world the first world's child.
    const a = world(), b = world();
    const store = new PrismaRetainedPurchaseStore(db);
    await store.put(a, "sydney-2:render:1", record(a, "sydney-2:render:1", { bytes: Buffer.from("child A") }));
    await store.put(b, "sydney-2:render:1", record(b, "sydney-2:render:1", { bytes: Buffer.from("child B") }));
    expect((await store.get(a, "sydney-2:render:1"))?.bytes.toString()).toBe("child A");
    expect((await store.get(b, "sydney-2:render:1"))?.bytes.toString()).toBe("child B");
  }, 60_000);

  it("replays a purchase in a process that has nothing in memory", async () => {
    // The whole point, end to end: buy in one process, lose everything but the
    // database, and have the next process answer without dispatching.
    const w = world();
    const request = (fingerprint = "f".repeat(64)) => ({
      worldId: w, requestKey: "sydney-2:kneeling:render:1", scope: "image" as const,
      operationFingerprint: fingerprint, reserveMicroUsd: 120_000,
    });

    const first = { calls: 0 };
    const one = { ledger: new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db))), store: new PrismaRetainedPurchaseStore(db) };
    const bought = await purchaseOnce(one, {
      ...request(),
      buy: async () => { first.calls++; return { bytes: Buffer.from("the render"), evidence: bill("req-render") }; },
    });
    expect(bought.kind).toBe("bought");
    expect(first.calls).toBe(1);

    // A new client and new adapters, holding nothing from the first process.
    const later = client();
    const second = { calls: 0 };
    const two = { ledger: new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(later))), store: new PrismaRetainedPurchaseStore(later) };
    const replayed = await purchaseOnce(two, {
      ...request(),
      buy: async () => { second.calls++; return { bytes: Buffer.from("a second render nobody asked for"), evidence: bill("req-render-2") }; },
    });
    expect(second.calls).toBe(0);
    expect(replayed.kind).toBe("bought");
    expect((replayed as { bytes: Buffer }).bytes.toString()).toBe("the render");
    expect((replayed as { replayed: boolean }).replayed).toBe(true);

    // And a request whose inputs changed is not this purchase, however much of
    // its address it shares: it is a thing for a person, never a silent replay.
    const changed = await purchaseOnce(two, {
      ...request("e".repeat(64)),
      buy: async () => { second.calls++; return { bytes: Buffer.from("x"), evidence: bill("req-render-3") }; },
    });
    expect(second.calls).toBe(0);
    expect(changed.kind).toBe("unresolved");
    expect((changed as { reason: string }).reason).toMatch(/different operation/);
  }, 60_000);

  it("finishes an unpriceable hold from a process that did not buy it", async () => {
    const w = world();
    const request = {
      worldId: w, requestKey: "sydney-2:kneeling:judge:1", scope: "judge" as const,
      operationFingerprint: "d".repeat(64), reserveMicroUsd: 40_000,
    };
    const one = { ledger: new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db))), store: new PrismaRetainedPurchaseStore(db) };
    const answered = await purchaseOnce(one, { ...request, buy: async () => ({ bytes: Buffer.from("the answer"), unknownReason: "no usage to price it with" }) });
    expect(answered.kind).toBe("unresolved");

    const later = client();
    const two = { ledger: new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(later))), store: new PrismaRetainedPurchaseStore(later) };
    let dispatched = 0;
    const again = await purchaseOnce(two, { ...request, buy: async () => { dispatched++; return { bytes: Buffer.from("x"), unknownReason: "y" }; } });
    expect(dispatched).toBe(0);
    expect(again.kind).toBe("unresolved");
    expect((again as { bytes?: Buffer }).bytes?.toString()).toBe("the answer");
    const row = await two.ledger.readRequest(w, request.requestKey);
    expect(row?.state).toBe("unknown");
    expect((await two.ledger.audit(w)).held).toBe(true);
  }, 60_000);
});
