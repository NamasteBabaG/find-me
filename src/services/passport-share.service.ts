import sharp from "sharp";
import { Prisma } from "@prisma/client";
import { hmacSign, newId, safeEqual } from "@/lib/ids";
import type { Container } from "./container";
import { passportSources, PassportAccessError } from "./passport.service";
import { projectPassport, type PassportView } from "@/domain/passport/passport";
import { ownerPassportMedia } from "./passport-media.service";

type C = Pick<Container, "db" | "secret" | "appUrl" | "storage">;
type Share = { id: string; familyChildId: string; alias: string; createdAt: Date; revokedAt: Date | null };
function tokenFor(c: Pick<C, "secret">, share: Share) { return `${share.id}.${hmacSign(`passport-v1:${share.id}:${share.familyChildId}:${share.createdAt.getTime()}`, c.secret)}`; }
export function passportShareUrl(c: Pick<C, "secret" | "appUrl">, share: Share) { return `${new URL("/passport", c.appUrl)}#${tokenFor(c, share)}`; }

export async function managePassportShare(c: C, ownerId: string, childId: string, operation: "status" | "enable" | "rotate" | "revoke", alias: string) {
  // The UI asks again, but the server is the ownership boundary.
  const child = await c.db.familyChild.findFirst({ where: { id: childId, ownerId, deletedAt: null } });
  if (!child) throw new PassportAccessError();
  if (operation === "status") {
    const row = await c.db.passportShare.findUnique({ where: { familyChildId: childId } });
    return { active: Boolean(row && !row.revokedAt), url: row && !row.revokedAt ? passportShareUrl(c, row) : null };
  }
  return c.db.$transaction(async tx => {
    const fenced = await tx.familyChild.updateMany({ where: { id: childId, ownerId, deletedAt: null }, data: { displayName: child.displayName } });
    if (fenced.count !== 1) throw new PassportAccessError();
    const previous = await tx.passportShare.findUnique({ where: { familyChildId: childId } });
    if (operation === "revoke") { await tx.passportShare.updateMany({ where: { familyChildId: childId, revokedAt: null }, data: { revokedAt: new Date() } }); return { active: false, url: null }; }
    if (operation === "enable" && previous && !previous.revokedAt) return { active: true, url: passportShareUrl(c, previous) };
    // Rotating the row id invalidates every old media/data capability at once.
    const data = { id: newId("ppr"), alias, createdAt: new Date(), revokedAt: null };
    const row = await tx.passportShare.upsert({ where: { familyChildId: childId }, create: { ...data, familyChildId: childId }, update: data });
    return { active: true, url: passportShareUrl(c, row) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function resolve(c: C, token: string) {
  if (!/^ppr_[a-z0-9]{20}\.[A-Za-z0-9_-]{43}$/.test(token)) throw new PassportAccessError();
  const row = await c.db.passportShare.findUnique({ where: { id: token.split(".")[0]! }, include: { child: true } });
  if (!row || row.revokedAt || row.child.deletedAt || !safeEqual(tokenFor(c, row), token)) throw new PassportAccessError();
  return row;
}
type Media = { childId: string; gameId: string; board: string; kind: "photo" | "discovery"; id: string } | { kind: "avatar"; assetId: string; gameId: string };
async function projection(c: C, ownerId: string, childId: string, alias: string, capability: string) {
  const { sources } = await passportSources(c.db, ownerId, childId);
  const media = new Map<string, Media>();
  const add = (input: Media) => { const opaque = hmacSign(`passport-media:${capability}:${JSON.stringify(input)}`, c.secret); media.set(opaque, input); return `passport-media:${opaque}`; };
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
  const book: PassportView = { name: alias, preparing: 0, worlds };
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
