import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { GameConfigSchema } from "../../../domain/game/config";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";
import { sha256Bytes } from "../fixed-sprite";
import { LOCAL_PATCH_COMPOSITION_VERSION } from "../local-patch-seam";
import { localPatchPublicationGeometryHash } from "../local-patch-publication-policy";
import { publishLocalPatchPartialGame, readLocalPatchPartialRelease, LOCAL_PATCH_PARTIAL_RELEASE_ACTION } from "../local-patch-partial-release";
import { composeLocalPatchGame } from "../local-patch-player";
import { seedApprovedGame } from "./local-patch-fixtures";

vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "off" }), flag: () => false,
  spendGuard: () => ({ appEnv: "qa", realGeneration: false, testers: [] }), adminEmails: () => ["partial-admin@example.invalid"] }));
const BOARDS = localPatchBoardsForVersion(9), OMITTED = ["sydney-v7-5", "greatwall-v7-5"];
let dir: string, url: string, db: PrismaClient, c: Container, png: Buffer;
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-partial-release-")));
  url = `file:${path.join(dir, "release.sqlite").split(path.sep).join("/")}`;
  db = new PrismaClient({ datasources: { db: { url } } }); await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-partial-release",
    adminEmails: ["partial-admin@example.invalid"], analytics: { track() {} }, emailFallbackTo: null,
    email: { id: "console", send: vi.fn(async () => { throw new Error("No mail during finalization"); }) } } as unknown as Container;
  await db.user.create({ data: { id: "partial-admin", email: "partial-admin@example.invalid" } });
  png = await sharp({ create: { width: 512, height: 768, channels: 4, background: "#a3a285" } }).png().toBuffer();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No provider during partial release"); }));
}, 180000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(dir) === realpathSync(tmpdir()) && path.basename(dir).startsWith("findme-partial-release-")) rmSync(dir, { recursive: true, force: true });
});
const input = (gameId: string) => ({ gameId, operatorId: "partial-admin", reason: "Parent explicitly authorizes retained43 with two failed images omitted and4stars on those boards", omittedHideIds: OMITTED });
const rows = (gameId: string) => db.targetVariantAsset.findMany({ where: { targetInstance: { gameScene: { gameId } } }, orderBy: { id: "asc" } });
async function seed(gameId: string) {
  const s = await seedApprovedGame(c, db, { gameId, approved: false, styleVersion: "local-patch-world-v1", status: "GENERATION_FAILED",
    withJob: true, scenes: BOARDS.map(b => ({ slug: b.board, version: 9 })) });
  await c.storage.put(`private/photo-${gameId}.jpg`, s.sheet, "image/png");
  const avatarId = `avatar-${gameId}`;
  await c.storage.put(`game/${avatarId}.png`, png, "image/png");
  await db.asset.create({ data: { id: avatarId, ownerId: s.userId, type: "AVATAR", visibility: "GAME", storagePath: `game/${avatarId}.png`, mimeType: "image/png", width: 512, height: 768, bytes: png.length } });
  await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { ageYears: 5, avatarAssetId: avatarId } });
  const catalog = await readBoardConditionedCatalog(), budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(gameId);
  await reviewBoardWizardIdentity({ db, apiKey: "synthetic", budget, beforeDispatch: async () => {}, write: work => db.$transaction(work),
    reviewer: { review: async () => ({ httpOk: true, requestId: `req-${gameId}-identity`, body: { model: "gpt-5.6-luna",
      usage: { prompt_tokens: 1500, completion_tokens: 150 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
        checks: { identity: "pass", age: "pass", paintedStyle: "pass", sheetLayout: "pass" }, reason: "Synthetic approved canonical face" }) } }] } }) } },
  { gameId, identityAssetId: `ast-sheet-${gameId}`, sheet: s.sheet, photo: s.sheet, atlas: s.sheet, contentVersion: 9,
    provenance: { promptVersion: "character-v4-board-drawn-face-reference", quality: "medium", photoAssetId: `ast-photo-${gameId}`,
      photoSha256: sha256Bytes(s.sheet), ageYears: 5, crop: null,
      style: { version: "board-matched-identity/v2", catalogSha256: catalog.sha256, atlasSha256: sha256Bytes(s.sheet) } } });
  await db.game.update({ where: { id: gameId }, data: { paidAt: new Date() } });
  await db.order.create({ data: { id: `ord-${gameId}`, gameId, userId: s.userId, packageTier: "ONE_WORLD", provider: "mock", amountAgorot: 100, paymentStatus: "PAID", paidAt: new Date() } });
  await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "DONE", currentStep: "local-patch:quality-failed", attempts: 90 } });
  for (const board of BOARDS) for (const hide of board.hides) {
    const targetId = `${gameId}-${hide.id}`, variantId = `var-${targetId}`, failed = OMITTED.includes(hide.id);
    await db.targetInstance.create({ data: { id: targetId, gameSceneId: `gsc-${gameId}-${board.board}`, targetId: hide.targetId,
      targetType: "child", spriteKind: "image", slotAId: "a", slotBId: "b", status: failed ? "FAILED" : "GENERATED" } });
    if (failed) {
      await db.targetVariantAsset.create({ data: { id: variantId, targetInstanceId: targetId, variant: "A", slotId: "a", provider: "local-patch",
        status: "FAILED", attempts: 4, lastError: "quality-seam: displaced join", rejectedAssetIdsJson: "[]" } });
      continue;
    }
    const assetId = `ast-${targetId}`, storagePath = `game/${assetId}.png`;
    await c.storage.put(storagePath, png, "image/png");
    await db.asset.create({ data: { id: assetId, ownerId: s.userId, type: "TARGET_SPRITE", visibility: "GAME", status: "READY", storagePath,
      mimeType: "image/png", width: 512, height: 768, bytes: png.length, provider: "local-patch", providerRequestId: gameId } });
    const geometry = { rectJson: JSON.stringify({ x: .2, y: .2, w: .2, h: .3 }), hitRectJson: JSON.stringify({ x: .25, y: .25, w: .1, h: .2 }), headAnchorJson: JSON.stringify({ x: .3, y: .25 }) };
    await db.targetVariantAsset.create({ data: { id: variantId, targetInstanceId: targetId, variant: "A", slotId: "a", provider: "local-patch",
      status: "GENERATED", attempts: 1, assetId, ...geometry, judgeJson: JSON.stringify({ hide: hide.id, pose: hide.pose,
        judgedSha256: sha256Bytes(png), geometrySha256: localPatchPublicationGeometryHash(geometry), compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION,
        reviewState: "pending-board-review", renderFault: null, wireFault: null, verdict: null }) } });
  }
  return { ...s, budget, worldId };
}

describe("explicit QA partial release preserves inventory, evidence and accounting", () => {
  it("ships43 real patches, leaves45 rows and every bill/verdict unchanged, and replays through a fresh client", async () => {
    const gameId = "partial-success", s = await seed(gameId);
    // Production shape: Sydney's fourth rejected attempt still names an older
    // second-attempt image. A pointer's existence is not current approval.
    const historicalId = `ast-omitted-history-${gameId}`, historicalPath = `game/${historicalId}.png`;
    await c.storage.put(historicalPath, png, "image/png");
    await db.asset.create({ data: { id: historicalId, ownerId: s.userId, type: "TARGET_SPRITE", visibility: "GAME", status: "READY",
      storagePath: historicalPath, mimeType: "image/png", width: 512, height: 768, bytes: png.length, provider: "local-patch", providerRequestId: gameId } });
    await db.targetVariantAsset.update({ where: { id: `var-${gameId}-sydney-v7-5` }, data: { assetId: historicalId,
      rectJson: JSON.stringify({ x: .2, y: .2, w: .1, h: .2 }), hitRectJson: JSON.stringify({ x: .2, y: .2, w: .1, h: .2 }),
      headAnchorJson: JSON.stringify({ x: .25, y: .2 }), rejectedAssetIdsJson: JSON.stringify([historicalId]),
      judgeJson: JSON.stringify({ compositionPermission: "refused", renderFault: "quality-seam: shifted border", verdict: null }) } });
    const before = await rows(gameId), historicalAsset = await db.asset.findUniqueOrThrow({ where: { id: historicalId } });
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: s.worldId } });
    await expect(composeLocalPatchGame(c, gameId)).rejects.toThrow();
    expect(await publishLocalPatchPartialGame(c, input(gameId))).toMatchObject({ targets: 43 });
    const game = await db.game.findUniqueOrThrow({ where: { id: gameId } }), config = GameConfigSchema.parse(JSON.parse(game.configJson!));
    expect(game.status).toBe("READY"); expect(config.scenes.map(sc => sc.targets.length).sort()).toEqual([4, 4, 5, 5, 5, 5, 5, 5, 5]);
    expect(config.scenes.reduce((n, sc) => n + sc.targets.length, 0)).toBe(43);
    expect(game.configJson).not.toContain(historicalId);
    expect(await db.asset.findUniqueOrThrow({ where: { id: historicalId } })).toEqual(historicalAsset);
    expect((await c.storage.get(historicalPath)).equals(png)).toBe(true);
    expect(config.scenes.every(sc => sc.findsRequiredToAdvance === 3 && sc.appearancesPerBoard === sc.targets.length)).toBe(true);
    expect(config.scenes.filter(sc => sc.targets.length === 4).every(sc => sc.celebration.completeText.includes("4"))).toBe(true);
    expect(await rows(gameId)).toEqual(before);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: s.worldId } })).toEqual(ledger);
    expect(await db.auditLog.count({ where: { action: "local-patch:published-by-policy", entityId: gameId } })).toBe(0);
    expect((await readLocalPatchPartialRelease(c, gameId))?.machineApprovalInvented).toBe(false);
    expect((await db.childProfile.findUniqueOrThrow({ where: { id: `chl-${gameId}` } })).originalPhotoAssetId).toBeNull();
    const fresh = new PrismaClient({ datasources: { db: { url } } });
    try { expect(await publishLocalPatchPartialGame({ ...c, db: fresh, storage: new DbStorage(fresh) }, input(gameId))).toMatchObject({ targets: 43 }); }
    finally { await fresh.$disconnect(); }
    expect(await db.auditLog.count({ where: { action: LOCAL_PATCH_PARTIAL_RELEASE_ACTION, entityId: gameId } })).toBe(1);
    expect(await db.shareLink.count({ where: { gameId } })).toBe(1); expect(fetch).not.toHaveBeenCalled();
    await db.game.update({ where: { id: gameId }, data: { configJson: game.configJson!.replace('"appearancesPerBoard":4', '"appearancesPerBoard":5') } });
    await expect(publishLocalPatchPartialGame(c, input(gameId))).rejects.toThrow("published config");
    await db.game.update({ where: { id: gameId }, data: { configJson: game.configJson } });
    await db.fileBlob.update({ where: { key: historicalPath }, data: { data: new Uint8Array(Buffer.from("changed omitted historical pixels")) } });
    await expect(readLocalPatchPartialRelease(c, gameId)).rejects.toThrow("inventory");
    await db.fileBlob.update({ where: { key: historicalPath }, data: { data: new Uint8Array(png) } });
  }, 120000);

  it.each(["operator", "owner", "refund", "worker", "unknown-budget", "include-failure", "omit-good"])("refuses %s without creating authority or publication", async failure => {
    const gameId = `partial-${failure}`, s = await seed(gameId), request = input(gameId);
    if (failure === "operator") request.operatorId = s.userId;
    if (failure === "owner") await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { ownerId: "partial-admin" } });
    if (failure === "refund") await db.order.update({ where: { id: `ord-${gameId}` }, data: { paymentStatus: "REFUNDED" } });
    if (failure === "worker") await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "RUNNING" } });
    if (failure === "unknown-budget") { await s.budget.reserve(s.worldId, { requestKey: "unresolved", scope: "image", operationFingerprint: "a".repeat(64), reserveMicroUsd: 120000 }); await s.budget.markUnknown(s.worldId, "unresolved", "Synthetic lost paid reply"); }
    if (failure === "include-failure") request.omittedHideIds = [OMITTED[0]!];
    if (failure === "omit-good") request.omittedHideIds = [...OMITTED, "tokyo-v7-1"];
    await expect(publishLocalPatchPartialGame(c, request)).rejects.toThrow();
    expect(await db.auditLog.count({ where: { action: LOCAL_PATCH_PARTIAL_RELEASE_ACTION, entityId: gameId } })).toBe(0);
    expect((await db.game.findUniqueOrThrow({ where: { id: gameId } })).configJson).toBeNull();
  }, 120000);

  it("retains committed authority across a lost acknowledgement, but refuses changed pixels instead of minting a new binding", async () => {
    const gameId = "partial-lost-ack"; await seed(gameId);
    // A real committed authorization is followed by a failing next read, the
    // caller has no acknowledgement and retries through the same public API.
    const interruptedDb = new Proxy(db, { get(target, property, receiver) {
      if (property !== "game") return Reflect.get(target, property, receiver);
      return new Proxy(target.game, { get(delegate, key, rec) {
        if (key !== "findUniqueOrThrow") return Reflect.get(delegate, key, rec);
        return (args: Parameters<typeof db.game.findUniqueOrThrow>[0]) => {
          if (args?.select?.configJson) throw new Error("Synthetic post-commit acknowledgement lost");
          return db.game.findUniqueOrThrow(args);
        };
      } });
    } });
    await expect(publishLocalPatchPartialGame({ ...c, db: interruptedDb }, input(gameId))).rejects.toThrow("acknowledgement lost");
    expect(await db.auditLog.count({ where: { action: LOCAL_PATCH_PARTIAL_RELEASE_ACTION, entityId: gameId } })).toBe(1);
    const kept = (await rows(gameId)).find(row => row.assetId)!;
    const asset = await db.asset.findUniqueOrThrow({ where: { id: kept.assetId! } });
    await db.fileBlob.update({ where: { key: asset.storagePath }, data: { data: new Uint8Array(Buffer.from("changed paid pixels")) } });
    await expect(publishLocalPatchPartialGame(c, input(gameId))).rejects.toThrow(/pixels|render|inventory/);
    expect((await db.game.findUniqueOrThrow({ where: { id: gameId } })).configJson).toBeNull();
    await db.fileBlob.update({ where: { key: asset.storagePath }, data: { data: new Uint8Array(png) } });
    await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { ageYears: 8 } });
    await expect(publishLocalPatchPartialGame(c, input(gameId))).rejects.toThrow("authorized images, identity");
    await db.childProfile.update({ where: { id: `chl-${gameId}` }, data: { ageYears: 5 } });
    expect(await publishLocalPatchPartialGame(c, input(gameId))).toMatchObject({ targets: 43 });
  }, 120000);

  it("cannot publish over a worker taking over after composition", async () => {
    const gameId = "partial-stale-finalizer"; await seed(gameId);
    let transactions = 0;
    const racing = new Proxy(db, { get(target, property, receiver) {
      if (property !== "$transaction") return Reflect.get(target, property, receiver);
      return async (work: Parameters<Container["db"]["$transaction"]>[0], options: Parameters<Container["db"]["$transaction"]>[1]) => {
        if (++transactions === 2) await db.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "RUNNING", attempts: 91, currentStep: "replacement" } });
        return db.$transaction(work, options);
      };
    } });
    await expect(publishLocalPatchPartialGame({ ...c, db: racing }, input(gameId))).rejects.toThrow("worker fence");
    expect((await db.game.findUniqueOrThrow({ where: { id: gameId } })).configJson).toBeNull();
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } })).toMatchObject({ status: "RUNNING", attempts: 91, currentStep: "replacement" });
    expect(await rows(gameId)).toHaveLength(45);
  }, 120000);
});
