import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "@/lib/test-schema";
import type { Container } from "../container";
import { retryFailedAdminAlerts } from "../admin-alert.service";

// The in-memory double must not be our only proof of ordering, cursors, limits
// and DateTime comparisons. Only the mail provider / game details are faked
// here; AuditLog is Prisma against a new, isolated SQLite database.
let db: PrismaClient;
let scratch: string;
// SQLite supplies createdAt on inserts, so keep its real clock here. The unit
// suite advances a fake clock for the six-hour / 24-hour boundary cases.
const now = new Date();
const action = "admin-alert:delivered-with-problems";

beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-alerts-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
});
beforeEach(async () => {
  await db.auditLog.deleteMany();
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await db?.$disconnect();
  if (scratch) {
    const resolved = realpathSync(scratch);
    if (path.dirname(resolved) !== realpathSync(tmpdir()) || !path.basename(resolved).startsWith("findme-alerts-")) {
      throw new Error("Refusing cleanup outside the isolated alert-test directory");
    }
    rmSync(resolved, { recursive: true, force: true });
  }
});

function container() {
  const sent: Array<{ to: string; text: string }> = [];
  // Spy on a forwarding function, not on Prisma's dynamic model proxy.
  const reads = vi.fn((args: Prisma.AuditLogFindManyArgs) => db.auditLog.findMany(args));
  const c = {
    adminEmails: ["ops@example.com"], appUrl: "https://example.invalid",
    db: {
      auditLog: { findMany: reads, create: (args: Prisma.AuditLogCreateArgs) => db.auditLog.create(args) },
      game: { findUniqueOrThrow: async () => ({ status: "DELIVERED", childProfile: null, owner: null, scenes: [] }) },
      targetVariantAsset: { findMany: async () => [] },
    },
    email: { id: "console", send: async (m: { to: string; text: string }) => { sent.push(m); return { id: "stub" }; } },
  } as unknown as Container;
  return { c, sent, reads };
}

async function record(id: string, gameId: string, minutesAgo: number, sent: boolean) {
  await db.auditLog.create({ data: {
    id, actorType: "SYSTEM", action: `${action}${sent ? "" : ":failed"}`, entityType: "Game", entityId: gameId,
    createdAt: new Date(now.getTime() - minutesAgo * 60_000),
    metaJson: JSON.stringify(sent ? { sentTo: ["ops@example.com"] } : { failedTo: ["ops@example.com"] }),
  } });
}

describe("admin alert retries with real SQLite audit queries", () => {
  it("crosses a cursor page with timestamp ties and skips more than twenty resolved groups", async () => {
    const f = container();
    // More than a page, all with the same timestamp: id is the stable tie-breaker.
    for (let i = 0; i < 105; i++) {
      await record(`failed_${i.toString().padStart(3, "0")}`, `resolved_${i}`, 720, false);
      await record(`sent_${i}`, `resolved_${i}`, 710, true);
    }
    await record("pending", "still-pending", 700, false);
    expect(await retryFailedAdminAlerts(f.c)).toEqual({ retried: 1 });
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0]!.text).toContain("/admin/orders/still-pending");
    // One independent v7-outbox scan, then three legacy pages + its race
    // recheck. Neither path may grow a per-game query over this backlog.
    expect(f.reads.mock.calls.filter(([query]) => query.where?.action === "local-patch:notification-pending")).toHaveLength(1);
    expect(f.reads.mock.calls.filter(([query]) => query.where?.action !== "local-patch:notification-pending").length).toBeLessThanOrEqual(4);
  });

  it("keeps an old game visible behind repeated failures of another game", async () => {
    const f = container();
    await record("older", "older", 60, false);
    for (let i = 0; i < 25; i++) await record(`repeat_${i}`, "repeated", 40 - i, false);
    expect(await retryFailedAdminAlerts(f.c)).toEqual({ retried: 2 });
    expect(f.sent).toHaveLength(2);
    expect(f.sent[0]!.text).toContain("/admin/orders/older");
    expect(await retryFailedAdminAlerts(f.c)).toEqual({ retried: 0 });
    expect(f.sent).toHaveLength(2);
  });
});
