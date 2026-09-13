import { Prisma, type PrismaClient } from "@prisma/client";
import { parseGameConfig } from "@/domain/game/config";
import { AdventureError } from "@/domain/adventure/compose";
import { AdventureEventSchema, adventureAlbum, emptyAdventureProgress, readAdventureProgress, recordAdventureEvent, type AdventureEvent } from "@/domain/adventure/progress";

type Database = Pick<PrismaClient, "$transaction">;
type AlbumRow = { revision: number; snapshotJson: string };

/**
 * Trusted service boundary: the future owner route MUST derive ownerId from
 * the authenticated session, never from a POST body or a shared player link.
 * No public endpoint is installed by this foundation. Guest progress stays local.
 * SQL is parameterized and shared by SQLite/Postgres; no provider calls/money.
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
  });
}

/** Call inside the deletion transaction BEFORE removing/revoking a pilot game.
 * No production deletion flow is changed until the migration/feature is enabled.
 */
export async function deleteAdventureAlbum(tx: Pick<Prisma.TransactionClient, "$executeRaw">, gameId: string): Promise<void> {
  await tx.$executeRaw(Prisma.sql`DELETE FROM "AdventureAlbumProgress" WHERE "gameId" = ${gameId}`);
}
