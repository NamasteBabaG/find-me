import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameConfigSchema, type GameConfig } from "@/domain/game/config";
import { createMissionState, currentTargetId, missionCanAdvance, missionReducer, type MissionCopy } from "@/domain/game/mission";
import { planScenePlay } from "@/domain/game/replay";
import { emptyProgress, gameStars, parseProgress, sceneCanAdvance, sceneFoundIds, sceneIsComplete } from "@/domain/game/progress";
import { createPlayStore } from "../play-store";

const copy: MissionCopy = { successByTarget: {}, itemByTarget: {}, wrongTarget: "Other {item}", wrongTargetNoItem: "Other", bonus: "Bonus", fallbackSuccess: "Found" };
const slot = { id: "a", x: 0.3, y: 0.4, scale: 0.1, rotation: 0, zIndex: 10, layer: "front", flip: false, hintZone: { x: 0.3, y: 0.4, r: 0.1 }, hintText: "Look left" };
function fixture(): GameConfig {
  return GameConfigSchema.parse({
    version: 1, gameId: "five-game", locale: "en", child: { name: "Noa", avatarUrl: "/identity.png" }, styleVersion: "local-patch-world-v1", packageTier: "ONE_WORLD", composedAt: "2026-09-12T00:00:00Z",
    scenes: Array.from({ length: 9 }, (_, board) => ({
      slug: `board-${board}`, version: 7, playMode: "find-any", appearancesPerBoard: 5, findsRequiredToAdvance: 3, name: `Board ${board}`, tagline: "Explore", artStatus: "final",
      art: { width: 3072, height: 2048, base: "/board.webp", thumbnail: "/thumb.webp", palette: { sky: "#fff", ground: "#fff", accent: "#000" } },
      targets: Array.from({ length: 5 }, (_, index) => ({ id: `b${board}-t${index}`, targetType: "hide", difficulty: 1, mission: "Find Noa", item: "", success: ["Found"], animation: "wave", slots: [slot, { ...slot, id: "b" }], sprite: { kind: "image", url: `/patch-${board}-${index}.png`, width: 512, height: 768, rect: { x: index * 0.15, y: 0.2, w: 0.12, h: 0.3 } } })),
      ambient: [], celebration: { kind: "confetti", completeText: "All five found" }, collectible: { id: `c${board}`, name: "Stamp", icon: "★" }, sounds: {},
    })),
  });
}
class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}
beforeEach(() => { vi.stubGlobal("window", { localStorage: new MemoryStorage(), matchMedia: () => ({ matches: true }) }); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response())); vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function find(store: ReturnType<typeof createPlayStore>, targetId: string) {
  store.getState().dispatch({ type: "TAP_TARGET", targetId, now: 100 });
  store.getState().dispatch({ type: "FOUND_DONE", now: 200 });
}

describe("versioned five-hide player", () => {
  it("requires the complete explicit 5/3 contract and unique target ids; legacy still requires three", () => {
    const config = fixture();
    for (const field of ["playMode", "appearancesPerBoard", "findsRequiredToAdvance"] as const) {
      const changed = structuredClone(config); delete changed.scenes[0]![field];
      expect(GameConfigSchema.safeParse(changed).success).toBe(false);
    }
    const duplicate = structuredClone(config); duplicate.scenes[0]!.targets[4]!.id = duplicate.scenes[0]!.targets[0]!.id;
    expect(GameConfigSchema.safeParse(duplicate).success).toBe(false);
    const legacy = structuredClone(config);
    for (const scene of legacy.scenes) { delete scene.playMode; delete scene.appearancesPerBoard; delete scene.findsRequiredToAdvance; scene.targets = scene.targets.slice(0, 3); }
    expect(GameConfigSchema.parse(legacy).scenes[0]!.playMode).toBeUndefined();
  });

  it("every three-of-five combination, in every order, unlocks without completing", () => {
    const scene = fixture().scenes[0]!; const plan = planScenePlay(scene, { plays: 0 }, "test");
    let tested = 0;
    for (const a of plan.order) for (const b of plan.order) for (const c of plan.order) {
      if (new Set([a, b, c]).size !== 3) continue;
      let state = missionReducer(createMissionState(scene.slug, plan, scene), { type: "START", now: 1 }, copy);
      for (const [index, id] of [a, b, c].entries()) {
        state = missionReducer(state, { type: "TAP_TARGET", targetId: id, now: 2 }, copy);
        expect(missionCanAdvance(state)).toBe(index === 2);
        const duplicate = missionReducer(state, { type: "TAP_TARGET", targetId: id, now: 3 }, copy);
        expect(duplicate).toBe(state);
        state = missionReducer(state, { type: "FOUND_DONE", now: 4 }, copy);
      }
      expect(state.phase).toBe("searching"); expect(Object.keys(state.found)).toHaveLength(3); tested++;
    }
    expect(tested).toBe(60);
  });

  it("keeps a hinted unfound target stable when another valid child is found", () => {
    const scene = fixture().scenes[0]!; const plan = planScenePlay(scene, { plays: 0 }, "test");
    let state = missionReducer(createMissionState(scene.slug, plan, scene), { type: "START", now: 1 }, copy);
    state = missionReducer(state, { type: "REQUEST_HINT" }, copy);
    const hinted = currentTargetId(state);
    state = missionReducer(state, { type: "TAP_TARGET", targetId: plan.order[4]!, now: 2 }, copy);
    expect(state.lastFeedback?.kind).toBe("hit");
    state = missionReducer(state, { type: "FOUND_DONE", now: 3 }, copy);
    expect(currentTargetId(state)).toBe(hinted); expect(state.hintLevel).toBe(1);
    expect(missionReducer(state, { type: "TAP_TARGET", targetId: "not-a-hide", now: 4 }, copy)).toBe(state);
  });

  it.each([2, 3, 4])("persists %i/5 before animation and restores exact finds/layout on refresh", count => {
    const config = fixture(); const scene = config.scenes[0]!;
    const store = createPlayStore(config, { copy }); store.getState().reveal(); store.getState().openScene(scene.slug); store.getState().dispatch({ type: "START", now: 1 });
    const ids = [...store.getState().mission!.plan.order].reverse();
    ids.slice(0, count - 1).forEach(id => find(store, id));
    store.getState().dispatch({ type: "TAP_TARGET", targetId: ids[count - 1]!, now: 10 });
    expect(store.getState().mission!.phase).toBe("found");
    const raw = window.localStorage.getItem(`findme:progress:v1:${config.gameId}`);
    expect(sceneFoundIds(parseProgress(raw, config.gameId), scene)).toHaveLength(count);
    const again = createPlayStore(config, { copy }); again.getState().hydrate();
    expect(again.getState().screen).toBe("scene"); expect(again.getState().sceneSlug).toBe(scene.slug);
    expect(Object.keys(again.getState().mission!.found).sort()).toEqual(ids.slice(0, count).sort());
    expect(again.getState().mission!.plan.variants).toEqual(store.getState().mission!.plan.variants);
    expect(sceneCanAdvance(again.getState().progress, scene)).toBe(count >= 3);
    expect(sceneIsComplete(again.getState().progress, scene)).toBe(false);
  });

  it("unlocks only at three; finishes the journey at 27, boards at five, world at45 without duplicate rewards", () => {
    const config = fixture(); const store = createPlayStore(config, { copy }); const events = vi.spyOn(store.getState().telemetry, "track");
    store.getState().reveal(); store.getState().openScene(config.scenes[1]!.slug); expect(store.getState().mission).toBeNull();
    for (const scene of config.scenes) {
      store.getState().openScene(scene.slug); store.getState().dispatch({ type: "START", now: 1 });
      scene.targets.slice(0, 3).forEach(target => find(store, target.id));
      expect(sceneIsComplete(store.getState().progress, scene)).toBe(false);
    }
    expect(gameStars(store.getState().progress, config.scenes)).toEqual({ found: 27, total: 45 });
    expect(store.getState().gameDone()).toBe(true); expect(store.getState().progress.journeyFinishedAt).toBeTruthy(); expect(store.getState().progress.completedAt).toBeUndefined();
    for (const scene of config.scenes) {
      store.getState().openScene(scene.slug); store.getState().dispatch({ type: "START", now: 1 });
      scene.targets.slice(3).forEach(target => find(store, target.id));
      store.getState().completeScene(); store.getState().completeScene();
      store.getState().replayScene(); expect(store.getState().screen).toBe("map");
      store.getState().openScene(scene.slug); store.getState().dispatch({ type: "START", now: 1 });
      scene.targets.forEach(target => find(store, target.id));
    }
    expect(gameStars(store.getState().progress, config.scenes)).toEqual({ found: 45, total: 45 });
    expect(store.getState().progress.completedAt).toBeTruthy();
    const types = events.mock.calls.map(([event]) => event.eventType);
    expect(types.filter(type => type === "target_found")).toHaveLength(45);
    expect(types.filter(type => type === "scene_unlocked")).toHaveLength(9);
    expect(types.filter(type => type === "scene_completed")).toHaveLength(9);
    expect(types.filter(type => type === "journey_finished")).toHaveLength(1);
    expect(types.filter(type => type === "game_completed")).toHaveLength(1);
  });

  it("ignores forged duplicate/unknown/stale-version star IDs and isolates games", () => {
    const config = fixture(); const scene = config.scenes[0]!;
    const progress = parseProgress(JSON.stringify({ ...emptyProgress(config.gameId), scenes: { [scene.slug]: { sceneVersion: 7, foundTargetIds: [scene.targets[0]!.id, scene.targets[0]!.id, "missing"], completed: true } } }), config.gameId);
    expect(sceneFoundIds(progress, scene)).toEqual([scene.targets[0]!.id]); expect(sceneIsComplete(progress, scene)).toBe(false);
    expect(sceneFoundIds(progress, { ...scene, version: 8 })).toEqual([]);
    expect(parseProgress(JSON.stringify(progress), "other-game").scenes).toEqual({});
  });
});
