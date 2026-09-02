"use client";

import { useState } from "react";
import type { GameConfig } from "@/domain/game/config";

/**
 * Digital gift wrap → cover with the child's sticker. The tap here is also
 * the browser's "user gesture" that unlocks audio.
 */
export function GiftReveal({ config, onOpen }: { config: GameConfig; onOpen: () => void }) {
  const [phase, setPhase] = useState<"wrapped" | "tearing" | "cover">("wrapped");
  const from = config.gift?.fromName;
  const message = config.gift?.message;

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
            <p className="fm-eyebrow">משהו קטן מחכה</p>
            <h1 className="gift__title">ל{config.child.name}</h1>
            {from ? <p className="gift__from">מאת {from}</p> : null}
            <button type="button" className="fm-btn fm-btn--lg gift__btn" onClick={tear} disabled={phase === "tearing"}>
              🎁 לפתיחת המתנה
            </button>
          </div>
        </div>
      ) : (
        <div className="gift__cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={config.child.avatarUrl} alt="" className="fm-sticker gift__avatar" width={160} height={160} />
          <p className="fm-eyebrow">הכנו משחק במיוחד בשביל {config.child.name}</p>
          <h1 className="gift__title gift__title--big">איפה {config.child.name}?</h1>
          <p className="gift__lead">
            {config.child.name} מתחבא/ת ב־{config.scenes.length} עולמות. בכל עולם — שלושה מחבואים.
          </p>
          {message ? <p className="gift__message">״{message}״</p> : null}
          <button type="button" className="fm-btn fm-btn--lg gift__btn" onClick={onOpen} autoFocus>
            לפתיחת ההרפתקה ✨
          </button>
        </div>
      )}
    </div>
  );
}
