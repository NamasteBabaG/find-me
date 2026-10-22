import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "@/lib/test-schema";
import { DbStorage } from "@/infra/storage/db";
import type { Container } from "@/services/container";
import { recutAvatar } from "@/services/admin.service";
import { deleteGame } from "@/services/game.service";
import { readAsset, signedAssetUrl } from "@/services/asset.service";
import { boardWizardBudgetOf } from "@/services/generation/board-conditioned-wizard";

const state = vi.hoisted(() => ({ granted: false }));
vi.mock("@/lib/env", () => ({
  env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: "off", GENERATION_DAILY_CENTS: 0 }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: false, testers: [] }),
  flag: () => false, adminEmails: () => [],
}));
// Only the established authority reader is stubbed. Real budget/Prisma and display code run below.
vi.mock("@/services/generation/lean-capacity-recovery", async original => ({
  ...await original<Record<string, unknown>>(),
  readLeanCapacityRecoveryBudget: async (_c: unknown, worldId: string) => state.granted
    ? { worldId, capMicroUsd: 12_000_000, authorizationSha256: "a".repeat(64) } : null,
}));

let evidence: string;
let db: PrismaClient, c: Container, sequence = 0;
beforeAll(async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Network forbidden in read-only audit"); }));
  evidence = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-avatar-lineage-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${evidence}/boundary.audit.sqlite` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), secret: "synthetic-audit-secret", appUrl: "http://localhost.invalid",
    analytics: { track: vi.fn() }, adminEmails: [], databaseUrl: `file:${evidence}/boundary.audit.sqlite` } as unknown as Container;
});
afterEach(() => { vi.restoreAllMocks(); state.granted = false; });
afterAll(async () => {
  await db.$disconnect(); vi.unstubAllGlobals();
  if (path.dirname(evidence) === realpathSync(tmpdir()) && path.basename(evidence).startsWith("findme-avatar-lineage-")) rmSync(evidence, { recursive: true, force: true });
});

async function fixture() {
  const gameId = `audit-recut-${++sequence}`, ownerId = `owner-${gameId}`, childId = `child-${gameId}`;
  const sheetId = `sheet-${gameId}`, avatarId = `avatar-${gameId}`;
  const png = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#276d8c" } }).png().toBuffer();
  await db.user.create({ data: { id: ownerId, email: `${gameId}@example.invalid` } });
  for (const [id, visibility, type] of [[sheetId, "PRIVATE", "IDENTITY_SHEET"], [avatarId, "GAME", "AVATAR"]] as const) {
    const storagePath = `${visibility.toLowerCase()}/${id}.png`;
    await c.storage.put(storagePath, png, "image/png");
    await db.asset.create({ data: { id, ownerId, type, visibility, status: "READY", storagePath,
      mimeType: "image/png", width: 1024, height: 1024, bytes: png.length, provider: "upload" } });
  }
  await db.childProfile.create({ data: { id: childId, ownerId, displayName: "Synthetic Child", ageYears: 6,
    identityAssetId: sheetId, avatarAssetId: avatarId } });
  await db.game.create({ data: { id: gameId, ownerId, childProfileId: childId, styleVersion: "local-patch-world-v1", status: "DELIVERED",
    configJson: JSON.stringify({ child: { avatarUrl: `/api/assets/${avatarId}` }, scenes: [] }) } });
  return { gameId, ownerId, childId, avatarId };
}

describe("display repair child lineage across final-consumer engines", () => {
  async function mixed(status: "DELIVERED" | "PAID" = "DELIVERED") {
    const f = await fixture(), sibling = `${f.gameId}-legacy-sibling`;
    await db.game.create({ data: { id: sibling, ownerId: f.ownerId, childProfileId: f.childId,
      styleVersion: "collage-v1", packageTier: "ONE_WORLD", status } });
    if (status === "PAID") await boardWizardBudgetOf(c).importSettled(`${sibling}:board-wizard`, {
      scope: "identity", operationFingerprint: "synthetic-historical-identity",
      evidence: { providerNamespace: "synthetic", providerRequestId: `req_${sibling}`, usageId: "synthetic-usage",
        rawUsage: { total_tokens: 1 }, model: "synthetic", amountMicroUsd: 1, costBasis: "conservative-upper-estimate" },
    });
    const cleanup = vi.spyOn(c.storage, "delete").mockRejectedValueOnce(Error("Synthetic cleanup interruption"));
    await expect(recutAvatar(c, f.gameId, { type: "ADMIN", id: "synthetic-admin" })).rejects.toThrow("Synthetic cleanup");
    cleanup.mockRestore();
    const repaired = (await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } })).avatarAssetId!;
    return { ...f, sibling, repaired };
  }

  it.each(["DELIVERED", "PAID"] as const)("the %s legacy final consumer purges both recut avatars and retains lineage/accounting", async status => {
    const f = await mixed(status), ids = [f.avatarId, f.repaired];
    const urls = ids.map(id => new URL(signedAssetUrl(c, id), "http://localhost.invalid"));
    const lineageBefore = await db.auditLog.findMany({ where: { action: "avatar:display-repair-assets/v1", entityId: f.childId } });
    expect(await deleteGame(c, f.gameId, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    expect((await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } })).deletedAt).toBeNull();
    expect(await deleteGame(c, f.sibling, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    for (const [index, id] of ids.entries()) {
      const asset = await db.asset.findUniqueOrThrow({ where: { id } });
      expect(asset.status).toBe("DELETED"); expect(await c.storage.exists(asset.storagePath)).toBe(false);
      expect(await readAsset(c, id, { userId: null, isAdmin: false,
        signature: urls[index]!.searchParams.get("s"), expires: urls[index]!.searchParams.get("e") })).toEqual({ error: 404 });
    }
    expect(await db.auditLog.findMany({ where: { action: "avatar:display-repair-assets/v1", entityId: f.childId } })).toEqual(lineageBefore);
    if (status === "PAID") {
      expect(await db.auditLog.count({ where: { action: "game:deleted-qa-identity", entityId: f.sibling } })).toBe(1);
      expect(await boardWizardBudgetOf(c).audit(`${f.sibling}:board-wizard`)).toMatchObject({ settledMicroUsd: 1 });
    }
  });

  it("a final legacy deletion winning during another recut prevents a late derivative from restoring imagery", async () => {
    const f = await mixed();
    expect(await deleteGame(c, f.gameId, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    const original = db.$transaction.bind(db);
    const racing = vi.spyOn(db, "$transaction").mockImplementationOnce((async (work: never, options: never) => {
      racing.mockRestore();
      expect(await deleteGame(c, f.sibling, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
      return original(work, options);
    }) as typeof db.$transaction);
    await expect(recutAvatar(c, f.sibling, { type: "ADMIN", id: "synthetic-admin" })).rejects.toThrow();
    expect(await db.asset.count({ where: { ownerId: f.ownerId, status: "READY" } })).toBe(0);
    expect((await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } })).deletedAt).not.toBeNull();
  });

  it.each(["DELIVERED", "PAID"] as const)("%s legacy cleanup refuses a foreign lineage avatar before changing either child's imagery", async status => {
    const f = await mixed(status), foreign = await fixture();
    expect(await deleteGame(c, f.gameId, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    const record = await db.auditLog.findFirstOrThrow({ where: { action: "avatar:display-repair-assets/v1", entityId: f.childId } });
    const value = JSON.parse(record.metaJson!);
    await db.auditLog.update({ where: { id: record.id }, data: { metaJson: JSON.stringify({ ...value, previousAvatarId: foreign.avatarId }) } });
    const before = await db.asset.findMany({ where: { ownerId: { in: [f.ownerId, foreign.ownerId] } }, orderBy: { id: "asc" } });
    await expect(deleteGame(c, f.sibling, { type: "USER", id: f.ownerId }, f.ownerId)).rejects.toThrow("Invalid display repair inventory");
    expect((await db.game.findUniqueOrThrow({ where: { id: f.sibling } })).deletedAt).toBeNull();
    expect(await db.asset.findMany({ where: { ownerId: { in: [f.ownerId, foreign.ownerId] } }, orderBy: { id: "asc" } })).toEqual(before);
  });

  it.each(["alias", "child", "target"] as const)("a legacy final consumer preserves an avatar with a separate live %s consumer", async consumer => {
    const f = await mixed(), old = await db.asset.findUniqueOrThrow({ where: { id: f.avatarId } });
    if (consumer === "alias") await db.asset.create({ data: { id: `alias-${f.avatarId}`, ownerId: f.ownerId,
      type: "AVATAR", visibility: "GAME", storagePath: old.storagePath, mimeType: "image/png" } });
    if (consumer === "child") await db.childProfile.create({ data: { id: `other-${f.childId}`, ownerId: f.ownerId,
      displayName: "Other Synthetic Child", avatarAssetId: f.avatarId } });
    if (consumer === "target") {
      const gameId = `other-${f.gameId}`, sceneId = `scene-${gameId}`;
      await db.game.create({ data: { id: gameId, ownerId: f.ownerId, styleVersion: "collage-v1", status: "DELIVERED" } });
      await db.gameScene.create({ data: { id: sceneId, gameId, sceneSlug: "synthetic", sceneVersion: 1, orderIndex: 0 } });
      await db.targetInstance.create({ data: { id: `target-${gameId}`, gameSceneId: sceneId, targetId: "synthetic",
        targetType: "child", slotAId: "a", slotBId: "b", spriteAssetId: f.avatarId } });
    }
    expect(await deleteGame(c, f.gameId, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    expect(await deleteGame(c, f.sibling, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    expect(await db.asset.findUniqueOrThrow({ where: { id: f.avatarId } })).toMatchObject({ status: "READY" });
    expect(await c.storage.exists(old.storagePath)).toBe(true);
    expect(await db.asset.findUniqueOrThrow({ where: { id: f.repaired } })).toMatchObject({ status: "DELETED" });
  });
  it("a prepared full-face recut winning after the legacy read cannot leave partial deletion behind", async () => {
    const f = await mixed();
    const originalTransaction = db.$transaction.bind(db);
    let continueRecut!: () => void, recutWaiting!: () => void;
    const waiting = new Promise<void>(resolve => { recutWaiting = resolve; });
    const continueAfterDeletionOfLocalPatch = new Promise<void>(resolve => { continueRecut = resolve; });
    const pause = vi.spyOn(db, "$transaction").mockImplementationOnce((async (work: never, options: never) => {
      pause.mockRestore(); recutWaiting(); await continueAfterDeletionOfLocalPatch;
      return originalTransaction(work, options);
    }) as typeof db.$transaction);
    // Its still-live local-patch sibling selects fullFace before the pause.
    const recut = recutAvatar(c, f.sibling, { type: "ADMIN", id: "synthetic-admin" });
    await waiting;
    expect(await deleteGame(c, f.gameId, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    const originalRead = db.game.findFirst.bind(db.game);
    const staleRead = vi.spyOn(db.game, "findFirst").mockImplementationOnce((async (query: never) => {
      const beforeRecut = await originalRead(query);
      staleRead.mockRestore(); continueRecut(); await recut;
      return beforeRecut;
    }) as typeof db.game.findFirst);
    expect(await deleteGame(c, f.sibling, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    expect((await db.game.findUniqueOrThrow({ where: { id: f.sibling } })).deletedAt).not.toBeNull();
    expect((await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } })).avatarAssetId).toBeNull();
    expect(await db.asset.count({ where: { ownerId: f.ownerId, status: "READY" } })).toBe(0);
  });
  it.each(["DELIVERED", "PAID"] as const)("%s cleanup cannot bypass protection of the current recut avatar used by another live target", async status => {
    const f = await mixed(status), otherGame = `target-consumer-${f.gameId}`, sceneId = `scene-${otherGame}`;
    await db.game.create({ data: { id: otherGame, ownerId: f.ownerId, styleVersion: "collage-v1", status: "DELIVERED" } });
    await db.gameScene.create({ data: { id: sceneId, gameId: otherGame, sceneSlug: "synthetic", sceneVersion: 1, orderIndex: 0 } });
    await db.targetInstance.create({ data: { id: `target-${otherGame}`, gameSceneId: sceneId, targetId: "synthetic",
      targetType: "child", slotAId: "a", slotBId: "b", spriteAssetId: f.repaired } });
    expect(await deleteGame(c, f.gameId, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    expect(await deleteGame(c, f.sibling, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    const retained = await db.asset.findUniqueOrThrow({ where: { id: f.repaired } });
    expect(retained.status).toBe("READY"); expect(await c.storage.exists(retained.storagePath)).toBe(true);
    expect(await db.asset.findUniqueOrThrow({ where: { id: f.avatarId } })).toMatchObject({ status: "DELETED" });
    expect((await db.game.findUniqueOrThrow({ where: { id: otherGame } })).deletedAt).toBeNull();
  });
  it.each(["system", "foreign-user", "missing-user", "unverified-admin"] as const)("the new mixed route refuses %s authority before cleanup", async kind => {
    const f = await mixed();
    expect(await deleteGame(c, f.gameId, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    const before = await db.asset.findMany({ where: { ownerId: f.ownerId }, orderBy: { id: "asc" } });
    const actor = kind === "system" ? { type: "SYSTEM" as const }
      : kind === "unverified-admin" ? { type: "ADMIN" as const, id: f.ownerId }
      : { type: "USER" as const, id: kind === "foreign-user" ? "another-user" : f.ownerId };
    await expect(deleteGame(c, f.sibling, actor, kind === "missing-user" ? undefined : f.ownerId))
      .rejects.toThrow(/Owner authorization required|Administrator not authorized/);
    expect((await db.game.findUniqueOrThrow({ where: { id: f.sibling } })).deletedAt).toBeNull();
    expect(await db.asset.findMany({ where: { ownerId: f.ownerId }, orderBy: { id: "asc" } })).toEqual(before);
  });

  it("final mixed deletion revokes a running job's numeric claim in the same commit", async () => {
    const f = await mixed();
    await db.generationJob.create({ data: { id: `job_${f.sibling}`, gameId: f.sibling, status: "RUNNING", attempts: 7,
      currentStep: "avatar", stepsJson: '{"synthetic":true}' } });
    expect(await deleteGame(c, f.gameId, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    expect(await deleteGame(c, f.sibling, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.sibling}` } }))
      .toMatchObject({ status: "DONE", attempts: 8, currentStep: null, stepsJson: "{}", lastError: null });
  });
});
