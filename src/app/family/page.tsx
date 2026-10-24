import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { requireQaAccess } from "@/lib/server/qa-access";
import { safeLocalPath } from "@/lib/safe-redirect";
import { env } from "@/lib/env";
import { getI18n } from "@/i18n/server";
import { getContainer } from "@/services/container";
import { familyDrafts } from "@/services/family.service";
import { familyAdventures } from "@/services/family-adventures.service";
import { resumeFamilyDraft } from "./actions";
import { SiteHeader, SiteFooter, Notice } from "@/ui/Shell";
import { LinkButton } from "@/ui/Button";
import { LoginForm } from "../library/LoginForm";
import { logoutAction } from "../library/actions";
import { ChildCard } from "./FamilyCards";
import "./family.css";

export const metadata = { robots: { index: false, follow: false } };

export default async function FamilyPage({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string; next?: string | string[] }> }) {
  await requireQaAccess();
  const [user, { t }, params] = await Promise.all([currentUser(), getI18n(), searchParams]);
  const next = safeLocalPath(typeof params.next === "string" ? params.next : undefined, "/family");
  // Login keeps the original child/world checkout context. A return to this
  // index itself stays here, including query/hash variants, without a loop.
  if (user && next.split(/[?#]/)[0]!.replace(/\/+$/, "") !== "/family") redirect(next);
  const c = getContainer();
  const [children, drafts] = user ? await Promise.all([familyAdventures(c, user.id), familyDrafts(c.db, user.id)]) : [[], []];
  const admin = isAdminEmail(user?.email);
  const f = t.family;
  return <>
    <SiteHeader user={user} isAdmin={admin} />
    <main className={`fm-container family${user ? "" : " fm-container--narrow"}`}>
      <header className="family-head">
        <div className="fm-stack fm-stack--1"><h1>{user ? f.title : t.common.signIn}</h1>{user ? <p className="family-head__lead">{f.lead}</p> : <p className="fm-lead">{t.library.loginLead}</p>}</div>
        {user ? <form action={logoutAction}><button type="submit" className="fm-btn fm-btn--ghost">{t.library.signOut}</button></form> : null}
      </header>
      {params.error === "expired" ? <Notice kind="warn">{t.library.expired}</Notice> : null}
      {params.deleted === "1" ? <Notice kind="success">{t.library.deleted}</Notice> : null}
      {!user ? <LoginForm devOutbox={c.email.id === "console"} next={next} /> : <>
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
