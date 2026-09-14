"use client";

import { useState } from "react";
import type { GameConfig } from "@/domain/game/config";
import { sounds } from "../audio/sounds";
import { CelebrationOverlay } from "./CelebrationOverlay";
import { useGameText } from "../i18n";

/**
 * Digital gift wrap -> cover with the child's sticker. The tap here is also
 * the browser's "user gesture" that unlocks audio.
 *
 * The parcel floats a little, wears a ribbon and a bow, and the button nudges
 * now and then so a four-year-old knows what to press. Tearing it makes a
 * whoosh; the cover arrives under a small shower of paper.
 */
export function GiftReveal({ config, onOpen }: { config: GameConfig; onOpen: () => void }) {
  const { g, tf } = useGameText();
  const [phase, setPhase] = useState<"wrapped" | "tearing" | "cover">("wrapped");
  const from = config.gift?.fromName;
  const message = config.gift?.message;
  const name = config.child.name;
  const findAny = config.scenes.every(scene => scene.playMode === "find-any");
  const giftLead = !findAny ? g.gift.lead
    : config.scenes.every(scene => scene.targets.length === 5) ? g.gift.findAnyLead : g.gift.findAnyVariableLead;

  const tear = () => {
    sounds().unlock();
    sounds().play("whoosh");
    setPhase("tearing");
    setTimeout(() => setPhase("cover"), 700);
  };

  return (
    <div className="gift">
      {phase !== "cover" ? (
        <div className={`gift__wrap${phase === "tearing" ? " gift__wrap--tearing" : ""}`}>
          <div className="gift__glow" aria-hidden />
          <div className="gift__paper gift__paper--l" aria-hidden />
          <div className="gift__paper gift__paper--r" aria-hidden />
          <div className="gift__ribbon gift__ribbon--v" aria-hidden />
          <div className="gift__ribbon gift__ribbon--h" aria-hidden />
          <span className="gift__bow" aria-hidden>🎀</span>
          <span className="gift__spark gift__spark--1" aria-hidden>✦</span>
          <span className="gift__spark gift__spark--2" aria-hidden>✦</span>
          <span className="gift__spark gift__spark--3" aria-hidden>✦</span>
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
        <>
          <CelebrationOverlay kind="stars" small seed={7} />
          <div className="gift__cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={config.child.avatarUrl} alt="" className="fm-sticker gift__avatar" width={160} height={160} />
            <p className="fm-eyebrow">{tf(g.gift.made, { name })}</p>
            <h1 className="gift__title gift__title--big">{tf(g.gift.title, { name })}</h1>
            <p className="gift__lead">{tf(giftLead, { name, count: config.scenes.length, stars: config.scenes.reduce((sum, scene) => sum + scene.targets.length, 0) })}</p>
            {message ? <p className="gift__message">“{message}”</p> : null}
            <button type="button" className="fm-btn fm-btn--lg gift__btn" onClick={onOpen} autoFocus>
              {g.gift.start}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
