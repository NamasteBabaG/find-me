"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import Link from "next/link";
import type { GameConfig } from "@/domain/game/config";
import type { AdventureProgress } from "@/domain/adventure/progress";
import { dirOf, getDict } from "@/i18n";
import { createPlayStore } from "../store/play-store";
import { GameI18nProvider, useGameText } from "../i18n";
import { GiftReveal } from "./GiftReveal";
import { gameWorlds } from "@/domain/game/config";
import { WorldMap } from "./WorldMap";
import { WorldHub } from "./WorldHub";
import { ScenePlayer } from "./ScenePlayer";
import { Passport } from "./Passport";
import { AdventurePassport, prefetchOwnerPassport } from "./AdventurePassport";
import { bindGameAudio } from "../audio/sounds";
import { searchProgress } from "@/domain/game/round";
import { gameStars } from "@/domain/game/progress";
import { isPassportBook } from "@/domain/passport/passport";
import { RoundControls } from "./RoundControls";
import { OwnerWorldSelector } from "./OwnerWorldSelector";
import type { GuestSnapshot } from "@/domain/guest-sharing";
import { friendSnapshotFromPlay } from "../engine/friend-progress";
import { useTurnTip } from "../engine/useTurnTip";

interface Props {
  /** A distinct friends grant, never an owner or ordinary PLAYER capability. */
  friend?: { shareId: string; participantId: string; onProgress: (snapshot: GuestSnapshot) => void; onBoardReady: (slug: string) => void };
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
  /** An owner route may enter a map of a historical multi-world game. */
  initialWorld?: string;
  /** Landing demo: one mission only, minimal chrome. */
  singleMission?: boolean;
  /** The page found the viewer to be the game's owner (from the session). The album is then also kept in the family account. */
  albumOwner?: boolean;
  /** The owner's album as the page read it from the account, so the first map already shows where the child is. */
  initialAlbum?: Pick<AdventureProgress, "finds" | "discoveries">;
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

function Shell({ config, demo = false, skipGift = false, readOnlyPreview = false, parentZoneHref, autoStartScene, initialWorld, singleMission = false, albumOwner = false, playToken, initialAlbum, friend }: Props) {
  const { g } = useGameText();
  const [store] = useState(() => createPlayStore(config, { demo, skipGift, readOnlyPreview, autoStartScene, singleMission, albumOwner: friend ? false : albumOwner, playToken: friend ? undefined : playToken, initialAlbum,
    ...(friend ? { storageScope: `friend:${friend.shareId}:${friend.participantId}`, friendParticipantId: friend.participantId, onBoardReady: friend.onBoardReady } : {}), copy: getDict(config.locale).game.copy }));
  const state = useStore(store);
  const scene = state.scene();
  // One world needs no hub: the map is the whole journey.
  const multiWorld = gameWorlds(config).length > 1;
  const turnTip = useTurnTip();
  const gameRef = useRef<HTMLDivElement>(null);
  const historyMounted = useRef(false);

  useEffect(() => { friend?.onProgress(friendSnapshotFromPlay(state)); }, [friend, state.progress, state.album, state.mission]);

  useEffect(() => gameRef.current ? bindGameAudio(gameRef.current) : undefined, []);

  // Saved progress lives in localStorage: read it only after mount so the first
  // client render matches the server (returning players then jump to the map).
  useEffect(() => {
    store.getState().hydrate();
    if (!autoStartScene && initialWorld && gameWorlds(config).some(world => world.slug === initialWorld)) {
      const hydrated = store.getState();
      if (hydrated.round?.active && hydrated.worldSlug !== initialWorld) hydrated.pauseRound();
      store.getState().goToMap(null, initialWorld);
    }
    return () => store.getState().stopAlbumSync();
  }, [store, config, initialWorld, autoStartScene]);

  useEffect(() => {
    const onUnload = () => state.telemetry.flush();
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, [state.telemetry]);

  // Browser history follows the game (per Guy, 2026-10-01: the flow between boards, the map and the passport felt
  // broken). A board or the passport is one step above the map, so the back button or a phone's back gesture
  // returns to the map instead of leaving the game; the game's own way back takes that step off again. Only one
  // step is ever kept, so "back" never walks through every board played. The landing demo keeps no history.
  useEffect(() => {
    if (demo || singleMission) return;
    const onPop = () => {
      const now = store.getState();
      if (!stepOf(window.history.state) && (now.screen === "scene" || now.screen === "passport")) now.goToMap();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [store, demo, singleMission]);

  useEffect(() => {
    if (demo || singleMission) return;
    // A refreshed scene entry now lands on the map. Replace its stale marker
    // instead of going back to a different page the player visited earlier.
    if (!historyMounted.current) {
      historyMounted.current = true;
      if (stepOf(window.history.state)) {
        const { [STEP_KEY]: _previousStep, ...rest } = window.history.state;
        window.history.replaceState(rest, "");
      }
      return;
    }
    const step = state.screen === "scene" || state.screen === "passport" ? state.screen : null;
    const top = stepOf(window.history.state);
    if (step && !top) window.history.pushState({ ...window.history.state, [STEP_KEY]: step }, "");
    else if (step && top !== step) window.history.replaceState({ ...window.history.state, [STEP_KEY]: step }, "");
    else if (!step && top) window.history.back();
  }, [state.screen, demo, singleMission]);

  // While the owner looks at the map, the passport book is fetched in the background, so opening it is instant.
  // Warm only the saved spread and its neighbour, including their decoded pictures.
  useEffect(() => {
    if (state.screen === "map" && state.albumMode === "owner") prefetchOwnerPassport(config.gameId).catch(() => undefined);
  }, [state.screen, state.albumMode, config.gameId]);

  const body = useMemo(() => {
    switch (state.screen) {
      case "gift":
        return <GiftReveal config={config} onOpen={state.reveal} />;
      case "scene":
        return scene && state.mission ? (
          <ScenePlayer key={`${scene.slug}:${state.visitId}`} scene={scene} mission={state.mission} store={state} onBack={state.goToMap} onSceneComplete={state.completeScene} />
        ) : null;
      case "passport":
        return isPassportBook(config.adventure) ? <AdventurePassport store={state} /> : <Passport config={config} progress={state.progress} onMap={state.goToMap} onOpen={state.openScene} onReplay={state.replayScene} album={state.album} albumMode={state.albumMode} albumState={state.albumState} />;
      case "worlds":
        return <><RoundControls store={state} /><WorldHub config={config} progress={searchProgress(state.round, state.progress)} roundRoute={state.round?.active ? state.round.route : undefined} currentWorld={state.worldSlug} onEnter={(slug) => state.goToMap(null, slug)} onPassport={state.openPassport} /></>;
      case "map":
      default:
        return (
          <>
            <RoundControls store={state} />
            <WorldMap
              config={config}
              world={state.world()}
              progress={searchProgress(state.round, state.progress)}
              roundRoute={state.round?.active ? state.round.route : undefined}
              onReplay={state.startRound}
              // Once something has been found, and only while there is no round: the strip shows a round instead.
              onStartOver={!state.round && !demo && !readOnlyPreview && gameStars(state.progress, config.scenes).found > 0 ? () => state.startRound() : undefined}
              onOpen={state.openScene}
              onPassport={state.openPassport}
              onWorlds={multiWorld ? state.goToWorlds : null}
              worldSelector={albumOwner && !friend && !demo && !readOnlyPreview ? <OwnerWorldSelector gameId={config.gameId} worldSlug={state.worldSlug ?? undefined} icon={state.world()?.completion.icon} onCurrentWorld={slug => {
                if (state.round?.active && state.worldSlug !== slug) state.pauseRound();
                state.goToMap(null, slug);
              }} /> : undefined}
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
  }, [state, scene, config, demo, parentZoneHref, g.parents, albumOwner, readOnlyPreview, multiWorld]);

  return (
    <div ref={gameRef} className={`game${demo ? " game--demo" : ""}`} dir={dirOf(config.locale)} lang={config.locale}>
      {turnTip && state.screen === "scene" ? <div className="game__tip">{g.turnTip}</div> : null}
      {body}
    </div>
  );
}

/** The history entry the game adds above the map, and which screen it stands for. */
const STEP_KEY = "findMeGameStep";
function stepOf(state: unknown): string | undefined {
  return state && typeof state === "object" && STEP_KEY in state ? String((state as Record<string, unknown>)[STEP_KEY]) : undefined;
}

