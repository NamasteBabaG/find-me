import { notFound, redirect } from "next/navigation";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { requireQaAccess } from "@/lib/server/qa-access";
import { getContainer } from "@/services/container";
import { getI18n } from "@/i18n/server";
import { worldPurchaseSignInHref } from "@/domain/world-purchase";
import { outstandingCheckout } from "@/services/draft-checkout-lock";
import { SiteHeader, SiteFooter } from "@/ui/Shell";
import { LinkButton } from "@/ui/Button";
import { ClosePaymentForm } from "./ClosePaymentForm";

export const metadata = { robots: { index: false, follow: false } };

/** Financial-only recovery also works after game art and draft access were deleted. */
export default async function ClosePaymentPage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  await requireQaAccess();
  const [query, user, { t }] = await Promise.all([searchParams, currentUser(), getI18n()]);
  const gameId = typeof query.game === "string" ? query.game : "";
  if (!user) redirect(worldPurchaseSignInHref(`/checkout/close?${new URLSearchParams({ game: gameId })}`));
  const c = getContainer();
  const game = await c.db.game.findFirst({ where: { id: gameId, ownerId: user.id }, select: {
    id: true, familyChild: { select: { id: true, ownerId: true, deletedAt: true } },
    orders: { where: { userId: user.id, paymentStatus: { in: ["PENDING", "FAILED", "CANCELLED", "PAID"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, paymentStatus: true, refundedAt: true, checkoutUrl: true, checkoutClaimUntil: true, providerPaymentId: true } },
  } });
  if (!game) notFound();
  const order = game.orders.find(outstandingCheckout);
  const paid = game.orders.some(row => row.paymentStatus === "PAID" && !row.refundedAt);
  let returnPaymentHref: string | null = null;
  if (order?.checkoutUrl) {
    try {
      const target = new URL(order.checkoutUrl, c.appUrl);
      if (["http:", "https:"].includes(target.protocol) && !target.username && !target.password) returnPaymentHref = target.toString();
    } catch { /* A malformed stored URL cannot become a navigation target. */ }
  }
  const back = game.familyChild && game.familyChild.ownerId === user.id && !game.familyChild.deletedAt ? `/family/${encodeURIComponent(game.familyChild.id)}` : "/family";
  return <><SiteHeader user={user} isAdmin={isAdminEmail(user.email)} /><main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--3">
    <h1>{t.worldPurchase.closePayment}</h1>
    {returnPaymentHref ? <LinkButton href={returnPaymentHref}>{t.worldPurchase.returnPayment}</LinkButton> : null}
    {order ? <ClosePaymentForm gameId={game.id} orderId={order.id} recovery /> : <p>{paid ? t.worldPurchase.paymentAlreadyPaid : t.worldPurchase.paymentClosed}</p>}
    <LinkButton href={back} variant="ghost">{t.worldPurchase.back}</LinkButton>
  </main><SiteFooter /></>;
}
