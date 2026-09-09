import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import type { Container } from "../../container";
import { DbStorage } from "../../../infra/storage/db";
import { PrismaWorldBudgetStore } from "../../../infra/db/prisma-world-budget-store";
import { withFreshAssetUrls } from "../../asset.service";
import { runRetention } from "../../retention.service";
import { createFixedWorldFixture } from "./helpers/fixed-world-fixture";
import { fixedWorldJsonSha256, type FixedWorldMaterializerInput } from "../fixed-world-materializer";
import { sha256Bytes, sha256Rgba } from "../fixed-sprite";
import { FIXED_WORLD_STYLE_VERSION, fixedStageStoragePath, readFixedWorldStage, readFixedWorldEnrollment, fixedWorldConfigSha256, fixedStageJsonSha256 } from "../fixed-world-stage-record";
import { stageQualifiedFixedWorld, approveFixedWorldForPublication, deleteFixedWorldGame } from "../fixed-world-staging";
import { enrollFixedWorld } from "../fixed-world-enrollment";

// Real disposable SQLite; these are synthetic rectangles/fabricated receipts,
// NOT a real child, paid generation, visual approval, browser test or live game.
let scratch: string, db: PrismaClient, fixture: FixedWorldMaterializerInput;
let sequence = 0;
const admin = { type: "ADMIN" as const, id: "fixed-test-admin" };
beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-fixed-stage-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  await db.user.create({ data: { id: admin.id, email: "fixed-admin@example.invalid" } });
  fixture = await createFixedWorldFixture();
  for (const appearance of fixture.appearances) {
    const mask = appearance.foreground;
    if ("rgba" in mask) appearance.foreground = { png: await sharp(mask.rgba, { raw: { width: mask.width, height: mask.height, channels: 4 } }).png().toBuffer() };
  }
}, 30_000);
afterAll(async () => {
  await db?.$disconnect();
  if (scratch && path.dirname(scratch) === realpathSync(tmpdir()) && path.basename(scratch).startsWith("findme-fixed-stage-")) rmSync(scratch, { recursive: true, force: true });
});
async function setup() {
  const id = `fixed-stage-test-${++sequence}`, ownerId = `${id}-owner`, childId = `${id}-child`;
  const input = structuredClone(fixture);
  input.game.id = id; input.game.styleVersion = FIXED_WORLD_STYLE_VERSION;
  input.budget.worldId = `${id}:journey`; input.budget.snapshot.worldId = input.budget.worldId;
  input.budget.snapshotSha256 = fixedWorldJsonSha256(input.budget.snapshot);
  await db.user.create({ data: { id: ownerId, email: `${id}@example.invalid` } });
  for (const [suffix, type, visibility] of [["identity", "IDENTITY_SHEET", "PRIVATE"], ["avatar", "AVATAR", "GAME"], ["photo", "ORIGINAL_PHOTO", "PRIVATE"]] as const) {
    const assetId = `${id}-${suffix}`, storagePath = `test/${assetId}.png`;
    await db.asset.create({ data: { id: assetId, ownerId, type, visibility, mimeType: "image/png", storagePath, bytes: input.identity.bytes.length, width: 32, height: 32 } });
    await db.fileBlob.create({ data: { key: storagePath, contentType: "image/png", data: new Uint8Array(input.identity.bytes) } });
  }
  await db.childProfile.create({ data: { id: childId, ownerId, displayName: input.game.childName, ageYears: 8, avatarAssetId: `${id}-avatar`, identityAssetId: `${id}-identity`, originalPhotoAssetId: `${id}-photo` } });
  const storage = new DbStorage(db), forbidden = vi.fn(() => { throw new Error("No external work allowed in staging"); });
  vi.spyOn(storage, "put").mockImplementation(forbidden);
  const c = { db, storage, secret: "synthetic-test-signing-secret", adminEmails: ["FIXED-ADMIN@example.invalid"], autoApprove: true, deliverWithProblems: true,
    avatars: new Proxy({}, { get: () => forbidden }), judge: { judge: forbidden }, email: { send: forbidden }, jobs: { enqueue: forbidden } } as unknown as Container;
  await enrollFixedWorld(c, { gameId: id, childProfileId: childId, locale: "en", plan: input.plan, planSha256: input.planSha256, world: input.world, scenes: input.scenes }, admin);
  // Fixture receipts are synthetic already-incurred charges, imported only
  // after actual enrollment created the allowance. Never recreate/reset it.
  expect(await new PrismaWorldBudgetStore(db).compareAndSwap(input.budget.worldId, 0, input.budget.snapshot)).toBe(true);
  const record = async () => readFixedWorldStage((await db.generationJob.findUniqueOrThrow({ where: { id: `job_${id}` } })).stepsJson)!;
  return { id, ownerId, childId, input, c, forbidden, record };
}
async function untouched(id: string) {
  expect(await db.asset.count({ where: { ownerId: `${id}-owner`, provider: "fixed-sprite-v3" } })).toBe(0);
  expect(await db.targetInstance.count({ where: { gameScene: { gameId: id } } })).toBe(0);
  expect(await db.game.findUnique({ where: { id } })).toMatchObject({ status: "QA_PENDING", styleVersion: FIXED_WORLD_STYLE_VERSION, configJson: null });
}

describe("atomic fixed-world staging on real disposable SQLite", () => {
  it("persists all 9 originals, 27 exact A sprites and private source/mask evidence without publishing or paying", async () => {
    const s = await setup();
    const enrollment = readFixedWorldEnrollment((await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.id}` } })).stepsJson);
    expect(await stageQualifiedFixedWorld(s.c, s.input, admin)).toEqual({ gameId: s.id, status: "MANUAL_REVIEW", assetCount: 92, reused: false });
    const record = await s.record(), game = await db.game.findUniqueOrThrow({ where: { id: s.id } }), config = JSON.parse(game.configJson!);
    expect(record.childAgeYears).toBe(8);
    expect(game.status).toBe("MANUAL_REVIEW"); expect(game.readyAt).toBeNull();
    expect(await db.targetVariantAsset.count({ where: { targetInstance: { gameScene: { gameId: s.id } }, variant: "A" } })).toBe(27);
    expect(await db.targetVariantAsset.count({ where: { targetInstance: { gameScene: { gameId: s.id } }, variant: "B" } })).toBe(0);
    expect(fixedWorldConfigSha256(withFreshAssetUrls(s.c, config, 100))).toBe(record.configSha256);
    for (const asset of record.assets) {
      const blob = await db.fileBlob.findUniqueOrThrow({ where: { key: fixedStageStoragePath(asset) } });
      expect(sha256Bytes(blob.data)).toBe(asset.encodedSha256);
      expect(asset.visibility).toBe(["board", "sprite"].includes(asset.role) ? "GAME" : "PRIVATE");
      if (asset.role === "sprite") {
        const decoded = await sharp(Buffer.from(blob.data)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        expect(sha256Rgba(decoded.data, decoded.info.width, decoded.info.height)).toBe(asset.rgbaSha256);
      }
      if (asset.role === "board") expect(sha256Bytes(blob.data)).toBe(sha256Bytes(s.input.originalBoards[0]!.bytes));
    }
    for (const scene of config.scenes) {
      expect(scene.art.base).toMatch(/^\/api\/assets\/ast_fixed_/); expect(scene.art.thumbnail).toBe(scene.art.base);
    }
    expect(s.forbidden).not.toHaveBeenCalled();
    expect(await db.shareLink.count({ where: { gameId: s.id } })).toBe(0);
    expect((await db.childProfile.findUniqueOrThrow({ where: { id: s.childId } })).originalPhotoAssetId).toBe(`${s.id}-photo`);
    expect(readFixedWorldEnrollment((await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.id}` } })).stepsJson)).toEqual(enrollment);
  });

  it("same retry verifies blobs and never creates duplicate assets", async () => {
    const s = await setup(); await stageQualifiedFixedWorld(s.c, s.input, admin);
    const before = await s.record();
    expect(await stageQualifiedFixedWorld(s.c, s.input, admin)).toMatchObject({ reused: true, assetCount: 92 });
    expect((await s.record()).assets).toEqual(before.assets);
    expect(await db.asset.count({ where: { ownerId: s.ownerId } })).toBe(95);
    const asset = before.assets.find(a => a.role === "sprite")!;
    await db.fileBlob.update({ where: { key: fixedStageStoragePath(asset) }, data: { data: Buffer.from("corrupt") } });
    await expect(stageQualifiedFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "integrity" });
  });

  it.each(["absent", "malformed", "different-plan"] as const)("requires the exact enrollment capsule before staging: %s", async mutation => {
    const s = await setup(), job = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.id}` } });
    const steps = JSON.parse(job.stepsJson);
    if (mutation === "absent") delete steps.fixedEnrollment;
    if (mutation === "malformed") steps.fixedEnrollment.budgetCapMicroUsd = 10_000_000;
    if (mutation === "different-plan") steps.fixedEnrollment.planSha256 = "f".repeat(64);
    await db.generationJob.update({ where: { id: job.id }, data: { stepsJson: JSON.stringify(steps) } });
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: s.input.budget.worldId } });
    await expect(stageQualifiedFixedWorld(s.c, s.input, admin)).rejects.toThrow(); await untouched(s.id);
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: s.input.budget.worldId } })).toEqual(ledger);
  });

  it("can delete an unstaged enrollment while retaining every unknown reserve byte", async () => {
    const s = await setup(), snapshot = structuredClone(s.input.budget.snapshot);
    snapshot.requests = [...snapshot.requests, { requestKey: "unknown-before-stage", scope: "image", operationFingerprint: s.input.planSha256, reserveMicroUsd: 250_000, origin: "reserved", unknownReasons: ["Synthetic missing provider reply"], conflicts: [], state: "unknown" }];
    expect(await new PrismaWorldBudgetStore(db).compareAndSwap(snapshot.worldId, 1, snapshot)).toBe(true);
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: snapshot.worldId } });
    await expect(approveFixedWorldForPublication(s.c, s.id, admin)).rejects.toThrow();
    expect(await deleteFixedWorldGame(s.c, s.id, { type: "USER", id: s.ownerId }, s.ownerId)).toBe(true);
    expect(await db.game.findUnique({ where: { id: s.id } })).toMatchObject({ status: "DELETED", configJson: null, paidAt: null, readyAt: null });
    expect(await db.childProfile.findUnique({ where: { id: s.childId } })).toMatchObject({ avatarAssetId: null, identityAssetId: null, originalPhotoAssetId: null, deletedAt: expect.any(Date) });
    expect(await db.asset.count({ where: { ownerId: s.ownerId, status: "READY" } })).toBe(0);
    for (const suffix of ["identity", "avatar", "photo"]) expect(await db.fileBlob.findUnique({ where: { key: `test/${s.id}-${suffix}.png` } })).toBeNull();
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: snapshot.worldId } })).toEqual(ledger);
    expect((await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.id}` } })).stepsJson).toBe("{}");
    await expect(enrollFixedWorld(s.c, { gameId: s.id, childProfileId: s.childId, locale: "en", plan: s.input.plan, planSha256: s.input.planSha256, world: s.input.world, scenes: s.input.scenes }, admin)).rejects.toThrow();
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: snapshot.worldId } })).toEqual(ledger);
    expect(await deleteFixedWorldGame(s.c, s.id, admin)).toBe(false);
    expect(s.forbidden).not.toHaveBeenCalled();
  });

  it("pre-stage deletion purges the enrolled photo even if its profile pointer disappeared", async () => {
    const s = await setup();
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: s.input.budget.worldId } });
    await db.childProfile.update({ where: { id: s.childId }, data: { originalPhotoAssetId: null } });
    expect(await db.fileBlob.findUnique({ where: { key: `test/${s.id}-photo.png` } })).not.toBeNull();
    expect(await deleteFixedWorldGame(s.c, s.id, admin)).toBe(true);
    expect(await db.asset.findUnique({ where: { id: `${s.id}-photo` } })).toMatchObject({ status: "DELETED" });
    expect(await db.fileBlob.findUnique({ where: { key: `test/${s.id}-photo.png` } })).toBeNull();
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: s.input.budget.worldId } })).toEqual(ledger);
  });

  it.each([null, 1, 11])("rejects unqualified child age %s before creating any output", async ageYears => {
    const s = await setup(); await db.childProfile.update({ where: { id: s.childId }, data: { ageYears } });
    await expect(stageQualifiedFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "identity" }); await untouched(s.id);
  });
  it("rejects another owner's identity and unsupported locale", async () => {
    const s = await setup(); await db.asset.update({ where: { id: `${s.id}-identity` }, data: { ownerId: admin.id } });
    await expect(stageQualifiedFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "identity" });
    await db.asset.update({ where: { id: `${s.id}-identity` }, data: { ownerId: s.ownerId } });
    await db.game.update({ where: { id: s.id }, data: { locale: "fr" } });
    await expect(stageQualifiedFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "identity" }); await untouched(s.id);
  });
  it("refuses partial/missing approvals and an active legacy worker", async () => {
    const s = await setup(), partial = structuredClone(s.input); partial.appearances.pop();
    await expect(stageQualifiedFixedWorld(s.c, partial, admin)).rejects.toThrow(); await untouched(s.id);
    const unreviewed = structuredClone(s.input); unreviewed.appearances[0]!.reviews = [];
    await expect(stageQualifiedFixedWorld(s.c, unreviewed, admin)).rejects.toThrow(); await untouched(s.id);
    await db.generationJob.update({ where: { id: `job_${s.id}` }, data: { status: "RUNNING" } });
    await expect(stageQualifiedFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "conflict" }); await untouched(s.id);
    expect((await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.id}` } })).status).toBe("RUNNING");
  });
  it("a late blob collision rolls back all earlier boards, job, budget fence and game changes", async () => {
    const s = await setup(), board = s.input.originalBoards[8]!;
    const id = `ast_fixed_${fixedWorldJsonSha256([s.id, s.input.planSha256, `board:${board.slug}:${sha256Bytes(board.bytes)}`])}`;
    const key = `game/${id}.png`;
    await db.fileBlob.create({ data: { key, contentType: "image/png", data: Buffer.from("collision-preserved") } });
    await expect(stageQualifiedFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "P2002" }); await untouched(s.id);
    expect(await db.generationJob.count({ where: { gameId: s.id } })).toBe(1);
    expect((await new PrismaWorldBudgetStore(db).read(s.input.budget.worldId))?.revision).toBe(1);
    expect(Buffer.from((await db.fileBlob.findUniqueOrThrow({ where: { key } })).data).toString()).toBe("collision-preserved");
  });
  it("a lost commit acknowledgement is safely retried against the same saved game", async () => {
    const s = await setup();
    const realTransaction = db.$transaction.bind(db);
    s.c.db = new Proxy(db, { get(target, key, receiver) {
      if (key === "$transaction") return async (...args: unknown[]) => {
        await (realTransaction as (...args: unknown[]) => Promise<unknown>)(...args); throw new Error("commit acknowledgement lost");
      };
      return Reflect.get(target, key, receiver);
    } });
    await expect(stageQualifiedFixedWorld(s.c, s.input, admin)).rejects.toThrow("commit acknowledgement lost"); s.c.db = db;
    expect(await stageQualifiedFixedWorld(s.c, s.input, admin)).toMatchObject({ reused: true });
    expect(await db.asset.count({ where: { ownerId: s.ownerId, provider: "fixed-sprite-v3" } })).toBe(92);
  });
  it("only an authenticated manual admin can release; default original-photo deletion is atomic", async () => {
    const s = await setup(); await stageQualifiedFixedWorld(s.c, s.input, admin);
    for (const actor of [{ type: "SYSTEM" as const }, { type: "ADMIN" as const, id: s.ownerId }]) await expect(approveFixedWorldForPublication(s.c, s.id, actor)).rejects.toMatchObject({ code: "permission" });
    await approveFixedWorldForPublication(s.c, s.id, admin);
    expect(await db.game.findUnique({ where: { id: s.id } })).toMatchObject({ status: "READY" });
    expect(await db.asset.findUnique({ where: { id: `${s.id}-photo` } })).toMatchObject({ status: "DELETED" });
    expect(await db.fileBlob.findUnique({ where: { key: `test/${s.id}-photo.png` } })).toBeNull();
    await approveFixedWorldForPublication(s.c, s.id, admin); expect(s.forbidden).not.toHaveBeenCalled();
  });
  it("post-publication deletion tolerates the privacy-purged photo and removes all remaining assets", async () => {
    const s = await setup(); await stageQualifiedFixedWorld(s.c, s.input, admin);
    await approveFixedWorldForPublication(s.c, s.id, admin);
    expect(await db.childProfile.findUnique({ where: { id: s.childId } })).toMatchObject({ originalPhotoAssetId: null });
    expect(await db.asset.findUnique({ where: { id: `${s.id}-photo` } })).toMatchObject({ status: "DELETED" });
    const ledger = await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: s.input.budget.worldId } });
    expect(await deleteFixedWorldGame(s.c, s.id, admin)).toBe(true);
    expect(await db.asset.count({ where: { ownerId: s.ownerId, status: "READY" } })).toBe(0);
    expect(await db.fileBlob.findUnique({ where: { key: `test/${s.id}-photo.png` } })).toBeNull();
    expect(await db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId: s.input.budget.worldId } })).toEqual(ledger);
    expect(await deleteFixedWorldGame(s.c, s.id, admin)).toBe(false);
  });
  it.each(["age", "locale", "geometry", "visibility", "budget"] as const)("publication rejects post-staging %s mutation without deleting the photo", async mutation => {
    const s = await setup(); await stageQualifiedFixedWorld(s.c, s.input, admin);
    if (mutation === "age") await db.childProfile.update({ where: { id: s.childId }, data: { ageYears: 6 } });
    if (mutation === "locale") await db.game.update({ where: { id: s.id }, data: { locale: "he" } });
    if (mutation === "geometry") {
      const variant = await db.targetVariantAsset.findFirstOrThrow({ where: { targetInstance: { gameScene: { gameId: s.id } } } });
      await db.targetVariantAsset.update({ where: { id: variant.id }, data: { rectJson: '{"x":0,"y":0,"w":1,"h":1}' } });
    }
    if (mutation === "visibility") await db.asset.update({ where: { id: (await s.record()).assets.find(a => a.role === "mask")!.id }, data: { visibility: "GAME" } });
    if (mutation === "budget") {
      const snapshot = structuredClone(s.input.budget.snapshot), first = snapshot.requests[0]!;
      if (first.state === "settled") first.evidence.amountMicroUsd += 1;
      await db.worldBudgetLedger.update({ where: { worldId: snapshot.worldId }, data: { revision: { increment: 1 }, snapshotJson: JSON.stringify(snapshot) } });
    }
    await expect(approveFixedWorldForPublication(s.c, s.id, admin)).rejects.toThrow();
    expect(await db.game.findUnique({ where: { id: s.id } })).toMatchObject({ status: "MANUAL_REVIEW" });
    expect(await db.asset.findUnique({ where: { id: `${s.id}-photo` } })).toMatchObject({ status: "READY" });
  });
  it("owner deletion purges all private evidence, sources, boards and child assets, never resetting the spent ledger", async () => {
    const s = await setup(); await stageQualifiedFixedWorld(s.c, s.input, admin);
    await db.shareLink.create({ data: { id: `${s.id}-share`, gameId: s.id, tokenHash: `${s.id}-hash` } });
    await expect(deleteFixedWorldGame(s.c, s.id, { type: "USER", id: s.ownerId })).rejects.toMatchObject({ code: "permission" });
    expect(await deleteFixedWorldGame(s.c, s.id, { type: "USER", id: s.ownerId }, s.ownerId)).toBe(true);
    expect(await db.asset.count({ where: { ownerId: s.ownerId, status: "READY" } })).toBe(0);
    expect(await db.shareLink.findUnique({ where: { id: `${s.id}-share` } })).toMatchObject({ active: false });
    expect(await db.game.findUnique({ where: { id: s.id } })).toMatchObject({ status: "DELETED", configJson: null });
    expect((await new PrismaWorldBudgetStore(db).read(s.input.budget.worldId))!.snapshot).toEqual(s.input.budget.snapshot);
    await expect(stageQualifiedFixedWorld(s.c, s.input, admin)).rejects.toThrow();
    expect(await deleteFixedWorldGame(s.c, s.id, admin)).toBe(false);
  });
  it("cross-game same-owner asset pointers abort deletion instead of purging unrelated data", async () => {
    const s = await setup(); await stageQualifiedFixedWorld(s.c, s.input, admin);
    const target = await db.targetInstance.findFirstOrThrow({ where: { gameScene: { gameId: s.id } } });
    await db.targetInstance.update({ where: { id: target.id }, data: { spriteAssetId: `${s.id}-photo` } });
    await expect(deleteFixedWorldGame(s.c, s.id, admin)).rejects.toMatchObject({ code: "integrity" });
    expect(await db.game.findUnique({ where: { id: s.id } })).toMatchObject({ status: "MANUAL_REVIEW" });
    expect(await db.asset.count({ where: { ownerId: s.ownerId, status: "READY" } })).toBe(95);
  });
  it("signature normalization ignores expiry only in image URL fields, never in prose", () => {
    expect(fixedStageJsonSha256({ url: "/api/assets/x?e=1" })).toBe(fixedStageJsonSha256({ url: "/api/assets/x?e=2" }));
    expect(fixedStageJsonSha256({ mission: "/api/assets/x?e=1" })).not.toBe(fixedStageJsonSha256({ mission: "/api/assets/x?e=2" }));
  });
  it("never converts a legacy game and never enrolls a profile used by a legacy sibling", async () => {
    const s = await setup();
    await db.game.update({ where: { id: s.id }, data: { styleVersion: "collage-v1" } });
    await expect(stageQualifiedFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "conflict" });
    expect(await db.game.findUnique({ where: { id: s.id } })).toMatchObject({ styleVersion: "collage-v1", configJson: null });
    await db.game.update({ where: { id: s.id }, data: { styleVersion: FIXED_WORLD_STYLE_VERSION } });
    await db.game.create({ data: { id: `${s.id}-legacy-sibling`, ownerId: s.ownerId, childProfileId: s.childId, status: "PAID" } });
    await expect(stageQualifiedFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "identity" }); await untouched(s.id);
  });
  it("a budget revision race rolls back the entire stage", async () => {
    const s = await setup(), original = PrismaWorldBudgetStore.prototype.read;
    const reader = vi.spyOn(PrismaWorldBudgetStore.prototype, "read").mockImplementationOnce(async function (this: PrismaWorldBudgetStore, worldId) {
      const before = await original.call(this, worldId);
      await db.worldBudgetLedger.update({ where: { worldId }, data: { revision: { increment: 1 } } });
      return before;
    });
    try { await expect(stageQualifiedFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "budget" }); }
    finally { reader.mockRestore(); }
    await untouched(s.id); expect(await db.generationJob.count({ where: { gameId: s.id } })).toBe(1);
  });
  it("new unknown billing holds publication even with auto-approval flags enabled", async () => {
    const s = await setup(); await stageQualifiedFixedWorld(s.c, s.input, admin);
    const snapshot = { ...s.input.budget.snapshot, requests: [...s.input.budget.snapshot.requests, { requestKey: "late-unknown", scope: "judge", operationFingerprint: "unknown-review", reserveMicroUsd: 100_000, origin: "reserved", unknownReasons: ["Provider response lost"], conflicts: [], state: "unknown" }] };
    await db.worldBudgetLedger.update({ where: { worldId: snapshot.worldId }, data: { revision: { increment: 1 }, snapshotJson: JSON.stringify(snapshot) } });
    await expect(approveFixedWorldForPublication(s.c, s.id, admin)).rejects.toMatchObject({ code: "budget" });
    expect(await db.game.findUnique({ where: { id: s.id } })).toMatchObject({ status: "MANUAL_REVIEW" });
    expect(await db.asset.findUnique({ where: { id: `${s.id}-photo` } })).toMatchObject({ status: "READY" });
  });
  it("tampered deletion storage paths roll back game, job, pointers and blobs", async () => {
    const s = await setup(); await stageQualifiedFixedWorld(s.c, s.input, admin);
    const before = await s.record(), asset = before.assets.find(a => a.role === "mask")!;
    await db.asset.update({ where: { id: asset.id }, data: { storagePath: `test/${s.id}-photo.png` } });
    await expect(deleteFixedWorldGame(s.c, s.id, admin)).rejects.toMatchObject({ code: "integrity" });
    expect(await s.record()).toEqual(before);
    expect(await db.game.findUnique({ where: { id: s.id } })).toMatchObject({ status: "MANUAL_REVIEW" });
    expect(await db.fileBlob.findUnique({ where: { key: `test/${s.id}-photo.png` } })).not.toBeNull();
    expect(await db.asset.count({ where: { ownerId: s.ownerId, status: "READY" } })).toBe(95);
  });
  it("qualified evidence survives rejected-patch retention and remains valid for manual release", async () => {
    const s = await setup(); await stageQualifiedFixedWorld(s.c, s.input, admin);
    await db.asset.updateMany({ where: { ownerId: s.ownerId, type: "FIXED_WORLD_EVIDENCE" }, data: { createdAt: new Date(Date.now() - 20 * 86400_000) } });
    await runRetention(s.c);
    expect(await db.asset.count({ where: { ownerId: s.ownerId, status: "READY" } })).toBe(95);
    await approveFixedWorldForPublication(s.c, s.id, admin);
    expect(await db.game.findUnique({ where: { id: s.id } })).toMatchObject({ status: "READY" });
  });
});
