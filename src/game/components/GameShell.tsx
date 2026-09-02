"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import type { GameConfig } from "@/domain/game/config";
import { createPlayStore } from "../store/play-store";
import { GiftReveal } from "./GiftReveal";
import { WorldMap } from "./WorldMap";
import { ScenePlayer } from "./ScenePlayer";
import { Passport } from "./Passport";
import Link from "next/link";

interface Props {
  config: GameConfig;
  demo?: boolean;
  /** Owner/library preview: skip the gift wrap. */
  skipGift?: boolean;
  /** Adult-only link shown under the map (never inside the scene). */
  parentZoneHref?: string;
}

/**
 * Screens: gift → map → scene → passport. The store owns the state; this
 * component only routes between screens and injects global chrome.
 */
export function GameShell({ config, demo = false, skipGift = false, parentZoneHref }: Props) {
  const [store] = useState(() => createPlayStore(config, { demo, skipGift }));
  const state = useStore(store);
  const scene = state.scene();
  const landscapeTip = useLandscapeTip();

  useEffect(() => {
    const onUnload = () => state.telemetry.flush();
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [state.telemetry]);

  const body = useMemo(() => {
    switch (state.screen) {
      case "gift":
        return <GiftReveal config={config} onOpen={state.reveal} />;
      case "scene":
        return scene && state.mission ? (
          <ScenePlayer key={`${scene.slug}:${state.mission.plan.playIndex}`} scene={scene} mission={state.mission} store={state} onBack={state.goToMap} onSceneComplete={state.completeScene} />
        ) : null;
      case "passport":
        return <Passport config={config} progress={state.progress} onMap={state.goToMap} onOpen={state.openScene} />;
      case "map":
      default:
        return (
          <>
            <WorldMap config={config} progress={state.progress} onOpen={state.openScene} onPassport={state.openPassport} demo={demo} />
            {parentZoneHref ? (
              <p className="game__parents">
                <Link href={parentZoneHref}>לאזור ההורים</Link>
              </p>
            ) : null}
          </>
        );
    }
  }, [state, scene, config, demo, parentZoneHref]);

  return (
    <div className={`game${demo ? " game--demo" : ""}`} dir="rtl">
      {landscapeTip && state.screen === "scene" ? <div className="game__tip">המשחק הכי כיף כשהטלפון לרוחב 📱↔️</div> : null}
      {body}
    </div>
  );
}

function useLandscapeTip(): boolean {
  const [tip, setTip] = useState(false);
  useEffect(() => {
    const check = () => setTip(window.innerWidth < 700 && window.innerHeight > window.innerWidth);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return tip;
}
