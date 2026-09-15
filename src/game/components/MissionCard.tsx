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
   * The hint details folded away. The name, face, stars and hint button stay: a
   * phone screen is mostly board, and the child under the card is the one
   * being looked for. A tap on the folded card unfolds it.
   */
  quiet?: boolean;
  onExpand?: () => void;
  onHint: () => void;
  /** Guided collection can move the camera away from the final child hint. */
  repeatLastHint?: boolean;
  /** The illustrated identity cue, never the upload or a costumed hiding spot. */
  avatarUrl?: string;
  /** Landing demo: the question and the face, nothing else. */
  minimal?: boolean;
  findAny?: boolean;
  /** Compatibility with callers; unlocking belongs to the domain, not HUD copy. */
  findsRequiredToAdvance?: number;
  /** The next place is open: the button that goes there. Never folded away. */
  onAdvance?: () => void;
  /** The real destination: next place, or the adventure bag on the last board. */
  advanceLabel?: string;
  replay?: boolean;
  /** Public demo has no saved progress to protect or explain. */
  showReplayNote?: boolean;
  onReplay?: () => void;
}

/**
 * The search HUD: who to look for, the board's gold stars, the hint.
 *
 * One row is always there - the child's face, name and one star slot per hiding
 * spot with the ones already found lit, and the hint button. Only requested
 * hint details sit below and fold away once read (see `quiet`); the stars never do, because they are the
 * score a child keeps glancing at. What the WORLD has collected is not shown
 * here at all - inside a board, only that board's stars matter (Guy).
 */
export function MissionCard({ index, total, target, found, order, stars, trayRef, hintLevel, hintPulse, hintText, onHint, repeatLastHint = false, avatarUrl, childName, quiet = false, onExpand, minimal = false, findAny = false, onAdvance, advanceLabel, replay = false, showReplayNote = true, onReplay }: Props) {
  const { g, tf } = useGameText();
  const foundCount = Math.min(found.length, total);
  const lit = Math.min(stars ?? found.length, total);
  const remainingToFinish = Math.max(0, total - foundCount);
  const findingAnother = findAny && foundCount > 0 && remainingToFinish > 0;
  const title = findAny && remainingToFinish === 0 ? g.scene.allHidesFound
    : findingAnother ? tf(g.scene.findChildAgain, { name: childName })
      : tf(g.scene.findChild, { name: childName });
  const hasHintDetails = !minimal && hintLevel >= 1 && (!!hintText || !!target?.mission);
  const expandable = quiet && hasHintDetails;
  void order;
  return (
    <section
      className={`mission${expandable ? " mission--quiet" : ""}${findAny ? " mission--free" : ""}`}
      onClick={expandable ? onExpand : undefined}
      // Folded, the card is a control: a real button to a keyboard and a screen reader, not a div that happens to listen.
      role={expandable ? "button" : undefined}
      tabIndex={expandable ? 0 : undefined}
      aria-expanded={expandable ? false : undefined}
      aria-label={expandable ? g.scene.expandMission : undefined}
      onKeyDown={
        expandable
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
        <div className="mission__progress">
          {/* Keep the name alongside the face even when requested hint details fold. */}
          <h2 className="mission__text">{title}</h2>
          {replay ? <span className="mission__replay-label" title={showReplayNote ? g.replay.note : undefined}>{g.replay.label}</span> : null}
          {total > 1 ? <>
            {/* One gold star per hiding spot. A star flies in from the found child, and only then does its slot light. */}
            <StarTray ref={trayRef} lit={lit} total={total} size="sm" className="mission__stars" label={tf(g.stars.tray, { earned: foundCount, total })} />
            {!findAny ? <span className="mission__count">{tf(g.scene.missionOf, { n: index, total })}</span> : null}
          </> : null}
        </div>
        {minimal ? null : (
          // A word, not a lightbulb: an icon needs decoding, and the child asks a
          // grown-up anyway — the word is the design language (Guy).
          <button type="button" className={`mission__hintbtn${hintPulse ? " mission__hintbtn--pulse" : ""}`} onClick={onHint} aria-label={hintLevel >= 3 && !repeatLastHint ? g.scene.hintLast : g.scene.hint} title={g.scene.hint} disabled={(hintLevel >= 3 && !repeatLastHint) || !target}>
            {g.scene.hint}
          </button>
        )}
      </div>
      {hasHintDetails ? <div className="mission__body" hidden={quiet}>
        {/* The authored mission names the place — "hiding behind the fallen
            log" — which is the answer, printed above the picture. It is the
            first hint now; until then the game only says who to look for. */}
        {!minimal && hintLevel >= 1 && target?.mission ? <p className="mission__hint">{target.mission}</p> : null}
        {!minimal && hintLevel >= 1 && hintText ? <p className="mission__hint">💡 {hintText}</p> : null}
      </div> : null}
      {onAdvance ? (
        <button type="button" className="mission__continue" onClick={onAdvance}>
          {advanceLabel ?? g.scene.canContinue}
          <span className="fm-btn__arrow" aria-hidden>
            ➜
          </span>
        </button>
      ) : null}
      {onReplay ? <div className="mission__replay">
        <button type="button" className="fm-btn fm-btn--secondary fm-btn--sm" onClick={onReplay} aria-describedby={showReplayNote ? "replay-note" : undefined}>{g.complete.again}</button>
        {showReplayNote ? <p id="replay-note" className="mission__replay-note">{g.replay.note}</p> : null}
      </div> : null}
    </section>
  );
}
