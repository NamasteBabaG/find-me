import Link from "next/link";
import type { Dictionary } from "@/i18n/dictionaries/en";
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
export function SiteHeaderContent({ t, user, isAdmin, clear = false }: { t: Dictionary; user: { email: string } | null; isAdmin: boolean; clear?: boolean }) {
  const accountLabel = user ? t.common.myGames : t.common.signIn;
  return (
    <header className={`fm-header${clear ? " fm-header--clear" : ""}`}>
      <div className="fm-container fm-header__inner">
        <Link href="/" className="fm-logo" aria-label={t.common.brand} title={t.common.brand}>
          <span className="fm-logo__mark" aria-hidden>
            👀
          </span>
        </Link>
        <nav className="fm-nav fm-nav--main" aria-label={t.nav.main}>
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
          <Link href="/family" className="fm-btn fm-btn--secondary fm-btn--sm fm-header__account" aria-label={accountLabel} title={accountLabel}>
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
