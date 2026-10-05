"use client";

import type { PlayStore } from "../store/play-store";
import { gameStars } from "@/domain/game/progress";
import { useGameText } from "../i18n";
import { useLayoutEffect, useRef } from "react";

/**
 * The strip is about a round, so it is there only while one exists (V16). Without one, starting over is a quiet
 * button under the map's Go, and nothing sits above the map asking "Another player?".
 */
export function RoundControls({ store }: { store: PlayStore }) {
  const { g, tf } = useGameText();
  const panel = useRef<HTMLElement>(null);
  const visible = !store.demo && !!store.round;
  useLayoutEffect(() => {
    const element = panel.current, game = element?.closest<HTMLElement>(".game");
    if (!element || !game) return;
    const size = () => game.style.setProperty("--round-controls-height", `${element.getBoundingClientRect().height + 16}px`);
    size();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(size);
    observer?.observe(element);
    return () => { observer?.disconnect(); game.style.removeProperty("--round-controls-height"); };
  }, [visible]);
  if (!visible) return null;
  const round = store.round!;
  const stars = gameStars(round.progress, store.config.scenes.filter(s => round.route.includes(s.slug)));
  // On the map, an active round is continued by Go itself; a second "continue" stacked another 64px row above the map.
  const resume = !round.active || store.screen !== "map";
  return <section ref={panel} className="round-controls" aria-label={g.replay.roundTitle}>
    <div className="round-controls__copy">
      <strong>{tf(g.replay.roundStars, { earned: stars.found, total: stars.total })}</strong>
    </div>
    <div className="round-controls__actions">
      {resume ? <button type="button" className="fm-btn" onClick={store.resumeRound}>{g.replay.resumeRound}</button> : null}
      {round.active ? <button type="button" className="fm-btn fm-btn--secondary" onClick={store.pauseRound}>{g.replay.savedJourney}</button> : null}
      <button type="button" className="fm-btn fm-btn--ghost" onClick={() => store.startRound()}>{g.replay.startOver}</button>
    </div>
    {!store.roundSaved ? <p className="round-controls__issue" role="status">{g.replay.unsaved}</p> : null}
  </section>;
}
