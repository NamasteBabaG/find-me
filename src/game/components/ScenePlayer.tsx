"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SceneConfig } from "@/domain/game/config";
import { currentTargetId, type MissionState } from "@/domain/game/mission";
import { shouldPulseHint } from "@/domain/game/hints";
import { slotFor } from "@/domain/game/replay";
import { sounds } from "../audio/sounds";
import { stageToScreen } from "../engine/viewport-math";
import type { ViewportApi } from "../engine/useViewport";
import { SceneViewport, targetScreenPoint, type Hit } from "./SceneViewport";
import { MissionCard } from "./MissionCard";
import { CelebrationOverlay } from "./CelebrationOverlay";
import type { PlayStore } from "../store/play-store";

interface Props {
  scene: SceneConfig;
  mission: MissionState;
  store: PlayStore;
  onBack: () => void;
  onSceneComplete: () => void;
}

const FOUND_MS = 1500;

/** One world: viewport + mission card + top bar + feedback choreography. */
export function ScenePlayer({ scene, mission, store, onBack, onSceneComplete }: Props) {
  const apiRef = useRef<ViewportApi | null>(null);
  const [bubble, setBubble] = useState<{ text: string; x: number; y: number; key: number } | null>(null);
  const [burst, setBurst] = useState<{ key: number; small: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [showComplete, setShowComplete] = useState(false);
  const dispatch = store.dispatch;

  // idle clock for the hint pulse (one tick per second is plenty)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // pause ambient sound when the tab is hidden
  useEffect(() => {
    const onVis = () => (document.hidden ? sounds().suspend() : sounds().resume());
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const onReady = useCallback(
    (api: ViewportApi) => {
      apiRef.current = api;
      if (mission.phase !== "intro") return;
      const intro = scene.intro;
      if (intro) {
        api.focusOn(intro.from.x, intro.from.y, intro.from.zoom, 0);
        setTimeout(() => api.focusOn(intro.to.x, intro.to.y, intro.to.zoom, intro.durationMs), 60);
        setTimeout(() => dispatch({ type: "START", now: Date.now() }), intro.durationMs + 200);
      } else {
        dispatch({ type: "START", now: Date.now() });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene.slug],
  );

  // React to reducer feedback: sounds, bubbles, particles, timers.
  const fb = mission.lastFeedback;
  useEffect(() => {
    if (!fb) return;
    const api = apiRef.current;
    const placeBubble = (targetId: string, text: string) => {
      const target = scene.targets.find((t) => t.id === targetId);
      if (!target || !api) return;
      const variant = mission.plan.variants[targetId] ?? "A";
      const p = targetScreenPoint(api, scene, target, variant);
      setBubble({ text, x: p.x, y: p.y, key: Date.now() });
    };
    switch (fb.kind) {
      case "hit": {
        sounds().play("success");
        const target = scene.targets.find((t) => t.id === fb.targetId);
        if (target && api) {
          const variant = mission.plan.variants[fb.targetId] ?? "A";
          const slot = slotFor(scene, fb.targetId, variant);
          api.focusOn(slot.x, slot.y, Math.max(1.6, api.transform.scale / api.fit), 450);
          setTimeout(() => placeBubble(fb.targetId, fb.bubble), 460);
        }
        setBurst({ key: Date.now(), small: true });
        const t = setTimeout(() => {
          setBubble(null);
          dispatch({ type: "FOUND_DONE", now: Date.now() });
          // show the whole world again for the next search
          apiRef.current?.reset();
        }, FOUND_MS);
        return () => clearTimeout(t);
      }
      case "wrongTarget": {
        sounds().play("boing");
        placeBubble(fb.targetId, fb.bubble);
        const t = setTimeout(() => setBubble(null), 1800);
        dispatch({ type: "CLEAR_FEEDBACK" });
        return () => clearTimeout(t);
      }
      case "miss":
        sounds().play("pop");
        dispatch({ type: "CLEAR_FEEDBACK" });
        return;
      case "bonus": {
        sounds().play("twinkle");
        if (scene.bonus && api) {
          const slot = mission.plan.bonusVariant === "A" ? scene.bonus.slots[0] : scene.bonus.slots[1];
          const p = targetScreenPoint(api, scene, { ...scene.targets[0]!, slots: [slot, slot] }, "A");
          setBubble({ text: fb.bubble, x: p.x, y: p.y, key: Date.now() });
        }
        const t = setTimeout(() => setBubble(null), 1800);
        dispatch({ type: "CLEAR_FEEDBACK" });
        return () => clearTimeout(t);
      }
      case "ambient": {
        const a = scene.ambient.find((x) => x.id === fb.ambientId);
        if (a?.sound) sounds().play(a.sound);
        else sounds().play("tap");
        if (a?.reaction && api) {
          const p = stageToScreen(api.transform, (a.x + a.w / 2) * scene.art.width, a.y * scene.art.height);
          setBubble({ text: a.reaction, x: p.x, y: p.y, key: Date.now() });
        }
        const t = setTimeout(() => setBubble(null), 1600);
        dispatch({ type: "CLEAR_FEEDBACK" });
        return () => clearTimeout(t);
      }
      case "hint":
        sounds().play("twinkle");
        if (fb.level === 3 && api) {
          const id = currentTargetId(mission);
          if (id) {
            const slot = slotFor(scene, id, mission.plan.variants[id] ?? "A");
            api.focusOn(slot.hintZone.x, slot.hintZone.y, 1.8, 600);
          }
        }
        dispatch({ type: "CLEAR_FEEDBACK" });
        return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fb]);

  // Scene complete → big celebration, then the card.
  useEffect(() => {
    if (mission.phase !== "complete") return;
    sounds().play("fanfare");
    setBurst({ key: Date.now(), small: false });
    const t = setTimeout(() => setShowComplete(true), 900);
    onSceneComplete();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission.phase]);

  const onHit = useCallback(
    (hit: Hit) => {
      switch (hit.kind) {
        case "target":
          dispatch({ type: "TAP_TARGET", targetId: hit.id, now: Date.now() });
          break;
        case "bonus":
          dispatch({ type: "TAP_BONUS" });
          break;
        case "ambient":
          dispatch({ type: "TAP_AMBIENT", ambientId: hit.id });
          break;
        case "miss":
          dispatch({ type: "TAP_MISS", x: hit.x, y: hit.y });
          break;
      }
    },
    [dispatch],
  );

  const currentId = currentTargetId(mission);
  const currentTarget = scene.targets.find((t) => t.id === currentId) ?? null;
  const currentSlot = currentId ? slotFor(scene, currentId, mission.plan.variants[currentId] ?? "A") : null;
  const elapsed = mission.phase === "searching" ? now - mission.missionStartedAt : 0;
  const hintPulse = mission.phase === "searching" && shouldPulseHint({ misses: mission.misses, elapsedMs: elapsed, hintLevel: mission.hintLevel });
  const foundIds = Object.keys(mission.found);

  return (
    <div className="scene" style={{ ["--scene-sky" as string]: scene.art.palette.sky, ["--scene-accent" as string]: scene.art.palette.accent }}>
      <header className="scene__bar">
        <button type="button" className="fm-btn fm-btn--secondary fm-btn--kid" onClick={onBack} aria-label="חזרה למפה">
          🗺️
        </button>
        <div className="scene__title">
          <span className="scene__name">{scene.name}</span>
          <span className="scene__count">
            {Math.min(mission.currentIndex + 1, 3)}/3
          </span>
        </div>
        <div className="scene__tools">
          <button type="button" className="fm-btn fm-btn--secondary fm-btn--kid" onClick={() => apiRef.current?.zoomBy(1.5)} aria-label="הגדלה">
            ＋
          </button>
          <button type="button" className="fm-btn fm-btn--secondary fm-btn--kid" onClick={() => apiRef.current?.reset()} aria-label="להראות את כל העולם">
            ⤢
          </button>
          <button type="button" className="fm-btn fm-btn--secondary fm-btn--kid" onClick={store.toggleMute} aria-label={store.muted ? "הפעלת צליל" : "השתקה"}>
            {store.muted ? "🔇" : "🔊"}
          </button>
        </div>
      </header>

      <div className="scene__stage">
        <SceneViewport scene={scene} mission={mission} hintLevel={mission.hintLevel} bonusFound={mission.bonusFound} onHit={onHit} onReady={onReady}>
          {() => (bubble ? <SpeechBubble key={bubble.key} text={bubble.text} x={bubble.x} y={bubble.y} /> : null)}
        </SceneViewport>
        {burst ? <CelebrationOverlay key={burst.key} kind={scene.celebration.kind} small={burst.small} seed={burst.key} /> : null}
        {mission.phase === "intro" ? <div className="scene__intro-veil" aria-hidden /> : null}
      </div>

      {mission.phase !== "complete" ? (
        <MissionCard
          index={Math.min(mission.currentIndex + 1, 3)}
          total={3}
          target={currentTarget}
          found={foundIds}
          order={mission.plan.order}
          hintLevel={mission.hintLevel}
          hintPulse={hintPulse}
          hintText={currentSlot?.hintText ?? null}
          onHint={() => dispatch({ type: "REQUEST_HINT" })}
        />
      ) : null}

      {mission.phase === "complete" && showComplete ? (
        <SceneCompleteCard scene={scene} bonusFound={mission.bonusFound} hintsUsed={Object.values(mission.found).reduce((n, r) => n + r.hintsUsed, 0)} store={store} />
      ) : null}
    </div>
  );
}

function SpeechBubble({ text, x, y }: { text: string; x: number; y: number }) {
  return (
    <div className="bubble" style={{ left: x, top: y }} role="status">
      {text}
    </div>
  );
}

function SceneCompleteCard({ scene, bonusFound, hintsUsed, store }: { scene: SceneConfig; bonusFound: boolean; hintsUsed: number; store: PlayStore }) {
  const next = store.nextScene();
  const allDone = next === null;
  return (
    <div className="complete" role="dialog" aria-label="סיום עולם">
      <div className="complete__card">
        <div className="complete__stamp" aria-hidden>
          מצאתי!
        </div>
        <h2 className="complete__title">{scene.celebration.completeText}</h2>
        <div className="complete__loot">
          <span className="complete__icon" aria-hidden>
            {scene.collectible.icon}
          </span>
          <span>
            קיבלתם: <strong>{scene.collectible.name}</strong>
          </span>
          {hintsUsed === 0 ? <span className="fm-badge fm-badge--leaf">🦅 עיני נץ — בלי רמזים!</span> : null}
          {bonusFound ? <span className="fm-badge fm-badge--sea">✨ מצאתם גם את זיק</span> : null}
        </div>
        <div className="complete__actions">
          {allDone ? (
            <button type="button" className="fm-btn fm-btn--lg" onClick={store.openPassport}>
              לתיק ההרפתקאות 🎒
            </button>
          ) : (
            <button type="button" className="fm-btn fm-btn--lg" onClick={() => next && store.openScene(next)}>
              לעולם הבא ➜
            </button>
          )}
          <button type="button" className="fm-btn fm-btn--secondary" onClick={store.replayScene}>
            לשחק שוב (המחבואים משתנים!)
          </button>
          <button type="button" className="fm-btn fm-btn--ghost" onClick={store.goToMap}>
            למפה
          </button>
        </div>
      </div>
    </div>
  );
}
