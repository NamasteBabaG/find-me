"use client";

import type { TargetConfig } from "@/domain/game/config";
import type { HintLevel } from "@/domain/game/hints";
import { Sprite } from "./Sprite";
import { useGameText } from "../i18n";

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

/** Floating mission pill: who to look for, (progress when there is more than one), and the hint button. */
export function MissionCard({ index, total, target, found, order, hintLevel, hintPulse, hintText, onHint }: Props) {
  const { g, tf } = useGameText();
  return (
    <section className="mission" aria-live="polite">
      <div className="mission__thumb" aria-hidden>
        {target ? <Sprite sprite={target.sprite} className="mission__sprite" /> : null}
      </div>
      <div className="mission__body">
        {total > 1 ? (
          <div className="mission__meta">
            <span className="mission__count">{tf(g.scene.missionOf, { n: index, total })}</span>
            <span className="mission__ticks" aria-label={tf(g.scene.foundOf, { found: found.length, total })}>
              {order.map((id) => (
                <span key={id} className={`mission__tick${found.includes(id) ? " mission__tick--done" : ""}`}>
                  {found.includes(id) ? "✓" : ""}
                </span>
              ))}
            </span>
          </div>
        ) : null}
        <h2 className="mission__text">{target?.mission ?? ""}</h2>
        {hintLevel >= 1 && hintText ? <p className="mission__hint">💡 {hintText}</p> : null}
      </div>
      <button type="button" className={`mission__hintbtn${hintPulse ? " mission__hintbtn--pulse" : ""}`} onClick={onHint} aria-label={hintLevel >= 3 ? g.scene.hintLast : g.scene.hint} title={g.scene.hint} disabled={hintLevel >= 3}>
        <span aria-hidden>💡</span>
      </button>
    </section>
  );
}
