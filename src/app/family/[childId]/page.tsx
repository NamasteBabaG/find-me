import { notFound, redirect } from "next/navigation";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { requireQaAccess } from "@/lib/server/qa-access";
import { getI18n } from "@/i18n/server";
import { tf } from "@/i18n";
import { getContainer } from "@/services/container";
import { familyOverview } from "@/services/family.service";
import { SiteHeader, SiteFooter } from "@/ui/Shell";
import { LinkButton } from "@/ui/Button";
import "../family.css";

export const metadata = { robots: { index: false, follow: false } };

export default async function ChildPage({ params }: { params: Promise<{ childId: string }> }) {
  await requireQaAccess();
  const [user, { t }, { childId }] = await Promise.all([currentUser(), getI18n(), params]);
  if (!user) redirect("/family");
  const child = (await familyOverview(getContainer().db, user.id, childId))[0];
  if (!child) notFound();
  return <><SiteHeader user={user} isAdmin={isAdminEmail(user.email)} />
    <main className="fm-container fm-section fm-stack fm-stack--4">
      <div><LinkButton href="/family" variant="ghost">{t.family.back}</LinkButton></div>
      <header className="library__head"><div><h1>{tf(t.family.open, { name: child.displayName })}</h1><p className="fm-lead">{t.family.lead}</p></div>
        <LinkButton href={`/create?child=${child.id}`}>{tf(t.family.more, { name: child.displayName })}</LinkButton>
      </header>
      <div><LinkButton href={`/family/${child.id}/passport`} variant="secondary">{tf(t.family.passport, { name: child.displayName })}</LinkButton></div>
      {child.games.length ? <div className="family-grid">{child.games.map(game => <article key={game.id} className="fm-card fm-card--pad-4 fm-stack fm-stack--3">
        <h2>{game.title}</h2><p>{t.library.statuses[game.status] ?? t.family.preparing}</p>
        {["READY", "DELIVERED"].includes(game.status) ? <LinkButton href={`/family/${child.id}/play/${game.id}`}>{t.library.play}</LinkButton> : <LinkButton href={`/creating/${game.id}`}>{t.library.status}</LinkButton>}
        <LinkButton href={`/library/${game.id}`} variant="secondary">{t.library.manage}</LinkButton>
      </article>)}</div> : <p>{t.family.noAdventures}</p>}
    </main><SiteFooter /></>;
}
