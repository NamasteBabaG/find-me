// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adventureFixture } from "@/domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "@/domain/adventure/compose";
import { sceneCanAdvance, sceneFoundIds, sceneIsComplete } from "@/domain/game/progress";
import { emptyGuestSnapshot } from "@/domain/guest-sharing";
import { friendSnapshotFromPlay } from "@/game/engine/friend-progress";
import { createPlayStore } from "../play-store";

const copy = { wrongTarget: "no", wrongTargetNoItem: "no", bonus: "bonus", fallbackSuccess: "found" };
const fixture = adventureFixture(5);
function twoBoards(withBook: boolean) {
  const config = structuredClone(withBook ? attachAdventureBook(fixture.config, fixture.catalog, ["pilot-test"]) : fixture.config);
  config.scenes.push({ ...structuredClone(config.scenes[0]!), slug: "second-place" });
  delete config.world; delete config.worlds;
  if (config.adventure) config.adventure.boards.push({ ...structuredClone(config.adventure.boards[0]!), boardSlug: "second-place" });
  return config;
}
beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("an independent friend never writes to the family account"); }));
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true }) as MediaQueryList));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("friend progress restoration in the game", () => {
  it.each([false, true])("restores server finds before opening a requested later board (passport=%s)", withBook => {
    const config = twoBoards(withBook), ready = vi.fn(), scope = "friend:gsr_test:gpt_fox";
    const finds = [
      ...config.scenes[0]!.targets.slice(0, 3).map(target => ({ boardSlug: "pilot-test", targetId: target.id, variant: "B" as const })),
      { boardSlug: "second-place", targetId: "hide-2", variant: "B" as const },
    ];
    const initialAlbum = { finds, discoveries: withBook ? [{ boardSlug: "second-place", discoveryId: "cat" }] : [] };
    const store = createPlayStore(config, { copy, storageScope: scope, friendParticipantId: "gpt_fox", initialAlbum, autoStartScene: "second-place", skipGift: true, onBoardReady: ready });
    expect(sceneCanAdvance(store.getState().progress, config.scenes[0]!)).toBe(true);
    store.getState().hydrate();
    expect(store.getState().screen).toBe("scene"); expect(store.getState().sceneSlug).toBe("second-place");
    expect(Object.keys(store.getState().mission!.found)).toEqual(["hide-2"]);
    expect(store.getState().mission!.plan.variants["hide-2"]).toBe("B");
    expect(sceneIsComplete(store.getState().progress, config.scenes[0]!)).toBe(false);
    expect(ready).not.toHaveBeenCalled();
    expect(friendSnapshotFromPlay(store.getState()).visited).toEqual([]);
    store.getState().boardReady("second-place"); expect(ready).toHaveBeenCalledOnce();
    expect(ready).toHaveBeenCalledWith("second-place");
    const restored = createPlayStore(config, { copy, storageScope: scope, friendParticipantId: "gpt_fox", initialAlbum, autoStartScene: "second-place", skipGift: true });
    restored.getState().hydrate();
    expect(restored.getState().sceneSlug).toBe("second-place");
    expect(sceneFoundIds(restored.getState().progress, config.scenes[1]!)).toEqual(["hide-2"]);
    if (withBook) expect(restored.getState().album?.discoveries).toEqual(initialAlbum.discoveries);
    else expect(restored.getState().album).toBeNull();
    expect(window.localStorage.getItem(`findme:progress:v1:${config.gameId}`)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports an actual displayed board only on boardReady for the current open scene", () => {
    const config = twoBoards(false), ready = vi.fn();
    const store = createPlayStore(config, { copy, storageScope: "friend:gsr_test:gpt_fox", friendParticipantId: "gpt_fox", skipGift: true, onBoardReady: ready });
    store.getState().boardReady("pilot-test"); store.getState().hydrate();
    store.getState().openScene("second-place"); expect(store.getState().screen).toBe("map");
    store.getState().boardReady("second-place"); expect(ready).not.toHaveBeenCalled();
    store.getState().openScene("pilot-test"); expect(ready).not.toHaveBeenCalled();
    store.getState().boardReady("second-place"); expect(ready).not.toHaveBeenCalled();
    store.getState().boardReady("pilot-test"); expect(ready).toHaveBeenCalledExactlyOnceWith("pilot-test");
    store.getState().goToMap(); store.getState().boardReady("pilot-test");
    expect(ready).toHaveBeenCalledOnce(); expect(friendSnapshotFromPlay(store.getState())).toEqual(emptyGuestSnapshot());
  });

  it("a resumed friend joins browser and server finds without touching another participant or the owner", () => {
    const config = twoBoards(true), scope = "friend:gsr_test:gpt_fox";
    const ownerKey = `findme:progress:v1:${config.gameId}`, otherKey = "findme:progress:v1:friend:gsr_test:gpt_star";
    window.localStorage.setItem(ownerKey, "owner-private-progress"); window.localStorage.setItem(otherKey, "another-friends-progress");
    const first = createPlayStore(config, { copy, storageScope: scope, friendParticipantId: "gpt_fox", skipGift: true });
    first.getState().hydrate(); first.getState().openScene("pilot-test"); first.getState().dispatch({ type: "START", now: 1 });
    first.getState().dispatch({ type: "TAP_TARGET", targetId: "hide-1", now: 2 });
    first.getState().collectDiscovery("cat");
    const resumed = createPlayStore(config, { copy, storageScope: scope, friendParticipantId: "gpt_fox", skipGift: true,
      initialAlbum: { finds: [{ boardSlug: "pilot-test", targetId: "hide-2", variant: "B" }], discoveries: [] } });
    resumed.getState().hydrate(); resumed.getState().openScene("pilot-test");
    expect(sceneFoundIds(resumed.getState().progress, config.scenes[0]!)).toEqual(["hide-1", "hide-2"]);
    expect(resumed.getState().album?.finds.map(row => row.targetId).sort()).toEqual(["hide-1", "hide-2"]);
    expect(resumed.getState().album?.discoveries).toEqual([{ boardSlug: "pilot-test", discoveryId: "cat" }]);
    const projection = friendSnapshotFromPlay(resumed.getState());
    expect(projection.finds).toHaveLength(2); expect(projection.discoveries).toEqual([{ sceneSlug: "pilot-test", discoveryId: "cat" }]);
    expect(window.localStorage.getItem(ownerKey)).toBe("owner-private-progress");
    expect(window.localStorage.getItem(otherKey)).toBe("another-friends-progress"); expect(fetch).not.toHaveBeenCalled();
  });
});
