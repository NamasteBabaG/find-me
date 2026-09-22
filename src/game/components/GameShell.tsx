"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import Link from "next/link";
import type { GameConfig } from "@/domain/game/config";
import { dirOf, getDict } from "@/i18n";
import { createPlayStore } from "../store/play-store";
import { GameI18nProvider, useGameText } from "../i18n";
import { GiftReveal } from "./GiftReveal";
import { gameWorlds } from "@/domain/game/config";
import { WorldMap } from "./WorldMap";
import { WorldHub } from "./WorldHub";
import { ScenePlayer } from "./ScenePlayer";
import { Passport } from "./Passport";
import { AdventurePassport } from "./AdventurePassport";
import { bindGameAudio } from "../audio/sounds";

interface Props {
  playToken?: string;
  config: GameConfig;
  demo?: boolean;
  /** Owner/library preview: skip the gift wrap. */
  skipGift?: boolean;
  /** Private partial QA: normal navigation, but no persisted play/progress. */
  readOnlyPreview?: boolean;
  /** Adult-only link shown under the map (never inside the scene). */
  parentZoneHref?: string;
  /** Open this scene immediately (landing demo). */
  autoStartScene?: string;
  /** Landing demo: one mission only, minimal chrome. */
  singleMission?: boolean;
  /** The page found the viewer to be the game's owner (from the session). The album is then also kept in the family account. */
  albumOwner?: boolean;
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

function Shell({ config, demo = false, skipGift = false, readOnlyPreview = false, parentZoneHref, autoStartScene, singleMission = false, albumOwner = false, playToken }: Props) {
  const { g } = useGameText();
  const [store] = useState(() => createPlayStore(config, { demo, skipGift, readOnlyPreview, autoStartScene, singleMission, albumOwner, playToken, copy: getDict(config.locale).game.copy }));
  const state = useStore(store);
  const scene = state.scene();
  // One world needs no hub: the map is the whole journey.
  const multiWorld = gameWorlds(config).length > 1;
  const landscapeTip = useLandscapeTip();
  const gameRef = useRef<HTMLDivElement>(null);

  useEffect(() => gameRef.current ? bindGameAudio(gameRef.current) : undefined, []);

  // Saved progress lives in localStorage: read it only after mount so the first
  // client render matches the server (returning players then jump to the map).
  useEffect(() => {
    store.getState().hydrate();
    return () => store.getState().stopAlbumSync();
  }, [store]);

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
          <ScenePlayer key={`${scene.slug}:${state.visitId}`} scene={scene} mission={state.mission} store={state} onBack={state.goToMap} onSceneComplete={state.completeScene} />
        ) : null;
      case "passport":
        return config.adventure?.boards.every(b => b.targetIds.length === 3 && b.discoveries.length === 6) ? <AdventurePassport store={state} /> : <Passport config={config} progress={state.progress} onMap={state.goToMap} onOpen={state.openScene} onReplay={state.replayScene} album={state.album} albumMode={state.albumMode} albumState={state.albumState} />;
      case "worlds":
        return <WorldHub config={config} progress={state.progress} currentWorld={state.worldSlug} onEnter={(slug) => state.goToMap(null, slug)} onPassport={state.openPassport} />;
      case "map":
      default:
        return (
          <>
            <WorldMap
              config={config}
              world={state.world()}
              progress={state.progress}
              onOpen={state.openScene}
              onPassport={state.openPassport}
              onWorlds={multiWorld ? state.goToWorlds : null}
              demo={demo}
              travelFrom={state.travelFrom}
              onTravelDone={state.endTravel}
            />
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
    <div ref={gameRef} className={`game${demo ? " game--demo" : ""}`} dir={dirOf(config.locale)} lang={config.locale}>
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
