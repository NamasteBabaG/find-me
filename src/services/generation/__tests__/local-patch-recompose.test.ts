import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Container } from "../../container";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { MockPaymentProvider } from "../../../infra/payment/mock";
import { MockAvatarProvider, NoopFaceDetector } from "../../../infra/generation/mock";
import { NoPatchJudge } from "../../../infra/generation/judge";
import { NoopAnalytics } from "../../../infra/analytics/console";
import { InlineJobRunner } from "../../../infra/jobs/inline";
import { retainedPurchaseKey } from "../../../infra/db/prisma-retained-purchase-store";
import { localPatchBoardForVersion } from "../../../domain/scene/local-patch-catalog";
import { cropOf, maskForHide } from "../../../domain/scene/local-patch-hides";
import { runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import { runLocalPatchWorldSlice, localPatchPrivateInventory, LOCAL_PATCH_NEEDS_RELEASE } from "../local-patch-world";
import { localPatchNeedsRecomposition, recomposeLocalPatchHide, LOCAL_PATCH_RECOMPOSE_ACTION } from "../local-patch-recompose";
import { applyLocalPatch, analysePatchSeam, LOCAL_PATCH_COMPOSITION_VERSION } from "../local-patch-seam";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { sha256Bytes } from "../fixed-sprite";
import type { LocalPatchBoardJudgeRequest, LocalPatchBoardJudgeResult } from "../local-patch-judge";
import { bill, boardPng, paintedCrop, paintedOk, PASSING_ANSWER, seedApprovedGame } from "./local-patch-fixtures";

const fake = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
  GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: fake.testers }), flag: () => false, adminEmails: () => [] }));
const BOARD = localPatchBoardForVersion("sydney", 8)!;
let directory: string, url: string, db: PrismaClient, c: Container, original: Buffer;
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-recompose-")));
  url = `file:${path.join(directory, "test.sqlite").split(path.sep).join("/")}`;
  db = new PrismaClient({ datasources: { db: { url } } }); await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-recompose",
    payment: new MockPaymentProvider("http://localhost:3000", "synthetic"), avatars: new MockAvatarProvider(),
    judge: new NoPatchJudge(), faces: new NoopFaceDetector(), analytics: new NoopAnalytics(), jobs: new InlineJobRunner(),
    email: { id: "console", send: async () => { throw new Error("A one-board fixture must never send publication mail"); } }, adminEmails: [] };
  original = await boardPng();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No network in recomposition tests"); }));
}, 180000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  const parent = realpathSync(tmpdir());
  if (path.dirname(directory) === parent && path.basename(directory).startsWith("findme-recompose-")) rmSync(directory, { recursive: true, force: true });
});

async function seed(gameId: string) {
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: "local-patch-world-v1", status: "TARGETS_GENERATING",
    withJob: true, scenes: [{ slug: "sydney", version: 8 }] });
  fake.testers.push(seeded.email); await c.storage.put(`private/photo-${gameId}.jpg`, seeded.sheet, "image/png");
  const { sha256: catalogSha256 } = await readBoardConditionedCatalog();
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic", budget: boardWizardBudgetOf(c), beforeDispatch: async () => {}, write: work => db.$transaction(work),
    reviewer: { review: async () => ({ httpOk: true, requestId: `req-${gameId}-identity`, body: { model: "gpt-5.6-luna",
      usage: { prompt_tokens: 1500, completion_tokens: 150 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
        checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Synthetic identity" }) } }] } }) } },
  { gameId, identityAssetId: `ast-sheet-${gameId}`, sheet: seeded.sheet, photo: seeded.sheet, atlas: seeded.sheet, contentVersion: 8,
    provenance: { promptVersion: "character-v4-board-drawn-face-reference", quality: "medium", photoAssetId: `ast-photo-${gameId}`,
      photoSha256: sha256Bytes(seeded.sheet), ageYears: 8, crop: null,
      style: { version: "board-matched-identity/v2", catalogSha256, atlasSha256: sha256Bytes(seeded.sheet) } } });
  const raw = new Map<string, Buffer>();
  const render = vi.fn(async ({ requestKey, stylePng }: Parameters<LocalPatchHideDeps["render"]>[0]) => {
    const hide = BOARD.hides.find(h => requestKey.startsWith(`${h.id}:`))!, mask = maskForHide(hide);
    const png = await sharp(await paintedCrop(stylePng, hide)).composite([{ input: { create: { width: 28, height: 36, channels: 4, background: "#b06080" } },
      left: mask.left + 10, top: mask.top - 75 }]).png().toBuffer();
    raw.set(hide.id, png); return paintedOk(png, bill(`req-${gameId}-${requestKey}`));
  });
  const deps: LocalPatchHideDeps = { renderPolicySha256: "f".repeat(64), render, readBoardArt: async () => original,
    judge: async () => { throw new Error("No per-hide review in v8"); } };
  for (const hide of BOARD.hides) expect((await runLocalPatchHide(c, deps, { gameId, board: BOARD, hide })).state).toBe("generated");
  const sceneId = `gsc-${gameId}-sydney`;
  for (const index of [2, 4]) {
    const hide = BOARD.hides[index]!, crop = cropOf(hide), mask = maskForHide(hide), png = raw.get(hide.id)!;
    const local = { left: mask.left - 32, top: mask.top - 32, width: mask.width + 64, height: mask.height + 64 };
    const region = { ...local, left: crop.left + local.left, top: crop.top + local.top };
    const oldWindow = await sharp(png).extract(local).png().toBuffer();
    const report = await analysePatchSeam(original, region, oldWindow, { allowedRect: { left: 0, top: 0, width: local.width, height: local.height } });
    const oldShipping = await sharp(await applyLocalPatch(original, region, oldWindow, { fade: true, report })).extract(crop).png().toBuffer();
    const instance = await db.targetInstance.findUniqueOrThrow({ where: { gameSceneId_targetId: { gameSceneId: sceneId, targetId: hide.targetId } } });
    const row = await db.targetVariantAsset.findUniqueOrThrow({ where: { targetInstanceId_variant: { targetInstanceId: instance.id, variant: "A" } } });
    const source = await db.asset.findUniqueOrThrow({ where: { id: row.assetId! } });
    const oldId = `ast-old-${gameId}-${index}`, key = `game/${oldId}.png`;
    await c.storage.put(key, oldShipping, "image/png");
    await db.asset.create({ data: { ...source, id: oldId, storagePath: key, bytes: oldShipping.length } });
    const oldJudge = { ...JSON.parse(row.judgeJson!), compositionVersion: undefined, judgedSha256: sha256Bytes(oldShipping),
      reviewState: "board-review-complete", verdict: { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass" } };
    await db.targetVariantAsset.update({ where: { id: row.id }, data: { assetId: oldId, status: index === 4 ? "FAILED" : "GENERATED", judgeJson: JSON.stringify(oldJudge) } });
    await db.targetInstance.update({ where: { id: instance.id }, data: { spriteAssetId: oldId, status: index === 4 ? "FAILED" : "GENERATED" } });
  }
  await db.gameScene.update({ where: { id: sceneId }, data: { generationStatus: "GENERATED" } });
  return { gameId, sceneId, deps, render, raw };
}
const rowsOf = (gameId: string) => db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, orderBy: { targetInstance: { targetId: "asc" } } });
const review = (id: string) => vi.fn(async (request: LocalPatchBoardJudgeRequest): Promise<LocalPatchBoardJudgeResult> => ({
  verdict: null, verdicts: {}, model: "gpt-5.6-luna", requestId: `review-${id}`, usage: { prompt_tokens: 9000, completion_tokens: 1200 },
  raw: JSON.stringify({ hides: request.hides.map(h => ({ hideId: h.hideId, verdict: { ...PASSING_ANSWER, faceLikeness: "pass", faceReadable: "pass", severeSeam: "pass" } })) }),
  wireFault: null, costUnknown: false, finishReason: "stop",
}));

describe("free v8 compositor refresh, durable purchases and normal queue", () => {
  it("salvages an earlier settled image when the latest compositor candidate fails, without spending attempt3", async () => {
    const f = await seed("recompose-prior"), hide = BOARD.hides[4]!, budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(f.gameId);
    const latestRender = vi.fn(async () => paintedOk(await sharp({ create: { width: 512, height: 768, channels: 4, background: "#00ffff" } }).png().toBuffer(),
      bill(`req-${f.gameId}-latest`)));
    expect((await runLocalPatchHide(c, { ...f.deps, render: latestRender }, { gameId: f.gameId, board: BOARD, hide })).state).toBe("gave-up");
    const latest = (await rowsOf(f.gameId))[4]!, old = JSON.parse(latest.judgeJson!); delete old.compositionVersion;
    await db.targetVariantAsset.update({ where: { id: latest.id }, data: { judgeJson: JSON.stringify(old) } });
    const before = await rowsOf(f.gameId), priorKey = `${hide.id}:${hide.pose}:render:1`, latestKey = `${hide.id}:${hide.pose}:render:2`;
    const receipts = await Promise.all([priorKey, latestKey].map(key => budget.readRequest(worldId, key)));
    const boardJudge = review(f.gameId);
    expect(await runLocalPatchWorldSlice(c, f.deps, f.gameId, { boardJudge })).toMatchObject({ pending: false, attention: null });
    const after = await rowsOf(f.gameId), selected = JSON.parse(after[4]!.judgeJson!);
    expect(after.map(row => [row.attempts, row.costCents])).toEqual(before.map(row => [row.attempts, row.costCents]));
    expect(after[4]).toMatchObject({ status: "GENERATED", attempts: 2 });
    expect(selected.renderPurchase.requestKey).toBe(priorKey);
    expect(selected.recompositionSelection).toMatchObject({ reason: "latest-composition-refused-earlier-paid-image-usable", latestRequestKey: latestKey,
      latestRawRefusal: { usable: false, report: { verdict: "background-rewritten" } } });
    expect(await Promise.all([priorKey, latestKey].map(key => budget.readRequest(worldId, key)))).toEqual(receipts);
    expect(await budget.readRequest(worldId, `${hide.id}:${hide.pose}:render:3`)).toBeNull();
    expect(f.render).toHaveBeenCalledTimes(5); expect(latestRender).toHaveBeenCalledOnce(); expect(boardJudge).toHaveBeenCalledOnce();
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: LOCAL_PATCH_RECOMPOSE_ACTION, entityId: f.gameId, metaJson: { contains: latest.id } } });
    expect(JSON.parse(audit.metaJson!)).toMatchObject({ attempts: 2, requestKey: priorKey, recompositionSelection: selected.recompositionSelection });
    await runLocalPatchWorldSlice(c, f.deps, f.gameId, { boardJudge });
    expect(f.render).toHaveBeenCalledTimes(5); expect(boardJudge).toHaveBeenCalledOnce();
  }, 120000);

  it("refreshes old GENERATED/FAILED from their paid pixels before retries, restores heads and reviews once", async () => {
    const f = await seed("recompose-queue"), before = await rowsOf(f.gameId), budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(f.gameId);
    const audit = await budget.audit(worldId), boardJudge = review(f.gameId);
    const originalBills = await Promise.all(BOARD.hides.map(h => budget.readRequest(worldId, `${h.id}:${h.pose}:render:1`)));
    const first = await runLocalPatchWorldSlice(c, f.deps, f.gameId, { maxHides: 1, boardJudge });
    expect(first).toMatchObject({ pending: true, attention: null });
    expect(f.render).toHaveBeenCalledTimes(5); expect(boardJudge).not.toHaveBeenCalled();
    expect((await budget.audit(worldId)).settledMicroUsd).toBe(audit.settledMicroUsd);
    expect(await runLocalPatchWorldSlice(c, f.deps, f.gameId, { maxHides: 1, boardJudge })).toMatchObject({ pending: false, attention: null });
    expect(f.render).toHaveBeenCalledTimes(5); expect(boardJudge).toHaveBeenCalledOnce();
    const after = await rowsOf(f.gameId);
    expect(after.map(row => [row.attempts, row.costCents])).toEqual(before.map(row => [row.attempts, row.costCents]));
    expect(after.every(row => row.status === "GENERATED" && JSON.parse(row.judgeJson!).compositionVersion === LOCAL_PATCH_COMPOSITION_VERSION)).toBe(true);
    expect(await Promise.all(BOARD.hides.map(h => budget.readRequest(worldId, `${h.id}:${h.pose}:render:1`)))).toEqual(originalBills);
    for (const index of [2, 4]) {
      const asset = await db.asset.findUniqueOrThrow({ where: { id: after[index]!.assetId! } }), mask = maskForHide(BOARD.hides[index]!);
      const pixels = await sharp(await c.storage.get(asset.storagePath)).extract({ left: mask.left + 15, top: mask.top - 65, width: 1, height: 1 }).raw().toBuffer();
      expect([...pixels.subarray(0, 3)]).toEqual([176, 96, 128]);
      expect(asset.costCents).toBe(0);
      expect((await localPatchPrivateInventory(c, f.gameId)).assetIds).toContain(before[index]!.assetId);
    }
    expect(await db.auditLog.count({ where: { action: LOCAL_PATCH_RECOMPOSE_ACTION, entityId: f.gameId } })).toBe(2);
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try { await runLocalPatchWorldSlice({ ...c, db: fresh, storage: new DbStorage(fresh) }, f.deps, f.gameId, { boardJudge }); }
    finally { await fresh.$disconnect(); }
    expect(f.render).toHaveBeenCalledTimes(5); expect(boardJudge).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled();
  }, 120000);

  it.each(["missing", "corrupt-payload", "different-operation"])("%s paid bytes hold instead of incrementing or repainting; old content and pending rows never migrate", async defect => {
    const f = await seed(`recompose-${defect}`), before = await rowsOf(f.gameId), hide = BOARD.hides[2]!;
    const key = retainedPurchaseKey(boardWizardWorldId(f.gameId), `${hide.id}:${hide.pose}:render:1`);
    if (defect === "missing") await db.fileBlob.delete({ where: { key } });
    else {
      const blob = await db.fileBlob.findUniqueOrThrow({ where: { key } }), value = JSON.parse(Buffer.from(blob.data).toString());
      if (defect === "corrupt-payload") value.bytesBase64 = Buffer.from("wrong retained image payload").toString("base64");
      else value.operationFingerprint = "different-request";
      await db.fileBlob.update({ where: { key }, data: { data: new Uint8Array(Buffer.from(JSON.stringify(value))) } });
    }
    expect(await runLocalPatchWorldSlice(c, f.deps, f.gameId, { boardJudge: review(f.gameId) })).toMatchObject({ pending: false, attention: expect.stringMatching(/retained/i) });
    expect(await db.generationJob.findUnique({ where: { id: `job_${f.gameId}` } })).toMatchObject({ currentStep: LOCAL_PATCH_NEEDS_RELEASE });
    expect((await rowsOf(f.gameId)).map(row => [row.attempts, row.costCents, row.assetId])).toEqual(before.map(row => [row.attempts, row.costCents, row.assetId]));
    expect(f.render).toHaveBeenCalledTimes(5);
    for (const version of [6, 7]) expect(localPatchNeedsRecomposition(before[2]!, version)).toBe(false);
    expect(localPatchNeedsRecomposition({ ...before[2]!, status: "PENDING" }, 8)).toBe(false);
    expect(localPatchNeedsRecomposition({ ...before[2]!, status: "FAILED", judgeJson: JSON.stringify({ renderFault: "Provider returned no usable PNG" }) }, 8)).toBe(false);
  }, 120000);

  it("a lost publication claim rolls back derived rows, image blobs and costs", async () => {
    const f = await seed("recompose-fence"), before = await rowsOf(f.gameId), count = await db.asset.count();
    await expect(recomposeLocalPatchHide(c, { gameId: f.gameId, sceneId: f.sceneId, board: BOARD, hide: BOARD.hides[2]! },
      { readBoardArt: async () => original, fence: async () => { throw new Error("lost-claim"); } })).rejects.toThrow("lost-claim");
    expect(await rowsOf(f.gameId)).toEqual(before); expect(await db.asset.count()).toBe(count);
    expect(await db.auditLog.count({ where: { action: LOCAL_PATCH_RECOMPOSE_ACTION, entityId: f.gameId } })).toBe(0);
    expect(f.render).toHaveBeenCalledTimes(5);
  }, 120000);
});
