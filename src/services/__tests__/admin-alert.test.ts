import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Container } from "../container";
import type { EmailMessage } from "../../infra/email/types";
import { retryFailedAdminAlerts, sendAdminAlert } from "../admin-alert.service";
import { adminAlertEmail } from "../email/templates";

vi.mock("../local-patch-notifications", () => ({ deliverLocalPatchNotifications: vi.fn(async () => undefined) }));
vi.mock("../admin.service", () => ({ failedSpotsForAdmin: vi.fn(async () => []), generationCostForDisplay: vi.fn(async () => null) }));

type Row = { id: string; action: string; entityType: string; entityId: string; metaJson: string; createdAt: Date };
type Game = { id: string; ownerId: string | null; status: string; deletedAt: Date | null; updatedAt: Date; paidAt: Date | null;
  lastError: string | null; childProfile: { displayName: string } | null; owner: { email: string } | null; scenes: unknown[];
  jobs: Array<{ status: string; currentStep: string | null; updatedAt: Date }>;
  orders: Array<{ paymentStatus: string; paidAt: Date | null; refundedAt: Date | null }> };
type Query = { where?: Record<string, unknown>; data?: Record<string, unknown>; take?: number; cursor?: { id: string }; skip?: number;
  orderBy?: Record<string, "asc" | "desc"> | Array<Record<string, "asc" | "desc">> };
const start = new Date("2026-09-06T00:00:00Z");
const input = { gameId: "game_x", kind: "delivered-with-problems" as const, problems: ["A synthetic test issue"] };
const copy = <T,>(value: T): T => structuredClone(value);
function atMinute(minute: number) { vi.setSystemTime(start.getTime() + minute * 60_000); }
function matches(value: unknown, filter: unknown): boolean {
  if (filter && typeof filter === "object" && !(filter instanceof Date)) {
    const f = filter as { in?: unknown[]; lte?: Date; gt?: Date };
    if (f.in) return f.in.includes(value);
    if (f.lte && (!(value instanceof Date) || value > f.lte)) return false;
    if (f.gt && (!(value instanceof Date) || value <= f.gt)) return false;
    return true;
  }
  return value instanceof Date && filter instanceof Date ? value.getTime() === filter.getTime() : value === filter;
}

/** Snapshot-returning CAS and serialized transactions model two independent
 * workers. Real SQLite tests separately prove persistence and unique indexes. */
function fakes(admins = ["ops@example.test"]) {
  const audits: Row[] = [], blobs = new Map<string, { key: string; data: Uint8Array }>(), requests: EmailMessage[] = [];
  const games = new Map<string, Game>();
  let queue = Promise.resolve(), beforeTransaction: (() => void) | undefined;
  const game = (id = input.gameId) => {
    if (!games.has(id)) games.set(id, { id, ownerId: null, status: "DELIVERED", deletedAt: null, updatedAt: new Date(), paidAt: new Date(),
      lastError: "A current synthetic problem", childProfile: { displayName: "Test character" }, owner: { email: "parent@example.test" }, scenes: [], jobs: [], orders: [] });
    return games.get(id)!;
  };
  const auditLog = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => copy(audits.find(row => row.id === where.id) ?? null)),
    findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => {
      const row = audits.find(row => row.id === where.id); if (!row) throw Error("missing row"); return copy(row);
    }),
    findMany: vi.fn(async ({ where = {}, orderBy, take, cursor, skip = 0 }: Query) => {
      const rows = audits.filter(row => Object.entries(where).every(([key, filter]) => matches(row[key as keyof Row], filter)));
      const orders = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
      rows.sort((a, b) => { for (const order of orders) for (const [key, direction] of Object.entries(order)) {
        const diff = key === "createdAt" ? a.createdAt.getTime() - b.createdAt.getTime() : a.id.localeCompare(b.id);
        if (diff) return direction === "desc" ? -diff : diff;
      } return 0; });
      const offset = (cursor ? rows.findIndex(row => row.id === cursor.id) : 0) + skip;
      return copy(rows.slice(offset, take === undefined ? undefined : offset + take));
    }),
    create: vi.fn(async ({ data }: Query) => {
      if (audits.some(row => row.id === data!.id)) throw Object.assign(Error("duplicate"), { code: "P2002" });
      const row = { ...data, createdAt: data!.createdAt ?? new Date() } as unknown as Row; audits.push(copy(row)); return copy(row);
    }),
    updateMany: vi.fn(async ({ where = {}, data }: Query) => {
      let count = 0; for (const row of audits) if (Object.entries(where).every(([key, filter]) => matches(row[key as keyof Row], filter))) {
        Object.assign(row, data); count++;
      } return { count };
    }),
  };
  const db = {
    auditLog,
    fileBlob: {
      create: vi.fn(async ({ data }: { data: { key: string; data: Uint8Array } }) => {
        if (blobs.has(data.key)) throw Object.assign(Error("duplicate"), { code: "P2002" }); blobs.set(data.key, copy(data)); return copy(data);
      }),
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => copy(blobs.get(where.key) ?? null)),
    },
    game: {
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => copy(game(where.id))),
      updateMany: vi.fn(async ({ where = {} }: Query) => ({ count: Object.entries(where).every(([key, filter]) => matches(game(String(where.id))[key as keyof Game], filter)) ? 1 : 0 })),
    },
    $transaction: async <T,>(work: (tx: unknown) => Promise<T>) => {
      const previous = queue; let release!: () => void; queue = new Promise<void>(resolve => { release = resolve; }); await previous;
      const priorIds = new Set(audits.map(row => row.id)), priorKeys = new Set(blobs.keys());
      try { beforeTransaction?.(); beforeTransaction = undefined; return await work(db); }
      catch (error) {
        // Roll back this transaction's new intent only. Replacing all rows
        // would incorrectly erase another worker's concurrent metadata CAS.
        for (let i = audits.length - 1; i >= 0; i--) if (audits[i]!.id.startsWith("aud_aan_") && !priorIds.has(audits[i]!.id)) audits.splice(i, 1);
        for (const key of blobs.keys()) if (!priorKeys.has(key)) blobs.delete(key);
        throw error;
      }
      finally { release(); }
    },
  };
  const send = vi.fn(async (mail: EmailMessage) => { requests.push(copy(mail)); return { id: "provider_test" }; });
  const c = { db, email: { id: "console", send }, adminEmails: admins, appUrl: "https://example.test" } as unknown as Container;
  const notices = () => audits.filter(row => row.id.startsWith("aud_aan_"));
  const meta = (id = input.gameId) => JSON.parse(notices().find(row => row.entityId === id)!.metaJson) as Record<string, unknown>;
  return { c, db, audits, blobs, send, requests, game, notices, meta, beforeTransaction: (hook: () => void) => { beforeTransaction = hook; } };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(start); vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("durable internal admin notifications", () => {
  it("sends once per normalized recipient for the lifetime of the game and kind", async () => {
    const f = fakes([" OPS@example.test ", "ops@example.test"]);
    expect((await sendAdminAlert(f.c, input)).sent).toEqual(["ops@example.test"]);
    atMinute(366); await sendAdminAlert(f.c, { ...input, error: "Changed error" });
    atMinute(1500); await retryFailedAdminAlerts(f.c); await sendAdminAlert(f.c, input);
    expect(f.send).toHaveBeenCalledTimes(1); expect(f.notices()).toHaveLength(1);
    expect(f.meta().state).toBe("sent"); expect(f.requests[0]!.idempotencyKey).toMatch(/^aud_aan_/);
    expect(f.notices()[0]!.metaJson).not.toContain("@example.test");
  });

  it("atomically claims one send across simultaneous callers", async () => {
    const f = fakes(); let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    f.send.mockImplementation(async mail => { f.requests.push(copy(mail)); await barrier; return { id: "provider_test" }; });
    const first = sendAdminAlert(f.c, input), second = sendAdminAlert(f.c, input);
    for (let i = 0; i < 30 && f.requests.length === 0; i++) await Promise.resolve();
    release(); await Promise.all([first, second]);
    expect(f.send).toHaveBeenCalledTimes(1); expect(f.blobs.size).toBe(1); expect(f.meta().state).toBe("sent");
  });

  it("reuses immutable body and key after provider acceptance with a lost acknowledgement", async () => {
    const f = fakes(), accepted = new Map<string, EmailMessage>();
    f.send.mockImplementation(async mail => {
      f.requests.push(copy(mail)); if (!accepted.has(mail.idempotencyKey!)) accepted.set(mail.idempotencyKey!, copy(mail));
      if (f.requests.length === 1) throw Error("Accepted, response lost"); return { id: "same_provider_id" };
    });
    expect((await sendAdminAlert(f.c, input)).failed).toEqual(["ops@example.test"]);
    expect((await retryFailedAdminAlerts(f.c)).retried).toBe(0);
    f.game().childProfile!.displayName = "Changed synthetic character"; f.c.appUrl = "https://changed.example.test";
    atMinute(2); expect((await retryFailedAdminAlerts(f.c)).retried).toBe(1);
    expect(f.requests[1]).toEqual(f.requests[0]); expect(accepted.size).toBe(1); expect(f.meta().attempts).toBe(2);
  });

  it("retains the authoritative receipt if writing the historical audit fails", async () => {
    const f = fakes(), create = f.db.auditLog.create.getMockImplementation()!;
    f.db.auditLog.create.mockImplementation(async args => {
      if (args.data?.action === "admin-alert:delivered-with-problems") throw Error("Secondary audit unavailable"); return create(args);
    });
    expect((await sendAdminAlert(f.c, input)).sent).toHaveLength(1);
    atMinute(366); await retryFailedAdminAlerts(f.c); await sendAdminAlert(f.c, input);
    expect(f.send).toHaveBeenCalledTimes(1); expect(f.meta().state).toBe("sent");
  });

  it("replays the same provider payload if acceptance succeeds but durable receipt writing fails", async () => {
    const f = fakes(), update = f.db.auditLog.updateMany.getMockImplementation()!; let failOnce = true;
    f.db.auditLog.updateMany.mockImplementation(async args => {
      if (args.data?.action === "admin-alert:notification-sent" && failOnce) { failOnce = false; throw Error("Receipt write unavailable"); }
      return update(args);
    });
    expect((await sendAdminAlert(f.c, input)).failed).toHaveLength(1);
    atMinute(2); expect((await retryFailedAdminAlerts(f.c)).retried).toBe(1);
    expect(f.requests).toHaveLength(2); expect(f.requests[1]).toEqual(f.requests[0]); expect(f.meta().state).toBe("sent");
  });

  it("shares claims between direct delivery and cron", async () => {
    const f = fakes(); f.send.mockRejectedValueOnce(Error("Transport failed")); await sendAdminAlert(f.c, input); atMinute(2);
    await Promise.all([sendAdminAlert(f.c, input), retryFailedAdminAlerts(f.c)]);
    expect(f.send).toHaveBeenCalledTimes(2); expect(f.meta().state).toBe("sent");
  });

  it("bounds uncertain transport to three total attempts and never restarts after a day", async () => {
    const f = fakes(); f.send.mockRejectedValue(Error("Transport failed")); await sendAdminAlert(f.c, input);
    atMinute(2); await retryFailedAdminAlerts(f.c); atMinute(4); await retryFailedAdminAlerts(f.c);
    atMinute(6); await retryFailedAdminAlerts(f.c); atMinute(1500); await sendAdminAlert(f.c, input);
    expect(f.send).toHaveBeenCalledTimes(3); expect(f.meta().state).toBe("unknown"); expect(f.meta().attempts).toBe(3);
  });

  it("measures the 23-hour retry bound from the original attempt", async () => {
    const f = fakes(); f.send.mockRejectedValue(Error("Transport failed")); await sendAdminAlert(f.c, input);
    atMinute(1379); await retryFailedAdminAlerts(f.c); atMinute(1381); await retryFailedAdminAlerts(f.c);
    expect(f.send).toHaveBeenCalledTimes(2); expect(f.meta().firstAttemptAt).toBe(start.getTime()); expect(f.meta().state).toBe("unknown");
  });

  it.each(["sent", "failed"])("never replays unkeyed historical %s attempts, even older than 24 hours", async state => {
    const f = fakes(); f.audits.push({ id: "old", action: `admin-alert:delivered-with-problems${state === "failed" ? ":failed" : ""}`,
      entityType: "Game", entityId: input.gameId, createdAt: new Date(start.getTime() - 30 * 86400_000),
      metaJson: JSON.stringify(state === "sent" ? { sentTo: ["OPS@example.test"] } : { failedTo: ["ops@example.test"] }) });
    await sendAdminAlert(f.c, input); atMinute(1500); await retryFailedAdminAlerts(f.c); await sendAdminAlert(f.c, input);
    expect(f.send).not.toHaveBeenCalled(); expect(f.blobs.size).toBe(0); expect(f.meta().state).toBe(state === "sent" ? "sent" : "unknown");
  });

  it.each(["DELIVERED", "READY", "REFUNDED", "DELETED", "CANCELLED"])("cancels queued generation failures after status becomes %s", async status => {
    const f = fakes(); f.game().status = "GENERATION_FAILED"; f.send.mockRejectedValueOnce(Error("Transport failed"));
    await sendAdminAlert(f.c, { ...input, kind: "generation-failed" }); f.game().status = status; atMinute(2);
    await retryFailedAdminAlerts(f.c); expect(f.send).toHaveBeenCalledTimes(1); expect(f.meta().state).toBe("cancelled");
  });

  it("rejects refunded orders and deleted games even before intent creation", async () => {
    const f = fakes(); f.game().status = "GENERATION_FAILED";
    f.game().orders = [{ paymentStatus: "REFUNDED", paidAt: start, refundedAt: start }]; await sendAdminAlert(f.c, { ...input, kind: "generation-failed" });
    f.game().orders = []; f.game().deletedAt = start; await sendAdminAlert(f.c, { ...input, kind: "generation-failed" });
    expect(f.send).not.toHaveBeenCalled(); expect(f.notices()).toHaveLength(0);
  });

  it("allows a current canonical-identity failure held for service investigation", async () => {
    const f = fakes(); f.game().status = "MANUAL_REVIEW"; f.game().jobs = [{ status: "FAILED", currentStep: "identity", updatedAt: start }];
    expect((await sendAdminAlert(f.c, { ...input, kind: "generation-failed" })).sent).toHaveLength(1);
  });

  it("rechecks fresh heartbeat and verified payment before dispatching stalled notices", async () => {
    const f = fakes(); f.game().status = "TARGETS_GENERATING";
    f.game().orders = [{ paymentStatus: "PAID", paidAt: start, refundedAt: null }];
    f.game().jobs = [{ status: "RUNNING", currentStep: "drawing", updatedAt: start }]; atMinute(31);
    f.send.mockRejectedValueOnce(Error("Transport failed")); await sendAdminAlert(f.c, { ...input, kind: "generation-stalled" });
    atMinute(33); f.game().jobs[0]!.updatedAt = new Date(); await retryFailedAdminAlerts(f.c);
    expect(f.send).toHaveBeenCalledTimes(1); expect(f.meta().state).toBe("cancelled");
    const old = fakes(); old.game().status = "MANUAL_REVIEW"; old.game().orders = [{ paymentStatus: "PAID", paidAt: new Date(start.getTime() - 2 * 86400_000), refundedAt: null }];
    await sendAdminAlert(old.c, { ...input, kind: "generation-stalled" }); expect(old.send).not.toHaveBeenCalled();
  });

  it("defers a published problem report until customer delivery without consuming attempts", async () => {
    const f = fakes(); f.game().status = "READY";
    await sendAdminAlert(f.c, input); expect(f.meta().attempts).toBe(0); expect(f.meta().firstAttemptAt).toBeNull();
    atMinute(2); await retryFailedAdminAlerts(f.c); expect(f.send).not.toHaveBeenCalled(); expect(f.meta().attempts).toBe(0);
    f.game().status = "DELIVERED"; atMinute(4); expect((await retryFailedAdminAlerts(f.c)).retried).toBe(1);
    expect(f.send).toHaveBeenCalledTimes(1);
  });

  it("does not send an input-only or resolved delivered problem", async () => {
    const f = fakes(); f.game().lastError = null; await sendAdminAlert(f.c, input);
    expect(f.notices()).toHaveLength(0);
    f.game().lastError = "Current issue"; f.send.mockRejectedValueOnce(Error("Transport failed")); await sendAdminAlert(f.c, input);
    f.game().lastError = null; atMinute(2); await retryFailedAdminAlerts(f.c);
    expect(f.send).toHaveBeenCalledTimes(1); expect(f.meta().state).toBe("cancelled");
  });

  it("cancels removed recipients and tampered private payloads", async () => {
    const f = fakes(); f.send.mockRejectedValueOnce(Error("Transport failed")); await sendAdminAlert(f.c, input);
    f.c.adminEmails = ["replacement@example.test"]; atMinute(2); await retryFailedAdminAlerts(f.c);
    expect(f.send).toHaveBeenCalledTimes(1); expect(f.meta().state).toBe("cancelled");
    const tampered = fakes(); tampered.game().status = "READY"; await sendAdminAlert(tampered.c, input);
    tampered.blobs.values().next().value!.data = Buffer.from("tampered"); tampered.game().status = "DELIVERED";
    atMinute(4); await retryFailedAdminAlerts(tampered.c); expect(tampered.send).not.toHaveBeenCalled(); expect(tampered.meta().state).toBe("cancelled");
  });

  it("cannot recreate private payloads when deletion wins after context loading", async () => {
    const f = fakes(); f.beforeTransaction(() => { f.game().deletedAt = new Date(); f.game().status = "DELETED"; });
    await sendAdminAlert(f.c, input);
    expect(f.send).not.toHaveBeenCalled(); expect(f.blobs.size).toBe(0); expect(f.notices()).toHaveLength(0);
    expect(f.db.game.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ deletedAt: null, ownerId: null, status: "DELIVERED", updatedAt: start }) }));
  });

  it("fails closed for noncanonical game IDs before private persistence", async () => {
    const f = fakes(); await sendAdminAlert(f.c, { ...input, gameId: "../foreign" });
    expect(f.send).not.toHaveBeenCalled(); expect(f.blobs.size).toBe(0);
  });

  it("does not spend an attempt if claiming exhausts the invocation deadline", async () => {
    const f = fakes(), update = f.db.auditLog.updateMany.getMockImplementation()!;
    f.db.auditLog.updateMany.mockImplementation(async args => {
      const result = await update(args);
      if (args.data?.metaJson && JSON.parse(String(args.data.metaJson)).state === "sending") vi.setSystemTime(Date.now() + 18_000);
      return result;
    });
    await sendAdminAlert(f.c, input); expect(f.send).not.toHaveBeenCalled(); expect(f.meta().attempts).toBe(0);
    f.db.auditLog.updateMany.mockImplementation(update); await retryFailedAdminAlerts(f.c); expect(f.send).toHaveBeenCalledTimes(1);
  });

  it("gives the 21st due intent a turn after twenty failed attempts", async () => {
    const f = fakes(); f.send.mockRejectedValue(Error("Transport failed"));
    for (let i = 0; i < 21; i++) await sendAdminAlert(f.c, { ...input, gameId: `game_${String(i).padStart(2, "0")}` });
    atMinute(2); const before = f.send.mock.calls.length; await retryFailedAdminAlerts(f.c); expect(f.send.mock.calls.length - before).toBe(20);
    const remaining = f.notices().find(row => JSON.parse(row.metaJson).attempts === 1)!;
    // Twenty retried rows are backoff-delayed; the remaining row is still due.
    await retryFailedAdminAlerts(f.c); expect(f.send.mock.calls.at(-1)![0].text).toContain(`/admin/orders/${remaining.entityId}`);
  });

  it("keeps independent recipient receipts and never mails a newly added admin from cron", async () => {
    const f = fakes(["one@example.test", "two@example.test"]);
    f.send.mockImplementation(async mail => { f.requests.push(copy(mail)); if (mail.to.startsWith("two")) throw Error("Transport failed"); return { id: "provider_test" }; });
    await sendAdminAlert(f.c, input); f.c.adminEmails!.push("new@example.test"); atMinute(2);
    f.send.mockImplementation(async mail => { f.requests.push(copy(mail)); return { id: "provider_test" }; });
    await retryFailedAdminAlerts(f.c); atMinute(366); await retryFailedAdminAlerts(f.c);
    expect(f.requests.map(mail => mail.to)).toEqual(["one@example.test", "two@example.test", "two@example.test"]);
  });

  it.each([null, 0, 3345])("renders cost %s distinctly in plain and HTML mail", costCents => {
    const mail = adminAlertEmail({ kind: "held-for-review", gameId: "game", adminUrl: "https://example.test/admin", childName: "Test character", ownerEmail: null,
      status: "MANUAL_REVIEW", sceneCount: 9, problems: [], failedSpots: [], costCents });
    const label = costCents === null ? "לא ידועה" : `$${(costCents / 100).toFixed(2)}`;
    expect(mail.text).toContain(`עלות עד עכשיו: ${label}`); expect(mail.html).toContain(`עלות עד עכשיו: ${label}`);
  });

  it("does not propagate a database outage or send without a durable claim", async () => {
    const f = fakes(); f.db.auditLog.findMany.mockRejectedValue(Error("Database failed"));
    await expect(sendAdminAlert(f.c, input)).resolves.toEqual({ sent: [], failed: [], skipped: [] });
    await expect(retryFailedAdminAlerts(f.c)).resolves.toEqual({ retried: 0 }); expect(f.send).not.toHaveBeenCalled();
  });
});
