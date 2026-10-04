import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "@/lib/test-schema";
import type { Container } from "../container";
import type { EmailMessage } from "../../infra/email/types";
import { ADMIN_ALERT_PENDING_ACTION, retryFailedAdminAlerts, sendAdminAlert } from "../admin-alert.service";

vi.mock("../local-patch-notifications", () => ({ deliverLocalPatchNotifications: vi.fn(async () => undefined) }));
vi.mock("../admin.service", () => ({ failedSpotsForAdmin: vi.fn(async () => []), generationCostForDisplay: vi.fn(async () => null) }));

// Games, blobs, receipts, transactions, unique indexes and CAS updates use real
// SQLite. Only provider transport and unrelated generation reads are mocked.
let db: PrismaClient, scratch: string, start: number;
const input = { gameId: "game_test", kind: "delivered-with-problems" as const, problems: ["Synthetic current problem"] };
const legacyAction = "admin-alert:delivered-with-problems";
beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-alerts-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  await db.user.create({ data: { id: "parent_test", email: "parent@example.invalid" } });
});
beforeEach(async () => {
  start = Date.now(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(start);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  await db.auditLog.deleteMany(); await db.fileBlob.deleteMany(); await db.game.deleteMany();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
afterAll(async () => {
  await db?.$disconnect();
  if (scratch) {
    const resolved = realpathSync(scratch);
    if (path.dirname(resolved) !== realpathSync(tmpdir()) || !path.basename(resolved).startsWith("findme-alerts-")) throw Error("Refusing cleanup outside isolated alert-test directory");
    rmSync(resolved, { recursive: true, force: true });
  }
});
async function game(id = input.gameId, status = "DELIVERED") {
  await db.game.create({ data: { id, ownerId: "parent_test", status, lastError: "Synthetic current problem", createdAt: new Date(start - 60_000) } });
}
function container(options: { receiptFailure?: boolean } = {}) {
  const requests: EmailMessage[] = [], reads = vi.fn((args: Prisma.AuditLogFindManyArgs) => db.auditLog.findMany(args));
  let receiptFailure = options.receiptFailure === true;
  const writes = vi.fn(async (args: Prisma.AuditLogUpdateManyArgs) => {
    if (receiptFailure && args.data.action === "admin-alert:notification-sent") { receiptFailure = false; throw Error("Synthetic lost receipt write"); }
    return db.auditLog.updateMany(args);
  });
  const auditDelegate = new Proxy(db.auditLog, { get(target, property) {
    if (property === "findMany") return reads;
    if (property === "updateMany") return writes;
    return Reflect.get(target, property);
  } });
  const database = new Proxy(db, { get(target, property) {
    if (property === "auditLog") return auditDelegate;
    const value: unknown = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const send = vi.fn(async (message: EmailMessage) => { requests.push(structuredClone(message)); return { id: "provider_test" }; });
  const c = { db: database, adminEmails: ["ops@example.invalid"], appUrl: "https://example.invalid", email: { id: "console", send } } as unknown as Container;
  return { c, send, requests, reads };
}
async function notices() { return db.auditLog.findMany({ where: { id: { startsWith: "aud_aan_" } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }); }

describe("durable admin notifications with real SQLite", () => {
  it("commits one immutable payload and one unique claim across concurrent direct and cron callers", async () => {
    await game(); const f = container();
    let entered!: () => void, release!: () => void;
    const sending = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
    f.send.mockImplementation(async mail => { f.requests.push(structuredClone(mail)); entered(); await gate; return { id: "provider_test" }; });
    const first = sendAdminAlert(f.c, input), second = sendAdminAlert(f.c, input); await sending;
    const rows = await notices();
    expect(rows).toHaveLength(1); expect(JSON.parse(rows[0]!.metaJson!).state).toBe("sending");
    expect(await db.fileBlob.count()).toBe(1);
    expect((await retryFailedAdminAlerts(f.c)).retried).toBe(0);
    release(); await Promise.all([first, second]);
    expect(f.send).toHaveBeenCalledOnce();
    const receipt = (await notices())[0]!;
    expect(receipt.action).toBe("admin-alert:notification-sent");
    expect(f.requests[0]!.idempotencyKey).toBe(receipt.id);
    const blob = await db.fileBlob.findFirstOrThrow(); expect(JSON.parse(Buffer.from(blob.data).toString())).toEqual(f.requests[0]);
    expect(receipt.metaJson).not.toContain("@example.invalid");
  }, 20_000);

  it("rolls back private payload insertion if durable intent insertion fails", async () => {
    await game(); const f = container();
    // Inject a failure inside the actual isolated database transaction.
    await db.$executeRawUnsafe("CREATE TRIGGER test_alert_intent_failure BEFORE INSERT ON AuditLog WHEN NEW.action = 'admin-alert:notification-pending' BEGIN SELECT RAISE(ABORT, 'synthetic intent failure'); END");
    try {
      await sendAdminAlert(f.c, input);
      expect(f.send).not.toHaveBeenCalled(); expect(await db.fileBlob.count()).toBe(0); expect(await notices()).toEqual([]);
    } finally { await db.$executeRawUnsafe("DROP TRIGGER test_alert_intent_failure"); }
  });

  it.each(["acknowledgement", "receipt write"])("replays the same stored key and body after losing the %s", async loss => {
    await game(); const f = container({ receiptFailure: loss === "receipt write" }), accepted = new Map<string, EmailMessage>();
    f.send.mockImplementation(async mail => {
      f.requests.push(structuredClone(mail)); accepted.set(mail.idempotencyKey!, structuredClone(mail));
      if (loss === "acknowledgement" && f.requests.length === 1) throw Error("Provider accepted; acknowledgement lost");
      return { id: "same_provider_receipt" };
    });
    expect((await sendAdminAlert(f.c, input)).failed).toEqual(["ops@example.invalid"]);
    vi.setSystemTime(start + 2 * 60_000);
    await db.game.update({ where: { id: input.gameId }, data: { lastError: "Different current synthetic problem" } });
    f.c.appUrl = "https://changed.example.invalid";
    expect((await retryFailedAdminAlerts(f.c)).retried).toBe(1);
    expect(f.requests).toHaveLength(2); expect(f.requests[1]).toEqual(f.requests[0]); expect(accepted.size).toBe(1);
    expect(JSON.parse((await notices())[0]!.metaJson!)).toMatchObject({ state: "sent", attempts: 2, firstAttemptAt: start });
  });

  it("crosses tied-timestamp legacy pages and quarantines uncertain failures while preserving lifetime successes", async () => {
    const f = container(), failureTime = new Date(start - 12 * 60 * 60_000), historicalTime = new Date(start - 30 * 86400_000);
    const historical = Array.from({ length: 105 }, (_, i) => ({ id: `legacy_sent_${i}`, actorType: "SYSTEM", action: legacyAction,
      entityType: "Game", entityId: `resolved_${i}`, createdAt: historicalTime, metaJson: JSON.stringify({ sentTo: ["OPS@example.invalid"] }) }));
    const failed = Array.from({ length: 105 }, (_, i) => ({ id: `legacy_failed_${String(i).padStart(3, "0")}`, actorType: "SYSTEM", action: `${legacyAction}:failed`,
      entityType: "Game", entityId: `resolved_${i}`, createdAt: failureTime, metaJson: JSON.stringify({ failedTo: ["ops@example.invalid"] }) }));
    const repeated = Array.from({ length: 25 }, (_, i) => ({ id: `legacy_uncertain_${i}`, actorType: "SYSTEM", action: `${legacyAction}:failed`,
      entityType: "Game", entityId: "uncertain", createdAt: failureTime, metaJson: JSON.stringify({ failedTo: ["ops@example.invalid"] }) }));
    await db.auditLog.createMany({ data: [...historical, ...failed, ...repeated] });
    expect(await retryFailedAdminAlerts(f.c)).toEqual({ retried: 0 });
    const receipts = await notices(); expect(receipts).toHaveLength(106);
    expect(receipts.filter(row => row.action === "admin-alert:notification-sent")).toHaveLength(105);
    expect(receipts.find(row => row.entityId === "uncertain")!.action).toBe("admin-alert:notification-unknown");
    expect(f.reads.mock.calls.filter(([query]) => query.take === 100 && typeof query.where?.action === "object"
      && "in" in query.where.action && query.where.action.in?.includes(`${legacyAction}:failed`))).toHaveLength(2);
    vi.setSystemTime(start + 2 * 86400_000);
    await sendAdminAlert(f.c, { ...input, gameId: "uncertain" }); await sendAdminAlert(f.c, { ...input, gameId: "resolved_0" });
    expect(await retryFailedAdminAlerts(f.c)).toEqual({ retried: 0 });
    expect(f.send).not.toHaveBeenCalled(); expect(await db.fileBlob.count()).toBe(0); expect(await notices()).toHaveLength(106);
  });

  it("gives the 21st new due intent its next turn after a bounded pass of twenty failures", async () => {
    const f = container();
    for (let i = 0; i < 21; i++) { const id = `fresh_${String(i).padStart(2, "0")}`; await game(id, "READY"); await sendAdminAlert(f.c, { ...input, gameId: id }); }
    expect(f.send).not.toHaveBeenCalled();
    await db.game.updateMany({ data: { status: "DELIVERED" } });
    await db.auditLog.updateMany({ where: { action: ADMIN_ALERT_PENDING_ACTION }, data: { createdAt: new Date(start - 1_000) } });
    const lastDueId = (await notices()).at(-1)!.entityId;
    vi.setSystemTime(start + 2 * 60_000);
    f.send.mockImplementation(async mail => { f.requests.push(structuredClone(mail)); throw Error("Synthetic provider outage"); });
    expect(await retryFailedAdminAlerts(f.c)).toEqual({ retried: 0 }); expect(f.requests).toHaveLength(20);
    expect((await notices()).filter(row => JSON.parse(row.metaJson!).attempts === 0)).toHaveLength(1);
    await retryFailedAdminAlerts(f.c); expect(f.requests).toHaveLength(21); expect(f.requests.at(-1)!.text).toContain(`/admin/orders/${lastDueId}`);
    expect((await notices()).every(row => JSON.parse(row.metaJson!).attempts === 1)).toBe(true);
    vi.setSystemTime(start + 4 * 60_000);
    f.send.mockImplementation(async mail => { f.requests.push(structuredClone(mail)); return { id: "provider_recovered" }; });
    expect((await retryFailedAdminAlerts(f.c)).retried).toBe(20); expect((await retryFailedAdminAlerts(f.c)).retried).toBe(1);
    expect((await notices()).every(row => row.action === "admin-alert:notification-sent")).toBe(true);
    expect(f.requests).toHaveLength(42);
  }, 20_000);
});
