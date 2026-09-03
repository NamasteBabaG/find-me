import Link from "next/link";
import type { Metadata } from "next";
import { getContainer } from "@/services/container";
import { resolvePlayToken } from "@/services/share-link.service";
import { parseGameConfig } from "@/domain/game/config";
import { withFreshAssetUrls } from "@/services/asset.service";
import { getI18n } from "@/i18n/server";
import { GameShell } from "@/game/components/GameShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The private player link. No login, no chrome, no marketing. */
export default async function PlayPage({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, { t }] = await Promise.all([params, getI18n()]);
  const c = getContainer();
  const resolved = await resolvePlayToken(c, token);

  if (!resolved.ok || !resolved.game.configJson) {
    const text = !resolved.ok ? (resolved.reason === "not-ready" ? t.play.notReady : resolved.reason === "revoked" ? t.play.revoked : t.play.invalid) : t.play.notReady;
    return (
      <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--3 fm-center">
        <span style={{ fontSize: "var(--fs-800)", lineHeight: 1 }} aria-hidden>
          🙈
        </span>
        <h1>{t.play.heading}</h1>
        <p className="fm-lead">{text}</p>
        <Link href="/" className="fm-btn fm-btn--secondary">
          {t.common.home}
        </Link>
      </main>
    );
  }

  // Signatures expire, so the config is re-signed on the way to the player.
  const config = withFreshAssetUrls(getContainer(), parseGameConfig(resolved.game.configJson));
  return <GameShell key={config.locale} config={config} parentZoneHref="/library" />;
}
