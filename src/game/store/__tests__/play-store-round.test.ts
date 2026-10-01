import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlayStore } from "../play-store";
import { adventureFixture } from "../../../domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "../../../domain/adventure/compose";
import { gameStars, sceneFoundIds } from "../../../domain/game/progress";
import { newRound, parseRound } from "../../../domain/game/round";

const fixture = adventureFixture(3), base = attachAdventureBook(fixture.config, fixture.catalog, ["pilot-test"]);
const config = { ...base, gameId: "round-route-game",
  scenes: [0, 1, 2].map(i => ({ ...structuredClone(base.scenes[0]!), slug: `place-${i}` })),
  adventure: { ...base.adventure!, boards: [0, 1, 2].map(i => ({ ...structuredClone(base.adventure!.boards[0]!), boardSlug: `place-${i}` })) },
};
const copy = { wrongTarget: "no", wrongTargetNoItem: "no", bonus: "bonus", fallbackSuccess: "found" };
let storage: Map<string, string>;
beforeEach(() => {
  vi.useFakeTimers(); storage = new Map();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) }, matchMedia: () => ({ matches: true }) });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const key = `findme:progress:v1:${config.gameId}`, roundKey = `findme:round:v1:${config.gameId}`;
const create = () => { const store = createPlayStore(config, { copy }); store.getState().hydrate(); return store; };
function hit(store: ReturnType<typeof create>, id: string) {
  store.getState().dispatch({ type: "TAP_TARGET", targetId: id, now: 2 });
  store.getState().dispatch({ type: "FOUND_DONE", now: 3 });
}
function finish(store: ReturnType<typeof create>) {
  store.getState().dispatch({ type: "START", now: 1 });
  for (const id of store.getState().mission!.plan.order) hit(store, id);
}

describe("a new round preserves the original journey", () => {
  it("starts before the original is complete, keeps its partial finds/cursor byte-for-byte, and resumes each independently after refresh", () => {
    const store = create(); store.getState().reveal(); store.getState().openScene("place-0");
    store.getState().dispatch({ type: "START", now: 1 }); hit(store, "hide-1");
    const earned = store.getState().progress, saved = storage.get(key), album = storage.get(`findme:album:v1:${config.gameId}`);
    store.getState().startRound();
    expect(store.getState().mission!.found).toEqual({});
    store.getState().dispatch({ type: "START", now: 1 }); hit(store, "hide-2");
    expect(store.getState().progress).toBe(earned);
    expect(storage.get(key)).toBe(saved); expect(storage.get(`findme:album:v1:${config.gameId}`)).toBe(album);
    const refreshed = create(); refreshed.getState().resumeRound();
    expect(Object.keys(refreshed.getState().mission!.found)).toEqual(["hide-2"]);
    refreshed.getState().pauseRound(); refreshed.getState().openScene("place-0");
    expect(Object.keys(refreshed.getState().mission!.found)).toEqual(["hide-1"]);
    const again = create(); expect(again.getState().round?.active).toBe(false);
    again.getState().resumeRound(); expect(Object.keys(again.getState().mission!.found)).toEqual(["hide-2"]);
  });

  it("advances directly through every place with a fresh score and retains the new cursor, even when the saved game was already finished", () => {
    const store = create(); store.getState().reveal();
    for (const scene of config.scenes) { store.getState().openScene(scene.slug); finish(store); }
    const saved = storage.get(key), earned = store.getState().progress;
    store.getState().startRound(); store.getState().openScene("place-2");
    expect(store.getState().sceneSlug).toBe("place-0"); // Original unlocks cannot skip new-round gates.
    finish(store); expect(store.getState().nextScene()).toBe("place-1");
    store.getState().openScene(store.getState().nextScene()!);
    expect(store.getState().screen).toBe("scene"); expect(store.getState().mission!.found).toEqual({});
    const refreshed = create(); refreshed.getState().resumeRound(); expect(refreshed.getState().sceneSlug).toBe("place-1");
    finish(refreshed); refreshed.getState().openScene(refreshed.getState().nextScene()!); finish(refreshed);
    expect(refreshed.getState().nextScene()).toBeNull(); expect(refreshed.getState().gameDone()).toBe(true);
    expect(gameStars(refreshed.getState().round!.progress, config.scenes)).toEqual({ found: 9, total: 9 });
    expect(storage.get(key)).toBe(saved); expect(store.getState().progress).toBe(earned);
    refreshed.getState().startRound(); expect(refreshed.getState().mission!.found).toEqual({});
    expect(storage.get(key)).toBe(saved);
  });

  it("replaying a completed middle place continues to the next one and redoing that place does not erase earlier finds in this round", () => {
    const store = create(); store.getState().reveal();
    for (const scene of config.scenes) { store.getState().openScene(scene.slug); finish(store); }
    store.getState().replayScene("place-1");
    expect(store.getState().round!.route).toEqual(["place-1", "place-2"]);
    finish(store); store.getState().openScene(store.getState().nextScene()!); finish(store);
    store.getState().replayScene();
    expect(sceneFoundIds(store.getState().round!.progress, config.scenes[1]!)).toHaveLength(3);
    expect(store.getState().mission!.found).toEqual({});
    store.getState().collectDiscovery("cat"); const refreshed = create(); refreshed.getState().resumeRound();
    expect(refreshed.getState().replay?.discoveryIds).toEqual(["cat"]);
  });

  it("rejects foreign or reordered saved routes without touching earned progress, and reports a storage failure", () => {
    const round = newRound(config)!;
    expect(parseRound(JSON.stringify({ ...round, gameId: "foreign" }), config)).toBeNull();
    expect(parseRound(JSON.stringify({ ...round, route: ["place-2", "place-0"] }), config)).toBeNull();
    storage.set(roundKey, "broken"); const store = create(); expect(store.getState().round).toBeNull();
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => { throw new Error("quota"); } }, matchMedia: () => ({ matches: true }) });
    store.getState().startRound(); expect(store.getState().roundSaved).toBe(false);
    expect(store.getState().sceneSlug).toBe("place-0"); expect(store.getState().progress.scenes).toEqual({});
  });
});
