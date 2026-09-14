import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyTestSchema } from "../../lib/test-schema";
import { adventureFixture } from "../../domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "../../domain/adventure/compose";
import type { AdventureEvent } from "../../domain/adventure/progress";
import { deleteAdventureAlbum, ownerAdventureAlbum } from "../adventure-album.service";

let scratch: string, db: PrismaClient, databaseUrl: string;
let sequence = 0;
const owner = "album-test-owner";
beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "findme-adventure-test-"));
  databaseUrl = `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}`;
  db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await applyTestSchema(db);
  await db.user.create({ data: { id: owner, email: "adventure-owner@example.invalid" } });
}, 30_000);
afterAll(async () => {
  await db?.$disconnect();
  if (scratch && path.dirname(scratch) === tmpdir() && path.basename(scratch).startsWith("findme-adventure-test-")) await rm(scratch, { recursive: true, force: true });
});

async function seed(count: 4 | 5 = 5, enabled = true) {
  const fixture = adventureFixture(count);
  fixture.config.gameId = `adventure-test-${++sequence}`;
  const config = enabled ? attachAdventureBook(fixture.config, fixture.catalog, ["pilot-test"]) : fixture.config;
  await db.game.create({ data: { id: config.gameId, ownerId: owner, status: "READY", configJson: JSON.stringify(config) } });
  return config;
}
const found = (targetId: string): AdventureEvent => ({ kind: "target-found", boardSlug: "pilot-test", targetId, variant: "A" });
const discovery: AdventureEvent = { kind: "discovery-found", boardSlug: "pilot-test", discoveryId: "cat" };
async function rowCount(gameId: string) {
  const rows = await db.$queryRaw<Array<{ gameId: string }>>(Prisma.sql`SELECT "gameId" FROM "AdventureAlbumProgress" WHERE "gameId" = ${gameId}`);
  return rows.length;
}

describe("owner album on disposable, real SQLite (no provider or network)", () => {
  it("a read is read-only; an existing game has no album unless explicitly enrolled", async () => {
    const config = await seed();
    const empty = await ownerAdventureAlbum(db, owner, config.gameId);
    expect(empty).toMatchObject({ changed: false, revision: 0, album: { stars: { found: 0, total: 5 } } });
    expect(await rowCount(config.gameId)).toBe(0);
    const legacy = await seed(5, false);
    await expect(ownerAdventureAlbum(db, owner, legacy.gameId)).rejects.toMatchObject({ code: "not-ready" });
    expect(await rowCount(legacy.gameId)).toBe(0);
  });
  it("persists distinct finds and reopens through a fresh client with the same counters", async () => {
    const config = await seed(4);
    await ownerAdventureAlbum(db, owner, config.gameId, discovery);
    for (let n = 1; n <= 4; n++) await ownerAdventureAlbum(db, owner, config.gameId, found(`hide-${n}`));
    const other = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const reopened = await ownerAdventureAlbum(other, owner, config.gameId);
      expect(reopened).toMatchObject({ revision: 5, album: { stars: { found: 4, total: 4 }, postcards: { collected: 1, total: 1 }, discoveries: { collected: 1, total: 1 }, complete: true } });
      const replay = await ownerAdventureAlbum(other, owner, config.gameId, found("hide-1"));
      expect(replay.changed).toBe(false);
      expect(replay.revision).toBe(5);
    } finally { await other.$disconnect(); }
  });
  it("survives a committed write whose acknowledgement was lost", async () => {
    const config = await seed();
    const lostAck = new Proxy(db, { get(target, key) {
      if (key === "$transaction") return async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => {
        await target.$transaction(work);
        throw new Error("synthetic connection lost after COMMIT");
      };
      return Reflect.get(target, key);
    } });
    await expect(ownerAdventureAlbum(lostAck, owner, config.gameId, discovery)).rejects.toThrow("after COMMIT");
    const other = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const retried = await ownerAdventureAlbum(other, owner, config.gameId, discovery);
      expect(retried).toMatchObject({ changed: false, revision: 1, album: { discoveries: { collected: 1, total: 1 } } });
    } finally { await other.$disconnect(); }
  });
  it("refuses another owner, guests, deleted games and games that are not ready", async () => {
    const config = await seed();
    await ownerAdventureAlbum(db, owner, config.gameId, discovery);
    for (const actor of ["other-owner", "", "shr_not-an-owner"]) {
      await expect(ownerAdventureAlbum(db, actor, config.gameId)).rejects.toMatchObject({ code: "not-owned" });
      await expect(ownerAdventureAlbum(db, actor, config.gameId, discovery)).rejects.toMatchObject({ code: "not-owned" });
    }
    await db.game.update({ where: { id: config.gameId }, data: { deletedAt: new Date() } });
    await expect(ownerAdventureAlbum(db, owner, config.gameId, discovery)).rejects.toMatchObject({ code: "not-owned" });
    const unready = await seed();
    await db.game.update({ where: { id: unready.gameId }, data: { status: "PAID" } });
    await expect(ownerAdventureAlbum(db, owner, unready.gameId, discovery)).rejects.toMatchObject({ code: "not-owned" });
    expect(await rowCount(config.gameId)).toBe(1);
    expect(await rowCount(unready.gameId)).toBe(0);
  });
  it("isolates two games with exactly the same discovery IDs", async () => {
    const first = await seed(), second = await seed();
    await ownerAdventureAlbum(db, owner, first.gameId, discovery);
    expect((await ownerAdventureAlbum(db, owner, second.gameId)).album.discoveries.collected).toBe(0);
  });
  it("does not accept completion flags, invented target IDs, or another game's config", async () => {
    const config = await seed();
    await expect(ownerAdventureAlbum(db, owner, config.gameId, found("unknown"))).rejects.toMatchObject({ code: "invalid-event" });
    await expect(ownerAdventureAlbum(db, owner, config.gameId, { ...discovery, complete: true } as AdventureEvent)).rejects.toThrow();
    await db.game.update({ where: { id: config.gameId }, data: { configJson: JSON.stringify({ ...config, gameId: "different-game" }) } });
    await expect(ownerAdventureAlbum(db, owner, config.gameId, discovery)).rejects.toMatchObject({ code: "content-mismatch" });
    expect(await rowCount(config.gameId)).toBe(0);
  });
  it("fails visibly on corrupt progress, preserving the stored bytes", async () => {
    const config = await seed();
    await ownerAdventureAlbum(db, owner, config.gameId, discovery);
    await db.$executeRaw(Prisma.sql`UPDATE "AdventureAlbumProgress" SET "snapshotJson" = ${"{broken"} WHERE "gameId" = ${config.gameId}`);
    await expect(ownerAdventureAlbum(db, owner, config.gameId, found("hide-1"))).rejects.toMatchObject({ code: "corrupt-progress" });
    const rows = await db.$queryRaw<Array<{ snapshotJson: string }>>(Prisma.sql`SELECT "snapshotJson" FROM "AdventureAlbumProgress" WHERE "gameId" = ${config.gameId}`);
    expect(rows[0]!.snapshotJson).toBe("{broken");
  });
  it("a changed content release cannot erase or silently rebind an earned collection", async () => {
    const config = await seed();
    await ownerAdventureAlbum(db, owner, config.gameId, discovery);
    config.adventure!.releaseId = "new-release";
    await db.game.update({ where: { id: config.gameId }, data: { configJson: JSON.stringify(config) } });
    await expect(ownerAdventureAlbum(db, owner, config.gameId, found("hide-1"))).rejects.toMatchObject({ code: "wrong-book" });
    expect(await rowCount(config.gameId)).toBe(1);
  });
  it("has explicit deletion cleanup and a hard-delete cascade", async () => {
    const config = await seed(), other = await seed();
    await ownerAdventureAlbum(db, owner, config.gameId, discovery);
    await ownerAdventureAlbum(db, owner, other.gameId, discovery);
    await db.$transaction(async tx => { await deleteAdventureAlbum(tx, config.gameId); });
    expect(await rowCount(config.gameId)).toBe(0);
    expect(await rowCount(other.gameId)).toBe(1);
    await db.game.delete({ where: { id: other.gameId } });
    expect(await rowCount(other.gameId)).toBe(0);
  });
  it("fences a stale revision rather than overwriting a newer album", async () => {
    const config = await seed();
    await ownerAdventureAlbum(db, owner, config.gameId, discovery);
    const conflicted = new Proxy(db, { get(target, key) {
      if (key === "$transaction") return (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => target.$transaction(tx => work(new Proxy(tx, { get(transaction, member) {
        if (member === "$executeRaw") return async (sql: Prisma.Sql) => {
          if (sql.sql.startsWith('UPDATE "AdventureAlbumProgress"')) await transaction.$executeRaw(Prisma.sql`UPDATE "AdventureAlbumProgress" SET "revision" = "revision" + 1 WHERE "gameId" = ${config.gameId}`);
          return transaction.$executeRaw(sql);
        };
        return Reflect.get(transaction, member);
      } })));
      return Reflect.get(target, key);
    } });
    await expect(ownerAdventureAlbum(conflicted, owner, config.gameId, found("hide-1"))).rejects.toMatchObject({ code: "content-mismatch", subject: "concurrent-update-retry-same-event" });
    const after = await ownerAdventureAlbum(db, owner, config.gameId);
    expect(after.album.stars.found).toBe(0);
    expect(after.album.discoveries.collected).toBe(1);
    const retried = await ownerAdventureAlbum(db, owner, config.gameId, found("hide-1"));
    expect(retried.album.stars.found).toBe(1);
  });
});
