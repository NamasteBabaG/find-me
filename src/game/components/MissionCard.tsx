"use client";

import type { RefObject } from "react";
import Image from "next/image";
import type { TargetConfig } from "@/domain/game/config";
import type { HintLevel } from "@/domain/game/hints";
import { useGameText } from "../i18n";
import { StarTray } from "./StarTray";

interface Props {
  index: number;
  total: number;
  target: TargetConfig | null;
  found: string[];
  order: string[];
  /**
   * Gold stars that have landed in the tray. Trails `found` by one while a
   * star is still in the air, so the slot lights when the star arrives.
   * Defaults to every found child, for a card with no flight in front of it.
   */
  stars?: number;
  /** The tray, so the player can aim a flying star at it. */
  trayRef?: RefObject<HTMLSpanElement | null>;
  hintLevel: HintLevel;
  hintPulse: boolean;
  hintText: string | null;
  /** Used for the mission line before any hint has been asked for. */
  childName: string;
  /**
   * The words folded away. The face, the stars and the hint button stay: a
   * phone screen is mostly board, and the child under the card is the one
   * being looked for. A tap on the folded card unfolds it.
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
  /** The next place is open: the button that goes there. Never folded away. */
  onAdvance?: () => void;
  /** The real destination: next place, or the adventure bag on the last board. */
  advanceLabel?: string;
}

/**
 * The search HUD: who to look for, the board's gold stars, the hint.
 *
 * One row is always there - the child's face, one star slot per hiding spot
 * with the ones already found lit, and the hint button. Under it, the words:
 * the mission, the hint text, and for a five-hide board a small line saying
 * how many more to the next place or to the whole board. The words fold
 * away once read (see `quiet`); the stars never do, because they are the
 * score a child keeps glancing at. What the WORLD has collected is not shown
 * here at all - inside a board, only that board's stars matter (Guy).
 */
export function MissionCard({ index, total, target, found, order, stars, trayRef, hintLevel, hintPulse, hintText, onHint, avatarUrl, childName, quiet = false, onExpand, minimal = false, findAny = false, findsRequiredToAdvance = 3, onAdvance, advanceLabel }: Props) {
  const { g, tf } = useGameText();
  const foundCount = Math.min(found.length, total);
  const lit = Math.min(stars ?? found.length, total);
  const remainingToUnlock = Math.max(0, Math.min(total, Math.max(1, findsRequiredToAdvance)) - foundCount);
  const remainingToFinish = Math.max(0, total - foundCount);
  const findingAnother = findAny && foundCount > 0 && remainingToFinish > 0;
  const title = findAny && remainingToFinish === 0 ? g.scene.allHidesFound
    : findingAnother ? tf(g.scene.findChildAgain, { name: childName })
      : hintLevel >= 1 ? (target?.mission ?? "") : tf(g.scene.findChild, { name: childName });
  const rules = remainingToFinish === 0 ? tf(g.scene.boardCompleted, { total })
    : remainingToUnlock > 0 ? tf(remainingToUnlock === 1 ? g.scene.unlockRemainingOne : g.scene.unlockRemaining, { remaining: remainingToUnlock })
      : tf(remainingToFinish === 1 ? g.scene.finishRemainingOne : g.scene.finishRemaining, { remaining: remainingToFinish });
  void order;
  return (
    <section
      className={`mission${quiet ? " mission--quiet" : ""}${findAny ? " mission--free" : ""}`}
      onClick={quiet ? onExpand : undefined}
      // Folded, the card is a control: a real button to a keyboard and a screen reader, not a div that happens to listen.
      role={quiet ? "button" : undefined}
      tabIndex={quiet ? 0 : undefined}
      aria-expanded={quiet ? false : undefined}
      aria-label={quiet ? g.scene.expandMission : undefined}
      onKeyDown={
        quiet
          ? (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onExpand?.();
              }
            }
          : undefined
      }
    >
      <div className="mission__top">
        <div className="mission__thumb mission__thumb--face" aria-hidden>
          {avatarUrl ? (
            <Image src={avatarUrl} alt="" width={64} height={64} unoptimized className="mission__sprite mission__face" draggable={false} />
          ) : null}
        </div>
        {total > 1 ? (
          <div className="mission__progress">
            {/* One gold star per hiding spot. A star flies in from the found child, and only then does its slot light. */}
            <StarTray ref={trayRef} lit={lit} total={total} size="sm" className="mission__stars" label={tf(g.stars.tray, { earned: foundCount, total })} />
            {findAny ? <span className="mission__rules">{rules}</span> : <span className="mission__count">{tf(g.scene.missionOf, { n: index, total })}</span>}
          </div>
        ) : null}
        {minimal ? null : (
          // A word, not a lightbulb: an icon needs decoding, and the child asks a
          // grown-up anyway — the word is the design language (Guy).
          <button type="button" className={`mission__hintbtn${hintPulse ? " mission__hintbtn--pulse" : ""}`} onClick={onHint} aria-label={hintLevel >= 3 ? g.scene.hintLast : g.scene.hint} title={g.scene.hint} disabled={hintLevel >= 3 || !target}>
            {g.scene.hint}
          </button>
        )}
      </div>
      <div className="mission__body" hidden={quiet}>
        {/* The authored mission names the place — "hiding behind the fallen
            log" — which is the answer, printed above the picture. It is the
            first hint now; until then the game only says who to look for. */}
        <h2 className="mission__text">{title}</h2>
        {!minimal && findingAnother && hintLevel >= 1 && target?.mission ? <p className="mission__hint">{target.mission}</p> : null}
        {!minimal && hintLevel >= 1 && hintText ? <p className="mission__hint">💡 {hintText}</p> : null}
      </div>
      {onAdvance ? (
        <button type="button" className="mission__continue" onClick={onAdvance}>
          {advanceLabel ?? g.scene.canContinue}
          <span className="fm-btn__arrow" aria-hidden>
            ➜
          </span>
        </button>
      ) : null}
    </section>
  );
}
