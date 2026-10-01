import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { requireQaAccess } from "@/lib/server/qa-access";
import { getI18n, getCurrency } from "@/i18n/server";
import { tf, formatMoney, type Dictionary } from "@/i18n";
import { WORLD_PRICES } from "@/domain/package";
import { childHasPaidWorld } from "@/services/child-pricing.service";
import { getContainer } from "@/services/container";
import { familyAdventures, type FamilyAdventure, type FamilyChild } from "@/services/family-adventures.service";
import { SiteHeader, SiteFooter } from "@/ui/Shell";
import { LinkButton } from "@/ui/Button";
import { currentWorld, MapGlimpse, PlaceRoute, StarTally, Sticker } from "../FamilyParts";
import "../family.css";

export const metadata = { robots: { index: false, follow: false } };

/**
 * One child's place in the family area (Guy, 2026-10-01: the area felt odd and unfinished). Each adventure is its
 * map with the child standing where they are, and one way in; the passport is the small book beside it.
 */
export default async function ChildPage({ params }: { params: Promise<{ childId: string }> }) {
  await requireQaAccess();
  const [user, { t, locale }, { childId }, currency] = await Promise.all([currentUser(), getI18n(), params, getCurrency()]);
  if (!user) redirect("/family");
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
        <h1>{child.name}</h1>
      </header>
      <div className="family-desk">
        <section className="family-desk__main" aria-label={tf(f.open, { name: child.name })}>
          {child.adventures.length === 0 ? <p className="fm-lead">{f.noAdventures}</p> : null}
          {child.adventures.map((adventure, i) => <AdventureCard key={adventure.gameId} adventure={adventure} child={child} t={t} eager={i === 0} />)}
        </section>
        <aside className="family-desk__side">
          <Link href={`/family/${child.id}/passport`} className="family-passport">
            <span className="family-passport__crest" aria-hidden>✦</span>
            <span className="family-passport__title">{tf(f.passport, { name: child.name })}</span>
            {stamps.total > 0 ? <span className="family-passport__count">{tf(f.stamps, stamps)}</span> : null}
            <span className="family-passport__open">{f.openPassport}</span>
          </Link>
          <div className="family-more">
            {continuation ? <p>{tf(t.home.pricing.returning, { price: formatMoney(WORLD_PRICES[currency].additional, currency, locale) })}</p> : null}
            <LinkButton href={`/create?child=${child.id}`} variant="secondary">{tf(f.more, { name: child.name })}</LinkButton>
          </div>
        </aside>
      </div>
    </main><SiteFooter /></>;
}

function AdventureCard({ adventure, child, t, eager }: { adventure: FamilyAdventure; child: FamilyChild; t: Dictionary; eager: boolean }) {
  const f = t.family;
  const manage = <Link href={`/library/${adventure.gameId}`} className="family-manage">{t.library.manage}</Link>;
  if (!adventure.ready) {
    return <article className="adventure adventure--preparing">
      <div className="adventure__wait" aria-hidden="true"><Sticker url={child.avatarUrl} name={child.name} /></div>
      <div className="adventure__body">
        <h2>{f.preparing}</h2>
        <div className="adventure__actions"><LinkButton href={`/creating/${adventure.gameId}`} variant="secondary">{t.library.viewProgress}</LinkButton>{manage}</div>
      </div>
    </article>;
  }
  const world = currentWorld(adventure);
  const play = `/family/${child.id}/play/${adventure.gameId}`;
  const finished = adventure.tracked && adventure.worlds.every(w => w.stamped === w.places);
  const started = adventure.tracked && adventure.worlds.some(w => w.stars > 0);
  const label = !adventure.tracked ? t.library.play : finished ? f.playAgain : started ? f.playContinue : f.playStart;
  return <article className="adventure">
    {/* The map opens the game too; the button below is its one announced way in. */}
    {world ? <Link href={play} className="adventure__map" tabIndex={-1} aria-hidden="true"><MapGlimpse world={world} avatarUrl={child.avatarUrl} name={child.name} eager={eager} /></Link> : null}
    <div className="adventure__body">
      <div className="adventure__title">
        <h2>{world?.name ?? adventure.title ?? f.untitledDraft}</h2>
        {world && adventure.tracked ? <StarTally found={world.stars} total={world.starsTotal} label={tf(f.stars, { n: world.stars, total: world.starsTotal })} /> : null}
      </div>
      {world && adventure.tracked ? <p className="adventure__progress"><PlaceRoute world={world} /><span>{tf(f.places, { n: world.stamped, total: world.places })}</span></p> : null}
      {world ? <p className="visually-hidden">{tf(f.currentPlace, { place: world.here.name })}</p> : null}
      {adventure.worlds.length > 1 ? <ul className="adventure__worlds">{adventure.worlds.map(w => <li key={w.slug} className={w === world ? "is-current" : adventure.tracked && w.stamped === w.places ? "is-done" : undefined}>{w.name}</li>)}</ul> : null}
      <div className="adventure__actions"><LinkButton href={play}>{label}</LinkButton>{manage}</div>
    </div>
  </article>;
}
