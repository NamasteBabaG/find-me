import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import type { Container } from "../../container";
const f = vi.hoisted(() => ({ pending: true, advance: vi.fn() }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa" }) }));
vi.mock("../identity-source-revision-state", async original => ({ ...await original<typeof import("../identity-source-revision-state")>(), IDENTITY_REVISION_START_ACTION: "generation:identity-source-revision-start", IDENTITY_REVISION_COMMIT_ACTION: "generation:identity-source-revision-commit",
  identityRevisionPending: async () => f.pending, identityRevisionStartOf: async () => ({ operatorId: "synthetic-admin" }) }));
vi.mock("../identity-source-revision", async original => ({ ...await original<typeof import("../identity-source-revision")>(), advanceIdentitySourceRevision: f.advance }));
import { GenerationPaused } from "../board-conditioned-wizard";
import { identityRevisionHeldId, IDENTITY_REVISION_RUN, IDENTITY_REVISION_SPACING_MS, tickIdentitySourceRevision, nextIdentitySourceRevision } from "../identity-source-revision-queue";
let directory: string, db: PrismaClient, seq = 0;
beforeAll(async () => { directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-source-queue-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` } } }); await applyTestSchema(db); }, 180_000);
afterAll(async () => { await db.$disconnect(); if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-source-queue-")) rmSync(directory, { recursive: true }); });
beforeEach(() => { f.pending = true; f.advance.mockReset().mockResolvedValue({ state: "deferred" }); });
async function fixture() { const gameId = `source-queue-${++seq}`; await db.game.create({ data: { id: gameId, status: "TARGETS_GENERATING", styleVersion: "local-patch-world-v1" } });
  await db.generationJob.create({ data: { id: `job_${gameId}`, gameId, status: "FAILED", currentStep: "local-patch:needs-release", attempts: 24, lastError: "synthetic bound hold" } });
  await db.auditLog.create({ data: { id: `synthetic-start-${gameId}`, actorType: "ADMIN", action: "generation:identity-source-revision-start", entityType: "Game", entityId: gameId } });
  return { gameId, c: { db } as unknown as Container }; }
describe("normal-queue reference repair claims", () => {
  it("lets concurrent ticks perform one repair, keeps the bound job hold, and respects retry spacing", async () => {
    const { c, gameId } = await fixture(), before = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
    const now = Date.now();
    await Promise.all([tickIdentitySourceRevision(c, gameId, now + 270_000, now), tickIdentitySourceRevision(c, gameId, now + 270_000, now)]);
    expect(f.advance).toHaveBeenCalledOnce(); expect(await db.generationJob.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
    await tickIdentitySourceRevision(c, gameId, now + 270_000, now); expect(f.advance).toHaveBeenCalledOnce();
    await tickIdentitySourceRevision(c, gameId, now + 600_000, now + IDENTITY_REVISION_SPACING_MS + 1000); expect(f.advance).toHaveBeenCalledTimes(2);
  });
  it("defers a database contention without erasing history or marking a terminal fault", async () => {
    const { c, gameId } = await fixture(); f.advance.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("synthetic contention", { code: "P2034", clientVersion: "synthetic" }));
    expect((await tickIdentitySourceRevision(c, gameId, Date.now() + 270_000)).pending).toBe(true);
    expect(await db.auditLog.findUnique({ where: { id: identityRevisionHeldId(gameId) } })).toBeNull();
  });
  it("retains a bounded safe stop, reports the current cause, and never spins or persists arbitrary exception text", async () => {
    const { c, gameId } = await fixture(); f.advance.mockRejectedValue(Error(["sk", "synthetic-private-provider-error"].join("-")));
    expect((await tickIdentitySourceRevision(c, gameId, Date.now() + 270_000)).pending).toBe(false);
    const fault = await db.auditLog.findFirstOrThrow({ where: { action: "generation:identity-source-revision-held", entityId: gameId } }); expect(fault.metaJson).not.toContain("sk-");
    expect((await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } })).lastError).toBe("synthetic bound hold");
    await tickIdentitySourceRevision(c, gameId, Date.now() + 270_000); expect(f.advance).toHaveBeenCalledOnce();
    const runs = await db.auditLog.count({ where: { action: IDENTITY_REVISION_RUN, entityId: gameId } }); expect(runs).toBe(1);
  });
  it("returns an authorized reference repair to a normal direct tick without executing it during selection", async () => {
    const { c, gameId } = await fixture(); expect(await nextIdentitySourceRevision(c, gameId)).toBe(gameId); expect(f.advance).not.toHaveBeenCalled();
    f.pending = false; expect(await nextIdentitySourceRevision(c, gameId)).toBeNull();
  });
});


it.each(["kill-switch", "daily-ceiling"] as const)("automatically resumes after temporary %s pause, keeping its original hold and no permanent diagnosis", async why => {
  const { c, gameId } = await fixture(), before = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } }), now = Date.now();
  f.advance.mockRejectedValueOnce(new GenerationPaused(why));
  expect((await tickIdentitySourceRevision(c, gameId, now + 270_000, now)).pending).toBe(true);
  expect(await db.auditLog.count({ where: { action: "generation:identity-source-revision-held", entityId: gameId } })).toBe(0);
  expect(await db.generationJob.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
  await tickIdentitySourceRevision(c, gameId, now + 270_000, now + 65_000); expect(f.advance).toHaveBeenCalledOnce();
  f.advance.mockResolvedValue({ state: "deferred" });
  await tickIdentitySourceRevision(c, gameId, now + 1_000_000, now + 601_000); expect(f.advance).toHaveBeenCalledTimes(2);
});


it.each(["P2024", "P1017", "P1002"])("defers temporary database %s instead of freezing the source operation", async code => {
  const { c, gameId } = await fixture(); f.advance.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("synthetic transient DB fault", { code, clientVersion: "synthetic" }));
  expect((await tickIdentitySourceRevision(c, gameId, Date.now() + 270_000)).pending).toBe(true);
  expect(await db.auditLog.count({ where: { action: "generation:identity-source-revision-held", entityId: gameId } })).toBe(0);
});
it("defers a temporary Prisma initialization failure rather than recording a permanent hold", async () => {
  const { c, gameId } = await fixture(); f.advance.mockRejectedValueOnce(new Prisma.PrismaClientInitializationError("synthetic unavailable database", "synthetic", "P1001"));
  expect((await tickIdentitySourceRevision(c, gameId, Date.now() + 270_000)).pending).toBe(true);
  expect(await db.auditLog.count({ where: { action: "generation:identity-source-revision-held", entityId: gameId } })).toBe(0);
});
