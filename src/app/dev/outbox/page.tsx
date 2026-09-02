import { notFound } from "next/navigation";
import { isDev } from "@/lib/env";
import { getContainer } from "@/services/container";
import { ConsoleEmailProvider } from "@/infra/email/console";
import { SiteHeader } from "@/ui/Shell";
import { currentUser, isAdminEmail } from "@/lib/server/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "תיבת דואר (dev)", robots: { index: false } };

/** Dev-only: every email the app "sent", with clickable links. */
export default async function OutboxPage() {
  if (!isDev()) notFound();
  const c = getContainer();
  const user = await currentUser();
  const mails = c.email instanceof ConsoleEmailProvider ? await c.email.list() : [];
  return (
    <>
      <SiteHeader user={user} isAdmin={isAdminEmail(user?.email)} />
      <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--3">
        <h1>תיבת דואר (סביבת פיתוח)</h1>
        <p className="fm-muted">בסביבת פיתוח מיילים לא נשלחים באמת — הם מופיעים כאן ובקונסול של השרת.</p>
        {mails.length === 0 ? <p className="fm-card">עדיין אין מיילים.</p> : null}
        {mails.map((m) => (
          <article key={m.id} className="fm-card fm-stack fm-stack--1">
            <div className="fm-row fm-row--between">
              <strong>{m.subject}</strong>
              <span className="fm-small">
                {m.tag} · {new Date(m.sentAt).toLocaleString("he-IL")}
              </span>
            </div>
            <span className="fm-small" dir="ltr">
              → {m.to}
            </span>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>
              {m.text.split(/(https?:\/\/\S+)/g).map((part, i) =>
                /^https?:\/\//.test(part) ? (
                  <a key={i} href={part} dir="ltr">
                    {part}
                  </a>
                ) : (
                  part
                ),
              )}
            </pre>
          </article>
        ))}
      </main>
    </>
  );
}
