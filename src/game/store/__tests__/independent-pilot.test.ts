import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlayStore, type PlayStoreApi } from "../play-store";
import { adventureFixture } from "../../../domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "../../../domain/adventure/compose";
import { emptyAdventureProgress, recordAdventureEvent, type AdventureEvent } from "../../../domain/adventure/progress";
import { GameConfigSchema, type GameConfig } from "../../../domain/game/config";
import { sceneIsComplete } from "../../../domain/game/progress";

const fixture = adventureFixture(3);
const base = attachAdventureBook(fixture.config, fixture.catalog, ["pilot-test"]);
const config = GameConfigSchema.parse({ ...base, playPolicy: "independent-worlds-v1" });
const copy = { wrongTarget: "no", wrongTargetNoItem: "no", bonus: "bonus", fallbackSuccess: "found" };
let values: Map<string, string>;
let listeners: Record<string, Set<() => void>>;
const flush = async () => { await vi.advanceTimersByTimeAsync(1); };
beforeEach(() => {
  vi.useFakeTimers(); values = new Map(); listeners = {};
  vi.stubGlobal("window", {
    localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) },
    matchMedia: () => ({ matches: true }),
    addEventListener: (key: string, fn: () => void) => (listeners[key] ??= new Set()).add(fn),
    removeEventListener: (key: string, fn: () => void) => listeners[key]?.delete(fn),
  });
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function open(cfg = config, owner?: string) {
  const store = createPlayStore(cfg, { copy, albumOwner: !!owner, albumOwnerScope: owner });
  store.getState().hydrate(); store.getState().reveal(); store.getState().openScene("pilot-test");
  return store;
}
function finish(store: PlayStoreApi) {
  store.getState().dispatch({ type: "START", now: 1 });
  for (const targetId of store.getState().mission!.plan.order) {
    store.getState().dispatch({ type: "TAP_TARGET", targetId, now: 2 });
    store.getState().dispatch({ type: "FOUND_DONE", now: 3 });
  }
  store.getState().completeScene();
}
function account() {
  let progress = emptyAdventureProgress(config.gameId, config.adventure!);
  let online = false;
  const sent: AdventureEvent[] = [], methods: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (!online) throw new TypeError("offline");
    methods.push(init?.method ?? "GET");
    if (init?.method === "POST") {
      const event = JSON.parse(String(init.body)).event as AdventureEvent;
      sent.push(event); progress = recordAdventureEvent(progress, config.gameId, config.adventure!, event).progress;
    }
    return new Response(JSON.stringify({ progress, revision: sent.length, changed: true }));
  }));
  return { sent, methods, progress: () => progress, online: () => { online = true; for (const fn of listeners.online ?? []) fn(); } };
}

describe("independent pilot — opt-in only", () => {
  it("rejects a policy without a frozen book", () => {
    expect(GameConfigSchema.safeParse({ ...fixture.config, playPolicy: "independent-worlds-v1" }).success).toBe(false);
    expect(() => createPlayStore(config, { copy, albumOwner: true })).toThrow(/viewer scope/);
  });
  it("keeps a new replay discovery after refresh, never adds replay stars, and never migrates legacy data", () => {
    values.set(`findme:album:v1:${config.gameId}`, "legacy untouched");
    values.set(`findme:progress:v1:${config.gameId}`, "legacy progress untouched");
    const store = open(); finish(store);
    const before = store.getState().progress;
    store.getState().replayScene();
    expect(store.getState().collectDiscovery("cat")).toBe("collected");
    expect(store.getState().collectDiscovery("cat")).toBe("again");
    expect(store.getState().collectDiscovery("unknown")).toBe("none");
    finish(store);
    expect(store.getState().progress).toBe(before);
    expect(store.getState().album!.finds).toHaveLength(3);
    expect(store.getState().album!.discoveries).toHaveLength(1);
    const refreshed = createPlayStore(config, { copy }); refreshed.getState().hydrate();
    expect(refreshed.getState().replay).toBeNull();
    expect(refreshed.getState().screen).toBe("map");
    expect(refreshed.getState().album!.discoveries).toHaveLength(1);
    expect(values.get(`findme:album:v1:${config.gameId}`)).toBe("legacy untouched");
    expect(values.get(`findme:progress:v1:${config.gameId}`)).toBe("legacy progress untouched");
  });
  it("counts an old discovery in the round without writing it again", () => {
    const store = open(); store.getState().collectDiscovery("cat"); finish(store);
    const album = store.getState().album;
    store.getState().replayScene();
    const write = vi.spyOn(window.localStorage, "setItem");
    expect(store.getState().collectDiscovery("cat")).toBe("collected");
    expect(store.getState().replay!.discoveryIds).toEqual(["cat"]);
    expect(store.getState().album).toBe(album); expect(write).not.toHaveBeenCalled();
  });
  it("keeps the round through the bag, but ends it at the map", () => {
    const store = open(); finish(store); store.getState().replayScene();
    store.getState().dispatch({ type: "START", now: 1 });
    const mission = store.getState().mission, visit = store.getState().visitId;
    store.getState().collectDiscovery("cat");
    store.getState().openPassport();
    expect(store.getState().screen).toBe("passport");
    expect(store.getState().collectDiscovery("cat")).toBe("none");
    store.getState().openScene("pilot-test");
    expect(store.getState().mission).toBe(mission); expect(store.getState().visitId).toBe(visit);
    expect(store.getState().replay!.discoveryIds).toEqual(["cat"]);
    store.getState().openPassport(); store.getState().resumeScene();
    expect(store.getState().mission).toBe(mission);
    store.getState().goToMap(); expect(store.getState().replay).toBeNull();
    store.getState().openScene("pilot-test"); expect(store.getState().replay).toBeNull();
  });
  it("does not allow replay before every delivered child was found", () => {
    const store = open(); const mission = store.getState().mission;
    store.getState().replayScene(); expect(store.getState().mission).toBe(mission);
    expect(store.getState().replay).toBeNull();
  });
  it("does not import guest discoveries or stars into an owner or another account", async () => {
    const api = account(); const guest = open(); finish(guest); guest.getState().collectDiscovery("cat");
    const owner = open(config, "account-a"); await flush();
    expect(owner.getState().album!.discoveries).toEqual([]);
    expect(sceneIsComplete(owner.getState().progress, config.scenes[0]!)).toBe(false);
    api.online(); await flush();
    expect(api.sent).toEqual([]);
    owner.getState().collectDiscovery("cat"); await flush(); owner.getState().stopAlbumSync();
    // Use a different account's initially empty response, not the first owner's server.
    account(); const other = open(config, "account-b"); await flush();
    expect(other.getState().album!.discoveries).toEqual([]); other.getState().stopAlbumSync();
    const guestAgain = open(); expect(guestAgain.getState().album!.finds).toHaveLength(3);
  });
  it("keeps owner replay discoveries offline across refresh and reads before sending them", async () => {
    const api = account(); const owner = open(config, "account-a"); await flush(); finish(owner);
    owner.getState().replayScene(); owner.getState().collectDiscovery("cat");
    expect(owner.getState().albumState).not.toBe("saved"); owner.getState().stopAlbumSync();
    const refreshed = open(config, "account-a"); await flush();
    expect(refreshed.getState().album!.discoveries).toHaveLength(1);
    refreshed.getState().replayScene();
    api.online(); await flush();
    expect(api.methods[0]).toBe("GET");
    expect(api.sent.filter(e => e.kind === "discovery-found")).toHaveLength(1);
    expect(api.progress().finds).toHaveLength(3);
    expect(refreshed.getState().replay!.discoveryIds).toEqual([]);
    expect(refreshed.getState().mission!.found).toEqual({});
    expect(refreshed.getState().albumState).toBe("saved"); refreshed.getState().stopAlbumSync();
  });
  it("does not claim a failed local save will survive refresh", () => {
    const store = open(); finish(store); store.getState().replayScene();
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    store.getState().collectDiscovery("cat");
    expect(store.getState().albumState).toBe("unsaved");
    expect(store.getState().album!.discoveries).toHaveLength(1);
    expect(open().getState().album!.discoveries).toEqual([]);
  });
  it("does not inherit a different release's cache", () => {
    const store = open(); store.getState().collectDiscovery("cat"); finish(store);
    const next: GameConfig = { ...config, adventure: { ...config.adventure!, releaseId: "another-release" } };
    const changed = open(next);
    expect(changed.getState().album!.discoveries).toEqual([]);
    expect(sceneIsComplete(changed.getState().progress, next.scenes[0]!)).toBe(false);
  });
});
