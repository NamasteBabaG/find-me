import { Prisma, type GuestParticipant, type GuestShare } from "@prisma/client";
import { hashToken, hmacSign, newSecretToken, safeEqual } from "@/lib/ids";
import { gameAssetId } from "@/domain/adventure/image-binding";
import { parseGameConfig, type GameConfig } from "@/domain/game/config";
import { emptyGuestSnapshot, guestBoardStates, guestWorldConfig, GuestNicknameId, GuestSharingError, GuestSnapshotSchema,
  mergeGuestSnapshot, type GuestNickname, type GuestSnapshot } from "@/domain/guest-sharing";
import type { Container } from "./container";

type C = Pick<Container, "db" | "storage" | "secret" | "appUrl">;
type Tx = Prisma.TransactionClient;
export const GUEST_SHARE_LIFETIME_MS = 30 * 86400_000;
export const GUEST_RESULT_RETENTION_MS = 90 * 86400_000;
export const GUEST_COOKIE_PREFIX = "findme_friend_";
const credential = /^(gsr|gpt)_([a-f0-9]{20})\.([A-Za-z0-9_-]{43})$/;
const personalUrl = /\/api\/assets\/([A-Za-z0-9_-]+)(?:\?[^"\\]*)?/g;
const nextId = (prefix: "gsr") => `${prefix}_${hashToken(newSecretToken()).slice(0, 20)}`;
const unavailable = () => new GuestSharingError("unavailable");
const json = (value: string): unknown => { try { return JSON.parse(value); } catch { throw unavailable(); } };
function splitToken(value: string, kind: "gsr" | "gpt") {
  const match = credential.exec(value);
  if (!match || match[1] !== kind) throw unavailable();
  return { id: `${match[1]}_${match[2]}`, secret: match[3]! };
}
export function guestShareId(token: string): string { return splitToken(token, "gsr").id; }
export function guestCookieName(shareId: string): string {
  if (!/^gsr_[a-f0-9]{20}$/.test(shareId)) throw unavailable();
  return `${GUEST_COOKIE_PREFIX}${shareId}`;
}
export interface GuestParticipantView { id: string; nicknameId: GuestNickname; revision: number; snapshot: GuestSnapshot }
export interface GuestSessionView { shareId: string; worldSlug: string; worldName: string; childName: string; expiresAt: string; participant: GuestParticipantView | null }
export interface GuestParticipantSummary { id: string; shareId: string; nicknameId: GuestNickname; createdAt: string; lastActivityAt: string;
  revision: number; activityRevision: number; hasNew: boolean; completedBoards: number; totalBoards: number; finds: number; totalFinds: number;
  complete: boolean; reactionId: GuestSnapshot["reactionId"]; boards: ReturnType<typeof guestBoardStates> }
export interface GuestOwnerReport { gameId: string; worldSlug: string; hasNew: boolean;
  shares: Array<{ id: string; active: boolean; expiresAt: string; revokedAt: string | null; revision: number; seenRevision: number }>;
  participants: GuestParticipantSummary[] }
function participantView(row: GuestParticipant): GuestParticipantView {
  const parsed = GuestSnapshotSchema.safeParse(json(row.snapshotJson));
  if (!parsed.success || !GuestNicknameId.safeParse(row.nicknameId).success) throw unavailable();
  return { id: row.id, nicknameId: row.nicknameId as GuestNickname, revision: row.revision, snapshot: parsed.data };
}
function active(share: GuestShare, now = Date.now()) { return !share.revokedAt && share.expiresAt.getTime() > now; }

async function gameContext(db: Pick<Tx, "game">, gameId: string, ownerId?: string) {
  const game = await db.game.findUnique({ where: { id: gameId }, include: { orders: true, familyChild: true } });
  if (!game || !game.ownerId || (ownerId && game.ownerId !== ownerId) || game.deletedAt || !["READY", "DELIVERED"].includes(game.status)
    || !game.configJson || game.familyChild?.deletedAt || (game.familyChild && game.familyChild.ownerId !== game.ownerId)
    || !game.orders.some(order => order.userId === game.ownerId && order.paymentStatus === "PAID")
    || game.orders.some(order => order.paymentStatus === "REFUNDED" || order.refundedAt)) throw unavailable();
  return game;
}
async function resolveShare(c: C, token: string, db: Pick<Tx, "guestShare" | "game"> = c.db) {
  const parsed = splitToken(token, "gsr");
  const share = await db.guestShare.findUnique({ where: { id: parsed.id } });
  if (!share || !active(share) || !safeEqual(share.tokenHash, hashToken(parsed.secret))) throw unavailable();
  const game = await gameContext(db, share.gameId, share.ownerId);
  if (share.sourceConfigSha256 !== hashToken(game.configJson!)) throw unavailable();
  const config = parseGameConfig(share.configJson);
  if (config.gameId !== game.id || config.worlds?.length !== 1 || config.worlds[0]?.slug !== share.worldSlug || config.scenes.length !== 9) throw unavailable();
  return { share, game, config };
}
async function resolveParticipant(c: C, token: string, participantToken: string | null, participantId: string, db: Tx | C["db"] = c.db) {
  const context = await resolveShare(c, token, db);
  const parsed = splitToken(participantToken ?? "", "gpt");
  if (parsed.id !== participantId) throw new GuestSharingError("conflict");
  const participant = await db.guestParticipant.findFirst({ where: { id: parsed.id, shareId: context.share.id, removedAt: null } });
  if (!participant || !safeEqual(participant.tokenHash, hashToken(parsed.secret))) throw unavailable();
  return { ...context, participant };
}

/** Same row lock used by game deletion, whose deleteAdventureAlbum helper
 * purges sharing tables. No new snapshot or participant can appear afterwards. */
async function fenceGame(tx: Tx, game: Awaited<ReturnType<typeof gameContext>>) {
  const locked = await tx.game.updateMany({ where: { id: game.id, ownerId: game.ownerId, deletedAt: null,
    status: game.status, updatedAt: game.updatedAt, configJson: game.configJson }, data: { updatedAt: game.updatedAt } });
  if (locked.count !== 1) throw new GuestSharingError("conflict");
}
async function fenceShare(tx: Tx, share: GuestShare) {
  const locked = await tx.guestShare.updateMany({ where: { id: share.id, tokenHash: share.tokenHash,
    revokedAt: null, expiresAt: { gt: new Date() }, revision: share.revision }, data: { revision: share.revision } });
  if (locked.count !== 1) throw unavailable();
}
async function transaction<T>(c: C, work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await c.db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 }); }
    catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt < 2 && ["P2034", "P2002"].includes(code ?? "")) continue;
      throw error;
    }
  }
}
function assetIds(config: GameConfig): string[] {
  return [...new Set([...JSON.stringify(config).matchAll(personalUrl)].map(match => match[1]!))];
}
async function validatePersonalAssets(db: Pick<Tx, "asset">, config: GameConfig, ownerId: string) {
  const ids = assetIds(config);
  const assets = await db.asset.findMany({ where: { id: { in: ids }, ownerId, visibility: "GAME", status: "READY", deletedAt: null,
    type: { in: ["AVATAR", "TARGET_SPRITE", "THUMBNAIL", "BOARD_ART"] } }, select: { id: true } });
  if (!ids.length || assets.length !== ids.length || !gameAssetId(config.child.avatarUrl)) throw unavailable();
}
const shareView = (share: GuestShare, sourceConfigSha256: string) => ({ id: share.id, worldSlug: share.worldSlug,
  active: active(share) && share.sourceConfigSha256 === sourceConfigSha256, stale: share.sourceConfigSha256 !== sourceConfigSha256,
  expiresAt: share.expiresAt.toISOString(), revokedAt: share.revokedAt?.toISOString() ?? null });

async function closeGuestShares(tx: Tx, gameId: string, ownerId: string, worldSlug: string, now: Date) {
  const shares = await tx.guestShare.findMany({ where: { gameId, ownerId, worldSlug, revokedAt: null }, select: { id: true, expiresAt: true } });
  for (const share of shares) await tx.guestShare.updateMany({ where: { id: share.id, gameId, ownerId, worldSlug, revokedAt: null },
    data: { revokedAt: now, resultsDeleteAt: new Date(Math.min(now.getTime(), share.expiresAt.getTime()) + GUEST_RESULT_RETENTION_MS) } });
}

export async function manageGuestShare(c: C, ownerId: string, input: { gameId: string; worldSlug: string; operation: "status" | "create" | "rotate" | "revoke" }) {
  return transaction(c, async tx => {
    const game = await gameContext(tx, input.gameId, ownerId);
    await fenceGame(tx, game);
    const config = guestWorldConfig(parseGameConfig(game.configJson!), input.worldSlug);
    const sourceConfigSha256 = hashToken(game.configJson!);
    const previous = await tx.guestShare.findFirst({ where: { gameId: game.id, worldSlug: input.worldSlug, ownerId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    if (input.operation === "status") return { share: previous ? shareView(previous, sourceConfigSha256) : null, url: null };
    if (input.operation === "revoke") {
      await closeGuestShares(tx, game.id, ownerId, input.worldSlug, new Date());
      const closed = previous ? await tx.guestShare.findUnique({ where: { id: previous.id } }) : null;
      return { share: closed ? shareView(closed, sourceConfigSha256) : null, url: null };
    }
    if (input.operation === "create" && previous && shareView(previous, sourceConfigSha256).active) return { share: shareView(previous, sourceConfigSha256), url: null };
    await validatePersonalAssets(tx, config, ownerId);
    await closeGuestShares(tx, game.id, ownerId, input.worldSlug, new Date());
    const secret = newSecretToken(), now = new Date(), expiresAt = new Date(now.getTime() + GUEST_SHARE_LIFETIME_MS);
    const share = await tx.guestShare.create({ data: { id: nextId("gsr"), gameId: game.id, ownerId, worldSlug: input.worldSlug,
      tokenHash: hashToken(secret), sourceConfigSha256, configJson: JSON.stringify(config), createdAt: now,
      expiresAt, resultsDeleteAt: new Date(expiresAt.getTime() + GUEST_RESULT_RETENTION_MS) } });
    // The grant never enters a URL path, request log or analytics property.
    const url = new URL("/friends", c.appUrl); url.hash = `${share.id}.${secret}`;
    return { share: shareView(share, sourceConfigSha256), url: url.toString() };
  });
}

export async function guestSession(c: C, token: string, participantToken: string | null,
  input: { operation: "inspect" | "start" | "resume" | "another"; participantId?: string; nicknameId?: GuestNickname; joinKey?: string }): Promise<{ view: GuestSessionView; cookie?: { name: string; value: string; expires: Date } }> {
  return transaction(c, async tx => {
    const context = await resolveShare(c, token, tx);
    const { share, game, config } = context;
    await fenceGame(tx, game); await fenceShare(tx, share);
    let participant: GuestParticipant | null = null, cookie: { name: string; value: string; expires: Date } | undefined;
    if (participantToken) {
      try {
        const parsed = splitToken(participantToken, "gpt");
        const row = await tx.guestParticipant.findFirst({ where: { id: parsed.id, shareId: share.id, removedAt: null } });
        if (row && safeEqual(row.tokenHash, hashToken(parsed.secret))) participant = row;
      } catch { /* A missing/old local credential never reveals another participant. */ }
    }
    if (input.operation === "resume" && (!participant || participant.id !== input.participantId)) throw new GuestSharingError("conflict");
    if (input.operation === "another" || input.operation === "start" && !participant) {
      if (!input.joinKey || !/^[A-Za-z0-9_-]{32,80}$/.test(input.joinKey)) throw new GuestSharingError("invalid-event");
      const nickname = GuestNicknameId.parse(input.nicknameId ?? "guest");
      const id = `gpt_${hashToken(`${share.id}:${input.joinKey}`).slice(0, 20)}`;
      const secret = hmacSign(`friends-participant:${share.id}:${input.joinKey}:${share.tokenHash}`, c.secret);
      participant = await tx.guestParticipant.findUnique({ where: { id } });
      if (participant && (participant.shareId !== share.id || participant.removedAt || participant.tokenHash !== hashToken(secret))) throw unavailable();
      if (!participant) {
        // A hard per-link cap also bounds report payloads and anonymous storage.
        if (await tx.guestParticipant.count({ where: { shareId: share.id } }) >= 100) throw unavailable();
        const updated = await tx.guestShare.update({ where: { id: share.id }, data: { revision: { increment: 1 } } });
        participant = await tx.guestParticipant.create({ data: { id, shareId: share.id, tokenHash: hashToken(secret), nicknameId: nickname,
          snapshotJson: JSON.stringify(emptyGuestSnapshot()), activityRevision: updated.revision } });
      }
      cookie = { name: guestCookieName(share.id), value: `${participant.id}.${secret}`, expires: share.expiresAt };
    }
    return { view: { shareId: share.id, worldSlug: share.worldSlug, worldName: config.worlds![0]!.name,
      childName: config.child.name, expiresAt: share.expiresAt.toISOString(), participant: participant ? participantView(participant) : null }, ...(cookie ? { cookie } : {}) };
  });
}

function mediaProof(c: C, share: GuestShare, participantId: string, assetId: string) {
  return hmacSign(`friends-media:${share.id}:${participantId}:${assetId}:${share.sourceConfigSha256}`, c.secret);
}
export async function guestPlay(c: C, token: string, participantToken: string | null, participantId: string) {
  const { share, config, participant } = await resolveParticipant(c, token, participantToken, participantId);
  const rewritten = JSON.stringify(config).replace(personalUrl, (_url, assetId: string) => `/api/assets/${assetId}?${new URLSearchParams({
    guestShare: share.id, guestParticipant: participant.id, guestProof: mediaProof(c, share, participant.id, assetId) })}`);
  return { config: parseGameConfig(rewritten), participant: participantView(participant), shareId: share.id, expiresAt: share.expiresAt.toISOString() };
}

export async function saveGuestProgress(c: C, token: string, participantToken: string | null, participantId: string, snapshot: unknown) {
  return transaction(c, async tx => {
    const { share, game, config, participant } = await resolveParticipant(c, token, participantToken, participantId, tx);
    await fenceGame(tx, game); await fenceShare(tx, share);
    const result = mergeGuestSnapshot(config, json(participant.snapshotJson), snapshot);
    if (!result.changed) return { participant: participantView(participant), changed: false };
    const revision = await tx.guestShare.update({ where: { id: share.id }, data: { revision: { increment: 1 } } });
    const won = await tx.guestParticipant.updateMany({ where: { id: participant.id, shareId: share.id, removedAt: null,
      tokenHash: participant.tokenHash, revision: participant.revision }, data: { snapshotJson: JSON.stringify(result.snapshot), revision: { increment: 1 }, activityRevision: revision.revision } });
    if (won.count !== 1) throw new GuestSharingError("conflict");
    return { participant: { id: participant.id, nicknameId: participant.nicknameId as GuestNickname, revision: participant.revision + 1, snapshot: result.snapshot }, changed: true };
  });
}

/** Guest-bound asset capability. Its URL alone is insufficient; it never falls
 * through to ordinary seven-day GAME signatures. Check again after storage I/O. */
export async function guestMedia(c: C, input: { shareId: string; participantId: string; participantToken: string | null; assetId: string; proof: string }) {
  const read = async () => {
    const share = await c.db.guestShare.findUnique({ where: { id: input.shareId } });
    if (!share || !active(share)) throw unavailable();
    const game = await gameContext(c.db, share.gameId, share.ownerId);
    if (hashToken(game.configJson!) !== share.sourceConfigSha256) throw unavailable();
    const parsed = splitToken(input.participantToken ?? "", "gpt");
    if (parsed.id !== input.participantId) throw unavailable();
    const participant = await c.db.guestParticipant.findFirst({ where: { id: parsed.id, shareId: share.id, removedAt: null } });
    if (!participant || !safeEqual(participant.tokenHash, hashToken(parsed.secret))
      || !safeEqual(mediaProof(c, share, participant.id, input.assetId), input.proof)) throw unavailable();
    const config = parseGameConfig(share.configJson);
    if (!assetIds(config).includes(input.assetId)) throw unavailable();
    const asset = await c.db.asset.findFirst({ where: { id: input.assetId, ownerId: share.ownerId, visibility: "GAME", status: "READY", deletedAt: null,
      type: { in: ["AVATAR", "TARGET_SPRITE", "THUMBNAIL", "BOARD_ART"] } } });
    if (!asset) throw unavailable();
    return asset;
  };
  const asset = await read(), bytes = await c.storage.get(asset.storagePath), current = await read();
  if (current.storagePath !== asset.storagePath || current.mimeType !== asset.mimeType) throw unavailable();
  return { bytes, mimeType: asset.mimeType };
}

export async function guestOwnerReport(c: C, ownerId: string, gameId: string, worldSlug: string,
  input?: { markSeen?: Array<{ shareId: string; revision: number }>; removeParticipantId?: string }): Promise<GuestOwnerReport> {
  return transaction(c, async tx => {
    const game = await gameContext(tx, gameId, ownerId); await fenceGame(tx, game);
    guestWorldConfig(parseGameConfig(game.configJson!), worldSlug);
    const shares = await tx.guestShare.findMany({ where: { gameId, ownerId, worldSlug, resultsDeleteAt: { gt: new Date() } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { participants: { where: { removedAt: null }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } });
    if (input?.removeParticipantId) {
      const removed = await tx.guestParticipant.updateMany({ where: { id: input.removeParticipantId, shareId: { in: shares.map(share => share.id) }, removedAt: null },
        data: { removedAt: new Date(), snapshotJson: JSON.stringify(emptyGuestSnapshot()) } });
      if (removed.count !== 1) throw unavailable();
    }
    for (const seen of input?.markSeen ?? []) {
      const share = shares.find(row => row.id === seen.shareId);
      if (!share || !Number.isSafeInteger(seen.revision) || seen.revision < 0 || seen.revision > share.revision) throw new GuestSharingError("invalid-event");
      if (seen.revision > share.seenRevision) {
        await tx.guestShare.updateMany({ where: { id: share.id, ownerId, seenRevision: { lt: seen.revision } }, data: { seenRevision: seen.revision } });
        share.seenRevision = seen.revision;
      }
    }
    const participants = shares.flatMap(share => share.participants.filter(row => row.id !== input?.removeParticipantId).map(row => {
      const config = parseGameConfig(share.configJson), view = participantView(row), boards = guestBoardStates(config, view.snapshot);
      return { id: row.id, shareId: share.id, nicknameId: view.nicknameId, createdAt: row.createdAt.toISOString(), lastActivityAt: row.updatedAt.toISOString(),
        revision: row.revision, activityRevision: row.activityRevision, hasNew: row.activityRevision > share.seenRevision,
        completedBoards: boards.filter(board => board.state === "complete").length, totalBoards: boards.length,
        finds: view.snapshot.finds.length, totalFinds: boards.reduce((n, board) => n + board.total, 0), complete: boards.every(board => board.state === "complete"),
        reactionId: view.snapshot.reactionId, boards };
    }));
    return { gameId, worldSlug, hasNew: participants.some(row => row.hasNew), participants,
      shares: shares.map(share => ({ id: share.id, active: shareView(share, hashToken(game.configJson!)).active, expiresAt: share.expiresAt.toISOString(), revokedAt: share.revokedAt?.toISOString() ?? null, revision: share.revision, seenRevision: share.seenRevision })) };
  });
}

export async function cleanupGuestSharing(db: Pick<C["db"], "guestShare">, now = new Date(), limit = 100): Promise<number> {
  const rows = await db.guestShare.findMany({ where: { resultsDeleteAt: { lte: now } }, orderBy: [{ resultsDeleteAt: "asc" }, { id: "asc" }], take: Math.max(1, Math.min(100, limit)), select: { id: true } });
  if (!rows.length) return 0;
  const result = await db.guestShare.deleteMany({ where: { id: { in: rows.map(row => row.id) }, resultsDeleteAt: { lte: now } } });
  return result.count;
}
