import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import { PrismaWorldBudgetStore } from "../../../infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../../../infra/db/world-budget-repository";
import type { Container } from "../../container";
import type { Actor } from "../../audit.service";
import { createFixedWorldFixture } from "./helpers/fixed-world-fixture";
import { fixedWorldJsonSha256, type FixedWorldIntentInput } from "../fixed-world-materializer";
import { enrollFixedWorld, type FixedWorldEnrollmentInput } from "../fixed-world-enrollment";
import { FIXED_WORLD_STYLE_VERSION, readFixedWorldEnrollment } from "../fixed-world-stage-record";
import { WorldBudget, auditWorldBudget, type WorldChargeEvidence } from "../world-budget";

// Synthetic PNGs/definitions only. Uses a fresh disposable SQLite database,
// never the configured application database, real child, provider or server.
let scratch: string, db: PrismaClient, intent: FixedWorldIntentInput, png: Buffer;
let sequence = 0;
const admin = { type: "ADMIN" as const, id: "enrollment-admin" };
beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-fixed-enrollment-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  await db.user.create({ data: { id: admin.id, email: "enrollment-admin@example.invalid" } });
  const fixture = await createFixedWorldFixture();
  intent = { plan: fixture.plan, planSha256: fixture.planSha256, world: fixture.world, scenes: fixture.scenes };
  png = Buffer.from(fixture.identity.bytes);
}, 30_000);
afterAll(async () => {
  await db?.$disconnect();
  const resolved = scratch ? path.resolve(scratch) : "";
  if (resolved && path.dirname(resolved) === realpathSync(tmpdir()) && path.basename(resolved).startsWith("findme-fixed-enrollment-")) rmSync(resolved, { recursive: true, force: true });
});

async function setup(withPhoto = true) {
  const id = `enrollment-${++sequence}`, ownerId = `${id}-owner`, childId = `${id}-child`;
  await db.user.create({ data: { id: ownerId, email: `${id}@example.invalid` } });
  for (const [suffix, type, visibility] of [["identity", "IDENTITY_SHEET", "PRIVATE"], ["avatar", "AVATAR", "GAME"], ...(withPhoto ? [["photo", "ORIGINAL_PHOTO", "PRIVATE"]] : [])]) {
    const assetId = `${id}-${suffix}`, storagePath = `test/${assetId}.png`;
    await db.asset.create({ data: { id: assetId, ownerId, type: type!, visibility: visibility!, storagePath, mimeType: "image/png", width: 32, height: 32, bytes: png.length } });
    await db.fileBlob.create({ data: { key: storagePath, contentType: "image/png", data: new Uint8Array(png) } });
  }
  await db.childProfile.create({ data: { id: childId, ownerId, displayName: "Fixture Child", ageYears: 8, identityAssetId: `${id}-identity`, avatarAssetId: `${id}-avatar`, originalPhotoAssetId: withPhoto ? `${id}-photo` : null } });
  const input: FixedWorldEnrollmentInput = { ...structuredClone(intent), gameId: id, childProfileId: childId, locale: "en" };
  const storage = new DbStorage(db), forbidden = vi.fn(() => { throw new Error("Enrollment cannot call external work"); });
  vi.spyOn(storage, "put").mockImplementation(forbidden);
  vi.spyOn(storage, "get").mockImplementation(forbidden);
  const c = { db, storage, adminEmails: [" ENROLLMENT-ADMIN@EXAMPLE.INVALID "], autoApprove: true, deliverWithProblems: true,
    avatars: new Proxy({}, { get: () => forbidden }), judge: { judge: forbidden }, email: { send: forbidden }, jobs: { enqueue: forbidden }, payment: new Proxy({}, { get: () => forbidden }) } as unknown as Container;
  const worldId = `${id}:journey`;
  const ledger = () => db.worldBudgetLedger.findUniqueOrThrow({ where: { worldId } });
  const record = async () => readFixedWorldEnrollment((await db.generationJob.findUniqueOrThrow({ where: { id: `job_${id}` } })).stepsJson)!;
  return { id, ownerId, childId, input, c, forbidden, worldId, ledger, record };
}
async function absent(id: string, ledgerExpected = false) {
  expect(await db.game.findUnique({ where: { id } })).toBeNull();
  expect(await db.gameScene.count({ where: { gameId: id } })).toBe(0);
  expect(await db.generationJob.count({ where: { gameId: id } })).toBe(0);
  expect(await db.worldBudgetLedger.count({ where: { worldId: `${id}:journey` } })).toBe(ledgerExpected ? 1 : 0);
}
const charge = (id: string, amountMicroUsd: number): WorldChargeEvidence => ({ providerNamespace: "synthetic-test", providerRequestId: id, usageId: `${id}-usage`, rawUsage: { imageTokens: 1 }, model: "gpt-image-2", amountMicroUsd, costBasis: "conservative-upper-estimate" });
type Work = (tx: Prisma.TransactionClient) => Promise<unknown>;
type Options = { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel };
function transactionWrapper(c: Container, wrap: (real: (fn: Work, options?: Options) => Promise<unknown>, fn: Work, options?: Options) => Promise<unknown>) {
  const real = db.$transaction.bind(db) as (fn: Work, options?: Options) => Promise<unknown>;
  c.db = new Proxy(db, { get(target, key, receiver) {
    if (key === "$transaction") return (fn: Work, options?: Options) => wrap(real, fn, options);
    return Reflect.get(target, key, receiver);
  } });
}

describe("fixed-world enrollment on real disposable SQLite", () => {
  it("atomically creates only intent, nine pinned empty scenes and an empty $5 ledger", async () => {
    const s = await setup();
    expect(await enrollFixedWorld(s.c, s.input, admin)).toEqual({ gameId: s.id, worldId: s.worldId, status: "QA_PENDING", reused: false });
    const game = await db.game.findUniqueOrThrow({ where: { id: s.id }, include: { scenes: { orderBy: { orderIndex: "asc" } }, jobs: true } });
    expect(game).toMatchObject({ ownerId: s.ownerId, childProfileId: s.childId, packageTier: "ONE_WORLD", sceneCount: 9, styleVersion: FIXED_WORLD_STYLE_VERSION, locale: "en", status: "QA_PENDING", configJson: null, paidAt: null, readyAt: null, deliveredAt: null, draftToken: null });
    expect(game.scenes.map(scene => [scene.sceneSlug, scene.sceneVersion, scene.orderIndex, scene.generationStatus, scene.configJson])).toEqual(s.input.plan.boards.map((b, i) => [b.slug, b.sceneVersion, i, "PENDING", null]));
    expect(game.jobs).toHaveLength(1); expect(game.jobs[0]).toMatchObject({ id: `job_${s.id}`, status: "DONE", attempts: 0, currentStep: null });
    const record = await s.record();
    expect(record).toMatchObject({ planSha256: s.input.planSha256, worldId: s.worldId, childAgeYears: 8, childDisplayName: "Fixture Child", identitySha256: s.input.plan.identitySha256, budgetCapMicroUsd: 5_000_000, originalPhoto: { id: `${s.id}-photo`, storagePath: `test/${s.id}-photo.png` } });
    expect(await s.ledger()).toMatchObject({ schemaVersion: 1, revision: 0, snapshotJson: JSON.stringify({ worldId: s.worldId, requests: [] }) });
    expect(await db.targetInstance.count({ where: { gameScene: { gameId: s.id } } })).toBe(0);
    expect(await db.order.count({ where: { gameId: s.id } })).toBe(0);
    expect(await db.shareLink.count({ where: { gameId: s.id } })).toBe(0);
    expect(await db.asset.count({ where: { ownerId: s.ownerId } })).toBe(3);
    expect(s.forbidden).not.toHaveBeenCalled();
  });
  it("supports a profile without an original photo and Hebrew locale", async () => {
    const s = await setup(false); s.input.locale = "he";
    await enrollFixedWorld(s.c, s.input, admin);
    expect(await s.record()).toMatchObject({ locale: "he", originalPhoto: null });
  });
  it.each(["settled", "pending", "unknown", "overrun"] as const)("exact retry preserves the complete %s ledger and revision", async state => {
    const s = await setup(); await enrollFixedWorld(s.c, s.input, admin);
    const budget = new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db)));
    await budget.reserve(s.worldId, { requestKey: "source-one", scope: "image", operationFingerprint: s.input.planSha256, reserveMicroUsd: 100_000 });
    if (state === "settled" || state === "overrun") await budget.settle(s.worldId, "source-one", charge(s.id, state === "overrun" ? 6_000_000 : 25_000));
    if (state === "unknown") await budget.markUnknown(s.worldId, "source-one", "Synthetic lost reply");
    const before = await s.ledger(), job = await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.id}` } });
    expect(await enrollFixedWorld(s.c, s.input, admin)).toMatchObject({ reused: true, status: "QA_PENDING" });
    expect(await s.ledger()).toEqual(before);
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: `job_${s.id}` } })).toEqual(job);
    expect(await db.auditLog.count({ where: { entityId: s.id, action: "fixed_world.enrolled" } })).toBe(1);
    expect(auditWorldBudget(JSON.parse(before.snapshotJson)).held).toBe(state === "unknown" || state === "overrun");
  });
  it.each([{ type: "SYSTEM" }, { type: "WEBHOOK" }, { type: "USER", id: admin.id }, { type: "ADMIN", id: "missing-user" }] as Actor[])("rejects unverified actor %j", async actor => {
    const s = await setup(); await expect(enrollFixedWorld(s.c, s.input, actor)).rejects.toMatchObject({ code: "permission" }); await absent(s.id);
  });
  it("checks the administrator email in the database, not an actor-supplied role alone", async () => {
    const s = await setup(); await expect(enrollFixedWorld(s.c, s.input, { type: "ADMIN", id: s.ownerId })).rejects.toMatchObject({ code: "permission" }); await absent(s.id);
  });
  it("rejects non-DB storage and non-QA execution before any write", async () => {
    const s = await setup(); s.c.storage = { id: "local" } as Container["storage"];
    await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "unsupported" }); await absent(s.id);
    s.c.storage = new DbStorage(db);
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("APP_ENV", "development");
    try { await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "unsupported" }); }
    finally { vi.unstubAllEnvs(); }
    await absent(s.id);
  });
  it.each([null, 1, 11])("rejects unknown/out-of-range age %s", async ageYears => {
    const s = await setup(); await db.childProfile.update({ where: { id: s.childId }, data: { ageYears } });
    await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "identity" }); await absent(s.id);
  });
  it.each([" Fixture Child ", "X", " "])("rejects noncanonical child name %j without normalizing the profile", async displayName => {
    const s = await setup(); await db.childProfile.update({ where: { id: s.childId }, data: { displayName } });
    await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "identity" }); await absent(s.id);
    expect((await db.childProfile.findUniqueOrThrow({ where: { id: s.childId } })).displayName).toBe(displayName);
  });
  it.each(["owner", "deleted", "identity-pointer", "avatar-pointer"] as const)("rejects unavailable child %s", async mutation => {
    const s = await setup();
    await db.childProfile.update({ where: { id: s.childId }, data: mutation === "owner" ? { ownerId: null } : mutation === "deleted" ? { deletedAt: new Date() } : mutation === "identity-pointer" ? { identityAssetId: null } : { avatarAssetId: null } });
    await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "identity" }); await absent(s.id);
  });
  it.each(["owner", "visibility", "type", "status", "deletedAt", "dimensions", "mime", "bytes", "corrupt", "truncated"] as const)("rejects invalid identity %s without partial enrollment", async mutation => {
    const s = await setup(), assetId = `${s.id}-identity`;
    if (mutation === "corrupt" || mutation === "truncated") {
      const bytes = mutation === "corrupt" ? Buffer.from("not a PNG") : png.subarray(0, Math.floor(png.length / 2));
      await db.fileBlob.update({ where: { key: `test/${assetId}.png` }, data: { data: new Uint8Array(bytes) } });
      await db.asset.update({ where: { id: assetId }, data: { bytes: bytes.length } });
    } else await db.asset.update({ where: { id: assetId }, data: ({ owner: { ownerId: admin.id }, visibility: { visibility: "GAME" }, type: { type: "AVATAR" }, status: { status: "FAILED" }, deletedAt: { deletedAt: new Date() }, dimensions: { width: 33 }, mime: { mimeType: "image/jpeg" }, bytes: { bytes: png.length + 1 } } as const)[mutation] });
    await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toThrow(); await absent(s.id);
  });
  it("checks original-photo ownership and distinct role paths too", async () => {
    const s = await setup(); await db.asset.update({ where: { id: `${s.id}-photo` }, data: { ownerId: admin.id } });
    await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "identity" }); await absent(s.id);
    await db.asset.update({ where: { id: `${s.id}-photo` }, data: { ownerId: s.ownerId, storagePath: `test/${s.id}-identity.png` } });
    await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "identity" }); await absent(s.id);
  });
  it.each(["identityAssetId", "avatarAssetId", "originalPhotoAssetId"] as const)("rejects a cross-role %s alias even from a deleted profile", async field => {
    const s = await setup(); await db.childProfile.create({ data: { id: `${s.id}-alias`, ownerId: s.ownerId, displayName: "Other Child", deletedAt: new Date(), [field]: `${s.id}-identity` } });
    await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "identity" }); await absent(s.id);
  });
  it("rejects a storage-path alias even from a deleted asset", async () => {
    const s = await setup(); await db.asset.create({ data: { id: `${s.id}-alias`, ownerId: s.ownerId, type: "AVATAR", storagePath: `test/${s.id}-avatar.png`, mimeType: "image/png", status: "DELETED", deletedAt: new Date() } });
    await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "identity" }); await absent(s.id);
  });
  it("rejects a live sibling but permits a genuinely deleted sibling with no shared profile pointers", async () => {
    const s = await setup(); await db.game.create({ data: { id: `${s.id}-legacy`, ownerId: s.ownerId, childProfileId: s.childId, status: "PAID" } });
    await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "identity" }); await absent(s.id);
    await db.game.update({ where: { id: `${s.id}-legacy` }, data: { status: "DELETED", deletedAt: new Date() } });
    await expect(enrollFixedWorld(s.c, s.input, admin)).resolves.toMatchObject({ reused: false });
  });
  it.each(["legacy", "deleted", "different-locale", "advanced"] as const)("never converts or resets an existing %s game", async state => {
    const s = await setup(); await enrollFixedWorld(s.c, s.input, admin); const budget = await s.ledger();
    await db.game.update({ where: { id: s.id }, data: state === "legacy" ? { styleVersion: "collage-v1" } : state === "deleted" ? { status: "DELETED", deletedAt: new Date() } : state === "different-locale" ? { locale: "he" } : { status: "MANUAL_REVIEW" } });
    await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "conflict" }); expect(await s.ledger()).toEqual(budget);
  });
  it("rejects changed plan, changed definitions and identity content", async () => {
    const s = await setup(); await enrollFixedWorld(s.c, s.input, admin); const before = await s.ledger();
    const changed = structuredClone(s.input); changed.plan.boards[0]!.appearances[0]!.copy.mission.en = "Another frozen intent"; changed.planSha256 = fixedWorldJsonSha256(changed.plan);
    await expect(enrollFixedWorld(s.c, changed, admin)).rejects.toMatchObject({ code: "conflict" });
    const definition = structuredClone(s.input); definition.scenes[0]!.version += 1;
    await expect(enrollFixedWorld(s.c, definition, admin)).rejects.toThrow();
    const another = await sharp({ create: { width: 32, height: 32, channels: 4, background: "red" } }).png().toBuffer();
    await db.fileBlob.update({ where: { key: `test/${s.id}-identity.png` }, data: { data: another } });
    await db.asset.update({ where: { id: `${s.id}-identity` }, data: { bytes: another.length } });
    await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "identity" }); expect(await s.ledger()).toEqual(before);
  });
  it.each(["job", "ledger", "scenes", "capsule", "active-job"] as const)("does not repair a partial or modified %s enrollment", async missing => {
    const s = await setup(); await enrollFixedWorld(s.c, s.input, admin);
    if (missing === "job") await db.generationJob.delete({ where: { id: `job_${s.id}` } });
    if (missing === "ledger") await db.worldBudgetLedger.delete({ where: { worldId: s.worldId } });
    if (missing === "scenes") await db.gameScene.deleteMany({ where: { gameId: s.id, orderIndex: 8 } });
    if (missing === "capsule") await db.generationJob.update({ where: { id: `job_${s.id}` }, data: { stepsJson: "{}" } });
    if (missing === "active-job") await db.generationJob.update({ where: { id: `job_${s.id}` }, data: { status: "RUNNING" } });
    await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toThrow();
    if (missing === "ledger") expect(await db.worldBudgetLedger.findUnique({ where: { worldId: s.worldId } })).toBeNull();
  });
  it("will not adopt an orphan allowance, even an empty one", async () => {
    const s = await setup(); await db.worldBudgetLedger.create({ data: { worldId: s.worldId, snapshotJson: JSON.stringify({ worldId: s.worldId, requests: [] }) } });
    const before = await s.ledger(); await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "budget" });
    await absent(s.id, true); expect(await s.ledger()).toEqual(before);
  });
  it("rejects malformed budget metadata rather than substituting an empty allowance", async () => {
    const s = await setup(); await enrollFixedWorld(s.c, s.input, admin); await db.worldBudgetLedger.update({ where: { worldId: s.worldId }, data: { snapshotJson: "{}" } });
    await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toThrow(); expect((await s.ledger()).snapshotJson).toBe("{}");
  });
  it("rolls back every creation when the final audit write fails", async () => {
    const s = await setup();
    transactionWrapper(s.c, (real, fn, options) => real(tx => fn(new Proxy(tx, { get(target, key, receiver) {
      if (key === "auditLog") return { create: () => { throw new Error("synthetic final audit failure"); } };
      return Reflect.get(target, key, receiver);
    } })), options));
    await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toThrow("synthetic final audit failure"); await absent(s.id);
    expect(await db.asset.count({ where: { ownerId: s.ownerId, status: "READY" } })).toBe(3);
  });
  it("reconciles lost COMMIT acknowledgement with the same game ID, without cleanup or reset", async () => {
    const s = await setup(); transactionWrapper(s.c, async (real, fn, options) => { await real(fn, options); throw new Error("synthetic commit acknowledgement lost"); });
    await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toThrow("synthetic commit acknowledgement lost");
    const before = await s.ledger(); s.c.db = db;
    await expect(enrollFixedWorld(s.c, s.input, admin)).resolves.toMatchObject({ reused: true });
    expect(await s.ledger()).toEqual(before); expect(await db.gameScene.count({ where: { gameId: s.id } })).toBe(9);
  });
  it("checks fresh profile/alias state inside the transaction", async () => {
    const s = await setup(); transactionWrapper(s.c, async (real, fn, options) => {
      await db.childProfile.create({ data: { id: `${s.id}-racing-alias`, ownerId: s.ownerId, displayName: "Another child", originalPhotoAssetId: `${s.id}-avatar` } });
      return real(fn, options);
    });
    await expect(enrollFixedWorld(s.c, s.input, admin)).rejects.toMatchObject({ code: "identity" }); await absent(s.id);
  });
  it("two independent concurrent IDs cannot both claim the same child", async () => {
    const s = await setup(), secondId = `${s.id}-second`;
    const secondDb = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
    try {
      const result = await Promise.allSettled([enrollFixedWorld(s.c, s.input, admin), enrollFixedWorld({ ...s.c, db: secondDb }, { ...s.input, gameId: secondId }, admin)]);
      expect(result.filter(item => item.status === "fulfilled")).toHaveLength(1);
      const games = await db.game.findMany({ where: { childProfileId: s.childId } }); expect(games).toHaveLength(1);
      expect(await db.gameScene.count({ where: { gameId: games[0]!.id } })).toBe(9);
      expect(await db.worldBudgetLedger.count({ where: { worldId: { in: [s.worldId, `${secondId}:journey`] } } })).toBe(1);
    } finally { await secondDb.$disconnect(); }
  }, 30_000);
});
