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
import { createDraft, setChildName, attachPhoto, selectPackage, selectWorlds } from "../create-flow.service";
import { startCheckout, handlePaymentWebhook } from "../order.service";
import * as auth from "../auth.service";
import { deleteGame } from "../game.service";
import { LEGAL_VERSION } from "@/domain/legal";

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
  it("records current terms against the exact priced order before opening payment", async () => {
    const f = await fixture();
    const result = await startCheckout(f.c, { ...f.input, legalVersion: LEGAL_VERSION });
    expect(result.ok).toBe(true);
    const order = await db.order.findFirstOrThrow({ where: { gameId: f.game.id } });
    const accepted = await db.auditLog.findFirstOrThrow({ where: { action: "checkout:terms-accepted", entityType: "Order", entityId: order.id } });
    expect(JSON.parse(accepted.metaJson!)).toMatchObject({ version: LEGAL_VERSION, gameId: f.game.id, amountAgorot: order.amountAgorot, currency: order.currency });
    expect(accepted.actorId).toBe(order.userId);
  });
  it("stale policy acceptance leaves account, asset ownership and payment untouched", async () => {
    const f = await fixture();
    expect(await startCheckout(f.c, { ...f.input, legalVersion: "previous" })).toMatchObject({ ok: false, code: "TERMS_REQUIRED" });
    await unchangedOwners(f);
  });
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
  it("the first anonymous purchase durably locks the draft before provider I/O, so a late photo edit cannot strand paid delivery", async () => {
    const f = await fixture(), create = MockPaymentProvider.prototype.createCheckout.bind(f.payment);
    let release!: () => void, started!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; }), arrived = new Promise<void>(resolve => { started = resolve; });
    f.pay.mockImplementationOnce(async request => { started(); await blocked; return create(request); });
    const paying = startCheckout(f.c, f.input);
    await arrived;
    try {
      const order = await db.order.findFirstOrThrow({ where: { gameId: f.game.id } });
      expect(order).toMatchObject({ paymentStatus: "PENDING", checkoutUrl: null, checkoutKey: `world-checkout:${f.game.id}` });
      expect(order.checkoutClaimUntil!.getTime()).toBeGreaterThan(Date.now());
      expect((await db.game.findUniqueOrThrow({ where: { id: f.game.id } })).status).toBe("CHECKOUT_PENDING");
      expect(await attachPhoto(f.c, f.game.id, { buffer: photo, mimeType: "image/png", crop: null })).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
      expect(await setChildName(f.c, f.game.id, "Changed synthetic", 5)).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
      expect(await selectPackage(f.c, f.game.id, "ONE_WORLD")).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
      expect(await selectWorlds(f.c, f.game.id, ["kingdom"])).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
      expect((await db.childProfile.findUniqueOrThrow({ where: { id: f.game.childProfileId! } })).originalPhotoAssetId).toBe(f.asset.id);
      expect(await db.generationJob.count({ where: { gameId: f.game.id } })).toBe(0);
    } finally { release(); }
    expect(await paying).toMatchObject({ ok: true });
    const order = await db.order.findFirstOrThrow({ where: { gameId: f.game.id } });
    const body = JSON.stringify({ eventId: `${order.id}-paid`, orderId: order.id, kind: "PAID", amountAgorot: order.amountAgorot, currency: order.currency });
    expect((await handlePaymentWebhook(f.c, body, { "x-mock-signature": f.payment.sign(body) })).status).toBe(200);
    expect((await db.game.findUniqueOrThrow({ where: { id: f.game.id } })).status).toBe("PAID");
  });
  it("a first-purchase lost provider acknowledgement never opens another order or unlocks photo edits", async () => {
    const f = await fixture(), create = MockPaymentProvider.prototype.createCheckout.bind(f.payment);
    f.pay.mockImplementationOnce(async request => { await create(request); throw Error("accepted response lost"); });
    expect(await startCheckout(f.c, f.input)).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    const order = await db.order.findFirstOrThrow({ where: { gameId: f.game.id } });
    expect(await attachPhoto(f.c, f.game.id, { buffer: photo, mimeType: "image/png", crop: null })).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    expect(await startCheckout(f.c, f.input)).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    await db.order.update({ where: { id: order.id }, data: { checkoutClaimUntil: new Date(0) } });
    expect(await startCheckout(f.c, f.input)).toMatchObject({ ok: true });
    expect(f.pay.mock.calls[0]).toEqual(f.pay.mock.calls[1]); expect(f.pay).toHaveBeenCalledTimes(2);
    expect(await db.order.count({ where: { gameId: f.game.id } })).toBe(1);
  });
  it("a first-purchase adapter without idempotency support is not dispatched", async () => {
    const f = await fixture(), payment = { id: "mock" as const, createCheckout: f.pay };
    expect(await startCheckout({ ...f.c, payment } as unknown as Container, f.input)).toMatchObject({ ok: false, code: "SERVICE_UNAVAILABLE" });
    expect(f.pay).not.toHaveBeenCalled(); expect(await db.order.count({ where: { gameId: f.game.id } })).toBe(0);
  });

  it("an anonymous ordinary checkout resumes the exact declined hosted session and a later verified payment queues it once", async () => {
    const f = await fixture(), opened = await startCheckout(f.c, f.input);
    expect(opened.ok).toBe(true); if (!opened.ok) throw Error("Synthetic checkout did not open");
    const order = await db.order.findFirstOrThrow({ where: { gameId: f.game.id } });
    const declined = JSON.stringify({ eventId: `${order.id}-declined`, orderId: order.id, kind: "FAILED", amountAgorot: order.amountAgorot, currency: order.currency });
    expect((await handlePaymentWebhook(f.c, declined, { "x-mock-signature": f.payment.sign(declined) })).status).toBe(200);
    const failed = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect((await db.game.findUniqueOrThrow({ where: { id: f.game.id } })).status).toBe("PAYMENT_FAILED");
    expect(await startCheckout(f.c, f.input)).toEqual(opened);
    expect(f.pay).toHaveBeenCalledTimes(1);
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toEqual(failed);
    expect(await db.order.count({ where: { gameId: f.game.id } })).toBe(1);
    expect(await attachPhoto(f.c, f.game.id, { buffer: photo, mimeType: "image/png", crop: null })).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    expect(await db.generationJob.count({ where: { gameId: f.game.id } })).toBe(0);
    const paid = JSON.stringify({ eventId: `${order.id}-paid-after-retry`, orderId: order.id, kind: "PAID", amountAgorot: order.amountAgorot, currency: order.currency });
    expect((await handlePaymentWebhook(f.c, paid, { "x-mock-signature": f.payment.sign(paid) })).status).toBe(200);
    expect((await handlePaymentWebhook(f.c, paid, { "x-mock-signature": f.payment.sign(paid) })).status).toBe(200);
    expect((await db.game.findUniqueOrThrow({ where: { id: f.game.id } })).status).toBe("PAID");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("PAID");
    expect((f.c.analytics.track as ReturnType<typeof vi.fn>).mock.calls.filter(([name]) => name === "payment_completed")).toHaveLength(1);
  });

  it.each(["no saved URL", "changed currency", "unknown closure"] as const)("a declined ordinary session remains immutable and blocked with %s", async condition => {
    const f = await fixture(); expect(await startCheckout(f.c, f.input)).toMatchObject({ ok: true });
    const order = await db.order.findFirstOrThrow({ where: { gameId: f.game.id } });
    const declined = JSON.stringify({ eventId: `${order.id}-declined-${condition}`, orderId: order.id, kind: "FAILED", amountAgorot: order.amountAgorot, currency: order.currency });
    expect((await handlePaymentWebhook(f.c, declined, { "x-mock-signature": f.payment.sign(declined) })).status).toBe(200);
    if (condition === "no saved URL") await db.order.update({ where: { id: order.id }, data: { checkoutUrl: null, checkoutClaimUntil: new Date(0) } });
    if (condition === "unknown closure") {
      const { checkoutCloseReceiptId } = await import("../checkout-close.service");
      await db.auditLog.create({ data: { id: checkoutCloseReceiptId(order.id), actorType: "USER", actorId: order.userId, action: "checkout:close", entityType: "Order", entityId: order.id,
        metaJson: JSON.stringify({ version: "checkout-close/v1", state: "unknown", leaseUntil: 0, orderId: order.id }) } });
    }
    const before = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(await startCheckout(f.c, { ...f.input, currency: condition === "changed currency" ? "USD" : "ILS" })).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    expect(f.pay).toHaveBeenCalledTimes(1); expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toEqual(before);
    expect(await db.order.count({ where: { gameId: f.game.id } })).toBe(1);
  });
});
