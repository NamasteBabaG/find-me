import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyTestSchema } from "../../lib/test-schema";
import { GameConfigSchema } from "../../domain/game/config";
import type { Container } from "../container";
import { ensurePlayerLink, resolvePlayToken, rotatePlayerLink, tokenForLink } from "../share-link.service";
import { fixedWorldConfigSha256, fixedWorldStageRecordSchema, FIXED_WORLD_STYLE_VERSION } from "../generation/fixed-world-stage-record";
import { hashToken, newId } from "../../lib/ids";

// Real disposable SQLite, synthetic configs/capsules only. These fixtures are
// NOT actual publication, child images, semantic receipts or browser evidence.
let scratch: string, db: PrismaClient, otherDb: PrismaClient;
let sequence = 0;
const timestamp = new Date("2026-09-08T12:00:00.000Z"), digest = "a".repeat(64);
beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-fixed-links-"));
  const url = `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}`;
  db = new PrismaClient({ datasources: { db: { url } } });
  otherDb = new PrismaClient({ datasources: { db: { url } } });
  await applyTestSchema(db);
  await db.user.create({ data: { id: "fixed-link-owner", email: "fixed-link-owner@example.invalid" } });
}, 30_000);
afterAll(async () => {
  await Promise.all([db?.$disconnect(), otherDb?.$disconnect()]);
  if (scratch && path.dirname(scratch) === realpathSync(tmpdir()) && path.basename(scratch).startsWith("findme-fixed-links-")) rmSync(scratch, { recursive: true, force: true });
});

async function setup(styleVersion = FIXED_WORLD_STYLE_VERSION, status = "READY") {
  const id = `fixed-link-test-${++sequence}`, childId = `${id}-child`, ownerId = "fixed-link-owner";
  const slot = { id: "slot", x: 0.5, y: 0.5, scale: 0.1, hintZone: { x: 0.5, y: 0.5, r: 0.1 }, hintText: "Synthetic hint" };
  const config = GameConfigSchema.parse({ version: 1, gameId: id, locale: "en", child: { name: "Synthetic Child", avatarUrl: "/api/assets/avatar" },
    styleVersion: FIXED_WORLD_STYLE_VERSION, packageTier: "ONE_WORLD", composedAt: timestamp.toISOString(),
    scenes: Array.from({ length: 9 }, (_, n) => ({ slug: `synthetic-${n}`, version: 1, name: "Synthetic", tagline: "Synthetic", artStatus: "final",
      art: { width: 320, height: 320, base: "/synthetic.png", thumbnail: "/synthetic.png", palette: { sky: "#fff", ground: "#fff", accent: "#fff" } },
      targets: Array.from({ length: 3 }, (_, t) => ({ id: `target-${t}`, targetType: "synthetic", difficulty: 1, mission: "Synthetic", item: "Synthetic", success: ["Synthetic"], animation: "peek", slots: [slot, slot], sprite: { kind: "image", url: "/synthetic.png", width: 10, height: 10 } })),
      ambient: [], celebration: { kind: "stars", completeText: "Synthetic" }, collectible: { id: "synthetic", name: "Synthetic", icon: "star" },
    })),
  });
  const roles = [...Array<string>(27).fill("sprite"), ...Array<string>(27).fill("context"), ...Array<string>(27).fill("mask"), ...Array<string>(9).fill("board"), "source", "provenance"];
  const record = fixedWorldStageRecordSchema.parse({ version: "fixed-world-stage/v1", status: "done", state: "staged", startedAt: timestamp.toISOString(), finishedAt: timestamp.toISOString(),
    gameId: id, ownerId, childProfileId: childId, childAgeYears: 6, worldId: `${id}:synthetic`, planSha256: digest, budgetSnapshotSha256: digest,
    configSha256: fixedWorldConfigSha256(config), identityAssetId: `${id}-identity`, identitySha256: digest, avatarAssetId: `${id}-avatar`, avatarSha256: digest,
    scenes: config.scenes.map(scene => ({ slug: scene.slug, sceneVersion: 1, configSha256: digest })),
    assets: roles.map((role, n) => ({ id: `ast_fixed_${n.toString(16).padStart(64, "0")}`, role, visibility: role === "sprite" || role === "board" ? "GAME" : "PRIVATE", mimeType: role === "provenance" ? "application/json" : "image/png", encodedSha256: digest,
      width: role === "provenance" ? null : 10, height: role === "provenance" ? null : 10, ...(role === "provenance" ? {} : { rgbaSha256: digest }) })),
  });
  await db.childProfile.create({ data: { id: childId, ownerId, displayName: config.child.name, ageYears: 6 } });
  await db.game.create({ data: { id, ownerId, childProfileId: childId, styleVersion, status, configJson: JSON.stringify(config), packageTier: "ONE_WORLD", sceneCount: 9, locale: "en", updatedAt: timestamp } });
  await db.generationJob.create({ data: { id: `job_${id}`, gameId: id, status: "DONE", stepsJson: JSON.stringify({ fixedWorld: record }) } });
  const c = { db, secret: "synthetic-signing-secret", appUrl: "https://example.invalid" } as unknown as Container;
  return { id, c, record, config, actor: { type: "USER" as const, id: ownerId } };
}
type Setup = Awaited<ReturnType<typeof setup>>;
const operations = [
  ["ensure", (s: Setup) => ensurePlayerLink(s.c, s.id)],
  ["rotate", (s: Setup) => rotatePlayerLink(s.c, s.id, s.actor)],
] as const;
async function seedLink(s: Setup) {
  const link = { id: newId("shr"), createdAt: timestamp };
  const token = tokenForLink(s.c, link);
  await db.shareLink.create({ data: { ...link, gameId: s.id, tokenHash: hashToken(token) } });
  return { ...link, token };
}
async function unchanged(s: Setup, originalLinkId: string, updatedAt: Date) {
  expect(await db.shareLink.findMany({ where: { gameId: s.id }, select: { id: true, active: true, revokedAt: true } })).toEqual([{ id: originalLinkId, active: true, revokedAt: null }]);
  expect(await db.auditLog.count({ where: { entityId: s.id, action: "share-link:rotated" } })).toBe(0);
  expect((await db.game.findUniqueOrThrow({ where: { id: s.id } })).updatedAt).toEqual(updatedAt);
}
/** Test-only interception around real SQLite transactions; never production IO. */
function wrapTx(s: Setup, work: (tx: Prisma.TransactionClient) => Prisma.TransactionClient) {
  s.c = { ...s.c, db: new Proxy(db, { get(target, key) {
    if (key === "$transaction") return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { maxWait: number; timeout: number }) => target.$transaction(tx => callback(work(tx)), options);
    return Reflect.get(target, key);
  } }) };
}

describe("fixed pre-play link guard on disposable SQLite", () => {
  it.each(operations)("%s fails before writes when no game exists", async (_name, operation) => {
    const s = await setup();
    s.id = `${s.id}-missing`;
    await expect(operation(s)).rejects.toMatchObject({ code: "permission" });
    expect(await db.shareLink.count({ where: { gameId: s.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: s.id } })).toBe(0);
  });
  for (const [name, operation] of operations) {
    it.each(["QA_PENDING", "MANUAL_REVIEW", "DRAFT", "PAID", "APPROVED", "NEEDS_NEW_PHOTO", "DELETED"])(`${name} blocks %s without issuing or revoking even an existing link`, async status => {
      const s = await setup(FIXED_WORLD_STYLE_VERSION, status), before = await seedLink(s);
      await expect(operation(s)).rejects.toMatchObject({ code: "permission" });
      await unchanged(s, before.id, timestamp);
    });
    it.each(["deleted", "unknown-version"])(`${name} blocks %s fixed games`, async kind => {
      const s = await setup(kind === "unknown-version" ? "fixed-sprite-v999" : FIXED_WORLD_STYLE_VERSION), before = await seedLink(s);
      if (kind === "deleted") await db.game.update({ where: { id: s.id }, data: { deletedAt: timestamp, updatedAt: timestamp } });
      await expect(operation(s)).rejects.toMatchObject({ code: kind === "deleted" ? "permission" : "unsupported" });
      await unchanged(s, before.id, timestamp);
    });
    it.each(["null-config", "malformed-config", "empty-config", "changed-config", "no-job", "running-job", "enrollment-only", "malformed-stage", "deleted-stage", "foreign-owner", "foreign-child", "foreign-game"])(`${name} rejects missing or changed proof: %s`, async kind => {
      const s = await setup(), before = await seedLink(s);
      if (kind === "null-config" || kind === "malformed-config" || kind === "empty-config" || kind === "changed-config") {
        const configJson = kind === "null-config" ? null : kind === "malformed-config" ? "{" : kind === "empty-config" ? "{}" : JSON.stringify({ ...s.config, child: { ...s.config.child, name: "Different Child" } });
        await db.game.update({ where: { id: s.id }, data: { configJson, updatedAt: timestamp } });
      } else if (kind === "no-job") await db.generationJob.delete({ where: { id: `job_${s.id}` } });
      else if (kind === "running-job") await db.generationJob.update({ where: { id: `job_${s.id}` }, data: { status: "RUNNING" } });
      else {
        const stage = { ...s.record, ...(kind === "deleted-stage" ? { state: "deleted" } : {}), ...(kind === "foreign-owner" ? { ownerId: "foreign-owner" } : {}), ...(kind === "foreign-child" ? { childProfileId: "foreign-child" } : {}), ...(kind === "foreign-game" ? { gameId: "foreign-game" } : {}) };
        const stepsJson = kind === "enrollment-only" ? '{"fixedEnrollment":{"state":"enrolled"}}' : kind === "malformed-stage" ? '{"fixedWorld":{}}' : JSON.stringify({ fixedWorld: stage });
        await db.generationJob.update({ where: { id: `job_${s.id}` }, data: { stepsJson } });
      }
      await expect(operation(s)).rejects.toThrow();
      await unchanged(s, before.id, timestamp);
    });
  }

  it.each(["READY", "DELIVERED"])("ensures one stable link for published %s with a valid staged config", async status => {
    const s = await setup(FIXED_WORLD_STYLE_VERSION, status);
    const first = await ensurePlayerLink(s.c, s.id), second = await ensurePlayerLink(s.c, s.id);
    expect(first).toEqual(second);
    expect(await db.shareLink.count({ where: { gameId: s.id } })).toBe(1);
    expect(await resolvePlayToken(s.c, first.token)).toMatchObject({ ok: true, game: { id: s.id } });
  });
  it("rotates, revokes and records audit atomically after qualification", async () => {
    const s = await setup(), before = await seedLink(s);
    const result = await rotatePlayerLink(s.c, s.id, s.actor);
    const rows = await db.shareLink.findMany({ where: { gameId: s.id } });
    expect(rows).toHaveLength(2); expect(rows.find(row => row.id === before.id)?.active).toBe(false);
    expect(rows.filter(row => row.active)).toHaveLength(1);
    expect(result.url).not.toContain(before.token);
    expect(await db.auditLog.findMany({ where: { entityId: s.id } })).toMatchObject([{ actorType: "USER", actorId: s.actor.id, action: "share-link:rotated" }]);
    expect(await resolvePlayToken(s.c, before.token)).toMatchObject({ ok: false, reason: "revoked" });
  });
  it("permits editable gift and refreshed asset signature queries without changing qualification", async () => {
    const s = await setup();
    await db.game.update({ where: { id: s.id }, data: { configJson: JSON.stringify({ ...s.config, child: { ...s.config.child, avatarUrl: "/api/assets/avatar?sig=fresh&exp=123" }, gift: { message: "Hello" } }) } });
    await expect(ensurePlayerLink(s.c, s.id)).resolves.toHaveProperty("token");
  });
  it("always advances the Game fence even when its prior timestamp is in the future", async () => {
    const s = await setup(), future = new Date(Date.now() + 60_000);
    await db.game.update({ where: { id: s.id }, data: { updatedAt: future } });
    await ensurePlayerLink(s.c, s.id);
    expect((await db.game.findUniqueOrThrow({ where: { id: s.id } })).updatedAt.getTime()).toBe(future.getTime() + 1);
  });
  it("rolls back revocation, new link and Game fence when audit insertion fails", async () => {
    const s = await setup(), before = await seedLink(s);
    wrapTx(s, tx => new Proxy(tx, { get(target, key) {
      if (key === "auditLog") return { ...target.auditLog, create: async () => { throw new Error("synthetic audit failure"); } };
      return Reflect.get(target, key);
    } }));
    await expect(rotatePlayerLink(s.c, s.id, s.actor)).rejects.toThrow("synthetic audit failure");
    await unchanged(s, before.id, timestamp);
  });
  it.each(operations)("%s loses a simulated concurrent-deletion CAS before touching links", async (_name, operation) => {
    const s = await setup(), before = await seedLink(s);
    // Controlled lost-CAS witness inside an actual rollback-capable SQLite tx.
    // The separate real-deletion interleavings below verify persisted behavior.
    wrapTx(s, tx => new Proxy(tx, { get(target, key) {
      if (key === "game") return { ...target.game, updateMany: async () => ({ count: 0 }) };
      return Reflect.get(target, key);
    } }));
    await expect(operation(s)).rejects.toMatchObject({ code: "conflict" });
    await unchanged(s, before.id, timestamp);
  });
  it.each(operations)("%s rechecks a deletion committed by an independent client after routing read", async (_name, operation) => {
    const s = await setup(), before = await seedLink(s);
    s.c = { ...s.c, db: new Proxy(db, { get(target, key) {
      if (key === "$transaction") return async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options: { maxWait: number; timeout: number }) => {
        await otherDb.$transaction(async tx => {
          await tx.game.update({ where: { id: s.id }, data: { status: "DELETED", deletedAt: new Date(), configJson: null } });
          await tx.shareLink.updateMany({ where: { gameId: s.id }, data: { active: false } });
        });
        return target.$transaction(callback, options);
      };
      return Reflect.get(target, key);
    } }) };
    await expect(operation(s)).rejects.toMatchObject({ code: "permission" });
    expect(await db.shareLink.count({ where: { gameId: s.id } })).toBe(1);
    expect(await db.shareLink.findUnique({ where: { id: before.id } })).toMatchObject({ active: false });
    expect(await db.auditLog.count({ where: { entityId: s.id } })).toBe(0);
  });
  it("a link committed first is revoked by a later independent deletion using the same Game fence", async () => {
    const s = await setup(), link = await ensurePlayerLink(s.c, s.id);
    await otherDb.$transaction(async tx => {
      const game = await tx.game.findUniqueOrThrow({ where: { id: s.id } });
      const claim = await tx.game.updateMany({ where: { id: s.id, updatedAt: game.updatedAt, deletedAt: null, status: game.status }, data: { status: "DELETED", deletedAt: new Date(), configJson: null } });
      expect(claim.count).toBe(1);
      await tx.shareLink.updateMany({ where: { gameId: s.id, active: true }, data: { active: false, revokedAt: new Date() } });
    });
    expect(await db.shareLink.count({ where: { gameId: s.id, active: true } })).toBe(0);
    expect(await resolvePlayToken(s.c, link.token)).toMatchObject({ ok: false, reason: "revoked" });
    await expect(ensurePlayerLink(s.c, s.id)).rejects.toMatchObject({ code: "permission" });
  });
  it("preserves legacy draft linking/rotation without requiring staged proof or config", async () => {
    const s = await setup("collage-v1", "DRAFT");
    await db.game.update({ where: { id: s.id }, data: { configJson: null } });
    await db.generationJob.delete({ where: { id: `job_${s.id}` } });
    const first = await ensurePlayerLink(s.c, s.id), repeated = await ensurePlayerLink(s.c, s.id);
    expect(repeated).toEqual(first);
    const rotated = await rotatePlayerLink(s.c, s.id, s.actor);
    expect(rotated.url).not.toEqual(first.url);
    expect(await db.shareLink.count({ where: { gameId: s.id, active: true } })).toBe(1);
    expect(await resolvePlayToken(s.c, first.token)).toMatchObject({ ok: false, reason: "revoked" });
  });
});
