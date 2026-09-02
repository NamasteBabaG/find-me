"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import type { GameConfig } from "@/domain/game/config";
import { useI18n } from "@/i18n/client";
import { createHref, displayName, useNameStore } from "./name-store";

const GameShell = dynamic(() => import("@/game/components/GameShell").then((m) => m.GameShell), {
  ssr: false,
  loading: () => <div className="fm-skeleton" style={{ position: "absolute", inset: 0 }} aria-hidden />,
});

/** Full-width live demo: the real renderer, a demo child, straight into the beach. */
export function DemoSection({ config }: { config: GameConfig }) {
  const { t, tf } = useI18n();
  const d = t.home.demo;
  const raw = useNameStore((s) => s.raw);
  const name = displayName(raw, t.home.defaultName);
  return (
    <section id="demo" className="demo">
      <div className="fm-container">
        <div className="fm-sheet fm-sheet--night demo__sheet">
          <div className="demo__stars" aria-hidden />
          <div className="demo__head">
            <span className="fm-pill fm-pill--night">{d.pill}</span>
            <h2 className="demo__title">{d.title}</h2>
            <p className="demo__lead">{d.lead}</p>
          </div>
          <div className="demo__frame">
            <GameShell config={config} demo autoStartScene="beach" />
          </div>
          <div className="demo__foot">
            <p>{tf(d.foot, { name })}</p>
            <Link href={createHref(raw)} className="fm-btn fm-btn--lg">
              {tf(d.cta, { name })}
              <span className="fm-btn__arrow" aria-hidden>
                ➜
              </span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
