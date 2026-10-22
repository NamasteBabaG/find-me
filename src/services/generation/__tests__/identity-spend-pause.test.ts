import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import * as pipeline from "../pipeline";
import { nextPendingGame, tickGeneration } from "../queue";
import { LOCAL_PATCH_SPEND_PAUSED, LOCAL_PATCH_SPEND_PAUSE_RECHECK_MS, pauseLocalPatchForSpendGuard } from "../local-patch-spend-pause";

const fakes = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({
  env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_PROVIDER: "openai" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: fakes.testers }),
  flag: () => false, adminEmails: () => [],
}));

const IDENTITY_STATUSES = ["PAID", "AVATAR_GENERATING", "GENERATION_FAILED"] as const;
const PROTECTED_STEPS = ["local-patch:needs-release", "local-patch:recovery-exhausted", "local-patch:quality-failed"];
let db: PrismaClient, c: Container, directory: string, sequence = 0;
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-identity-spend-pause-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(directory, "test.db").replaceAll("\\", "/")}` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db) } as unknown as Container;
}, 60_000);
beforeEach(async () => {
  await db.game.deleteMany();
  await db.user.deleteMany();
  fakes.testers = [];
  vi.spyOn(pipeline, "runGenerationPipeline").mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("No provider request permitted"); }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
afterAll(async () => {
  await db.$disconnect();
  const absolute = path.resolve(directory);
  if (path.dirname(absolute) === realpathSync(tmpdir()) && path.basename(absolute).startsWith("findme-identity-spend-pause-")) rmSync(absolute, { recursive: true });
});

async function identity(status: string = "PAID", options: { withJob?: boolean; styleVersion?: string; paidAt?: Date } = {}) {
  const gameId = `identity-pause-${++sequence}`, ownerId = `owner-${gameId}`, email = `${ownerId}@example.invalid`;
  await db.user.create({ data: { id: ownerId, email } });
  await db.game.create({ data: { id: gameId, ownerId, status, styleVersion: options.styleVersion ?? "local-patch-world-v1",
    packageTier: "ONE_WORLD", paidAt: options.paidAt ?? new Date("2026-10-21T00:00:00Z") } });
  if (options.withJob !== false) await db.generationJob.create({ data: { id: `job_${gameId}`, gameId, status: "QUEUED", currentStep: "avatar",
    attempts: 11, stepsJson: JSON.stringify({ avatar: { status: "running" }, retainedFingerprint: "synthetic-retained-fingerprint" }) } });
  return { gameId, ownerId, email };
}
const job = (gameId: string) => db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
const snapshot = async (gameId: string) => ({ game: await db.game.findUniqueOrThrow({ where: { id: gameId } }), job: await job(gameId) });
const pauseIdentity = (container: Container, gameId: string) => pauseLocalPatchForSpendGuard(container, gameId,
  pipeline.LEASE_MS, PROTECTED_STEPS, IDENTITY_STATUSES);

describe("identity spend-pause scheduling", () => {
  it.each(IDENTITY_STATUSES)("gives a newer permitted identity a turn after an older ineligible %s identity", async status => {
    const older = await identity(status), newer = await identity("PAID", { paidAt: new Date("2026-10-22T00:00:00Z") });
    fakes.testers = [newer.email];
    const before = await job(older.gameId);
    expect(await nextPendingGame(c)).toBe(older.gameId);
    const paused = await tickGeneration(c, null, 30_000);
    expect(await nextPendingGame(c), "the older identity must not occupy every cron turn").toBe(newer.gameId);
    expect(paused).toMatchObject({ gameId: older.gameId, status, pending: false, attention: expect.stringContaining("does not permit") });
    expect(await job(older.gameId)).toMatchObject({ status: "QUEUED", currentStep: LOCAL_PATCH_SPEND_PAUSED, attempts: before.attempts, stepsJson: before.stepsJson });
    await tickGeneration(c, null, 30_000);
    expect(pipeline.runGenerationPipeline).toHaveBeenCalledTimes(1);
    expect(vi.mocked(pipeline.runGenerationPipeline).mock.calls.map(([, id]) => id)).toEqual([newer.gameId]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("persists the pause even when the pipeline has not created its first job", async () => {
    const older = await identity("PAID", { withJob: false }), newer = await identity("PAID", { paidAt: new Date("2026-10-22T00:00:00Z") });
    fakes.testers = [newer.email];
    await tickGeneration(c, null, 30_000);
    expect(await nextPendingGame(c)).toBe(newer.gameId);
    expect(await job(older.gameId)).toMatchObject({ status: "QUEUED", currentStep: LOCAL_PATCH_SPEND_PAUSED, attempts: 0, stepsJson: "{}" });
    expect(pipeline.runGenerationPipeline).not.toHaveBeenCalled();
  });

  it.each(IDENTITY_STATUSES)("a restored owner can directly resume its paused %s identity", async status => {
    const world = await identity(status);
    await tickGeneration(c, world.gameId, 30_000);
    const paused = await job(world.gameId);
    fakes.testers = [world.email];
    await tickGeneration(c, world.gameId, 30_000);
    expect(vi.mocked(pipeline.runGenerationPipeline).mock.calls.map(([, id]) => id)).toEqual([world.gameId]);
    expect(await job(world.gameId)).toEqual(paused); // Dispatch borrows no new attempt or grant from the pause helper.
    expect(fetch).not.toHaveBeenCalled();
  });

  it("looks again after ten minutes and postpones another ineligible turn without resetting history", async () => {
    const world = await identity();
    await tickGeneration(c, world.gameId, 30_000);
    expect(await nextPendingGame(c)).toBeNull();
    await db.generationJob.update({ where: { id: `job_${world.gameId}` }, data: { updatedAt: new Date(Date.now() - LOCAL_PATCH_SPEND_PAUSE_RECHECK_MS - 1_000) } });
    expect(await nextPendingGame(c)).toBe(world.gameId);
    const before = await job(world.gameId);
    await tickGeneration(c, null, 30_000);
    expect(await nextPendingGame(c)).toBeNull();
    expect(await job(world.gameId)).toMatchObject({ attempts: before.attempts, stepsJson: before.stepsJson, currentStep: LOCAL_PATCH_SPEND_PAUSED });
    expect(pipeline.runGenerationPipeline).not.toHaveBeenCalled();
  });
});

describe("identity pause fences", () => {
  it.each(IDENTITY_STATUSES)("never writes over a live %s lease, including its exact takeover boundary", async status => {
    const world = await identity(status), now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    await db.generationJob.update({ where: { id: `job_${world.gameId}` }, data: {
      status: "RUNNING", currentStep: "avatar", updatedAt: new Date(now - pipeline.LEASE_MS) } });
    const before = await snapshot(world.gameId);
    await tickGeneration(c, world.gameId, 30_000);
    expect(await snapshot(world.gameId)).toEqual(before);
    expect(pipeline.runGenerationPipeline).not.toHaveBeenCalled();
  });

  it.each(PROTECTED_STEPS)("never changes an identity already held at %s", async currentStep => {
    const world = await identity("AVATAR_GENERATING");
    await db.generationJob.update({ where: { id: `job_${world.gameId}` }, data: { status: "FAILED", currentStep, lastError: "Synthetic hold" } });
    const before = await snapshot(world.gameId);
    await pauseIdentity(c, world.gameId);
    expect(await snapshot(world.gameId)).toEqual(before);
  });

  it.each(["READY", "DELIVERED", "DELETED", "REFUNDED", "CANCELLED", "NEEDS_NEW_PHOTO", "NEEDS_REGENERATION", "MANUAL_REVIEW", "DRAFT"])("cannot park a %s game", async status => {
    const world = await identity(status), before = await snapshot(world.gameId);
    expect(await pauseIdentity(c, world.gameId)).toBeNull();
    expect(await snapshot(world.gameId)).toEqual(before);
  });

  it("does not enter the local-patch pause policy for a historical collage game", async () => {
    const world = await identity("PAID", { styleVersion: "collage-v1" }), before = await snapshot(world.gameId);
    expect(await pauseIdentity(c, world.gameId)).toBeNull();
    await tickGeneration(c, world.gameId, 30_000);
    expect(await snapshot(world.gameId)).toEqual(before);
    expect(vi.mocked(pipeline.runGenerationPipeline).mock.calls.map(([, id]) => id)).toEqual([world.gameId]);
  });

  it.each(["ready", "deleted", "owner", "style", "authorization"] as const)("rechecks a changed %s inside its transaction", async changed => {
    const world = await identity("AVATAR_GENERATING");
    let replacementOwner: string | null = null;
    if (changed === "owner") {
      replacementOwner = "replacement-owner";
      await db.user.create({ data: { id: replacementOwner, email: "replacement@example.invalid" } });
    }
    let afterRace: Awaited<ReturnType<typeof snapshot>> | undefined;
    const racedDb = new Proxy(db, { get(target, property, receiver) {
      if (property !== "$transaction") return Reflect.get(target, property, receiver);
      return async <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => {
        if (changed === "authorization") fakes.testers = [world.email];
        else await db.game.update({ where: { id: world.gameId }, data: changed === "ready" ? { status: "READY" }
          : changed === "deleted" ? { deletedAt: new Date() }
          : changed === "owner" ? { ownerId: replacementOwner }
          : { styleVersion: "collage-v1" } });
        afterRace = await snapshot(world.gameId);
        return db.$transaction(work);
      };
    } });
    expect(await pauseIdentity({ ...c, db: racedDb }, world.gameId)).toBeNull();
    expect(await snapshot(world.gameId)).toEqual(afterRace);
  });
});
