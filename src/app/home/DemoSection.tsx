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
 * the world at its true 16:9 ratio with the UI floating on top.
 */
export function DemoSection({ config }: { config: GameConfig }) {
  const { t } = useI18n();
  const d = t.home.demo;
  return (
    <section id="demo" className="demo">
      <div className="demo__stars" aria-hidden />
      <div className="fm-container demo__inner">
        <div className="demo__head">
          <span className="fm-pill fm-pill--night">{d.pill}</span>
          <h2 className="demo__title">{d.title}</h2>
          <p className="demo__lead">{d.lead}</p>
        </div>
        <div className="demo__frame">
          <GameShell config={config} demo autoStartScene="beach" singleMission />
        </div>
        <div className="demo__foot">
          <p>{d.foot}</p>
          <Link href="/create" className="fm-btn fm-btn--lg">
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
