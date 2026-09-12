import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { PrismaClient, type Prisma } from "@prisma/client";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import { localPatchBoardForVersion } from "../../../domain/scene/local-patch-catalog";
import { LOCAL_PATCH_BOARD, cropOf, maskForHide } from "../../../domain/scene/local-patch-hides";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { localPatchBoardReviewKey, reviewLocalPatchBoard } from "../local-patch-board-review";
import { LOCAL_PATCH_PROVIDER } from "../local-patch-hide";
import { LOCAL_PATCH_PUBLICATION_ACTION, localPatchPublicationGeometryHash } from "../local-patch-publication-policy";
import { sha256Bytes } from "../fixed-sprite";
import { boardPng, clearWorld, PASSING_ANSWER, seedApprovedGame } from "./local-patch-fixtures";
import type { LocalPatchBoardJudgeRequest, LocalPatchBoardJudgeResult } from "../local-patch-judge";

vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: ["game-board-review@example.com"] }),
  flag: () => false, adminEmails: () => [],
}));
const GAME = "game-board-review", SCENE = `gsc-${GAME}-sydney`, BOARD = localPatchBoardForVersion("sydney", 7)!;
let dir: string, db: PrismaClient, c: Container, url: string;
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-board-review-")));
  url = `file:${path.join(dir, "test.sqlite").split(path.sep).join("/")}`;
  db = new PrismaClient({ datasources: { db: { url } } }); await applyTestSchema(db);
  c = { db, storage: new DbStorage(db) } as unknown as Container;
}, 180000);
afterAll(async () => { await db.$disconnect(); if (path.basename(dir).startsWith("findme-board-review-")) rmSync(dir, { recursive: true, force: true }); });
beforeEach(async () => {
  await clearWorld(db);
  const seeded = await seedApprovedGame(c, db, { gameId: GAME, approved: false, scenes: [{ slug: "sydney", version: 7 }],
    styleVersion: "local-patch-world-v1", status: "TARGETS_GENERATING", withJob: true });
  await db.generationJob.update({ where: { id: `job_${GAME}` }, data: { status: "RUNNING", attempts: 1 } });
  const photo = seeded.sheet;
  await c.storage.put(`private/photo-${GAME}.jpg`, photo, "image/png");
  const { sha256: catalogSha256 } = await readBoardConditionedCatalog();
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic-never-live", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {},
    write: work => db.$transaction(work), reviewer: { review: async () => ({ httpOk: true, requestId: "req_identity_board_review",
      body: { model: "gpt-5.6-luna", usage: { prompt_tokens: 2000, completion_tokens: 100 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
        checks: { identity: "pass", age: "pass", paintedStyle: "uncertain", sheetLayout: "pass" }, reason: "Synthetic advisory uncertainty" }) } }] } }) } }, {
    gameId: GAME, identityAssetId: `ast-sheet-${GAME}`, sheet: seeded.sheet, photo, atlas: seeded.sheet, contentVersion: 7,
    provenance: { promptVersion: "character-v4-board-drawn-face-reference", quality: "medium", photoAssetId: `ast-photo-${GAME}`, photoSha256: sha256Bytes(photo),
      ageYears: 8, crop: null, style: { version: "board-matched-identity/v2", catalogSha256, atlasSha256: sha256Bytes(seeded.sheet) } },
  });
  for (const [index, hide] of BOARD.hides.entries()) {
    const crop = cropOf(hide), box = maskForHide(hide), assetId = `ast-patch-${index}`, targetId = `target-${index}`;
    const png = await sharp({ create: { width: crop.width, height: crop.height, channels: 4, background: { r: 20 + 30 * index, g: 90, b: 100, alpha: 1 } } }).png().toBuffer();
    await c.storage.put(`game/${assetId}.png`, png, "image/png");
    await db.asset.create({ data: { id: assetId, ownerId: seeded.userId, type: "TARGET_SPRITE", visibility: "GAME", status: "READY",
      storagePath: `game/${assetId}.png`, mimeType: "image/png", width: crop.width, height: crop.height, bytes: png.length, provider: LOCAL_PATCH_PROVIDER, providerRequestId: GAME } });
    await db.targetInstance.create({ data: { id: targetId, gameSceneId: SCENE, targetId: hide.targetId, targetType: "child", spriteKind: "image", slotAId: "a", slotBId: "b" } });
    const row = await db.targetVariantAsset.create({ data: { id: `variant-${index}`, targetInstanceId: targetId, variant: "A", slotId: "a", assetId, status: "GENERATED", attempts: 1, provider: LOCAL_PATCH_PROVIDER,
      rectJson: JSON.stringify({ x: crop.left / LOCAL_PATCH_BOARD.width, y: crop.top / LOCAL_PATCH_BOARD.height, w: crop.width / LOCAL_PATCH_BOARD.width, h: crop.height / LOCAL_PATCH_BOARD.height }),
      hitRectJson: JSON.stringify({ x: (crop.left + box.left) / LOCAL_PATCH_BOARD.width, y: (crop.top + box.top) / LOCAL_PATCH_BOARD.height, w: box.width / LOCAL_PATCH_BOARD.width, h: box.height / LOCAL_PATCH_BOARD.height }),
      headAnchorJson: JSON.stringify({ x: (crop.left + box.left + box.width / 2) / LOCAL_PATCH_BOARD.width, y: (crop.top + box.top) / LOCAL_PATCH_BOARD.height }),
      judgeJson: JSON.stringify({ hide: hide.id, pose: hide.pose, reviewState: "pending-board-review", verdict: null, judgedSha256: sha256Bytes(png) }),
    } });
    await db.targetVariantAsset.update({ where: { id: row.id }, data: { judgeJson: JSON.stringify({ ...JSON.parse(row.judgeJson!), geometrySha256: localPatchPublicationGeometryHash(row) }) } });
  }
});
function worker(claim = 1, alteration: Partial<LocalPatchBoardJudgeResult> = {}) {
  const judge = vi.fn(async (request: LocalPatchBoardJudgeRequest): Promise<LocalPatchBoardJudgeResult> => ({
    verdict: null, verdicts: {}, raw: JSON.stringify({ hides: request.hides.map((hide, i) => ({ hideId: hide.hideId,
      verdict: i === 0 ? { ...PASSING_ANSWER, styleMatch: "fail", verdict: "fail", faults: [{ check: "styleMatch", where: "Synthetic photographic face" }] } : PASSING_ANSWER })) }),
    model: "gpt-5.6-luna", requestId: "req_group_board", usage: { prompt_tokens: 9000, completion_tokens: 1300 }, finishReason: "stop", wireFault: null, costUnknown: false, ...alteration,
  }));
  const fence = async (tx: Prisma.TransactionClient) => { const row = await tx.generationJob.findUniqueOrThrow({ where: { id: `job_${GAME}` } }); if (row.status !== "RUNNING" || row.attempts !== claim) throw new Error("stale-board-lease"); };
  return { judge, fence, readBoardArt: async () => boardPng() };
}
const input = () => ({ gameId: GAME, sceneId: SCENE, deadlineAt: Date.now() + 270000 });

describe("grouped board review: real ledger, durable bytes, five publication bindings, no network", () => {
  it("buys one review, publishes all five including fail, and a fresh DB client replays without dispatch", async () => {
    const deps = worker(), result = await reviewLocalPatchBoard(c, input(), deps);
    expect(result.state).toBe("done"); expect(deps.judge).toHaveBeenCalledTimes(1);
    expect(deps.judge.mock.calls[0]![0].hides).toHaveLength(5);
    const rows = await db.targetVariantAsset.findMany({ orderBy: { id: "asc" } });
    expect(rows.every(r => r.status === "GENERATED")).toBe(true);
    expect(JSON.parse(rows[0]!.judgeJson!).verdict.verdict).toBe("fail");
    expect(await db.auditLog.count({ where: { action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(5);
    const prior = rows.map(r => r.judgeJson);
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try { const resumed = worker(); const result2 = await reviewLocalPatchBoard({ ...c, db: fresh, storage: new DbStorage(fresh) }, input(), resumed);
      expect(result2).toMatchObject({ state: "done", replayed: true }); expect(resumed.judge).not.toHaveBeenCalled();
    } finally { await fresh.$disconnect(); }
    expect((await db.targetVariantAsset.findMany({ orderBy: { id: "asc" } })).map(r => r.judgeJson)).toEqual(prior);
    expect((await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(GAME), localPatchBoardReviewKey("sydney")))?.state).toBe("settled");
  });
  it("a duplicate/missing id remains five warnings, never five invented passes or another purchase", async () => {
    const deps = worker(1, { raw: JSON.stringify({ hides: [{ hideId: BOARD.hides[0]!.id, verdict: PASSING_ANSWER }] }) });
    expect((await reviewLocalPatchBoard(c, input(), deps)).state).toBe("done");
    for (const row of await db.targetVariantAsset.findMany()) expect(JSON.parse(row.judgeJson!)).toMatchObject({ verdict: null, wireFault: "schema", reviewState: "board-review-complete" });
    await reviewLocalPatchBoard(c, input(), deps); expect(deps.judge).toHaveBeenCalledTimes(1);
  });
  it("retains unknown usage and holds without publishing or buying twice", async () => {
    const deps = worker(1, { usage: null, costUnknown: true });
    expect((await reviewLocalPatchBoard(c, input(), deps)).state).toBe("held");
    expect((await reviewLocalPatchBoard(c, input(), deps)).state).toBe("held");
    expect(deps.judge).toHaveBeenCalledTimes(1);
    expect(await db.auditLog.count({ where: { action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(GAME))).held).toBe(true);
  });
  it("retains a taken-over worker's paid answer but only its replacement publishes it", async () => {
    const deps = worker(), original = deps.judge.getMockImplementation()!;
    deps.judge.mockImplementation(async request => { await db.generationJob.update({ where: { id: `job_${GAME}` }, data: { attempts: 2 } }); return original(request); });
    await expect(reviewLocalPatchBoard(c, input(), deps)).rejects.toThrow("stale-board-lease");
    expect(await db.auditLog.count({ where: { action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
    const replacement = worker(2);
    expect(await reviewLocalPatchBoard(c, input(), replacement)).toMatchObject({ state: "done", replayed: true });
    expect(replacement.judge).not.toHaveBeenCalled();
  });
  it("replays a committed publication whose acknowledgement was lost without charging or changing five bindings", async () => {
    const deps = worker();
    const transact = db.$transaction.bind(db);
    const interrupted = new Proxy(db, { get(target, property) {
      if (property !== "$transaction") return Reflect.get(target, property);
      return async (...args: any[]) => {
        const value = await (transact as (...input: any[]) => Promise<unknown>)(...args);
        if (await db.auditLog.count({ where: { action: LOCAL_PATCH_PUBLICATION_ACTION } }) === 5) throw new Error("lost-publication-acknowledgement");
        return value;
      };
    } });
    await expect(reviewLocalPatchBoard({ ...c, db: interrupted }, input(), deps)).rejects.toThrow("lost-publication-acknowledgement");
    const rows = await db.targetVariantAsset.findMany({ orderBy: { id: "asc" } });
    expect(await db.auditLog.count({ where: { action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(5);
    const replacement = worker();
    expect(await reviewLocalPatchBoard(c, input(), replacement)).toMatchObject({ state: "done", replayed: true });
    expect(replacement.judge).not.toHaveBeenCalled(); expect(deps.judge).toHaveBeenCalledOnce();
    expect((await db.targetVariantAsset.findMany({ orderBy: { id: "asc" } })).map(row => row.judgeJson)).toEqual(rows.map(row => row.judgeJson));
  });
  it("defers with no reservation and refuses swapped shipping bytes before buying again", async () => {
    const deps = worker();
    expect((await reviewLocalPatchBoard(c, { ...input(), deadlineAt: Date.now() + 1000 }, deps)).state).toBe("pending");
    expect(deps.judge).not.toHaveBeenCalled();
    expect(await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(GAME), localPatchBoardReviewKey("sydney"))).toBeNull();
    await reviewLocalPatchBoard(c, input(), deps);
    const patch = await c.storage.get("game/ast-patch-0.png");
    const changed = await sharp(patch).modulate({ brightness: .5 }).png().toBuffer();
    await c.storage.put("game/ast-patch-0.png", changed, "image/png");
    await expect(reviewLocalPatchBoard(c, input(), deps)).rejects.toThrow("render-completion binding");
    expect(deps.judge).toHaveBeenCalledTimes(1);
  });
  it.each(["image", "geometry", "hide"] as const)("refuses changed %s before the FIRST review rather than minting approval", async kind => {
    const deps = worker();
    if (kind === "image") {
      const changed = await sharp(await c.storage.get("game/ast-patch-0.png")).modulate({ brightness: .5 }).png().toBuffer();
      await c.storage.put("game/ast-patch-0.png", changed, "image/png");
    } else {
      const row = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: "variant-0" } });
      await db.targetVariantAsset.update({ where: { id: row.id }, data: kind === "geometry"
        ? { hitRectJson: JSON.stringify({ ...JSON.parse(row.hitRectJson!), w: .3 }) }
        : { judgeJson: JSON.stringify({ ...JSON.parse(row.judgeJson!), hide: "another-hide" }) } });
    }
    await expect(reviewLocalPatchBoard(c, input(), deps)).rejects.toThrow("render-completion binding");
    expect(deps.judge).not.toHaveBeenCalled();
    expect(await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(GAME), localPatchBoardReviewKey("sydney"))).toBeNull();
    expect(await db.auditLog.count({ where: { action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(0);
  });
});
