import Link from "next/link";
import { getContainer } from "@/services/container";
import { listGamesForUser } from "@/services/game.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { isDev } from "@/lib/env";
import { SiteFooter, SiteHeader, Notice } from "@/ui/Shell";
import { LinkButton } from "@/ui/Button";
import { LoginForm } from "./LoginForm";
import { logoutAction } from "./actions";

export const metadata = { title: "המשחקים שלי", robots: { index: false } };

const STATUS_HE: Record<string, string> = {
  CHECKOUT_PENDING: "ממתין לתשלום",
  PAYMENT_FAILED: "התשלום נכשל",
  PAID: "בהכנה",
  AVATAR_GENERATING: "בהכנה",
  TARGETS_GENERATING: "בהכנה",
  SCENES_COMPOSING: "בהכנה",
  QA_PENDING: "בבדיקה אחרונה",
  MANUAL_REVIEW: "בבדיקה אחרונה",
  NEEDS_REGENERATION: "בבדיקה אחרונה",
  NEEDS_NEW_PHOTO: "נדרשת תמונה חדשה",
  APPROVED: "כמעט מוכן",
  READY: "מוכן",
  DELIVERED: "מוכן",
  GENERATION_FAILED: "תקלה ביצירה",
  REFUNDED: "הוחזר",
};

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string }> }) {
  const [user, params] = await Promise.all([currentUser(), searchParams]);
  const isAdmin = isAdminEmail(user?.email);

  if (!user) {
    return (
      <>
        <SiteHeader user={null} isAdmin={false} />
        <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--4">
          <div className="create__head">
            <h1 className="create__title">המשחקים שלי</h1>
            <p className="fm-lead">בלי סיסמה. נשלח לכם קישור כניסה למייל.</p>
          </div>
          {params.error === "expired" ? <Notice kind="warn">הקישור פג תוקף או כבר נוצל. בקשו קישור חדש.</Notice> : null}
          <LoginForm devOutbox={isDev()} />
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
            <h1>המשחקים שלי</h1>
            <p className="fm-muted">{user.email}</p>
          </div>
          <div className="fm-row">
            <LinkButton href="/create">צרו עוד משחק</LinkButton>
            <form action={logoutAction}>
              <button type="submit" className="fm-btn fm-btn--ghost">
                יציאה
              </button>
            </form>
          </div>
        </div>
        {params.deleted === "1" ? <Notice kind="success">המשחק נמחק, כולל הדמות והתמונה.</Notice> : null}
        {games.length === 0 ? (
          <div className="fm-card fm-card--pad-6 fm-center fm-stack fm-stack--3">
            <p className="fm-lead">עוד אין כאן משחקים.</p>
            <LinkButton href="/create" size="lg">
              יוצרים משחק ראשון
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
                  <p className="lib__meta">
                    {g.packageName} · {g.sceneCount} עולמות · {g.createdAt.toLocaleDateString("he-IL")}
                  </p>
                </div>
                <span className={`fm-badge ${g.playable ? "fm-badge--leaf" : "fm-badge--outline"}`}>{STATUS_HE[g.status] ?? g.status}</span>
                <div className="lib__actions">
                  {g.playUrl ? (
                    <LinkButton href={g.playUrl} size="sm">
                      שחקו
                    </LinkButton>
                  ) : (
                    <LinkButton href={`/creating/${g.id}`} size="sm" variant="secondary">
                      סטטוס
                    </LinkButton>
                  )}
                  <Link href={`/library/${g.id}`} className="fm-btn fm-btn--secondary fm-btn--sm">
                    ניהול ושיתוף
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
