"use client";

import type { PlayStore } from "../store/play-store";
import { gameStars } from "@/domain/game/progress";
import { useGameText } from "../i18n";
import { useLayoutEffect, useRef } from "react";

export function RoundControls({ store }: { store: PlayStore }) {
  const { g, tf } = useGameText();
  const panel = useRef<HTMLElement>(null);
  const earned = gameStars(store.progress, store.config.scenes);
  const visible = !store.demo && !!(earned.found || store.round);
  useLayoutEffect(() => {
    const element = panel.current, game = element?.closest<HTMLElement>(".game");
    if (!element || !game) return;
    const size = () => game.style.setProperty("--round-controls-height", `${element.getBoundingClientRect().height + 16}px`);
    size();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(size);
    observer?.observe(element);
    return () => { observer?.disconnect(); game.style.removeProperty("--round-controls-height"); };
  }, [visible]);
  if (store.demo || (!earned.found && !store.round)) return null;
  const active = store.round?.active;
  const stars = store.round ? gameStars(store.round.progress, store.config.scenes.filter(s => store.round!.route.includes(s.slug))) : null;
  return <section ref={panel} className="round-controls" aria-label={g.replay.roundTitle}>
    <div className="round-controls__copy">
      <strong>{active ? g.replay.roundTitle : g.replay.savedTitle}</strong>
      <span>{active && stars ? tf(g.stars.tray, { earned: stars.found, total: stars.total }) : g.replay.note}</span>
    </div>
    <div className="round-controls__actions">
      {store.round ? <button type="button" className="fm-btn fm-btn--sm" onClick={store.resumeRound}>{g.replay.resumeRound}</button> : null}
      {active ? <button type="button" className="fm-btn fm-btn--secondary fm-btn--sm" onClick={store.pauseRound}>{g.replay.savedJourney}</button> : null}
      <button type="button" className={`fm-btn fm-btn--sm ${store.round ? "fm-btn--ghost" : "fm-btn--secondary"}`} onClick={() => store.startRound()}>{g.replay.startOver}</button>
    </div>
    {store.round && !store.roundSaved ? <p className="round-controls__issue" role="status">{g.replay.unsaved}</p> : null}
  </section>;
}
