import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "@/lib/test-schema";
import { DbStorage } from "@/infra/storage/db";
import { MockPaymentProvider } from "@/infra/payment/mock";
import type { Container } from "../container";
import { beginWorldPurchase, worldPurchaseContext } from "../world-purchase.service";
import { attachPhoto, selectPackage, selectWorlds, setChildName } from "../create-flow.service";
import { startCheckout, handlePaymentWebhook } from "../order.service";
import { boardsOfWorlds } from "../world-catalog.service";
import { LEGAL_VERSION } from "@/domain/legal";
import { chooseDraftChild } from "../family.service";
import { startWorldPurchaseCheckout } from "../world-purchase-checkout.service";
import { closeDraftCheckout, checkoutCloseReceiptId, closeReceiptState } from "../checkout-close.service";

vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: "qa" }), spendGuard: () => ({ appEnv: "qa", realGeneration: false, testers: [] }) }));
vi.mock("@/domain/spend-policy", () => ({ spendAllowedFor: () => true }));
let db: PrismaClient, scratch: string, photo: Buffer, sequence = 0;
beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-world-purchase-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  photo = await sharp({ create: { width: 400, height: 400, channels: 3, background: "#71869a" } }).png().toBuffer();
});
afterAll(async () => {
  await db?.$disconnect();
  const absolute = path.resolve(scratch);
  if (path.dirname(absolute) === realpathSync(tmpdir()) && path.basename(absolute).startsWith("findme-world-purchase-")) rmSync(absolute, { recursive: true, force: true });
});
async function fixture(paid = true) {
  const id = `purchase-${++sequence}`, ownerId = `${id}-owner`, childId = `${id}-child`, sourceId = `${id}-source`, profileId = `${id}-profile`, email = `${id}@example.invalid`;
  await db.user.create({ data: { id: ownerId, email } });
  await db.familyChild.create({ data: { id: childId, ownerId, displayName: "Synthetic child" } });
  // A legitimately photo-purged historical adventure. No source image is read.
  await db.childProfile.create({ data: { id: profileId, ownerId, displayName: "Synthetic child", ageYears: 8, originalPhotoAssetId: null } });
  await db.game.create({ data: { id: sourceId, ownerId, familyChildId: childId, childProfileId: profileId, status: paid ? "DELIVERED" : "DRAFT",
    styleVersion: "local-patch-world-v1", configJson: "historical-frozen-config", packageTier: "ONE_WORLD", sceneCount: 9,
    ...(paid ? { paidAt: new Date("2025-01-01"), deliveredAt: new Date("2025-01-02") } : {}),
    scenes: { create: boardsOfWorlds(["journey"]).map((sceneSlug, orderIndex) => ({ id: `${sourceId}-${orderIndex}`, sceneSlug, orderIndex, sceneVersion: 12 })) } } });
  if (paid) await db.order.create({ data: { id: `${sourceId}-order`, gameId: sourceId, userId: ownerId, amountAgorot: 3900, currency: "ILS", packageTier: "ONE_WORLD", provider: "mock", paymentStatus: "PAID", paidAt: new Date("2025-01-01") } });
  const payment = new MockPaymentProvider("https://worlds.invalid", "synthetic-world-purchase-secret"), checkout = vi.spyOn(payment, "createCheckout");
  const c = { db, storage: new DbStorage(db), payment, appUrl: "https://worlds.invalid", analytics: { track: vi.fn() }, generation: { createAvatar: vi.fn(() => { throw Error("No generation authorized"); }) } } as unknown as Container;
  const input = { ownerId, familyChildId: childId, worldSlug: "kingdom", ageYears: 8, locale: "he" as const, returnGameId: sourceId };
  return { c, payment, checkout, input, ownerId, childId, sourceId, profileId, email };
}
async function prepared(f: Awaited<ReturnType<typeof fixture>>) {
  const result = await beginWorldPurchase(f.c, f.input); if (!result.ok) throw Error("Synthetic draft was not created");
  expect(await attachPhoto(f.c, result.gameId, { buffer: photo, mimeType: "image/png", crop: null })).toEqual({ ok: true });
  const checkoutInput = { gameId: result.gameId, email: f.email, currency: "ILS" as const, access: { userId: f.ownerId, draftToken: result.draftToken }, legalVersion: LEGAL_VERSION };
  return { result, checkoutInput };
}

async function payOrder(f: Awaited<ReturnType<typeof fixture>>, gameId: string) {
  const order = await db.order.findFirstOrThrow({ where: { gameId, paymentStatus: "PENDING" } });
  const body = JSON.stringify({ eventId: `${order.id}-paid`, orderId: order.id, kind: "PAID", amountAgorot: order.amountAgorot, currency: order.currency });
  expect((await handlePaymentWebhook(f.c, body, { "x-mock-signature": f.payment.sign(body) })).status).toBe(200);
  expect((await db.game.findUniqueOrThrow({ where: { id: gameId } })).status).toBe("PAID");
  return order;
}

async function recordPriorPaidWorld(f: Awaited<ReturnType<typeof fixture>>) {
  await db.game.update({ where: { id: f.sourceId }, data: { status: "DELIVERED", paidAt: new Date(), deliveredAt: new Date() } });
  await db.order.create({ data: { id: `${f.sourceId}-paid`, gameId: f.sourceId, userId: f.ownerId, amountAgorot: 3900, currency: "ILS", packageTier: "ONE_WORLD", provider: "mock", paymentStatus: "PAID", paidAt: new Date() } });
}

async function ordinaryTwoWorldDraft(f: Awaited<ReturnType<typeof fixture>>) {
  const id = `ordinary-two-${++sequence}`, profileId = `${id}-profile`, assetId = `${id}-photo`;
  await db.asset.create({ data: { id: assetId, ownerId: f.ownerId, type: "ORIGINAL_PHOTO", visibility: "PRIVATE", mimeType: "image/png", storagePath: `private/synthetic-${assetId}.png` } });
  await db.childProfile.create({ data: { id: profileId, ownerId: f.ownerId, displayName: "Synthetic child", ageYears: 8, originalPhotoAssetId: assetId } });
  await db.game.create({ data: { id, ownerId: f.ownerId, familyChildId: f.childId, childProfileId: profileId, draftToken: `${id}-cookie`, status: "PACKAGE_SELECTED", packageTier: "TWO_WORLDS", sceneCount: 18,
    scenes: { create: boardsOfWorlds(["journey", "kingdom"]).map((sceneSlug, orderIndex) => ({ id: `${id}-${orderIndex}`, sceneSlug, sceneVersion: 1, orderIndex })) } } });
  return { gameId: id, email: f.email, currency: "ILS" as const, access: { userId: f.ownerId, draftToken: `${id}-cookie` }, legalVersion: LEGAL_VERSION };
}

describe("server-owned same-child world continuation", () => {
  it("two tabs create one unpaid game with the requested nine pinned boards and a separate frozen age", async () => {
    const f = await fixture(), source = await db.game.findUniqueOrThrow({ where: { id: f.sourceId } }), oldChild = await db.childProfile.findUniqueOrThrow({ where: { id: f.profileId } });
    const results = await Promise.all([beginWorldPurchase(f.c, f.input), beginWorldPurchase(f.c, f.input)]);
    expect(results.every(r => r.ok)).toBe(true);
    const ids = results.map(r => r.ok ? r.gameId : ""); expect(new Set(ids).size).toBe(1);
    const game = await db.game.findUniqueOrThrow({ where: { id: ids[0]! }, include: { childProfile: true, scenes: true } });
    expect(game).toMatchObject({ ownerId: f.ownerId, familyChildId: f.childId, status: "DRAFT", packageTier: "ONE_WORLD", sceneCount: 9, styleVersion: "local-patch-world-v1" });
    expect(game.scenes.map(s => s.sceneSlug).sort()).toEqual(boardsOfWorlds(["kingdom"]).sort()); expect(game.scenes.every(s => s.sceneVersion === 12)).toBe(true);
    expect(game.childProfile).toMatchObject({ ageYears: 8, originalPhotoAssetId: null, identityAssetId: null });
    expect(game.childProfileId).not.toBe(f.profileId);
    const reopened = await beginWorldPurchase(f.c, { ...f.input, ageYears: 5 }); expect(reopened).toMatchObject({ ok: true, gameId: game.id, reused: true });
    expect((await db.childProfile.findUniqueOrThrow({ where: { id: game.childProfileId! } })).ageYears).toBe(8);
    expect(await db.game.findUniqueOrThrow({ where: { id: f.sourceId } })).toEqual(source); expect(await db.childProfile.findUniqueOrThrow({ where: { id: f.profileId } })).toEqual(oldChild);
    expect(await db.order.count({ where: { gameId: game.id } })).toBe(0); expect(f.checkout).not.toHaveBeenCalled(); expect(await db.generationJob.count({ where: { gameId: game.id } })).toBe(0);
    expect(await setChildName(f.c, game.id, "Changed child", 5)).toMatchObject({ ok: false, code: "DRAFT_LOCKED" });
  });
  it("rejects foreign children, unavailable worlds and invalid ages before draft/order creation", async () => {
    const f = await fixture();
    for (const input of [{ ...f.input, ownerId: "stranger" }, { ...f.input, worldSlug: "timetravel" }, { ...f.input, ageYears: 0 }]) expect(await beginWorldPurchase(f.c, input)).toMatchObject({ ok: false });
    expect(await worldPurchaseContext(f.c, { ...f.input, ownerId: "stranger" })).toBeNull();
    expect(await db.game.count({ where: { ownerId: f.ownerId } })).toBe(1); expect(f.checkout).not.toHaveBeenCalled();
  });
  it("photo fallback preserves return context, then skips package/world reselection to checkout", async () => {
    const f = await fixture(), { result } = await prepared(f);
    expect(result.href).toBe(`/create/photo?game=${result.gameId}`);
    const context = await worldPurchaseContext(f.c, f.input); expect(context).toMatchObject({ state: "checkout", ageYears: 8, returnHref: `/family/${f.childId}/play/${f.sourceId}`, continuation: true });
    expect((await db.game.findUniqueOrThrow({ where: { id: result.gameId } })).status).toBe("PACKAGE_SELECTED");
    expect(await selectWorlds(f.c, result.gameId, ["journey"])).toMatchObject({ ok: false, code: "DRAFT_LOCKED" });
    expect(await selectPackage(f.c, result.gameId, "TWO_WORLDS")).toMatchObject({ ok: false });
    const fresh = await fixture(); await beginWorldPurchase(fresh.c, { ...fresh.input, returnGameId: "https://evil.invalid/" });
    expect((await db.childWorldPurchase.findFirstOrThrow({ where: { familyChildId: fresh.childId } })).returnGameId).toBeNull();
    expect((await worldPurchaseContext(fresh.c, { ...fresh.input, returnGameId: f.sourceId }))?.returnHref).toBe(`/family/${fresh.childId}`);
  });
  it.each([[true, 3000], [false, 3900]] as const)("charges server-verified price (prior paid=%s) once across parallel checkout and refresh", async (paid, amount) => {
    const f = await fixture(paid), { result, checkoutInput } = await prepared(f);
    const parallel = await Promise.all([startCheckout(f.c, checkoutInput), startCheckout(f.c, checkoutInput)]);
    expect(parallel.some(r => r.ok)).toBe(true); expect(f.checkout).toHaveBeenCalledTimes(1);
    const reopened = await startCheckout(f.c, checkoutInput); expect(reopened.ok).toBe(true); expect(f.checkout).toHaveBeenCalledTimes(1);
    const orders = await db.order.findMany({ where: { gameId: result.gameId } }); expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ amountAgorot: amount, currency: "ILS", paymentStatus: "PENDING", checkoutKey: `world-checkout:${result.gameId}` });
    expect((await db.game.findUniqueOrThrow({ where: { id: result.gameId } })).status).toBe("CHECKOUT_PENDING"); expect(await db.generationJob.count({ where: { gameId: result.gameId } })).toBe(0);
  });
  it("an uncertain provider response retries the identical order key, and only a verified webhook queues the game", async () => {
    const f = await fixture(), { result, checkoutInput } = await prepared(f), create = MockPaymentProvider.prototype.createCheckout.bind(f.payment);
    f.checkout.mockImplementationOnce(async request => { await create(request); throw Error("response lost after PSP accepted"); });
    expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    const before = await db.order.findFirstOrThrow({ where: { gameId: result.gameId } });
    expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" }); expect(f.checkout).toHaveBeenCalledTimes(1);
    await db.order.update({ where: { id: before.id }, data: { checkoutClaimUntil: new Date(0) } });
    expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: true }); expect(f.checkout).toHaveBeenCalledTimes(2);
    const requests = f.checkout.mock.calls.map(([request]) => request); expect(requests[0]).toEqual(requests[1]); expect(requests[0]!.idempotencyKey).toBe(before.id);
    expect(await db.order.count({ where: { gameId: result.gameId } })).toBe(1);
    const body = JSON.stringify({ eventId: `${before.id}-paid`, orderId: before.id, kind: "PAID", amountAgorot: 3000, currency: "ILS" });
    expect((await handlePaymentWebhook(f.c, body, { "x-mock-signature": f.payment.sign(body) })).status).toBe(200);
    expect((await handlePaymentWebhook(f.c, body, { "x-mock-signature": f.payment.sign(body) })).status).toBe(200);
    expect((await db.game.findUniqueOrThrow({ where: { id: result.gameId } })).status).toBe("PAID"); expect(await db.paymentEvent.count({ where: { orderId: before.id } })).toBe(1);
    expect(await beginWorldPurchase(f.c, f.input)).toMatchObject({ ok: true, reused: true, gameId: result.gameId, href: `/creating/${result.gameId}` });
  });
  it("will not dispatch an adapter without an explicit checkout idempotency guarantee", async () => {
    const f = await fixture(), { result, checkoutInput } = await prepared(f);
    const unsafe = { ...f.c, payment: { id: "mock" as const, createCheckout: f.checkout } } as unknown as Container;
    expect(await startCheckout(unsafe, checkoutInput)).toMatchObject({ ok: false, code: "SERVICE_UNAVAILABLE" });
    expect(f.checkout).not.toHaveBeenCalled(); expect(await db.order.count({ where: { gameId: result.gameId } })).toBe(0);
  });
  it("returns an owned world without another order or photo, including incomplete play", async () => {
    const f = await fixture(), returned = await beginWorldPurchase(f.c, { ...f.input, worldSlug: "journey" });
    expect(returned).toMatchObject({ ok: true, gameId: f.sourceId, reused: true, draftToken: null, href: `/family/${f.childId}/play/${f.sourceId}` });
    expect((await worldPurchaseContext(f.c, { ...f.input, worldSlug: "journey" }))?.state).toBe("ready");
    expect(await db.game.count({ where: { ownerId: f.ownerId } })).toBe(1); expect(f.checkout).not.toHaveBeenCalled();
  });
  it("rejects a separately created ordinary draft for a world already claimed in another tab", async () => {
    const f = await fixture(), { result, checkoutInput } = await prepared(f);
    const original = await db.game.findUniqueOrThrow({ where: { id: result.gameId }, include: { childProfile: true, scenes: true } });
    const duplicateId = `${result.gameId}-other-tab`, childId = `${original.childProfileId}-other`, assetId = `${childId}-photo`;
    await db.asset.create({ data: { id: assetId, ownerId: f.ownerId, type: "ORIGINAL_PHOTO", visibility: "PRIVATE", mimeType: "image/png", storagePath: `private/${assetId}.png` } });
    await db.childProfile.create({ data: { id: childId, ownerId: f.ownerId, displayName: original.childProfile!.displayName, ageYears: 8, originalPhotoAssetId: assetId } });
    await db.game.create({ data: { id: duplicateId, ownerId: f.ownerId, familyChildId: f.childId, childProfileId: childId, draftToken: `${duplicateId}-cookie`, status: "PACKAGE_SELECTED", packageTier: "ONE_WORLD", sceneCount: 9, styleVersion: "local-patch-world-v1",
      scenes: { create: original.scenes.map((s, i) => ({ id: `${duplicateId}-${i}`, sceneSlug: s.sceneSlug, sceneVersion: s.sceneVersion, orderIndex: i })) } } });
    expect(await startCheckout(f.c, { ...checkoutInput, gameId: duplicateId, access: { userId: f.ownerId, draftToken: `${duplicateId}-cookie` } })).toMatchObject({ ok: false, code: "DRAFT_LOCKED" });
    expect(f.checkout).not.toHaveBeenCalled(); expect(await db.order.count({ where: { gameId: duplicateId } })).toBe(0);
    expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: true }); expect(f.checkout).toHaveBeenCalledTimes(1);
  });
  it("finishes an interrupted photo-approved handoff before opening payment", async () => {
    const f = await fixture(), { result, checkoutInput } = await prepared(f);
    await db.game.update({ where: { id: result.gameId }, data: { status: "PHOTO_APPROVED" } });
    expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: true });
    expect((await db.game.findUniqueOrThrow({ where: { id: result.gameId } })).status).toBe("CHECKOUT_PENDING");
    expect(f.checkout).toHaveBeenCalledTimes(1);
  });
  it("will not replace a cancelled game while its previous checkout can still accept payment", async () => {
    const f = await fixture(), { result, checkoutInput } = await prepared(f);
    expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: true });
    await db.game.update({ where: { id: result.gameId }, data: { status: "CANCELLED" } });
    expect(await beginWorldPurchase(f.c, f.input)).toMatchObject({ ok: false, code: "DRAFT_LOCKED" });
    expect(await db.game.count({ where: { ownerId: f.ownerId } })).toBe(2); expect(f.checkout).toHaveBeenCalledTimes(1);
  });
  it("does not charge a continuation world withdrawn from the active catalog after the draft was created", async () => {
    const f = await fixture(), { result, checkoutInput } = await prepared(f), disabled = boardsOfWorlds(["kingdom"])[0]!;
    await db.sceneOverride.create({ data: { slug: disabled, active: false } });
    try {
      expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: false, code: "SCENE_UNAVAILABLE" });
      expect(f.checkout).not.toHaveBeenCalled(); expect(await db.order.count({ where: { gameId: result.gameId } })).toBe(0);
    } finally { await db.sceneOverride.delete({ where: { slug: disabled } }); }
  });

  it("freezes every draft edit while a payment page is live, and the accepted payment still queues its original game", async () => {
    const f = await fixture(), { result, checkoutInput } = await prepared(f);
    expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: true });
    const before = await db.game.findUniqueOrThrow({ where: { id: result.gameId }, include: { childProfile: true, scenes: { orderBy: { orderIndex: "asc" } }, orders: true } });
    const edits = [
      () => attachPhoto(f.c, result.gameId, { buffer: photo, mimeType: "image/png", crop: null }),
      () => setChildName(f.c, result.gameId, before.childProfile!.displayName, 8),
      () => chooseDraftChild(db, { gameId: result.gameId, actorId: f.ownerId, draftToken: result.draftToken, familyChildId: f.childId, name: before.childProfile!.displayName, ageYears: 8 }),
      () => selectPackage(f.c, result.gameId, "ONE_WORLD"),
      () => selectWorlds(f.c, result.gameId, ["kingdom"]),
      () => selectWorlds(f.c, result.gameId, ["journey"]),
    ];
    for (const edit of edits) expect(await edit()).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    expect(await db.game.findUniqueOrThrow({ where: { id: result.gameId }, include: { childProfile: true, scenes: { orderBy: { orderIndex: "asc" } }, orders: true } })).toEqual(before);
    expect(f.checkout).toHaveBeenCalledTimes(1);
    await payOrder(f, result.gameId);
    // PAID is the cron queue entry; payment does not run image generation.
    expect(await db.generationJob.count({ where: { gameId: result.gameId } })).toBe(0);
  });

  it("keeps an expired unknown payment claim immutable and prevents a second world's checkout", async () => {
    const f = await fixture(false), kingdom = await prepared(f), journey = await prepared({ ...f, input: { ...f.input, worldSlug: "journey" } });
    const create = MockPaymentProvider.prototype.createCheckout.bind(f.payment);
    f.checkout.mockImplementationOnce(async request => { await create(request); throw Error("unknown accepted result"); });
    expect(await startCheckout(f.c, kingdom.checkoutInput)).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    const order = await db.order.findFirstOrThrow({ where: { gameId: kingdom.result.gameId } });
    await db.order.update({ where: { id: order.id }, data: { checkoutClaimUntil: new Date(0) } });
    expect(await attachPhoto(f.c, kingdom.result.gameId, { buffer: photo, mimeType: "image/png", crop: null })).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    expect(await startCheckout(f.c, journey.checkoutInput)).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    await recordPriorPaidWorld(f);
    // A changed quote cannot change money/body after an unknown PSP result.
    expect(await startCheckout(f.c, kingdom.checkoutInput)).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ amountAgorot: 3900, checkoutKey: `world-checkout:${kingdom.result.gameId}`, checkoutUrl: null, checkoutClaimUntil: new Date(0) });
    expect(await db.order.count({ where: { gameId: journey.result.gameId } })).toBe(0); expect(f.checkout).toHaveBeenCalledTimes(1);
  });

  it("two worlds for one child serialize payment: the first costs 39 and the next costs 30 after its verified payment", async () => {
    const f = await fixture(false), kingdom = await prepared(f), journey = await prepared({ ...f, input: { ...f.input, worldSlug: "journey" } });
    const inputs = [kingdom.checkoutInput, journey.checkoutInput];
    const responses = await Promise.all(inputs.map(input => startCheckout(f.c, input)));
    expect(responses.filter(r => r.ok)).toHaveLength(1);
    expect(responses.find(r => !r.ok)).toMatchObject({ code: "CHECKOUT_IN_PROGRESS" });
    expect(f.checkout).toHaveBeenCalledTimes(1);
    const winner = inputs[responses.findIndex(r => r.ok)]!, loser = inputs[responses.findIndex(r => !r.ok)]!;
    expect((await payOrder(f, winner.gameId)).amountAgorot).toBe(3900);
    expect(await startCheckout(f.c, loser)).toMatchObject({ ok: true });
    expect((await db.order.findFirstOrThrow({ where: { gameId: loser.gameId } })).amountAgorot).toBe(3000);
    expect(f.checkout.mock.calls.map(([request]) => request.amountAgorot)).toEqual([3900, 3000]);
  });

  it("reprices a never-dispatched pending order under the child's final payment claim without replacing its ID", async () => {
    const f = await fixture(false), { result } = await prepared(f), orderId = `${result.gameId}-not-dispatched`;
    await db.order.create({ data: { id: orderId, gameId: result.gameId, userId: f.ownerId, amountAgorot: 3900, currency: "ILS", packageTier: "ONE_WORLD", provider: "mock", checkoutKey: `world-checkout:${result.gameId}` } });
    await recordPriorPaidWorld(f);
    // Even a stale caller quote is not payment authority.
    expect(await startWorldPurchaseCheckout(f.c, { gameId: result.gameId, userId: f.ownerId, email: f.email, amount: 3900, currency: "ILS", description: "Synthetic world", locale: "he" })).toMatchObject({ ok: true });
    expect(await db.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ amountAgorot: 3000, checkoutKey: `world-checkout:${result.gameId}`, paymentStatus: "PENDING" });
    expect(await db.order.count({ where: { gameId: result.gameId } })).toBe(1);
    expect(f.checkout).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ orderId, idempotencyKey: orderId, amountAgorot: 3000 }));
  });

  it("a claimed photo edit blocks checkout until storage completes, then payment uses the new approved photo", async () => {
    const f = await fixture(), { result, checkoutInput } = await prepared(f);
    let release!: () => void, started!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; }), arrived = new Promise<void>(resolve => { started = resolve; });
    const storage = new DbStorage(db), put = storage.put.bind(storage);
    const delayed = { ...f.c, storage: { id: "db" as const, put: async (...args: Parameters<typeof put>) => { started(); await blocked; return put(...args); }, delete: storage.delete.bind(storage), get: storage.get.bind(storage), exists: storage.exists.bind(storage) } } as Container;
    const photoChange = attachPhoto(delayed, result.gameId, { buffer: photo, mimeType: "image/png", crop: null });
    await arrived;
    try {
      expect((await db.game.findUniqueOrThrow({ where: { id: result.gameId } })).status).toBe("PHOTO_VALIDATING");
      expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: false, code: "PREVIOUS_STEPS" });
      expect(await db.order.count({ where: { gameId: result.gameId } })).toBe(0); expect(f.checkout).not.toHaveBeenCalled();
    } finally { release(); }
    expect(await photoChange).toEqual({ ok: true });
    expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: true });
  });

  it("an in-flight PSP attempt wins the opposite race and refuses photo/package edits before its response", async () => {
    const f = await fixture(), { result, checkoutInput } = await prepared(f);
    const before = await db.childProfile.findFirstOrThrow({ where: { games: { some: { id: result.gameId } } } });
    let release!: () => void, started!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; }), arrived = new Promise<void>(resolve => { started = resolve; });
    const create = MockPaymentProvider.prototype.createCheckout.bind(f.payment);
    f.checkout.mockImplementationOnce(async request => { started(); await blocked; return create(request); });
    const paying = startCheckout(f.c, checkoutInput);
    await arrived;
    try {
      expect(await attachPhoto(f.c, result.gameId, { buffer: photo, mimeType: "image/png", crop: null })).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
      expect(await selectPackage(f.c, result.gameId, "ONE_WORLD")).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
      expect(await db.childProfile.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
    } finally { release(); }
    expect(await paying).toMatchObject({ ok: true }); await payOrder(f, result.gameId);
  });

  it("a parent can close an abandoned unpaid payment before opening another world, and its old payment tab cannot pay", async () => {
    const f = await fixture(false), kingdom = await prepared(f), journey = await prepared({ ...f, input: { ...f.input, worldSlug: "journey" } });
    expect(await startCheckout(f.c, kingdom.checkoutInput)).toMatchObject({ ok: true });
    const order = await db.order.findFirstOrThrow({ where: { gameId: kingdom.result.gameId } }), close = vi.spyOn(f.payment, "closeCheckout");
    expect((await worldPurchaseContext(f.c, { ...f.input, worldSlug: "journey" }))?.earlierPaymentHref).toBe(`/checkout/close?game=${kingdom.result.gameId}`);
    expect(await closeDraftCheckout(f.c, { ownerId: "stranger", gameId: kingdom.result.gameId, orderId: order.id })).toMatchObject({ ok: false });
    expect(close).not.toHaveBeenCalled();
    const input = { ownerId: f.ownerId, gameId: kingdom.result.gameId, orderId: order.id };
    expect(await closeDraftCheckout(f.c, input)).toEqual({ ok: true });
    expect(await closeDraftCheckout(f.c, input)).toEqual({ ok: true }); expect(close).toHaveBeenCalledTimes(1);
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ paymentStatus: "CANCELLED", checkoutUrl: null, checkoutKey: null, checkoutClaimUntil: null });
    expect((await db.game.findUniqueOrThrow({ where: { id: kingdom.result.gameId } })).status).toBe("PACKAGE_SELECTED");
    expect(closeReceiptState((await db.auditLog.findUniqueOrThrow({ where: { id: checkoutCloseReceiptId(order.id) } })).metaJson)).toBe("closed_unpaid");
    const body = JSON.stringify({ eventId: `${order.id}-old-tab`, orderId: order.id, kind: "PAID", amountAgorot: order.amountAgorot, currency: order.currency });
    expect((await handlePaymentWebhook(f.c, body, { "x-mock-signature": f.payment.sign(body) })).status).toBe(400);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("CANCELLED");
    expect(await startCheckout(f.c, journey.checkoutInput)).toMatchObject({ ok: true });
    expect((await db.order.findFirstOrThrow({ where: { gameId: journey.result.gameId } })).amountAgorot).toBe(3900);
  });

  it("an unknown closure keeps its original payment and blocks edits/another world until the same close request is confirmed", async () => {
    const f = await fixture(false), kingdom = await prepared(f), journey = await prepared({ ...f, input: { ...f.input, worldSlug: "journey" } });
    expect(await startCheckout(f.c, kingdom.checkoutInput)).toMatchObject({ ok: true });
    const order = await db.order.findFirstOrThrow({ where: { gameId: kingdom.result.gameId } }), closeProvider = f.payment.closeCheckout.bind(f.payment);
    const close = vi.spyOn(f.payment, "closeCheckout").mockImplementationOnce(async request => { await closeProvider(request); throw Error("closed reply lost"); });
    const input = { ownerId: f.ownerId, gameId: kingdom.result.gameId, orderId: order.id };
    expect(await closeDraftCheckout(f.c, input)).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ paymentStatus: "PENDING", checkoutUrl: order.checkoutUrl, checkoutKey: order.checkoutKey, amountAgorot: order.amountAgorot });
    expect(await attachPhoto(f.c, kingdom.result.gameId, { buffer: photo, mimeType: "image/png", crop: null })).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    expect(await startCheckout(f.c, journey.checkoutInput)).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    expect(await closeDraftCheckout(f.c, input)).toEqual({ ok: true });
    expect(close.mock.calls[0]).toEqual(close.mock.calls[1]); expect(close).toHaveBeenCalledTimes(2);
    expect(await startCheckout(f.c, journey.checkoutInput)).toMatchObject({ ok: true });
  });

  it("FAILED is not terminal: the saved session resumes unchanged, and only confirmed closure permits replacement", async () => {
    const f = await fixture(), { result, checkoutInput } = await prepared(f);
    expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: true });
    const order = await db.order.findFirstOrThrow({ where: { gameId: result.gameId } });
    const body = JSON.stringify({ eventId: `${order.id}-declined`, orderId: order.id, kind: "FAILED", amountAgorot: order.amountAgorot, currency: order.currency });
    expect((await handlePaymentWebhook(f.c, body, { "x-mock-signature": f.payment.sign(body) })).status).toBe(200);
    expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: true, checkoutUrl: order.checkoutUrl });
    expect(f.checkout).toHaveBeenCalledTimes(1);
    expect(await attachPhoto(f.c, result.gameId, { buffer: photo, mimeType: "image/png", crop: null })).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).checkoutKey).toBe(order.checkoutKey);
    expect(await closeDraftCheckout(f.c, { ownerId: f.ownerId, gameId: result.gameId, orderId: order.id })).toEqual({ ok: true });
    expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: true });
    const replacement = await db.order.findFirstOrThrow({ where: { gameId: result.gameId, paymentStatus: "PENDING" } });
    expect(replacement.id).not.toBe(order.id); expect(f.checkout).toHaveBeenCalledTimes(2);
  });

  it("a declined saved session cannot resume at a changed continuation price or mutate its original quote", async () => {
    const f = await fixture(false), { result, checkoutInput } = await prepared(f);
    expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: true });
    const order = await db.order.findFirstOrThrow({ where: { gameId: result.gameId } });
    const declined = JSON.stringify({ eventId: `${order.id}-declined`, orderId: order.id, kind: "FAILED", amountAgorot: order.amountAgorot, currency: order.currency });
    expect((await handlePaymentWebhook(f.c, declined, { "x-mock-signature": f.payment.sign(declined) })).status).toBe(200);
    const before = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    await recordPriorPaidWorld(f);
    expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    expect(f.checkout).toHaveBeenCalledTimes(1); expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toEqual(before);
    expect(await db.order.count({ where: { gameId: result.gameId } })).toBe(1);
  });

  it("a verified payment that wins during a closure remains paid and never unlocks a replacement session", async () => {
    const f = await fixture(), { result, checkoutInput } = await prepared(f);
    expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: true });
    const order = await db.order.findFirstOrThrow({ where: { gameId: result.gameId } });
    let release!: () => void, started!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; }), arrived = new Promise<void>(resolve => { started = resolve; });
    const close = vi.spyOn(f.payment, "closeCheckout").mockImplementationOnce(async () => { started(); await blocked; return { state: "closed_unpaid" }; });
    const closing = closeDraftCheckout(f.c, { ownerId: f.ownerId, gameId: result.gameId, orderId: order.id });
    await arrived;
    try { await payOrder(f, result.gameId); } finally { release(); }
    expect(await closing).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe("PAID");
    expect((await db.game.findUniqueOrThrow({ where: { id: result.gameId } })).status).toBe("PAID");
    expect(close).toHaveBeenCalledTimes(1); expect(f.checkout).toHaveBeenCalledTimes(1);
  });

  it("an adapter without confirmed closure cannot unlock an abandoned session", async () => {
    const f = await fixture(), { result, checkoutInput } = await prepared(f);
    expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: true });
    const order = await db.order.findFirstOrThrow({ where: { gameId: result.gameId } });
    const c = { ...f.c, payment: { ...f.payment, id: "mock", closeCheckout: undefined } } as unknown as Container;
    expect(await closeDraftCheckout(c, { ownerId: f.ownerId, gameId: result.gameId, orderId: order.id })).toMatchObject({ ok: false, code: "SERVICE_UNAVAILABLE" });
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toEqual(order);
  });

  it("financial-only parent recovery closes a deleted game's old payment without restoring its art or status", async () => {
    const f = await fixture(false), kingdom = await prepared(f), journey = await prepared({ ...f, input: { ...f.input, worldSlug: "journey" } });
    expect(await startCheckout(f.c, kingdom.checkoutInput)).toMatchObject({ ok: true });
    const order = await db.order.findFirstOrThrow({ where: { gameId: kingdom.result.gameId } });
    await db.game.update({ where: { id: kingdom.result.gameId }, data: { status: "DELETED", deletedAt: new Date(), configJson: null } });
    expect(await startCheckout(f.c, journey.checkoutInput)).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    const context = await worldPurchaseContext(f.c, { ...f.input, worldSlug: "journey" });
    expect(context?.earlierPaymentHref).toBe(`/checkout/close?game=${kingdom.result.gameId}`);
    expect(await closeDraftCheckout(f.c, { ownerId: f.ownerId, gameId: kingdom.result.gameId, orderId: order.id })).toEqual({ ok: true });
    expect(await db.game.findUniqueOrThrow({ where: { id: kingdom.result.gameId } })).toMatchObject({ status: "DELETED", deletedAt: expect.any(Date), configJson: null });
    expect(await startCheckout(f.c, journey.checkoutInput)).toMatchObject({ ok: true });
  });

  it("a stale first upload cannot overwrite a newer approved photo after that newer photo's payment begins", async () => {
    const f = await fixture(), { result, checkoutInput } = await prepared(f);
    let release!: () => void, started!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; }), arrived = new Promise<void>(resolve => { started = resolve; });
    const storage = new DbStorage(db), put = storage.put.bind(storage);
    const delayed = { ...f.c, storage: { id: "db" as const, put: async (...args: Parameters<typeof put>) => { started(); await blocked; return put(...args); }, delete: storage.delete.bind(storage), get: storage.get.bind(storage), exists: storage.exists.bind(storage) } } as Container;
    const stale = attachPhoto(delayed, result.gameId, { buffer: photo, mimeType: "image/png", crop: null });
    await arrived;
    let latestPhoto: string | null = null;
    try {
      expect(await attachPhoto(f.c, result.gameId, { buffer: photo, mimeType: "image/png", crop: null })).toEqual({ ok: true });
      latestPhoto = (await db.game.findUniqueOrThrow({ where: { id: result.gameId }, include: { childProfile: true } })).childProfile!.originalPhotoAssetId;
      expect(await startCheckout(f.c, checkoutInput)).toMatchObject({ ok: true });
    } finally { release(); }
    expect(await stale).toMatchObject({ ok: false, code: "DRAFT_LOCKED" });
    expect((await db.game.findUniqueOrThrow({ where: { id: result.gameId }, include: { childProfile: true } })).childProfile!.originalPhotoAssetId).toBe(latestPhoto);
    expect((await db.game.findUniqueOrThrow({ where: { id: result.gameId } })).status).toBe("CHECKOUT_PENDING");
    await payOrder(f, result.gameId);
  });

  it("a simultaneous ordinary two-world package and one-world continuation share one child payment claim and preserve package pricing", async () => {
    const f = await fixture(false), one = await prepared(f), two = await ordinaryTwoWorldDraft(f);
    const inputs = [one.checkoutInput, two], results = await Promise.all(inputs.map(input => startCheckout(f.c, input)));
    expect(results.filter(r => r.ok)).toHaveLength(1); expect(results.find(r => !r.ok)).toMatchObject({ code: "CHECKOUT_IN_PROGRESS" });
    expect(f.checkout).toHaveBeenCalledTimes(1);
    const winner = results.findIndex(r => r.ok), loser = winner === 0 ? 1 : 0;
    expect((await payOrder(f, inputs[winner]!.gameId)).amountAgorot).toBe(winner === 0 ? 3900 : 6900);
    // Whichever product won owns Kingdom. Neither an overlapping package nor
    // a duplicate one-world draft may charge for that owned world again.
    expect(await startCheckout(f.c, inputs[loser]!)).toMatchObject({ ok: false, code: "DRAFT_LOCKED" });
    expect(await beginWorldPurchase(f.c, f.input)).toMatchObject({ ok: true, gameId: inputs[winner]!.gameId, reused: true });
    expect(await db.order.count({ where: { gameId: inputs[loser]!.gameId } })).toBe(0);
    expect(f.checkout).toHaveBeenCalledTimes(1);
    expect(await db.childWorldPurchase.count({ where: { activeGameId: two.gameId } })).toBe(0);
  });

  it("confirmed unpaid closure releases a one-world payment claim for an ordinary two-world package", async () => {
    const f = await fixture(false), one = await prepared(f), two = await ordinaryTwoWorldDraft(f);
    expect(await startCheckout(f.c, one.checkoutInput)).toMatchObject({ ok: true });
    const order = await db.order.findFirstOrThrow({ where: { gameId: one.result.gameId } });
    expect(await startCheckout(f.c, two)).toMatchObject({ ok: false, code: "CHECKOUT_IN_PROGRESS" });
    expect(f.checkout).toHaveBeenCalledTimes(1);
    expect(await closeDraftCheckout(f.c, { ownerId: f.ownerId, gameId: one.result.gameId, orderId: order.id })).toEqual({ ok: true });
    expect(await startCheckout(f.c, two)).toMatchObject({ ok: true });
    expect(f.checkout).toHaveBeenCalledTimes(2);
    expect((await payOrder(f, two.gameId)).amountAgorot).toBe(6900);
    expect(await db.childWorldPurchase.count({ where: { activeGameId: two.gameId } })).toBe(0);
  });

  it.each(["TWO_WORLDS", "ALL_WORLDS"] as const)("refuses %s containing an owned world before payment, while keeping the new world available separately", async tier => {
    const f = await fixture(), two = await ordinaryTwoWorldDraft(f);
    if (tier === "ALL_WORLDS") await db.game.update({ where: { id: two.gameId }, data: { packageTier: tier, sceneCount: 27,
      scenes: { create: Array.from({ length: 9 }, (_, i) => ({ id: `${two.gameId}-historical-${i}`, sceneSlug: `historical-world-${i}`, sceneVersion: 1, orderIndex: 18 + i })) } } });
    const source = await db.game.findUniqueOrThrow({ where: { id: f.sourceId }, include: { scenes: true, orders: true } });
    expect(await startCheckout(f.c, two)).toMatchObject({ ok: false, code: "DRAFT_LOCKED" });
    expect(f.checkout).not.toHaveBeenCalled(); expect(await db.order.count({ where: { gameId: two.gameId } })).toBe(0);
    expect(await beginWorldPurchase(f.c, { ...f.input, worldSlug: "journey" })).toMatchObject({ ok: true, gameId: f.sourceId, reused: true, href: `/family/${f.childId}/play/${f.sourceId}` });
    expect(await db.game.findUniqueOrThrow({ where: { id: f.sourceId }, include: { scenes: true, orders: true } })).toEqual(source);
    const one = await prepared(f);
    expect(await startCheckout(f.c, one.checkoutInput)).toMatchObject({ ok: true });
    expect((await db.order.findFirstOrThrow({ where: { gameId: one.result.gameId } })).amountAgorot).toBe(3000);
  });

  it("a pending multi-world draft is never adopted as a single-world intent and remains payable through its original order", async () => {
    const f = await fixture(false), two = await ordinaryTwoWorldDraft(f);
    expect(await startCheckout(f.c, two)).toMatchObject({ ok: true });
    const order = await db.order.findFirstOrThrow({ where: { gameId: two.gameId } });
    expect(await worldPurchaseContext(f.c, f.input)).toMatchObject({ state: "new", active: undefined, earlierPaymentHref: `/checkout/close?game=${two.gameId}` });
    const one = await beginWorldPurchase(f.c, f.input); expect(one.ok).toBe(true); if (!one.ok) throw Error("Expected fresh single-world intent");
    expect(one.gameId).not.toBe(two.gameId);
    expect(await db.childWorldPurchase.count({ where: { activeGameId: two.gameId } })).toBe(0);
    expect(await db.game.findUniqueOrThrow({ where: { id: two.gameId } })).toMatchObject({ packageTier: "TWO_WORLDS", sceneCount: 18, status: "CHECKOUT_PENDING" });
    expect(await startCheckout(f.c, two)).toMatchObject({ ok: true }); expect(f.checkout).toHaveBeenCalledTimes(1);
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toEqual(order);
    await payOrder(f, two.gameId);
    expect(await beginWorldPurchase(f.c, f.input)).toMatchObject({ ok: true, gameId: two.gameId, reused: true });
  });
});
