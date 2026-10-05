import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "@/lib/test-schema";
import { hashToken } from "@/lib/ids";
import { parseGameConfig } from "@/domain/game/config";
import { emptyGuestSnapshot, type GuestSnapshot } from "@/domain/guest-sharing";
import { guestConfig } from "./guest-sharing-fixture";
import { cleanupGuestSharing, guestMedia, guestOwnerReport, guestPlay, guestSession, manageGuestShare, saveGuestProgress } from "../guest-sharing.service";
import { ownerAdventureAlbum } from "../adventure-album.service";
import { deleteGame } from "../game.service";
import { runRetentionIfDue } from "../retention.service";
import type { Container } from "../container";

vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: "test" }), flag: () => false, spendGuard: () => ({ appEnv: "test", realGeneration: false, testers: [] }) }));
let scratch: string, db: PrismaClient, sequence = 0;
const owner = "guest-parent", other = "guest-other-parent";
const storage = { id: "local" as const, get: vi.fn(async (_key: string) => Buffer.from("synthetic illustrated GAME bytes")), delete: vi.fn(async () => {}),
  put: vi.fn(async () => {}), exists: vi.fn(async () => true) };
const c = () => ({ db, storage, secret: "synthetic-friends-purpose-secret-32", appUrl: "http://localhost:3107" });
beforeAll(async () => {
  scratch = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-guest-test-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  await db.user.createMany({ data: [{ id: owner, email: "guest-owner@example.invalid" }, { id: other, email: "guest-other@example.invalid" }] });
}, 30_000);
afterAll(async () => {
  await db?.$disconnect();
  if (scratch && path.dirname(scratch) === realpathSync(tmpdir()) && path.basename(scratch).startsWith("findme-guest-test-")) rmSync(scratch, { recursive: true, force: true });
});
async function fixture() {
  const gameId = `guest-game-${++sequence}`, raw = guestConfig(gameId);
  const config = parseGameConfig(JSON.stringify(raw).replaceAll("synthetic-avatar", `${gameId}-avatar`).replace(/synthetic-([012])/g, `${gameId}-target-$1`));
  const child = await db.familyChild.create({ data: { id: `${gameId}-child`, ownerId: owner, displayName: "Synthetic child" } });
  await db.game.create({ data: { id: gameId, ownerId: owner, familyChildId: child.id, status: "DELIVERED", styleVersion: "synthetic", configJson: JSON.stringify(config) } });
  const orderId = `${gameId}-order`;
  await db.order.create({ data: { id: orderId, gameId, userId: owner, amountAgorot: 3900, packageTier: "TWO_WORLDS", provider: "mock", paymentStatus: "PAID" } });
  await db.asset.createMany({ data: ["avatar", "target-0", "target-1", "target-2"].map(type => ({ id: `${gameId}-${type}`, ownerId: owner, visibility: "GAME", type: type === "avatar" ? "AVATAR" : "TARGET_SPRITE", storagePath: `game/${gameId}-${type}.png`, mimeType: "image/png" })) });
  const grant = await manageGuestShare(c(), owner, { gameId, worldSlug: "world-1", operation: "create" });
  const token = new URL(grant.url!).hash.slice(1), shareId = grant.share!.id;
  return { gameId, config, child, orderId, token, shareId };
}
async function join(token: string, cookie: string | null = null, operation: "start" | "another" = "start", joinKey = "synthetic-join-key-" + "a".repeat(32)) {
  const result = await guestSession(c(), token, cookie, { operation, joinKey, nicknameId: "star" });
  return { ...result, participantId: result.view.participant!.id, credential: result.cookie?.value ?? cookie! };
}
const snapshot = (data: Partial<GuestSnapshot>) => ({ ...emptyGuestSnapshot(), ...data });
const find = (id: string) => ({ sceneSlug: "board-1-1", targetId: id, variant: "A" as const });
function mediaInput(config: Awaited<ReturnType<typeof guestPlay>>["config"], credential: string) {
  const url = new URL(config.child.avatarUrl, "http://localhost:3107");
  return { assetId: url.pathname.split("/").at(-1)!, shareId: url.searchParams.get("guestShare")!, participantId: url.searchParams.get("guestParticipant")!, proof: url.searchParams.get("guestProof")!, participantToken: credential };
}

describe("frozen one-world friends sharing against SQLite", () => {
  it("stores only secret hashes, discloses the URL once, and never adopts foreign/unpaid games", async () => {
    const f = await fixture(), row = await db.guestShare.findUniqueOrThrow({ where: { id: f.shareId } });
    expect(row.tokenHash).toBe(hashToken(f.token.split(".")[1]!)); expect(row.configJson).not.toContain(f.token);
    expect(JSON.parse(row.configJson).scenes).toHaveLength(9); expect(row.configJson).not.toContain("board-2-"); expect(row.configJson).not.toContain("Synthetic sender");
    expect((await manageGuestShare(c(), owner, { gameId: f.gameId, worldSlug: "world-1", operation: "create" })).url).toBeNull();
    await expect(manageGuestShare(c(), other, { gameId: f.gameId, worldSlug: "world-1", operation: "create" })).rejects.toThrow("unavailable");
    await db.order.update({ where: { id: f.orderId }, data: { paymentStatus: "PENDING" } });
    await expect(guestSession(c(), f.token, null, { operation: "inspect" })).rejects.toThrow("unavailable");
  });
  it("a repaired config reports its old grant as stale and create recovers without losing earlier results", async () => {
    const f = await fixture(), a = await join(f.token);
    await saveGuestProgress(c(), f.token, a.credential, a.participantId, snapshot({ finds: [find("hide-1")] }));
    expect((await manageGuestShare(c(), owner, { gameId: f.gameId, worldSlug: "world-1", operation: "status" })).share).toMatchObject({ active: true, stale: false });
    await db.game.update({ where: { id: f.gameId }, data: { configJson: JSON.stringify({ ...f.config, composedAt: "repaired" }) } });
    const status = await manageGuestShare(c(), owner, { gameId: f.gameId, worldSlug: "world-1", operation: "status" });
    expect(status.share).toMatchObject({ id: f.shareId, active: false, stale: true }); expect(status.url).toBeNull();
    expect((await guestOwnerReport(c(), owner, f.gameId, "world-1")).shares[0]!.active).toBe(false);
    const replacement = await manageGuestShare(c(), owner, { gameId: f.gameId, worldSlug: "world-1", operation: "create" });
    expect(replacement.share).toMatchObject({ active: true, stale: false }); expect(replacement.share!.id).not.toBe(f.shareId);
    expect(replacement.url).toBeTruthy();
    const nextToken = new URL(replacement.url!).hash.slice(1);
    expect((await guestSession(c(), nextToken, null, { operation: "inspect" })).view.shareId).toBe(replacement.share!.id);
    await expect(guestPlay(c(), f.token, a.credential, a.participantId)).rejects.toThrow("unavailable");
    const old = await db.guestShare.findUniqueOrThrow({ where: { id: f.shareId } });
    expect(old.revokedAt).not.toBeNull(); expect(old.resultsDeleteAt.getTime() - old.revokedAt!.getTime()).toBeCloseTo(90 * 86400_000, -1);
    expect((await guestOwnerReport(c(), owner, f.gameId, "world-1")).participants).toEqual([expect.objectContaining({ id: a.participantId, finds: 1 })]);
    expect((await manageGuestShare(c(), owner, { gameId: f.gameId, worldSlug: "world-1", operation: "create" })).url).toBeNull();
  });
  it("inspection lists no other participants; a retry of one join key makes one identity", async () => {
    const f = await fixture(), a = await join(f.token), retry = await join(f.token);
    expect(retry.participantId).toBe(a.participantId); expect(retry.credential).toBe(a.credential);
    expect(await db.guestParticipant.count({ where: { shareId: f.shareId } })).toBe(1);
    expect((await guestSession(c(), f.token, null, { operation: "inspect" })).view.participant).toBeNull();
    expect((await guestSession(c(), f.token, a.credential, { operation: "resume", participantId: a.participantId })).view.participant?.id).toBe(a.participantId);
    expect(await db.guestParticipant.findUniqueOrThrow({ where: { id: a.participantId } })).toMatchObject({ tokenHash: hashToken(a.credential.split(".")[1]!) });
  });
  it("another person has independent results; an old tab cannot write or play the new person's session", async () => {
    const f = await fixture(), a = await join(f.token);
    await saveGuestProgress(c(), f.token, a.credential, a.participantId, snapshot({ finds: [find("hide-1")] }));
    const b = await join(f.token, a.credential, "another", "synthetic-second-key-" + "b".repeat(32));
    expect(b.participantId).not.toBe(a.participantId); expect(b.view.participant?.snapshot.finds).toHaveLength(0);
    await expect(saveGuestProgress(c(), f.token, b.credential, a.participantId, emptyGuestSnapshot())).rejects.toMatchObject({ code: "conflict" });
    await expect(guestPlay(c(), f.token, b.credential, a.participantId)).rejects.toMatchObject({ code: "conflict" });
    await expect(guestSession(c(), f.token, b.credential, { operation: "resume", participantId: a.participantId })).rejects.toMatchObject({ code: "conflict" });
    expect((await guestOwnerReport(c(), owner, f.gameId, "world-1")).participants.map(p => p.finds)).toEqual([1, 0]);
  });
  it("unique-target writes are idempotent, stale snapshots merge, and never touch the owner's passport", async () => {
    const f = await fixture(), a = await join(f.token), input = snapshot({ finds: [find("hide-1"), find("hide-1")] });
    const first = await saveGuestProgress(c(), f.token, a.credential, a.participantId, input);
    const second = await saveGuestProgress(c(), f.token, a.credential, a.participantId, input);
    expect(first.changed).toBe(true); expect(second.changed).toBe(false); expect(second.participant.revision).toBe(first.participant.revision);
    const stale = await saveGuestProgress(c(), f.token, a.credential, a.participantId, snapshot({ finds: [find("hide-2")] }));
    expect(stale.participant.snapshot.finds).toHaveLength(2);
    expect(await db.adventureAlbumProgress.count({ where: { gameId: f.gameId } })).toBe(0);
    const owned = await ownerAdventureAlbum(db, owner, f.gameId);
    expect(owned.progress.finds).toHaveLength(0);
  });
  it("a later tab's different reaction receives the first canonical reaction while valid discoveries still save", async () => {
    const f = await fixture(), a = await join(f.token);
    const done = snapshot({ finds: f.config.scenes.filter(scene => scene.worldSlug === "world-1").flatMap(scene => scene.targets.map(target => ({ sceneSlug: scene.slug, targetId: target.id, variant: "A" as const }))), reactionId: "wow" });
    const first = await saveGuestProgress(c(), f.token, a.credential, a.participantId, done);
    const second = await saveGuestProgress(c(), f.token, a.credential, a.participantId, { ...done, reactionId: "again" });
    expect(second.changed).toBe(false); expect(second.participant.snapshot.reactionId).toBe("wow"); expect(second.participant.revision).toBe(first.participant.revision);
    const discovery = { sceneSlug: "board-1-1", discoveryId: "cat" };
    const latest = await saveGuestProgress(c(), f.token, a.credential, a.participantId, snapshot({ reactionId: "loved", discoveries: [discovery] }));
    expect(latest.changed).toBe(true); expect(latest.participant.snapshot.reactionId).toBe("wow"); expect(latest.participant.snapshot.discoveries).toEqual([discovery]);
    await expect(saveGuestProgress(c(), f.token, a.credential, a.participantId, snapshot({ reactionId: "again", finds: [find("unknown")] }))).rejects.toThrow("invalid-event");
  });
  it("server reports distinguish ready visits from untouched boards and acknowledge only observed revisions", async () => {
    const f = await fixture(), a = await join(f.token);
    await saveGuestProgress(c(), f.token, a.credential, a.participantId, snapshot({ visited: ["board-1-1"] }));
    const report = await guestOwnerReport(c(), owner, f.gameId, "world-1"), revision = report.shares[0]!.revision;
    expect(report.participants[0]?.boards[0]?.state).toBe("visited"); expect(report.participants[0]?.boards[1]?.state).toBe("unvisited");
    expect((await guestOwnerReport(c(), owner, f.gameId, "world-1", { markSeen: [{ shareId: f.shareId, revision }] })).hasNew).toBe(false);
    await saveGuestProgress(c(), f.token, a.credential, a.participantId, snapshot({ finds: [find("hide-1")] }));
    expect((await guestOwnerReport(c(), owner, f.gameId, "world-1", { markSeen: [{ shareId: f.shareId, revision }] })).hasNew).toBe(true);
    await expect(guestOwnerReport(c(), owner, f.gameId, "world-1", { markSeen: [{ shareId: f.shareId, revision: revision + 99 }] })).rejects.toThrow("invalid-event");
    await expect(guestOwnerReport(c(), other, f.gameId, "world-1")).rejects.toThrow("unavailable");
  });
  it("denies cross-world/unknown targets and locked-board writes without activity or revision changes", async () => {
    const f = await fixture(), a = await join(f.token), before = await db.guestShare.findUniqueOrThrow({ where: { id: f.shareId } });
    for (const bad of [snapshot({ visited: ["board-2-1"] }), snapshot({ visited: ["board-1-2"] }), snapshot({ finds: [find("unknown")] })]) {
      await expect(saveGuestProgress(c(), f.token, a.credential, a.participantId, bad)).rejects.toThrow("invalid-event");
    }
    expect((await db.guestShare.findUniqueOrThrow({ where: { id: f.shareId } })).revision).toBe(before.revision);
  });
  it("simultaneous stale snapshots cannot overwrite one another's distinct target sets", async () => {
    const f = await fixture(), a = await join(f.token);
    await Promise.all([
      saveGuestProgress(c(), f.token, a.credential, a.participantId, snapshot({ finds: [find("hide-1")] })),
      saveGuestProgress(c(), f.token, a.credential, a.participantId, snapshot({ finds: [find("hide-2")] })),
    ]);
    const result = await guestPlay(c(), f.token, a.credential, a.participantId);
    expect(result.participant.snapshot.finds.map(row => row.targetId)).toEqual(["hide-1", "hide-2"]);
    expect(result.participant.revision).toBe(2);
  });
  it("simultaneous retries of the same start create exactly one durable participant", async () => {
    const f = await fixture(), [a, b] = await Promise.all([join(f.token), join(f.token)]);
    expect(a.participantId).toBe(b.participantId); expect(a.credential).toBe(b.credential);
    expect(await db.guestParticipant.count({ where: { shareId: f.shareId } })).toBe(1);
    expect((await db.guestShare.findUniqueOrThrow({ where: { id: f.shareId } })).revision).toBe(1);
  });
  it("an unchanged game fence prevents a stale share creation from surviving a deletion/owner change", async () => {
    const f = await fixture(), before = await db.guestShare.count({ where: { gameId: f.gameId } });
    // A deterministic interleaving changes the exact claim just before the
    // writer locks it. This pins the CAS, without relying on SQLite timing.
    const racing = new Proxy(db, { get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (prop === "$transaction") return (work: (tx: unknown) => unknown, options: unknown) => db.$transaction(async tx => {
        let changed = false;
        const game = new Proxy(tx.game, { get(model, key, r) {
          const member = Reflect.get(model, key, r) as unknown;
          if (key === "updateMany") return async (args: unknown) => {
            if (!changed) { changed = true; await tx.game.update({ where: { id: f.gameId }, data: { deletedAt: new Date(), configJson: null } }); }
            return (member as (a: unknown) => Promise<unknown>).call(model, args);
          };
          return typeof member === "function" ? member.bind(model) : member;
        } });
        return work(new Proxy(tx, { get(t, p, r) { return p === "game" ? game : Reflect.get(t, p, r); } }));
      }, options as never);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    await expect(manageGuestShare({ ...c(), db: racing }, owner, { gameId: f.gameId, worldSlug: "world-2", operation: "create" })).rejects.toThrow("conflict");
    expect(await db.guestShare.count({ where: { gameId: f.gameId } })).toBe(before);
  });
  it("guest media needs the current participant cookie, uses no normal signature, and rejects cross-grant proofs", async () => {
    const f = await fixture(), a = await join(f.token), play = await guestPlay(c(), f.token, a.credential, a.participantId), input = mediaInput(play.config, a.credential);
    expect(play.config.child.avatarUrl).not.toMatch(/[?&][se]=/); expect(play.config.adventure?.avatarAssetId).toBe(`${f.gameId}-avatar`);
    expect((await guestMedia(c(), input)).bytes.toString()).toBe("synthetic illustrated GAME bytes");
    await expect(guestMedia(c(), { ...input, participantToken: null })).rejects.toThrow("unavailable");
    const b = await join(f.token, a.credential, "another", "another-media-key-" + "b".repeat(32));
    await expect(guestMedia(c(), { ...input, participantToken: b.credential })).rejects.toThrow("unavailable");
    const second = await fixture();
    await expect(guestMedia(c(), { ...input, shareId: second.shareId })).rejects.toThrow("unavailable");
    await expect(guestMedia(c(), { ...input, assetId: `${f.gameId}-target-1` })).rejects.toThrow("unavailable");
  });
  it.each(["ORIGINAL_PHOTO", "IDENTITY_SHEET"])("never exposes %s even if a frozen config names its asset", async type => {
    const f = await fixture(), a = await join(f.token), input = mediaInput((await guestPlay(c(), f.token, a.credential, a.participantId)).config, a.credential);
    await db.asset.update({ where: { id: input.assetId }, data: { type, visibility: "PRIVATE" } });
    const count = storage.get.mock.calls.length;
    await expect(guestMedia(c(), input)).rejects.toThrow("unavailable"); expect(storage.get.mock.calls.length).toBe(count);
    await expect(manageGuestShare(c(), owner, { gameId: f.gameId, worldSlug: "world-1", operation: "rotate" })).rejects.toThrow("unavailable");
  });
  it("revocation during byte loading denies the response; results remain private for 90 days after closure", async () => {
    const f = await fixture(), a = await join(f.token), input = mediaInput((await guestPlay(c(), f.token, a.credential, a.participantId)).config, a.credential);
    storage.get.mockImplementationOnce(async () => {
      await manageGuestShare(c(), owner, { gameId: f.gameId, worldSlug: "world-1", operation: "revoke" });
      return Buffer.from("must not be returned");
    });
    await expect(guestMedia(c(), input)).rejects.toThrow("unavailable");
    await expect(guestPlay(c(), f.token, a.credential, a.participantId)).rejects.toThrow("unavailable");
    const row = await db.guestShare.findUniqueOrThrow({ where: { id: f.shareId } });
    expect(row.resultsDeleteAt.getTime() - row.revokedAt!.getTime()).toBeCloseTo(90 * 86400_000, -1);
    expect((await guestOwnerReport(c(), owner, f.gameId, "world-1")).participants).toHaveLength(1);
  });
  it("rotation cannot revive an old credential, and removing a participant disables every personal read", async () => {
    const f = await fixture(), a = await join(f.token);
    const rotated = await manageGuestShare(c(), owner, { gameId: f.gameId, worldSlug: "world-1", operation: "rotate" }), token = new URL(rotated.url!).hash.slice(1);
    await expect(guestSession(c(), f.token, a.credential, { operation: "inspect" })).rejects.toThrow("unavailable");
    const b = await join(token), input = mediaInput((await guestPlay(c(), token, b.credential, b.participantId)).config, b.credential);
    const report = await guestOwnerReport(c(), owner, f.gameId, "world-1", { removeParticipantId: b.participantId });
    expect(report.participants.map(p => p.id)).toEqual([a.participantId]);
    await expect(guestPlay(c(), token, b.credential, b.participantId)).rejects.toThrow("unavailable");
    await expect(saveGuestProgress(c(), token, b.credential, b.participantId, emptyGuestSnapshot())).rejects.toThrow("unavailable");
    await expect(guestMedia(c(), input)).rejects.toThrow("unavailable");
    expect((await db.guestParticipant.findUniqueOrThrow({ where: { id: b.participantId } })).snapshotJson).toBe(JSON.stringify(emptyGuestSnapshot()));
  });
  it.each(["refund", "child-deleted", "config-changed", "owner-changed"])("revokes authority on %s rather than trusting the stored capability", async mutation => {
    const f = await fixture(), a = await join(f.token);
    if (mutation === "refund") await db.order.update({ where: { id: f.orderId }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
    if (mutation === "child-deleted") await db.familyChild.update({ where: { id: f.child.id }, data: { deletedAt: new Date() } });
    if (mutation === "config-changed") await db.game.update({ where: { id: f.gameId }, data: { configJson: JSON.stringify({ ...f.config, composedAt: "changed" }) } });
    if (mutation === "owner-changed") await db.game.update({ where: { id: f.gameId }, data: { ownerId: other } });
    await expect(guestPlay(c(), f.token, a.credential, a.participantId)).rejects.toThrow("unavailable");
  });
  it("soft deletion purges all guest credentials, frozen pictures and results in the game's transaction", async () => {
    const f = await fixture(), a = await join(f.token);
    const full = { ...c(), analytics: { track() {} } } as unknown as Container;
    expect(await deleteGame(full, f.gameId, { type: "USER", id: owner }, owner)).toBe(true);
    expect(await db.guestShare.findUnique({ where: { id: f.shareId } })).toBeNull();
    expect(await db.guestParticipant.findUnique({ where: { id: a.participantId } })).toBeNull();
    await expect(guestSession(c(), f.token, a.credential, { operation: "inspect" })).rejects.toThrow("unavailable");
  });
  it("expires access after 30 days, retains results until the closure retention deadline, then cascades them", async () => {
    const f = await fixture(), a = await join(f.token), now = new Date();
    await db.guestShare.update({ where: { id: f.shareId }, data: { expiresAt: new Date(now.getTime() - 1), resultsDeleteAt: new Date(now.getTime() + 86400_000) } });
    await expect(guestPlay(c(), f.token, a.credential, a.participantId)).rejects.toThrow("unavailable");
    await cleanupGuestSharing(db, now); expect(await db.guestParticipant.findUnique({ where: { id: a.participantId } })).not.toBeNull();
    await cleanupGuestSharing(db, new Date(now.getTime() + 86400_000));
    expect(await db.guestShare.findUnique({ where: { id: f.shareId } })).toBeNull(); expect(await db.guestParticipant.findUnique({ where: { id: a.participantId } })).toBeNull();
  });
  it("rotating an already expired invitation never extends its original 90-day retention boundary", async () => {
    const f = await fixture(), expiresAt = new Date(Date.now() - 10 * 86400_000), resultsDeleteAt = new Date(expiresAt.getTime() + 90 * 86400_000);
    await db.guestShare.update({ where: { id: f.shareId }, data: { expiresAt, resultsDeleteAt } });
    await manageGuestShare(c(), owner, { gameId: f.gameId, worldSlug: "world-1", operation: "rotate" });
    expect((await db.guestShare.findUniqueOrThrow({ where: { id: f.shareId } })).resultsDeleteAt).toEqual(resultsDeleteAt);
  });
  it("the existing hourly retention invocation actually purges bounded due guest results and skips fresh ones", async () => {
    const due = await fixture(), guest = await join(due.token), keep = await fixture(), now = new Date();
    await db.guestShare.update({ where: { id: due.shareId }, data: { expiresAt: new Date(now.getTime() - 90 * 86400_000 - 1), resultsDeleteAt: new Date(now.getTime() - 1) } });
    const full = { ...c(), analytics: { track() {} } } as unknown as Container;
    expect(await runRetentionIfDue(full, now)).not.toBeNull();
    expect(await db.guestShare.findUnique({ where: { id: due.shareId } })).toBeNull();
    expect(await db.guestParticipant.findUnique({ where: { id: guest.participantId } })).toBeNull();
    expect(await db.guestShare.findUnique({ where: { id: keep.shareId } })).not.toBeNull();
    expect(await runRetentionIfDue(full, now)).toBeNull();
  });
});
