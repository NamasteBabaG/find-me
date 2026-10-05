import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Container } from "./container";
import { transitionGame } from "./game-status";
import { flowError, type FlowResult } from "@/i18n/errors";

export function checkoutCloseReceiptId(orderId: string) {
  return `close_${createHash("sha256").update(orderId).digest("hex").slice(0, 32)}`;
}
export function closeReceiptState(metaJson: string | null): string | null {
  try { const value = JSON.parse(metaJson ?? "null"); return typeof value?.state === "string" ? value.state : null; } catch { return null; }
}
function receiptLease(metaJson: string | null): number {
  try { const value = JSON.parse(metaJson ?? "null"); return typeof value?.leaseUntil === "number" ? value.leaseUntil : 0; } catch { return 0; }
}
const busy = () => flowError("CHECKOUT_IN_PROGRESS", "התשלום עדיין לא נסגר בוודאות. אפשר לחזור לסגירת התשלום.");

/** Parent-authorized closure only. Timeouts and declines do not prove nonpayment. */
export async function closeDraftCheckout(c: Container, input: { ownerId: string; gameId: string; orderId?: string }): Promise<FlowResult> {
  const now = new Date(), lease = new Date(now.getTime() + 120_000);
  let claim;
  try {
    claim = await c.db.$transaction(async tx => {
      const game = await tx.game.findFirst({ where: { id: input.gameId, ownerId: input.ownerId } });
      if (!game) return { state: "missing" as const };
      const fenced = await tx.game.updateMany({ where: { id: game.id, ownerId: input.ownerId, updatedAt: game.updatedAt, status: game.status, deletedAt: game.deletedAt }, data: { updatedAt: new Date(Math.max(Date.now(), game.updatedAt.getTime() + 1)) } });
      if (fenced.count !== 1) return { state: "busy" as const };
      if (game.familyChildId) {
        const child = await tx.familyChild.findFirst({ where: { id: game.familyChildId, ownerId: input.ownerId } });
        if (!child || (await tx.familyChild.updateMany({ where: { id: child.id, ownerId: input.ownerId, deletedAt: child.deletedAt }, data: { displayName: child.displayName } })).count !== 1) return { state: "missing" as const };
      }
      const order = await tx.order.findFirst({ where: { gameId: game.id, userId: input.ownerId,
        ...(input.orderId ? { id: input.orderId } : { paymentStatus: { in: ["PENDING", "FAILED"] } }) }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      if (!order || order.provider !== c.payment.id) return { state: "missing" as const };
      const id = checkoutCloseReceiptId(order.id), previous = await tx.auditLog.findUnique({ where: { id } });
      if (closeReceiptState(previous?.metaJson ?? null) === "closed_unpaid") return { state: "closed" as const };
      if (!["PENDING", "FAILED", "CANCELLED"].includes(order.paymentStatus) || await tx.order.count({ where: { gameId: game.id, paymentStatus: "PAID" } })) return { state: "paid" as const };
      if (!c.payment.closeCheckout) return { state: "unsupported" as const };
      if (receiptLease(previous?.metaJson ?? null) > now.getTime() || !previous && order.checkoutClaimUntil && order.checkoutClaimUntil > now) return { state: "busy" as const };
      const metaJson = JSON.stringify({ version: "checkout-close/v1", state: "closing", leaseUntil: lease.getTime(), orderId: order.id });
      if (previous) await tx.auditLog.update({ where: { id }, data: { metaJson } });
      else await tx.auditLog.create({ data: { id, actorType: "USER", actorId: input.ownerId, action: "checkout:close", entityType: "Order", entityId: order.id, metaJson } });
      await tx.order.update({ where: { id: order.id }, data: { checkoutClaimUntil: lease } });
      return { state: "claimed" as const, order, id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034", "P1008"].includes(error.code)) return busy();
    throw error;
  }
  if (claim.state === "closed") return { ok: true };
  if (claim.state === "busy") return busy();
  if (claim.state === "unsupported") return flowError("SERVICE_UNAVAILABLE", "ספק התשלום עדיין לא מאפשר סגירה בטוחה.");
  if (claim.state !== "claimed") return flowError("DRAFT_LOCKED", "התשלום לא ניתן לסגירה כאן.");

  let result: import("@/infra/payment/types").CloseCheckoutResult;
  try { result = await c.payment.closeCheckout!({ orderId: claim.order.id, providerPaymentId: claim.order.providerPaymentId, idempotencyKey: claim.order.id }); }
  catch { result = { state: "unknown" }; }
  try {
    return await c.db.$transaction(async tx => {
      const game = await tx.game.findFirst({ where: { id: input.gameId, ownerId: input.ownerId } });
      if (!game) return busy();
      if ((await tx.game.updateMany({ where: { id: game.id, ownerId: input.ownerId, updatedAt: game.updatedAt, status: game.status, deletedAt: game.deletedAt }, data: { updatedAt: new Date(Math.max(Date.now(), game.updatedAt.getTime() + 1)) } })).count !== 1) return busy();
      if (game.familyChildId) {
        const child = await tx.familyChild.findFirst({ where: { id: game.familyChildId, ownerId: input.ownerId } });
        if (!child || (await tx.familyChild.updateMany({ where: { id: child.id, ownerId: input.ownerId, deletedAt: child.deletedAt }, data: { displayName: child.displayName } })).count !== 1) return busy();
      }
      const receipt = await tx.auditLog.findUnique({ where: { id: claim.id } });
      if (!receipt || receiptLease(receipt.metaJson) !== lease.getTime()) return busy();
      const order = await tx.order.findFirst({ where: { id: claim.order.id, gameId: game.id, userId: input.ownerId, provider: c.payment.id, checkoutClaimUntil: lease } });
      const paid = !order || !["PENDING", "FAILED", "CANCELLED"].includes(order.paymentStatus) || await tx.order.count({ where: { gameId: game.id, paymentStatus: "PAID" } });
      if (result.state !== "closed_unpaid" || paid) {
        await tx.auditLog.update({ where: { id: claim.id }, data: { metaJson: JSON.stringify({ version: "checkout-close/v1", state: paid || result.state === "paid" ? "paid" : "unknown", leaseUntil: 0, orderId: claim.order.id }) } });
        return busy();
      }
      // Preserve financial history; only proven nonpayable attempts release the
      // child boundary and permit a new price/order. Source art is untouched.
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "CANCELLED", checkoutKey: null, checkoutUrl: null, checkoutClaimUntil: null } });
      if (!game.deletedAt && game.status === "PAYMENT_FAILED") await transitionGame(c, game.id, "CHECKOUT_PENDING", { type: "USER", id: input.ownerId }, { source: "confirmed-payment-close" }, tx);
      if (!game.deletedAt && ["CHECKOUT_PENDING", "PAYMENT_FAILED"].includes(game.status)) await transitionGame(c, game.id, "PACKAGE_SELECTED", { type: "USER", id: input.ownerId }, { source: "confirmed-payment-close" }, tx);
      await tx.auditLog.update({ where: { id: claim.id }, data: { metaJson: JSON.stringify({ version: "checkout-close/v1", state: "closed_unpaid", leaseUntil: 0, orderId: order.id, providerCloseId: result.providerCloseId ?? null }) } });
      return { ok: true } as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P1008"].includes(error.code)) return busy();
    throw error;
  }
}
