import type { Metadata, Viewport } from "next";
import { Fredoka, Rubik } from "next/font/google";
import { I18nProvider } from "@/i18n/client";
import { getI18n } from "@/i18n/server";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#FBF8F2",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getI18n();
  return (
    <html lang={locale} dir={dirOf(locale)} className={`${rubik.variable} ${fredoka.variable}`}>
      <body>
        <I18nProvider locale={locale} dict={t}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
