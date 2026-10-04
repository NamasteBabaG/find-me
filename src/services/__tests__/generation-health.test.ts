import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../lib/test-schema";
import type { Container } from "../container";

const send = vi.hoisted(() => vi.fn());
vi.mock("../admin-alert.service", () => ({ sendAdminAlert: send }));
import { alertStalledGeneration, generationConcern, generationHealthConcern, GENERATION_ALERT_FRESH_MS } from "../generation-health.service";

let scratch: string, db: PrismaClient, c: Container;
beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "findme-generation-health-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  await db.user.create({ data: { id: "parent", email: "parent@example.invalid" } });
  c = { db, adminEmails: ["ops@example.invalid"] } as Container;
}, 30_000);
beforeEach(async () => {
  send.mockReset().mockResolvedValue({ sent: ["ops@example.invalid"], failed: [], skipped: [] });
  await db.auditLog.deleteMany(); await db.generationJob.deleteMany(); await db.order.deleteMany(); await db.game.deleteMany();
});
afterEach(() => { vi.useRealTimers(); });
afterAll(async () => {
  await db?.$disconnect();
  if (scratch && path.dirname(scratch) === tmpdir() && path.basename(scratch).startsWith("findme-generation-health-")) await rm(scratch, { recursive: true, force: true });
});
async function seed(id: string, options: { status?: string; step?: string; refunded?: boolean; paid?: boolean; stale?: boolean; createdAt?: Date; paidAt?: Date } = {}) {
  const paidAt = options.paidAt ?? new Date(Date.now() - 31 * 60_000);
  await db.game.create({ data: { id, ownerId: "parent", status: options.status ?? "TARGETS_GENERATING", paidAt,
    ...(options.createdAt ? { createdAt: options.createdAt } : {}) } });
  await db.order.create({ data: { id: `ord_${id}`, gameId: id, userId: "parent", provider: "mock", packageTier: "ONE_WORLD", amountAgorot: 1,
    paymentStatus: options.refunded ? "REFUNDED" : options.paid === false ? "PENDING" : "PAID", paidAt,
    ...(options.refunded ? { refundedAt: new Date() } : {}) } });
  await db.generationJob.create({ data: { id: `job_${id}`, gameId: id, status: "QUEUED", currentStep: options.step ?? "local-patch",
    updatedAt: options.stale === false ? new Date() : paidAt } });
}

describe("bounded discovery of stalled paid games", () => {
  it("finds a stale game and an immediate budget hold; ignores healthy, unpaid, refunded and delivered games", async () => {
    await seed("stale"); await seed("held", { step: "local-patch:recovery-budget-wait", stale: false });
    await seed("healthy", { stale: false }); await seed("unpaid", { paid: false });
    await seed("refunded", { refunded: true }); await seed("finished", { status: "DELIVERED" });
    expect(await alertStalledGeneration(c)).toEqual({ attempted: 2 });
    expect(send.mock.calls.map(([, notice]) => notice.gameId).sort()).toEqual(["held", "stale"]);
    expect(send.mock.calls.every(([, notice]) => notice.kind === "generation-stalled")).toBe(true);
    expect(await alertStalledGeneration(c)).toEqual({ attempted: 0 });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("claims a durable notification before sending so overlapping cron passes do not duplicate it", async () => {
    await seed("concurrent");
    let entered!: () => void, finish!: () => void;
    const sending = new Promise<void>(resolve => { entered = resolve; });
    send.mockImplementation(async () => { entered(); await new Promise<void>(resolve => { finish = resolve; }); return { sent: ["ops@example.invalid"], failed: [], skipped: [] }; });
    const first = alertStalledGeneration(c); await sending;
    expect(await alertStalledGeneration(c)).toEqual({ attempted: 0 });
    finish(); expect(await first).toEqual({ attempted: 1 });
    expect(send).toHaveBeenCalledOnce();
    expect(JSON.parse((await db.auditLog.findFirstOrThrow()).metaJson!)).toMatchObject({ state: "done", leaseUntil: 0 });
  });
  it("keeps the same successful claim across six-hour buckets and later fresh payment evidence", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.now();
    await seed("stable", { createdAt: new Date(start - 60_000) });
    expect(await alertStalledGeneration(c)).toEqual({ attempted: 1 });
    const claim = await db.auditLog.findFirstOrThrow();
    vi.setSystemTime(start + 6 * 60 * 60_000 + 1);
    expect(await alertStalledGeneration(c)).toEqual({ attempted: 0 });
    vi.setSystemTime(start + GENERATION_ALERT_FRESH_MS + 1);
    expect(await alertStalledGeneration(c)).toEqual({ attempted: 0 });
    // A recent verified payment must not renew the already-reported incident.
    await db.order.update({ where: { id: "ord_stable" }, data: { paidAt: new Date(Date.now() - 31 * 60_000) } });
    expect(await alertStalledGeneration(c)).toEqual({ attempted: 0 });
    expect(send).toHaveBeenCalledOnce();
    expect(await db.auditLog.findMany()).toEqual([claim]);
  });
  it("seeds permanent done claims from historical delivered alerts, bucket claims and durable sender receipts", async () => {
    for (const id of ["legacy_alert", "legacy_bucket", "outbox_sent", "failed_only", "unknown_only", "wrong_kind"]) await seed(id);
    await db.auditLog.createMany({ data: [
      { id: "old_alert", action: "admin-alert:generation-stalled", entityType: "Game", entityId: "legacy_alert", metaJson: JSON.stringify({ sentTo: ["ops@example.invalid"] }) },
      { id: "old_bucket", action: "generation:health-alert", entityType: "Game", entityId: "legacy_bucket", metaJson: JSON.stringify({ state: "done", leaseUntil: 0, nextAttemptAt: 0 }) },
      { id: "sent_receipt", action: "admin-alert:notification-sent", entityType: "Game", entityId: "outbox_sent", metaJson: JSON.stringify({ version: "admin-alert-notification/v1", kind: "generation-stalled", state: "sent" }) },
      { id: "failed_alert", action: "admin-alert:generation-stalled:failed", entityType: "Game", entityId: "failed_only", metaJson: JSON.stringify({ failedTo: ["ops@example.invalid"] }) },
      { id: "malformed_alert", action: "admin-alert:generation-stalled", entityType: "Game", entityId: "failed_only", metaJson: "{bad json" },
      { id: "unknown_receipt", action: "admin-alert:notification-sent", entityType: "Game", entityId: "unknown_only", metaJson: JSON.stringify({ version: "admin-alert-notification/v1", kind: "generation-stalled", state: "unknown" }) },
      { id: "wrong_receipt", action: "admin-alert:notification-sent", entityType: "Game", entityId: "wrong_kind", metaJson: JSON.stringify({ version: "admin-alert-notification/v1", kind: "generation-failed", state: "sent" }) },
    ].map(row => ({ ...row, actorType: "SYSTEM" })) });
    expect(await alertStalledGeneration(c)).toEqual({ attempted: 3 });
    expect(send.mock.calls.map(([, notice]) => notice.gameId).sort()).toEqual(["failed_only", "unknown_only", "wrong_kind"]);
    const stable = await db.auditLog.findMany({ where: { id: { startsWith: "aud_ghealth_" } } });
    expect(stable).toHaveLength(6);
    expect(stable.every(row => JSON.parse(row.metaJson!).state === "done")).toBe(true);
    expect(await alertStalledGeneration(c)).toEqual({ attempted: 0 });
  });
  it("does not duplicate historical incidents when rollout sweeps overlap", async () => {
    await seed("old_receipt");
    await db.auditLog.create({ data: { id: "historic_success", actorType: "SYSTEM", action: "admin-alert:generation-stalled", entityType: "Game", entityId: "old_receipt",
      metaJson: JSON.stringify({ sentTo: ["ops@example.invalid"] }) } });
    expect(await Promise.all([alertStalledGeneration(c), alertStalledGeneration(c)])).toEqual([{ attempted: 0 }, { attempted: 0 }]);
    expect(send).not.toHaveBeenCalled();
    expect(await db.auditLog.count({ where: { id: { startsWith: "aud_ghealth_" } } })).toBe(1);
  });
  it("finds historical success beyond a full page of unsent claims", async () => {
    await seed("history_pages");
    await db.auditLog.createMany({ data: Array.from({ length: 100 }, (_, i) => ({ id: `old_pending_${String(i).padStart(3, "0")}`,
      actorType: "SYSTEM", action: "generation:health-alert", entityType: "Game", entityId: "history_pages", metaJson: JSON.stringify({ state: "pending", leaseUntil: 0, nextAttemptAt: 0 }) })) });
    await db.auditLog.create({ data: { id: "z_old_success", actorType: "SYSTEM", action: "admin-alert:generation-stalled", entityType: "Game", entityId: "history_pages",
      metaJson: JSON.stringify({ sentTo: ["ops@example.invalid"] }) } });
    expect(await alertStalledGeneration(c)).toEqual({ attempted: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(JSON.parse((await db.auditLog.findFirstOrThrow({ where: { id: { startsWith: "aud_ghealth_" } } })).metaJson!).state).toBe("done");
  });
  it("ignores old paid games even when created recently, and includes old drafts paid recently", async () => {
    await seed("old_paid", { paidAt: new Date(Date.now() - GENERATION_ALERT_FRESH_MS - 60_000), createdAt: new Date(Date.now() - 1_000), step: "local-patch:needs-release" });
    await seed("old_draft", { createdAt: new Date(Date.now() - 7 * GENERATION_ALERT_FRESH_MS) });
    const games = await db.game.findMany(), jobs = await db.generationJob.findMany();
    expect(await alertStalledGeneration(c)).toEqual({ attempted: 1 });
    expect(send.mock.calls[0]![1].gameId).toBe("old_draft");
    expect(await db.auditLog.count({ where: { entityId: "old_paid" } })).toBe(0);
    expect(await db.game.findMany()).toEqual(games);
    expect(await db.generationJob.findMany()).toEqual(jobs);
  });
  it("keeps failed delivery retryable instead of recording a sent notification", async () => {
    await seed("outage"); send.mockResolvedValue({ sent: [], failed: ["ops@example.invalid"], skipped: [] });
    expect(await alertStalledGeneration(c)).toEqual({ attempted: 1 });
    const row = await db.auditLog.findFirstOrThrow();
    expect(JSON.parse(row.metaJson!)).toMatchObject({ state: "pending", leaseUntil: 0 });
    expect(await alertStalledGeneration(c)).toEqual({ attempted: 0 });
    await db.auditLog.update({ where: { id: row.id }, data: { metaJson: JSON.stringify({ state: "pending", leaseUntil: 0, nextAttemptAt: 0 }) } });
    send.mockResolvedValue({ sent: ["ops@example.invalid"], failed: [], skipped: [] });
    expect(await alertStalledGeneration(c)).toEqual({ attempted: 1 });
    expect(JSON.parse((await db.auditLog.findFirstOrThrow()).metaJson!)).toMatchObject({ state: "done" });
  });
  it("pages beyond healthy and already-notified games while respecting the per-pass send limit", async () => {
    for (let i = 0; i < 51; i++) await seed(`healthy_${i}`, { stale: false, createdAt: new Date(Date.now() - 100_000 + i) });
    await seed("last");
    expect(await alertStalledGeneration(c)).toEqual({ attempted: 1 });
    expect(send.mock.calls[0]![1].gameId).toBe("last");
    for (let i = 0; i < 6; i++) await seed(`limited_${i}`);
    expect(await alertStalledGeneration(c)).toEqual({ attempted: 5 });
    expect(await alertStalledGeneration(c)).toEqual({ attempted: 1 });
  });
  it("does no work without recipients or request time", async () => {
    await seed("waiting");
    expect(await alertStalledGeneration({ ...c, adminEmails: [] })).toEqual({ attempted: 0 });
    expect(await alertStalledGeneration(c, { deadlineAt: Date.now() })).toEqual({ attempted: 0 });
    expect(send).not.toHaveBeenCalled(); expect(await db.auditLog.count()).toBe(0);
  });
  it("treats a recent live heartbeat as progress, without using presentation updates as a heartbeat", () => {
    const now = Date.now();
    expect(generationConcern({ id: "recent", status: "TARGETS_GENERATING", paidAt: new Date(now - 31 * 60_000), updatedAt: new Date(),
      jobs: [{ status: "RUNNING", currentStep: "local-patch", updatedAt: new Date(now) }] }, now)).toBeNull();
    expect(generationConcern({ id: "nojob", status: "PAID", paidAt: new Date(now - 31 * 60_000), updatedAt: new Date(), jobs: [] }, now)).toContain("30 minutes");
  });
  it("revalidates current payment, lifecycle and heartbeat before sending a delayed stalled alert", () => {
    const now = Date.now(), paidAt = new Date(now - 31 * 60_000);
    const game = { id: "current", status: "TARGETS_GENERATING", paidAt, updatedAt: new Date(now), deletedAt: null,
      orders: [{ paymentStatus: "PAID", paidAt, refundedAt: null }], jobs: [{ status: "RUNNING", currentStep: "local-patch", updatedAt: paidAt }] };
    expect(generationHealthConcern(game, now)).toContain("30 minutes");
    expect(generationHealthConcern({ ...game, jobs: [{ ...game.jobs[0]!, updatedAt: new Date(now) }] }, now)).toBeNull();
    expect(generationHealthConcern({ ...game, status: "DELIVERED" }, now)).toBeNull();
    expect(generationHealthConcern({ ...game, deletedAt: new Date(now) }, now)).toBeNull();
    expect(generationHealthConcern({ ...game, orders: [{ paymentStatus: "REFUNDED", paidAt, refundedAt: new Date(now) }] }, now)).toBeNull();
    expect(generationHealthConcern({ ...game, orders: [{ ...game.orders[0]!, paidAt: new Date(now - GENERATION_ALERT_FRESH_MS - 1) }] }, now)).toBeNull();
    expect(generationHealthConcern({ ...game, orders: [{ ...game.orders[0]!, paidAt: new Date(now + 1) }] }, now)).toBeNull();
    expect(generationHealthConcern({ ...game, orders: [] }, now)).toBeNull();
  });
});
