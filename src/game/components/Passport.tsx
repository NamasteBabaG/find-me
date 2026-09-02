"use client";

import type { GameConfig } from "@/domain/game/config";
import { sceneProgress, completedScenes, type GameProgress } from "@/domain/game/progress";

/** "תיק ההרפתקאות": every collectible earned so far. */
export function Passport({ config, progress, onMap, onOpen }: { config: GameConfig; progress: GameProgress; onMap: () => void; onOpen: (slug: string) => void }) {
  const done = completedScenes(progress);
  const total = config.scenes.length;
  const complete = done >= total;
  return (
    <div className="passport">
      <header className="passport__head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={config.child.avatarUrl} alt="" className="fm-sticker" width={80} height={80} />
        <div>
          <h1 className="passport__title">תיק ההרפתקאות של {config.child.name}</h1>
          <p className="map__sub">{complete ? "הכול נאסף! איזה כיף." : `${done} מתוך ${total} פריטים נאספו`}</p>
        </div>
      </header>
      <ul className="passport__grid" aria-label="פריטים שנאספו">
        {config.scenes.map((scene) => {
          const sp = sceneProgress(progress, scene.slug);
          return (
            <li key={scene.slug} className={`loot${sp.collectible ? " loot--got" : ""}`}>
              <button type="button" className="loot__btn" onClick={() => onOpen(scene.slug)} aria-label={`${scene.collectible.name} — ${sp.collectible ? "נאסף" : "עוד לא"}`}>
                <span className="loot__icon" aria-hidden>
                  {sp.collectible ? scene.collectible.icon : "❔"}
                </span>
                <span className="loot__name">{scene.collectible.name}</span>
                <span className="loot__world">{scene.name}</span>
                {sp.noHintClear ? <span className="fm-badge fm-badge--leaf">🦅</span> : null}
                {sp.bonusFound ? <span className="fm-badge fm-badge--sea">✨</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {complete ? (
        <div className="passport__done">
          <div className="complete__stamp complete__stamp--big" aria-hidden>
            מצאתי הכול!
          </div>
          <p className="fm-lead">כל המחבואים משתנים בכל משחק חוזר. רוצים לנסות שוב?</p>
        </div>
      ) : null}
      <div className="fm-row fm-row--center">
        <button type="button" className="fm-btn" onClick={onMap}>
          למפת העולמות
        </button>
      </div>
    </div>
  );
}
