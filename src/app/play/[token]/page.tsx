import Link from "next/link";
import type { Metadata } from "next";
import { getContainer } from "@/services/container";
import { resolvePlayToken } from "@/services/share-link.service";
import { parseGameConfig } from "@/domain/game/config";
import { GameShell } from "@/game/components/GameShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "המשחק", robots: { index: false, follow: false } };

/** The private player link. No login, no chrome, no marketing. */
export default async function PlayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = getContainer();
  const resolved = await resolvePlayToken(c, token);

  if (!resolved.ok) {
    const text =
      resolved.reason === "not-ready" ? "המשחק עדיין בהכנה. נשלח מייל כשהוא יהיה מוכן." : resolved.reason === "revoked" ? "הקישור הזה כבר לא פעיל. בקשו קישור חדש ממי ששלח לכם אותו." : "הקישור לא נמצא. בדקו שהעתקתם אותו במלואו.";
    return (
      <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--3 fm-center">
        <span style={{ fontSize: "var(--fs-800)", lineHeight: 1 }} aria-hidden>
          🙈
        </span>
        <h1>רגע, איפה המשחק?</h1>
        <p className="fm-lead">{text}</p>
        <Link href="/" className="fm-btn fm-btn--secondary">
          לדף הבית
        </Link>
      </main>
    );
  }

  if (!resolved.game.configJson) {
    return (
      <main className="fm-container fm-container--narrow fm-section fm-center">
        <h1>המשחק עדיין בהכנה</h1>
      </main>
    );
  }

  const config = parseGameConfig(resolved.game.configJson);
  return <GameShell config={config} parentZoneHref="/library" />;
}
