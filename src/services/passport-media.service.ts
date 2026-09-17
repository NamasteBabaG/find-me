import sharp from "sharp";
import { passportPhoto, passportPhotoCrop } from "@/domain/passport/passport";
import { passportSources, PassportAccessError } from "./passport.service";
import { loadSceneArt } from "./generation/scene-art";
import type { Container } from "./container";
import { hashToken } from "@/lib/ids";

// Private process-local raster cache, never an authorization cache. Bounded
// memory and TTL; every hit still passes both ownership/liveness checks below.
const crops = new Map<string, { bytes: Buffer; expires: number }>();
let cropBytes = 0;
function cacheCrop(key: string, bytes: Buffer) {
  for (const [id, entry] of crops) if (entry.expires < Date.now()) { cropBytes -= entry.bytes.length; crops.delete(id); }
  while (cropBytes + bytes.length > 16 * 1024 * 1024 && crops.size) { const [id, entry] = crops.entries().next().value!; cropBytes -= entry.bytes.length; crops.delete(id); }
  if (bytes.length <= 16 * 1024 * 1024 && !crops.has(key)) { crops.set(key, { bytes, expires: Date.now() + 5 * 60_000 }); cropBytes += bytes.length; }
}

/** No signed source URLs are returned. Only small cropped raster bytes. */
export async function ownerPassportMedia(c: Pick<Container, "db" | "storage" | "appUrl">, ownerId: string, input: { childId: string; gameId: string; board: string; kind: "photo" | "discovery"; id: string }) {
  const { sources } = await passportSources(c.db, ownerId, input.childId);
  const source = sources.find(s => s.game.id === input.gameId);
  const board = source?.progress.book.boards.find(b => b.boardSlug === input.board);
  if (!source || !board) throw new PassportAccessError("not-found");
  let crop;
  let patch: { assetId: string; storagePath: string; left: number; top: number; width: number; height: number } | undefined;
  if (input.kind === "photo") {
    const photo = passportPhoto(source.progress, input.board, input.id);
    if (!photo || photo.targetId !== input.id) throw new PassportAccessError("not-found");
    const binding = board.targetImages.find(t => t.targetId === photo.targetId)![photo.variant];
    const asset = await c.db.asset.findFirst({ where: { id: binding.assetId, ownerId, visibility: "GAME", type: "TARGET_SPRITE", status: "READY", deletedAt: null } });
    if (!asset) throw new PassportAccessError("not-found");
    const sprite = source.config.scenes.find(s => s.slug === board.boardSlug)!.targets.find(t => t.id === photo.targetId)!;
    // Unsupported transformed/foreground renders must not produce a misleading
    // keepsake. Current approved local-patch boards have neither transformation.
    if (sprite.adjust && (sprite.adjust.dx || sprite.adjust.dy || sprite.adjust.scale !== 1) || source.config.scenes.find(s => s.slug === board.boardSlug)!.art.foreground) throw new Error("passport-media-unsupported-composite");
    const r = binding.rect;
    const left = Math.round(r.x * board.art.width), top = Math.round(r.y * board.art.height);
    const width = Math.min(board.art.width - left, Math.round(r.w * board.art.width));
    const height = Math.min(board.art.height - top, Math.round(r.h * board.art.height));
    patch = { assetId: asset.id, storagePath: asset.storagePath, left, top, width, height };
    crop = passportPhotoCrop(binding.hitRect, board.art);
  } else {
    const discovery = board.discoveries.find(d => d.id === input.id);
    if (!discovery || !source.progress.discoveries.some(d => d.boardSlug === board.boardSlug && d.discoveryId === input.id)) throw new PassportAccessError("not-found");
    crop = discovery.cardCrop;
  }
  const key = hashToken(JSON.stringify([ownerId, input, source.game.configJson, patch?.storagePath]));
  const cached = crops.get(key);
  const bytes = cached && cached.expires > Date.now() ? cached.bytes : await (async () => {
    const base = await loadSceneArt(c.appUrl, board.art.base, board.artSha256);
    const metadata = await sharp(base).metadata();
    if (metadata.width !== board.art.width || metadata.height !== board.art.height) throw new Error("passport-media-dimensions");
    let raster = sharp(base, { limitInputPixels: 50_000_000 });
    if (patch) raster = raster.composite([{ input: await sharp(await c.storage.get(patch.storagePath), { limitInputPixels: 50_000_000 }).resize(patch.width, patch.height, { fit: "fill" }).png().toBuffer(), left: patch.left, top: patch.top }]);
    // Complete the composite before extracting; Sharp otherwise extracts the base
    // first while patch coordinates still refer to the full board.
    const composite = patch ? await raster.png().toBuffer() : base;
    const left = Math.floor(crop.x * board.art.width), top = Math.floor(crop.y * board.art.height);
    return sharp(composite).extract({ left, top, width: Math.min(board.art.width - left, Math.ceil(crop.w * board.art.width)), height: Math.min(board.art.height - top, Math.ceil(crop.h * board.art.height)) })
      .resize({ width: input.kind === "photo" ? 900 : 192, withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
  })();
  // Recheck authorization after I/O: concurrent deletion/reassignment must not
  // return pixels using an earlier read. No public/source asset cache shortcut.
  const live = await c.db.game.count({ where: { id: source.game.id, ownerId, familyChildId: input.childId, deletedAt: null, status: { in: ["READY", "DELIVERED"] }, configJson: source.game.configJson, familyChild: { ownerId, deletedAt: null }, orders: { some: { userId: ownerId, paymentStatus: "PAID" } } } });
  if (!live) throw new PassportAccessError("not-found");
  if (patch && !await c.db.asset.count({ where: { id: patch.assetId, ownerId, visibility: "GAME", status: "READY", deletedAt: null, storagePath: patch.storagePath } })) throw new PassportAccessError("not-found");
  cacheCrop(key, bytes);
  return bytes;
}
