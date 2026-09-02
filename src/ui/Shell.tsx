import Link from "next/link";
import type { ReactNode } from "react";

/** Adult-facing page chrome. The game itself never shows this header. */
export function SiteHeader({ user, isAdmin }: { user: { email: string } | null; isAdmin: boolean }) {
  return (
    <header className="fm-header">
      <div className="fm-container fm-header__inner">
        <Link href="/" className="fm-logo" aria-label="איפה אני? — דף הבית">
          <span className="fm-logo__mark" aria-hidden>
            👀
          </span>
          איפה אני?
        </Link>
        <nav className="fm-nav" aria-label="ניווט">
          <Link href="/create">יוצרים משחק</Link>
          <Link href="/library">{user ? "המשחקים שלי" : "כניסה"}</Link>
          {isAdmin ? <Link href="/admin/orders">אדמין</Link> : null}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="fm-footer">
      <div className="fm-container fm-row fm-row--between">
        <span>© {new Date().getFullYear()} איפה אני? · המשחק נשמר בספרייה שלכם וזמין ללא הגבלת זמן, בכפוף לתנאי השירות.</span>
        <span className="fm-row">
          <Link href="/design-system">מערכת העיצוב</Link>
          <Link href="/dev/outbox">תיבת דואר (dev)</Link>
        </span>
      </div>
    </footer>
  );
}

export function Page({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return <main className={`fm-container${narrow ? " fm-container--narrow" : ""} fm-section`}>{children}</main>;
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="fm-stepper" role="list" aria-label="שלבי היצירה">
      {steps.map((label, i) => (
        <span
          key={label}
          role="listitem"
          aria-current={i === current ? "step" : undefined}
          aria-label={`${label}${i < current ? " — הושלם" : i === current ? " — שלב נוכחי" : ""}`}
          className={`fm-stepper__dot${i === current ? " fm-stepper__dot--active" : i < current ? " fm-stepper__dot--done" : ""}`}
        />
      ))}
      <span className="fm-stepper__label" aria-hidden>
        {steps[current]}
      </span>
    </div>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "danger" | "success" | "warn"; children: ReactNode }) {
  const cls = kind === "warn" ? "fm-notice" : `fm-notice fm-notice--${kind}`;
  return (
    <div className={cls} role={kind === "danger" ? "alert" : "status"}>
      {children}
    </div>
  );
}
