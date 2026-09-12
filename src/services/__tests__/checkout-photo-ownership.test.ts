import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../lib/test-schema";
import { DbStorage } from "../../infra/storage/db";
import { MockPaymentProvider } from "../../infra/payment/mock";
import type { Container } from "../container";
import { createDraft, setChildName, attachPhoto, selectPackage } from "../create-flow.service";
import { startCheckout, handlePaymentWebhook } from "../order.service";
import * as auth from "../auth.service";
import { deleteGame } from "../game.service";

vi.mock("../../lib/env", () => ({ env: () => ({ APP_ENV: "qa" }), spendGuard: () => ({ appEnv: "qa", realGeneration: false, testers: [] }) }));
vi.mock("../../domain/spend-policy", () => ({ spendAllowedFor: () => true }));

let db: PrismaClient, scratch: string, photo: Buffer, counter = 0;
beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-checkout-owner-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  photo = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#6d8091" } }).png().toBuffer();
});
beforeEach(() => { process.env.QA_BOARD_CONDITIONED_WIZARD = "true"; });
afterAll(async () => {
  delete process.env.QA_BOARD_CONDITIONED_WIZARD; await db.$disconnect();
  const resolved = path.resolve(scratch);
  if (path.dirname(resolved) === realpathSync(tmpdir()) && path.basename(resolved).startsWith("findme-checkout-owner-")) rmSync(resolved, { recursive: true, force: true });
});
async function fixture() {
  const email = `checkout-${++counter}@example.invalid`;
  const payment = new MockPaymentProvider("https://example.invalid", "synthetic-checkout-secret");
  const pay = vi.spyOn(payment, "createCheckout");
  const c = { db, storage: new DbStorage(db), payment, appUrl: "https://example.invalid", analytics: { track: vi.fn() } } as unknown as Container;
  const { gameId, draftToken } = await createDraft(c, null, "he");
  expect(await setChildName(c, gameId, "Synthetic", 6)).toEqual({ ok: true });
  expect(await attachPhoto(c, gameId, { buffer: photo, mimeType: "image/png", crop: null })).toEqual({ ok: true });
  expect(await selectPackage(c, gameId, "ONE_WORLD")).toEqual({ ok: true });
  const game = await db.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true } });
  const asset = await db.asset.findUniqueOrThrow({ where: { id: game.childProfile!.originalPhotoAssetId! } });
  const input = { gameId, email, currency: "ILS" as const, access: { draftToken, userId: null } };
  return { c, payment, pay, input, game, asset };
}
async function unchangedOwners(f: Awaited<ReturnType<typeof fixture>>) {
  expect((await db.game.findUniqueOrThrow({ where: { id: f.game.id } })).ownerId).toBeNull();
  expect((await db.childProfile.findUniqueOrThrow({ where: { id: f.game.childProfileId! } })).ownerId).toBeNull();
  expect(f.pay).not.toHaveBeenCalled();
  expect(await db.order.count({ where: { gameId: f.game.id } })).toBe(0);
}

describe("checkout adopts only its proven draft's private child photo", () => {
  it("supports anonymous draft → real upload → checkout → mock payment → fenced QA deletion", async () => {
    const f = await fixture(); expect(f.asset.ownerId).toBeNull();
    const result = await startCheckout(f.c, f.input); expect(result.ok).toBe(true); if (!result.ok) throw new Error("Synthetic checkout failed");
    const child = await db.childProfile.findUniqueOrThrow({ where: { id: f.game.childProfileId! } });
    expect(child.ownerId).toBe(result.userId);
    expect(await db.asset.findUniqueOrThrow({ where: { id: f.asset.id } })).toMatchObject({ ownerId: result.userId, storagePath: f.asset.storagePath, visibility: "PRIVATE", type: "ORIGINAL_PHOTO" });
    expect(await f.c.storage.get(f.asset.storagePath)).toEqual(photo);
    // Reopening checkout is idempotent and preserves the existing pending order.
    expect((await startCheckout(f.c, f.input)).ok).toBe(true);
    expect(await db.order.count({ where: { gameId: f.game.id } })).toBe(1);
    const order = await db.order.findFirstOrThrow({ where: { gameId: f.game.id } });
    const body = JSON.stringify({ eventId: `event-${order.id}`, orderId: order.id, kind: "PAID", amountAgorot: order.amountAgorot, currency: order.currency });
    expect((await handlePaymentWebhook(f.c, body, { "x-mock-signature": f.payment.sign(body) })).status).toBe(200);
    await db.generationJob.create({ data: { id: `job_${f.game.id}`, gameId: f.game.id, status: "QUEUED" } });
    expect(await deleteGame(f.c, f.game.id, { type: "USER", id: result.userId }, result.userId)).toBe(true);
    expect((await db.game.findUniqueOrThrow({ where: { id: f.game.id } })).status).toBe("DELETED");
    expect((await db.asset.findUniqueOrThrow({ where: { id: f.asset.id } })).status).toBe("DELETED");
    expect(await db.fileBlob.count({ where: { key: f.asset.storagePath } })).toBe(0);
  });
  it.each([null, "wrong-draft-token"])("refuses missing/foreign draft proof %s before any account/payment mutation", async token => {
    const f = await fixture();
    expect(await startCheckout(f.c, { ...f.input, access: { draftToken: token, userId: null } })).toMatchObject({ ok: false, code: "DRAFT_NOT_FOUND" });
    await unchangedOwners(f); expect(await db.user.findUnique({ where: { email: f.input.email } })).toBeNull();
  });
  it("accepts the authenticated draft owner without a bearer cookie and preserves that photo's ownership", async () => {
    const f = await fixture(), owner = await auth.ensureUser(f.c, f.input.email);
    await db.$transaction([
      db.game.update({ where: { id: f.game.id }, data: { ownerId: owner.id } }),
      db.childProfile.update({ where: { id: f.game.childProfileId! }, data: { ownerId: owner.id } }),
      db.asset.update({ where: { id: f.asset.id }, data: { ownerId: owner.id } }),
    ]);
    expect(await startCheckout(f.c, { ...f.input, access: { draftToken: null, userId: owner.id } })).toMatchObject({ ok: true, userId: owner.id });
    expect((await db.asset.findUniqueOrThrow({ where: { id: f.asset.id } })).ownerId).toBe(owner.id);
  });
  it("does not steal a linked photo belonging to another account", async () => {
    const f = await fixture(), foreign = await db.user.create({ data: { id: `foreign-${counter}`, email: `foreign-${counter}@example.invalid` } });
    await db.asset.update({ where: { id: f.asset.id }, data: { ownerId: foreign.id } });
    expect(await startCheckout(f.c, f.input)).toMatchObject({ ok: false, code: "DRAFT_LOCKED" });
    await unchangedOwners(f); expect((await db.asset.findUniqueOrThrow({ where: { id: f.asset.id } })).ownerId).toBe(foreign.id);
  });
  it.each(["photo", "identity", "avatar"])("does not adopt a photo also referenced as another child's %s", async use => {
    const f = await fixture();
    await db.childProfile.create({ data: { id: `other-child-${counter}`, displayName: "Synthetic other", ...(use === "photo" ? { originalPhotoAssetId: f.asset.id } : use === "identity" ? { identityAssetId: f.asset.id } : { avatarAssetId: f.asset.id }) } });
    expect(await startCheckout(f.c, f.input)).toMatchObject({ ok: false, code: "DRAFT_LOCKED" });
    await unchangedOwners(f); expect((await db.asset.findUniqueOrThrow({ where: { id: f.asset.id } })).ownerId).toBeNull();
  });
  it("rejects shared storage aliases even if only this child references the chosen asset id", async () => {
    const f = await fixture();
    await db.asset.create({ data: { id: `alias-${counter}`, storagePath: f.asset.storagePath, type: "ORIGINAL_PHOTO", visibility: "PRIVATE", mimeType: "image/png" } });
    expect(await startCheckout(f.c, f.input)).toMatchObject({ ok: false, code: "DRAFT_LOCKED" }); await unchangedOwners(f);
  });
  it("rejects moving a child profile shared by another live game", async () => {
    const f = await fixture();
    await db.game.create({ data: { id: `shared-${counter}`, childProfileId: f.game.childProfileId, status: "DRAFT" } });
    expect(await startCheckout(f.c, f.input)).toMatchObject({ ok: false, code: "DRAFT_LOCKED" }); await unchangedOwners(f);
  });
  it("rolls back draft/child adoption if the photo is not a live private original", async () => {
    const f = await fixture(); await db.asset.update({ where: { id: f.asset.id }, data: { status: "DELETED", deletedAt: new Date() } });
    expect(await startCheckout(f.c, f.input)).toMatchObject({ ok: false, code: "DRAFT_LOCKED" }); await unchangedOwners(f);
  });
  it("rechecks the exact photo after an upload replacement wins before the transaction", async () => {
    const f = await fixture();
    const replacement = await db.asset.create({ data: { id: `replacement-${counter}`, storagePath: `private/replacement-${counter}.png`, type: "ORIGINAL_PHOTO", visibility: "PRIVATE", mimeType: "image/png" } });
    const ensureUser = auth.ensureUser;
    const race = vi.spyOn(auth, "ensureUser").mockImplementationOnce(async (c, email) => {
      const account = await ensureUser(c, email);
      await db.childProfile.update({ where: { id: f.game.childProfileId! }, data: { originalPhotoAssetId: replacement.id } });
      return account;
    });
    try { expect(await startCheckout(f.c, f.input)).toMatchObject({ ok: false, code: "DRAFT_LOCKED" }); }
    finally { race.mockRestore(); }
    await unchangedOwners(f); expect((await db.asset.findUniqueOrThrow({ where: { id: replacement.id } })).ownerId).toBeNull();
  });
  it("does not overwrite a cancelled draft after checking its earlier checkout snapshot", async () => {
    const f = await fixture(), ensureUser = auth.ensureUser;
    const race = vi.spyOn(auth, "ensureUser").mockImplementationOnce(async (c, email) => {
      const account = await ensureUser(c, email);
      await db.game.update({ where: { id: f.game.id }, data: { status: "CANCELLED" } });
      return account;
    });
    try { expect(await startCheckout(f.c, f.input)).toMatchObject({ ok: false, code: "DRAFT_LOCKED" }); }
    finally { race.mockRestore(); }
    await unchangedOwners(f); expect((await db.game.findUniqueOrThrow({ where: { id: f.game.id } })).status).toBe("CANCELLED");
  });
});
