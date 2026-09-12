import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { PrismaRetainedPurchaseStore } from "../../../infra/db/prisma-retained-purchase-store";
import { buyLocalPatch, localPatchRenderPolicySha256 } from "../../../infra/generation/openai-local-patch";
import type { Container } from "../../container";
import { deleteGame, updateGift } from "../../game.service";
import { LOCAL_PATCH_STYLE, localPatchPrivateInventory } from "../local-patch-world";
import { runLocalPatchHide, type LocalPatchHideDeps } from "../local-patch-hide";
import { LocalPatchDeleted } from "../local-patch-lifecycle";
import { boardWizardBudgetOf, boardWizardWorldId } from "../board-conditioned-wizard";
import { LOCAL_PATCH_TEST_BOARD, bill, boardPng, clearWorld, paintedCrop, paintedOk, reply, seedApprovedGame } from "./local-patch-fixtures";

const fakes = vi.hoisted(() => ({ testers: [] as string[] }));
vi.mock("../../../lib/env", () => ({
  env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "on", GENERATION_DAILY_CENTS: 0,
    GENERATION_PROVIDER: "openai", GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", OPENAI_API_KEY: "synthetic-never-live" }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: fakes.testers }),
  flag: () => false, adminEmails: () => [],
}));

const BOARD = LOCAL_PATCH_TEST_BOARD, HIDE = BOARD.hides[1]!;
const renderKey = `${HIDE.id}:${HIDE.pose}:render:1`, judgeKey = `${HIDE.id}:${HIDE.pose}:judge:1`;
let scratch: string, scratchRoot: string, db: PrismaClient, c: Container;
beforeAll(async () => {
  scratchRoot = realpathSync(tmpdir());
  scratch = realpathSync(mkdtempSync(path.join(scratchRoot, "findme-local-patch-deletion-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "delete.sqlite").split(path.sep).join("/")}` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), secret: "test-secret", appUrl: "http://localhost:3000" } as unknown as Container;
}, 180_000);
afterAll(async () => {
  await db.$disconnect();
  if (path.dirname(scratch) === scratchRoot && path.basename(scratch).startsWith("findme-local-patch-deletion-")) {
    rmSync(scratch, { recursive: true, force: true });
  }
});
beforeEach(async () => {
  fakes.testers = []; c.adminEmails = [];
  await db.shareLink.deleteMany({});
  await clearWorld(db);
});

async function seed() {
  const seeded = await seedApprovedGame(c, db, { styleVersion: LOCAL_PATCH_STYLE, status: "TARGETS_GENERATING", withJob: true });
  fakes.testers.push(seeded.email);
  return seeded;
}
function worker(overrides: Partial<LocalPatchHideDeps> = {}): LocalPatchHideDeps {
  return { renderPolicySha256: "p".repeat(64), readBoardArt: async () => boardPng(),
    render: async ({ stylePng }) => paintedOk(await paintedCrop(stylePng, HIDE), bill("req-render-delete")),
    judge: async () => reply(), ...overrides };
}
const run = (gameId: string, deps = worker()) => runLocalPatchHide(c, deps, { gameId, board: BOARD, hide: HIDE });
const remove = (gameId: string, userId: string) => deleteGame(c, gameId, { type: "USER", id: userId }, userId);

describe("local-patch deletion through the owner/admin game action", () => {
  it("purges published, retained, rejected and orphan imagery, revokes the claim and links, and retains accounting", async () => {
    const { gameId, userId } = await seed();
    await run(gameId);
    const before = await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId));
    for (const id of ["ast-orphan", "ast-rejected"]) {
      await db.asset.create({ data: { id, ownerId: userId, type: "REJECTED_PATCH", visibility: "PRIVATE",
        storagePath: `private/${id}.png`, mimeType: "image/png", provider: "local-patch", providerRequestId: gameId } });
      await c.storage.put(`private/${id}.png`, Buffer.from("synthetic rejected image"), "image/png");
    }
    await db.targetVariantAsset.updateMany({ data: { rejectedAssetIdsJson: JSON.stringify(["ast-rejected"]) } });
    await db.shareLink.create({ data: { id: "share-delete", gameId, tokenHash: "synthetic-share" } });
    await c.storage.put("private/unrelated", Buffer.from("another resource"), "text/plain");
    await db.game.update({ where: { id: gameId }, data: { configJson: "{}", title: "child title", giftJson: "{}" } });
    const inventory = await localPatchPrivateInventory(c, gameId);
    expect(inventory.assetIds).toContain("ast-orphan");
    expect(inventory.assetIds).toContain("ast-rejected");
    expect((await db.fileBlob.findMany()).filter(b => inventory.retainedPurchaseKeys.includes(b.key))).toHaveLength(2);

    expect(await remove(gameId, userId)).toBe(true);
    expect(await remove(gameId, userId)).toBe(false);
    expect(await db.game.findUnique({ where: { id: gameId } })).toMatchObject({ status: "DELETED", configJson: null, title: null, giftJson: null });
    expect(await db.generationJob.findUnique({ where: { id: `job_${gameId}` } })).toMatchObject({ status: "DONE", currentStep: null, attempts: 1 });
    expect(await db.shareLink.findUnique({ where: { id: "share-delete" } })).toMatchObject({ active: false });
    expect(await db.asset.count({ where: { status: { not: "DELETED" } } })).toBe(0);
    expect((await db.fileBlob.findMany()).map(b => b.key)).toEqual(["private/unrelated"]);
    expect(await db.targetVariantAsset.findFirst()).toMatchObject({ assetId: null, rejectedAssetIdsJson: null, judgeJson: null });
    expect(await db.targetInstance.findFirst()).toMatchObject({ spriteAssetId: null });
    expect(await db.childProfile.findFirst()).toMatchObject({ originalPhotoAssetId: null, identityAssetId: null });
    expect((await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId))).settledMicroUsd).toBe(before.settledMicroUsd);
    expect(await db.auditLog.count({ where: { action: "local_patch.deleted" } })).toBe(1);
  }, 180_000);

  it("preserves a child still used by another live game", async () => {
    const { gameId, userId } = await seed();
    await db.game.create({ data: { id: "other-game", ownerId: userId, childProfileId: `chl-${gameId}`, status: "PAID" } });
    expect(await remove(gameId, userId)).toBe(true);
    expect(await db.childProfile.findFirst()).toMatchObject({ deletedAt: null, identityAssetId: `ast-sheet-${gameId}` });
    expect(await c.storage.exists(`private/sheet-${gameId}.png`)).toBe(true);
    expect(await c.storage.exists(`private/photo-${gameId}.jpg`)).toBe(true);
    expect(await db.game.findUnique({ where: { id: "other-game" } })).toMatchObject({ status: "PAID", deletedAt: null });
  }, 180_000);

  it("preserves storage aliases while clearing the deleted child's own references", async () => {
    const { gameId, userId } = await seed();
    await db.asset.create({ data: { id: "alias-sheet", ownerId: userId, type: "IDENTITY_SHEET", storagePath: `private/sheet-${gameId}.png`, mimeType: "image/png" } });
    expect(await remove(gameId, userId)).toBe(true);
    expect(await c.storage.exists(`private/sheet-${gameId}.png`)).toBe(true);
    expect(await c.storage.exists(`private/photo-${gameId}.jpg`)).toBe(false);
    expect(await db.childProfile.findFirst()).toMatchObject({ identityAssetId: null, originalPhotoAssetId: null });
    expect(await db.asset.findUnique({ where: { id: "alias-sheet" } })).toMatchObject({ status: "READY" });
  }, 180_000);

  it("requires the owner or a configured, authenticated administrator", async () => {
    const { gameId, userId } = await seed();
    expect(await remove(gameId, "other-owner")).toBe(false);
    await expect(deleteGame(c, gameId, { type: "SYSTEM" }, userId)).rejects.toThrow(/Owner authorization/);
    await expect(deleteGame(c, gameId, { type: "ADMIN", id: userId })).rejects.toThrow(/Administrator not authorized/);
    expect(await db.game.findUnique({ where: { id: gameId } })).toMatchObject({ deletedAt: null });
    c.adminEmails = [`${gameId}@example.com`];
    expect(await deleteGame(c, gameId, { type: "ADMIN", id: userId })).toBe(true);
  }, 180_000);

  it("rolls the whole deletion back if its final durable write fails", async () => {
    const { gameId, userId } = await seed();
    const before = await db.fileBlob.count();
    await db.$executeRawUnsafe(`CREATE TRIGGER fail_local_delete BEFORE INSERT ON AuditLog WHEN NEW.action = 'local_patch.deleted'
      BEGIN SELECT RAISE(ABORT, 'injected deletion failure'); END`);
    // Prisma maps SQLite trigger aborts to a generic constraint error.
    try { await expect(remove(gameId, userId)).rejects.toThrow(); }
    finally { await db.$executeRawUnsafe("DROP TRIGGER fail_local_delete"); }
    expect(await db.fileBlob.count()).toBe(before);
    expect(await db.game.findUnique({ where: { id: gameId } })).toMatchObject({ deletedAt: null, status: "TARGETS_GENERATING" });
    expect(await db.generationJob.findUnique({ where: { id: `job_${gameId}` } })).toMatchObject({ status: "QUEUED", attempts: 0 });
    expect(await db.childProfile.findFirst()).toMatchObject({ deletedAt: null, identityAssetId: `ast-sheet-${gameId}` });
    expect(await remove(gameId, userId)).toBe(true);
  }, 180_000);

  it.each([false, true])("a late render records its bill/unknown charge without recreating imagery or buying a judge (unknown=%s)", async unknown => {
    const { gameId, userId } = await seed();
    const judge = vi.fn(async () => reply());
    const render = vi.fn(async ({ stylePng }: Parameters<LocalPatchHideDeps["render"]>[0]) => {
      const png = await paintedCrop(stylePng, HIDE);
      expect(await remove(gameId, userId)).toBe(true);
      return unknown ? { png, rejected: null, quarantined: null, evidence: null, unknownReason: "usage missing" }
        : paintedOk(png, bill("req-late-render"));
    });
    await expect(run(gameId, worker({ render, judge }))).rejects.toBeInstanceOf(LocalPatchDeleted);
    expect(render).toHaveBeenCalledTimes(1); expect(judge).not.toHaveBeenCalled();
    const budget = boardWizardBudgetOf(c), world = boardWizardWorldId(gameId);
    expect(await budget.readRequest(world, renderKey)).toMatchObject({ state: unknown ? "unknown" : "settled" });
    expect(await budget.readRequest(world, judgeKey)).toBeNull();
    expect((await budget.audit(world)).held).toBe(unknown);
    expect(await db.fileBlob.count()).toBe(0);
    expect(await db.asset.count({ where: { provider: "local-patch" } })).toBe(0);
    await expect(run(gameId, worker({ render, judge }))).rejects.toThrow(/owned, live game/);
    expect(render).toHaveBeenCalledTimes(1);
  }, 180_000);

  it("a late judge records its bill but cannot restore the purged render or publish an asset", async () => {
    const { gameId, userId } = await seed();
    const judge = vi.fn(async () => { expect(await remove(gameId, userId)).toBe(true); return reply(); });
    await expect(run(gameId, worker({ judge }))).rejects.toBeInstanceOf(LocalPatchDeleted);
    expect(judge).toHaveBeenCalledTimes(1);
    const budget = boardWizardBudgetOf(c), world = boardWizardWorldId(gameId);
    expect(await budget.readRequest(world, renderKey)).toMatchObject({ state: "settled" });
    expect(await budget.readRequest(world, judgeKey)).toMatchObject({ state: "settled" });
    expect(await db.fileBlob.count()).toBe(0);
    expect(await db.asset.count({ where: { provider: "local-patch" } })).toBe(0);
  }, 180_000);

  it("still finds retained replies after their scene row was removed", async () => {
    const { gameId, userId } = await seed();
    await run(gameId);
    await db.targetVariantAsset.deleteMany({});
    await db.targetInstance.deleteMany({});
    await db.gameScene.deleteMany({});
    expect(await remove(gameId, userId)).toBe(true);
    expect(await db.fileBlob.count()).toBe(0);
    expect(await db.worldBudgetLedger.count()).toBe(1);
  }, 180_000);

  it("refuses a corrupted pointer to another resource without widening the purge", async () => {
    const { gameId, userId } = await seed();
    await run(gameId);
    await db.asset.create({ data: { id: "unrelated-sheet", ownerId: userId, type: "IDENTITY_SHEET", visibility: "PRIVATE",
      storagePath: "private/unrelated-sheet.png", mimeType: "image/png" } });
    await c.storage.put("private/unrelated-sheet.png", Buffer.from("unrelated"), "image/png");
    await db.targetVariantAsset.updateMany({ data: { rejectedAssetIdsJson: JSON.stringify(["unrelated-sheet"]) } });
    const before = await db.fileBlob.count();
    await expect(remove(gameId, userId)).rejects.toThrow(/ownership or purpose/);
    expect(await db.fileBlob.count()).toBe(before);
    expect(await db.game.findUnique({ where: { id: gameId } })).toMatchObject({ deletedAt: null });
  }, 180_000);

  it("does not restore a gift from a snapshot read before deletion", async () => {
    const { gameId, userId } = await seed();
    const read = db.game.findFirst.bind(db.game);
    const afterSnapshot = (async (args: Parameters<typeof db.game.findFirst>[0]) => {
      const game = await read(args);
      expect(await remove(gameId, userId)).toBe(true);
      return game;
    }) as unknown as typeof db.game.findFirst;
    const intercepted = vi.spyOn(db.game, "findFirst").mockImplementationOnce(afterSnapshot);
    try { expect(await updateGift(c, gameId, userId, { message: "late gift" })).toBe(false); }
    finally { intercepted.mockRestore(); }
    expect(await db.game.findUnique({ where: { id: gameId } })).toMatchObject({ status: "DELETED", giftJson: null, configJson: null });
  }, 180_000);
});

describe("combined image and billing failures on the real durable purchase path", () => {
  it.each(["medium", "high"])("retains %s quality with the right quarantine verdict and no replay dispatch", async quality => {
    const { gameId, userId } = await seed();
    const png = await sharp({ create: { width: 768, height: 1152, channels: 4, background: "#8090a0" } }).png().toBuffer();
    const fetchOnce = vi.fn(async () => new Response(JSON.stringify({ model: "gpt-image-2", quality,
      usage: { input_tokens: 1 }, data: [{ b64_json: png.toString("base64") }],
    }), { status: 200, headers: { "x-request-id": "req-combined-quality" } }));
    const judge = vi.fn(async () => reply());
    const deps = worker({ renderPolicySha256: localPatchRenderPolicySha256(), judge,
      render: input => buyLocalPatch("synthetic-never-live", input, { fetchOnce: fetchOnce as unknown as typeof fetch }) });
    expect((await run(gameId, deps)).state).toBe("stopped");
    const world = boardWizardWorldId(gameId), budget = boardWizardBudgetOf(c);
    const kept = await new PrismaRetainedPurchaseStore(db).get(world, renderKey);
    expect(kept?.evidence).toBeNull(); expect(kept?.unknownReason).toBeTruthy();
    const envelope = JSON.parse(kept!.bytes.toString());
    expect(Buffer.from(envelope.bytesBase64, "base64").equals(png)).toBe(true);
    if (quality === "medium") expect(envelope.rejected).toBeNull();
    else expect(envelope.rejected).toBeTruthy();
    expect((await budget.audit(world)).held).toBe(true);
    expect((await run(gameId, deps)).state).toBe("stopped");
    expect(fetchOnce).toHaveBeenCalledTimes(1); expect(judge).not.toHaveBeenCalled();
    expect(await budget.readRequest(world, renderKey)).toMatchObject({ state: "unknown" });
    expect(await budget.readRequest(world, judgeKey)).toBeNull();
    expect(await remove(gameId, userId)).toBe(true);
    expect(await new PrismaRetainedPurchaseStore(db).get(world, renderKey)).toBeNull();
    expect(await db.fileBlob.count()).toBe(0);
  }, 180_000);
});
