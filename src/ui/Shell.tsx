import Link from "next/link";
import type { ReactNode } from "react";
import { isDev } from "@/lib/env";
import { getI18n } from "@/i18n/server";
import { LanguageSwitcher } from "@/i18n/LanguageSwitcher";

/** The account mark: a head and shoulders, in the toolbar's stroke language. */
function AccountMark() {
  return (
    <svg className="fm-header__account-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </svg>
  );
}

/** Adult-facing page chrome. The game itself never shows this header. */
export async function SiteHeader({ user, isAdmin, clear = false }: { user: { email: string } | null; isAdmin: boolean; clear?: boolean }) {
  const { t } = await getI18n();
  const accountLabel = user ? t.common.myGames : t.common.signIn;
  return (
    <header className={`fm-header${clear ? " fm-header--clear" : ""}`}>
      <div className="fm-container fm-header__inner">
        <Link href="/" className="fm-logo" aria-label={t.common.brand} title={t.common.brand}>
          <span className="fm-logo__mark" aria-hidden>
            👀
          </span>
        </Link>
        <nav className="fm-nav fm-nav--main" aria-label="Main">
          <Link href="/#demo">{t.nav.demo}</Link>
          <Link href="/#how">{t.nav.how}</Link>
          <Link href="/#gift">{t.nav.gift}</Link>
          <Link href="/#pricing">{t.nav.pricing}</Link>
          {isAdmin ? <Link href="/admin/orders">{t.common.admin}</Link> : null}
        </nav>
        <div className="fm-header__cta">
          <LanguageSwitcher />
          {/* The way back to a game already bought. It used to be hidden below
              860px, which left a parent on a phone with no route to their
              library except the foot of a very long page. It stays; on a
              narrow header it is the mark alone, with its name still read. */}
          <Link href="/library" className="fm-btn fm-btn--secondary fm-btn--sm fm-header__account" aria-label={accountLabel} title={accountLabel}>
            <AccountMark />
            <span className="fm-header__account-label">{accountLabel}</span>
          </Link>
          <Link href="/create" className="fm-btn fm-btn--sm">
            {t.common.createGame}
          </Link>
        </div>
      </div>
    </header>
  );
}

export async function SiteFooter() {
  const { t } = await getI18n();
  return (
    <footer className="fm-footer">
      <div className="fm-container">
        <div className="fm-footer__grid">
          <div className="fm-footer__col">
            <Link href="/" className="fm-logo" aria-label={t.common.brand}>
              <span className="fm-logo__mark" aria-hidden>
                👀
              </span>
              <span>{t.common.brand}</span>
            </Link>
            <p className="fm-measure">{t.footer.blurb}</p>
          </div>
          <div className="fm-footer__col">
            <span className="fm-footer__title">{t.footer.product}</span>
            <Link href="/create">{t.common.createGame}</Link>
            <Link href="/#worlds">{t.footer.worlds}</Link>
            <Link href="/#pricing">{t.footer.pricing}</Link>
            <Link href="/#faq">{t.footer.faq}</Link>
          </div>
          <div className="fm-footer__col">
            <span className="fm-footer__title">{t.footer.account}</span>
            <Link href="/library">{t.common.myGames}</Link>
            <Link href="/#trust">{t.footer.privacy}</Link>
            {/* Developer pages: /dev/outbox is 404 in production and the design system is not for visitors. */}
            {isDev() ? (
              <>
                <Link href="/design-system">{t.footer.designSystem}</Link>
                <Link href="/dev/outbox">{t.footer.outbox}</Link>
              </>
            ) : null}
          </div>
        </div>
        <div className="fm-footer__bottom">
          <span>
            © {new Date().getFullYear()} {t.common.brand} · {t.footer.madeWith}
          </span>
          <span>{t.footer.terms}</span>
        </div>
      </div>
    </footer>
  );
}

export function Page({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return <main className={`fm-container${narrow ? " fm-container--narrow" : ""} fm-section`}>{children}</main>;
}

export { Notice, Stepper } from "./primitives";
