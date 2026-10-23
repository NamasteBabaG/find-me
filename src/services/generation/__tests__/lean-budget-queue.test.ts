import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import type { Container } from "../../container";
import { nextPendingGame } from "../queue";
import { leanReleaseAuditId, leanReleaseReceipt, LOCAL_PATCH_LEAN_ACTION } from "../lean-release";
import { LOCAL_PATCH_RECOVERY_BUDGET_WAIT, LOCAL_PATCH_NEEDS_RELEASE, LOCAL_PATCH_STYLE,
  LEAN_RECOVERY_BACKOFF_MS, LOCAL_PATCH_RECOVERY_BACKOFF_MS } from "../local-patch-world";

vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", LOCAL_PATCH_PROMPT_RELEASE: "v19", LOCAL_PATCH_IDENTITY_SOURCE: "full-source-v1" }), flag: () => false }));

let db: PrismaClient, c: Container, fixtureDir: string, sequence = 0;
const NOW = Date.parse("2026-10-23T00:00:00Z");
beforeAll(async () => {
  fixtureDir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-lean-budget-queue-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(fixtureDir, "test.db").replaceAll("\\", "/")}?connection_limit=1` } } });
  await applyTestSchema(db);
  c = { db } as unknown as Container;
}, 60_000);
beforeEach(async () => {
  await db.order.deleteMany(); await db.game.deleteMany(); await db.auditLog.deleteMany(); await db.user.deleteMany();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("No provider request permitted"); }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
afterAll(async () => {
  await db.$disconnect();
  const absolute = path.resolve(fixtureDir);
  if (path.dirname(absolute) === realpathSync(tmpdir()) && path.basename(absolute).startsWith("findme-lean-budget-queue-")) rmSync(absolute, { recursive: true });
});

async function world(options: { lean?: "valid" | "invalid"; ageMs?: number; step?: string; paid?: boolean; deleted?: boolean } = {}) {
  const id = `lean-budget-${++sequence}`, ownerId = `owner-${id}`;
  await db.user.create({ data: { id: ownerId, email: `${ownerId}@example.invalid` } });
  await db.game.create({ data: { id, ownerId, status: "TARGETS_GENERATING", styleVersion: LOCAL_PATCH_STYLE,
    packageTier: "ONE_WORLD", paidAt: new Date(NOW + sequence * 1000), ...(options.deleted ? { deletedAt: new Date(NOW - 1000) } : {}) } });
  if (options.paid !== false) await db.order.create({ data: { id: `order-${id}`, userId: ownerId, gameId: id,
    amountAgorot: 3900, packageTier: "ONE_WORLD", paymentStatus: "PAID", provider: "mock", paidAt: new Date(NOW - 600_000) } });
  await db.generationJob.create({ data: { id: `job_${id}`, gameId: id, status: "QUEUED", attempts: 17,
    currentStep: options.step ?? LOCAL_PATCH_RECOVERY_BUDGET_WAIT, updatedAt: new Date(NOW - (options.ageMs ?? 4 * 60_000)) } });
  if (options.lean) await db.auditLog.create({ data: { id: leanReleaseAuditId(id),
    actorType: options.lean === "valid" ? "SYSTEM" : "USER", actorId: options.lean === "valid" ? null : ownerId,
    action: LOCAL_PATCH_LEAN_ACTION, entityType: "Game", entityId: id, metaJson: JSON.stringify(leanReleaseReceipt(id)) } });
  return id;
}

describe("cron selection honors the verified lean budget backoff", () => {
  it("selects the oldest paid lean world after four minutes without releasing or changing its held work", async () => {
    const lean = await world({ lean: "valid" });
    await world({ step: "local-patch" });
    const before = { jobs: await db.generationJob.findMany({ orderBy: { id: "asc" } }), pins: await db.auditLog.findMany() };
    expect(await nextPendingGame(c)).toBe(lean);
    expect({ jobs: await db.generationJob.findMany({ orderBy: { id: "asc" } }), pins: await db.auditLog.findMany() }).toEqual(before);
    expect(await db.worldBudgetLedger.count()).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("waits the complete three minutes, then admits the exact boundary", async () => {
    const lean = await world({ lean: "valid", ageMs: LEAN_RECOVERY_BACKOFF_MS - 1 });
    expect(await nextPendingGame(c)).toBeNull();
    await db.generationJob.update({ where: { id: `job_${lean}` }, data: { updatedAt: new Date(NOW - LEAN_RECOVERY_BACKOFF_MS) } });
    expect(await nextPendingGame(c)).toBe(lean);
  });
  it("preserves the historical one-hour pause without starving runnable work behind it", async () => {
    const generic = await world();
    const runnable = await world({ step: "local-patch" });
    expect(await nextPendingGame(c)).toBe(runnable);
    await db.generationJob.update({ where: { id: `job_${generic}` }, data: { updatedAt: new Date(NOW - LOCAL_PATCH_RECOVERY_BACKOFF_MS) } });
    expect(await nextPendingGame(c)).toBe(generic);
  });
  it("refuses a forged lean pin while still selecting a valid early lean world behind it", async () => {
    await world({ lean: "invalid" });
    const valid = await world({ lean: "valid" });
    expect(await nextPendingGame(c)).toBe(valid);
  });
  it("preserves a fresh budget wait written after the lean pin was read", async () => {
    const lean = await world({ lean: "valid" });
    const runnable = await world({ step: "local-patch" });
    const concurrent = { db: { game: db.game, generationJob: db.generationJob,
      auditLog: { findUnique: async (args: Prisma.AuditLogFindUniqueArgs) => {
        const pin = await db.auditLog.findUnique(args);
        await db.generationJob.update({ where: { id: `job_${lean}` }, data: {
          updatedAt: new Date(NOW), lastError: "A concurrent worker wrote a fresh budget wait" } });
        return pin;
      } } } } as unknown as Container;
    expect(await nextPendingGame(concurrent)).toBe(runnable);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${lean}` } })).toMatchObject({
      status: "QUEUED", currentStep: LOCAL_PATCH_RECOVERY_BUDGET_WAIT, attempts: 17,
      lastError: "A concurrent worker wrote a fresh budget wait", updatedAt: new Date(NOW) });
  });
  it.each([
    { paid: false }, { deleted: true }, { step: LOCAL_PATCH_NEEDS_RELEASE },
  ])("does not make a protected or unpaid world eligible early: %j", async options => {
    await world({ lean: "valid", ...options });
    const runnable = await world({ step: "local-patch" });
    expect(await nextPendingGame(c)).toBe(runnable);
  });
});
