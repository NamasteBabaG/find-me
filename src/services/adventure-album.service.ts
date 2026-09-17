import { Prisma, type PrismaClient } from "@prisma/client";
import { parseGameConfig } from "@/domain/game/config";
import { AdventureError } from "@/domain/adventure/compose";
import { AdventureEventSchema, adventureAlbum, emptyAdventureProgress, readAdventureProgress, recordAdventureEvent, type AdventureEvent } from "@/domain/adventure/progress";

type Database = Pick<PrismaClient, "$transaction">;
type AlbumRow = { revision: number; snapshotJson: string };

/**
 * Trusted service boundary: `ownerId` MUST come from the authenticated
 * session, never from a POST body or a shared player link.
 *
 * `/api/play/album` is installed and calls this; the route reads the session
 * itself and a guest's progress stays in their own browser. SQL is
 * parameterized and shared by SQLite/Postgres; no provider calls, no money.
 */
export async function ownerAdventureAlbum(db: Database, ownerId: string, gameId: string, event?: AdventureEvent) {
  const parsedEvent = event === undefined ? undefined : AdventureEventSchema.parse(event);
  return db.$transaction(async tx => {
    const game = await tx.game.findUnique({ where: { id: gameId }, select: { ownerId: true, deletedAt: true, status: true, configJson: true } });
    if (!ownerId || !game || game.ownerId !== ownerId || game.deletedAt || !["READY", "DELIVERED"].includes(game.status) || !game.configJson) throw new AdventureError("not-owned");
    const config = parseGameConfig(game.configJson);
    if (config.gameId !== gameId) throw new AdventureError("content-mismatch");
    const book = config.adventure;
    if (!book) throw new AdventureError("not-ready");
    const rows = await tx.$queryRaw<AlbumRow[]>(Prisma.sql`SELECT "revision", "snapshotJson" FROM "AdventureAlbumProgress" WHERE "gameId" = ${gameId}`);
    const row = rows[0];
    if (row && (!Number.isSafeInteger(row.revision) || row.revision < 1)) throw new AdventureError("corrupt-progress");
    let saved: unknown;
    try { saved = row ? JSON.parse(row.snapshotJson) : emptyAdventureProgress(gameId, book); }
    catch { throw new AdventureError("corrupt-progress"); }
    const previous = readAdventureProgress(saved, gameId, book);
    const result = parsedEvent ? recordAdventureEvent(previous, gameId, book, parsedEvent) : { progress: previous, changed: false };
    if (result.changed) {
      const snapshot = JSON.stringify(result.progress);
      // A changed/deleted/reassigned game cannot accept an event authorised on
      // an earlier read. Concurrent album writers cannot overwrite one another.
      const updated = row
        ? await tx.$executeRaw(Prisma.sql`UPDATE "AdventureAlbumProgress" SET "snapshotJson" = ${snapshot}, "revision" = "revision" + 1
            WHERE "gameId" = ${gameId} AND "revision" = ${row.revision}
            AND EXISTS (SELECT 1 FROM "Game" WHERE "id" = ${gameId} AND "ownerId" = ${ownerId} AND "deletedAt" IS NULL AND "status" IN ('READY', 'DELIVERED') AND "configJson" = ${game.configJson})`)
        : await tx.$executeRaw(Prisma.sql`INSERT INTO "AdventureAlbumProgress" ("gameId", "revision", "snapshotJson")
            SELECT ${gameId}, 1, ${snapshot} FROM "Game" WHERE "id" = ${gameId} AND "ownerId" = ${ownerId} AND "deletedAt" IS NULL AND "status" IN ('READY', 'DELIVERED') AND "configJson" = ${game.configJson}
            ON CONFLICT ("gameId") DO NOTHING`);
      if (updated !== 1) throw new AdventureError("content-mismatch", "concurrent-update-retry-same-event");
    }
    return { progress: result.progress, album: adventureAlbum(result.progress), changed: result.changed, revision: (row?.revision ?? 0) + (result.changed ? 1 : 0) };
  // Serializable on both sides of a deletion: a save that reads the game while
  // deleteGame takes its config away is aborted instead of re-creating the album.
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Call inside the deletion transaction BEFORE removing/revoking a game.
 * `deleteGame` does exactly that: a soft delete takes the album with it, in
 * the same Serializable transaction (see adventure-album-delete.test.ts).
 */
export async function deleteAdventureAlbum(tx: Pick<Prisma.TransactionClient, "$executeRaw">, gameId: string): Promise<void> {
  // Deletion changes the scope the parent consented to share. Revoke even when
  // other adventures remain; a later purchase cannot revive an old capability.
  await tx.$executeRaw(Prisma.sql`UPDATE "PassportShare" SET "revokedAt" = ${new Date()}
    WHERE "revokedAt" IS NULL AND "familyChildId" IN (SELECT "familyChildId" FROM "Game" WHERE "id" = ${gameId})`);
  await tx.$executeRaw(Prisma.sql`DELETE FROM "PassportPagePreference" WHERE "gameId" = ${gameId}`);
  await tx.$executeRaw(Prisma.sql`DELETE FROM "AdventureAlbumProgress" WHERE "gameId" = ${gameId}`);
}
