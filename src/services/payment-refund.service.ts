import { Prisma, type Order } from "@prisma/client";
import { canTransition } from "@/domain/order-state";
import { audit, type Actor } from "./audit.service";
import type { Container } from "./container";
import { statusOf, transitionGame } from "./game-status";

const MANUAL_REFUND_ACTION = "payment:manual-refund";
const manualRefundId = (orderId: string) => "aud_manual_refund_" + orderId;
const receiptState = (raw: string | null | undefined): unknown => {
  try { return JSON.parse(raw ?? "").state; }
  catch { return null; }
};

type Reader = Pick<Prisma.TransactionClient, "auditLog">;

export async function hasUnresolvedManualRefund(db: Reader, orderId: string): Promise<boolean> {
  const row = await db.auditLog.findUnique({ where: { id: manualRefundId(orderId) } });
  return !!row && (row.action !== MANUAL_REFUND_ACTION || row.entityId !== orderId || receiptState(row.metaJson) !== "refused");
}

/** Called inside the transaction that owns the payment transition. */
export async function recordConfirmedOrderRefund(c: Container, tx: Prisma.TransactionClient, order: Pick<Order, "id" | "gameId" | "paymentStatus" | "paidAt">, actor: Actor,
  providerRefundId?: string): Promise<void> {
  if (order.paymentStatus !== "REFUNDED") {
    const at = new Date();
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "REFUNDED", paidAt: order.paidAt ?? at, refundedAt: at } });
  }
  const manual = await tx.auditLog.findUnique({ where: { id: manualRefundId(order.id) } });
  if (manual?.action === MANUAL_REFUND_ACTION && manual.entityType === "Order" && manual.entityId === order.id
    && receiptState(manual.metaJson) !== "confirmed") {
    await tx.auditLog.update({ where: { id: manual.id }, data: { metaJson: JSON.stringify({ state: "confirmed",
      priorReceipt: manual.metaJson, providerRefundId: providerRefundId ?? null }) } });
  }
  const game = await tx.game.findUniqueOrThrow({ where: { id: order.gameId } });
  const otherPayment = game.ownerId && await tx.order.findFirst({ where: { gameId: game.id, userId: game.ownerId, id: { not: order.id },
    paymentStatus: "PAID", paidAt: { not: null }, refundedAt: null }, select: { id: true } });
  if (otherPayment) {
    await audit(c, actor, "payment:refund-preserved-entitlement", "Order", order.id, { remainingPaidOrderId: otherPayment.id }, tx);
    return;
  }
  const status = statusOf(game);
  if (status === "REFUNDED") return;
  if (canTransition(status, "REFUNDED")) {
    await transitionGame(c, game.id, "REFUNDED", actor, { orderId: order.id, providerRefundId }, tx);
  } else {
    await audit(c, actor, "payment:game-unreachable", "Game", game.id, { orderId: order.id, from: status, to: "REFUNDED" }, tx);
  }
}

type RefundResult = { ok: true; gameId: string } | { ok: false; reason: string };
const unresolved = (): RefundResult => ({ ok: false, reason: "תוצאת ההחזר עדיין בבדיקה." });
const unavailable = (): RefundResult => ({ ok: false, reason: "ההזמנה לא במצב ששולם." });

export async function runManualRefund(c: Container, orderId: string, actor: Actor): Promise<RefundResult> {
  let claim;
  try {
    claim = await c.db.$transaction(async tx => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order || order.provider !== c.payment.id || order.paymentStatus !== "PAID" || order.refundedAt
        || (order.provider === "payme" && !order.providerPaymentId)) return null;
      const game = await tx.game.findUniqueOrThrow({ where: { id: order.gameId } });
      // Serialize with webhooks; a generation-ceiling refund owns its existing attempt.
      const fenced = await tx.game.updateMany({ where: { id: game.id, updatedAt: game.updatedAt, status: game.status },
        data: { updatedAt: new Date(Math.max(Date.now(), game.updatedAt.getTime() + 1)) } });
      if (fenced.count !== 1) return null;
      const ceiling = await tx.auditLog.findUnique({ where: { id: "aud_ceiling_refund_" + game.id } });
      if (ceiling && receiptState(ceiling.metaJson) !== "refused") return { order, send: false as const, ceiling: true };
      const id = manualRefundId(orderId);
      const prior = await tx.auditLog.findUnique({ where: { id } });
      if (prior && (prior.action !== MANUAL_REFUND_ACTION || prior.entityId !== orderId || receiptState(prior.metaJson) !== "refused"))
        return { order, send: false as const, ceiling: false };
      const metaJson = JSON.stringify({ state: "sending", attemptAt: new Date().toISOString(), amountAgorot: order.amountAgorot,
        ...(prior ? { priorReceipt: prior.metaJson } : {}) });
      if (prior) await tx.auditLog.update({ where: { id }, data: { metaJson } });
      else await tx.auditLog.create({ data: { id, actorType: actor.type, actorId: "id" in actor ? actor.id : null, action: MANUAL_REFUND_ACTION,
        entityType: "Order", entityId: orderId, metaJson } });
      return { order, send: true as const, metaJson };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034", "P1008"].includes(error.code)) return unresolved();
    throw error;
  }
  if (!claim) return unavailable();
  const { order } = claim;
  let refundId: string | undefined;
  if (claim.send) {
    try {
      const answer = await c.payment.refund(order.providerPaymentId ?? "", order.amountAgorot);
      if (!answer.ok) {
        await c.db.auditLog.updateMany({ where: { id: manualRefundId(orderId), metaJson: claim.metaJson },
          data: { metaJson: JSON.stringify({ state: "refused", attempt: JSON.parse(claim.metaJson) }) } });
        return { ok: false, reason: "ספק התשלום סירב להחזר." };
      }
      refundId = answer.providerRefundId;
    } catch {
      return unresolved();
    }
  } else {
    // A lost response never authorizes another refund. A verified refunded state can finish it.
    if (claim.ceiling || !c.payment.refundStatus || !order.providerPaymentId) return unresolved();
    try {
      if (await c.payment.refundStatus(order.providerPaymentId) !== "refunded") return unresolved();
    } catch { return unresolved(); }
  }
  await c.db.$transaction(async tx => {
    const current = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (current.gameId !== order.gameId || current.provider !== order.provider || current.providerPaymentId !== order.providerPaymentId
      || current.amountAgorot !== order.amountAgorot || current.currency !== order.currency) throw Error("Refund order changed after dispatch");
    if (current.paymentStatus === "PAID") await recordConfirmedOrderRefund(c, tx, current, actor, refundId);
    else if (current.paymentStatus !== "REFUNDED") throw Error("Unexpected order state after verified refund");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  return { ok: true, gameId: order.gameId };
}
