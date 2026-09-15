import { gameShape } from "@/services/world-catalog.service";
import { isEditableDraft } from "@/domain/order-state";
import { statusOf } from "@/services/game-status";
import { gameShapeLabel } from "@/i18n/game-shape";
import Link from "next/link";
import { getContainer } from "@/services/container";
import { listGamesForUser } from "@/services/game.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
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
          {/* The outbox link is for a box whose mail goes to a file, not for a staging box whose mail is real. */}
          <LoginForm devOutbox={getContainer().email.id === "console"} />
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
        <header className="library__head">
          <div className="library__who">
            <h1>{l.title}</h1>
            <p className="fm-muted">{user.email}</p>
          </div>
          <div className="library__head-actions">
            <LinkButton href="/create">{l.createMore}</LinkButton>
            <form action={logoutAction}>
              <button type="submit" className="fm-btn fm-btn--ghost">
                {l.signOut}
              </button>
            </form>
          </div>
        </header>
        {params.deleted === "1" ? <Notice kind="success">{l.deleted}</Notice> : null}
        {games.length === 0 ? (
          <div className="fm-card fm-card--pad-6 fm-center fm-stack fm-stack--3">
            <p className="fm-lead">{l.empty}</p>
            <p className="fm-muted">{l.emptyLead}</p>
            <LinkButton href="/create" size="lg">
              {l.createFirst}
            </LinkButton>
          </div>
        ) : (
          <div className="library">
            {games.map((g) => {
              // Three states a parent cares about, not twenty-two the machine
              // has: it is ready to open, it is being made, or it was never
              // finished. A raw PACKAGE_SELECTED used to be printed as-is.
              const tone = g.playable ? "ready" : isEditableDraft(statusOf(g)) ? "draft" : "working";
              return (
                <article key={g.id} className={`lib lib--${tone}`}>
                  <div className="lib__cover">
                    {g.avatarAssetId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/assets/${g.avatarAssetId}`} alt="" className="fm-sticker lib__face" width={112} height={112} />
                    ) : (
                      <span className="lib__wrap" aria-hidden>
                        🎁
                      </span>
                    )}
                    <span className={`lib__state lib__state--${tone}`}>{l.statuses[g.status] ?? g.status}</span>
                  </div>
                  <div className="lib__body">
                    <h2 className="lib__title">{g.title}</h2>
                    <p className="lib__meta">{tf(l.meta, { pkg: pick(g.packageName, locale), shape: gameShapeLabel(t, gameShape(g.sceneVersions)), date: formatDate(g.createdAt, locale) })}</p>
                  </div>
                  <div className="lib__actions">
                    {g.playUrl ? (
                      <LinkButton href={g.playUrl} size="sm" className="lib__go">
                        {l.play}
                      </LinkButton>
                    ) : (
                      <LinkButton href={`/creating/${g.id}`} size="sm" variant="secondary" className="lib__go">
                        {l.status}
                      </LinkButton>
                    )}
                    <Link href={`/library/${g.id}`} className="fm-btn fm-btn--ghost fm-btn--sm">
                      {l.manage}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
