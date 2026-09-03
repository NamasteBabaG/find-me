import sharp, { type Metadata } from "sharp";
import { hmacSign, newId, safeEqual } from "@/lib/ids";
import type { Container } from "./container";

/** IDENTITY_SHEET is the child drawn in the worlds style: PRIVATE, a reference, never shipped to a player. */
export type AssetType = "ORIGINAL_PHOTO" | "AVATAR" | "IDENTITY_SHEET" | "TARGET_SPRITE" | "THUMBNAIL";
export type AssetVisibility = "PRIVATE" | "GAME";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MIN_PHOTO_SIDE = 400;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export type PhotoCheck = { ok: true; width: number; height: number; mimeType: string } | { ok: false; reason: string; code: "TOO_LARGE" | "BAD_TYPE" | "TOO_SMALL" | "UNREADABLE" };

/** Photo quality gate — the parent-facing reasons are mapped in the UI copy. */
export async function checkPhoto(buffer: Buffer, declaredMime: string): Promise<PhotoCheck> {
  if (buffer.byteLength > MAX_UPLOAD_BYTES) return { ok: false, code: "TOO_LARGE", reason: "התמונה גדולה מדי (עד 12MB)." };
  let meta: Metadata;
  try {
    meta = await sharp(buffer, { failOn: "none" }).metadata();
  } catch {
    return { ok: false, code: "UNREADABLE", reason: "לא הצלחנו לקרוא את הקובץ." };
  }
  const mime = meta.format === "jpeg" ? "image/jpeg" : meta.format === "png" ? "image/png" : meta.format === "webp" ? "image/webp" : declaredMime;
  if (!ALLOWED_MIME.has(mime)) return { ok: false, code: "BAD_TYPE", reason: "אפשר להעלות JPG, PNG או WebP." };
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (Math.min(width, height) < MIN_PHOTO_SIDE) return { ok: false, code: "TOO_SMALL", reason: "התמונה קטנה מדי. כדאי צילום ברור מהכתפיים ומעלה." };
  return { ok: true, width, height, mimeType: mime };
}

function extFor(mime: string): string {
  return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
}

export async function storeAsset(
  c: Container,
  input: { ownerId?: string | null; type: AssetType; visibility: AssetVisibility; buffer: Buffer; mimeType: string; width?: number; height?: number; provider?: string; providerRequestId?: string; costCents?: number },
) {
  const id = newId("ast");
  const key = `${input.visibility.toLowerCase()}/${id}.${extFor(input.mimeType)}`;
  await c.storage.put(key, input.buffer, input.mimeType);
  return c.db.asset.create({
    data: {
      id,
      ownerId: input.ownerId ?? null,
      type: input.type,
      visibility: input.visibility,
      storagePath: key,
      mimeType: input.mimeType,
      width: input.width ?? null,
      height: input.height ?? null,
      bytes: input.buffer.byteLength,
      provider: input.provider ?? "upload",
      providerRequestId: input.providerRequestId ?? null,
      costCents: input.costCents ?? 0,
    },
  });
}

/**
 * GAME-visibility assets (avatar sticker, sprites) are addressed by an
 * unguessable signed URL — safe to embed in the play config. PRIVATE assets
 * (the original photo) never get a signed URL; they need an owner/admin session.
 *
 * A signature expires, so a link that leaks out of a game stops working. The
 * config is re-signed every time it is served (see `withFreshAssetUrls`), so the
 * lifetime only has to outlast one sitting, not the game.
 */
export const ASSET_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

function assetSignature(secret: string, assetId: string, expires: number): string {
  return hmacSign(`asset:${assetId}:${expires}`, secret).slice(0, 32);
}

export function signedAssetUrl(c: Pick<Container, "secret">, assetId: string, ttlSeconds = ASSET_URL_TTL_SECONDS): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `/api/assets/${assetId}?e=${expires}&s=${assetSignature(c.secret, assetId, expires)}`;
}

/** Only `secret` is read from the container, so this stays trivially unit-testable. */
export function verifyAssetSignature(c: Pick<Container, "secret">, assetId: string, sig: string | null, expires: string | null, now = Date.now()): boolean {
  if (!sig || !expires) return false;
  const exp = Number(expires);
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  return safeEqual(assetSignature(c.secret, assetId, exp), sig);
}

/**
 * Re-sign every asset URL in a stored game config.
 *
 * The config is composed once and kept, but its signatures expire — so the
 * moment a config is handed to a player (or an admin), the URLs are refreshed.
 * Matching on the asset id rather than the whole URL means a config written by
 * an older version is upgraded on the way out.
 */
export function withFreshAssetUrls<T>(c: Pick<Container, "secret">, config: T, ttlSeconds = ASSET_URL_TTL_SECONDS): T {
  const json = JSON.stringify(config).replace(/\/api\/assets\/([A-Za-z0-9_-]+)(\?[^"\\]*)?/g, (_m, id: string) => signedAssetUrl(c, id, ttlSeconds));
  return JSON.parse(json) as T;
}

export type AssetViewer = { userId: string | null; isAdmin: boolean; signature: string | null; expires: string | null };

export async function readAsset(c: Container, assetId: string, viewer: AssetViewer): Promise<{ buffer: Buffer; mimeType: string } | { error: 404 | 403 }> {
  const asset = await c.db.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.status === "DELETED") return { error: 404 };
  const allowed =
    (asset.visibility === "GAME" && verifyAssetSignature(c, assetId, viewer.signature, viewer.expires)) ||
    viewer.isAdmin ||
    (asset.ownerId !== null && asset.ownerId === viewer.userId);
  if (!allowed) return { error: 403 };
  const buffer = await c.storage.get(asset.storagePath);
  return { buffer, mimeType: asset.mimeType };
}

export async function readAssetBuffer(c: Container, assetId: string): Promise<Buffer> {
  const asset = await c.db.asset.findUniqueOrThrow({ where: { id: assetId } });
  if (asset.status === "DELETED") throw new Error(`Asset ${assetId} was deleted`);
  return c.storage.get(asset.storagePath);
}

export async function deleteAsset(c: Container, assetId: string | null | undefined): Promise<void> {
  if (!assetId) return;
  const asset = await c.db.asset.findUnique({ where: { id: assetId } });
  if (!asset || asset.status === "DELETED") return;
  await c.storage.delete(asset.storagePath);
  await c.db.asset.update({ where: { id: assetId }, data: { status: "DELETED", deletedAt: new Date() } });
}
