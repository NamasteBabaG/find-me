import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../lib/test-schema";
import type { Container } from "../container";

const send = vi.hoisted(() => vi.fn());
vi.mock("../admin-alert.service", () => ({ ALERT_ONCE_MS: 6 * 60 * 60_000, sendAdminAlert: send }));
import { alertStalledGeneration, generationConcern } from "../generation-health.service";

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
afterAll(async () => {
  await db?.$disconnect();
  if (scratch && path.dirname(scratch) === tmpdir() && path.basename(scratch).startsWith("findme-generation-health-")) await rm(scratch, { recursive: true, force: true });
});
async function seed(id: string, options: { status?: string; step?: string; refunded?: boolean; paid?: boolean; stale?: boolean; createdAt?: Date } = {}) {
  const paidAt = new Date(Date.now() - 31 * 60_000);
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
});
