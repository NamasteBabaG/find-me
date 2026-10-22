import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "@/lib/test-schema";
import { DbStorage } from "@/infra/storage/db";
import type { Container } from "@/services/container";
import { recutAvatar, localPatchCostForDisplay, generationCostForDisplay } from "@/services/admin.service";
import { deleteGame } from "@/services/game.service";
import { readAsset, signedAssetUrl } from "@/services/asset.service";
import { boardWizardBudgetOf } from "@/services/generation/board-conditioned-wizard";

const state = vi.hoisted(() => ({ granted: false, lean: false }));
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

vi.mock("@/services/generation/lean-release", async original => ({
  ...await original<Record<string, unknown>>(),
  readLeanWorldBudget: async (_c: unknown, worldId: string) => state.lean
    ? { worldId, capMicroUsd: 4_000_000, authorizationSha256: "b".repeat(64) } : null,
}));

let evidence: string;
let db: PrismaClient, c: Container, sequence = 0;
beforeAll(async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Network forbidden in read-only audit"); }));
  evidence = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-avatar-boundary-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${evidence}/boundary.audit.sqlite` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), secret: "synthetic-audit-secret", appUrl: "http://localhost.invalid",
    analytics: { track: vi.fn() }, adminEmails: [], databaseUrl: `file:${evidence}/boundary.audit.sqlite` } as unknown as Container;
});
afterEach(() => { vi.restoreAllMocks(); state.granted = false; state.lean = false; });
afterAll(async () => {
  await db.$disconnect(); vi.unstubAllGlobals();
  if (path.dirname(evidence) === realpathSync(tmpdir()) && path.basename(evidence).startsWith("findme-avatar-boundary-")) rmSync(evidence, { recursive: true, force: true });
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

describe("avatar repair deletion and effective budget regressions", () => {
  it("owner deletion purges the previous avatar even when its postcommit cleanup failed", async () => {
    const f = await fixture(), old = await db.asset.findUniqueOrThrow({ where: { id: f.avatarId } });
    const priorUrl = new URL(signedAssetUrl(c, f.avatarId), "http://localhost.invalid");
    const drop = vi.spyOn(c.storage, "delete").mockRejectedValueOnce(Error("Synthetic transient cleanup failure"));
    await expect(recutAvatar(c, f.gameId, { type: "ADMIN", id: "synthetic-admin" })).rejects.toThrow("Synthetic transient cleanup failure");
    drop.mockRestore();
    const child = await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } });
    expect(child.avatarAssetId).not.toBe(f.avatarId); // recut attachment committed
    expect(await deleteGame(c, f.gameId, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    expect(await db.asset.findUniqueOrThrow({ where: { id: f.avatarId } })).toMatchObject({ status: "DELETED" });
    expect(await c.storage.exists(old.storagePath)).toBe(false);
    const result = await readAsset(c, f.avatarId, { userId: null, isAdmin: false,
      signature: priorUrl.searchParams.get("s"), expires: priorUrl.searchParams.get("e") });
    expect(result).toEqual({ error: 404 });
  });

  it("a rejected attachment transaction leaves no derivative asset or blob to orphan", async () => {
    const f = await fixture(), before = new Set((await db.asset.findMany()).map(row => row.id));
    const transaction = vi.spyOn(db, "$transaction").mockRejectedValueOnce(Error("Synthetic precommit connection failure"));
    await expect(recutAvatar(c, f.gameId, { type: "ADMIN", id: "synthetic-admin" })).rejects.toThrow("Synthetic precommit connection failure");
    transaction.mockRestore();
    expect((await db.asset.findMany()).filter(row => !before.has(row.id))).toEqual([]);
    expect(await db.fileBlob.count({ where: { key: { startsWith: "game/" } } })).toBe(await db.asset.count({ where: { visibility: "GAME", status: "READY" } }));
    expect(await deleteGame(c, f.gameId, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
  });

  it("display uses the ledger's verified capacity cap and keeps its settled estimate visible", async () => {
    const f = await fixture(), worldId = `${f.gameId}:board-wizard`;
    state.granted = true;
    const budget = boardWizardBudgetOf(c);
    await budget.importSettled(worldId, { scope: "image", operationFingerprint: "synthetic-complete-history",
      evidence: { providerNamespace: "synthetic", providerRequestId: "req_synthetic_5300000", usageId: "synthetic-usage", rawUsage: { total_tokens: 1 },
        model: "synthetic", amountMicroUsd: 5_300_000, costBasis: "conservative-upper-estimate" } });
    expect(await budget.audit(worldId)).toMatchObject({ capMicroUsd: 12_000_000, held: false, reservedMicroUsd: 0 });
    expect(await localPatchCostForDisplay(c, f.gameId)).toMatchObject({ settledMicroUsd: 5_300_000, unresolved: false, unknownCharges: 0 });
    expect(await generationCostForDisplay(c, f.gameId)).toBe(530);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retains committed lineage after a lost COMMIT acknowledgement and deletion denies both signed avatars", async () => {
    const f = await fixture();
    const transact = db.$transaction.bind(db);
    const lost = vi.spyOn(db, "$transaction").mockImplementationOnce((async (work: never, options: never) => {
      await transact(work, options);
      throw Error("Synthetic lost COMMIT acknowledgement");
    }) as typeof db.$transaction);
    await expect(recutAvatar(c, f.gameId, { type: "ADMIN", id: "synthetic-admin" })).rejects.toThrow("Synthetic lost COMMIT");
    lost.mockRestore();
    const child = await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } });
    const ids = [f.avatarId, child.avatarAssetId!];
    expect(new Set(ids).size).toBe(2);
    expect(await deleteGame(c, f.gameId, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    for (const id of ids) {
      const url = new URL(signedAssetUrl(c, id), "http://localhost.invalid");
      expect(await readAsset(c, id, { userId: null, isAdmin: false, signature: url.searchParams.get("s"), expires: url.searchParams.get("e") })).toEqual({ error: 404 });
    }
  });

  it("the final sibling deletion finds recut lineage recorded for the child, preserving the shared child until then", async () => {
    const f = await fixture(), sibling = `${f.gameId}-sibling`;
    await db.game.create({ data: { id: sibling, ownerId: f.ownerId, childProfileId: f.childId, styleVersion: "local-patch-world-v1", status: "DELIVERED" } });
    const cleanup = vi.spyOn(c.storage, "delete").mockRejectedValueOnce(Error("Synthetic cleanup interruption"));
    await expect(recutAvatar(c, f.gameId, { type: "ADMIN", id: "synthetic-admin" })).rejects.toThrow("Synthetic cleanup");
    cleanup.mockRestore();
    expect(await deleteGame(c, f.gameId, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    expect(await db.asset.findUniqueOrThrow({ where: { id: f.avatarId } })).toMatchObject({ status: "READY" });
    expect((await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } })).deletedAt).toBeNull();
    expect(await deleteGame(c, sibling, { type: "USER", id: f.ownerId }, f.ownerId)).toBe(true);
    expect(await db.asset.count({ where: { ownerId: f.ownerId, status: "READY" } })).toBe(0);
  });

  it.each([[3_900_000, false, 390], [4_100_000, true, null]] as const)("display and spending both enforce a lean four-dollar cap at %i microUSD", async (amount, held, cents) => {
    const f = await fixture(), worldId = `${f.gameId}:board-wizard`;
    state.lean = true;
    const budget = boardWizardBudgetOf(c);
    await budget.importSettled(worldId, { scope: "image", operationFingerprint: "synthetic-lean-history",
      evidence: { providerNamespace: "synthetic", providerRequestId: `req_lean_${amount}`, usageId: `synthetic-${amount}`, rawUsage: { total_tokens: 1 },
        model: "synthetic", amountMicroUsd: amount, costBasis: "conservative-upper-estimate" } });
    expect(await budget.audit(worldId)).toMatchObject({ capMicroUsd: 4_000_000, held, reservedMicroUsd: 0 });
    expect(await localPatchCostForDisplay(c, f.gameId)).toMatchObject({ settledMicroUsd: amount, reservedMicroUsd: 0, unknownCharges: 0, unresolved: held, estimated: true });
    expect(await generationCostForDisplay(c, f.gameId)).toBe(cents);
  });
});
