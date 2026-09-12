import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import { nextPendingGame, tickGeneration } from "../queue";
import { LEASE_MS as PIPELINE_LEASE_MS } from "../pipeline";
import {
  LOCAL_PATCH_LEASE_MS, LOCAL_PATCH_NEEDS_RELEASE, LOCAL_PATCH_STYLE, localPatchBoardBlockedReason,
  localPatchPainterDeps, localPatchPrivateInventory, runLocalPatchWorldSlice,
} from "../local-patch-world";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { sceneBySlug } from "../../scene-catalog.service";
import { sha256Bytes } from "../fixed-sprite";
import { localPatchImagePolicyForVersion, localPatchRenderPolicySha256 } from "../../../infra/generation/openai-local-patch";
import * as localPatchPainter from "../../../infra/generation/openai-local-patch";
import * as localPatchJudge from "../local-patch-judge";
import * as localPatchArt from "../local-patch-art";
import { runLocalPatchHide } from "../local-patch-hide";
import type { LocalPatchHideDeps } from "../local-patch-hide";
import type { LocalPatchJudgeResult } from "../local-patch-judge";
import { WORLD_LOCAL_PATCH_HIDES, cropOf, maskOf } from "../../../domain/scene/local-patch-hides";
import { retainedPurchaseKeysFor } from "../../../infra/db/prisma-retained-purchase-store";
import { LOCAL_PATCH_SCENE_VERSION } from "../../../../content/scenes/local-patch-release";
import {
  LOCAL_PATCH_TEST_BOARD, bill, boardPng, clearWorld, paintedCrop, paintedOk, PASSING_ANSWER, reply, seedApprovedGame,
} from "./local-patch-fixtures";

/**
 * The queue half: who holds the work, what happens when they stop answering,
 * and what a worker who has lost the work is still allowed to write.
 *
 * The hides themselves are proved in local-patch-hide.test.ts against the real
 * ledger and the real store; what is under test here is the lease.
 */

const fakes = vi.hoisted(() => ({ appEnv: "qa", generationEnabled: "on" as "on" | "off", dailyCeiling: 0, testers: [] as string[], openaiKey: "synthetic-never-live" }));
vi.mock("../../../lib/env", () => ({
  env: () => ({ APP_ENV: fakes.appEnv, GENERATION_ENABLED: fakes.generationEnabled, GENERATION_DAILY_CENTS: fakes.dailyCeiling,
    GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", OPENAI_API_KEY: fakes.openaiKey }),
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
  fakes.appEnv = "qa"; fakes.generationEnabled = "on"; fakes.dailyCeiling = 0; fakes.testers = []; fakes.openaiKey = "synthetic-never-live";
  process.env.QA_BOARD_CONDITIONED_WIZARD = "true";
  await clearWorld(db);
});
afterEach(() => { delete process.env.QA_BOARD_CONDITIONED_WIZARD; });

async function seed(options: { gameId?: string; scenes?: { slug: string; version: number }[] } = {}) {
  const seeded = await seedApprovedGame(c, db, {
    scenes: [{ slug: "sydney", version: LOCAL_PATCH_SCENE_VERSION }], ...options, styleVersion: LOCAL_PATCH_STYLE, status: "TARGETS_GENERATING", withJob: true,
  });
  fakes.testers = [...fakes.testers, seeded.email];
  return seeded;
}

function worker(options: { answer?: LocalPatchJudgeResult; beforeAnswering?: () => Promise<void> } = {}) {
  const dispatched: string[] = [];
  let deps: LocalPatchHideDeps = {
    renderPolicySha256: "p".repeat(64),
    readBoardArt: async () => boardPng(),
    render: async ({ requestKey, stylePng }) => {
      dispatched.push(requestKey);
      await options.beforeAnswering?.();
      const hide = WORLD_LOCAL_PATCH_HIDES.flatMap(board => board.hides).find(h => requestKey.startsWith(`${h.id}:`))!;
      const attempt = Number(requestKey.split(":").at(-1));
      const mask = maskOf(hide), crop = cropOf(hide);
      // Each synthetic purchase is a genuinely different picture, like a new
      // provider render, rather than relabelling rejected bytes as accepted.
      const png = await sharp(await paintedCrop(stylePng, hide)).composite([{
        input: { create: { width: 8, height: 8, channels: 4, background: { r: attempt * 40, g: 40, b: 180, alpha: 1 } } },
        left: mask.left - crop.left + Math.floor(mask.width / 2), top: mask.top - crop.top + Math.floor(mask.height / 2),
      }]).png().toBuffer();
      return paintedOk(png, bill(`req-render-${requestKey}`));
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
  it.each([[6, "medium"], [7, "low"]] as const)("the real queue selects v%i image quality from persisted scenes", async (version, quality) => {
    const seeded = await seedApprovedGame(c, db, { gameId: `game-pinned-quality-${version}`, scenes: [{ slug: "sydney", version }],
      approved: version !== 7, styleVersion: LOCAL_PATCH_STYLE, status: "TARGETS_GENERATING", withJob: true });
    const { gameId } = seeded; fakes.testers.push(seeded.email);
    if (version === 7) {
      // The old fixture carries a v1 identity review. New games must use the
      // real v3 review/ledger contract, not a mocked gate that accepts it.
      await c.storage.put(`private/photo-${gameId}.jpg`, seeded.sheet, "image/png");
      const { sha256: catalogSha256 } = await readBoardConditionedCatalog();
      await reviewBoardWizardIdentity({ db, apiKey: "synthetic-never-live", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {},
        write: work => db.$transaction(work), reviewer: { review: async () => ({ httpOk: true, requestId: `req_identity_policy_${version}`,
          body: { model: "gpt-5.6-luna", usage: { prompt_tokens: 2000, completion_tokens: 100 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
            checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Synthetic policy fixture" }) } }] } }) } }, {
        gameId, identityAssetId: `ast-sheet-${gameId}`, sheet: seeded.sheet, photo: seeded.sheet, atlas: seeded.sheet, contentVersion: 7,
        provenance: { promptVersion: "character-v4-board-drawn-face-reference", quality: "medium", photoAssetId: `ast-photo-${gameId}`, photoSha256: sha256Bytes(seeded.sheet),
          ageYears: 8, crop: null, style: { version: "board-matched-identity/v2", catalogSha256, atlasSha256: sha256Bytes(seeded.sheet) } },
      });
    }
    const png = await sharp({ create: { width: 768, height: 1152, channels: 4, background: "#d2be96" } }).png().toBuffer();
    let now = Date.now();
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const wire = vi.spyOn(globalThis, "fetch").mockImplementation(async () => { now += 240_000; return new Response(JSON.stringify({
      model: "gpt-image-2", usage: { input_tokens: 30, output_tokens: 196, total_tokens: 226, input_tokens_details: { text_tokens: 10, image_tokens: 20 } },
      data: [{ b64_json: png.toString("base64") }],
    }), { status: 200, headers: { "x-request-id": `req-pinned-quality-${version}` } }); });
    const judge = vi.spyOn(localPatchJudge, "judgeLocalPatch").mockResolvedValue(reply({ requestId: `req-policy-judge-${version}` }));
    try {
      await tickGeneration(c, gameId, 60_000, 270_000);
      expect(wire).toHaveBeenCalledTimes(1);
      const form = wire.mock.calls[0]![1]!.body as FormData;
      expect(form.get("quality")).toBe(quality);
      expect(form.get("model")).toBe("gpt-image-2");
      expect(localPatchPainterDeps(c, version)!.renderPolicySha256).toBe(localPatchRenderPolicySha256(localPatchImagePolicyForVersion(version)));
    } finally { wire.mockRestore(); judge.mockRestore(); clock.mockRestore(); }
  }, 120_000);

  it.each([6_000, 20_000])("the real queue paints its first hide after %sms of preparation inside a 270s route", async preparationMs => {
    const board = WORLD_LOCAL_PATCH_HIDES.find(item => item.board === "newyork")!, hide = board.hides[0]!;
    const { gameId } = await seed({ gameId: `game-preparation-${preparationMs}`, scenes: [{ slug: board.board, version: LOCAL_PATCH_SCENE_VERSION }] });
    const entry = Date.now();
    let now = entry;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network forbidden in queue deadline regression"));
    const readArt = localPatchArt.readPinnedLocalPatchArt;
    const preparation = vi.spyOn(localPatchArt, "readPinnedLocalPatchArt").mockImplementation(async (...args) => {
      const bytes = await readArt(...args);
      now += preparationMs;
      return bytes;
    });
    const render = vi.spyOn(localPatchPainter, "buyLocalPatch").mockImplementation(async (_key, input) => {
      expect(input.timeoutMs).toBe(270_000 - preparationMs - 25_000);
      expect(input.timeoutMs).toBeLessThanOrEqual(240_000);
      now += 100_000;
      return paintedOk(await paintedCrop(input.stylePng, hide), bill(`req-preparation-${preparationMs}`));
    });
    const judge = vi.spyOn(localPatchJudge, "judgeLocalPatch").mockImplementation(async (_key, input) => {
      expect(input.timeoutMs).toBe(270_000 - preparationMs - 100_000 - 25_000);
      now += 20_000;
      return reply({ requestId: `req-preparation-judge-${preparationMs}` });
    });
    try {
      // The queue, renderer, shipped board, identity approval, retained store,
      // and SQLite budget are real. Only time and provider responses are fake.
      expect(await tickGeneration(c, gameId, 30_000, 270_000)).toMatchObject({ gameId, status: "TARGETS_GENERATING", pending: true });
      expect(await done(gameId)).toBe(1);
      expect(render).toHaveBeenCalledTimes(1); expect(judge).toHaveBeenCalledTimes(1);
      expect(preparation).toHaveBeenCalledTimes(1);
      const row = await db.targetVariantAsset.findFirstOrThrow({ where: { targetInstance: { gameScene: { gameId }, targetId: hide.targetId } } });
      expect(row).toMatchObject({ status: "GENERATED", attempts: 1 });
      const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(gameId);
      expect(await budget.readRequest(worldId, `${hide.id}:${hide.pose}:render:1`)).toMatchObject({ state: "settled" });
      expect(await budget.readRequest(worldId, `${hide.id}:${hide.pose}:judge:1`)).toMatchObject({ state: "settled" });
      const beforeReplay = await budget.audit(worldId);
      expect(beforeReplay).toMatchObject({ held: false, reservedMicroUsd: 0 });
      expect(now + 25_000).toBeLessThan(entry + 270_000);
      expect(await runLocalPatchHide(c, localPatchPainterDeps(c)!, { gameId, board, hide, deadlineAt: now + 270_000 }))
        .toMatchObject({ state: "already-generated", attempts: 1 });
      expect(render).toHaveBeenCalledTimes(1); expect(judge).toHaveBeenCalledTimes(1);
      expect((await budget.audit(worldId)).settledMicroUsd).toBe(beforeReplay.settledMicroUsd);
      expect(network).not.toHaveBeenCalled();
    } finally {
      judge.mockRestore(); render.mockRestore(); preparation.mockRestore(); network.mockRestore(); clock.mockRestore();
    }
  }, 120_000);

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

  it("finishes untouched hides before the final repair, then replays attempt three from disk without buying its image again", async () => {
    const { gameId } = await seed();
    const refused = worker({ answer: reply({ raw: JSON.stringify({ ...PASSING_ANSWER,
      styleMatch: "fail", verdict: "fail", reason: "The child's face is too photographic.",
      faults: [{ check: "styleMatch", where: "the child's face inside the patch" }],
    }) }) });
    for (const attempt of [1, 2]) {
      expect((await runLocalPatchWorldSlice(c, refused.deps, gameId)).outcomes[0])
        .toMatchObject({ hideId: "sydney-1", attempt, state: attempt === 1 ? "refused" : "gave-up" });
    }
    const normal = worker();
    const remaining = await runLocalPatchWorldSlice(c, normal.deps, gameId, { maxHides: 3 });
    expect(remaining.outcomes.map(outcome => [outcome.hideId, outcome.attempt]))
      .toEqual([["sydney-2", 1], ["sydney-3", 1]]);
    expect(remaining.pending, "normal completion queues the repair instead of ending the world").toBe(true);
    expect(normal.dispatched.filter(key => key.endsWith(":render:3"))).toEqual([]);

    const started = Date.now();
    let now = started;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    let freshDb: PrismaClient | undefined;
    try {
      const slowRepair = worker({ beforeAnswering: async () => { now += 250_000; } });
      const stopped = await runLocalPatchWorldSlice(c, slowRepair.deps, gameId, { hardDeadlineAt: started + 290_000 });
      expect(stopped.outcomes[0]).toMatchObject({ hideId: "sydney-1", attempt: 3, state: "stopped" });
      expect(slowRepair.dispatched).toEqual(["sydney-1:standing:render:3"]);
      expect(await db.targetVariantAsset.findFirstOrThrow({ where: {
        targetInstance: { gameScene: { gameId }, targetId: "lifeguard" },
      } })).toMatchObject({ status: "PENDING", attempts: 3 });

      // A new client, ledger, retained store and worker read only durable SQLite
      // state. The previous judge's fault must still produce the same prompt.
      freshDb = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "world.sqlite").split(path.sep).join("/")}` } } });
      const fresh = { ...c, db: freshDb, storage: new DbStorage(freshDb) };
      now = started + 600_000;
      const replay = worker();
      const recovered = await runLocalPatchWorldSlice(fresh, replay.deps, gameId, { hardDeadlineAt: now + 290_000 });
      expect(recovered.outcomes[0]).toMatchObject({ hideId: "sydney-1", attempt: 3, state: "generated" });
      expect(replay.dispatched).toEqual(["judge"]);
      expect(await done(gameId)).toBe(3);
      const inventory = await localPatchPrivateInventory(fresh, gameId);
      const thirdKeys = retainedPurchaseKeysFor(boardWizardWorldId(gameId), ["sydney-1:standing:render:3", "sydney-1:standing:judge:3"]);
      for (const key of thirdKeys) {
        expect(await freshDb.fileBlob.findUnique({ where: { key } })).not.toBeNull();
        expect(inventory.retainedPurchaseKeys).toContain(key);
      }
      for (const retained of await freshDb.fileBlob.findMany({ where: { key: { startsWith: "private:retained-purchase:" } } })) {
        expect(inventory.retainedPurchaseKeys).toContain(retained.key);
      }
      expect((await runLocalPatchWorldSlice(fresh, replay.deps, gameId)).outcomes).toEqual([]);
      expect(replay.dispatched).toEqual(["judge"]);
      expect(await boardWizardBudgetOf(fresh).readRequest(boardWizardWorldId(gameId), "sydney-1:standing:render:4")).toBeNull();
    } finally {
      await freshDb?.$disconnect();
      clock.mockRestore();
    }
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

    // The render was bought and written before the fence was ever asked, so the
    // bytes exist. What must be true is that deletion can still find them: the
    // fence stops a child being PUBLISHED, it cannot stop one being on disk.
    const stranded = await db.fileBlob.findMany({ where: { key: { startsWith: "game/" } }, select: { key: true } });
    expect(stranded.length).toBeGreaterThan(0);
    const orphans = await localPatchPrivateInventory(c, gameId);
    for (const blob of stranded) expect(orphans.storagePaths).toContain(blob.key);

    // And the render it paid for is not bought again by whoever comes next.
    await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "QUEUED" } });
    const next = worker();
    const result = await runLocalPatchWorldSlice(c, next.deps, gameId);
    expect(next.dispatched).toEqual([]);
    expect(result.outcomes[0]?.state).toBe("generated");
    expect(result.outcomes[0]?.replayed).toBe(true);
  }, 240_000);

  it("does not believe it won a claim it lost between reading and taking", async () => {
    // The claim increments whatever the database holds, but the fencing token
    // was derived from the earlier read. A worker that claimed and released in
    // between left this one holding a number that matched nothing: every fence
    // failed and its own release matched no row, so the job sat occupied for a
    // whole lease. Losing the race is fine; believing you won it is not.
    const { gameId } = await seed();
    type JobReader = { findUnique: (args: unknown) => Promise<{ id: string } | null> };
    const jobs = db.generationJob as unknown as JobReader;
    const readJob = jobs.findUnique.bind(jobs);
    let raced = false;
    jobs.findUnique = async (args: unknown) => {
      const row = await readJob(args);
      if (!raced && row) {
        raced = true;
        // Somebody else takes it and gives it straight back.
        await db.generationJob.update({ where: { id: row.id }, data: { attempts: { increment: 1 }, status: "QUEUED" } });
      }
      return row;
    };
    try {
      const w = worker();
      const result = await runLocalPatchWorldSlice(c, w.deps, gameId);
      expect(raced).toBe(true);
      expect(result.claimed).toBe(false);
      expect(result.pending).toBe(true);
      expect(w.dispatched).toEqual([]);
      // And it did not leave the job running under a number nobody holds.
      expect((await jobOf(gameId)).status).toBe("QUEUED");
    } finally {
      jobs.findUnique = readJob;
    }
  }, 180_000);

  it("repairs a picture whose row landed and whose bytes did not", async () => {
    // The row is written before the bytes so that nothing can exist unnamed.
    // The cost is a row that can outlive its bytes, and it is paid here.
    const { gameId } = await seed();
    await runLocalPatchWorldSlice(c, worker().deps, gameId);
    const sprite = await db.asset.findFirstOrThrow({ where: { type: "TARGET_SPRITE" } });
    await db.fileBlob.delete({ where: { key: sprite.storagePath } });
    await db.targetVariantAsset.updateMany({ data: { status: "PENDING", assetId: null } });

    const again = worker();
    const result = await runLocalPatchWorldSlice(c, again.deps, gameId);
    expect(again.dispatched).toEqual([]);
    expect(result.outcomes[0]?.state).toBe("generated");
    expect(await db.fileBlob.findUnique({ where: { key: sprite.storagePath } })).not.toBeNull();
  }, 180_000);

  it("keeps the patch and leaves the judging for the next tick when time runs out", async () => {
    // Each paid phase is allowed four minutes and the request declares five, so
    // a render that used most of its allowance and a judgement that then started
    // at all could not both finish. The render is kept; the judge waits.
    const { gameId } = await seed();
    const started = Date.now();
    const clock = { now: started };
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => clock.now);
    try {
      const slow = worker();
      // Painting eats almost the whole request.
      const paint = slow.deps.render;
      slow.deps = { ...slow.deps, render: async input => { clock.now += 250_000; return paint(input); } } as typeof slow.deps;

      const first = await runLocalPatchWorldSlice(c, slow.deps, gameId, { hardDeadlineAt: started + 290_000 });
      expect(slow.dispatched, "the judge must not be dispatched with no time to finish").toEqual(["sydney-1:standing:render:1"]);
      expect(first.outcomes[0]?.state).toBe("stopped");
      expect(first.outcomes[0]?.reason).toMatch(/^sydney-1:standing:judge:1 was not dispatched/);
      // The attempt is NOT concluded and NOT charged an extra try.
      const [row] = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } } });
      expect(row?.status).toBe("PENDING");
      expect(row?.attempts).toBe(1);
      expect((await jobOf(gameId)).status).toBe("QUEUED");

      // A fresh tick with a whole request in front of it: the patch is replayed
      // and only the judgement is bought.
      clock.now = started + 600_000;
      const next = worker();
      const second = await runLocalPatchWorldSlice(c, next.deps, gameId, { hardDeadlineAt: clock.now + 290_000 });
      expect(next.dispatched, "the patch was already bought and kept").toEqual(["judge"]);
      expect(second.outcomes[0]?.state).toBe("generated");
      expect(second.outcomes[0]?.attempt).toBe(1);
    } finally {
      nowSpy.mockRestore();
    }
  }, 240_000);

  it("does not start a paint it cannot keep", async () => {
    const { gameId } = await seed();
    const started = Date.now();
    const clock = { now: started };
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => clock.now);
    try {
      const w = worker();
      // Enter with a normal route budget, then let preparation consume enough
      // that even the minimum viable paint plus retention no longer fits.
      w.deps = { ...w.deps, readBoardArt: async () => { clock.now += 100_000; return boardPng(); } };
      const result = await runLocalPatchWorldSlice(c, w.deps, gameId, { hardDeadlineAt: started + 270_000 });
      expect(w.dispatched).toEqual([]);
      expect(result.outcomes[0]?.reason).toMatch(/^sydney-1:standing:render:1 was not dispatched/);
      const [row] = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } } });
      expect(row?.status).toBe("PENDING");
      expect(row?.attempts, "a deferral must never cost an attempt").toBe(1);
    } finally {
      nowSpy.mockRestore();
    }
  }, 180_000);

  it("parks a world whose reservation is held, and stops asking for ticks", async () => {
    // The pathological case: the ledger itself outlasted the window, so a
    // reservation is committed for something that was never dispatched. Nothing
    // was charged - and nothing gets better by trying again, because from the
    // outside that reservation looks exactly like a worker still waiting.
    const { gameId } = await seed();
    const started = Date.now();
    const clock = { now: started };
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => clock.now);
    try {
      const stalled = worker();
      // Reserving is the only thing on this path that WRITES to the ledger, so
      // stalling the write stalls the reservation and nothing before it: the
      // caller checked the window and it was true, and it is false by the time
      // there is anything to dispatch.
      const ledger = db.worldBudgetLedger as unknown as { updateMany: (a: unknown) => Promise<unknown>; create: (a: unknown) => Promise<unknown> };
      const realUpdate = ledger.updateMany.bind(ledger), realCreate = ledger.create.bind(ledger);
      ledger.updateMany = async a => { clock.now += 300_000; return realUpdate(a); };
      ledger.create = async a => { clock.now += 300_000; return realCreate(a); };

      let first;
      try {
        first = await runLocalPatchWorldSlice(c, stalled.deps, gameId, { hardDeadlineAt: started + 290_000 });
      } finally {
        ledger.updateMany = realUpdate; ledger.create = realCreate;
      }
      expect(stalled.dispatched, "zero provider calls").toEqual([]);
      expect(first.attention, "the reason has to leave the function").toMatch(/needs releasing by hand/);
      expect(first.pending, "a world waiting for a person is not a world to keep ticking").toBe(false);

      // Durable, and where the status screen reads it.
      const job = await jobOf(gameId);
      expect(job.status).toBe("FAILED");
      expect(job.currentStep).toBe(LOCAL_PATCH_NEEDS_RELEASE);
      expect(job.lastError).toMatch(/needs releasing by hand/);

      // And three more ticks change nothing and buy nothing.
      clock.now = started + 1_000_000;
      for (let i = 0; i < 3; i++) {
        const again = worker();
        const later = await runLocalPatchWorldSlice(c, again.deps, gameId, { hardDeadlineAt: clock.now + 290_000 });
        expect(again.dispatched, "still zero provider calls").toEqual([]);
        expect(later.claimed).toBe(false);
        expect(later.pending).toBe(false);
        expect(later.attention).toMatch(/needs releasing by hand/);
      }
      // No charge was invented for any of it.
      const audit = await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId));
      expect(audit.settledMicroUsd).toBe(260_000);
      expect(audit.held).toBe(false);
      // The attempt is intact, so releasing the reservation resumes it.
      const [row] = await db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } } });
      expect(row?.status).toBe("PENDING");
      expect(row?.attempts).toBe(1);
    } finally {
      nowSpy.mockRestore();
    }
  }, 240_000);

  it("lets the scheduler get on with another world while one waits for a person", async () => {
    // Parking is on the JOB and the game stays TARGETS_GENERATING, so the oldest
    // parked game kept being chosen, its slice kept declining, and every runnable
    // game behind it waited on a decision nobody had made.
    const parked = await seed({ gameId: "game-older-parked" });
    const runnable = await seed({ gameId: "game-newer-runnable" });
    await db.game.update({ where: { id: parked.gameId }, data: { paidAt: new Date(Date.now() - 3_600_000) } });
    await db.game.update({ where: { id: runnable.gameId }, data: { paidAt: new Date() } });
    await db.generationJob.update({ where: { id: `job_${parked.gameId}` },
      data: { status: "FAILED", currentStep: LOCAL_PATCH_NEEDS_RELEASE, lastError: "reserved and not dispatched" } });

    for (let i = 0; i < 3; i++) expect(await nextPendingGame(c), `pick ${i + 1}`).toBe(runnable.gameId);

    // And it is still reachable deliberately, by somebody who knows what they are looking at.
    const direct = await runLocalPatchWorldSlice(c, worker().deps, parked.gameId);
    expect(direct.claimed).toBe(false);
    expect(direct.attention).toMatch(/reserved and not dispatched/);
  }, 180_000);

  it.each(["local-patch", null])("skips a live local-patch lease (%s) but selects it again once takeover is allowed", async currentStep => {
    const active = await seed({ gameId: "game-older-active-lease" });
    const queued = await seed({ gameId: "game-newer-queued-lease" });
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      await db.game.update({ where: { id: active.gameId }, data: { paidAt: new Date(now - 3_600_000) } });
      await db.game.update({ where: { id: queued.gameId }, data: { paidAt: new Date(now) } });
      await db.generationJob.update({ where: { id: `job_${active.gameId}` }, data: {
        status: "RUNNING", currentStep, updatedAt: new Date(now),
      } });
      const activeJob = await jobOf(active.gameId);
      const w = worker();
      // An explicit nudge cannot take this healthy worker's lease either.
      expect(await runLocalPatchWorldSlice(c, w.deps, active.gameId)).toMatchObject({ claimed: false, pending: true });
      expect(w.dispatched).toEqual([]);
      expect(await nextPendingGame(c)).toBe(queued.gameId);
      expect(await jobOf(active.gameId)).toEqual(activeJob);

      // The claimant uses strict `lt`: the exact expiry boundary is still live.
      await db.generationJob.update({ where: { id: activeJob.id }, data: { updatedAt: new Date(now - LOCAL_PATCH_LEASE_MS) } });
      expect(await nextPendingGame(c)).toBe(queued.gameId);
      await db.generationJob.update({ where: { id: activeJob.id }, data: { updatedAt: new Date(now - LOCAL_PATCH_LEASE_MS - 1) } });
      expect(await nextPendingGame(c)).toBe(active.gameId);

      // A normal release is immediately runnable; no six-minute penalty.
      await db.generationJob.update({ where: { id: activeJob.id }, data: { status: "QUEUED", updatedAt: new Date(now) } });
      expect(await nextPendingGame(c)).toBe(active.gameId);
    } finally { clock.mockRestore(); }
  }, 180_000);

  it.each(["PAID", "AVATAR_GENERATING", "GENERATION_FAILED"])("skips an active %s local-patch identity lease without losing stale recovery", async status => {
    const active = await seed({ gameId: "game-active-identity-selector" });
    const queued = await seed({ gameId: "game-queued-after-identity" });
    const now = Date.now(), clock = vi.spyOn(Date, "now").mockReturnValue(now);
    try {
      await db.game.update({ where: { id: active.gameId }, data: { status, paidAt: new Date(now - 3_600_000) } });
      await db.game.update({ where: { id: queued.gameId }, data: { paidAt: new Date(now) } });
      await db.generationJob.update({ where: { id: `job_${active.gameId}` }, data: { status: "RUNNING", currentStep: "identity", updatedAt: new Date(now) } });
      expect(await nextPendingGame(c)).toBe(queued.gameId);
      await db.generationJob.update({ where: { id: `job_${active.gameId}` }, data: { updatedAt: new Date(now - PIPELINE_LEASE_MS - 1) } });
      expect(await nextPendingGame(c)).toBe(active.gameId);
    } finally { clock.mockRestore(); }
  }, 180_000);

  it("keeps the parking even when the rest of the slice cannot finish", async () => {
    // The decision is the only record that a committed reservation was never
    // dispatched. A read failing on the way to the end of the slice must not
    // lose it and leave the job looking like ordinary work.
    const { gameId } = await seed();
    const started = Date.now();
    const clock = { now: started };
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => clock.now);
    const ledger = db.worldBudgetLedger as unknown as { updateMany: (a: unknown) => Promise<unknown>; create: (a: unknown) => Promise<unknown> };
    const realUpdate = ledger.updateMany.bind(ledger), realCreate = ledger.create.bind(ledger);
    const rows = db.targetVariantAsset as unknown as { findMany: (a: unknown) => Promise<unknown> };
    const realFind = rows.findMany.bind(rows);
    let reads = 0;
    try {
      ledger.updateMany = async a => { clock.now += 300_000; return realUpdate(a); };
      ledger.create = async a => { clock.now += 300_000; return realCreate(a); };
      // The slice reads the rows once to decide what to do and once afterwards
      // to write the board statuses. The second read is the one that happens
      // AFTER the held outcome, and here it falls over.
      rows.findMany = async a => { if (++reads > 1) throw new Error("the database went away"); return realFind(a); };
      const w = worker();
      await expect(runLocalPatchWorldSlice(c, w.deps, gameId, { hardDeadlineAt: started + 290_000 }))
        .rejects.toThrow(/the database went away/);
      expect(w.dispatched, "zero provider calls").toEqual([]);
    } finally {
      ledger.updateMany = realUpdate; ledger.create = realCreate; rows.findMany = realFind; nowSpy.mockRestore();
    }
    // Parked anyway, with the reason.
    const job = await jobOf(gameId);
    expect(job.currentStep).toBe(LOCAL_PATCH_NEEDS_RELEASE);
    expect(job.status).toBe("FAILED");
    expect(job.lastError).toMatch(/needs releasing by hand/);
  }, 180_000);

  it("paints Tokyo now that its authored artwork ships with the nine-board release", async () => {
    const { gameId } = await seed({ scenes: [{ slug: "tokyo", version: LOCAL_PATCH_SCENE_VERSION }, { slug: "sydney", version: LOCAL_PATCH_SCENE_VERSION }] });
    const w = worker();
    const result = await runLocalPatchWorldSlice(c, w.deps, gameId);
    expect(result.blocked).toEqual([]);
    expect(result.outcomes.map(o => o.boardId)).toEqual(["tokyo"]);
    expect(result.outcomes[0]?.state).toBe("generated");
  }, 180_000);

  it("still reports an unauthored board without blocking the authored board behind it", async () => {
    const { gameId } = await seed({ scenes: [{ slug: "beach", version: sceneBySlug("beach").version }, { slug: "sydney", version: LOCAL_PATCH_SCENE_VERSION }] });
    const result = await runLocalPatchWorldSlice(c, worker().deps, gameId);
    expect(result.blocked).toEqual([{ boardId: "beach", reason: expect.stringContaining("no authored local-patch placements") }]);
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
    // A box with nothing to buy patches with must stop here saying nothing
    // happened, instead of falling through and having the game painted by a
    // different engine.
    fakes.openaiKey = "";
    expect(localPatchPainterDeps(c)).toBeNull();
    const { gameId } = await seed();
    const tick = await tickGeneration(c, gameId, 60_000);
    expect(tick.pending).toBe(false);
    expect(tick.status).toBe("TARGETS_GENERATING");
    expect(await db.targetVariantAsset.count()).toBe(0);
  }, 120_000);

  it("builds a painter when the box is configured to buy one", async () => {
    // Deliberately not ticked: building the painter is what is under test, and
    // running it would put a real request on a real account. What it does with
    // an answer is tested against a fake wire in the adapter's own suite.
    const painter = localPatchPainterDeps(c);
    expect(painter).not.toBeNull();
    expect(painter!.renderPolicySha256).toBe(localPatchRenderPolicySha256());
    expect(painter!.apiKey).toBe("synthetic-never-live");
  }, 60_000);

  it("stops asking for another tick once the ledger is holding the world", async () => {
    // A charge nobody can state holds the world, and a held world can authorise
    // nothing. Polling it would read the same rows forever and buy nothing.
    const { gameId } = await seed();
    const w = worker({ answer: reply({ usage: null }) });
    const result = await runLocalPatchWorldSlice(c, w.deps, gameId);
    expect(result.outcomes[0]?.state).toBe("stopped");
    expect(result.pending).toBe(false);
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId))).held).toBe(true);
    expect(result.attention).toMatch(/ledger is held/);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } })).toMatchObject({ status: "FAILED", currentStep: LOCAL_PATCH_NEEDS_RELEASE });
    const later = await seed({ gameId: "game-later-after-held" });
    await db.game.update({ where: { id: gameId }, data: { paidAt: new Date("2026-01-01T00:00:00Z") } });
    await db.game.update({ where: { id: later.gameId }, data: { paidAt: new Date("2026-01-02T00:00:00Z") } });
    expect(await nextPendingGame(c)).toBe(later.gameId);
    const calls = w.dispatched.length;
    expect(await runLocalPatchWorldSlice(c, w.deps, gameId)).toMatchObject({ claimed: false, pending: false });
    expect(w.dispatched).toHaveLength(calls);
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
      const scene = sceneBySlug(board.board, 6);
      expect(`public${scene.art.base}`, board.board).toBe(board.art);
      const bytes = await readFile(path.resolve(process.cwd(), board.art));
      expect(sha256Bytes(bytes), board.board).toBe(scene.art.sha256);
      // And every hide binds a mission this scene actually has.
      for (const hide of board.hides) expect(scene.targets.map(t => t.id), hide.id).toContain(hide.targetId);
    }
  }, 120_000);

  it("knows which of the nine boards a deployed build could actually paint", () => {
    const shippable = WORLD_LOCAL_PATCH_HIDES.filter(b => localPatchBoardBlockedReason(b) === null).map(b => b.board);
    // Every declared base is now public, immutable and included explicitly in
    // the generation function's trace; no work/ file is a runtime input.
    expect(shippable).toEqual(["sydney", "antarctica", "giza", "tokyo", "amazon", "greatwall", "marrakech", "newyork", "paris"]);
  });

  it("only ever paints a passing hide", () => {
    expect(PASSING_ANSWER.verdict).toBe("pass");
  });
});
