"use client";

import type { GameConfig } from "@/domain/game/config";
import { sceneProgress, completedScenes, type GameProgress } from "@/domain/game/progress";
import { useGameText } from "../i18n";

interface Props {
  config: GameConfig;
  progress: GameProgress;
  onOpen: (slug: string) => void;
  onPassport: () => void;
  demo?: boolean;
}

/** The game's home: one island per world, stamps for finished ones. */
export function WorldMap({ config, progress, onOpen, onPassport, demo }: Props) {
  const { g, tf } = useGameText();
  const done = completedScenes(progress);
  const total = config.scenes.length;
  const name = config.child.name;
  const firstOpen = config.scenes.find((s) => !sceneProgress(progress, s.slug).completed)?.slug;

  return (
    <div className="map">
      <header className="map__head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={config.child.avatarUrl} alt="" className="fm-sticker map__avatar" width={64} height={64} />
        <div>
          <h1 className="map__title">{tf(g.map.title, { name })}</h1>
          <p className="map__sub">{done === 0 ? tf(g.map.subStart, { name, count: total }) : done < total ? tf(g.map.subProgress, { done, total }) : g.map.subDone}</p>
        </div>
        {done > 0 ? (
          <button type="button" className="fm-btn fm-btn--secondary" onClick={onPassport}>
            {g.map.bag}
          </button>
        ) : null}
      </header>

      <ul className="map__islands" aria-label={g.map.worldsAria}>
        {config.scenes.map((scene, i) => {
          const sp = sceneProgress(progress, scene.slug);
          const highlight = scene.slug === firstOpen && done === 0;
          return (
            <li key={scene.slug} className={`island${sp.completed ? " island--done" : ""}${highlight ? " island--hint" : ""}`} style={{ ["--i" as string]: i }}>
              <button type="button" className="island__btn" onClick={() => onOpen(scene.slug)} aria-label={`${scene.name}${sp.completed ? ` — ${g.map.done}` : ""}`}>
                <span className="island__thumb" style={{ background: scene.art.palette.sky }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={scene.art.thumbnail} alt="" loading="lazy" />
                  {sp.completed ? (
                    <span className="island__stamp" aria-hidden>
                      {g.map.stamp}
                    </span>
                  ) : null}
                </span>
                <span className="island__name">{scene.name}</span>
                <span className="island__meta">{sp.completed ? `${scene.collectible.icon} ${sp.plays > 1 ? tf(g.map.played, { n: sp.plays }) : g.map.playAgain}` : g.map.spots}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {demo ? <p className="map__demo">{g.map.demoNote}</p> : null}
    </div>
  );
}
