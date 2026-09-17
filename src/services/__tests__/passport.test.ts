import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { applyTestSchema } from "@/lib/test-schema";
import { newId } from "@/lib/ids";
import { publicBeachDemo } from "../../../content/demo/beach-v1";
import { emptyAdventureProgress, recordAdventureEvent } from "@/domain/adventure/progress";
import { ownerPassport, updatePassportPage } from "../passport.service";
import { managePassportShare, passportSharePreview, sharedPassport, sharedPassportMedia } from "../passport-share.service";
import { ownerPassportMedia } from "../passport-media.service";
import { LocalDiskStorage } from "@/infra/storage/local";

let scratch: string, db: PrismaClient, storage: LocalDiskStorage;
const owner = "passport-owner", secret = "passport-test-purpose-secret-only";
const container = () => ({ db, storage, secret, appUrl: "http://localhost:3022" });
beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "findme-passport-test-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  storage = new LocalDiskStorage(path.join(scratch, "storage"));
  await applyTestSchema(db);
  await db.user.createMany({ data: [{ id: owner, email: "passport@example.invalid" }, { id: "other-parent", email: "passport-other@example.invalid" }] });
}, 30_000);
afterAll(async () => { await db?.$disconnect(); if (scratch && path.dirname(scratch) === tmpdir() && path.basename(scratch).startsWith("findme-passport-test-")) await rm(scratch, { recursive: true, force: true }); });

async function seed(finds = 3, itemCount = 2) {
  const config = publicBeachDemo("en"); config.gameId = newId("game");
  const child = await db.familyChild.create({ data: { id: newId("fam"), ownerId: owner, displayName: "Private first name" } });
  const book = config.adventure!, board = book.boards[0]!;
  book.avatarAssetId = newId("ast");
  const avatar = await readFile(path.join(process.cwd(), "public", config.child.avatarUrl));
  config.child.avatarUrl = `/api/assets/${book.avatarAssetId}`;
  await storage.put(`${book.avatarAssetId}.png`, avatar);
  await db.asset.create({ data: { id: book.avatarAssetId, ownerId: owner, type: "AVATAR", visibility: "GAME", status: "READY", storagePath: `${book.avatarAssetId}.png`, mimeType: "image/png" } });
  for (const binding of board.targetImages) {
    const target = config.scenes[0]!.targets.find(t => t.id === binding.targetId)!;
    const sprite = target.spriteByVariant?.A ?? target.sprite;
    if (sprite.kind !== "image") throw new Error("fixture-image");
    const bytes = await readFile(path.join(process.cwd(), "public", sprite.url));
    const id = newId("ast"); binding.A.assetId = id; binding.B.assetId = id;
    target.sprite = { ...sprite, url: `/api/assets/${id}` };
    target.spriteByVariant = { A: target.sprite, B: target.sprite };
    await storage.put(`${id}.png`, bytes);
    await db.asset.create({ data: { id, ownerId: owner, type: "TARGET_SPRITE", visibility: "GAME", status: "READY", storagePath: `${id}.png`, mimeType: "image/png" } });
  }
  let progress = emptyAdventureProgress(config.gameId, book);
  for (const targetId of board.targetIds.slice(0, finds)) progress = recordAdventureEvent(progress, config.gameId, book, { kind: "target-found", boardSlug: board.boardSlug, targetId, variant: "A" }).progress;
  for (const item of board.discoveries.slice(0, itemCount)) progress = recordAdventureEvent(progress, config.gameId, book, { kind: "discovery-found", boardSlug: board.boardSlug, discoveryId: item.id }).progress;
  await db.game.create({ data: { id: config.gameId, ownerId: owner, familyChildId: child.id, status: "READY", configJson: JSON.stringify(config), adventureAlbum: { create: { revision: 1, snapshotJson: JSON.stringify(progress) } } } });
  await db.order.create({ data: { id: newId("ord"), gameId: config.gameId, userId: owner, amountAgorot: 1, packageTier: "ONE_WORLD", provider: "mock", paymentStatus: "PAID" } });
  return { child, config, board };
}

describe("passport authorization, preferences and live revocable sharing", () => {
  it("rejects an invalid persisted progress revision rather than inventing achievements", async () => {
    const f = await seed();
    await db.adventureAlbumProgress.update({ where: { gameId: f.config.gameId }, data: { revision: 0 } });
    await expect(ownerPassport(db, owner, f.child.id)).rejects.toThrow("passport-progress-unavailable");
  });
  it("does not stamp two finds and does not expose hidden discovery details", async () => {
    const f = await seed(2, 6), book = await ownerPassport(db, owner, f.child.id);
    expect(book.worlds[0]!.pages[0]).toMatchObject({ state: "in-progress", finds: 2 });
    expect(book.worlds[0]!.pages[0]!.photoUrl).toBeUndefined();
    await expect(updatePassportPage(db, owner, f.child.id, f.config.gameId, f.board.boardSlug, { kind: "photo", targetId: f.board.targetIds[0] })).rejects.toThrow();
  });
  it("isolates sibling choices, persists selection and acknowledges only earned rewards", async () => {
    const a = await seed(), b = await seed();
    await updatePassportPage(db, owner, a.child.id, a.config.gameId, a.board.boardSlug, { kind: "photo", targetId: a.board.targetIds[0] });
    const page = (await ownerPassport(db, owner, a.child.id)).worlds[0]!.pages[0]!;
    expect(page.photoChoices?.filter(p => p.selected).map(p => p.id)).toEqual([a.board.targetIds[0]]);
    expect((await ownerPassport(db, owner, b.child.id)).worlds[0]!.pages[0]!.photoChoices?.find(p => p.selected)?.id).toBe(b.board.targetIds[2]);
    await expect(updatePassportPage(db, owner, b.child.id, a.config.gameId, a.board.boardSlug, { kind: "photo", targetId: a.board.targetIds[0] })).rejects.toThrow();
    await expect(updatePassportPage(db, owner, a.child.id, a.config.gameId, a.board.boardSlug, { kind: "seen", stamp: true, discoveryIds: [a.board.discoveries[5]!.id] })).rejects.toThrow();
    const choice = { kind: "seen", stamp: true, discoveryIds: a.board.discoveries.slice(0, 2).map(d => d.id) };
    expect(await updatePassportPage(db, owner, a.child.id, a.config.gameId, a.board.boardSlug, choice)).toEqual({ stamp: false, discoveryIds: [] });
    expect(await updatePassportPage(db, owner, a.child.id, a.config.gameId, a.board.boardSlug, choice)).toEqual({ stamp: false, discoveryIds: [] });
  });
  it("has no sharing until an owner explicitly enables; rejects players and other owners", async () => {
    const f = await seed();
    expect(await managePassportShare(container(), owner, f.child.id, "status", "Explorer")).toEqual({ active: false, url: null });
    for (const actor of ["", "other-parent", "shr_player"]) {
      await expect(ownerPassport(db, actor, f.child.id)).rejects.toThrow();
      await expect(managePassportShare(container(), actor, f.child.id, "enable", "Explorer")).rejects.toThrow();
    }
  });
  it("shares an allowlisted alias, selected photo and found items, not a play bundle", async () => {
    const f = await seed(), share = await managePassportShare(container(), owner, f.child.id, "enable", "Explorer");
    const token = new URL(share.url!).hash.slice(1), book = await sharedPassport(container(), token), text = JSON.stringify(book);
    expect(book.name).toBe("Explorer"); expect(book.worlds[0]!.pages[0]!.photoChoices).toBeUndefined();
    for (const privateValue of [f.child.displayName, f.child.id, f.config.gameId, "targetImages", "hitRect", "cardCrop", "originalPhoto", "playHref", "/api/assets", f.board.discoveries[5]!.name]) expect(text).not.toContain(privateValue);
    expect((await passportSharePreview(container(), owner, f.child.id, "Explorer")).name).toBe("Explorer");
    await expect(sharedPassportMedia(container(), token, "arbitrary-image")).rejects.toThrow();
    const media = book.worlds[0]!.pages[0]!.photoUrl!.replace("passport-media:", "");
    const bytes = await sharedPassportMedia(container(), token, media);
    expect((await sharp(bytes).metadata()).width).toBeLessThanOrEqual(900);
    await updatePassportPage(db, owner, f.child.id, f.config.gameId, f.board.boardSlug, { kind: "photo", targetId: f.board.targetIds[0] });
    await expect(sharedPassportMedia(container(), token, media)).rejects.toThrow();
    expect((await sharedPassport(container(), token)).worlds[0]!.pages[0]!.photoUrl).not.toBe(book.worlds[0]!.pages[0]!.photoUrl);
  });
  it("rotation/revocation blocks data AND old personal media; a deleted child has no public passport", async () => {
    const f = await seed(), share = await managePassportShare(container(), owner, f.child.id, "enable", "Explorer");
    const old = new URL(share.url!).hash.slice(1), book = await sharedPassport(container(), old), media = book.avatarUrl!.replace("passport-media:", "");
    const rotated = await managePassportShare(container(), owner, f.child.id, "rotate", "Explorer"), token = new URL(rotated.url!).hash.slice(1);
    expect(token).not.toBe(old);
    await expect(sharedPassport(container(), old)).rejects.toThrow(); await expect(sharedPassportMedia(container(), old, media)).rejects.toThrow();
    await managePassportShare(container(), owner, f.child.id, "revoke", "Explorer");
    await expect(sharedPassport(container(), token)).rejects.toThrow();
    const next = await managePassportShare(container(), owner, f.child.id, "enable", "Explorer");
    await db.familyChild.update({ where: { id: f.child.id }, data: { deletedAt: new Date() } });
    await expect(sharedPassport(container(), new URL(next.url!).hash.slice(1))).rejects.toThrow();
  });
  it("media rejects unearned pictures and removed entitlements, never returning a source URL", async () => {
    const f = await seed(2), input = { childId: f.child.id, gameId: f.config.gameId, board: f.board.boardSlug, kind: "photo" as const, id: f.board.targetIds[2]! };
    await expect(ownerPassportMedia(container(), owner, input)).rejects.toThrow();
    await db.order.updateMany({ where: { gameId: f.config.gameId }, data: { paymentStatus: "REFUNDED" } });
    expect((await ownerPassport(db, owner, f.child.id)).worlds).toEqual([]);
  });
});
