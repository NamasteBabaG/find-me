import { redirect } from "next/navigation";
import { getI18n } from "@/i18n/server";
import { qaAccessConfig, qaAccessConfigured, safeQaNext } from "@/lib/qa-access";
import "./qa-access.css";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function QaAccessPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const config = qaAccessConfig();
  if (!config.enabled) redirect("/");
  const { t } = await getI18n();
  const query = await searchParams;
  const ready = qaAccessConfigured(config);
  return (
    <main className="qa-access-shell">
      <section className="qa-access-card" aria-labelledby="qa-access-title">
        <span className="fm-pill">FindMe Worlds · QA</span>
        <h1 id="qa-access-title">{t.qaAccess.title}</h1>
        <p>{ready ? t.qaAccess.description : t.qaAccess.unavailable}</p>
        {ready && <form action="/qa-access/login" method="post" className="qa-access-form">
          <input type="hidden" name="next" value={safeQaNext(query.next)} />
          <label htmlFor="qa-password">{t.qaAccess.password}</label>
          <input className="fm-input" id="qa-password" name="password" type="password" autoComplete="current-password" required maxLength={256} aria-describedby={query.error === "invalid" ? "qa-error" : undefined} />
          {query.error === "invalid" && <p id="qa-error" role="alert">{t.qaAccess.invalid}</p>}
          <button className="fm-btn" type="submit">{t.qaAccess.submit}</button>
        </form>}
        <p className="qa-access-note">{t.qaAccess.note}</p>
      </section>
    </main>
  );
}
