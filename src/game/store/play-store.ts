"use client";

import { create } from "zustand";
import type { GameConfig, SceneConfig } from "@/domain/game/config";
import { createMissionState, missionReducer, sceneSummary, type MissionAction, type MissionCopy, type MissionState } from "@/domain/game/mission";
import { planScenePlay } from "@/domain/game/replay";
import { collectibles, completedScenes, recordSceneCompleted, sceneProgress, type GameProgress } from "@/domain/game/progress";
import { loadProgress, saveProgress } from "../engine/progress-storage";
import { Telemetry } from "../engine/telemetry";
import { sounds } from "../audio/sounds";

export type Screen = "gift" | "map" | "scene" | "passport";

/** Language-specific strings the pure reducer needs (see MissionCopy). */
export interface ReducerCopy {
  wrongTarget: string;
  wrongTargetNoItem: string;
  bonus: string;
  fallbackSuccess: string;
}

export interface PlayStore {
  config: GameConfig;
  progress: GameProgress;
  screen: Screen;
  sceneSlug: string | null;
  mission: MissionState | null;
  muted: boolean;
  demo: boolean;
  telemetry: Telemetry;

  scene(): SceneConfig | null;
  reveal(): void;
  goToMap(): void;
  openScene(slug: string): void;
  dispatch(action: MissionAction): void;
  completeScene(): void;
  replayScene(): void;
  nextScene(): string | null;
  openPassport(): void;
  toggleMute(): void;
}

function missionCopy(scene: SceneConfig, copy: ReducerCopy): MissionCopy {
  return {
    successByTarget: Object.fromEntries(scene.targets.map((t) => [t.id, t.success])),
    itemByTarget: Object.fromEntries(scene.targets.map((t) => [t.id, t.item])),
    ...copy,
  };
}

export interface PlayStoreOptions {
  demo?: boolean;
  skipGift?: boolean;
  autoStartScene?: string;
  copy: ReducerCopy;
}

export function createPlayStore(config: GameConfig, opts: PlayStoreOptions) {
  const demo = Boolean(opts.demo);
  const initialProgress = demo ? { v: 1 as const, gameId: config.gameId, revealed: true, scenes: {} } : loadProgress(config.gameId);
  const telemetry = new Telemetry(config.gameId, !demo);

  const store = create<PlayStore>((set, get) => ({
    config,
    progress: initialProgress,
    screen: demo || opts.skipGift || initialProgress.revealed ? "map" : "gift",
    sceneSlug: null,
    mission: null,
    muted: false,
    demo,
    telemetry,

    scene() {
      const slug = get().sceneSlug;
      return slug ? (get().config.scenes.find((s) => s.slug === slug) ?? null) : null;
    },

    reveal() {
      sounds().unlock();
      sounds().play("fanfare");
      const progress = { ...get().progress, revealed: true, openedAt: get().progress.openedAt ?? new Date().toISOString() };
      if (!demo) saveProgress(progress);
      set({ progress, screen: "map" });
    },

    goToMap() {
      sounds().stopAmbient();
      set({ screen: "map", sceneSlug: null, mission: null });
    },

    openScene(slug) {
      const scene = get().config.scenes.find((s) => s.slug === slug);
      if (!scene) return;
      sounds().unlock();
      const history = sceneProgress(get().progress, slug);
      const plan = planScenePlay(scene, { plays: history.plays, lastVariants: history.lastVariants, lastOrder: history.lastOrder }, get().config.gameId);
      const mission = createMissionState(slug, plan);
      telemetry.track({ eventType: history.plays > 0 ? "game_replayed" : "scene_started", sceneSlug: slug });
      if (history.plays > 0) telemetry.track({ eventType: "scene_started", sceneSlug: slug });
      sounds().startAmbient(scene.sounds.ambient);
      set({ screen: "scene", sceneSlug: slug, mission });
    },

    dispatch(action) {
      const { mission } = get();
      const scene = get().scene();
      if (!mission || !scene) return;
      const next = missionReducer(mission, action, missionCopy(scene, opts.copy));
      if (next === mission) return;
      if (action.type === "TAP_TARGET" && next.lastFeedback?.kind === "hit") {
        telemetry.track({ eventType: "target_found", sceneSlug: scene.slug, targetId: action.targetId, hintsUsed: mission.hintLevel });
      }
      if (action.type === "REQUEST_HINT" && next.hintLevel !== mission.hintLevel) {
        telemetry.track({ eventType: "hint_used", sceneSlug: scene.slug, hintsUsed: next.hintLevel });
      }
      set({ mission: next });
    },

    completeScene() {
      const { mission, progress, config } = get();
      const scene = get().scene();
      if (!mission || !scene) return;
      const summary = sceneSummary(mission);
      const next = recordSceneCompleted(progress, scene.slug, { variants: mission.plan.variants, order: mission.plan.order, noHints: summary.noHints, bonusFound: summary.bonusFound }, config.scenes.length);
      if (!demo) saveProgress(next);
      telemetry.track({ eventType: "scene_completed", sceneSlug: scene.slug, hintsUsed: summary.hintsUsed });
      if (completedScenes(next) >= config.scenes.length && !progress.completedAt) telemetry.track({ eventType: "game_completed" });
      set({ progress: next });
    },

    replayScene() {
      const slug = get().sceneSlug;
      if (slug) get().openScene(slug);
    },

    nextScene() {
      const { config, progress, sceneSlug } = get();
      const order = config.scenes.map((s) => s.slug);
      const idx = sceneSlug ? order.indexOf(sceneSlug) : -1;
      // next not-yet-completed scene after the current one, wrapping around
      for (let i = 1; i <= order.length; i++) {
        const slug = order[(idx + i) % order.length];
        if (slug && !sceneProgress(progress, slug).completed) return slug;
      }
      return null;
    },

    openPassport() {
      sounds().stopAmbient();
      set({ screen: "passport", sceneSlug: null, mission: null });
    },

    toggleMute() {
      const muted = !get().muted;
      sounds().setMuted(muted);
      set({ muted });
    },
  }));

  if (opts.autoStartScene) store.getState().openScene(opts.autoStartScene);
  return store;
}

export type PlayStoreApi = ReturnType<typeof createPlayStore>;

export { collectibles, completedScenes };
