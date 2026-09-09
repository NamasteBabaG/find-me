import { hashToken, hmacSign, newId, safeEqual } from "@/lib/ids";
import type { Prisma } from "@prisma/client";
import { isPlayable } from "@/domain/order-state";
import { parseGameConfig } from "@/domain/game/config";
import type { Container } from "./container";
import { statusOf } from "./game-status";
import { audit, type Actor } from "./audit.service";
import { FIXED_WORLD_STYLE_VERSION, fixedStageAssert, fixedWorldConfigSha256, isFixedWorldStyle, readFixedWorldStage } from "./generation/fixed-world-stage-record";

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
  const game = await c.db.game.findUnique({ where: { id: gameId }, select: { styleVersion: true } });
  fixedStageAssert(game, "permission", "The game is unavailable for player links");
  if (isFixedWorldStyle(game.styleVersion)) return fixedPlayerLink(c, gameId);
  return ensureLinkIn(c, c.db, gameId);
}

async function ensureLinkIn(c: Container, db: Pick<Prisma.TransactionClient, "shareLink">, gameId: string) {
  const existing = await db.shareLink.findFirst({ where: { gameId, kind: "PLAYER", active: true }, orderBy: { createdAt: "desc" } });
  if (existing) {
    const token = tokenForLink(c, existing);
    return { id: existing.id, token, url: playUrl(c, token) };
  }
  const id = newId("shr");
  const createdAt = new Date();
  const token = tokenForLink(c, { id, createdAt });
  await db.shareLink.create({ data: { id, gameId, kind: "PLAYER", tokenHash: hashToken(token), createdAt } });
  return { id, token, url: playUrl(c, token) };
}

export async function rotatePlayerLink(c: Container, gameId: string, actor: Actor): Promise<{ url: string }> {
  const game = await c.db.game.findUnique({ where: { id: gameId }, select: { styleVersion: true } });
  fixedStageAssert(game, "permission", "The game is unavailable for player links");
  if (isFixedWorldStyle(game.styleVersion)) {
    const link = await fixedPlayerLink(c, gameId, actor);
    return { url: link.url };
  }
  await c.db.shareLink.updateMany({ where: { gameId, kind: "PLAYER", active: true }, data: { active: false, revokedAt: new Date() } });
  const link = await ensureLinkIn(c, c.db, gameId);
  await audit(c, actor, "share-link:rotated", "Game", gameId);
  return { url: link.url };
}

/**
 * Publication owns the expensive qualification checks. A link needs their
 * basic persisted proof, never merely a fixed style marker or an enrollment.
 * The shared Game-row fence serializes this whole operation with fixed deletion:
 * a deletion winner prevents link writes; a later deletion revokes our link.
 * No automatic retry after an uncertain commit, and no new authorization policy
 * here: owner/admin rotation callers keep their existing authentication gate.
 */
async function fixedPlayerLink(c: Container, gameId: string, rotateActor?: Actor) {
  return c.db.$transaction(async tx => {
    const game = await tx.game.findUnique({ where: { id: gameId } });
    fixedStageAssert(game && game.styleVersion === FIXED_WORLD_STYLE_VERSION, "unsupported", "Unsupported fixed-world link version");
    fixedStageAssert(!game.deletedAt && (game.status === "READY" || game.status === "DELIVERED") && game.configJson, "permission", "A fixed world needs a live manually published config before links can be issued");
    const config = parseGameConfig(game.configJson);
    const job = await tx.generationJob.findUnique({ where: { id: `job_${gameId}` } });
    const record = job ? readFixedWorldStage(job.stepsJson) : null;
    fixedStageAssert(job && job.gameId === gameId && job.status === "DONE" && record && record.state === "staged" && record.gameId === gameId && record.ownerId === game.ownerId && record.childProfileId === game.childProfileId, "integrity", "A published fixed-world staging record is required for links");
    fixedStageAssert(config.gameId === gameId && config.styleVersion === FIXED_WORLD_STYLE_VERSION && config.locale === game.locale && config.packageTier === "ONE_WORLD" && config.scenes.length === 9 && fixedWorldConfigSha256(config) === record.configSha256, "integrity", "The fixed-world config differs from its publication proof");
    const claim = await tx.game.updateMany({
      where: { id: gameId, styleVersion: FIXED_WORLD_STYLE_VERSION, status: game.status, deletedAt: null, updatedAt: game.updatedAt, configJson: game.configJson, ownerId: game.ownerId, childProfileId: game.childProfileId },
      // Always advance the fence, including two calls within one millisecond.
      data: { updatedAt: new Date(Math.max(Date.now(), game.updatedAt.getTime() + 1)) },
    });
    fixedStageAssert(claim.count === 1, "conflict", "Fixed-world link fence was lost");
    if (rotateActor) await tx.shareLink.updateMany({ where: { gameId, kind: "PLAYER", active: true }, data: { active: false, revokedAt: new Date() } });
    const link = await ensureLinkIn(c, tx, gameId);
    if (rotateActor) await tx.auditLog.create({ data: { id: newId("aud"), actorType: rotateActor.type, actorId: "id" in rotateActor ? rotateActor.id : null, action: "share-link:rotated", entityType: "Game", entityId: gameId } });
    return link;
  }, { maxWait: 5_000, timeout: 15_000 });
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
