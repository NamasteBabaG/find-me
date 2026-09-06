"use client";

import type { GameConfig } from "@/domain/game/config";
import Image from "next/image";
import { useState } from "react";
import { sceneProgress, type GameProgress } from "@/domain/game/progress";
import { useGameText } from "../i18n";

function BoardThumbnail({ thumbnail, base }: { thumbnail: string; base: string }) {
  const [failed, setFailed] = useState<string[]>([]);
  const src = [thumbnail, base].find(url => !failed.includes(url));
  return src ? <Image src={src} alt="" fill sizes="(max-width: 600px) 100vw, (max-width: 960px) 50vw, 33vw" unoptimized onError={() => setFailed(previous => [...previous, src])} /> : null;
}

/** The adventure bag: actual places, with the saved completion of each board. */
export function Passport({ config, progress, onMap, onOpen }: { config: GameConfig; progress: GameProgress; onMap: () => void; onOpen: (slug: string) => void }) {
  const { g, tf } = useGameText();
  const done = config.scenes.filter(scene => sceneProgress(progress, scene.slug).completed).length;
  const total = config.scenes.length;
  const complete = total > 0 && done >= total;
  return (
    <div className="passport">
      <header className="passport__head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={config.child.avatarUrl} alt="" className="fm-sticker" width={80} height={80} />
        <div>
          <h1 className="passport__title">{tf(g.passport.title, { name: config.child.name })}</h1>
          <p className="map__sub">{complete ? g.passport.complete : tf(g.passport.progress, { done, total })}</p>
        </div>
      </header>
      <ul className="passport__grid" aria-label={g.passport.itemsAria}>
        {config.scenes.map((scene) => {
          const sp = sceneProgress(progress, scene.slug);
          return (
            <li key={scene.slug} className={`loot${sp.completed ? " loot--got" : ""}`}>
              <button type="button" className="loot__btn" onClick={() => onOpen(scene.slug)} aria-label={`${scene.name} — ${sp.completed ? g.passport.collected : g.passport.notYet}`}>
                <span className="loot__image">
                  <BoardThumbnail key={scene.art.thumbnail} thumbnail={scene.art.thumbnail} base={scene.art.base} />
                  {sp.completed ? <span className="loot__completed">{g.passport.collected}</span> : null}
                </span>
                <span className="loot__name">{scene.name}</span>
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
