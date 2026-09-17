import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { hashToken, hmacSign, newId, newSecretToken, safeEqual } from "@/lib/ids";
import type { Container } from "./container";
import { passportSources, PassportAccessError } from "./passport.service";
import { distinguishPassportWorlds, projectPassport, type PassportView } from "@/domain/passport/passport";
import { ownerPassportMedia } from "./passport-media.service";

type C = Pick<Container, "db" | "secret" | "appUrl" | "storage">;
export const PASSPORT_SHARE_LIFETIME_MS = 30 * 24 * 60 * 60_000;
type Share = { expiresAt: Date; revokedAt: Date | null };
const active = (row: Share | null) => Boolean(row && !row.revokedAt && row.expiresAt.getTime() > Date.now());

export async function managePassportShare(c: C, ownerId: string, childId: string, operation: "status" | "enable" | "rotate" | "revoke", alias: string) {
  // The UI asks again, but the server is the ownership boundary.
  const child = await c.db.familyChild.findFirst({ where: { id: childId, ownerId, deletedAt: null } });
  if (!child) throw new PassportAccessError();
  if (operation === "status") {
    const row = await c.db.passportShare.findUnique({ where: { familyChildId: childId } });
    // A capability is displayed once, not recoverable from a hash or session key.
    return { active: active(row), url: null };
  }
  return c.db.$transaction(async tx => {
    const fenced = await tx.familyChild.updateMany({ where: { id: childId, ownerId, deletedAt: null }, data: { displayName: child.displayName } });
    if (fenced.count !== 1) throw new PassportAccessError();
    const previous = await tx.passportShare.findUnique({ where: { familyChildId: childId } });
    if (operation === "revoke") { await tx.passportShare.updateMany({ where: { familyChildId: childId, revokedAt: null }, data: { revokedAt: new Date() } }); return { active: false, url: null }; }
    if (operation === "enable" && active(previous)) return { active: true, url: null };
    const hasAdventure = await tx.game.count({ where: { familyChildId: childId, ownerId, deletedAt: null,
      status: { notIn: ["CANCELLED", "DELETED", "REFUNDED"] }, orders: { some: { userId: ownerId, paymentStatus: "PAID" } } } });
    if (!hasAdventure) throw new PassportAccessError();
    // Rotating the row id invalidates every old media/data capability at once.
    const secret = newSecretToken();
    const data = { id: newId("ppr"), alias, tokenHash: hashToken(secret), createdAt: new Date(), expiresAt: new Date(Date.now() + PASSPORT_SHARE_LIFETIME_MS), revokedAt: null };
    const row = await tx.passportShare.upsert({ where: { familyChildId: childId }, create: { ...data, familyChildId: childId }, update: data });
    return { active: true, url: `${new URL("/passport", c.appUrl)}#${row.id}.${secret}` };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function resolve(c: C, token: string) {
  if (!/^ppr_[a-z0-9]{20}\.[A-Za-z0-9_-]{43}$/.test(token)) throw new PassportAccessError();
  const row = await c.db.passportShare.findUnique({ where: { id: token.split(".")[0]! }, include: { child: true } });
  if (!row || !active(row) || row.child.deletedAt || !safeEqual(row.tokenHash, hashToken(token.split(".")[1]!))) throw new PassportAccessError();
  if (!await c.db.game.count({ where: { familyChildId: row.familyChildId, ownerId: row.child.ownerId, deletedAt: null,
    status: { notIn: ["CANCELLED", "DELETED", "REFUNDED"] }, orders: { some: { userId: row.child.ownerId, paymentStatus: "PAID" } } } })) {
    await c.db.passportShare.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
    throw new PassportAccessError();
  }
  return row;
}
type Media = { childId: string; gameId: string; board: string; kind: "photo" | "discovery"; id: string } | { kind: "avatar"; assetId: string; gameId: string };
async function projection(c: C, ownerId: string, childId: string, alias: string, capability: string) {
  const { sources } = await passportSources(c.db, ownerId, childId);
  const media = new Map<string, Media>();
  const add = (input: Media) => { const opaque = hmacSign(`passport-media:${JSON.stringify(input)}`, capability); media.set(opaque, input); return `passport-media:${opaque}`; };
  const worlds = sources.flatMap((source, n) => {
    const chapters = projectPassport(source.config, source.progress, source.preferences,
      (board, kind, id) => add({ childId, gameId: source.game.id, board, kind, id }), false);
    return chapters.map((world, w) => ({
      ...world, id: `world-${n}-${w}`,
      pages: world.pages.map((page, p) => ({
        ...page, id: `page-${n}-${w}-${p}`,
        discoveries: page.discoveries.map((item, i) => ({ ...item, id: `item-${i}` })),
      })),
    }));
  });
  const book: PassportView = { name: alias, preparing: 0, worlds: distinguishPassportWorlds(worlds) };
  if (sources[0]) book.avatarUrl = add({ kind: "avatar", gameId: sources[0].game.id, assetId: sources[0].config.adventure!.avatarAssetId });
  return { book, media };
}
export async function sharedPassport(c: C, token: string) {
  const share = await resolve(c, token);
  const result = await projection(c, share.child.ownerId, share.familyChildId, share.alias, token);
  await resolve(c, token);
  return result.book;
}
export async function passportSharePreview(c: C, ownerId: string, childId: string, alias: string) {
  const { book, media } = await projection(c, ownerId, childId, alias, "owner-preview");
  const url = (value: string | undefined) => {
    const input = value ? media.get(value.replace("passport-media:", "")) : undefined;
    if (!input) return undefined;
    return input.kind === "avatar" ? `/api/assets/${input.assetId}` : `/api/passport/media?${new URLSearchParams(input)}`;
  };
  book.avatarUrl = url(book.avatarUrl);
  for (const world of book.worlds) for (const page of world.pages) { page.photoUrl = url(page.photoUrl); for (const item of page.discoveries) item.imageUrl = url(item.imageUrl); }
  return book;
}
export async function sharedPassportMedia(c: C, token: string, opaque: string) {
  const share = await resolve(c, token);
  const { media } = await projection(c, share.child.ownerId, share.familyChildId, share.alias, token);
  const input = media.get(opaque);
  if (!input) throw new PassportAccessError(); // Not the selected photo, not found, or another child.
  let bytes: Buffer;
  if (input.kind === "avatar") {
    const asset = await c.db.asset.findFirst({ where: { id: input.assetId, ownerId: share.child.ownerId, type: "AVATAR", visibility: "GAME", status: "READY", deletedAt: null } });
    if (!asset) throw new PassportAccessError();
    bytes = await sharp(await c.storage.get(asset.storagePath), { limitInputPixels: 50_000_000 }).resize({ width: 256, height: 256, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } else bytes = await ownerPassportMedia(c, share.child.ownerId, input);
  // Revoke/rotate/delete/photo changes during raster work invalidate this response too.
  const live = await resolve(c, token);
  const current = await projection(c, live.child.ownerId, live.familyChildId, live.alias, token);
  if (!current.media.has(opaque)) throw new PassportAccessError();
  return bytes;
}
