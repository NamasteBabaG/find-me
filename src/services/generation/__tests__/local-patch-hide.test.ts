import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import { LOCAL_PATCH_BOARD, LOCAL_PATCH_CROP, cropOf, maskOf } from "../../../domain/scene/local-patch-hides";
import { boardWizardBudgetOf, boardWizardWorldId, GenerationPaused } from "../board-conditioned-wizard";
import { readShippedBoardArt, runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import type { LocalPatchJudgeResult } from "../local-patch-judge";
import {
  LOCAL_PATCH_TEST_BOARD, bill, boardPng, clearWorld, paintedCrop, paintedOk, PASSING_ANSWER, reply, seedApprovedGame,
} from "./local-patch-fixtures";

/**
 * One hide, through the real thing: the approved identity, the real ledger, the
 * retained store on disk, the rows the player reads.
 *
 * The providers are synthetic and no network is touched. Everything ELSE is the
 * product - the identity gate at full strength with its own charge validated,
 * `WorldBudget` over real SQLite, `PrismaRetainedPurchaseStore` over real
 * FileBlob rows, and the target the game is actually played from.
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
const HIDE = BOARD.hides[1]!;

let scratch: string, db: PrismaClient, c: Container;

beforeAll(async () => {
  scratch = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-local-patch-hide-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "hide.sqlite").split(path.sep).join("/")}` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), secret: "test-secret", appUrl: "http://localhost:3000" } as unknown as Container;
}, 180_000);

afterAll(async () => {
  await db.$disconnect();
  if (path.basename(scratch).startsWith("findme-local-patch-hide-")) rmSync(scratch, { recursive: true, force: true });
});

beforeEach(async () => {
  fakes.appEnv = "qa"; fakes.generationEnabled = "on"; fakes.dailyCeiling = 0; fakes.testers = [];
  process.env.QA_BOARD_CONDITIONED_WIZARD = "true";
  await clearWorld(db);
});
afterEach(() => { delete process.env.QA_BOARD_CONDITIONED_WIZARD; });

/** A paid game whose identity a real gate has approved; this box may spend on it. */
async function seed(options: { gameId?: string; approved?: boolean } = {}) {
  const seeded = await seedApprovedGame(c, db, options);
  fakes.testers = [...fakes.testers, seeded.email];
  return seeded;
}

/** A fresh set of adapters, as a restarted worker would build them. */
function worker(options: { answer?: LocalPatchJudgeResult; hide?: typeof HIDE } = {}) {
  const dispatched: string[] = [];
  let deps: LocalPatchHideDeps = {
    renderPolicySha256: "p".repeat(64),
    readBoardArt: async () => boardPng(),
    render: async ({ requestKey, stylePng }) => {
      dispatched.push(requestKey);
      return paintedOk(await paintedCrop(stylePng, options.hide ?? HIDE), bill(`req-render-${requestKey}`));
    },
    // A distinct receipt per call, as a provider gives: the ledger refuses one
    // receipt paying for two different operations, and it is right to.
    judge: async () => { dispatched.push("judge"); return { ...(options.answer ?? reply()), requestId: `req-judge-${++judged}` }; },
  };
  return { dispatched, deps };
}

let judged = 0;
const rows = (gameId: string) => db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, include: { targetInstance: true } });

describe("one hide through the real pipeline", () => {
  it("paints it, keeps it, and writes a target the player can tap", async () => {
    const { gameId, userId } = await seed();
    const first = worker();
    const result = await runLocalPatchHide(c, first.deps, { gameId, board: BOARD, hide: HIDE });

    expect(result.state).toBe("generated");
    expect(first.dispatched).toEqual(["sydney-2:kneeling:render:1", "judge"]);

    const [row] = await rows(gameId);
    expect(row?.status).toBe("GENERATED");
    expect(row?.variant).toBe("A");
    expect(row?.slotId).toBe("sydney_surfboards_a");
    expect(row?.targetInstance.targetId).toBe("surfboards");
    expect(row?.targetInstance.spriteKind).toBe("image");
    expect(row?.assetId).toBe(result.assetId);

    // The picture the player fetches: the crop that was judged, signable.
    const asset = await db.asset.findUniqueOrThrow({ where: { id: result.assetId! } });
    expect(asset.type).toBe("TARGET_SPRITE");
    expect(asset.visibility).toBe("GAME");
    expect(asset.ownerId).toBe(userId);
    expect(asset.width).toBe(LOCAL_PATCH_CROP.width);
    const stored = await c.storage.get(asset.storagePath);
    expect(await sharp(stored).metadata()).toMatchObject({ width: LOCAL_PATCH_CROP.width, height: LOCAL_PATCH_CROP.height });

    // Drawn where the crop is; tapped where the child actually is.
    const rect = JSON.parse(row!.rectJson!), hitRect = JSON.parse(row!.hitRectJson!), anchor = JSON.parse(row!.headAnchorJson!);
    const crop = cropOf(HIDE), box = maskOf(HIDE);
    expect(rect).toEqual({ x: crop.left / LOCAL_PATCH_BOARD.width, y: crop.top / LOCAL_PATCH_BOARD.height,
      w: crop.width / LOCAL_PATCH_BOARD.width, h: crop.height / LOCAL_PATCH_BOARD.height });
    expect(result.geometryBasis).toBe("measured");
    // Inside the only rectangle the painter was allowed to fill, and not the
    // whole of it: the tap area is the figure, not the permission.
    expect(hitRect.x * LOCAL_PATCH_BOARD.width).toBeGreaterThanOrEqual(box.left);
    expect((hitRect.x + hitRect.w) * LOCAL_PATCH_BOARD.width).toBeLessThanOrEqual(box.left + box.width);
    expect(hitRect.w * LOCAL_PATCH_BOARD.width).toBeLessThan(box.width);
    expect(anchor.y * LOCAL_PATCH_BOARD.height).toBeGreaterThanOrEqual(box.top);
    expect(anchor.y).toBeLessThanOrEqual(hitRect.y + hitRect.h);

    // Both purchases in this game's own budget, beside the identity review.
    const audit = await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId));
    expect(audit.held).toBe(false);
    expect(audit.settledMicroUsd).toBeGreaterThan(260_000 + 48_800);
    expect(row!.costCents).toBeGreaterThan(0);
  }, 180_000);

  it("reads the board's real art, and only if it is the art the scene ships", async () => {
    // No injected reader: the production path, loading the file the placement
    // names and refusing it unless its bytes are the digest the scene publishes.
    const { gameId } = await seed();
    const dispatched: string[] = [];
    const result = await runLocalPatchHide(c, {
      renderPolicySha256: "p".repeat(64),
      render: async ({ requestKey, stylePng }) => {
        dispatched.push(requestKey);
        return paintedOk(await paintedCrop(stylePng, HIDE), bill(`req-render-${requestKey}`));
      },
      judge: async () => ({ ...reply(), requestId: `req-judge-${++judged}` }),
    }, { gameId, board: BOARD, hide: HIDE });
    expect(result.state).toBe("generated");
    expect(dispatched).toEqual(["sydney-2:kneeling:render:1"]);

    // And a placement pointing somewhere else is refused before anything is bought.
    const elsewhere = { ...BOARD, art: "public/scenes/sydney/refresh-20260907/thumb.webp" };
    await expect(runLocalPatchHide(c, worker().deps, { gameId: (await seed({ gameId: "game-wrong-art" })).gameId, board: elsewhere, hide: HIDE }))
      .rejects.toThrow(/while the scene ships/);
  }, 180_000);

  it("refuses board art whose bytes are not the ones the scene published", async () => {
    // The path agreeing is not the file agreeing. Art replaced in place - a
    // re-export, a recompression - is a board the patch would not belong to.
    // A small shipped file on purpose: the refusal must happen before the
    // decode, so a check that stopped working shows up as a failure rather than
    // as a machine quietly chewing through a board-sized image.
    const art = "public/scenes/sydney/refresh-20260907/thumb.webp";
    await expect(readShippedBoardArt(art, "0".repeat(64))).rejects.toThrow(/not the art this scene ships/);
    await expect(readShippedBoardArt("work/somewhere/board.png", "0".repeat(64))).rejects.toThrow(/not shipped art/);
    await expect(readShippedBoardArt("public/../secrets.png", "0".repeat(64))).rejects.toThrow(/not shipped art/);
  }, 120_000);

  it("settles a refused picture at the price it was actually billed", async () => {
    // An image of the wrong shape does not make a known charge unknown. The
    // charge is settled for what it cost, the attempt is finished rather than
    // the world being held, and the next attempt may run.
    const { gameId } = await seed();
    const refused = worker();
    const quarantined = Buffer.from("the picture that was refused");
    refused.deps = { ...refused.deps, render: async ({ requestKey }) => {
      refused.dispatched.push(requestKey);
      return { png: null, rejected: "invalid_output: the image is not the size that was asked for",
        quarantined, evidence: bill(`req-render-${requestKey}`), unknownReason: null };
    } } as typeof refused.deps;

    const result = await runLocalPatchHide(c, refused.deps, { gameId, board: BOARD, hide: HIDE });
    expect(result.state).toBe("refused");
    expect(result.reason).toMatch(/the painter returned nothing usable/);
    // The judge was never asked: there was nothing to judge.
    expect(refused.dispatched).toEqual(["sydney-2:kneeling:render:1"]);

    const budget = boardWizardBudgetOf(c), world = boardWizardWorldId(gameId);
    const row = await budget.readRequest(world, "sydney-2:kneeling:render:1");
    expect(row?.state, "a known charge must not be recorded as unknown").toBe("settled");
    expect((row as { evidence: { amountMicroUsd: number } }).evidence.amountMicroUsd).toBe(48_800);
    expect((await budget.audit(world)).held, "a bad picture is not a reason to hold a world").toBe(false);

    // No target, and nothing publishable.
    const [variant] = await rows(gameId);
    expect(variant?.status).toBe("FAILED");
    expect(variant?.assetId).toBeNull();
    expect(await db.asset.count({ where: { type: "TARGET_SPRITE" } })).toBe(0);

    // And the next attempt is a NEW purchase, not a repeat of the refused one.
    const second = worker();
    const again = await runLocalPatchHide(c, second.deps, { gameId, board: BOARD, hide: HIDE });
    expect(second.dispatched).toEqual(["sydney-2:kneeling:render:2", "judge"]);
    expect(again.state).toBe("generated");
  }, 180_000);

  it("does not buy it again when it is already done", async () => {
    const { gameId } = await seed();
    await runLocalPatchHide(c, worker().deps, { gameId, board: BOARD, hide: HIDE });
    const second = worker();
    const again = await runLocalPatchHide(c, second.deps, { gameId, board: BOARD, hide: HIDE });
    expect(second.dispatched).toEqual([]);
    expect(again.state).toBe("already-generated");
    expect((await rows(gameId))).toHaveLength(1);
  }, 180_000);

  it("finishes the target after a restart that lost the write, without buying anything again", async () => {
    // Everything was paid for and the acknowledgement of the last write is what
    // went missing. The next process must complete it from what is on disk.
    const { gameId } = await seed();
    const crashing = worker();
    const put = c.storage.put.bind(c.storage);
    c.storage.put = async (key, data, type) => {
      if (key.startsWith("game/")) throw new Error("the process died before the picture was written");
      return put(key, data, type);
    };
    await expect(runLocalPatchHide(c, crashing.deps, { gameId, board: BOARD, hide: HIDE })).rejects.toThrow(/before the picture/);
    c.storage.put = put;

    const [interrupted] = await rows(gameId);
    expect(interrupted?.status).toBe("PENDING");
    expect(interrupted?.attempts).toBe(1);
    expect(interrupted?.assetId).toBeNull();

    const restarted = worker();
    const result = await runLocalPatchHide(c, restarted.deps, { gameId, board: BOARD, hide: HIDE });
    expect(restarted.dispatched).toEqual([]);
    expect(result.state).toBe("generated");
    expect(result.replayed).toBe(true);
    expect(result.attempt).toBe(1);
    const [row] = await rows(gameId);
    expect(row?.status).toBe("GENERATED");
    expect(row?.assetId).toBeTruthy();
    expect(row?.attempts).toBe(1);
  }, 180_000);

  it("gives a refused hide one more attempt, and then stops", async () => {
    const { gameId } = await seed();
    const refusal = reply({ raw: JSON.stringify({ ...PASSING_ANSWER, childPresent: "fail", verdict: "fail",
      reason: "There is no child in the picture.", faults: [{ check: "childPresent", where: "the sand", what: "nobody is there" }] }) });

    const one = worker({ answer: refusal });
    const first = await runLocalPatchHide(c, one.deps, { gameId, board: BOARD, hide: HIDE });
    expect(first.state).toBe("refused");
    expect(one.dispatched).toEqual(["sydney-2:kneeling:render:1", "judge"]);
    // The picture is kept even though it was refused.
    expect(await db.asset.count({ where: { type: "REJECTED_PATCH" } })).toBe(1);

    const two = worker({ answer: refusal });
    const second = await runLocalPatchHide(c, two.deps, { gameId, board: BOARD, hide: HIDE });
    expect(two.dispatched).toEqual(["sydney-2:kneeling:render:2", "judge"]);
    expect(second.state).toBe("gave-up");

    const three = worker();
    const third = await runLocalPatchHide(c, three.deps, { gameId, board: BOARD, hide: HIDE });
    expect(three.dispatched).toEqual([]);
    expect(third.state).toBe("gave-up");
    const [row] = await rows(gameId);
    expect(row?.attempts).toBe(2);
    expect(row?.status).toBe("FAILED");
  }, 240_000);

  it("buys nothing at all for a child nobody has approved", async () => {
    const { gameId } = await seed({ gameId: "game-unapproved", approved: false });
    const w = worker();
    await expect(runLocalPatchHide(c, w.deps, { gameId, board: BOARD, hide: HIDE })).rejects.toThrow(/approval is required/);
    expect(w.dispatched).toEqual([]);
    expect(await rows(gameId)).toHaveLength(0);
  }, 180_000);

  it("buys nothing while generation is paused", async () => {
    const { gameId } = await seed();
    fakes.generationEnabled = "off";
    const w = worker();
    await expect(runLocalPatchHide(c, w.deps, { gameId, board: BOARD, hide: HIDE })).rejects.toBeInstanceOf(GenerationPaused);
    expect(w.dispatched).toEqual([]);
  }, 180_000);

  it("keeps two games buying the same hide apart", async () => {
    const a = await seed({ gameId: "game-a" });
    const b = await seed({ gameId: "game-b" });
    const first = worker(), second = worker();
    const one = await runLocalPatchHide(c, first.deps, { gameId: a.gameId, board: BOARD, hide: HIDE });
    const two = await runLocalPatchHide(c, second.deps, { gameId: b.gameId, board: BOARD, hide: HIDE });
    expect(first.dispatched).toEqual(["sydney-2:kneeling:render:1", "judge"]);
    expect(second.dispatched).toEqual(["sydney-2:kneeling:render:1", "judge"]);
    // Same hide, same request key, two children: two purchases, two pictures,
    // two budgets. A store keyed on the request alone gave the second game the
    // first game's child.
    expect(one.assetId).not.toBe(two.assetId);
    const auditA = await boardWizardBudgetOf(c).audit(boardWizardWorldId(a.gameId));
    const auditB = await boardWizardBudgetOf(c).audit(boardWizardWorldId(b.gameId));
    expect(auditA.settledMicroUsd).toBe(auditB.settledMicroUsd);
    expect(await rows(a.gameId)).toHaveLength(1);
    expect(await rows(b.gameId)).toHaveLength(1);
  }, 240_000);
});
