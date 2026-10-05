import { notFound, redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { getI18n } from "@/i18n/server";
import { formatMoney, pick, tf } from "@/i18n";
import { PACKAGES, isPackageTier } from "@/domain/package";
import { currentUser, draftTokenFromCookie, isAdminEmail } from "@/lib/server/session";
import { requireQaAccess } from "@/lib/server/qa-access";
import { familySignInHref } from "@/lib/safe-redirect";
import { MockPay } from "./MockPay";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.create.mock.title, robots: { index: false } };
}

/** Stand-in for the PSP's hosted checkout page. Dev only. */
export default async function MockCheckoutPage({ searchParams }: { searchParams: Promise<{ orderId?: string; success?: string; cancel?: string }> }) {
  await requireQaAccess();
  const c = getContainer();
  if (c.payment.id !== "mock") notFound();
  const [params, user, draftToken, { t, locale }] = await Promise.all([searchParams, currentUser(), draftTokenFromCookie(), getI18n()]);
  const orderId = typeof params.orderId === "string" ? params.orderId : "";
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(orderId)) notFound();
  const order = await c.db.order.findUnique({ where: { id: orderId }, include: { game: { include: { childProfile: true } } } });
  if (!order || order.provider !== "mock") notFound();
  // Match the mock payment API: the creator's draft proof also supports the
  // first anonymous checkout, which has not created an account session yet.
  const accountAuthority = Boolean(user && (order.userId === user.id || order.game.ownerId === user.id || isAdminEmail(user.email)));
  const draftAuthority = Boolean(draftToken && order.game.draftToken && draftToken === order.game.draftToken);
  const ownsOrder = accountAuthority || draftAuthority;
  if (!ownsOrder) {
    if (!user) redirect(familySignInHref(`/checkout/mock?${new URLSearchParams({ orderId: order.id })}`));
    notFound();
  }
  // Query-string destinations are untrusted. An authenticated owner can use
  // financial recovery; a creator with only draft proof returns to that draft.
  const successUrl = `/creating/${encodeURIComponent(order.gameId)}`;
  const closeUrl = `/checkout/close?${new URLSearchParams({ game: order.gameId })}`;
  const cancelUrl = accountAuthority ? closeUrl : "/checkout?cancelled=1";
  const declinedUrl = accountAuthority ? closeUrl : "/checkout?declined=1";
  const m = t.create.mock;
  const amount = formatMoney(order.amountAgorot, order.currency === "USD" ? "USD" : "ILS", locale);
  const pkgName = isPackageTier(order.packageTier) ? pick(PACKAGES[order.packageTier].name, locale) : order.packageTier;
  const item = `${tf(t.create.checkout.gameTitle, { name: order.game.childProfile?.displayName ?? "" })} · ${pkgName}`;
  return (
    <main className="fm-container fm-section psp">
      <div className="psp__card">
        <div className="psp__head">
          <span className="psp__brand">
            <span aria-hidden>🔒</span> {m.brand}
          </span>
          <span className="fm-badge fm-badge--grape">{m.badge}</span>
        </div>
        <div className="psp__body">
          <h1 className="fm-display" style={{ fontSize: "var(--fs-500)", lineHeight: "var(--lh-500)" }}>
            {m.title}
          </h1>
          <dl className="psp__summary">
            <div>
              <dt>{m.merchant}</dt>
              <dd>{t.common.brand}</dd>
            </div>
            <div>
              <dt>{m.item}</dt>
              <dd>{item}</dd>
            </div>
            <div>
              <dt>{m.amount}</dt>
              <dd className="psp__amount">{amount}</dd>
            </div>
          </dl>
          <MockPay orderId={order.id} successUrl={successUrl} cancelUrl={cancelUrl} declinedUrl={declinedUrl} amountLabel={amount} />
        </div>
      </div>
    </main>
  );
}
