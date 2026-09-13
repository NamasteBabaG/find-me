"use client";

import type { GameConfig } from "@/domain/game/config";
import Image from "next/image";
import { useState } from "react";
import { gameStars, sceneFoundIds, sceneIsComplete, sceneIsPlayable, type GameProgress } from "@/domain/game/progress";
import { useGameText } from "../i18n";
import { StarCounter } from "./StarCounter";
import { StarTray } from "./StarTray";

function BoardThumbnail({ thumbnail, base }: { thumbnail: string; base: string }) {
  const [failed, setFailed] = useState<string[]>([]);
  const src = [thumbnail, base].find(url => !failed.includes(url));
  return src ? <Image src={src} alt="" fill sizes="(max-width: 600px) 100vw, (max-width: 960px) 50vw, 33vw" unoptimized onError={() => setFailed(previous => [...previous, src])} /> : null;
}

/** The adventure bag: actual places, with the saved completion of each board and the gold stars it holds. */
export function Passport({ config, progress, onMap, onOpen }: { config: GameConfig; progress: GameProgress; onMap: () => void; onOpen: (slug: string) => void }) {
  const { g, tf } = useGameText();
  const done = config.scenes.filter(scene => sceneIsComplete(progress, scene)).length;
  // Every gold star in the game, and how far the jar has filled.
  const stars = gameStars(progress, config.scenes);
  const filled = stars.total > 0 ? Math.round((stars.found / stars.total) * 100) : 0;
  const total = config.scenes.length;
  const complete = total > 0 && done >= total;
  return (
    <div className="passport">
      <header className="passport__head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={config.child.avatarUrl} alt="" className="fm-sticker" width={80} height={80} />
        <div className="passport__who">
          <h1 className="passport__title">{tf(g.passport.title, { name: config.child.name })}</h1>
          <p className="map__sub">{complete ? g.passport.complete : tf(g.passport.progress, { done, total })}</p>
        </div>
        <div className="passport__stars">
          <StarCounter earned={stars.found} total={stars.total} size="lg" label={tf(g.stars.counter, { earned: stars.found, total: stars.total })} />
          <div className="starmeter" aria-hidden>
            <span className={`starmeter__fill${stars.found >= stars.total && stars.total > 0 ? " is-full" : ""}`} style={{ width: `${filled}%` }} />
          </div>
        </div>
      </header>
      <ul className="passport__grid" aria-label={g.passport.itemsAria}>
        {config.scenes.map((scene) => {
          const isComplete = sceneIsComplete(progress, scene);
          const count = sceneFoundIds(progress, scene).length;
          const playable = sceneIsPlayable(progress, config, scene);
          return (
            <li key={scene.slug} className={`loot${isComplete ? " loot--got" : ""}`}>
              {/* The name says completed or not, and how many stars a five-hide board holds; the stars themselves stay decoration. */}
              <button type="button" className="loot__btn" disabled={!playable} onClick={() => onOpen(scene.slug)} aria-label={`${scene.name} — ${isComplete ? g.passport.collected : g.passport.notYet}${scene.playMode === "find-any" ? ` — ${count}/${scene.targets.length}` : ""}`}>
                <span className="loot__image">
                  <BoardThumbnail key={scene.art.thumbnail} thumbnail={scene.art.thumbnail} base={scene.art.base} />
                  {isComplete ? <span className="loot__completed">{g.passport.collected}</span> : null}
                </span>
                <span className="loot__foot">
                  <span className="loot__name">{scene.name}</span>
                  <StarTray lit={count} total={scene.targets.length} size="sm" className="loot__stars" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {complete ? (
        <div className="passport__done">
          <div className="complete__stamp complete__stamp--big" aria-hidden>
            {g.passport.allStamp}
          </div>
          <p className="passport__allstars">
            <StarTray lit={3} total={3} size="md" celebrate />
            {g.passport.allStars}
          </p>
          <p className="fm-lead">{g.passport.replayLead}</p>
        </div>
      ) : null}
      <div className="fm-row fm-row--center">
        <button type="button" className="fm-btn" onClick={onMap}>
          {g.passport.map}
        </button>
      </div>
    </div>
  );
}
