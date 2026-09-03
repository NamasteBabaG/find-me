"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SceneConfig } from "@/domain/game/config";
import { currentTargetId, type MissionState } from "@/domain/game/mission";
import { shouldPulseHint } from "@/domain/game/hints";
import { slotFor } from "@/domain/game/replay";
import { sounds } from "../audio/sounds";
import { stageToScreen } from "../engine/viewport-math";
import { targetGeometry } from "../engine/target-geometry";
import type { ViewportApi } from "../engine/useViewport";
import { SceneViewport, targetStagePoint, type Hit } from "./SceneViewport";
import { MissionCard } from "./MissionCard";
import { CelebrationOverlay } from "./CelebrationOverlay";
import type { PlayStore } from "../store/play-store";
import { useGameText } from "../i18n";

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
  const { g, tf } = useGameText();
  const apiRef = useRef<ViewportApi | null>(null);
  // Bubbles live in stage pixels and are projected to the screen on every render
  // (see the SceneViewport render prop), so they stay glued to the sprite while
  // the "found" zoom plays.
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
      if (!target) return;
      const variant = mission.plan.variants[targetId] ?? "A";
      const p = targetStagePoint(scene, target, variant);
      setBubble({ text, x: p.x, y: p.y, key: Date.now() });
    };
    switch (fb.kind) {
      case "hit": {
        sounds().play("success");
        const target = scene.targets.find((t) => t.id === fb.targetId);
        if (target && api) {
          const variant = mission.plan.variants[fb.targetId] ?? "A";
          const { center } = targetGeometry(scene, target, variant);
          api.focusOn(center.x, center.y, Math.max(1.6, api.transform.scale / api.fit), 450);
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
        const t = setTimeout(() => setBubble(null), 2600);
        dispatch({ type: "CLEAR_FEEDBACK" });
        return () => clearTimeout(t);
      }
      case "miss":
        sounds().play("pop");
        dispatch({ type: "CLEAR_FEEDBACK" });
        return;
      case "bonus": {
        sounds().play("twinkle");
        if (scene.bonus) {
          const slot = mission.plan.bonusVariant === "A" ? scene.bonus.slots[0] : scene.bonus.slots[1];
          setBubble({ text: fb.bubble, x: slot.x * scene.art.width, y: slot.y * scene.art.height, key: Date.now() });
        }
        const t = setTimeout(() => setBubble(null), 1800);
        dispatch({ type: "CLEAR_FEEDBACK" });
        return () => clearTimeout(t);
      }
      case "ambient": {
        const a = scene.ambient.find((x) => x.id === fb.ambientId);
        if (a?.sound) sounds().play(a.sound);
        else sounds().play("tap");
        if (a?.reaction) {
          setBubble({ text: a.reaction, x: (a.x + a.w / 2) * scene.art.width, y: a.y * scene.art.height, key: Date.now() });
        }
        const t = setTimeout(() => setBubble(null), 1600);
        dispatch({ type: "CLEAR_FEEDBACK" });
        return () => clearTimeout(t);
      }
      case "hint":
        sounds().play("twinkle");
        if (fb.level === 3 && api) {
          const id = currentTargetId(mission);
          const target = id ? scene.targets.find((t) => t.id === id) : null;
          if (target) {
            const { hintZone } = targetGeometry(scene, target, mission.plan.variants[target.id] ?? "A");
            api.focusOn(hintZone.x, hintZone.y, 1.8, 600);
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
      sounds().unlock();
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
  const total = mission.plan.order.length;

  return (
    <div className="scene" style={{ ["--scene-sky" as string]: scene.art.palette.sky, ["--scene-accent" as string]: scene.art.palette.accent }}>
      <header className="scene__bar">
        {store.demo ? (
          <span />
        ) : (
          <button type="button" className="scene__btn" onClick={onBack} aria-label={g.scene.backToMap}>
            🗺️
          </button>
        )}
        {total > 1 ? (
          <div className="scene__title">
            <span className="scene__name">{scene.name}</span>
            <span className="scene__count">
              {Math.min(mission.currentIndex + 1, total)}/{total}
            </span>
          </div>
        ) : null}
        <div className="scene__tools">
          <button type="button" className="scene__btn" onClick={() => apiRef.current?.zoomBy(1.5)} aria-label={g.scene.zoomIn}>
            <ToolIcon name="zoom-in" />
          </button>
          <button type="button" className="scene__btn" onClick={() => apiRef.current?.zoomBy(1 / 1.5)} aria-label={g.scene.zoomOut}>
            <ToolIcon name="zoom-out" />
          </button>
          {store.demo ? null : (
            <>
              <button type="button" className="scene__btn" onClick={() => apiRef.current?.reset()} aria-label={g.scene.reset}>
                <ToolIcon name="fit" />
              </button>
              <button type="button" className="scene__btn" onClick={store.toggleMute} aria-label={store.muted ? g.scene.unmute : g.scene.mute}>
                <ToolIcon name={store.muted ? "sound-off" : "sound-on"} />
              </button>
            </>
          )}
        </div>
      </header>

      <div className="scene__stage">
        <SceneViewport scene={scene} mission={mission} hintLevel={mission.hintLevel} bonusFound={mission.bonusFound} onHit={onHit} onReady={onReady} ariaLabel={tf(g.scene.sceneAria, { name: scene.name })}>
          {(vp) => {
            if (!bubble) return null;
            const p = stageToScreen(vp.transform, bubble.x, bubble.y);
            return <SpeechBubble key={bubble.key} text={bubble.text} x={p.x} y={p.y} />;
          }}
        </SceneViewport>
        {burst ? <CelebrationOverlay key={burst.key} kind={scene.celebration.kind} small={burst.small} seed={burst.key} /> : null}
        {mission.phase === "intro" ? <div className="scene__intro-veil" aria-hidden /> : null}
      </div>

      {mission.phase !== "complete" ? (
        <MissionCard
          index={Math.min(mission.currentIndex + 1, total)}
          total={total}
          target={currentTarget}
          found={foundIds}
          order={mission.plan.order}
          hintLevel={mission.hintLevel}
          hintPulse={hintPulse}
          hintText={currentSlot?.hintText ?? null}
          onHint={() => dispatch({ type: "REQUEST_HINT" })}
          avatarUrl={store.config.child.avatarUrl}
          minimal={store.demo}
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
  const { g, tf } = useGameText();
  const next = store.nextScene();
  const allDone = next === null;
  return (
    <div className="complete" role="dialog" aria-label={g.complete.dialogAria}>
      <div className="complete__card">
        <div className="complete__stamp" aria-hidden>
          {g.complete.stamp}
        </div>
        <h2 className="complete__title">{store.demo ? tf(g.complete.demoFound, { name: store.config.child.name }) : scene.celebration.completeText}</h2>
        {store.demo ? null : (
        <div className="complete__loot">
          <span className="complete__icon" aria-hidden>
            {scene.collectible.icon}
          </span>
          <span>{tf(g.complete.loot, { item: scene.collectible.name })}</span>
          {hintsUsed === 0 ? <span className="fm-badge fm-badge--leaf">{g.complete.eagle}</span> : null}
          {bonusFound ? <span className="fm-badge fm-badge--sea">{g.complete.zik}</span> : null}
        </div>
        )}
        <div className="complete__actions">
          {store.demo ? (
            <a href="/create" className="fm-btn fm-btn--lg">
              {g.complete.demoCta}
            </a>
          ) : allDone ? (
            <button type="button" className="fm-btn fm-btn--lg" onClick={store.openPassport}>
              {g.complete.bag}
            </button>
          ) : (
            <button type="button" className="fm-btn fm-btn--lg" onClick={() => next && store.openScene(next)}>
              {g.complete.next}
              <span className="fm-btn__arrow" aria-hidden>
                ➜
              </span>
            </button>
          )}
          {/* In the demo the frame is short, so replay is a quiet second option. */}
          <button type="button" className={`fm-btn ${store.demo ? "fm-btn--ghost fm-btn--sm" : "fm-btn--secondary"}`} onClick={store.replayScene}>
            {g.complete.again}
          </button>
          {!store.demo ? (
            <button type="button" className="fm-btn fm-btn--ghost" onClick={() => store.goToMap(scene.slug)}>
              {g.complete.map}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Monochrome toolbar icons: emoji looked like leftovers on top of the artwork. */
function ToolIcon({ name }: { name: "zoom-in" | "zoom-out" | "fit" | "sound-on" | "sound-off" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className="scene__icon" viewBox="0 0 24 24" aria-hidden focusable="false">
      {name === "zoom-in" || name === "zoom-out" ? (
        <g {...common}>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.4 15.4 21 21" />
          <path d="M7.5 10.5h6" />
          {name === "zoom-in" ? <path d="M10.5 7.5v6" /> : null}
        </g>
      ) : null}
      {name === "fit" ? (
        <g {...common}>
          <path d="M4 9V4h5" />
          <path d="M20 9V4h-5" />
          <path d="M4 15v5h5" />
          <path d="M20 15v5h-5" />
        </g>
      ) : null}
      {name === "sound-on" || name === "sound-off" ? (
        <g {...common}>
          <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
          {name === "sound-on" ? <path d="M16 9.2a4 4 0 0 1 0 5.6M18.6 6.6a7.6 7.6 0 0 1 0 10.8" /> : <path d="m16.5 9.5 5 5m0-5-5 5" />}
        </g>
      ) : null}
    </svg>
  );
}
