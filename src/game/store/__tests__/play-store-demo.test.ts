import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createPlayStore } from "../play-store";
import { adventureFixture } from "../../../domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "../../../domain/adventure/compose";
import { visibleTargetId } from "../../../domain/game/mission";

const fixture = adventureFixture(3);
const config = attachAdventureBook(fixture.config, fixture.catalog, ["pilot-test"]);
const copy = { wrongTarget: "no", wrongTargetNoItem: "no", bonus: "bonus", fallbackSuccess: "found" };
const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", { localStorage: storage, matchMedia: () => ({ matches: true }) });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Demo must never sync or report telemetry"); }));
});
afterEach(() => vi.unstubAllGlobals());

describe("single-board authentic demo", () => {
  it("opens only its board and cannot leave for a map, album screen or other board", () => {
    const store = createPlayStore(config, { demo: true, copy });
    store.getState().hydrate();
    for (const act of [() => store.getState().goToMap(), () => store.getState().goToWorlds(), () => store.getState().openPassport(), () => store.getState().openScene("elsewhere"), () => store.getState().reveal()]) {
      act();
      expect(store.getState().screen).toBe("scene");
      expect(store.getState().sceneSlug).toBe("pilot-test");
    }
    expect(store.getState().nextScene()).toBeNull();
  });

  it("plays serial finds, collects once, then resets both for replay without writes", () => {
    const store = createPlayStore(config, { demo: true, albumOwner: true, copy });
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
    const fresh = createPlayStore(config, { demo: true, copy });
    fresh.getState().hydrate();
    expect(fresh.getState().album?.finds).toEqual([]);
    expect(fresh.getState().album?.discoveries).toEqual([]);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
