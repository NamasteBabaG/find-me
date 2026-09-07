"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import type { GameConfig } from "@/domain/game/config";
import { useI18n } from "@/i18n/client";

const GameShell = dynamic(() => import("@/game/components/GameShell").then((m) => m.GameShell), {
  ssr: false,
  loading: () => <div className="fm-skeleton" style={{ position: "absolute", inset: 0 }} aria-hidden />,
});

/**
 * Full-bleed live demo: the real renderer, the demo child, one mission,
 * Desktop keeps the art ratio; portrait phones get a tall panning window.
 */
export function DemoSection({ config }: { config: GameConfig }) {
  const { t, tf } = useI18n();
  const d = t.home.demo;
  const name = config.child.name;
  // Match the frame to the artwork so the world fills it exactly (no letterbox bars).
  const art = config.scenes[0]?.art;
  return (
    <section id="demo" className="demo">
      <div className="fm-container demo__inner">
        <div className="demo__head">
          <span className="fm-pill">{d.pill}</span>
          <h2 className="demo__title">{tf(d.title, { name })}</h2>
          <p className="demo__lead">{tf(d.lead, { name })}</p>
        </div>
        <div className="demo__frame" style={art ? { "--demo-art-ratio": `${art.width} / ${art.height}` } as React.CSSProperties : undefined}>
          {/* The play store is created once per mount; remount on a language switch so the demo speaks the new locale. */}
          <GameShell key={config.locale} config={config} demo autoStartScene="beach" singleMission />
        </div>
        <div className="demo__foot">
          <p>{d.foot}</p>
          <Link href="/create" className="fm-btn fm-btn--night fm-btn--lg">
            {d.cta}
            <span className="fm-btn__arrow" aria-hidden>
              ➜
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
