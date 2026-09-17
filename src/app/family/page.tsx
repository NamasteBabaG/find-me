import Link from "next/link";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { requireQaAccess } from "@/lib/server/qa-access";
import { env } from "@/lib/env";
import { getI18n } from "@/i18n/server";
import { tf } from "@/i18n";
import { getContainer } from "@/services/container";
import { familyDrafts, familyOverview } from "@/services/family.service";
import { resumeFamilyDraft } from "./actions";
import { SiteHeader, SiteFooter, Notice } from "@/ui/Shell";
import { LinkButton } from "@/ui/Button";
import { LoginForm } from "../library/LoginForm";
import { logoutAction } from "../library/actions";
import "./family.css";

export const metadata = { robots: { index: false, follow: false } };

export default async function FamilyPage({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string }> }) {
  await requireQaAccess();
  const [user, { t }, params] = await Promise.all([currentUser(), getI18n(), searchParams]);
  const [children, drafts] = user ? await Promise.all([familyOverview(getContainer().db, user.id), familyDrafts(getContainer().db, user.id)]) : [[], []];
  const admin = isAdminEmail(user?.email);
  return <>
    <SiteHeader user={user} isAdmin={admin} />
    <main className={`fm-container fm-section fm-stack fm-stack--4${user ? "" : " fm-container--narrow"}`}>
      <header className="library__head">
        <div><h1>{user ? t.family.title : t.common.signIn}</h1><p className="fm-lead">{user ? t.family.lead : t.library.loginLead}</p></div>
        {user ? <form action={logoutAction}><button type="submit" className="fm-btn fm-btn--ghost">{t.library.signOut}</button></form> : null}
      </header>
      {params.error === "expired" ? <Notice kind="warn">{t.library.expired}</Notice> : null}
      {params.deleted === "1" ? <Notice kind="success">{t.library.deleted}</Notice> : null}
      {!user ? <LoginForm devOutbox={getContainer().email.id === "console"} /> : <>
        {children.length === 0 ? <section className="fm-card fm-card--pad-6 fm-stack fm-stack--3">
          <h2>{t.family.empty}</h2><p>{t.family.emptyLead}</p><LinkButton href="/create?child=new">{t.library.createFirst}</LinkButton>
        </section> : <div className="family-grid">{children.map(child => {
          const avatar = child.games.find(game => game.childProfile?.avatarAssetId)?.childProfile?.avatarAssetId;
          return <article className="fm-card fm-card--pad-4 family-child" key={child.id}>
            {avatar ? <img src={`/api/assets/${avatar}`} width={96} height={96} alt="" className="family-child__portrait" /> : <span className="family-child__initial" aria-hidden>{child.displayName.slice(0, 1)}</span>}
            <h2>{child.displayName}</h2><p className="fm-muted">{tf(t.family.count, { n: child.games.length })}</p>
            <LinkButton href={`/family/${child.id}`}>{tf(t.family.open, { name: child.displayName })}</LinkButton>
          </article>;
        })}</div>}
        {children.length > 0 ? <div><LinkButton href="/create?child=new" variant="secondary">{t.family.add}</LinkButton></div> : null}
        {drafts.length > 0 ? <section className="fm-stack fm-stack--3" aria-label={t.family.drafts}><h2>{t.family.drafts}</h2>{drafts.map(draft => <form action={resumeFamilyDraft} className="fm-card fm-card--pad-4 fm-row" key={draft.id}><input type="hidden" name="gameId" value={draft.id} /><strong>{draft.title || t.family.untitledDraft}</strong><button type="submit" className="fm-btn fm-btn--secondary">{t.family.resumeDraft}</button></form>)}</section> : null}
        {admin && env().APP_ENV === "qa" ? <Link href="/library?tests=1">{t.family.tests}</Link> : null}
      </>}
    </main><SiteFooter />
  </>;
}
