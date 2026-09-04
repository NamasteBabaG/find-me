"use client";

import { useMemo } from "react";
import { gameWorlds, scenesOfWorld, type GameConfig } from "@/domain/game/config";
import { sceneProgress, type GameProgress } from "@/domain/game/progress";
import { useGameText } from "../i18n";

interface Props {
  config: GameConfig;
  progress: GameProgress;
  currentWorld: string;
  onEnter: (worldSlug: string) => void;
  onPassport: () => void;
}

/**
 * The hub: which journey to play next.
 *
 * A package can be one world or three, and each world is its own map, its own
 * nine places and its own keepsake. Without this screen a multi-world game had
 * nowhere to put the second one — every board was drawn on the first world's
 * map, the counter read "10 of 9", and finishing world one lit up world two's
 * destinations because progress was counted across the whole game.
 *
 * A one-world game never sees this: GameShell goes straight to the map.
 */
export function WorldHub({ config, progress, currentWorld, onEnter, onPassport }: Props) {
  const { g, tf } = useGameText();
  const worlds = useMemo(() => gameWorlds(config), [config]);

  const rows = worlds.map((world) => {
    const mine = scenesOfWorld(config, world.slug);
    const done = mine.filter((s) => sceneProgress(progress, s.slug).completed).length;
    return { world, done, total: mine.length || world.nodes.length };
  });
  const finished = rows.filter((r) => r.done === r.total && r.total > 0).length;

  return (
    <section className="hub" aria-labelledby="hub-title">
      <header className="hub__head">
        <h1 id="hub-title" className="hub__title">
          {tf(g.hub.title, { name: config.child.name })}
        </h1>
        <p className="hub__lead">{tf(g.hub.lead, { done: finished, total: rows.length })}</p>
      </header>

      <ul className="hub__list">
        {rows.map(({ world, done, total }) => (
          <li key={world.slug}>
            <button
              type="button"
              className={`hub__world${world.slug === currentWorld ? " is-current" : ""}${done === total ? " is-done" : ""}`}
              style={{ ["--hub-sky" as string]: world.map.palette.sky, ["--hub-ground" as string]: world.map.palette.ground }}
              onClick={() => onEnter(world.slug)}
            >
              <span className="hub__icon" aria-hidden>
                {world.collectible.icon}
              </span>
              <span className="hub__body">
                <span className="hub__name">{world.name}</span>
                <span className="hub__tagline">{world.tagline}</span>
                <span className="hub__count">{tf(g.map.subProgress, { done, total })}</span>
              </span>
              <span className="hub__go" aria-hidden>
                {done === total ? "✓" : "➜"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="hub__bag">
        <button type="button" className="fm-btn fm-btn--white" onClick={onPassport}>
          {g.map.bag}
        </button>
      </p>
    </section>
  );
}
