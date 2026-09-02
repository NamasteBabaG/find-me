import { notFound } from "next/navigation";
import { isDev } from "@/lib/env";
import { getContainer } from "@/services/container";
import { formatPriceILS } from "@/domain/package";
import { MockPay } from "./MockPay";

export const metadata = { title: "תשלום (סנדבוקס)", robots: { index: false } };

/** Stand-in for the PSP's hosted checkout page. Dev only. */
export default async function MockCheckoutPage({ searchParams }: { searchParams: Promise<{ orderId?: string; success?: string; cancel?: string }> }) {
  if (!isDev()) notFound();
  const params = await searchParams;
  const c = getContainer();
  const order = params.orderId ? await c.db.order.findUnique({ where: { id: params.orderId }, include: { game: { include: { childProfile: true } } } }) : null;
  if (!order) notFound();
  return (
    <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--4">
      <div className="fm-center fm-stack fm-stack--1">
        <span className="fm-badge fm-badge--grape">סביבת בדיקה · PayMe יחליף את המסך הזה</span>
        <h1>תשלום מאובטח (מדומה)</h1>
        <p className="fm-lead">
          איפה {order.game.childProfile?.displayName}? · {formatPriceILS(order.amountAgorot)}
        </p>
      </div>
      <MockPay orderId={order.id} successUrl={params.success ?? "/library"} cancelUrl={params.cancel ?? "/checkout"} amountLabel={formatPriceILS(order.amountAgorot)} />
    </main>
  );
}
