"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SceneConfig } from "@/domain/game/config";
import { currentTargetId, missionCanAdvance, type MissionState } from "@/domain/game/mission";
import { gameStars } from "@/domain/game/progress";
import { shouldPulseHint } from "@/domain/game/hints";
import { slotFor } from "@/domain/game/replay";
import { sounds } from "../audio/sounds";
import { stageToScreen } from "../engine/viewport-math";
import { targetGeometry } from "../engine/target-geometry";
import type { ViewportApi } from "../engine/useViewport";
import { useScrollReveal } from "../engine/useScrollReveal";
import { SceneViewport, targetStagePoint, type Hit } from "./SceneViewport";
import { MissionCard } from "./MissionCard";
import { CelebrationOverlay } from "./CelebrationOverlay";
import { CloudBank } from "./Clouds";
import type { PlayStore } from "../store/play-store";
import { useGameText } from "../i18n";

/** How long the clouds take to part. Matches the CSS transition. */
const CURTAIN_MS = 900;

interface Props {
  scene: SceneConfig;
  mission: MissionState;
  store: PlayStore;
  onBack: () => void;
  onSceneComplete: () => void;
}

/** Long enough to read what she says. 1500 gave a reading child about a second. */
const FOUND_MS = 2200;
/**
 * The page-turn between two missions is the cloud curtain closing and opening
 * again. The swap to the next child happens while it is shut: the clouds take
 * TURN_CLOSE_MS to close (matches the CSS), the swap lands just after, and the
 * curtain is let go a beat later so the new child is never seen arriving.
 */
const TURN_CLOSE_MS = 560;
const TURN_HOLD_MS = 160;

/** One world: viewport + mission card + top bar + feedback choreography. */
export function ScenePlayer({ scene, mission, store, onBack, onSceneComplete }: Props) {
  const { g, tf } = useGameText();
  const apiRef = useRef<ViewportApi | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  // Bubbles live in stage pixels and are projected to the screen on every render
  // (see the SceneViewport render prop), so they stay glued to the sprite while
  // the "found" zoom plays.
  const [bubble, setBubble] = useState<{ text: string; x: number; y: number; key: number } | null>(null);
  const [burst, setBurst] = useState<{ key: number; small: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [showComplete, setShowComplete] = useState(false);
  const [staying, setStaying] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const free = mission.playMode === "find-any";
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

  // The curtain is drawn shut from the very first render and opens only when
  // the viewport has a size AND every picture has decoded. There is no frame,
  // not even the first, in which the world is visible without the child in it.
  const [viewportReady, setViewportReady] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const onReady = useCallback((api: ViewportApi) => {
    apiRef.current = api;
    setViewportReady(true);
  }, []);
  const onAssetsReady = useCallback(() => setAssetsReady(true), []);
  // Something the board cannot open without did not load: the picture, or the
  // child. A calm screen with one big button, no red, and the way back.
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const onAssetsFailed = useCallback(() => setLoadFailed(true), []);
  const retryLoad = () => {
    setLoadFailed(false);
    setRetryToken((n) => n + 1);
  };
  // The clouds close over the board while the found child is swapped for the
  // next one, so nobody sees the next hiding spot pop into the picture.
  const [turn, setTurn] = useState(false);
  const revealed = useScrollReveal(stageRef, store.demo, viewportReady && assetsReady);
  // The found choreography ends with the swap, and the swap must not depend on
  // the feedback that started it: it used to be scheduled inside the feedback
  // effect, and the moment FOUND_DONE cleared the feedback that effect's
  // cleanup cancelled the timer that would have ended the page-turn - the board
  // stayed under a white wash for the rest of the world. So the timer lives in
  // a ref, and only unmounting clears it.
  const foundTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bubbleSequence = useRef(0);
  useEffect(() => () => { clearTimeout(foundTimer.current); clearTimeout(bubbleTimer.current); }, []);
  useEffect(() => {
    if (!turn) return;
    const swap = setTimeout(() => {
      dispatch({ type: "FOUND_DONE", now: Date.now() });
      // show the whole world again for the next search
      apiRef.current?.reset();
    }, TURN_CLOSE_MS);
    const open = setTimeout(() => setTurn(false), TURN_CLOSE_MS + TURN_HOLD_MS);
    return () => {
      clearTimeout(swap);
      clearTimeout(open);
    };
  }, [turn, dispatch]);

  useEffect(() => {
    if (!revealed || mission.phase !== "intro") return;
    const api = apiRef.current;
    if (!api) return;
    const intro = scene.intro;
    // Let the clouds part before the camera starts moving, so the pan is seen.
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (intro) {
      api.focusOn(intro.from.x, intro.from.y, intro.from.zoom, 0);
      timers.push(setTimeout(() => api.focusOn(intro.to.x, intro.to.y, intro.to.zoom, intro.durationMs), CURTAIN_MS * 0.6));
      timers.push(setTimeout(() => dispatch({ type: "START", now: Date.now() }), CURTAIN_MS * 0.6 + intro.durationMs + 200));
    } else {
      timers.push(setTimeout(() => dispatch({ type: "START", now: Date.now() }), CURTAIN_MS));
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, scene.slug]);

  // React to reducer feedback: sounds, bubbles, particles, timers.
  const fb = mission.lastFeedback;
  useEffect(() => {
    if (!fb) return;
    clearTimeout(bubbleTimer.current);
    setBubble(null);
    setAnnouncement("");
    const api = apiRef.current;
    const placeBubble = (targetId: string, text: string) => {
      const target = scene.targets.find((t) => t.id === targetId);
      if (!target) return;
      const variant = mission.plan.variants[targetId] ?? "A";
      const p = targetStagePoint(scene, target, variant);
      setBubble({ text, x: p.x, y: p.y, key: ++bubbleSequence.current });
      setAnnouncement(text);
    };
    switch (fb.kind) {
      case "hit": {
        sounds().play("success");
        const target = scene.targets.find((t) => t.id === fb.targetId);
        // In find-any the next hide is already on the board. Keep the player's
        // search view: the legacy find zoom is undone by its cloud turn, but
        // find-any has no turn and would stay focused on an already-found child.
        if (!free && target && api) {
          const variant = mission.plan.variants[fb.targetId] ?? "A";
          const { center } = targetGeometry(scene, target, variant);
          api.focusOn(center.x, center.y, Math.max(1.6, api.transform.scale / api.fit), 450);
        }
        // Position immediately in stage space. Camera motion then moves this
        // same bubble; there is no delayed second instance after a new event.
        placeBubble(fb.targetId, fb.bubble);
        if (free) setAnnouncement(`${fb.bubble} ${g.scene.starEarned}`);
        setBurst({ key: Date.now(), small: true });
        // The last child of the board has nobody to be swapped for: the
        // celebration follows straight on, with no clouds in between.
        const last = Object.keys(mission.found).length >= mission.plan.order.length;
        clearTimeout(foundTimer.current);
        foundTimer.current = setTimeout(() => {
          setBubble(null);
          setAnnouncement("");
          if (last || free) dispatch({ type: "FOUND_DONE", now: Date.now() });
          else setTurn(true);
        }, FOUND_MS);
        return;
      }
      case "wrongTarget": {
        sounds().play("boing");
        placeBubble(fb.targetId, fb.bubble);
        bubbleTimer.current = setTimeout(() => { setBubble(null); setAnnouncement(""); }, 2600);
        dispatch({ type: "CLEAR_FEEDBACK" });
        return;
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
          setAnnouncement(fb.bubble);
        }
        bubbleTimer.current = setTimeout(() => { setBubble(null); setAnnouncement(""); }, 1800);
        dispatch({ type: "CLEAR_FEEDBACK" });
        return;
      }
      case "ambient": {
        const a = scene.ambient.find((x) => x.id === fb.ambientId);
        if (a?.sound) sounds().play(a.sound);
        else sounds().play("tap");
        if (a?.reaction) {
          setBubble({ text: a.reaction, x: (a.x + a.w / 2) * scene.art.width, y: a.y * scene.art.height, key: Date.now() });
          setAnnouncement(a.reaction);
        }
        bubbleTimer.current = setTimeout(() => { setBubble(null); setAnnouncement(""); }, 1600);
        dispatch({ type: "CLEAR_FEEDBACK" });
        return;
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
        case "found-target": {
          // This is acknowledgement, not another find: no reducer action,
          // persistence, telemetry, particles or extra star. Leave an active
          // success bubble/timer alone, but never silently swallow a later tap.
          if (!free || mission.phase !== "searching" || !mission.found[hit.id]) break;
          const target = scene.targets.find((item) => item.id === hit.id);
          if (!target) break;
          const p = targetStagePoint(scene, target, mission.plan.variants[hit.id] ?? "A");
          clearTimeout(bubbleTimer.current);
          setBubble({ text: g.copy.alreadyFound, x: p.x, y: p.y, key: ++bubbleSequence.current });
          setAnnouncement(g.copy.alreadyFound);
          sounds().play("tap");
          bubbleTimer.current = setTimeout(() => { setBubble(null); setAnnouncement(""); }, 2600);
          break;
        }
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
    [dispatch, free, mission, scene, g.copy.alreadyFound],
  );

  const currentId = currentTargetId(mission);
  const currentTarget = scene.targets.find((t) => t.id === currentId) ?? null;
  const currentSlot = currentId ? slotFor(scene, currentId, mission.plan.variants[currentId] ?? "A") : null;
  const elapsed = mission.phase === "searching" ? now - mission.missionStartedAt : 0;
  const hintPulse = mission.phase === "searching" && shouldPulseHint({ misses: mission.misses, elapsedMs: elapsed, hintLevel: mission.hintLevel });

  // The identity and saved counters stay visible; no timed collapsing HUD.
  const foundIds = Object.keys(mission.found);
  const total = mission.plan.order.length;
  const advanceAt = mission.findsRequiredToAdvance ?? total;
  const canAdvance = free && missionCanAdvance(mission);
  const advance = () => { const next = store.nextScene(); if (next) store.openScene(next); else store.openPassport(); };
  const stars = free ? gameStars(store.progress, store.worldScenes()) : undefined;

  return (
    <div className="scene" data-mission-phase={mission.phase} data-found-count={foundIds.length} style={{ ["--scene-sky" as string]: scene.art.palette.sky, ["--scene-accent" as string]: scene.art.palette.accent }}>
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
              {free ? foundIds.length : Math.min(mission.currentIndex + 1, total)}/{total}
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

      <div className="scene__stage" ref={stageRef}>
        <SceneViewport scene={scene} mission={mission} hintLevel={mission.hintLevel} bonusFound={mission.bonusFound} onHit={onHit} onReady={onReady} onAssetsReady={onAssetsReady} onAssetsFailed={onAssetsFailed} retryToken={retryToken} ariaLabel={tf(g.scene.sceneAria, { name: scene.name })}>
          {(vp) => {
            if (!bubble) return null;
            const p = stageToScreen(vp.transform, bubble.x, bubble.y);
            const half = Math.min(130, Math.max(48, (vp.viewport.width - 32) / 2));
            return <SpeechBubble key={bubble.key} text={bubble.text} x={Math.max(half + 8, Math.min(vp.viewport.width - half - 8, p.x))} y={Math.max(100, Math.min(vp.viewport.height - 12, p.y))} star={free && fb?.kind === "hit"} />;
          }}
        </SceneViewport>
        {burst ? <CelebrationOverlay key={burst.key} kind={scene.celebration.kind} small={burst.small} seed={burst.key} /> : null}
        {mission.phase === "intro" ? <div className="scene__intro-veil" aria-hidden /> : null}
        <div className={`scene__curtain${revealed && !turn && !loadFailed ? " is-open" : ""}`} aria-hidden>
          <CloudBank side="l" />
          <CloudBank side="r" />
        </div>
        {loadFailed ? (
          <div className="scene__retry" role="dialog" aria-modal="true" aria-labelledby="scene-retry-title">
            <div className="scene__retry-card">
              <span className="scene__retry-cloud" aria-hidden>
                ☁️
              </span>
              <h2 id="scene-retry-title" className="scene__retry-title">
                {g.scene.loadTitle}
              </h2>
              <button type="button" className="fm-btn fm-btn--lg" onClick={retryLoad} autoFocus>
                {g.scene.loadRetry}
              </button>
              <button type="button" className="fm-btn fm-btn--white" onClick={() => onBack()}>
                {g.scene.loadBack}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <span className="game__announcement" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
      {mission.phase !== "complete" || free ? (
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
          childName={store.config.child.name}
          quiet={false}
          minimal={store.demo}
          findAny={free}
          findsRequiredToAdvance={advanceAt}
          worldStars={stars}
          onAdvance={canAdvance ? advance : undefined}
        />
      ) : null}

      {canAdvance && foundIds.length === advanceAt && mission.phase === "searching" && !staying ? <section className="scene__advance" aria-label={g.scene.canContinue}>
        <p>{store.nextScene() ? g.scene.unlocked : g.scene.journeyFinished}</p>
        <button type="button" className="fm-btn fm-btn--sm" onClick={advance}>{g.scene.canContinue}</button>
        <button type="button" className="fm-btn fm-btn--secondary fm-btn--sm" onClick={() => setStaying(true)}>{g.scene.keepSearching}</button>
      </section> : null}

      {mission.phase === "complete" && showComplete ? (
        <SceneCompleteCard scene={scene} bonusFound={mission.bonusFound} hintsUsed={Object.values(mission.found).reduce((n, r) => n + r.hintsUsed, 0)} store={store} />
      ) : null}
    </div>
  );
}

function SpeechBubble({ text, x, y, star }: { text: string; x: number; y: number; star?: boolean }) {
  return (
    <div className="bubble" style={{ left: x, top: y }} aria-hidden>
      {star ? <span className="bubble__star">★ </span> : null}{text}
    </div>
  );
}

function SceneCompleteCard({ scene, bonusFound, hintsUsed, store }: { scene: SceneConfig; bonusFound: boolean; hintsUsed: number; store: PlayStore }) {
  const { g, tf } = useGameText();
  const next = store.nextScene();
  const allDone = next === null;
  return (
    <div className="complete" role="dialog" aria-modal="true" aria-label={g.complete.dialogAria} aria-labelledby="complete-title">
      <div className="complete__card">
        <div className="complete__stamp" aria-hidden>
          {g.complete.stamp}
        </div>
        <h2 id="complete-title" className="complete__title">{store.demo ? tf(g.complete.demoFound, { name: store.config.child.name }) : scene.celebration.completeText}</h2>
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
          ) : allDone && !store.gameDone() ? (
            // This journey is finished but the game is not: the next choice is
            // which world to go to, not which board.
            <button type="button" className="fm-btn fm-btn--lg" onClick={store.goToWorlds} autoFocus>
              {g.hub.back}
              <span className="fm-btn__arrow" aria-hidden>
                ➜
              </span>
            </button>
          ) : allDone ? (
            <button type="button" className="fm-btn fm-btn--lg" onClick={store.openPassport} autoFocus>
              {g.complete.bag}
            </button>
          ) : (
            <button type="button" className="fm-btn fm-btn--lg" onClick={() => next && store.openScene(next)} autoFocus>
              {g.complete.next}
              <span className="fm-btn__arrow" aria-hidden>
                ➜
              </span>
            </button>
          )}
          {/* In the demo the frame is short, so replay is a quiet second option. */}
          {scene.playMode !== "find-any" ? <button type="button" className={`fm-btn ${store.demo ? "fm-btn--ghost fm-btn--sm" : "fm-btn--secondary"}`} onClick={store.replayScene}>
            {g.complete.again}
          </button> : null}
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
