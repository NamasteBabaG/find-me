import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { parseGameConfig } from "@/domain/game/config";
import { emptyAdventureProgress, readAdventureProgress } from "@/domain/adventure/progress";
import { distinguishPassportWorlds, passportCeremony, projectPassport, type PassportPreference, type PassportView } from "@/domain/passport/passport";

type Db = Pick<PrismaClient, "familyChild" | "game" | "passportPagePreference">;
const Seen = z.array(z.string().min(1).max(160)).max(6);
export class PassportAccessError extends Error {}

export async function passportSources(db: Db, ownerId: string, childId: string) {
  const child = ownerId ? await db.familyChild.findFirst({ where: { id: childId, ownerId, deletedAt: null } }) : null;
  if (!child) throw new PassportAccessError("not-found");
  const games = await db.game.findMany({
    where: { familyChildId: childId, ownerId, deletedAt: null, status: { notIn: ["DELETED", "REFUNDED", "CANCELLED"] }, orders: { some: { userId: ownerId, paymentStatus: "PAID" } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { adventureAlbum: true, passportPages: true },
  });
  const ready = games.filter(g => ["READY", "DELIVERED"].includes(g.status) && g.configJson);
  return { child, preparing: games.length - ready.length, sources: ready.flatMap(game => {
    const config = parseGameConfig(game.configJson!);
    if (config.gameId !== game.id) throw new Error("passport-content-unavailable");
    // Old test formats remain playable from the family card. They must not
    // poison the current 3-find/6-discovery passport, nor invent extra stamps.
    if (!config.adventure || !config.adventure.boards.every(b => b.targetIds.length === 3 && b.discoveries.length === 6)) return [];
    if (game.adventureAlbum && (!Number.isSafeInteger(game.adventureAlbum.revision) || game.adventureAlbum.revision < 1)) throw new Error("passport-progress-unavailable");
    const progress = readAdventureProgress(game.adventureAlbum ? JSON.parse(game.adventureAlbum.snapshotJson) : emptyAdventureProgress(game.id, config.adventure), game.id, config.adventure);
    const preferences: Record<string, PassportPreference> = Object.fromEntries(game.passportPages.map(p => [p.boardSlug, { photoTargetId: p.photoTargetId, stampSeen: p.stampSeen, seenDiscoveries: Seen.parse(JSON.parse(p.seenDiscoveries)) }]));
    return [{ game, config, progress, preferences }];
  }) };
}

export async function ownerPassport(db: Db, ownerId: string, childId: string): Promise<PassportView> {
  const { child, sources, preparing } = await passportSources(db, ownerId, childId);
  return {
    name: child.displayName, preparing,
    ...(sources[0] ? { avatarUrl: `/api/assets/${sources[0].config.adventure!.avatarAssetId}` } : {}),
    worlds: distinguishPassportWorlds(sources.flatMap(source => projectPassport(source.config, source.progress, source.preferences, (board, kind, id) => {
      const query = new URLSearchParams({ childId, gameId: source.game.id, board, kind, id });
      return `/api/passport/media?${query}`;
    }, true).map(world => ({ ...world, id: `${source.game.id}:${world.id}`, pages: world.pages.map(page => ({ ...page, id: `${source.game.id}:${page.id}`, playHref: `/family/${childId}/play/${source.game.id}?board=${encodeURIComponent(page.id)}` })) })))),
  };
}

export const PassportChoiceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("photo"), targetId: z.string().min(1).max(160) }).strict(),
  z.object({ kind: z.literal("seen"), stamp: z.boolean(), discoveryIds: Seen }).strict(),
]);

export async function updatePassportPage(db: PrismaClient, ownerId: string, childId: string, gameId: string, boardSlug: string, raw: unknown) {
  const choice = PassportChoiceSchema.parse(raw);
  return db.$transaction(async tx => {
    const { sources } = await passportSources(tx, ownerId, childId);
    const source = sources.find(s => s.game.id === gameId);
    if (!source) throw new PassportAccessError("not-found");
    const board = source.progress.book.boards.find(b => b.boardSlug === boardSlug);
    if (!board || board.targetIds.length !== 3 || source.progress.finds.filter(f => f.boardSlug === boardSlug).length !== 3) throw new PassportAccessError("not-complete");
    const previous = source.preferences[boardSlug] ?? { photoTargetId: null, stampSeen: false, seenDiscoveries: [] };
    const next = { ...previous };
    if (choice.kind === "photo") {
      if (!source.progress.finds.some(f => f.boardSlug === boardSlug && f.targetId === choice.targetId)) throw new PassportAccessError("not-found");
      next.photoTargetId = choice.targetId;
    } else {
      const collected = source.progress.discoveries.filter(d => d.boardSlug === boardSlug).map(d => d.discoveryId);
      if (choice.discoveryIds.some(id => !collected.includes(id))) throw new PassportAccessError("not-found");
      next.stampSeen ||= choice.stamp;
      next.seenDiscoveries = Array.from(new Set([...previous.seenDiscoveries, ...choice.discoveryIds]));
    }
    // Match the ownership/config that authorized the request, and serialize
    // against game deletion before changing only presentation metadata.
    const fenced = await tx.game.updateMany({ where: { id: gameId, ownerId, familyChildId: childId, configJson: source.game.configJson, status: source.game.status, deletedAt: null, updatedAt: source.game.updatedAt }, data: { updatedAt: new Date() } });
    if (fenced.count !== 1) throw new PassportAccessError("retry");
    await tx.passportPagePreference.upsert({ where: { gameId_boardSlug: { gameId, boardSlug } },
      create: { gameId, boardSlug, photoTargetId: next.photoTargetId, stampSeen: next.stampSeen, seenDiscoveries: JSON.stringify(next.seenDiscoveries), revision: 1 },
      update: { photoTargetId: next.photoTargetId, stampSeen: next.stampSeen, seenDiscoveries: JSON.stringify(next.seenDiscoveries), revision: { increment: 1 } },
    });
    return passportCeremony(source.progress, boardSlug, next);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
