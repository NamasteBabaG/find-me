"use client";

import { useState } from "react";
import type { GameConfig } from "@/domain/game/config";
import { useGameText } from "../i18n";

/**
 * Digital gift wrap → cover with the child's sticker. The tap here is also
 * the browser's "user gesture" that unlocks audio.
 */
export function GiftReveal({ config, onOpen }: { config: GameConfig; onOpen: () => void }) {
  const { g, tf } = useGameText();
  const [phase, setPhase] = useState<"wrapped" | "tearing" | "cover">("wrapped");
  const from = config.gift?.fromName;
  const message = config.gift?.message;
  const name = config.child.name;

  const tear = () => {
    setPhase("tearing");
    setTimeout(() => setPhase("cover"), 700);
  };

  return (
    <div className="gift">
      {phase !== "cover" ? (
        <div className={`gift__wrap${phase === "tearing" ? " gift__wrap--tearing" : ""}`}>
          <div className="gift__paper gift__paper--l" aria-hidden />
          <div className="gift__paper gift__paper--r" aria-hidden />
          <div className="gift__tag">
            <p className="fm-eyebrow">{g.gift.eyebrow}</p>
            <h1 className="gift__title">{tf(g.gift.forName, { name })}</h1>
            {from ? <p className="gift__from">{tf(g.gift.from, { from })}</p> : null}
            <button type="button" className="fm-btn fm-btn--lg gift__btn" onClick={tear} disabled={phase === "tearing"}>
              {g.gift.open}
            </button>
          </div>
        </div>
      ) : (
        <div className="gift__cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={config.child.avatarUrl} alt="" className="fm-sticker gift__avatar" width={160} height={160} />
          <p className="fm-eyebrow">{tf(g.gift.made, { name })}</p>
          <h1 className="gift__title gift__title--big">{tf(g.gift.title, { name })}</h1>
          <p className="gift__lead">{tf(g.gift.lead, { name, count: config.scenes.length })}</p>
          {message ? <p className="gift__message">“{message}”</p> : null}
          <button type="button" className="fm-btn fm-btn--lg gift__btn" onClick={onOpen} autoFocus>
            {g.gift.start}
          </button>
        </div>
      )}
    </div>
  );
}
