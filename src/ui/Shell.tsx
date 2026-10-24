import Link from "next/link";
import type { ReactNode } from "react";
import { isDev } from "@/lib/env";
import { getI18n } from "@/i18n/server";
import { SiteHeaderContent } from "./SiteHeaderContent";
import { serviceCopy } from "@/domain/legal";

/** Adult-facing page chrome. The game itself never shows this header. */
export async function SiteHeader({ user, isAdmin, clear = false }: { user: { email: string } | null; isAdmin: boolean; clear?: boolean }) {
  const { t } = await getI18n();
  return <SiteHeaderContent t={t} user={user} isAdmin={isAdmin} clear={clear} />;
}

export async function SiteFooter() {
  const { t, locale } = await getI18n();
  const service = serviceCopy[locale];
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
            <Link href="/family">{t.common.myGames}</Link>
            {/* Developer pages: /dev/outbox is 404 in production and the design system is not for visitors. */}
            {isDev() ? (
              <>
                <Link href="/design-system">{t.footer.designSystem}</Link>
                <Link href="/dev/outbox">{t.footer.outbox}</Link>
              </>
            ) : null}
          </div>
          <div className="fm-footer__col">
            <span className="fm-footer__title">{service.navigation}</span>
            <Link href="/support">{service.support}</Link>
            <Link href="/privacy">{service.privacy}</Link>
            <Link href="/terms">{service.terms}</Link>
            <Link href="/cancellation">{service.cancellation}</Link>
            <Link href="/accessibility">{service.accessibility}</Link>
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
