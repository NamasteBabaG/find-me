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

// A passport page asks for its photo and six cards at once, all from one board. Decoding that 3840px board once,
// instead of once per picture, was most of the wait (Guy, 2026-10-01: passport pictures took very long). Public
// scene art only, never a child's pixels; one board, one minute, so the memory stays bounded (~25-33 MB).
export type DecodedBoard = { data: Buffer; info: { width: number; height: number; channels: 1 | 2 | 3 | 4 } };
const decoded = new Map<string, { at: number; value: Promise<DecodedBoard> }>();
function decodedBoard(key: string, base: Buffer): Promise<DecodedBoard> {
  const hit = decoded.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.value;
  decoded.clear();
  const value = sharp(base, { limitInputPixels: 50_000_000 }).raw().toBuffer({ resolveWithObject: true })
    .then(({ data, info }) => ({ data, info: { width: info.width, height: info.height, channels: info.channels } }));
  value.catch(() => decoded.delete(key));
  decoded.set(key, { at: Date.now(), value });
  return value;
}

// Requests that arrive together share one read of the child's games; nothing is kept once they are answered,
// and every request still runs the final ownership and liveness checks on its own.
const sourcesInFlight = new Map<string, ReturnType<typeof passportSources>>();
function sharedSources(db: Pick<Container, "db">["db"], ownerId: string, childId: string) {
  const key = `${ownerId}\u0000${childId}`;
  const hit = sourcesInFlight.get(key);
  if (hit) return hit;
  const read = passportSources(db, ownerId, childId).finally(() => sourcesInFlight.delete(key));
  sourcesInFlight.set(key, read);
  return read;
}

/**
 * The keepsake picture: the board's crop with the child's patch laid in, resized for the passport. It crops first and
 * lays in only the part of the patch that falls inside the crop, at its offset: the same pixels as compositing the
 * whole board and cropping it (pinned by passport-media-raster.test.ts), without re-encoding a 3840px board per picture.
 */
export async function passportRaster(input: {
  raw: DecodedBoard;
  crop: { x: number; y: number; w: number; h: number };
  outputWidth: number;
  patch?: { bytes: Buffer; left: number; top: number; width: number; height: number };
}): Promise<Buffer> {
  const { raw, crop, patch } = input;
  const W = raw.info.width, H = raw.info.height;
  const left = Math.floor(crop.x * W), top = Math.floor(crop.y * H);
  const width = Math.min(W - left, Math.ceil(crop.w * W)), height = Math.min(H - top, Math.ceil(crop.h * H));
  let region = sharp(raw.data, { raw: raw.info, limitInputPixels: 50_000_000 }).extract({ left, top, width, height });
  if (patch) {
    const x0 = Math.max(patch.left, left), y0 = Math.max(patch.top, top);
    const x1 = Math.min(patch.left + patch.width, left + width), y1 = Math.min(patch.top + patch.height, top + height);
    if (x1 > x0 && y1 > y0) {
      const sprite = await sharp(patch.bytes, { limitInputPixels: 50_000_000 }).resize(patch.width, patch.height, { fit: "fill" }).png().toBuffer();
      const part = await sharp(sprite).extract({ left: x0 - patch.left, top: y0 - patch.top, width: x1 - x0, height: y1 - y0 }).png().toBuffer();
      // Sharp resizes before it composites, so the composite is finished before the resize below.
      const composed = await region.composite([{ input: part, left: x0 - left, top: y0 - top }]).raw().toBuffer({ resolveWithObject: true });
      region = sharp(composed.data, { raw: { width: composed.info.width, height: composed.info.height, channels: composed.info.channels as DecodedBoard["info"]["channels"] } });
    }
  }
  return region.resize({ width: input.outputWidth, withoutEnlargement: true }).webp({ quality: 86 }).toBuffer();
}

/** No signed source URLs are returned. Only small cropped raster bytes. */
export async function ownerPassportMedia(c: Pick<Container, "db" | "storage" | "appUrl">, ownerId: string, input: { childId: string; gameId: string; board: string; kind: "photo" | "discovery"; id: string }) {
  const { sources } = await sharedSources(c.db, ownerId, input.childId);
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
    const raw = await decodedBoard(`${board.art.base}\u0000${board.artSha256 ?? ""}`, base);
    if (raw.info.width !== board.art.width || raw.info.height !== board.art.height) throw new Error("passport-media-dimensions");
    return passportRaster({ raw, crop, outputWidth: input.kind === "photo" ? 900 : 192,
      patch: patch ? { ...patch, bytes: await c.storage.get(patch.storagePath) } : undefined });
  })();
  // Recheck authorization after I/O: concurrent deletion/reassignment must not
  // return pixels using an earlier read. No public/source asset cache shortcut.
  const live = await c.db.game.count({ where: { id: source.game.id, ownerId, familyChildId: input.childId, deletedAt: null, status: { in: ["READY", "DELIVERED"] }, configJson: source.game.configJson, familyChild: { ownerId, deletedAt: null }, orders: { some: { userId: ownerId, paymentStatus: "PAID" } } } });
  if (!live) throw new PassportAccessError("not-found");
  if (patch && !await c.db.asset.count({ where: { id: patch.assetId, ownerId, visibility: "GAME", status: "READY", deletedAt: null, storagePath: patch.storagePath } })) throw new PassportAccessError("not-found");
  cacheCrop(key, bytes);
  return bytes;
}
