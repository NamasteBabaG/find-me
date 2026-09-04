import Link from "next/link";
import { getContainer } from "@/services/container";
import { listGamesForUser } from "@/services/game.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { isDev, isLiveShop } from "@/lib/env";
import { getI18n } from "@/i18n/server";
import { formatDate, pick, tf } from "@/i18n";
import { SiteFooter, SiteHeader, Notice } from "@/ui/Shell";
import { LinkButton } from "@/ui/Button";
import { LoginForm } from "./LoginForm";
import { logoutAction } from "./actions";

export const metadata = { robots: { index: false } };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string }> }) {
  const [user, params, { t, locale }] = await Promise.all([currentUser(), searchParams, getI18n()]);
  const isAdmin = isAdminEmail(user?.email);
  const l = t.library;

  if (!user) {
    return (
      <>
        <SiteHeader user={null} isAdmin={false} />
        <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--4">
          <div className="create__head">
            <h1 className="create__title">{l.title}</h1>
            <p className="fm-lead">{l.loginLead}</p>
          </div>
          {params.error === "expired" ? <Notice kind="warn">{l.expired}</Notice> : null}
          <LoginForm devOutbox={!isLiveShop()} />
        </main>
        <SiteFooter />
      </>
    );
  }

  const games = await listGamesForUser(getContainer(), user.id);
  return (
    <>
      <SiteHeader user={user} isAdmin={isAdmin} />
      <main className="fm-container fm-section fm-stack fm-stack--4">
        <div className="fm-row fm-row--between">
          <div>
            <h1>{l.title}</h1>
            <p className="fm-muted">{user.email}</p>
          </div>
          <div className="fm-row">
            <LinkButton href="/create">{l.createMore}</LinkButton>
            <form action={logoutAction}>
              <button type="submit" className="fm-btn fm-btn--ghost">
                {l.signOut}
              </button>
            </form>
          </div>
        </div>
        {params.deleted === "1" ? <Notice kind="success">{l.deleted}</Notice> : null}
        {games.length === 0 ? (
          <div className="fm-card fm-card--pad-6 fm-center fm-stack fm-stack--3">
            <p className="fm-lead">{l.empty}</p>
            <LinkButton href="/create" size="lg">
              {l.createFirst}
            </LinkButton>
          </div>
        ) : (
          <div className="library">
            {games.map((g) => (
              <article key={g.id} className="fm-card lib">
                <div className="lib__cover">
                  {g.avatarAssetId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/assets/${g.avatarAssetId}`} alt="" className="fm-sticker" width={96} height={96} />
                  ) : (
                    <span style={{ fontSize: "var(--fs-700)" }} aria-hidden>
                      🎁
                    </span>
                  )}
                </div>
                <div>
                  <h2 className="lib__title">{g.title}</h2>
                  <p className="lib__meta">{tf(l.meta, { pkg: pick(g.packageName, locale), worlds: g.sceneCount, date: formatDate(g.createdAt, locale) })}</p>
                </div>
                <span className={`fm-badge ${g.playable ? "fm-badge--leaf" : "fm-badge--outline"}`}>{l.statuses[g.status] ?? g.status}</span>
                <div className="lib__actions">
                  {g.playUrl ? (
                    <LinkButton href={g.playUrl} size="sm">
                      {l.play}
                    </LinkButton>
                  ) : (
                    <LinkButton href={`/creating/${g.id}`} size="sm" variant="secondary">
                      {l.status}
                    </LinkButton>
                  )}
                  <Link href={`/library/${g.id}`} className="fm-btn fm-btn--secondary fm-btn--sm">
                    {l.manage}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
