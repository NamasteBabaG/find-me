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
  /** Used for the mission line before any hint has been asked for. */
  childName: string;
  onHint: () => void;
  /** The child's face sticker; shown instead of the sprite when the sprite is a world patch. */
  avatarUrl?: string;
  /** Landing demo: the question and the face, nothing else. */
  minimal?: boolean;
}

/** Floating mission pill: who to look for, (progress when there is more than one), and the hint button. */
export function MissionCard({ index, total, target, found, order, hintLevel, hintPulse, hintText, onHint, avatarUrl, childName, minimal = false }: Props) {
  const { g, tf } = useGameText();
  const isPatch = target?.sprite.kind === "image" && Boolean(target.sprite.rect);
  return (
    <section className="mission" aria-live="polite">
      <div className={`mission__thumb${isPatch && avatarUrl ? " mission__thumb--face" : ""}`} aria-hidden>
        {target ? (
          isPatch && avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="mission__sprite mission__face" draggable={false} />
          ) : (
            <Sprite sprite={target.sprite} className="mission__sprite" />
          )
        ) : null}
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
        {/* The authored mission names the place — "hiding behind the fallen
            log" — which is the answer, printed above the picture. It is the
            first hint now; until then the game only says who to look for. */}
        <h2 className="mission__text">{hintLevel >= 1 ? (target?.mission ?? "") : tf(g.scene.findChild, { name: childName })}</h2>
        {!minimal && hintLevel >= 1 && hintText ? <p className="mission__hint">💡 {hintText}</p> : null}
      </div>
      {minimal ? null : (
        <button type="button" className={`mission__hintbtn${hintPulse ? " mission__hintbtn--pulse" : ""}`} onClick={onHint} aria-label={hintLevel >= 3 ? g.scene.hintLast : g.scene.hint} title={g.scene.hint} disabled={hintLevel >= 3}>
          <span aria-hidden>💡</span>
        </button>
      )}
    </section>
  );
}
