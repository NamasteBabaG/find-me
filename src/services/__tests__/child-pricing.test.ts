import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../lib/test-schema";
import { childHasPaidWorld } from "../child-pricing.service";
import { reconcilePaidFamilyChildren } from "../family.service";
import { startCheckout, handlePaymentWebhook } from "../order.service";
import { MockPaymentProvider } from "../../infra/payment/mock";
import { boardsFor, type PackageTier } from "../../domain/package";
import type { Container } from "../container";

vi.mock("../../lib/env", () => ({ env: () => ({ APP_ENV: "development" }), spendGuard: () => ({ appEnv: "development", realGeneration: false, testers: [] }) }));
let db: PrismaClient, scratch: string, sequence = 0;
beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "findme-child-pricing-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  await db.user.createMany({ data: [{ id: "parent", email: "pricing@example.invalid" }, { id: "other", email: "other@example.invalid" }] });
}, 30_000);
afterAll(async () => {
  await db?.$disconnect();
  if (scratch && path.dirname(scratch) === tmpdir() && path.basename(scratch).startsWith("findme-child-pricing-")) await rm(scratch, { recursive: true, force: true });
});
async function passport(ownerId = "parent") {
  return db.familyChild.create({ data: { id: `passport-${++sequence}`, ownerId, displayName: "Same name" } });
}
async function game(familyChildId: string | null, tier: PackageTier = "ONE_WORLD") {
  const id = `pricing-${++sequence}`, photoId = `${id}-photo`, childId = `${id}-profile`;
  await db.asset.create({ data: { id: photoId, ownerId: "parent", type: "ORIGINAL_PHOTO", visibility: "PRIVATE", mimeType: "image/png", storagePath: `private/${photoId}.png`, bytes: 1, width: 1, height: 1 } });
  await db.childProfile.create({ data: { id: childId, ownerId: "parent", displayName: "Same name", ageYears: 8, originalPhotoAssetId: photoId } });
  return db.game.create({ data: { id, ownerId: "parent", familyChildId, childProfileId: childId, packageTier: tier, status: "PACKAGE_SELECTED", draftToken: `cookie-${id}`,
    scenes: { create: Array.from({ length: boardsFor(tier) }, (_, orderIndex) => ({ id: `${id}-scene-${orderIndex}`, sceneSlug: `synthetic-${orderIndex}`, sceneVersion: 1, orderIndex })) } } });
}
async function purchase(familyChildId: string | null, paymentStatus = "PAID") {
  const g = await game(familyChildId);
  await db.game.update({ where: { id: g.id }, data: { status: "DELIVERED", paidAt: new Date("2025-01-01") } });
  const order = await db.order.create({ data: { id: `${g.id}-old-order`, gameId: g.id, userId: "parent", amountAgorot: 4900, currency: "ILS", paymentStatus, paidAt: new Date("2025-01-01"), provider: "mock", packageTier: "ONE_WORLD" } });
  return { game: g, order };
}
function context() {
  const payment = new MockPaymentProvider("https://pricing.invalid", "synthetic-pricing-secret");
  const checkout = vi.spyOn(payment, "createCheckout");
  const c = { db, payment, appUrl: "https://pricing.invalid", analytics: { track: vi.fn() } } as unknown as Container;
  return { c, payment, checkout };
}
describe("per-child continuation pricing", () => {
  it.each(["ONE_WORLD", "TWO_WORLDS", "ALL_WORLDS"] as const)("charges a returning passport for only new worlds: %s, including a year-old purchase", async tier => {
    const child = await passport(), old = await purchase(child.id), draft = await game(child.id, tier), { c, checkout, payment } = context();
    const input = { gameId: draft.id, email: "pricing@example.invalid", currency: "ILS" as const, access: { userId: "parent", draftToken: draft.draftToken } };
    const amount = boardsFor(tier) / 9 * 3000;
    expect(await startCheckout(c, input)).toMatchObject({ ok: true });
    expect(await startCheckout(c, input)).toMatchObject({ ok: true });
    expect(checkout.mock.calls.every(([r]) => r.amountAgorot === amount && r.currency === "ILS")).toBe(true);
    const orders = await db.order.findMany({ where: { gameId: draft.id } });
    expect(orders).toHaveLength(1); expect(orders[0]!.amountAgorot).toBe(amount);
    expect((await db.order.findUniqueOrThrow({ where: { id: old.order.id } })).amountAgorot).toBe(4900);
    const paid = JSON.stringify({ eventId: `paid-${draft.id}`, orderId: orders[0]!.id, kind: "PAID", amountAgorot: amount, currency: "ILS" });
    expect((await handlePaymentWebhook(c, paid, { "x-mock-signature": payment.sign(paid) })).status).toBe(200);
    expect((await handlePaymentWebhook(c, paid, { "x-mock-signature": payment.sign(paid) })).status).toBe(200);
    expect((await db.game.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe("PAID");
  });
  it("a same-name sibling pays 39 and another parent cannot use this child's entitlement", async () => {
    const a = await passport(), b = await passport(); await purchase(a.id);
    expect(await childHasPaidWorld(db, { ownerId: "parent", familyChildId: b.id })).toBe(false);
    expect(await childHasPaidWorld(db, { ownerId: "other", familyChildId: a.id })).toBe(false);
    const draft = await game(b.id), { c, checkout } = context();
    expect(await startCheckout(c, { gameId: draft.id, email: "pricing@example.invalid", currency: "ILS", access: { userId: "parent", draftToken: draft.draftToken } })).toMatchObject({ ok: true });
    expect(checkout.mock.calls[0]![0].amountAgorot).toBe(3900);
  });
  it.each(["PENDING", "FAILED", "CANCELLED", "REFUNDED"])("%s does not grant the continuation price", async state => {
    const child = await passport(); await purchase(child.id, state);
    expect(await childHasPaidWorld(db, { ownerId: "parent", familyChildId: child.id })).toBe(false);
  });
  it("does not count a refund timestamp, deleted passport or the current order as prior payment", async () => {
    const child = await passport(), old = await purchase(child.id);
    expect(await childHasPaidWorld(db, { ownerId: "parent", familyChildId: child.id, excludeGameId: old.game.id })).toBe(false);
    await db.order.update({ where: { id: old.order.id }, data: { refundedAt: new Date() } });
    expect(await childHasPaidWorld(db, { ownerId: "parent", familyChildId: child.id })).toBe(false);
    await db.order.update({ where: { id: old.order.id }, data: { refundedAt: null } });
    await db.familyChild.update({ where: { id: child.id }, data: { deletedAt: new Date() } });
    expect(await childHasPaidWorld(db, { ownerId: "parent", familyChildId: child.id })).toBe(false);
  });
  it("includes pre-passport customers after the existing family reconciliation", async () => {
    const old = await purchase(null); await reconcilePaidFamilyChildren(db, "parent", old.game.id);
    const reconciled = await db.game.findUniqueOrThrow({ where: { id: old.game.id } });
    expect(reconciled.familyChildId).toBeTruthy();
    expect(await childHasPaidWorld(db, { ownerId: "parent", familyChildId: reconciled.familyChildId })).toBe(true);
    await db.game.update({ where: { id: old.game.id }, data: { status: "DELETED", deletedAt: new Date() } });
    expect(await childHasPaidWorld(db, { ownerId: "parent", familyChildId: reconciled.familyChildId })).toBe(true);
  });
});
