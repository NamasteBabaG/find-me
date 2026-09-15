import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../lib/test-schema";
import { hashToken } from "@/lib/ids";
import { SYSTEM } from "../audit.service";
import { GameStatusConflict, transitionGame, type GameStatusDb } from "../game-status";
import { handlePaymentWebhook } from "../order.service";
import { consumeMagicLink } from "../auth.service";
import { attachPhoto } from "../create-flow.service";
import { checkPhoto } from "../asset.service";
import type { Container } from "../container";

/**
 * What happens between two writes.
 *
 * Every case here was reproduced against the shipped functions before it was
 * fixed (project audit, 2026-09-15): a payment that was recorded while the
 * game it paid for was left behind, a status written from a snapshot another
 * request had already replaced, an upload that locked the draft it failed in,
 * a one-time link two requests could both spend, and a file trusted to be
 * whatever its sender called it.
 *
 * A real, disposable SQLite database on purpose: these are races and partial
 * writes, and a mocked client can be made to say anything about them.
 */
let scratch: string;
let db: PrismaClient;
let counter = 0;

const png = async (side = 512) => sharp({ create: { width: side, height: side, channels: 3, background: "white" } }).png().toBuffer();

beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "findme-interrupted-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
}, 60_000);
afterAll(async () => {
  await db?.$disconnect();
  if (scratch && path.basename(scratch).startsWith("findme-interrupted-")) await rm(scratch, { recursive: true, force: true });
});
afterEach(() => vi.restoreAllMocks());

function container(over: Partial<Container> = {}): Container {
  return {
    db,
    analytics: { track: vi.fn() },
    storage: { put: vi.fn(async () => {}), get: vi.fn(async () => Buffer.alloc(0)), delete: vi.fn(async () => {}) },
    appUrl: "http://localhost",
    secret: "interrupted-writes-secret",
    ...over,
  } as unknown as Container;
}

/** A PAID webhook for `orderId`, as the provider would deliver it. */
function payment(orderId: string, providerEventId: string, amountAgorot = 2200) {
  return {
    id: "audit-provider",
    parseWebhook: async () => ({ ok: true as const, event: { orderId, providerEventId, kind: "PAID" as const, amountAgorot, currency: "USD", providerPaymentId: "pp_1", raw: {} } }),
  };
}

async function paidOrder(suffix: string, gameStatus: string, paymentStatus: string) {
  const id = `iw-${suffix}-${counter++}`;
  await db.user.create({ data: { id: `${id}-user`, email: `${id}@example.invalid` } });
  await db.game.create({ data: { id: `${id}-game`, ownerId: `${id}-user`, status: gameStatus, locale: "en" } });
  await db.order.create({
    data: {
      id: `${id}-order`, userId: `${id}-user`, gameId: `${id}-game`, amountAgorot: 2200, currency: "USD",
      packageTier: "ONE_WORLD", provider: "audit-provider", paymentStatus, ...(paymentStatus === "PAID" ? { paidAt: new Date() } : {}),
    },
  });
  return { orderId: `${id}-order`, gameId: `${id}-game` };
}

const statusOfGame = async (gameId: string) => (await db.game.findUniqueOrThrow({ where: { id: gameId }, select: { status: true } })).status;

describe("a payment recorded while its game was left behind (A01)", () => {
  it("finishes the game on the next delivery instead of answering 'already paid' for ever", async () => {
    // Exactly the state an interruption between the two writes leaves behind:
    // the money is on the order, the game never moved, no event was recorded.
    const { orderId, gameId } = await paidOrder("reconcile", "CHECKOUT_PENDING", "PAID");
    const c = container({ payment: payment(orderId, "ev-reconcile") as unknown as Container["payment"] });

    const out = await handlePaymentWebhook(c, "", {});

    expect(out).toEqual({ status: 200, body: "already paid" });
    expect(await statusOfGame(gameId)).toBe("PAID");
    expect(await db.paymentEvent.count({ where: { orderId } })).toBe(1);
  });

  it("never drags a game that is already being drawn back to the start of the queue", async () => {
    const { orderId, gameId } = await paidOrder("late", "TARGETS_GENERATING", "PAID");
    const c = container({ payment: payment(orderId, "ev-late") as unknown as Container["payment"] });

    expect(await handlePaymentWebhook(c, "", {})).toEqual({ status: 200, body: "already paid" });
    expect(await statusOfGame(gameId)).toBe("TARGETS_GENERATING");
  });

  it("keeps the money on the order and asks for a person when the game can no longer be paid for", async () => {
    // The parent deleted the game while the payment was in flight.
    const { orderId, gameId } = await paidOrder("deleted", "DELETED", "PENDING");
    const c = container({ payment: payment(orderId, "ev-deleted") as unknown as Container["payment"] });

    expect(await handlePaymentWebhook(c, "", {})).toEqual({ status: 200, body: "ok" });

    expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus).toBe("PAID");
    expect(await statusOfGame(gameId)).toBe("DELETED");
    expect(await db.auditLog.count({ where: { entityId: gameId, action: "payment:game-unreachable" } })).toBe(1);
  });

  it("applies two deliveries of the same event exactly once, whichever wins", async () => {
    const { orderId, gameId } = await paidOrder("race", "CHECKOUT_PENDING", "PENDING");
    const c = container({ payment: payment(orderId, "ev-race") as unknown as Container["payment"] });

    const [a, b] = await Promise.all([handlePaymentWebhook(c, "", {}), handlePaymentWebhook(c, "", {})]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body, b.body].filter((body) => body === "duplicate event ignored")).toHaveLength(1);
    expect(await db.paymentEvent.count({ where: { orderId } })).toBe(1);
    expect(await statusOfGame(gameId)).toBe("PAID");
    // One transition, one trail entry: the loser's writes rolled back with it.
    expect(await db.auditLog.count({ where: { entityId: gameId, action: "status:CHECKOUT_PENDING->PAID" } })).toBe(1);
  });
});

describe("a status written from a snapshot that is no longer true (A02)", () => {
  it("refuses the move instead of overwriting the delete that landed first", async () => {
    const { gameId } = await paidOrder("stale", "PAID", "PAID");
    const c = container();
    // Real rows, real writes; only the timing is staged. The delete lands
    // between the read of the status and the write that acts on it.
    const raced: GameStatusDb = {
      game: {
        findUniqueOrThrow: async (args: Parameters<typeof db.game.findUniqueOrThrow>[0]) => {
          const snapshot = await db.game.findUniqueOrThrow(args);
          await db.game.update({ where: { id: gameId }, data: { status: "DELETED", deletedAt: new Date() } });
          return snapshot;
        },
        updateMany: (args: Parameters<typeof db.game.updateMany>[0]) => db.game.updateMany(args),
      },
      auditLog: { create: (args: Parameters<typeof db.auditLog.create>[0]) => db.auditLog.create(args) },
    } as unknown as GameStatusDb;

    await expect(transitionGame(c, gameId, "AVATAR_GENERATING", SYSTEM, undefined, raced)).rejects.toBeInstanceOf(GameStatusConflict);

    const game = await db.game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.status).toBe("DELETED");
    expect(game.deletedAt).not.toBeNull();
    // No move happened, so the trail does not claim one.
    expect(await db.auditLog.count({ where: { entityId: gameId, action: "status:PAID->AVATAR_GENERATING" } })).toBe(0);
  });

  it("still applies an uncontested move, with its trail", async () => {
    const { gameId } = await paidOrder("clean", "PAID", "PAID");
    await transitionGame(container(), gameId, "AVATAR_GENERATING", SYSTEM);
    expect(await statusOfGame(gameId)).toBe("AVATAR_GENERATING");
    expect(await db.auditLog.count({ where: { entityId: gameId, action: "status:PAID->AVATAR_GENERATING" } })).toBe(1);
  });
});

describe("an upload that could not be stored (A03)", () => {
  async function draft(suffix: string) {
    const id = `iw-photo-${suffix}-${counter++}`;
    await db.childProfile.create({ data: { id: `${id}-child`, displayName: "Noam", ageYears: 6 } });
    await db.game.create({ data: { id: `${id}-game`, status: "PHOTO_APPROVED", locale: "en", childProfileId: `${id}-child` } });
    return { gameId: `${id}-game`, childId: `${id}-child` };
  }

  it("hands the step back, keeps the previous photo, and lets the next attempt through", async () => {
    const { gameId, childId } = await draft("outage");
    const buffer = await png();
    // A photo already on file, so the failure has something to lose.
    await attachPhoto(container(), gameId, { buffer, mimeType: "image/png", crop: null });
    const first = await db.childProfile.findUniqueOrThrow({ where: { id: childId } });
    expect(first.originalPhotoAssetId).toBeTruthy();

    const outage = container({ storage: { put: vi.fn(async () => { throw new Error("injected storage outage"); }), get: vi.fn(), delete: vi.fn(async () => {}) } as unknown as Container["storage"] });
    const failed = await attachPhoto(outage, gameId, { buffer, mimeType: "image/png", crop: null });

    expect(failed).toMatchObject({ ok: false, code: "UPLOAD_FAILED" });
    // Recoverable, not locked: the parent can try again.
    expect(await statusOfGame(gameId)).toBe("PHOTO_REJECTED");
    // The photo they already had is untouched — it was not deleted to make room
    // for one that was never written.
    const during = await db.childProfile.findUniqueOrThrow({ where: { id: childId } });
    expect(during.originalPhotoAssetId).toBe(first.originalPhotoAssetId);
    expect((await db.asset.findUniqueOrThrow({ where: { id: first.originalPhotoAssetId! } })).status).not.toBe("DELETED");

    const retry = await attachPhoto(container(), gameId, { buffer, mimeType: "image/png", crop: null });

    expect(retry).toEqual({ ok: true });
    expect(await statusOfGame(gameId)).toBe("PHOTO_APPROVED");
    const after = await db.childProfile.findUniqueOrThrow({ where: { id: childId } });
    expect(after.originalPhotoAssetId).not.toBe(first.originalPhotoAssetId);
    // Only once the profile pointed at the replacement.
    expect((await db.asset.findUniqueOrThrow({ where: { id: first.originalPhotoAssetId! } })).status).toBe("DELETED");
  });

  it("reopens a draft left mid-check by a process that died", async () => {
    const { gameId } = await draft("stuck");
    await db.game.update({ where: { id: gameId }, data: { status: "PHOTO_VALIDATING" } });
    const out = await attachPhoto(container(), gameId, { buffer: await png(), mimeType: "image/png", crop: null });
    expect(out).toEqual({ ok: true });
    expect(await statusOfGame(gameId)).toBe("PHOTO_APPROVED");
  });
});

describe("a one-time sign-in link (A04)", () => {
  it("opens one session when two requests spend it at once", async () => {
    const id = `iw-magic-${counter++}`;
    const token = `token-${id}`;
    await db.user.create({ data: { id: `${id}-user`, email: `${id}@example.invalid` } });
    await db.magicLinkToken.create({ data: { id: `${id}-mlt`, userId: `${id}-user`, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } });
    const c = container();

    const results = await Promise.all([consumeMagicLink(c, token), consumeMagicLink(c, token)]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.session.count({ where: { userId: `${id}-user` } })).toBe(1);
    expect((await db.magicLinkToken.findUniqueOrThrow({ where: { id: `${id}-mlt` } })).usedAt).not.toBeNull();
  });

  it("refuses a link that has expired, and does not spend it", async () => {
    const id = `iw-magic-${counter++}`;
    const token = `token-${id}`;
    await db.user.create({ data: { id: `${id}-user`, email: `${id}@example.invalid` } });
    await db.magicLinkToken.create({ data: { id: `${id}-mlt`, userId: `${id}-user`, tokenHash: hashToken(token), expiresAt: new Date(Date.now() - 1000) } });

    expect(await consumeMagicLink(container(), token)).toBeNull();
    expect(await db.session.count({ where: { userId: `${id}-user` } })).toBe(0);
  });
});

/**
 * A genuine animated WebP, assembled here.
 *
 * This build of sharp will not encode one: `pageHeight` on a tall raw input
 * comes back out as a single page, so the multi-frame guard had no fixture and
 * was reported as uncovered. The container is small and fully specified — a
 * VP8X with the animation flag, an ANIM chunk, and two ANMF frames each
 * carrying the VP8L payload of a still that sharp itself encoded — so nothing
 * here is a guess about the format.
 */
async function animatedWebp(width: number, height: number): Promise<Buffer> {
  const chunk = (fourcc: string, payload: Buffer) => {
    const header = Buffer.alloc(8);
    header.write(fourcc, 0, "ascii");
    header.writeUInt32LE(payload.length, 4);
    return payload.length % 2 ? Buffer.concat([header, payload, Buffer.alloc(1)]) : Buffer.concat([header, payload]);
  };
  const uint24 = (value: number) => { const b = Buffer.alloc(3); b.writeUIntLE(value, 0, 3); return b; };
  const stillFrame = async (colour: string) => {
    const still = await sharp({ create: { width, height, channels: 3, background: colour } }).webp({ lossless: true }).toBuffer();
    for (let at = 12; at + 8 <= still.length; ) {
      const fourcc = still.toString("ascii", at, at + 4);
      const size = still.readUInt32LE(at + 4);
      if (fourcc === "VP8L") return still.subarray(at, at + 8 + size + (size % 2));
      at += 8 + size + (size % 2);
    }
    throw new Error("no VP8L chunk in the still");
  };
  const flags = Buffer.alloc(4);
  flags.writeUInt8(0x02, 0); // ANIMATION
  const frames: Buffer[] = [];
  for (const colour of ["#ff0000", "#0000ff"]) {
    const head = Buffer.concat([uint24(0), uint24(0), uint24(width - 1), uint24(height - 1), uint24(100), Buffer.from([0])]);
    frames.push(chunk("ANMF", Buffer.concat([head, await stillFrame(colour)])));
  }
  const body = Buffer.concat([
    Buffer.from("WEBP", "ascii"),
    chunk("VP8X", Buffer.concat([flags, uint24(width - 1), uint24(height - 1)])),
    chunk("ANIM", Buffer.from([0, 0, 0, 0, 0, 0])),
    ...frames,
  ]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

describe("a file is what it is, not what it says it is (A05)", () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="blue"/></svg>');

  it("refuses an SVG posted as a PNG", async () => {
    expect(await checkPhoto(svg, "image/png")).toMatchObject({ ok: false, code: "BAD_TYPE" });
  });

  it("refuses a GIF posted as a JPEG", async () => {
    const gif = await sharp({ create: { width: 512, height: 512, channels: 3, background: "red" } }).gif().toBuffer();
    expect(await checkPhoto(gif, "image/jpeg")).toMatchObject({ ok: false, code: "BAD_TYPE" });
  });

  it("accepts the three real formats, and reports what the file actually is", async () => {
    expect(await checkPhoto(await png(), "image/webp")).toMatchObject({ ok: true, mimeType: "image/png" });
    const jpeg = await sharp({ create: { width: 512, height: 512, channels: 3, background: "white" } }).jpeg().toBuffer();
    expect(await checkPhoto(jpeg, "application/octet-stream")).toMatchObject({ ok: true, mimeType: "image/jpeg" });
  });

  it("still refuses a photo that is too small", async () => {
    expect(await checkPhoto(await png(200), "image/png")).toMatchObject({ ok: false, code: "TOO_SMALL" });
  });

  it("refuses an animated WebP, whichever frame a sheet would be drawn from", async () => {
    const frames = await animatedWebp(512, 512);
    expect((await sharp(frames).metadata()).pages).toBe(2);
    expect(await checkPhoto(frames, "image/webp")).toMatchObject({ ok: false, code: "BAD_TYPE" });
  });

  it("refuses a file whose pixels are far larger than its bytes", async () => {
    // 54 megapixels of flat white compresses to about 1.5MB: well under the
    // upload cap, and 162MB of decoded frame if anything downstream opens it.
    const bomb = await sharp({ create: { width: 9000, height: 6000, channels: 3, background: "white" } }).png({ compressionLevel: 1 }).toBuffer();
    expect(bomb.byteLength).toBeLessThan(12 * 1024 * 1024);
    expect(await checkPhoto(bomb, "image/png")).toMatchObject({ ok: false, code: "TOO_LARGE" });
  }, 30_000);
});
