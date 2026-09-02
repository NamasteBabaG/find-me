import { notFound } from "next/navigation";
import { isDev } from "@/lib/env";
import { getContainer } from "@/services/container";
import { getI18n } from "@/i18n/server";
import { formatPrice, tf } from "@/i18n";
import { MockPay } from "./MockPay";

export const metadata = { robots: { index: false } };

/** Stand-in for the PSP's hosted checkout page. Dev only. */
export default async function MockCheckoutPage({ searchParams }: { searchParams: Promise<{ orderId?: string; success?: string; cancel?: string }> }) {
  if (!isDev()) notFound();
  const [params, { t, locale }] = await Promise.all([searchParams, getI18n()]);
  const c = getContainer();
  const order = params.orderId ? await c.db.order.findUnique({ where: { id: params.orderId }, include: { game: { include: { childProfile: true } } } }) : null;
  if (!order) notFound();
  const m = t.create.mock;
  const amount = formatPrice(order.amountAgorot, locale);
  return (
    <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--4">
      <div className="fm-center fm-stack fm-stack--1">
        <span className="fm-badge fm-badge--grape">{m.badge}</span>
        <h1>{m.title}</h1>
        <p className="fm-lead">
          {tf(t.create.checkout.gameTitle, { name: order.game.childProfile?.displayName ?? "" })} · {amount}
        </p>
      </div>
      <MockPay orderId={order.id} successUrl={params.success ?? "/library"} cancelUrl={params.cancel ?? "/checkout"} amountLabel={amount} />
    </main>
  );
}
