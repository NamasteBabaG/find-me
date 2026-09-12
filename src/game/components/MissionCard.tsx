"use client";

import type { TargetConfig } from "@/domain/game/config";
import type { HintLevel } from "@/domain/game/hints";
import Image from "next/image";
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
  /**
   * Collapsed to the face and the hint button. On a phone the full card covers
   * the bottom of the board — exactly where a child tends to be hidden — so
   * once the mission has been read it folds away and unfolds on a tap.
   */
  quiet?: boolean;
  onExpand?: () => void;
  onHint: () => void;
  /** The illustrated identity cue, never the upload or a costumed hiding spot. */
  avatarUrl?: string;
  /** Landing demo: the question and the face, nothing else. */
  minimal?: boolean;
  findAny?: boolean;
  /** Display copy follows the scene's unlock threshold; the domain owns unlocking. */
  findsRequiredToAdvance?: number;
  worldStars?: { found: number; total: number };
  onAdvance?: () => void;
}

/** Floating mission pill: who to look for, (progress when there is more than one), and the hint button. */
export function MissionCard({ index, total, target, found, order, hintLevel, hintPulse, hintText, onHint, avatarUrl, childName, quiet = false, onExpand, minimal = false, findAny = false, findsRequiredToAdvance = 3, worldStars, onAdvance }: Props) {
  const { g, tf } = useGameText();
  const foundCount = Math.min(found.length, total);
  const remainingToUnlock = Math.max(0, Math.min(total, Math.max(1, findsRequiredToAdvance)) - foundCount);
  const remainingToFinish = Math.max(0, total - foundCount);
  const findingAnother = findAny && foundCount > 0 && remainingToFinish > 0;
  const title = findAny && remainingToFinish === 0 ? g.scene.allHidesFound
    : findingAnother ? tf(g.scene.findChildAgain, { name: childName })
      : hintLevel >= 1 ? (target?.mission ?? "") : tf(g.scene.findChild, { name: childName });
  const rules = remainingToFinish === 0 ? tf(g.scene.boardCompleted, { total })
    : remainingToUnlock > 0 ? tf(remainingToUnlock === 1 ? g.scene.unlockRemainingOne : g.scene.unlockRemaining, { remaining: remainingToUnlock })
      : tf(remainingToFinish === 1 ? g.scene.finishRemainingOne : g.scene.finishRemaining, { remaining: remainingToFinish });
  return (
    <section
      className={`mission${quiet ? " mission--quiet" : ""}`}
      onClick={quiet ? onExpand : undefined}
      // Folded, the card is a control: a real button to a keyboard and a screen reader, not a div that happens to listen.
      role={quiet ? "button" : undefined}
      tabIndex={quiet ? 0 : undefined}
      aria-expanded={quiet ? false : undefined}
      aria-label={quiet ? g.scene.expandMission : undefined}
      onKeyDown={
        quiet
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onExpand?.();
              }
            }
          : undefined
      }
    >
      <div className="mission__thumb mission__thumb--face" aria-hidden>
        {avatarUrl ? (
          <Image src={avatarUrl} alt="" width={96} height={96} unoptimized className="mission__sprite mission__face" draggable={false} />
        ) : null}
      </div>
      <div className="mission__body" hidden={quiet}>
        {total > 1 ? (
          <div className="mission__meta">
            <span className="mission__count">{findAny ? tf(g.scene.boardStars, { found: found.length, total }) : tf(g.scene.missionOf, { n: index, total })}</span>
            <span className="mission__ticks" aria-label={tf(g.scene.foundOf, { found: found.length, total })}>
              {order.map((id) => (
                <span key={id} className={`mission__tick${found.includes(id) ? " mission__tick--done" : ""}`}>
                  {findAny ? (found.includes(id) ? "★" : "☆") : found.includes(id) ? "✓" : ""}
                </span>
              ))}
            </span>
          </div>
        ) : null}
        {worldStars ? <p className="mission__count">{tf(g.scene.worldStars, worldStars)}</p> : null}
        {/* The authored mission names the place — "hiding behind the fallen
            log" — which is the answer, printed above the picture. It is the
            first hint now; until then the game only says who to look for. */}
        <h2 className="mission__text">{title}</h2>
        {!minimal && findingAnother && hintLevel >= 1 && target?.mission ? <p className="mission__hint">{target.mission}</p> : null}
        {!minimal && hintLevel >= 1 && hintText ? <p className="mission__hint">💡 {hintText}</p> : null}
        {findAny ? <p className="mission__rules">{rules}</p> : null}
        {onAdvance ? <button type="button" className="mission__continue" onClick={onAdvance}>{g.scene.canContinue} ➜</button> : null}
      </div>
      {minimal ? null : (
        // A word, not a lightbulb: an icon needs decoding, and the child asks a
        // grown-up anyway — the word is the design language (Guy).
        <button type="button" className={`mission__hintbtn${hintPulse ? " mission__hintbtn--pulse" : ""}`} onClick={onHint} aria-label={hintLevel >= 3 ? g.scene.hintLast : g.scene.hint} title={g.scene.hint} disabled={hintLevel >= 3 || !target}>
          {g.scene.hint}
        </button>
      )}
    </section>
  );
}
