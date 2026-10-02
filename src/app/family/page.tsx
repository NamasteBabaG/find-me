import Link from "next/link";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { requireQaAccess } from "@/lib/server/qa-access";
import { env } from "@/lib/env";
import { getI18n } from "@/i18n/server";
import { tf, type Dictionary } from "@/i18n";
import { getContainer } from "@/services/container";
import { familyDrafts } from "@/services/family.service";
import { familyAdventures, type FamilyChild } from "@/services/family-adventures.service";
import { resumeFamilyDraft } from "./actions";
import { SiteHeader, SiteFooter, Notice } from "@/ui/Shell";
import { LinkButton } from "@/ui/Button";
import { LoginForm } from "../library/LoginForm";
import { logoutAction } from "../library/actions";
import { currentWorld, MapGlimpse, PlaceRoute, Sticker } from "./FamilyParts";
import "./family.css";

export const metadata = { robots: { index: false, follow: false } };

export default async function FamilyPage({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string }> }) {
  await requireQaAccess();
  const [user, { t }, params] = await Promise.all([currentUser(), getI18n(), searchParams]);
  const c = getContainer();
  const [children, drafts] = user ? await Promise.all([familyAdventures(c, user.id), familyDrafts(c.db, user.id)]) : [[], []];
  const admin = isAdminEmail(user?.email);
  const f = t.family;
  return <>
    <SiteHeader user={user} isAdmin={admin} />
    <main className={`fm-container family${user ? "" : " fm-container--narrow"}`}>
      <header className="family-head">
        <div className="fm-stack fm-stack--1"><h1>{user ? f.title : t.common.signIn}</h1>{user ? null : <p className="fm-lead">{t.library.loginLead}</p>}</div>
        {user ? <form action={logoutAction}><button type="submit" className="fm-btn fm-btn--ghost">{t.library.signOut}</button></form> : null}
      </header>
      {params.error === "expired" ? <Notice kind="warn">{t.library.expired}</Notice> : null}
      {params.deleted === "1" ? <Notice kind="success">{t.library.deleted}</Notice> : null}
      {!user ? <LoginForm devOutbox={c.email.id === "console"} /> : <>
        {children.length === 0 ? <section className="family-empty">
          <h2>{f.empty}</h2><p>{f.emptyLead}</p><LinkButton href="/create?child=new">{t.library.createFirst}</LinkButton>
        </section> : <ul className="family-shelf">
          {children.map((child, i) => <li key={child.id}><ChildCard child={child} t={t} eager={i < 2} /></li>)}
          <li><Link href="/create?child=new" className="family-add"><span className="family-add__plus" aria-hidden>+</span>{f.add}</Link></li>
        </ul>}
        {drafts.length > 0 ? <section className="family-drafts" aria-label={f.drafts}><h2>{f.drafts}</h2>{drafts.map(draft => <form action={resumeFamilyDraft} className="family-draft" key={draft.id}><input type="hidden" name="gameId" value={draft.id} /><strong>{draft.title || f.untitledDraft}</strong><button type="submit" className="fm-btn fm-btn--secondary">{f.resumeDraft}</button></form>)}</section> : null}
        {admin && env().APP_ENV === "qa" ? <Link href="/library?tests=1" className="family-manage">{f.tests}</Link> : null}
      </>}
    </main><SiteFooter />
  </>;
}

/** A child's card: their map with them on it, their name, how far they've come. The whole card opens their page. */
function ChildCard({ child, t, eager }: { child: FamilyChild; t: Dictionary; eager: boolean }) {
  const f = t.family;
  const playable = child.adventures.filter(a => a.ready && a.worlds.length > 0);
  // The adventure still under way, or the newest one once every place is stamped.
  const adventure = playable.find(a => a.tracked && a.worlds.some(w => w.stamped < w.places)) ?? playable[playable.length - 1];
  const world = adventure ? currentWorld(adventure) : undefined;
  const waiting = [...child.adventures].reverse().find(a => !a.ready);
  const line = world ? world.name : waiting ? f.generationState[waiting.preparation ?? "preparing"].title : f.noAdventures;
  return <Link href={`/family/${child.id}`} className="kid">
    {world ? <MapGlimpse world={world} avatarUrl={child.avatarUrl} name={child.name} eager={eager} /> : <span className="kid__wait" aria-hidden="true"><Sticker url={child.avatarUrl} name={child.name} /></span>}
    <span className="kid__body">
      <h2 className="kid__name">{child.name}</h2>
      <span className="kid__line">{line}</span>
      {world && adventure!.tracked ? <span className="kid__progress"><PlaceRoute world={world} />{tf(f.places, { n: world.stamped, total: world.places })}</span> : null}
      {world ? <span className="visually-hidden">{tf(f.currentPlace, { place: world.here.name })}</span> : null}
      <span className="kid__go" aria-hidden="true"><span className="fm-btn__arrow">➜</span></span>
    </span>
  </Link>;
}
