"use client";

import type { GameConfig } from "@/domain/game/config";
import { sceneProgress, completedScenes, type GameProgress } from "@/domain/game/progress";

interface Props {
  config: GameConfig;
  progress: GameProgress;
  onOpen: (slug: string) => void;
  onPassport: () => void;
  demo?: boolean;
}

/** The game's home: one island per world, stamps for finished ones. */
export function WorldMap({ config, progress, onOpen, onPassport, demo }: Props) {
  const done = completedScenes(progress);
  const total = config.scenes.length;
  const firstOpen = config.scenes.find((s) => !sceneProgress(progress, s.slug).completed)?.slug;

  return (
    <div className="map">
      <header className="map__head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={config.child.avatarUrl} alt="" className="fm-sticker map__avatar" width={64} height={64} />
        <div>
          <h1 className="map__title">איפה {config.child.name}?</h1>
          <p className="map__sub">
            {done === 0 ? `${config.child.name} מתחבא/ת ב־${total} עולמות. בחרו עולם!` : done < total ? `${done} מתוך ${total} עולמות הושלמו` : "כל העולמות הושלמו! 🎉"}
          </p>
        </div>
        {done > 0 ? (
          <button type="button" className="fm-btn fm-btn--secondary" onClick={onPassport}>
            🎒 תיק ההרפתקאות
          </button>
        ) : null}
      </header>

      <ul className="map__islands" aria-label="עולמות">
        {config.scenes.map((scene, i) => {
          const sp = sceneProgress(progress, scene.slug);
          const highlight = scene.slug === firstOpen && done === 0;
          return (
            <li key={scene.slug} className={`island${sp.completed ? " island--done" : ""}${highlight ? " island--hint" : ""}`} style={{ ["--i" as string]: i }}>
              <button type="button" className="island__btn" onClick={() => onOpen(scene.slug)} aria-label={`${scene.name}${sp.completed ? " — הושלם" : ""}`}>
                <span className="island__thumb" style={{ background: scene.art.palette.sky }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={scene.art.thumbnail} alt="" loading="lazy" />
                  {sp.completed ? (
                    <span className="island__stamp" aria-hidden>
                      מצאתי!
                    </span>
                  ) : null}
                </span>
                <span className="island__name">{scene.name}</span>
                <span className="island__meta">{sp.completed ? `${scene.collectible.icon} ${sp.plays > 1 ? `שוחק ${sp.plays} פעמים` : "לשחק שוב?"}` : "3 מחבואים"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {demo ? <p className="map__demo">זו הדגמה עם ילדה מאוירת. במשחק אמיתי הילד שלכם מתחבא כאן.</p> : null}
    </div>
  );
}
