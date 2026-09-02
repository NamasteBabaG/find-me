import type { Metadata, Viewport } from "next";
import { Fredoka, Rubik } from "next/font/google";
import "./globals.css";

const fredoka = Fredoka({ subsets: ["hebrew", "latin"], weight: ["400", "500", "600"], variable: "--font-fredoka", display: "swap" });
const rubik = Rubik({ subsets: ["hebrew", "latin"], weight: ["400", "500", "700"], variable: "--font-rubik", display: "swap" });

export const metadata: Metadata = {
  title: { default: "איפה אני? — משחק חיפוש אישי לילדים", template: "%s · איפה אני?" },
  description: "תמונה אחת. בוחרים עולמות. הילד שלכם הופך לכוכב של משחק חיפוש אישי.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#FFF8EC",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${fredoka.variable} ${rubik.variable}`}>
      <body>{children}</body>
    </html>
  );
}
