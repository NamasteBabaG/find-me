import { notFound, redirect } from "next/navigation";
import { requireQaAccess } from "@/lib/server/qa-access";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { worldPurchaseContext } from "@/services/world-purchase.service";
import { getCurrency, getI18n } from "@/i18n/server";
import { formatMoney, pick, tf } from "@/i18n";
import { priceFor } from "@/domain/package";
import { SiteHeader, SiteFooter } from "@/ui/Shell";
import { LinkButton } from "@/ui/Button";
import { PurchasePanel } from "./PurchasePanel";
import { validChildAge } from "@/domain/child-appearance";
import { worldPurchaseHref, worldPurchaseSignInHref } from "@/domain/world-purchase";

export const metadata = { robots: { index: false, follow: false } };

export default async function WorldPurchasePage({ params, searchParams }: {
  params: Promise<{ childId: string; worldSlug: string }>; searchParams: Promise<{ returnGame?: string; ageYears?: string }>;
}) {
  await requireQaAccess();
  const [user, route, query, { t, locale }, currency] = await Promise.all([currentUser(), params, searchParams, getI18n(), getCurrency()]);
  const requestedAge = Number(query.ageYears);
  if (!user) redirect(worldPurchaseSignInHref(worldPurchaseHref(route.childId, route.worldSlug, query.returnGame, requestedAge)));
  const context = await worldPurchaseContext(getContainer(), { ownerId: user.id, familyChildId: route.childId, worldSlug: route.worldSlug, returnGameId: query.returnGame });
  if (!context) notFound();
  const ready = context.state === "ready", preparing = context.state === "preparing";
  const href = context.active ? ready ? `/family/${encodeURIComponent(route.childId)}/play/${encodeURIComponent(context.active.id)}` : `/creating/${encodeURIComponent(context.active.id)}` : null;
  return <><SiteHeader user={user} isAdmin={isAdminEmail(user.email)} />
    <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--4">
      <h1>{tf(t.worldPurchase.title, { name: context.child.displayName })}</h1>
      <section className="fm-card fm-card--pad-4 fm-stack fm-stack--3">
        <p className="fm-hint">{t.worldPurchase.selectedWorld}</p><h2>{pick(context.world.name, locale)}</h2>
        {ready || preparing ? <><p>{ready ? t.worldPurchase.owned : t.worldPurchase.preparing}</p><LinkButton href={href!} size="lg">{ready ? t.worldPurchase.playWorld : t.worldPurchase.viewPreparation}</LinkButton></>
          : <><p className="fm-lead">{t.worldPurchase.priceLabel}: <bdi>{formatMoney(priceFor("ONE_WORLD", currency, context.continuation), currency, locale)}</bdi></p>
            <p>{t.worldPurchase.photoNeeded}</p><PurchasePanel childId={route.childId} worldSlug={route.worldSlug} ageYears={!context.active && validChildAge(requestedAge) ? requestedAge : context.ageYears} returnGameId={context.returnGameId} resuming={Boolean(context.active)} /></>}
      </section>
      {context.earlierPaymentHref ? <LinkButton href={context.earlierPaymentHref} variant="ghost">{t.worldPurchase.returnPayment}</LinkButton> : null}
      <LinkButton href={context.returnHref} variant="ghost">{t.worldPurchase.back}</LinkButton>
    </main><SiteFooter /></>;
}
