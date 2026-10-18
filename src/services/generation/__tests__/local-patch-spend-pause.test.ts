import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import { createDraft } from "../../create-flow.service";
import { boardsOfWorlds } from "../../world-catalog.service";
import { DUAL_VISUAL_REVIEW_V3 } from "../visual-review-release";
import { LOCAL_PATCH_LOW_PAINTER } from "../painter-release";
import { LOCAL_PATCH_SPEND_PAUSED, LOCAL_PATCH_SPEND_PAUSE_RECHECK_MS } from "../local-patch-spend-pause";
import * as world from "../local-patch-world";
import { nextPendingGame, tickGeneration } from "../queue";

/**
 * local-patch-spend-pause/v1. The pilot's fixed QA base does not list the world's owner as a tester,
 * so every minute the cron claimed the world, failed at its first paid step and went round again: the
 * job's claim counter climbed from 229 to 240 with nothing bought and nothing paused. Synthetic games;
 * no provider is called, and no slice runs while the owner may not spend.
 */
const fakes = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({
  env: () => ({ APP_ENV: "qa", LOCAL_PATCH_PROMPT_RELEASE: "v19", GENERATION_ENABLED: "on",
    GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", OPENAI_API_KEY: "synthetic-never-live" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: fakes.testers }), flag: () => false, adminEmails: () => [],
}));

let directory: string, db: PrismaClient, c: Container;
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-spend-pause-")));
  db = new PrismaClient({ datasources: { db: { url: "file:" + path.join(directory, "test.db").replaceAll("\\", "/") } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), analytics: { track: vi.fn() }, pinDualVisualReview: true, dualVisualReviewRelease: DUAL_VISUAL_REVIEW_V3,
    visualReview: { request: vi.fn() }, localPatchPainter: LOCAL_PATCH_LOW_PAINTER } as unknown as Container;
}, 60_000);
beforeEach(() => { fakes.testers = []; vi.stubGlobal("fetch", vi.fn(async () => { throw Error("No provider request permitted"); })); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
afterAll(async () => { await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-spend-pause-")) rmSync(directory, { recursive: true }); });

/** A paid nine-board journey world in generation, owned by a synthetic user. */
async function paintingWorld() {
  const draft = await createDraft(c, null, "he");
  const ownerId = "usr-" + draft.gameId, email = draft.gameId + "@example.invalid";
  await db.user.create({ data: { id: ownerId, email } });
  await db.childProfile.create({ data: { id: "chl-" + draft.gameId, ownerId, displayName: "Synthetic", ageYears: 6 } });
  await db.game.update({ where: { id: draft.gameId }, data: { ownerId, childProfileId: "chl-" + draft.gameId, status: "TARGETS_GENERATING", paidAt: new Date(), sceneCount: 9 } });
  await db.gameScene.createMany({ data: boardsOfWorlds(["journey"]).map((slug, orderIndex) => ({ id: `${draft.gameId}-s-${orderIndex}`,
    gameId: draft.gameId, sceneSlug: slug, sceneVersion: 12, orderIndex })) });
  await db.generationJob.create({ data: { id: "job_" + draft.gameId, gameId: draft.gameId, status: "QUEUED", stepsJson: "{}" } });
  return { gameId: draft.gameId, email };
}
const job = (gameId: string) => db.generationJob.findUniqueOrThrow({ where: { id: "job_" + gameId } });
const slice = (gameId: string) => ({ gameId, pending: true, claimed: true, paused: false, attention: null, outcomes: [], blocked: [] });

describe("a world whose owner this deployment may not spend for", () => {
  it("is parked unclaimed, looked at again only every ten minutes, and resumes on a deployment that permits its owner", async () => {
    const sliced = vi.spyOn(world, "runLocalPatchWorldSlice").mockImplementation(async (_c, _deps, gameId) => slice(gameId));
    const { gameId, email } = await paintingWorld();
    const first = await tickGeneration(c, gameId, 60_000);
    expect(first).toMatchObject({ gameId, pending: false, attention: expect.stringContaining("does not permit the world's owner to spend") });
    expect(await job(gameId)).toMatchObject({ status: "QUEUED", currentStep: LOCAL_PATCH_SPEND_PAUSED, attempts: 0 });
    // The cron does not take it again inside the recheck window; a direct tick claims nothing either.
    expect(await nextPendingGame(c)).not.toBe(gameId);
    await tickGeneration(c, gameId, 60_000);
    expect((await job(gameId)).attempts).toBe(0);
    expect(sliced).not.toHaveBeenCalled();
    // Ten minutes on, the cron looks again: still not permitted, still parked, still unclaimed.
    await db.generationJob.update({ where: { id: "job_" + gameId }, data: { updatedAt: new Date(Date.now() - LOCAL_PATCH_SPEND_PAUSE_RECHECK_MS - 1_000) } });
    expect(await nextPendingGame(c)).toBe(gameId);
    await tickGeneration(c, null, 60_000);
    expect(await job(gameId)).toMatchObject({ currentStep: LOCAL_PATCH_SPEND_PAUSED, attempts: 0 });
    expect(sliced).not.toHaveBeenCalled();
    // A deployment that lists the owner resumes it: the ordinary slice takes the world.
    fakes.testers = [email.toLowerCase()];
    await tickGeneration(c, gameId, 60_000);
    expect(sliced.mock.calls.map(([, , id]) => id)).toEqual([gameId]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never takes a live worker's lease and never moves a job parked for a person", async () => {
    vi.spyOn(world, "runLocalPatchWorldSlice").mockImplementation(async (_c, _deps, gameId) => slice(gameId));
    const running = await paintingWorld(), parked = await paintingWorld();
    await db.generationJob.update({ where: { id: "job_" + running.gameId }, data: { status: "RUNNING", currentStep: "local-patch", attempts: 7 } });
    await db.generationJob.update({ where: { id: "job_" + parked.gameId }, data: { status: "FAILED", currentStep: "local-patch:needs-release", lastError: "A person must reconcile" } });
    await tickGeneration(c, running.gameId, 60_000);
    expect(await job(running.gameId)).toMatchObject({ status: "RUNNING", currentStep: "local-patch", attempts: 7 });
    await tickGeneration(c, parked.gameId, 60_000);
    expect(await job(parked.gameId)).toMatchObject({ status: "FAILED", currentStep: "local-patch:needs-release", lastError: "A person must reconcile" });
  });
});
