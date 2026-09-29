import type { Prisma } from "@prisma/client";
import { PACKAGE_ORDER } from "../domain/package";

/** A paid purchase belongs to one authenticated parent's child passport.
 * No name matching, expiry, pooled sibling discount or client-supplied price.
 * Deleted game images do not erase an unrefunded purchase's eligibility. */
export async function childHasPaidWorld(db: Pick<Prisma.TransactionClient, "order">, input: {
  ownerId?: string | null; familyChildId?: string | null; excludeGameId?: string;
}): Promise<boolean> {
  if (!input.ownerId || !input.familyChildId) return false;
  return !!await db.order.findFirst({ where: {
    userId: input.ownerId, paymentStatus: "PAID", refundedAt: null,
    packageTier: { in: PACKAGE_ORDER },
    game: { ownerId: input.ownerId, familyChildId: input.familyChildId,
      ...(input.excludeGameId ? { id: { not: input.excludeGameId } } : {}),
      familyChild: { is: { id: input.familyChildId, ownerId: input.ownerId, deletedAt: null } },
    },
  }, select: { id: true } });
}
