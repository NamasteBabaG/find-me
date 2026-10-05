import type { Prisma } from "@prisma/client";

/** A dispatched attempt stays uncertain after its lease expires. The same
 * provider key may be retried, but its draft and price must remain unchanged. */
export const outstandingCheckout = (order: { paymentStatus: string; checkoutUrl: string | null; checkoutClaimUntil: Date | null; providerPaymentId?: string | null }) =>
  ["PENDING", "FAILED", "CANCELLED"].includes(order.paymentStatus)
  && Boolean(order.checkoutUrl || order.checkoutClaimUntil || order.paymentStatus !== "CANCELLED" && order.providerPaymentId);

export class DraftCheckoutInProgress extends Error {
  constructor() { super("An existing payment attempt must finish before this draft can change"); }
}

/** Call only after taking the game's write fence, in the same transaction. */
export async function assertNoOutstandingCheckout(db: Pick<Prisma.TransactionClient, "order">, gameId: string): Promise<void> {
  const order = await db.order.findFirst({ where: { gameId, OR: [
    { paymentStatus: { in: ["PENDING", "FAILED", "CANCELLED"] }, OR: [{ checkoutUrl: { not: null } }, { checkoutClaimUntil: { not: null } }] },
    { paymentStatus: { in: ["PENDING", "FAILED"] }, providerPaymentId: { not: null } },
  ] }, select: { id: true } });
  if (order) throw new DraftCheckoutInProgress();
}
