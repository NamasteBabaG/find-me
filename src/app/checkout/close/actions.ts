"use server";
import { redirect } from "next/navigation";
import { requireQaAccess } from "@/lib/server/qa-access";
import { currentUser } from "@/lib/server/session";
import { guardDb } from "@/lib/server/db-guard";
import { LIMITS, rateLimit } from "@/lib/server/rate-limit";
import { getContainer } from "@/services/container";
import { closeDraftCheckout } from "@/services/checkout-close.service";
import { worldPurchaseDraftHref, worldPurchaseSignInHref } from "@/domain/world-purchase";
import { flowError, type FlowResult } from "@/i18n/errors";

export async function closePaymentAction(_previous: FlowResult | null, form: FormData): Promise<FlowResult> {
  await requireQaAccess();
  const gameId = String(form.get("gameId") ?? ""), orderId = String(form.get("orderId") ?? "");
  const user = await currentUser();
  if (!user) redirect(worldPurchaseSignInHref(form.get("recovery") === "1" ? `/checkout/close?${new URLSearchParams({ game: gameId })}` : worldPurchaseDraftHref(gameId, "checkout")));
  if (!rateLimit(`close-payment:${user.id}`, LIMITS.checkout.limit, LIMITS.checkout.windowMs).ok) return flowError("TOO_MANY_REQUESTS", "יותר מדי ניסיונות.");
  const c = getContainer();
  const result = await guardDb(() => closeDraftCheckout(c, { ownerId: user.id, gameId, orderId }));
  if (!result.ok) return result;
  if (form.get("recovery") === "1") {
    const game = await c.db.game.findFirst({ where: { id: gameId, ownerId: user.id }, select: { familyChild: { select: { id: true, ownerId: true, deletedAt: true } } } });
    redirect(game?.familyChild && game.familyChild.ownerId === user.id && !game.familyChild.deletedAt ? `/family/${encodeURIComponent(game.familyChild.id)}` : "/family");
  }
  const intent = await c.db.childWorldPurchase.findFirst({ where: { activeGameId: gameId, ownerId: user.id } });
  redirect(intent ? `${worldPurchaseDraftHref(gameId, "checkout")}&cancelled=1` : "/checkout?cancelled=1");
}
