import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createPlayStore } from "../play-store";
import { adventureFixture } from "../../../domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "../../../domain/adventure/compose";
import { visibleTargetId } from "../../../domain/game/mission";
import { MUTE_PREFERENCE_KEY } from "../../audio/mute-preference";

const fixture = adventureFixture(3);
const config = attachAdventureBook(fixture.config, fixture.catalog, ["pilot-test"]);
const copy = { wrongTarget: "no", wrongTargetNoItem: "no", bonus: "bonus", fallbackSuccess: "found" };
const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  storage.getItem.mockReset(); storage.setItem.mockReset(); storage.removeItem.mockReset();
  vi.stubGlobal("window", { localStorage: storage, matchMedia: () => ({ matches: true }) });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Demo must never sync or report telemetry"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("single-board authentic demo", () => {
  it("opens only its board and cannot leave for a map, album screen or other board", () => {
    const store = createPlayStore(config, { demo: true, copy });
    expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled();
    store.getState().hydrate();
    for (const act of [() => store.getState().goToMap(), () => store.getState().goToWorlds(), () => store.getState().openPassport(), () => store.getState().openScene("elsewhere"), () => store.getState().reveal()]) {
      act();
      expect(store.getState().screen).toBe("scene");
      expect(store.getState().sceneSlug).toBe("pilot-test");
    }
    expect(store.getState().nextScene()).toBeNull();
    expect(storage.getItem.mock.calls).toEqual([[MUTE_PREFERENCE_KEY]]);
    expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    store.getState().stopAlbumSync();
  });

  it("plays serial finds, collects once, then resets both for replay without writes", () => {
    const store = createPlayStore(config, { demo: true, albumOwner: true, copy });
    expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled();
    store.getState().hydrate();
    expect(store.getState().albumMode).toBe("none");
    expect(store.getState().albumBoard()?.discoveries).toHaveLength(1);
    expect(store.getState().collectDiscovery("cat")).toBe("collected");
    expect(store.getState().collectDiscovery("cat")).toBe("again");
    store.getState().dispatch({ type: "START", now: 1 });
    const order = store.getState().mission!.plan.order;
    expect(order).toHaveLength(3);
    for (const id of order) {
      expect(visibleTargetId(store.getState().mission!)).toBe(id);
      store.getState().dispatch({ type: "TAP_TARGET", targetId: id, now: 2 });
      store.getState().dispatch({ type: "FOUND_DONE", now: 3 });
    }
    expect(store.getState().mission?.phase).toBe("complete");
    expect(store.getState().album?.finds).toHaveLength(3);
    const earned = store.getState().album;
    store.getState().replayScene();
    expect(store.getState().mission?.found).toEqual({});
    expect(store.getState().replay?.discoveryIds).toEqual([]);
    expect(store.getState().collectDiscovery("cat")).toBe("collected");
    expect(store.getState().album).toBe(earned);
    const readCount = storage.getItem.mock.calls.length;
    const fresh = createPlayStore(config, { demo: true, copy });
    expect(storage.getItem).toHaveBeenCalledTimes(readCount); // Rendering another store does not read even the audio preference.
    fresh.getState().hydrate();
    expect(fresh.getState().album?.finds).toEqual([]);
    expect(fresh.getState().album?.discoveries).toEqual([]);
    expect(storage.getItem.mock.calls).toEqual([[MUTE_PREFERENCE_KEY], [MUTE_PREFERENCE_KEY]]);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    store.getState().stopAlbumSync(); fresh.getState().stopAlbumSync();
  });

  it("restores only a seeded shared mute after hydration while protected family progress, album and round stay untouched", () => {
    const protectedValues = new Map(["progress", "album", "round"].map(kind => [`findme:${kind}:v1:${config.gameId}`, `protected ${kind}`]));
    const stored = new Map([...protectedValues, [MUTE_PREFERENCE_KEY, JSON.stringify({ version: 1, muted: true })]]);
    storage.getItem.mockImplementation((key: string) => stored.get(key) ?? null);
    storage.setItem.mockImplementation((key: string, value: string) => { stored.set(key, value); });
    storage.removeItem.mockImplementation((key: string) => { stored.delete(key); });
    const store = createPlayStore(config, { demo: true, albumOwner: true, copy });
    expect(storage.getItem).not.toHaveBeenCalled(); expect(storage.setItem).not.toHaveBeenCalled();
    store.getState().hydrate(); expect(store.getState().muted).toBe(true);
    expect(store.getState().progress.scenes).toEqual({}); expect(store.getState().album?.finds).toEqual([]); expect(store.getState().round).toBeNull();
    store.getState().collectDiscovery("cat"); store.getState().replayScene(); store.getState().telemetry.flush();
    expect(storage.getItem.mock.calls).toEqual([[MUTE_PREFERENCE_KEY]]);
    expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    for (const [key, value] of protectedValues) expect(stored.get(key)).toBe(value);
    expect(stored.get(MUTE_PREFERENCE_KEY)).toBe(JSON.stringify({ version: 1, muted: true }));
    store.getState().stopAlbumSync();
  });
});
