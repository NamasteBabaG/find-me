import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import { tickGeneration } from "../queue";
import {
  LOCAL_PATCH_LEASE_MS, LOCAL_PATCH_STYLE, localPatchBoardBlockedReason, localPatchPainterDeps,
  localPatchPrivateInventory, runLocalPatchWorldSlice,
} from "../local-patch-world";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { sceneBySlug } from "../../scene-catalog.service";
import { sha256Bytes } from "../fixed-sprite";
import type { LocalPatchHideDeps } from "../local-patch-hide";
import type { LocalPatchJudgeResult } from "../local-patch-judge";
import { WORLD_LOCAL_PATCH_HIDES } from "../../../domain/scene/local-patch-hides";
import {
  LOCAL_PATCH_TEST_BOARD, bill, boardPng, clearWorld, paintedCrop, PASSING_ANSWER, reply, seedApprovedGame,
} from "./local-patch-fixtures";

/**
 * The queue half: who holds the work, what happens when they stop answering,
 * and what a worker who has lost the work is still allowed to write.
 *
 * The hides themselves are proved in local-patch-hide.test.ts against the real
 * ledger and the real store; what is under test here is the lease.
 */

const fakes = vi.hoisted(() => ({ appEnv: "qa", generationEnabled: "on" as "on" | "off", dailyCeiling: 0, testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({
  env: () => ({ APP_ENV: fakes.appEnv, GENERATION_ENABLED: fakes.generationEnabled, GENERATION_DAILY_CENTS: fakes.dailyCeiling,
    GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", OPENAI_API_KEY: "synthetic-never-live" }),
  spendGuard: () => ({ appEnv: fakes.appEnv, realGeneration: true, testers: fakes.testers }),
  flag: () => false,
  adminEmails: () => [],
}));

const BOARD = LOCAL_PATCH_TEST_BOARD;
let scratch: string, db: PrismaClient, c: Container;

beforeAll(async () => {
  scratch = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-local-patch-world-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "world.sqlite").split(path.sep).join("/")}` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), secret: "test-secret", appUrl: "http://localhost:3000" } as unknown as Container;
}, 180_000);

afterAll(async () => {
  await db.$disconnect();
  if (path.basename(scratch).startsWith("findme-local-patch-world-")) rmSync(scratch, { recursive: true, force: true });
});

beforeEach(async () => {
  fakes.appEnv = "qa"; fakes.generationEnabled = "on"; fakes.dailyCeiling = 0; fakes.testers = [];
  process.env.QA_BOARD_CONDITIONED_WIZARD = "true";
  await clearWorld(db);
});
afterEach(() => { delete process.env.QA_BOARD_CONDITIONED_WIZARD; });

async function seed(options: { gameId?: string; scenes?: { slug: string; version: number }[] } = {}) {
  const seeded = await seedApprovedGame(c, db, {
    ...options, styleVersion: LOCAL_PATCH_STYLE, status: "TARGETS_GENERATING", withJob: true,
  });
  fakes.testers = [...fakes.testers, seeded.email];
  return seeded;
}

function worker(options: { answer?: LocalPatchJudgeResult; beforeAnswering?: () => Promise<void> } = {}) {
  const dispatched: string[] = [];
  const deps: LocalPatchHideDeps = {
    renderPolicySha256: "p".repeat(64),
    readBoardArt: async () => boardPng(),
    render: async ({ requestKey, stylePng }) => {
      dispatched.push(requestKey);
      await options.beforeAnswering?.();
      const hide = BOARD.hides.find(h => requestKey.startsWith(`${h.id}:`))!;
      return { png: await paintedCrop(stylePng, hide), evidence: bill(`req-render-${requestKey}`) };
    },
    // A distinct receipt per call, as a provider gives: the ledger refuses one
    // receipt paying for two different operations, and it is right to.
    judge: async () => { dispatched.push("judge"); return { ...(options.answer ?? reply()), requestId: `req-judge-${++judged}` }; },
  };
  return { dispatched, deps };
}

let judged = 0;
const jobOf = (gameId: string) => db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } });
const done = (gameId: string) => db.targetVariantAsset.count({ where: { status: "GENERATED", targetInstance: { gameScene: { gameId } } } });

describe("a world of hides, one slice at a time", () => {
  it("paints one hide a tick and says there is more to do", async () => {
    const { gameId } = await seed();
    const first = worker();
    const one = await runLocalPatchWorldSlice(c, first.deps, gameId);
    expect(one.claimed).toBe(true);
    expect(one.pending).toBe(true);
    expect(one.outcomes.map(o => o.hideId)).toEqual(["sydney-1"]);
    expect(await done(gameId)).toBe(1);
    // The claim goes back, so the next tick can take it without waiting a lease.
    expect((await jobOf(gameId)).status).toBe("QUEUED");

    const second = worker();
    const two = await runLocalPatchWorldSlice(c, second.deps, gameId);
    expect(two.outcomes.map(o => o.hideId)).toEqual(["sydney-2"]);
    expect(second.dispatched).toEqual(["sydney-2:kneeling:render:1", "judge"]);

    const three = await runLocalPatchWorldSlice(c, worker().deps, gameId, { maxHides: 3 });
    expect(three.outcomes.map(o => o.hideId)).toEqual(["sydney-3"]);
    expect(three.pending).toBe(false);
    expect(await done(gameId)).toBe(3);
    expect((await jobOf(gameId)).status).toBe("DONE");
    const scene = await db.gameScene.findFirstOrThrow({ where: { gameId } });
    expect(scene.generationStatus).toBe("GENERATED");
  }, 240_000);

  it("will not let a second worker in while the first holds the work", async () => {
    const { gameId } = await seed();
    await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "RUNNING" } });
    const late = worker();
    const result = await runLocalPatchWorldSlice(c, late.deps, gameId);
    expect(result.claimed).toBe(false);
    expect(result.pending).toBe(true);
    expect(late.dispatched).toEqual([]);
  }, 120_000);

  it("takes the work over from a worker that stopped answering", async () => {
    const { gameId } = await seed();
    await db.generationJob.update({ where: { id: `job_${gameId}` },
      data: { status: "RUNNING", updatedAt: new Date(Date.now() - LOCAL_PATCH_LEASE_MS - 60_000) } });
    const taker = worker();
    const result = await runLocalPatchWorldSlice(c, taker.deps, gameId);
    expect(result.claimed).toBe(true);
    expect(result.outcomes[0]?.state).toBe("generated");
  }, 120_000);

  it("refuses to write a target for a worker whose work was taken away", async () => {
    // The dangerous case: a slow render finishes after somebody else took the
    // claim. The picture was still bought - that is not in question - but it
    // must not become part of a game this worker no longer owns.
    const { gameId } = await seed();
    const overtaken = worker({
      beforeAnswering: async () => {
        // Somebody else claims it while this render is in flight.
        await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { attempts: { increment: 5 } } });
      },
    });
    await expect(runLocalPatchWorldSlice(c, overtaken.deps, gameId)).rejects.toThrow(/no longer ours/);
    expect(await done(gameId)).toBe(0);
    expect(await db.targetVariantAsset.count({ where: { assetId: { not: null } } })).toBe(0);

    // And the render it paid for is not bought again by whoever comes next.
    await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "QUEUED" } });
    const next = worker();
    const result = await runLocalPatchWorldSlice(c, next.deps, gameId);
    expect(next.dispatched).toEqual([]);
    expect(result.outcomes[0]?.state).toBe("generated");
    expect(result.outcomes[0]?.replayed).toBe(true);
  }, 240_000);

  it("names the boards this build cannot paint instead of failing on them one by one", async () => {
    const { gameId } = await seed({ scenes: [{ slug: "tokyo", version: 5 }, { slug: "sydney", version: 5 }] });
    const w = worker();
    const result = await runLocalPatchWorldSlice(c, w.deps, gameId);
    expect(result.blocked).toEqual([{ boardId: "tokyo", reason: expect.stringContaining("not shipped art") }]);
    // The runnable board still runs; a board nobody can paint does not stop it.
    expect(result.outcomes.map(o => o.boardId)).toEqual(["sydney"]);
  }, 180_000);

  it("stops buying when a world is paused, and gives the work back", async () => {
    const { gameId } = await seed();
    fakes.generationEnabled = "off";
    const w = worker();
    const result = await runLocalPatchWorldSlice(c, w.deps, gameId);
    expect(result.paused).toBe(true);
    expect(w.dispatched).toEqual([]);
    expect((await jobOf(gameId)).status).toBe("QUEUED");
  }, 120_000);

  it("does not start a slice it cannot finish", async () => {
    const { gameId } = await seed();
    const w = worker();
    const result = await runLocalPatchWorldSlice(c, w.deps, gameId, { hardDeadlineAt: Date.now() + 5_000 });
    expect(result.claimed).toBe(false);
    expect(result.pending).toBe(true);
    expect(w.dispatched).toEqual([]);
    expect((await jobOf(gameId)).status).toBe("QUEUED");
  }, 120_000);

  it("refuses the style rather than handing it to the old painter", async () => {
    // There is no adapter that can buy a local patch yet. The route exists so
    // that a game on this style stops here saying nothing happened, instead of
    // falling through and being painted by a different engine.
    expect(localPatchPainterDeps(c)).toBeNull();
    const { gameId } = await seed();
    const tick = await tickGeneration(c, gameId, 60_000);
    expect(tick.pending).toBe(false);
    expect(tick.status).toBe("TARGETS_GENERATING");
    expect(await db.targetVariantAsset.count()).toBe(0);
  }, 120_000);

  it("stops asking for another tick once the ledger is holding the world", async () => {
    // A charge nobody can state holds the world, and a held world can authorise
    // nothing. Polling it would read the same rows forever and buy nothing.
    const { gameId } = await seed();
    const w = worker({ answer: reply({ usage: null }) });
    const result = await runLocalPatchWorldSlice(c, w.deps, gameId);
    expect(result.outcomes[0]?.state).toBe("stopped");
    expect(result.pending).toBe(false);
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId))).held).toBe(true);
  }, 180_000);

  it("can name every private thing it wrote for a game", async () => {
    // Deletion has to be able to find the child, and "the routine remembered
    // this engine exists" is not a way of finding her.
    const { gameId } = await seed();
    await runLocalPatchWorldSlice(c, worker().deps, gameId);
    const inventory = await localPatchPrivateInventory(c, gameId);

    const sprite = await db.asset.findFirstOrThrow({ where: { type: "TARGET_SPRITE" } });
    expect(inventory.assetIds).toContain(sprite.id);
    expect(inventory.storagePaths).toContain(sprite.storagePath);

    // A picture kept by a worker that then lost its claim is named by no row.
    // The inventory has to find it anyway.
    const orphan = await db.asset.create({ data: { id: "ast_lp_orphan", ownerId: `usr-${gameId}`, type: "REJECTED_PATCH",
      visibility: "PRIVATE", storagePath: "private/ast_lp_orphan.png", mimeType: "image/png", bytes: 1,
      provider: "local-patch", providerRequestId: gameId } });
    const withOrphan = await localPatchPrivateInventory(c, gameId);
    expect(withOrphan.assetIds).toContain(orphan.id);
    expect(withOrphan.storagePaths).toContain(orphan.storagePath);

    // Every retained purchase actually on disk is one this list would delete.
    const retained = await db.fileBlob.findMany({ where: { key: { startsWith: "private:retained-purchase:" } }, select: { key: true } });
    expect(retained.length).toBeGreaterThan(0);
    for (const row of retained) expect(inventory.retainedPurchaseKeys).toContain(row.key);
  }, 180_000);

  it("places every shippable board against the very picture its scene ships", async () => {
    // A local patch is a rectangle OF the board. If the placements name one file
    // and the scene ships another, the patch is a piece of a different picture
    // and nothing downstream compares them.
    for (const board of WORLD_LOCAL_PATCH_HIDES) {
      if (localPatchBoardBlockedReason(board)) continue;
      const scene = sceneBySlug(board.board);
      expect(`public${scene.art.base}`, board.board).toBe(board.art);
      const bytes = await readFile(path.resolve(process.cwd(), board.art));
      expect(sha256Bytes(bytes), board.board).toBe(scene.art.sha256);
      // And every hide binds a mission this scene actually has.
      for (const hide of board.hides) expect(scene.targets.map(t => t.id), hide.id).toContain(hide.targetId);
    }
  }, 120_000);

  it("knows which of the nine boards a deployed build could actually paint", () => {
    const shippable = WORLD_LOCAL_PATCH_HIDES.filter(b => localPatchBoardBlockedReason(b) === null).map(b => b.board);
    // Four boards are still authored out of an untracked work/ folder. This is
    // a fact about the world, written down so it changes on purpose.
    expect(shippable).toEqual(["sydney", "antarctica", "giza", "marrakech"]);
  });

  it("only ever paints a passing hide", () => {
    expect(PASSING_ANSWER.verdict).toBe("pass");
  });
});
