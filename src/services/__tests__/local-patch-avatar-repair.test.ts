import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../lib/test-schema";
import { DbStorage } from "../../infra/storage/db";
import { MockPaymentProvider } from "../../infra/payment/mock";
import { MockAvatarProvider, NoopFaceDetector } from "../../infra/generation/mock";
import { NoPatchJudge } from "../../infra/generation/judge";
import { NoopAnalytics } from "../../infra/analytics/console";
import { InlineJobRunner } from "../../infra/jobs/inline";
import { avatarDisplayFromSheet } from "../../infra/generation/avatar-cut";
import type { Container } from "../container";
import { recutAvatar } from "../admin.service";

let dir: string, db: PrismaClient, c: Container, sequence = 0;
const actor = { type: "ADMIN", id: "synthetic-admin" } as const;
beforeAll(async () => {
  dir = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-avatar-repair-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(dir, "repair.sqlite").split(path.sep).join("/")}` } } });
  await applyTestSchema(db);
  c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", secret: "synthetic-avatar-repair",
    payment: new MockPaymentProvider("http://localhost:3000", "synthetic"), avatars: new MockAvatarProvider(),
    judge: new NoPatchJudge(), faces: new NoopFaceDetector(), analytics: new NoopAnalytics(), jobs: new InlineJobRunner(),
    email: { id: "console", send: async () => ({ id: "unused-synthetic-mail" }) } };
}, 180000);
afterAll(async () => {
  await db.$disconnect();
  if (path.dirname(dir) === realpathSync(tmpdir()) && path.basename(dir).startsWith("findme-avatar-repair-")) rmSync(dir, { recursive: true, force: true });
});

async function fixture(styleVersion = "local-patch-world-v1") {
  const id = `repair-${++sequence}`, ownerId = `owner-${id}`, childId = `child-${id}`, sheetId = `sheet-${id}`, avatarId = `avatar-${id}`;
  const sheet = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#276d8c" } }).png().toBuffer();
  const old = await sharp({ create: { width: 256, height: 256, channels: 4, background: "#fff" } }).png().toBuffer();
  await db.user.create({ data: { id: ownerId, email: `${id}@example.invalid` } });
  await c.storage.put(`private/${sheetId}.png`, sheet, "image/png");
  await c.storage.put(`game/${avatarId}.png`, old, "image/png");
  await db.asset.create({ data: { id: sheetId, ownerId, type: "IDENTITY_SHEET", visibility: "PRIVATE", status: "READY",
    storagePath: `private/${sheetId}.png`, mimeType: "image/png", width: 1024, height: 1024, bytes: sheet.length } });
  await db.asset.create({ data: { id: avatarId, ownerId, type: "AVATAR", visibility: "GAME", status: "READY",
    storagePath: `game/${avatarId}.png`, mimeType: "image/png", width: 256, height: 256, bytes: old.length } });
  await db.childProfile.create({ data: { id: childId, ownerId, displayName: "Synthetic Child", ageYears: 6, identityAssetId: sheetId, avatarAssetId: avatarId } });
  const configJson = JSON.stringify({ child: { avatarUrl: `/api/assets/${avatarId}?e=123&s=old` }, scenes: [{ version: 6, targets: [{ unchanged: true }] }] });
  await db.game.create({ data: { id, ownerId, childProfileId: childId, styleVersion, status: "DELIVERED", configJson } });
  return { id, ownerId, childId, sheetId, avatarId, sheet, configJson };
}

describe("local-patch full-face display repair: real storage and typed database rows", () => {
  it("repairs a delivered version6 game's display and siblings without changing identity, boards, approvals or buying anything", async () => {
    const f = await fixture();
    await db.game.create({ data: { id: `${f.id}-sibling`, ownerId: f.ownerId, childProfileId: f.childId,
      styleVersion: "collage-v1", status: "READY", configJson: f.configJson } });
    await db.auditLog.create({ data: { id: `identity-proof-${f.id}`, action: "board-wizard:identity-style-reviewed", actorType: "SYSTEM",
      entityType: "Asset", entityId: f.sheetId, metaJson: JSON.stringify({ immutableHistoricalProof: true }) } });
    const sourceRow = await db.asset.findUniqueOrThrow({ where: { id: f.sheetId } });
    const previousPainter = c.avatars.createCharacter;
    const buy = vi.fn(async () => { throw new Error("Display repair must not render an identity"); });
    c.avatars.createCharacter = buy;
    const mail = vi.spyOn(c.email, "send"), queue = vi.spyOn(c.jobs, "enqueue");
    expect(await recutAvatar(c, f.id, actor)).toEqual({ ok: true });
    const child = await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } });
    expect(child.identityAssetId).toBe(f.sheetId); expect(child.avatarAssetId).not.toBe(f.avatarId);
    const display = await db.asset.findUniqueOrThrow({ where: { id: child.avatarAssetId! } });
    expect(display).toMatchObject({ ownerId: f.ownerId, type: "AVATAR", visibility: "GAME", width: 512, height: 512, costCents: 0 });
    expect(await c.storage.get(display.storagePath)).toEqual(await avatarDisplayFromSheet(f.sheet, 1024));
    expect(await c.storage.get(sourceRow.storagePath)).toEqual(f.sheet);
    expect(await db.asset.findUniqueOrThrow({ where: { id: f.sheetId } })).toEqual(sourceRow);
    const games = await db.game.findMany({ where: { childProfileId: f.childId } });
    expect(games.every(game => game.configJson === f.configJson.replaceAll(`/api/assets/${f.avatarId}`, `/api/assets/${display.id}`))).toBe(true);
    expect(games.find(game => game.id === f.id)?.status).toBe("DELIVERED");
    expect(await db.asset.findUniqueOrThrow({ where: { id: f.avatarId } })).toMatchObject({ status: "DELETED" });
    expect((await db.auditLog.findUniqueOrThrow({ where: { id: `identity-proof-${f.id}` } })).metaJson).toBe('{"immutableHistoricalProof":true}');
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "avatar:recut", entityId: f.childId } });
    expect(JSON.parse(log.metaJson!)).toMatchObject({ displayVersion: "full-portrait-quadrant/v1", identityAssetId: f.sheetId });
    expect(buy).not.toHaveBeenCalled(); expect(mail).not.toHaveBeenCalled(); expect(queue).not.toHaveBeenCalled();
    c.avatars.createCharacter = previousPainter; mail.mockRestore(); queue.mockRestore();
  });

  it.each([
    { label: "foreign identity", data: { ownerId: null } },
    { label: "original photo instead of sheet", data: { type: "ORIGINAL_PHOTO" } },
    { label: "public identity", data: { visibility: "GAME" } },
    { label: "deleted identity", data: { deletedAt: new Date("2026-09-01") } },
  ] satisfies Array<{ label: string; data: Prisma.AssetUncheckedUpdateInput }>)("refuses $label before storing a display asset", async ({ data }) => {
    const f = await fixture(); await db.asset.update({ where: { id: f.sheetId }, data });
    const count = await db.asset.count();
    await expect(recutAvatar(c, f.id, actor)).rejects.toMatchObject({ code: "conflict" });
    expect(await db.asset.count()).toBe(count);
    expect((await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } })).avatarAssetId).toBe(f.avatarId);
  });

  it("does not expose a failed sheet or delete a foreign previous avatar", async () => {
    const f = await fixture(); await db.asset.update({ where: { id: f.sheetId }, data: { status: "FAILED" } });
    expect(await recutAvatar(c, f.id, actor)).toEqual({ ok: false, code: "NO_SHEET" });
    await db.asset.update({ where: { id: f.sheetId }, data: { status: "READY" } });
    await db.asset.update({ where: { id: f.avatarId }, data: { ownerId: null } });
    await expect(recutAvatar(c, f.id, actor)).rejects.toMatchObject({ code: "conflict" });
    expect((await db.asset.findUniqueOrThrow({ where: { id: f.avatarId } })).status).toBe("READY");
  });

  it.each(["fixed-sprite-board-wizard-v1", "fixed-sprite-v999"])("still refuses old fixed style %s before any write", async style => {
    const f = await fixture(style), count = await db.asset.count();
    await expect(recutAvatar(c, f.id, actor)).rejects.toMatchObject({ code: "unsupported" });
    expect(await db.asset.count()).toBe(count);
  });

  it.each(["age", "source", "identity"])("keeps the shared fixed-world fence and cleans only the unattached derivative after a concurrent %s change", async change => {
    const f = await fixture(), shared = `${f.id}-fixed`;
    await db.game.create({ data: { id: shared, ownerId: f.ownerId, childProfileId: f.childId, styleVersion: "fixed-sprite-v999" } });
    await expect(recutAvatar(c, f.id, actor)).rejects.toMatchObject({ code: "unsupported" });
    await db.game.delete({ where: { id: shared } });
    const store = c.storage;
    const racing: Container = { ...c, storage: { ...store, id: store.id,
      get: key => store.get(key), delete: key => store.delete(key), exists: key => store.exists(key),
      put: async (key, bytes, mime) => {
        await store.put(key, bytes, mime);
        if (change === "source") await db.asset.update({ where: { id: f.sheetId }, data: { status: "FAILED" } });
        else await db.childProfile.update({ where: { id: f.childId }, data: change === "identity" ? { identityAssetId: null } : { ageYears: 7 } });
      },
    } };
    await expect(recutAvatar(racing, f.id, actor)).rejects.toMatchObject({ code: "conflict" });
    expect((await db.childProfile.findUniqueOrThrow({ where: { id: f.childId } })).avatarAssetId).toBe(f.avatarId);
    const avatars = await db.asset.findMany({ where: { ownerId: f.ownerId, type: "AVATAR" } });
    expect(avatars.find(asset => asset.id === f.avatarId)?.status).toBe("READY");
    expect(avatars.find(asset => asset.id !== f.avatarId)?.status).toBe("DELETED");
  });
});
