import { notFound } from "next/navigation";
import { isDev } from "@/lib/env";
import { getContainer } from "@/services/container";
import { getI18n } from "@/i18n/server";
import { formatMoney, pick, tf } from "@/i18n";
import { PACKAGES, isPackageTier } from "@/domain/package";
import { MockPay } from "./MockPay";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t.create.mock.title, robots: { index: false } };
}

/** Stand-in for the PSP's hosted checkout page. Dev only. */
export default async function MockCheckoutPage({ searchParams }: { searchParams: Promise<{ orderId?: string; success?: string; cancel?: string }> }) {
  if (!isDev()) notFound();
  const [params, { t, locale }] = await Promise.all([searchParams, getI18n()]);
  const c = getContainer();
  const order = params.orderId ? await c.db.order.findUnique({ where: { id: params.orderId }, include: { game: { include: { childProfile: true } } } }) : null;
  if (!order) notFound();
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
          <MockPay orderId={order.id} successUrl={params.success ?? "/library"} cancelUrl={params.cancel ?? "/checkout"} amountLabel={amount} />
        </div>
      </div>
    </main>
  );
}
