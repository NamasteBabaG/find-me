import { hashToken, hmacSign, newId, safeEqual } from "@/lib/ids";
import { isPlayable } from "@/domain/order-state";
import type { Container } from "./container";
import { statusOf } from "./game-status";
import { audit, type Actor } from "./audit.service";

/**
 * Player links are bearer tokens: `<linkId>.<hmac>`.
 * The HMAC is derived from the row (id + createdAt) and the server secret, so
 * the link can be re-displayed in the library without storing it in clear.
 * The DB keeps only a SHA-256 of the token for lookups/forensics.
 * Rotation = revoke row + create a new one (old links stop working instantly).
 */
export function linkSignature(c: Pick<Container, "secret">, link: { id: string; createdAt: Date }): string {
  return hmacSign(`share:${link.id}:${link.createdAt.getTime()}`, c.secret);
}

export function tokenForLink(c: Pick<Container, "secret">, link: { id: string; createdAt: Date }): string {
  return `${link.id}.${linkSignature(c, link)}`;
}

/** Constant-time check of a `<linkId>.<hmac>` token against the link row. */
export function verifyLinkToken(c: Pick<Container, "secret">, link: { id: string; createdAt: Date }, token: string): boolean {
  const [id, sig] = token.split(".");
  if (!id || !sig || id !== link.id) return false;
  return safeEqual(linkSignature(c, link), sig);
}

export function playUrl(c: Container, token: string): string {
  return `${c.appUrl}/play/${token}`;
}

export async function ensurePlayerLink(c: Container, gameId: string): Promise<{ id: string; token: string; url: string }> {
  const existing = await c.db.shareLink.findFirst({ where: { gameId, kind: "PLAYER", active: true }, orderBy: { createdAt: "desc" } });
  if (existing) {
    const token = tokenForLink(c, existing);
    return { id: existing.id, token, url: playUrl(c, token) };
  }
  const id = newId("shr");
  const createdAt = new Date();
  const token = tokenForLink(c, { id, createdAt });
  await c.db.shareLink.create({ data: { id, gameId, kind: "PLAYER", tokenHash: hashToken(token), createdAt } });
  return { id, token, url: playUrl(c, token) };
}

export async function rotatePlayerLink(c: Container, gameId: string, actor: Actor): Promise<{ url: string }> {
  await c.db.shareLink.updateMany({ where: { gameId, kind: "PLAYER", active: true }, data: { active: false, revokedAt: new Date() } });
  const link = await ensurePlayerLink(c, gameId);
  await audit(c, actor, "share-link:rotated", "Game", gameId);
  return { url: link.url };
}

export async function revokePlayerLinks(c: Container, gameId: string, actor: Actor): Promise<void> {
  await c.db.shareLink.updateMany({ where: { gameId, active: true }, data: { active: false, revokedAt: new Date() } });
  await audit(c, actor, "share-link:revoked", "Game", gameId);
}

export type ResolvedPlay = { ok: true; game: { id: string; status: string; configJson: string | null; title: string | null } } | { ok: false; reason: "invalid" | "revoked" | "not-ready" };

export async function resolvePlayToken(c: Container, token: string): Promise<ResolvedPlay> {
  const [id, sig] = token.split(".");
  if (!id || !sig || !id.startsWith("shr_")) return { ok: false, reason: "invalid" };
  const link = await c.db.shareLink.findUnique({ where: { id }, include: { game: { select: { id: true, status: true, configJson: true, title: true, deletedAt: true } } } });
  if (!link) return { ok: false, reason: "invalid" };
  if (!verifyLinkToken(c, link, token)) return { ok: false, reason: "invalid" };
  if (hashToken(token) !== link.tokenHash) return { ok: false, reason: "invalid" };
  if (!link.active || (link.expiresAt && link.expiresAt.getTime() < Date.now()) || link.game.deletedAt) return { ok: false, reason: "revoked" };
  if (!isPlayable(statusOf(link.game))) return { ok: false, reason: "not-ready" };
  return { ok: true, game: link.game };
}
