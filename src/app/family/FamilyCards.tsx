import Link from "next/link";
import { tf, type Dictionary } from "@/i18n";
import type { FamilyAdventure, FamilyChild } from "@/services/family-adventures.service";
import { LinkButton } from "@/ui/Button";
import { FamilyFriendSharing } from "@/ui/friends/FamilyFriendSharing";
import { ToolIcon } from "@/game/components/ToolIcon";
import { currentWorld, MapGlimpse, PlaceRoute, StarTally, Sticker } from "./FamilyParts";

export function AdventureCard({ adventure, child, t, eager, friendIntent }: { adventure: FamilyAdventure; child: FamilyChild; t: Dictionary; eager: boolean; friendIntent?: string | null }) {
  const f = t.family;
  const manage = <Link href={`/library/${adventure.gameId}`} className="family-manage">{t.library.manage}</Link>;
  if (!adventure.ready) {
    const state = adventure.preparation ?? "preparing";
    const copy = f.generationState[state];
    return <article className="adventure adventure--preparing">
      <div className="adventure__wait" aria-hidden="true"><Sticker url={child.avatarUrl} name={child.name} /></div>
      <div className="adventure__body">
        <h2>{copy.title}</h2><p className="adventure__hint">{copy.hint}</p>
        <div className="adventure__actions">{state === "attention" || state === "unavailable"
          ? <LinkButton href={`/support?order=${encodeURIComponent(adventure.gameId)}`} variant="secondary">{f.getHelp}</LinkButton>
          : <LinkButton href={`/creating/${adventure.gameId}`} variant="secondary">{t.library.viewProgress}</LinkButton>}</div>
        <div className="adventure__tools">{manage}</div>
      </div>
    </article>;
  }
  const world = currentWorld(adventure);
  const friendWorlds = adventure.worlds.filter(world => adventure.shareableWorldSlugs.includes(world.slug));
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
      {/* The play button's hit area stretches over the whole card (fm-stretch): the card is the way in, and stays one link. */}
      <div className="adventure__actions"><LinkButton href={play} className="adventure__play fm-stretch">{label}</LinkButton></div>
      <div className="adventure__tools">
        {manage}
        {friendWorlds.length > 0 ? <FamilyFriendSharing gameId={adventure.gameId} worlds={friendWorlds.map(world => ({ slug: world.slug, name: world.name }))}
          initialOpen={Boolean(friendIntent && friendWorlds.some(world => world.slug === friendIntent))} initialWorld={friendIntent ?? undefined} /> : null}
      </div>
    </div>
  </article>;
}

/** A child's card: their map with them on it, their name, how far they've come. The whole card opens their page. */
export function ChildCard({ child, t, eager }: { child: FamilyChild; t: Dictionary; eager: boolean }) {
  const f = t.family;
  const playable = child.adventures.filter(a => a.ready && a.worlds.length > 0);
  // The adventure still under way, or the newest one once every place is stamped.
  const adventure = playable.find(a => a.tracked && a.worlds.some(w => w.stamped < w.places)) ?? playable[playable.length - 1];
  const world = adventure ? currentWorld(adventure) : undefined;
  const waiting = [...child.adventures].reverse().find(a => !a.ready);
  const line = world ? world.name : waiting ? f.generationState[waiting.preparation ?? "preparing"].title : f.noAdventures;
  return <Link href={`/family/${child.id}`} className="kid">
    {world ? <MapGlimpse world={world} avatarUrl={child.avatarUrl} name={child.name} eager={eager} /> : <span className="kid__wait" aria-hidden="true"><Sticker url={child.avatarUrl} name={child.name} /></span>}
    <div className="kid__body">
      <h2 className="kid__name">{child.name}</h2>
      <span className="kid__line">{line}</span>
      {world && adventure!.tracked ? <span className="kid__progress"><PlaceRoute world={world} />{tf(f.places, { n: world.stamped, total: world.places })}</span> : null}
      {world ? <span className="visually-hidden">{tf(f.currentPlace, { place: world.here.name })}</span> : null}
      <span className="kid__footer"><span>{tf(f.open, { name: child.name })}</span><span className="kid__go" aria-hidden="true"><span className="fm-btn__arrow">➜</span></span></span>
    </div>
  </Link>;
}

/** The child's passport and the existing entry to another adventure. */
export function FamilyCompanion({ child, t, returningPrice, stamps }: { child: FamilyChild; t: Dictionary; returningPrice: string | null; stamps: { n: number; total: number } }) {
  const f = t.family;
  return <aside className="family-desk__side">
    <Link href={`/family/${child.id}/passport`} className="family-passport">
      <span className="family-passport__crest" aria-hidden>✦</span>
      <span className="family-passport__title">{tf(f.passport, { name: child.name })}</span>
      {stamps.total > 0 ? <span className="family-passport__count">{tf(f.stamps, stamps)}</span> : null}
      <span className="family-passport__open">{f.openPassport}</span>
    </Link>
    <section className="family-more" aria-labelledby={`family-more-${child.id}`}>
      <span className="family-more__icon"><ToolIcon name="map" /></span>
      <h2 id={`family-more-${child.id}`}>{tf(f.more, { name: child.name })}</h2>
      <p>{f.moreLead}</p>
      {returningPrice !== null ? <p className="family-more__price">{tf(t.home.pricing.returning, { price: returningPrice })}</p> : null}
      <LinkButton href={`/create?child=${child.id}`} variant="secondary">{f.exploreMore}<span className="fm-btn__arrow" aria-hidden>➜</span></LinkButton>
    </section>
  </aside>;
}
