import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { requireQaAccess } from "@/lib/server/qa-access";
import { familySignInHref } from "@/lib/safe-redirect";
import { getI18n, getCurrency } from "@/i18n/server";
import { tf, formatMoney } from "@/i18n";
import { WORLD_PRICES } from "@/domain/package";
import { childHasPaidWorld } from "@/services/child-pricing.service";
import { getContainer } from "@/services/container";
import { familyAdventures } from "@/services/family-adventures.service";
import { SiteHeader, SiteFooter } from "@/ui/Shell";
import { Sticker } from "../FamilyParts";
import { AdventureCard, FamilyCompanion } from "../FamilyCards";
import "../family.css";

export const metadata = { robots: { index: false, follow: false } };

/**
 * One child's place in the family area (Guy, 2026-10-01: the area felt odd and unfinished). Each adventure is its
 * map with the child standing where they are, and one way in; the passport is the small book beside it.
 */
export default async function ChildPage({ params, searchParams }: { params: Promise<{ childId: string }>; searchParams: Promise<{ friends?: string; world?: string }> }) {
  await requireQaAccess();
  const [user, { t, locale }, { childId }, currency, query] = await Promise.all([currentUser(), getI18n(), params, getCurrency(), searchParams]);
  if (!user) {
    const context = new URLSearchParams();
    if (typeof query.friends === "string") context.set("friends", query.friends);
    if (typeof query.world === "string") context.set("world", query.world);
    redirect(familySignInHref(`/family/${encodeURIComponent(childId)}${context.size ? `?${context}` : ""}`));
  }
  const c = getContainer();
  const child = (await familyAdventures(c, user.id, childId))[0];
  if (!child) notFound();
  const continuation = await childHasPaidWorld(c.db, { ownerId: user.id, familyChildId: child.id });
  const f = t.family;
  const stamps = child.adventures.filter(a => a.tracked).flatMap(a => a.worlds).reduce((sum, w) => ({ n: sum.n + w.stamped, total: sum.total + w.places }), { n: 0, total: 0 });
  return <><SiteHeader user={user} isAdmin={isAdminEmail(user.email)} />
    <main className="fm-container family">
      <Link href="/family" className="family-back"><span className="fm-btn__arrow fm-btn__arrow--back" aria-hidden>➜</span>{f.back}</Link>
      <header className="family-hero">
        <Sticker url={child.avatarUrl} name={child.name} className="family-hero__sticker" />
        <div className="family-hero__copy"><h1>{child.name}</h1><p>{child.adventures.length === 1 ? f.countOne : tf(f.count, { n: child.adventures.length })}</p></div>
      </header>
      <div className="family-desk">
        <section className="family-desk__main" aria-label={tf(f.open, { name: child.name })}>
          {child.adventures.length === 0 ? <p className="fm-lead">{f.noAdventures}</p> : null}
          {child.adventures.map((adventure, i) => <AdventureCard key={adventure.gameId} adventure={adventure} child={child} t={t} eager={i === 0} friendIntent={query.friends === adventure.gameId ? query.world ?? null : null} />)}
        </section>
        <FamilyCompanion child={child} t={t} returningPrice={continuation ? formatMoney(WORLD_PRICES[currency].additional, currency, locale) : null} stamps={stamps} />
      </div>
    </main><SiteFooter /></>;
}
