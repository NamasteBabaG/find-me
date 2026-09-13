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
import { localPatchBoardReviewKey, localPatchBoardReviewKeys, reviewLocalPatchBoard } from "../local-patch-board-review";
import { boundedCompositionPermission, LOCAL_PATCH_COMPOSITION_VERSION, LOCAL_PATCH_RETURN_GUARD, type SeamReport } from "../local-patch-seam";
import { LOCAL_PATCH_PROVIDER, type LocalPatchHideDeps } from "../local-patch-hide";
import { LOCAL_PATCH_PUBLICATION_ACTION, localPatchPublicationGeometryHash, recordLocalPatchPublicationPolicy } from "../local-patch-publication-policy";
import { localPatchPrivateInventory, runLocalPatchWorldSlice } from "../local-patch-world";
import { retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { sha256Bytes } from "../fixed-sprite";
import { bill, boardPng, clearWorld, paintedCrop, paintedOk, PASSING_ANSWER, seedApprovedGame } from "./local-patch-fixtures";
import { localPatchBoardJudgeImages, type LocalPatchBoardJudgeRequest, type LocalPatchBoardJudgeResult } from "../local-patch-judge";

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

describe("strict v8 candidate review", () => {
  beforeEach(async () => {
    await db.gameScene.update({ where: { id: SCENE }, data: { sceneVersion: 8 } });
    for (const row of await db.targetVariantAsset.findMany()) await db.targetVariantAsset.update({ where: { id: row.id },
      data: { judgeJson: JSON.stringify({ ...JSON.parse(row.judgeJson!), compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION }) } });
  });
  const strictWorker = (failedIndex: number | null, check = "severeSeam") => {
    const deps = worker();
    deps.judge.mockImplementation(async request => ({ verdict: null, verdicts: {},
      raw: JSON.stringify({ hides: request.hides.map((hide, index) => ({ hideId: hide.hideId, verdict: {
        ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass",
        ...(index === failedIndex ? { [check]: "fail", faults: [{ check, where: "A clear defect at the upper crop edge" }] } : {}),
      } })) }), model: "gpt-5.6-luna", requestId: `req_strict_${failedIndex ?? "clean"}`,
      usage: { prompt_tokens: 9000, completion_tokens: 1300 }, finishReason: "stop", wireFault: null, costUnknown: false,
    }));
    return deps;
  };
  it("shows each serial appearance with original pixels outside its replacement boundary", async () => {
    const deps = strictWorker(null);
    await reviewLocalPatchBoard(c, input(), deps);
    const request = deps.judge.mock.calls[0]![0];
    expect(request.contentVersion).toBe(8);
    for (const [index, hide] of request.hides.entries()) {
      const metadata = await sharp(hide.afterPng).metadata();
      expect(metadata.width).toBeGreaterThan(512); expect(metadata.height).toBeGreaterThan(768);
      const raw = await sharp(hide.afterPng).ensureAlpha().raw().toBuffer();
      expect([...raw.subarray(0, 3)]).toEqual([210, 190, 150]);
      const context = await sharp(hide.beforePng).metadata();
      expect(context.width).toBe(metadata.width); expect(context.height).toBe(metadata.height);
      const crop = cropOf(BOARD.hides[index]!);
      const left = Math.min(64, crop.left), top = Math.min(64, crop.top);
      const ownPatch = await sharp(hide.afterPng).extract({ left, top, width: crop.width, height: crop.height }).raw().toBuffer();
      expect(ownPatch.equals(await sharp(await c.storage.get(`game/ast-patch-${index}.png`)).raw().toBuffer())).toBe(true);
      const mask = maskForHide(BOARD.hides[index]!), guard = LOCAL_PATCH_RETURN_GUARD;
      const region = { left: Math.max(0, mask.left - guard), top: Math.max(0, mask.top - guard),
        width: Math.min(crop.width, mask.left + mask.width + guard) - Math.max(0, mask.left - guard),
        height: Math.min(crop.height, mask.top + mask.height + guard) - Math.max(0, mask.top - guard) };
      const expectedDetail = await sharp(await c.storage.get(`game/ast-patch-${index}.png`)).extract(region).raw().toBuffer();
      expect((await sharp(hide.closeupPng!).raw().toBuffer()).equals(expectedDetail)).toBe(true);
      const leftPanel = await sharp(hide.afterEvidencePng!).extract({ left: 0, top: 0, width: metadata.width!, height: metadata.height! }).raw().toBuffer();
      expect(leftPanel.equals(raw)).toBe(true);
      const rightPanel = await sharp(hide.afterEvidencePng!).extract({ left: metadata.width! + 24, top: 0, width: region.width, height: region.height }).raw().toBuffer();
      expect(rightPanel.equals(expectedDetail)).toBe(true);
    }
    const wireHashes = localPatchBoardJudgeImages(request).map(sha256Bytes);
    expect(wireHashes).toHaveLength(12);
    const saved = JSON.parse((await db.targetVariantAsset.findUniqueOrThrow({ where: { id: "variant-0" } })).judgeJson!);
    expect(saved.boardReview).toMatchObject({ compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION, wireHashes });
  });
  it("never aliases historical review keys when head-safe pixels or the question change", async () => {
    const vector = [1, 1, 1, 1, 1], oldKey = localPatchBoardReviewKey("sydney", vector, null),
      headSafeKey = localPatchBoardReviewKey("sydney", vector, "bounded-return/v2-head-safe"), currentKey = localPatchBoardReviewKey("sydney", vector);
    expect(oldKey).toBe("board:sydney:five-review:v8:1-1-1-1-1");
    expect(headSafeKey).toBe(`${oldKey}:bounded-return.v2-head-safe`);
    expect(currentKey).toBe(`${oldKey}:bounded-return.v3-head-safe-axis`);
    expect(localPatchBoardReviewKey("sydney")).toBe("board:sydney:five-review:1");
    const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(GAME);
    for (const key of [oldKey, headSafeKey]) {
      await budget.reserve(worldId, { requestKey: key, scope: "judge", operationFingerprint: "b".repeat(64), reserveMicroUsd: 30000 });
      await budget.settle(worldId, key, { providerNamespace: "openai:find-me-existing", providerRequestId: `old-review-request-${key}`, usageId: `old-review-usage-${key}`,
        rawUsage: { prompt_tokens: 100, completion_tokens: 20 }, model: "gpt-5.6-luna", amountMicroUsd: 100, costBasis: "conservative-upper-estimate" });
    }
    const old = await Promise.all([oldKey, headSafeKey].map(key => budget.readRequest(worldId, key))), deps = strictWorker(null);
    expect(await reviewLocalPatchBoard(c, input(), deps)).toMatchObject({ state: "done", replayed: false });
    expect(deps.judge).toHaveBeenCalledOnce();
    expect(await Promise.all([oldKey, headSafeKey].map(key => budget.readRequest(worldId, key)))).toEqual(old);
    expect((await budget.readRequest(worldId, currentKey))?.state).toBe("settled");
    expect(await reviewLocalPatchBoard(c, input(), deps)).toMatchObject({ state: "done", replayed: true });
    expect(deps.judge).toHaveBeenCalledOnce();
    const keys = localPatchBoardReviewKeys("sydney");
    expect(keys).toHaveLength(730); expect(new Set(keys).size).toBe(730);
    expect(keys).toContain(oldKey); expect(keys).toContain(headSafeKey); expect(keys).toContain(currentKey);
    const inventory = await localPatchPrivateInventory(c, GAME);
    for (const key of [oldKey, headSafeKey, currentKey]) expect(inventory.retainedPurchaseKeys).toContain(retainedPurchaseKey(worldId, key));
    const ageKey = localPatchBoardReviewKey("sydney", [1, 1, 1, 1, 1], LOCAL_PATCH_COMPOSITION_VERSION, 9);
    expect(ageKey).not.toBe(currentKey);
    expect(localPatchBoardReviewKeys("sydney", 9)).toContain(ageKey);
    expect(inventory.retainedPurchaseKeys).toContain(retainedPurchaseKey(worldId, ageKey));
    expect(inventory.retainedPurchaseKeys).toContain(retainedPurchaseKey(worldId, "canonical-age:identity:1"));
  });
  it("defers an old composed crop until free refresh rather than judging its obsolete truncated pixels", async () => {
    const row = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: "variant-0" } }), meta = JSON.parse(row.judgeJson!);
    delete meta.compositionVersion;
    await db.targetVariantAsset.update({ where: { id: row.id }, data: { judgeJson: JSON.stringify(meta) } });
    const deps = strictWorker(null);
    expect(await reviewLocalPatchBoard(c, input(), deps)).toMatchObject({ state: "pending", costCents: 0 });
    expect(deps.judge).not.toHaveBeenCalled();
    expect(await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(GAME), localPatchBoardReviewKey("sydney", [1, 1, 1, 1, 1]))).toBeNull();
  });
  it.each(["severeSeam", "faceLikeness", "faceReadable"])("concludes a located %s failure without repainting four good siblings", async check => {
    const candidate = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: "variant-0" } });
    const seam: SeamReport = { verdict: "misaligned", shift: { dx: -1, dy: 1 }, borderMeanDiff: 17.18, borderMaxDiff: 91,
      changedFraction: .18, changedTouchesBorder: true, strayChangedFraction: 0, reason: "Measured diagonal shift, not a visual approval" };
    const compositionPermission = boundedCompositionPermission(seam);
    expect(compositionPermission).toBe("one-pixel-per-axis-tolerance");
    await db.targetVariantAsset.update({ where: { id: candidate.id }, data: { judgeJson: JSON.stringify({ ...JSON.parse(candidate.judgeJson!),
      compositionPermission, seam,
    }) } });
    const deps = strictWorker(0, check), result = await reviewLocalPatchBoard(c, input(), deps);
    expect(result.state).toBe("retry");
    const rows = await db.targetVariantAsset.findMany({ orderBy: { id: "asc" } });
    expect(rows[0]).toMatchObject({ status: "FAILED", attempts: 1, assetId: "ast-patch-0" });
    expect(await db.targetInstance.findUnique({ where: { id: "target-0" } })).toMatchObject({ status: "FAILED" });
    expect(JSON.parse(rows[0]!.rejectedAssetIdsJson!)).toContain("ast-patch-0");
    expect(JSON.parse(rows[0]!.judgeJson!)).toMatchObject({ compositionPermission,
      seam, qualityDisposition: { state: "retry" } });
    expect(rows.slice(1).every(row => row.status === "GENERATED" && row.attempts === 1)).toBe(true);
    expect(await db.auditLog.count({ where: { action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(4);
    await reviewLocalPatchBoard(c, input(), deps);
    expect(deps.judge).toHaveBeenCalledOnce();
  });
  it.each(["severeSeam", "faceReadable"])("a tolerated diagonal never bypasses %s; only that hide retries through attempt3", async check => {
    const first = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: "variant-0" } });
    const seam: SeamReport = { verdict: "misaligned", shift: { dx: -1, dy: -1 }, borderMeanDiff: 15.98, borderMaxDiff: 94,
      changedFraction: .2, changedTouchesBorder: true, strayChangedFraction: 0, reason: "A composed candidate still requires its final visual checks" };
    const permission = boundedCompositionPermission(seam);
    expect(permission).toBe("one-pixel-per-axis-tolerance");
    await db.targetVariantAsset.update({ where: { id: first.id }, data: { judgeJson: JSON.stringify({ ...JSON.parse(first.judgeJson!),
      compositionPermission: permission, seam }) } });
    const deps = strictWorker(0, check), answer = deps.judge.getMockImplementation()!;
    let reviewCalls = 0;
    deps.judge.mockImplementation(async request => ({ ...await answer(request), requestId: `required-${check}-${++reviewCalls}` }));
    expect((await reviewLocalPatchBoard(c, input(), deps)).state).toBe("retry");
    const rejected = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: first.id } });
    const identitySha256 = sha256Bytes(await c.storage.get(`private/sheet-${GAME}.png`));
    const imageSha256 = sha256Bytes(await c.storage.get("game/ast-patch-0.png"));
    await expect(db.$transaction(tx => recordLocalPatchPublicationPolicy(tx, {
      gameId: GAME, sceneVersion: 8, hideId: BOARD.hides[0]!.id, variantId: rejected.id, attempts: rejected.attempts,
      identityAssetId: `ast-sheet-${GAME}`, identitySha256,
      assetId: rejected.assetId!, imageSha256,
      geometrySha256: localPatchPublicationGeometryHash(rejected), judgeJson: rejected.judgeJson,
    }))).rejects.toThrow(/quality policy/);
    await db.generationJob.update({ where: { id: `job_${GAME}` }, data: { status: "QUEUED" } });
    const render = vi.fn<LocalPatchHideDeps["render"]>(async request => {
      expect(request.requestKey).toMatch(new RegExp(`^${BOARD.hides[0]!.id}:.*:render:[23]$`));
      return paintedOk(await paintedCrop(request.stylePng, BOARD.hides[0]!), bill(`repair-${check}-${request.requestKey}`));
    });
    const hideDeps: LocalPatchHideDeps = { render, renderPolicySha256: "d".repeat(64), apiKey: "synthetic-no-network", readBoardArt: deps.readBoardArt };
    for (let tick = 0; tick < 3; tick++) await runLocalPatchWorldSlice(c, hideDeps, GAME, { boardJudge: deps.judge });
    const rows = await db.targetVariantAsset.findMany({ orderBy: { id: "asc" } });
    expect(rows.map(row => row.attempts)).toEqual([3, 1, 1, 1, 1]);
    expect(rows[0]!.status).toBe("FAILED");
    expect(rows.slice(1).map(row => row.assetId)).toEqual(["ast-patch-1", "ast-patch-2", "ast-patch-3", "ast-patch-4"]);
    expect(render).toHaveBeenCalledTimes(2); expect(deps.judge).toHaveBeenCalledTimes(3);
    const publications = await db.auditLog.findMany({ where: { action: LOCAL_PATCH_PUBLICATION_ACTION } });
    expect(publications.every(row => JSON.parse(row.metaJson!).variantId !== first.id)).toBe(true);
    expect((await db.game.findUniqueOrThrow({ where: { id: GAME } })).configJson).toBeNull();
    expect(await boardWizardBudgetOf(c).readRequest(boardWizardWorldId(GAME), `${BOARD.hides[0]!.id}:${BOARD.hides[0]!.pose}:render:4`)).toBeNull();
  }, 120000);
  it("re-reviews changed candidate attempts, preserves siblings, and replays the new receipt without buying", async () => {
    await reviewLocalPatchBoard(c, input(), strictWorker(0));
    const row = await db.targetVariantAsset.findUniqueOrThrow({ where: { id: "variant-0" } });
    const source = await db.asset.findUniqueOrThrow({ where: { id: "ast-patch-0" } });
    const png = await sharp(await c.storage.get(source.storagePath)).modulate({ brightness: .9 }).png().toBuffer();
    await c.storage.put("game/ast-patch-retry.png", png, "image/png");
    await db.asset.create({ data: { ...source, id: "ast-patch-retry", storagePath: "game/ast-patch-retry.png", bytes: png.length } });
    await db.targetVariantAsset.update({ where: { id: row.id }, data: { status: "GENERATED", attempts: 2, assetId: "ast-patch-retry",
      judgeJson: JSON.stringify({ ...JSON.parse(row.judgeJson!), judgedSha256: sha256Bytes(png), reviewState: "pending-board-review" }) } });
    const deps = strictWorker(null);
    expect((await reviewLocalPatchBoard(c, input(), deps)).state).toBe("done");
    expect((await reviewLocalPatchBoard(c, input(), deps))).toMatchObject({ state: "done", replayed: true });
    expect(deps.judge).toHaveBeenCalledOnce();
    expect(await db.auditLog.count({ where: { action: LOCAL_PATCH_PUBLICATION_ACTION } })).toBe(9);
    const rows = await db.targetVariantAsset.findMany({ orderBy: { id: "asc" } });
    expect(rows.map(r => r.attempts)).toEqual([2, 1, 1, 1, 1]);
    expect(rows.slice(1).map(r => r.assetId)).toEqual(["ast-patch-1", "ast-patch-2", "ast-patch-3", "ast-patch-4"]);
    const key = JSON.parse(rows[0]!.judgeJson!).boardReview.requestKey;
    expect(key).not.toBe(localPatchBoardReviewKey("sydney"));
    const inventory = await localPatchPrivateInventory(c, GAME);
    expect(inventory.retainedPurchaseKeys).toContain(retainedPurchaseKey(boardWizardWorldId(GAME), key));
  });
  it.each(["unsure", "malformed"])("keeps %s severe evidence blocked across a lost terminal acknowledgement without buying images", async kind => {
    const deps = strictWorker(null), original = deps.judge.getMockImplementation()!;
    deps.judge.mockImplementation(async request => {
      const answer = await original(request), parsed = JSON.parse(answer.raw!);
      if (kind === "unsure") parsed.hides[0].verdict.faceReadable = "unsure";
      else delete parsed.hides[0].verdict.faceReadable;
      return { ...answer, raw: JSON.stringify(parsed) };
    });
    expect((await reviewLocalPatchBoard(c, input(), deps)).state).toBe("blocked");
    // Simulate death between committed review decisions and world termination.
    await db.generationJob.update({ where: { id: `job_${GAME}` }, data: { status: "QUEUED" } });
    const render = vi.fn(async () => { throw new Error("An unresolved review must not buy replacement imagery"); });
    const result = await runLocalPatchWorldSlice(c, { renderPolicySha256: "a".repeat(64), render }, GAME, { boardJudge: deps.judge });
    expect(result).toMatchObject({ pending: false, claimed: true });
    expect(await db.game.findUnique({ where: { id: GAME } })).toMatchObject({ status: "GENERATION_FAILED", configJson: null });
    expect(await db.generationJob.findUnique({ where: { id: `job_${GAME}` } })).toMatchObject({ status: "DONE", currentStep: "local-patch:quality-failed" });
    expect(render).not.toHaveBeenCalled(); expect(deps.judge).toHaveBeenCalledOnce();
  });
});
