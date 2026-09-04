import type { Metadata, Viewport } from "next";
import { Fredoka, Rubik } from "next/font/google";
import { I18nProvider } from "@/i18n/client";
import { getI18n } from "@/i18n/server";
import { env } from "@/lib/env";
import { dirOf } from "@/i18n/config";
import "./globals.css";

// Rubik carries the site (400–900, Latin + Hebrew). Fredoka is reserved for kid-facing game UI.
const rubik = Rubik({ subsets: ["hebrew", "latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--font-rubik", display: "swap" });
const fredoka = Fredoka({ subsets: ["hebrew", "latin"], weight: ["400", "500", "600"], variable: "--font-fredoka", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: t.meta.title, template: `%s · ${t.common.brand}` },
    description: t.meta.description,
    robots: { index: true, follow: true },
  };
}

// No maximumScale / userScalable: browser zoom stays available (a11y). The game
// handles its own pinch gestures inside the viewport (touch-action: none).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FBF8F2",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getI18n();
  return (
    <html lang={locale} dir={dirOf(locale)} className={`${rubik.variable} ${fredoka.variable}`}>
      <body>
        <I18nProvider locale={locale} dict={t}>
          <QaBanner />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}

/**
 * A staging box runs a production build against a real image model and a
 * pretend till. It must never be mistaken for the shop — by us, or by anyone we
 * send a link to.
 */
function QaBanner() {
  const e = env();
  if (e.APP_ENV !== "qa") return null;
  return (
    <div className="qa-banner" role="status">
      QA environment - payments are simulated, nothing is charged
      {e.GENERATION_PROVIDER !== "mock" ? " (generation is real)" : null}
    </div>
  );
}
