import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import type { Container } from "../../container";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { boardConditionedCheckpointKeys } from "../../../infra/db/board-conditioned-checkpoints";
import { PrismaWorldBudgetStore } from "../../../infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../../../infra/db/world-budget-repository";
import { WorldBudget } from "../world-budget";
import { prepareBoardConditionedSource, type BoardConditioningInput } from "../board-conditioned-source";
import { enrollBoardConditionedQaGame, registerBoardConditionedQaReference, boardQaWorldArtifactPrefix, boardQaReferenceLineageKey, type BoardConditionedQaBoard } from "../board-conditioned-qa-job";
import { deleteGame } from "../../game.service";
import { deleteBoardConditionedQaGame } from "../board-conditioned-deletion";
import { sha256Bytes } from "../fixed-sprite";

vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa" }), spendGuard: () => ({ appEnv: "qa", realGeneration: false, testers: [] }) }));
const admin = { type: "ADMIN" as const, id: "deletion-admin" };
const policy = { reserveMicroUsd: 200000, providerNamespace: "synthetic", timeoutMs: 1000, rateCard: { id: "fixture", textInput: 5, imageInput: 8, imageOutput: 30 } };
let db: PrismaClient, scratch: string, png: Buffer, fg: Buffer, count = 0;
const bound = (png: Buffer) => ({ png, sha256: sha256Bytes(png) });
beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "board-delete-test-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.sqlite").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  await db.user.create({ data: { id: admin.id, email: "deletion-admin@example.invalid" } });
  png = await sharp({ create: { width: 120, height: 120, channels: 4, background: "#384970" } }).png().toBuffer();
  fg = await sharp({ create: { width: 120, height: 120, channels: 4, background: "#00000000" } }).composite([
    { input: await sharp({ create: { width: 120, height: 45, channels: 4, background: "#384970" } }).png().toBuffer(), left: 0, top: 75 },
  ]).png().toBuffer();
  await db.fileBlob.create({ data: { key: "fixture/shared-scene.png", contentType: "image/png", data: new Uint8Array(png) } });
});
afterAll(async () => {
  await db?.$disconnect();
  const target = path.resolve(scratch);
  if (path.dirname(target) === realpathSync(tmpdir()) && path.basename(target).startsWith("board-delete-test-")) rmSync(target, { recursive: true, force: true });
});
async function fixture(options: { ownerId?: string; derivative?: boolean } = {}) {
  const gameId = `delete-board-${++count}`, childId = `${gameId}-child`, ownerId = options.ownerId ?? `${gameId}-owner`, identityId = `${gameId}-identity`;
  if (!options.ownerId) await db.user.create({ data: { id: ownerId, email: `${ownerId}@example.invalid` } });
  const c = { db, storage: new DbStorage(db), adminEmails: ["deletion-admin@example.invalid"], analytics: { track: vi.fn() } } as unknown as Container;
  async function asset(id: string, type: string) {
    await db.asset.create({ data: { id, ownerId, type, visibility: "PRIVATE", storagePath: `fixture/${id}.png`, mimeType: "image/png", bytes: png.length } });
    await db.fileBlob.create({ data: { key: `fixture/${id}.png`, contentType: "image/png", data: new Uint8Array(png) } });
  }
  await asset(identityId, "IDENTITY_SHEET"); await asset(`${gameId}-avatar`, "AVATAR"); await asset(`${gameId}-photo`, "ORIGINAL_PHOTO");
  await db.childProfile.create({ data: { id: childId, ownerId, displayName: "Private Fixture", ageYears: 8, identityAssetId: identityId, avatarAssetId: `${gameId}-avatar`, originalPhotoAssetId: `${gameId}-photo`, photoCropJson: "{\"private\":true}" } });
  const input: BoardConditioningInput = { boardId: "tokyo", board: bound(png), child: { profileId: childId, ageYears: 8, illustratedIdentity: bound(png), referenceRole: "illustrated-identity" },
    slots: (["front-peek", "side-lean", "wave-peek"] as const).map((pose, i) => ({ slot: { id: `slot-${i}`, pose, eye: { x: 20 + i * 40, y: 50 }, faceHeightPx: 8, window: { left: i * 40, top: 0, width: 40, height: 120 } }, foreground: bound(fg),
      context: { left: i * 40, top: 0, width: 40, height: 120 }, originalPeople: { left: i * 40, top: 0, width: 20, height: 30 }, poseDescription: `Natural ${pose} upper body`, wardrobe: "Pink cotton cardigan",
      lighting: { key: "Cool street light above", fill: "Blue violet ambient", shadows: "Broad painted shadows", exposure: "Like nearby painted people" } })) };
  const board: BoardConditionedQaBoard = { sceneVersion: 1, input, expectedContractSha256: (await prepareBoardConditionedSource(input, policy)).contractSha256 };
  if (options.derivative) {
    await asset(`${gameId}-derivative`, "IDENTITY_SHEET"); board.referenceAssetId = `${gameId}-derivative`;
    await registerBoardConditionedQaReference(c, { childProfileId: childId, assetId: board.referenceAssetId, parentIdentityAssetId: identityId,
      expectedAssetSha256: sha256Bytes(png), expectedParentSha256: sha256Bytes(png), attestation: "same-child-illustrated-derivative" }, admin);
  }
  await enrollBoardConditionedQaGame(c, { gameId, childProfileId: childId, boards: [board], sourcePolicy: policy }, admin);
  const worldId = `${gameId}:board-conditioned`, prefix = boardQaWorldArtifactPrefix(worldId);
  const privateKeys = [...Object.values(boardConditionedCheckpointKeys(worldId, "tokyo")), `${prefix}png/${"1".repeat(64)}`, `${prefix}review/${"2".repeat(64)}`, `${prefix}recovery/${"3".repeat(64)}`];
  for (const key of privateKeys) await db.fileBlob.create({ data: { key, contentType: key.includes("/png/") ? "image/png" : "application/json", data: new Uint8Array(png) } });
  const budget = new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db)));
  await budget.importSettled(worldId, { scope: "sheet", operationFingerprint: "historical-image", evidence: { providerNamespace: "synthetic", providerRequestId: `receipt-${gameId}`, usageId: `usage-${gameId}`, rawUsage: { inputTokens: 1 }, model: "gpt-image-2", amountMicroUsd: 5000, costBasis: "provider-billed" } });
  const owner = { type: "USER" as const, id: ownerId };
  return { c, gameId, worldId, ownerId, childId, identityId, owner, privateKeys, prefix, board };
}

describe("board-conditioned private game deletion on real isolated SQLite", () => {
  it("dispatches exact new style, purges all owned imagery including lineage, and preserves every bill", async () => {
    const f = await fixture({ derivative: true });
    const beforeLedger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } });
    expect(await deleteGame(f.c, f.gameId, f.owner, f.ownerId)).toBe(true);
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ status: "DELETED", configJson: null, title: null, giftJson: null });
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } })).toMatchObject({ status: "DONE", currentStep: null, stepsJson: "{}" });
    expect(await db.fileBlob.count({ where: { key: { in: f.privateKeys } } })).toBe(0);
    for (const suffix of ["identity", "avatar", "photo", "derivative"]) {
      expect(await db.fileBlob.findUnique({ where: { key: `fixture/${f.gameId}-${suffix}.png` } })).toBeNull();
      expect(await db.asset.findUniqueOrThrow({ where: { id: `${f.gameId}-${suffix}` } })).toMatchObject({ status: "DELETED" });
    }
    expect(await db.fileBlob.findUnique({ where: { key: boardQaReferenceLineageKey(f.childId, `${f.gameId}-derivative`) } })).toBeNull();
    expect(await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } })).toMatchObject({ identityAssetId: null, avatarAssetId: null, originalPhotoAssetId: null, photoCropJson: null });
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: f.worldId } })).toEqual(beforeLedger);
    expect(await db.fileBlob.findUnique({ where: { key: "fixture/shared-scene.png" } })).not.toBeNull();
    expect(await deleteGame(f.c, f.gameId, f.owner, f.ownerId)).toBe(false);
  });
  it("rejects forged roles and wrong owner without touching the game", async () => {
    const f = await fixture(), before = await db.game.findUniqueOrThrow({ where: { id: f.gameId } });
    await expect(deleteGame(f.c, f.gameId, { type: "SYSTEM" })).rejects.toMatchObject({ code: "permission" });
    await expect(deleteGame(f.c, f.gameId, { type: "ADMIN", id: f.ownerId })).rejects.toMatchObject({ code: "permission" });
    await expect(deleteGame(f.c, f.gameId, { type: "USER", id: "other-owner" }, f.ownerId)).rejects.toMatchObject({ code: "permission" });
    expect(await deleteGame(f.c, f.gameId, { type: "USER", id: "other-owner" }, "other-owner")).toBe(false);
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toEqual(before);
    expect(await db.fileBlob.count({ where: { key: { in: f.privateKeys } } })).toBe(f.privateKeys.length);
  });
  it("preserves every other game and same-owner unrelated asset", async () => {
    const f = await fixture(), other = await fixture({ ownerId: f.ownerId });
    const otherGame = await db.game.findUniqueOrThrow({ where: { id: other.gameId } });
    const otherBlobs = await db.fileBlob.findMany({ where: { key: { in: [...other.privateKeys, `fixture/${other.identityId}.png`] } }, orderBy: { key: "asc" } });
    expect(await deleteGame(f.c, f.gameId, admin)).toBe(true);
    expect(await db.game.findUniqueOrThrow({ where: { id: other.gameId } })).toEqual(otherGame);
    expect(await db.fileBlob.findMany({ where: { key: { in: otherBlobs.map(b => b.key) } }, orderBy: { key: "asc" } })).toEqual(otherBlobs);
  });
  it("does not delete a reference whose bytes are shared through another child alias", async () => {
    const f = await fixture();
    await db.asset.create({ data: { id: `${f.gameId}-alias`, ownerId: f.ownerId, type: "IDENTITY_SHEET", visibility: "PRIVATE", mimeType: "image/png", storagePath: `fixture/${f.identityId}.png` } });
    await db.childProfile.create({ data: { id: `${f.gameId}-sibling`, ownerId: f.ownerId, displayName: "Sibling", ageYears: 6, identityAssetId: `${f.gameId}-alias` } });
    expect(await deleteGame(f.c, f.gameId, f.owner, f.ownerId)).toBe(true);
    expect(await db.fileBlob.findUnique({ where: { key: `fixture/${f.identityId}.png` } })).not.toBeNull();
    expect(await db.asset.findUniqueOrThrow({ where: { id: f.identityId } })).toMatchObject({ status: "READY", deletedAt: null });
    expect(await db.childProfile.findUniqueOrThrow({ where: { id: `${f.gameId}-sibling` } })).toMatchObject({ deletedAt: null });
    expect(await db.fileBlob.count({ where: { key: { in: f.privateKeys } } })).toBe(0);
  });
  it("purges only this world when another live game still uses the child", async () => {
    const f = await fixture();
    await db.game.create({ data: { id: `${f.gameId}-shared-child-game`, ownerId: f.ownerId, childProfileId: f.childId, status: "DRAFT" } });
    expect(await deleteGame(f.c, f.gameId, f.owner, f.ownerId)).toBe(true);
    expect(await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } })).toMatchObject({ deletedAt: null, identityAssetId: f.identityId });
    for (const suffix of ["identity", "avatar", "photo"]) expect(await db.fileBlob.findUnique({ where: { key: `fixture/${f.gameId}-${suffix}.png` } })).not.toBeNull();
    expect(await db.fileBlob.count({ where: { key: { in: f.privateKeys } } })).toBe(0);
  });
  it("rolls back the entire deletion when the final write crashes, then safely retries", async () => {
    const f = await fixture(), gameBefore = await db.game.findUniqueOrThrow({ where: { id: f.gameId } }), jobBefore = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${f.gameId}` } });
    const trigger = `fail_delete_${count}`;
    await db.$executeRawUnsafe(`CREATE TRIGGER ${trigger} BEFORE INSERT ON AuditLog WHEN NEW.action = 'board_conditioned.deleted' BEGIN SELECT RAISE(ABORT, 'synthetic deletion failure'); END`);
    try {
      await expect(deleteGame(f.c, f.gameId, f.owner, f.ownerId)).rejects.toThrow();
      expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toEqual(gameBefore);
      expect(await db.generationJob.findUniqueOrThrow({ where: { id: jobBefore.id } })).toEqual(jobBefore);
      expect(await db.fileBlob.count({ where: { key: { in: f.privateKeys } } })).toBe(f.privateKeys.length);
      expect(await db.asset.findUniqueOrThrow({ where: { id: f.identityId } })).toMatchObject({ status: "READY", deletedAt: null });
    } finally { await db.$executeRawUnsafe(`DROP TRIGGER ${trigger}`); }
    expect(await deleteGame(f.c, f.gameId, f.owner, f.ownerId)).toBe(true);
  });
  it("refuses to adopt non-QA commerce state or an unbound private key", async () => {
    const f = await fixture();
    await db.game.update({ where: { id: f.gameId }, data: { paidAt: new Date() } });
    await expect(deleteBoardConditionedQaGame(f.c, f.gameId, f.owner, f.ownerId)).rejects.toMatchObject({ code: "unsupported" });
    await db.game.update({ where: { id: f.gameId }, data: { paidAt: null } });
    await db.fileBlob.create({ data: { key: `${f.prefix}foreign/unrecognized`, contentType: "image/png", data: new Uint8Array(png) } });
    await expect(deleteGame(f.c, f.gameId, f.owner, f.ownerId)).rejects.toMatchObject({ code: "integrity" });
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ deletedAt: null, status: "QA_PENDING" });
  });
});
