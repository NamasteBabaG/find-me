"use client";

import type { TargetConfig } from "@/domain/game/config";
import type { HintLevel } from "@/domain/game/hints";
import { Sprite } from "./Sprite";

interface Props {
  index: number;
  total: number;
  target: TargetConfig | null;
  found: string[];
  order: string[];
  hintLevel: HintLevel;
  hintPulse: boolean;
  hintText: string | null;
  onHint: () => void;
}

/** Bottom card: what to look for, progress ticks, and the hint button. */
export function MissionCard({ index, total, target, found, order, hintLevel, hintPulse, hintText, onHint }: Props) {
  return (
    <section className="mission" aria-live="polite">
      <div className="mission__thumb" aria-hidden>
        {target ? <Sprite sprite={target.sprite} className="mission__sprite" /> : null}
      </div>
      <div className="mission__body">
        <div className="mission__meta">
          <span className="fm-badge">
            משימה {index} מתוך {total}
          </span>
          <span className="mission__ticks" aria-label={`${found.length} מתוך ${total} נמצאו`}>
            {order.map((id) => (
              <span key={id} className={`mission__tick${found.includes(id) ? " mission__tick--done" : ""}`}>
                {found.includes(id) ? "✓" : ""}
              </span>
            ))}
          </span>
        </div>
        <h2 className="mission__text">{target?.mission ?? ""}</h2>
        {hintLevel >= 1 && hintText ? <p className="mission__hint">💡 {hintText}</p> : null}
      </div>
      <button type="button" className={`fm-btn fm-btn--secondary fm-btn--kid mission__hintbtn${hintPulse ? " mission__hintbtn--pulse" : ""}`} onClick={onHint} aria-label={hintLevel >= 3 ? "הרמז האחרון כבר מוצג" : "רמז"} disabled={hintLevel >= 3}>
        <span aria-hidden>💡</span>
        <span className="mission__hintlabel">רמז</span>
      </button>
    </section>
  );
}
