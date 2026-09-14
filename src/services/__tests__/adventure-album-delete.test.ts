import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyTestSchema } from "../../lib/test-schema";
import { adventureFixture } from "../../domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "../../domain/adventure/compose";
import type { Container } from "../container";
import { ownerAdventureAlbum } from "../adventure-album.service";
import { deleteGame } from "../game.service";

/** Deleting a pilot game (a soft delete) takes its album with it; the cascade alone only covers a physical delete. */
let scratch: string, db: PrismaClient;
const owner = "album-delete-owner";
beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "findme-album-delete-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  await db.user.create({ data: { id: owner, email: "album-delete@example.invalid" } });
}, 30_000);
afterAll(async () => {
  await db?.$disconnect();
  if (scratch && path.basename(scratch).startsWith("findme-album-delete-")) await rm(scratch, { recursive: true, force: true });
});

describe("album deletion with the game", () => {
  it("removes the album row when the game is deleted, and the route refuses afterwards", async () => {
    const fixture = adventureFixture(5);
    fixture.config.gameId = "album-delete-game";
    const config = attachAdventureBook(fixture.config, fixture.catalog, ["pilot-test"]);
    await db.game.create({ data: { id: config.gameId, ownerId: owner, status: "DELIVERED", styleVersion: "pilot-album-v1", configJson: JSON.stringify(config) } });
    await ownerAdventureAlbum(db, owner, config.gameId, { kind: "discovery-found", boardSlug: "pilot-test", discoveryId: "cat" });
    const rows = () => db.$queryRaw<Array<{ gameId: string }>>(Prisma.sql`SELECT "gameId" FROM "AdventureAlbumProgress" WHERE "gameId" = ${config.gameId}`);
    expect(await rows()).toHaveLength(1);
    const c = { db, storage: { delete: async () => {} }, analytics: { track() {} }, secret: "test-secret" } as unknown as Container;
    expect(await deleteGame(c, config.gameId, { type: "USER", id: owner }, owner)).toBe(true);
    expect(await rows()).toHaveLength(0);
    await expect(ownerAdventureAlbum(db, owner, config.gameId)).rejects.toThrow("not-owned");
  });

  it("a save that lands while the game is being deleted cannot leave an album behind", async () => {
    const fixture = adventureFixture(5);
    fixture.config.gameId = "album-delete-race";
    const config = attachAdventureBook(fixture.config, fixture.catalog, ["pilot-test"]);
    const gameId = config.gameId;
    await db.game.create({ data: { id: gameId, ownerId: owner, status: "DELIVERED", styleVersion: "pilot-album-v1", configJson: JSON.stringify(config) } });
    await ownerAdventureAlbum(db, owner, gameId, { kind: "target-found", boardSlug: "pilot-test", targetId: "hide-1", variant: "A" });
    const rows = () => db.$queryRaw<Array<{ gameId: string }>>(Prisma.sql`SELECT "gameId" FROM "AdventureAlbumProgress" WHERE "gameId" = ${gameId}`);
    // The save slips in at the last moment before the game's config is taken
    // away, on the same connection: exactly the gap two separate statements
    // (album delete, then config update) used to leave open.
    type AlbumDb = Parameters<typeof ownerAdventureAlbum>[0];
    const sneak = { kind: "discovery-found", boardSlug: "pilot-test", discoveryId: "cat" } as const;
    let raced = 0;
    const racing = <T extends object>(client: T, via: AlbumDb): T => new Proxy(client, { get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (prop === "$transaction") return (fn: unknown, opts?: unknown) => (value as (a: unknown, b?: unknown) => unknown).call(target,
        typeof fn === "function" ? (tx: Prisma.TransactionClient) => (fn as (t: unknown) => unknown)(racing(tx, { $transaction: (run: (t: unknown) => unknown) => run(tx) } as unknown as AlbumDb)) : fn, opts);
      if (prop === "game") return new Proxy(value as object, { get(model, p, r) {
        const member = Reflect.get(model, p, r) as unknown;
        if (p === "update") return async (args: { data?: { configJson?: unknown } }) => {
          if (args.data?.configJson === null && raced++ === 0) await ownerAdventureAlbum(via, owner, gameId, sneak);
          return (member as (a: unknown) => unknown).call(model, args);
        };
        return typeof member === "function" ? (member as (...a: unknown[]) => unknown).bind(model) : member;
      } });
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    } });
    const c = { db: racing(db, db), storage: { delete: async () => {} }, analytics: { track() {} }, secret: "test-secret" } as unknown as Container;
    expect(await deleteGame(c, gameId, { type: "USER", id: owner }, owner)).toBe(true);
    expect(raced).toBe(1);
    expect(await rows()).toHaveLength(0);
    expect((await db.game.findUniqueOrThrow({ where: { id: gameId } })).status).toBe("DELETED");
    await expect(ownerAdventureAlbum(db, owner, gameId, sneak)).rejects.toThrow("not-owned");
  });
});
