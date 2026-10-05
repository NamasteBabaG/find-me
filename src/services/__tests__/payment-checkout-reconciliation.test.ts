import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "@/lib/test-schema";
import { MockPaymentProvider } from "@/infra/payment/mock";
import type { PaymentEventKind } from "@/infra/payment/types";
import { checkoutCloseReceiptId } from "../checkout-close.service";
import { handlePaymentWebhook } from "../order.service";
import type { Container } from "../container";

let db: PrismaClient, scratch: string, sequence = 0;
beforeAll(async () => {
  scratch = mkdtempSync(path.join(realpathSync(tmpdir()), "findme-payment-close-"));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.db").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
});
afterAll(async () => {
  await db?.$disconnect();
  const absolute = path.resolve(scratch);
  if (path.dirname(absolute) === realpathSync(tmpdir()) && path.basename(absolute).startsWith("findme-payment-close-")) rmSync(absolute, { recursive: true, force: true });
});

async function fixture(provider = "mock", state = "CHECKOUT_PENDING", orderState = "PENDING") {
  const id = `payment-close-${++sequence}`, userId = `${id}-owner`, gameId = `${id}-game`, orderId = `${id}-order`;
  await db.user.create({ data: { id: userId, email: `${id}@example.invalid` } });
  const child = await db.familyChild.create({ data: { id: `${id}-child`, ownerId: userId, displayName: "Synthetic" } });
  await db.game.create({ data: { id: gameId, ownerId: userId, familyChildId: child.id, status: state } });
  await db.order.create({ data: { id: orderId, gameId, userId, provider, packageTier: "ONE_WORLD", amountAgorot: 3900,
    currency: "ILS", paymentStatus: orderState, checkoutKey: `world-checkout:${gameId}`, checkoutUrl: "https://payment.invalid/synthetic",
    providerPaymentId: `${provider}-${orderId}` } });
  const payment = new MockPaymentProvider("https://example.invalid", "synthetic-payment-secret");
  const c = { db, payment, analytics: { track: vi.fn() } } as unknown as Container;
  const deliver = async (kind: PaymentEventKind, eventId: string, targetOrder = orderId, amountAgorot = 3900) => {
    const raw = JSON.stringify({ eventId, orderId: targetOrder, kind, amountAgorot, currency: "ILS" });
    return handlePaymentWebhook(c, raw, { "x-mock-signature": payment.sign(raw) });
  };
  return { c, payment, deliver, gameId, orderId, userId, childId: child.id };
}
async function closedReceipt(orderId: string, metaJson = JSON.stringify({ version: "checkout-close/v1", state: "closed_unpaid" })) {
  await db.auditLog.create({ data: { id: checkoutCloseReceiptId(orderId), action: "checkout:close", actorType: "USER",
    entityType: "Order", entityId: orderId, metaJson } });
}

describe("payment reconciliation uses provider truth and the checkout write fence", () => {
  it("refuses a later mock payment after a durable confirmed close, without recording payment or generating", async () => {
    const f = await fixture("mock", "PACKAGE_SELECTED", "CANCELLED");
    await closedReceipt(f.orderId);
    await db.order.update({ where: { id: f.orderId }, data: { checkoutKey: null, checkoutUrl: null, checkoutClaimUntil: null } });
    expect(await f.deliver("PAID", "late-after-closed")).toEqual({ status: 400, body: "rejected: closed mock checkout" });
    expect((await db.order.findUniqueOrThrow({ where: { id: f.orderId } })).paymentStatus).toBe("CANCELLED");
    expect((await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).status).toBe("PACKAGE_SELECTED");
    expect(await db.paymentEvent.count({ where: { orderId: f.orderId } })).toBe(0);
    expect(f.c.analytics.track).not.toHaveBeenCalled();
  });

  it.each(["unknown", "closing", "not-json"])("never interprets %s close state as nonpayment", async state => {
    const f = await fixture();
    await closedReceipt(f.orderId, state === "not-json" ? state : JSON.stringify({ state }));
    expect(await f.deliver("PAID", `paid-${state}`)).toEqual({ status: 200, body: "ok" });
    expect((await db.order.findUniqueOrThrow({ where: { id: f.orderId } })).paymentStatus).toBe("PAID");
    expect((await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).status).toBe("PAID");
  });

  it("keeps actual real-provider money on a locally cancelled game even if a close receipt contradicts it", async () => {
    const f = await fixture("payme", "CANCELLED", "CANCELLED");
    await closedReceipt(f.orderId);
    f.c.payment = { id: "payme", createCheckout: vi.fn(async () => { throw new Error("Unexpected checkout in money reconciliation"); }),
      refund: vi.fn(async () => { throw new Error("Unexpected refund in money reconciliation"); }),
      parseWebhook: async () => ({ ok: true, event: { orderId: f.orderId, kind: "PAID",
      providerEventId: "real-late-paid", amountAgorot: 3900, currency: "ILS", providerPaymentId: "synthetic-real-payment", raw: {} } }) } as Container["payment"];
    expect(await handlePaymentWebhook(f.c, "", {})).toEqual({ status: 200, body: "ok" });
    expect((await db.order.findUniqueOrThrow({ where: { id: f.orderId } })).paymentStatus).toBe("PAID");
    expect((await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).status).toBe("CANCELLED");
    expect(await db.auditLog.count({ where: { action: "payment:game-unreachable", entityId: f.gameId } })).toBe(1);
  });

  it("reconciles a later PAID after FAILED on the original session, exactly once", async () => {
    const f = await fixture();
    expect(await f.deliver("FAILED", "declined-original")).toEqual({ status: 200, body: "ok" });
    expect((await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).status).toBe("PAYMENT_FAILED");
    expect(await f.deliver("PAID", "paid-original")).toEqual({ status: 200, body: "ok" });
    expect(await f.deliver("PAID", "paid-redelivery")).toEqual({ status: 200, body: "already paid" });
    expect((await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).status).toBe("PAID");
    expect(await db.order.count({ where: { gameId: f.gameId } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "status:CHECKOUT_PENDING->PAID", entityId: f.gameId } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "payment:game-unreachable", entityId: f.gameId } })).toBe(0);
    expect(f.c.analytics.track).toHaveBeenCalledTimes(1);
  });

  it("records both distinct paid orders as money, audits the second once, and never restarts generation", async () => {
    const f = await fixture(), otherId = `${f.orderId}-second`;
    await db.order.create({ data: { id: otherId, gameId: f.gameId, userId: f.userId, provider: "mock", packageTier: "ONE_WORLD",
      amountAgorot: 3900, currency: "ILS", paymentStatus: "PENDING" } });
    expect((await f.deliver("PAID", "first-money")).status).toBe(200);
    await db.game.update({ where: { id: f.gameId }, data: { status: "TARGETS_GENERATING" } });
    expect(await f.deliver("PAID", "second-money", otherId)).toEqual({ status: 200, body: "duplicate payment recorded" });
    expect(await f.deliver("PAID", "second-money-retry", otherId)).toEqual({ status: 200, body: "already paid" });
    expect(await db.order.count({ where: { gameId: f.gameId, paymentStatus: "PAID" } })).toBe(2);
    expect((await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).status).toBe("TARGETS_GENERATING");
    expect(await db.auditLog.count({ where: { action: "payment:duplicate-order-paid", entityId: f.gameId } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "status:CHECKOUT_PENDING->PAID", entityId: f.gameId } })).toBe(1);
    expect(f.c.analytics.track).toHaveBeenCalledTimes(1);
  });

  it("serializes distinct event IDs for one session and emits analytics only once", async () => {
    const f = await fixture();
    const results = await Promise.all([f.deliver("PAID", "concurrent-a"), f.deliver("PAID", "concurrent-b")]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    expect(await db.paymentEvent.count({ where: { orderId: f.orderId } })).toBe(2);
    expect(f.c.analytics.track).toHaveBeenCalledTimes(1);
    expect(await db.auditLog.count({ where: { action: "status:CHECKOUT_PENDING->PAID", entityId: f.gameId } })).toBe(1);
  });

  it("validates current money after the transaction fence, not a pre-transaction quote", async () => {
    const f = await fixture(), original = db.$transaction;
    db.$transaction = (async (callback: Parameters<typeof original>[0], options: Parameters<typeof original>[1]) => {
      await db.order.update({ where: { id: f.orderId }, data: { amountAgorot: 3000 } });
      return original.call(db, callback as never, options);
    }) as typeof db.$transaction;
    try { expect(await f.deliver("PAID", "old-quote")).toEqual({ status: 400, body: "amount mismatch" }); }
    finally { db.$transaction = original; }
    expect((await db.order.findUniqueOrThrow({ where: { id: f.orderId } })).paymentStatus).toBe("PENDING");
    expect(await db.paymentEvent.count({ where: { orderId: f.orderId } })).toBe(0);
    expect(f.c.analytics.track).not.toHaveBeenCalled();
  });

  it("rejects an event parsed by a different provider before changing the order", async () => {
    const f = await fixture("payme");
    expect(await f.deliver("PAID", "wrong-provider")).toEqual({ status: 400, body: "provider mismatch" });
    expect((await db.order.findUniqueOrThrow({ where: { id: f.orderId } })).paymentStatus).toBe("PENDING");
  });
});
