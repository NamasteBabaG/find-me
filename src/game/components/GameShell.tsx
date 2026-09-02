"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import Link from "next/link";
import type { GameConfig } from "@/domain/game/config";
import { dirOf, getDict } from "@/i18n";
import { createPlayStore } from "../store/play-store";
import { GameI18nProvider, useGameText } from "../i18n";
import { GiftReveal } from "./GiftReveal";
import { WorldMap } from "./WorldMap";
import { ScenePlayer } from "./ScenePlayer";
import { Passport } from "./Passport";

interface Props {
  config: GameConfig;
  demo?: boolean;
  /** Owner/library preview: skip the gift wrap. */
  skipGift?: boolean;
  /** Adult-only link shown under the map (never inside the scene). */
  parentZoneHref?: string;
  /** Open this scene immediately (landing demo). */
  autoStartScene?: string;
}

/**
 * Screens: gift → map → scene → passport. The store owns the state; this
 * component only routes between screens and injects global chrome.
 * The game renders in its own locale (config.locale), with its own direction.
 */
export function GameShell(props: Props) {
  return (
    <GameI18nProvider locale={props.config.locale}>
      <Shell {...props} />
    </GameI18nProvider>
  );
}

function Shell({ config, demo = false, skipGift = false, parentZoneHref, autoStartScene }: Props) {
  const { g } = useGameText();
  const [store] = useState(() => createPlayStore(config, { demo, skipGift, autoStartScene, copy: getDict(config.locale).game.copy }));
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
                <Link href={parentZoneHref}>{g.parents}</Link>
              </p>
            ) : null}
          </>
        );
    }
  }, [state, scene, config, demo, parentZoneHref, g.parents]);

  return (
    <div className={`game${demo ? " game--demo" : ""}`} dir={dirOf(config.locale)} lang={config.locale}>
      {landscapeTip && state.screen === "scene" ? <div className="game__tip">{g.landscapeTip}</div> : null}
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
