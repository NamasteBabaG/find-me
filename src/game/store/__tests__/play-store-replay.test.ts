import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlayStore, type PlayStoreApi } from "../play-store";
import { adventureFixture } from "../../../domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "../../../domain/adventure/compose";
import { emptyAdventureProgress, recordAdventureEvent, type AdventureEvent } from "../../../domain/adventure/progress";
import { sceneFoundIds, sceneIsComplete } from "../../../domain/game/progress";

// Replay is a visit, never a reset of the child's earned progress.
class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const copy = { wrongTarget: "no", wrongTargetNoItem: "no", bonus: "bonus", fallbackSuccess: "found" };
const fixture = adventureFixture(3);
const config = attachAdventureBook(fixture.config, fixture.catalog, ["pilot-test"]);
const scene = config.scenes[0]!;
const progressKey = `findme:progress:v1:${config.gameId}`;
const albumKey = `findme:album:v1:${config.gameId}`;
const flush = async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); };
let storage: MemoryStorage;
let listeners: Record<string, Set<() => void>>;
beforeEach(() => {
  vi.useFakeTimers();
  storage = new MemoryStorage(); listeners = {};
  vi.stubGlobal("window", {
    localStorage: storage, matchMedia: () => ({ matches: true }),
    addEventListener(type: string, fn: () => void) { (listeners[type] ??= new Set()).add(fn); },
    removeEventListener(type: string, fn: () => void) { listeners[type]?.delete(fn); },
  });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function finish(store: PlayStoreApi) {
  store.getState().dispatch({ type: "START", now: 1 });
  for (const targetId of store.getState().mission!.plan.order) {
    store.getState().dispatch({ type: "TAP_TARGET", targetId, now: 2 });
    store.getState().dispatch({ type: "FOUND_DONE", now: 3 });
  }
  expect(store.getState().mission!.phase).toBe("complete");
  store.getState().completeScene();
}
function completed(collect = true) {
  const store = createPlayStore(config, { copy });
  store.getState().hydrate(); store.getState().reveal(); store.getState().openScene(scene.slug);
  if (collect) store.getState().collectDiscovery("cat");
  finish(store);
  return store;
}

describe("temporary board replay", () => {
  it("starts children and items from zero, repeats the same layout, and never writes earned progress or rewards", () => {
    const store = completed();
    const progress = store.getState().progress, album = store.getState().album;
    const savedProgress = storage.getItem(progressKey), savedAlbum = storage.getItem(albumKey);
    const plan = store.getState().mission!.plan, visit = store.getState().visitId;
    const track = vi.spyOn(store.getState().telemetry, "track");
    const write = vi.spyOn(storage, "setItem");
    store.getState().replayScene();
    expect(store.getState().visitId).toBe(visit + 1);
    expect(store.getState().mission!.found).toEqual({});
    expect(store.getState().replay?.discoveryIds).toEqual([]);
    expect(store.getState().mission!.plan.order).toEqual(plan.order);
    expect(store.getState().mission!.plan.variants).toEqual(plan.variants);
    expect(store.getState().collectDiscovery("cat")).toBe("collected");
    expect(store.getState().collectDiscovery("cat")).toBe("again");
    expect(store.getState().collectDiscovery("unknown")).toBe("none");
    finish(store);
    expect(store.getState().progress).toBe(progress);
    expect(store.getState().album).toBe(album);
    expect(store.getState().gameDone()).toBe(true);
    expect(write).not.toHaveBeenCalled();
    expect(track.mock.calls.map(([event]) => event.eventType)).not.toEqual(expect.arrayContaining(["target_found", "scene_completed", "game_completed", "scene_unlocked"]));
    store.getState().replayScene();
    expect(store.getState().visitId).toBe(visit + 2);
    expect(store.getState().mission!.found).toEqual({});
    expect(store.getState().replay?.discoveryIds).toEqual([]);
    expect(storage.getItem(progressKey)).toBe(savedProgress);
    expect(storage.getItem(albumKey)).toBe(savedAlbum);
  });

  it("a new discovery during replay joins the passport without resetting earned finds", () => {
    const store = completed(false), saved = storage.getItem(albumKey);
    store.getState().replayScene();
    expect(store.getState().collectDiscovery("cat")).toBe("collected");
    expect(store.getState().replay?.discoveryIds).toEqual(["cat"]);
    expect(store.getState().album!.discoveries).toEqual([{ boardSlug: scene.slug, discoveryId: "cat" }]);
    expect(storage.getItem(albumKey)).not.toBe(saved);
    expect(store.getState().album!.finds).toHaveLength(3);
    store.getState().goToMap(); store.getState().openScene(scene.slug);
    // Ordinary revisits can still finish collecting the real album.
    expect(store.getState().replay).toBeNull();
    expect(store.getState().collectDiscovery("cat")).toBe("again");
    expect(store.getState().album!.discoveries).toHaveLength(1);
  });

  it.each(["goToMap", "goToWorlds", "openPassport"] as const)("%s ends the round; revisiting restores the completed board", navigate => {
    const store = completed();
    store.getState().replayScene();
    store.getState()[navigate]();
    expect(store.getState().replay).toBeNull();
    expect(store.getState().mission).toBeNull();
    store.getState().openScene(scene.slug);
    store.getState().dispatch({ type: "START", now: 1 });
    expect(store.getState().replay).toBeNull();
    expect(store.getState().mission!.phase).toBe("complete");
    expect(Object.keys(store.getState().mission!.found)).toHaveLength(3);
    expect(store.getState().album!.discoveries).toHaveLength(1);
  });

  it("refresh discards the unfinished round, not any earned stars, items or completion", () => {
    const store = completed();
    store.getState().replayScene(); store.getState().dispatch({ type: "START", now: 1 });
    store.getState().dispatch({ type: "TAP_TARGET", targetId: store.getState().mission!.plan.order[0]!, now: 2 });
    expect(Object.keys(store.getState().mission!.found)).toHaveLength(1);
    const refreshed = createPlayStore(config, { copy }); refreshed.getState().hydrate();
    expect(refreshed.getState().replay).toBeNull();
    expect(refreshed.getState().sceneSlug).toBe(scene.slug);
    expect(Object.keys(refreshed.getState().mission!.found)).toHaveLength(3);
    expect(refreshed.getState().album!.discoveries).toHaveLength(1);
    expect(sceneIsComplete(refreshed.getState().progress, scene)).toBe(true);
  });

  it("rejects unknown and incomplete boards instead of bypassing progression", () => {
    const store = createPlayStore(config, { copy }); store.getState().hydrate();
    store.getState().replayScene(scene.slug); store.getState().replayScene("not-a-board");
    expect(store.getState().mission).toBeNull(); expect(store.getState().visitId).toBe(0);
    store.getState().openScene(scene.slug); store.getState().dispatch({ type: "START", now: 1 });
    store.getState().dispatch({ type: "TAP_TARGET", targetId: store.getState().mission!.plan.order[0]!, now: 2 });
    const mission = store.getState().mission;
    store.getState().replayScene();
    expect(store.getState().mission).toBe(mission); expect(store.getState().replay).toBeNull();
  });

  it("account reconnect saves new replay discoveries without filling the practice round", async () => {
    const guest = completed(false);
    const book = config.adventure!;
    let server = emptyAdventureProgress(config.gameId, book);
    for (const targetId of scene.targets.map(t => t.id)) server = recordAdventureEvent(server, config.gameId, book, { kind: "target-found", boardSlug: scene.slug, targetId, variant: "A" }).progress;
    // All existing finds are acknowledged; the optional cat was never earned.
    server = { ...server, finds: guest.getState().album!.finds };
    let online = false;
    const posted: AdventureEvent[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (!online) throw new TypeError("offline");
      if (init?.method === "POST") {
        const event = JSON.parse(String(init.body)).event as AdventureEvent;
        posted.push(event);
        server = recordAdventureEvent(server, config.gameId, book, event).progress;
      }
      return new Response(JSON.stringify({ ok: true, progress: server, revision: 3, changed: false }));
    }));
    const owner = createPlayStore(config, { copy, albumOwner: true });
    owner.getState().hydrate(); await flush();
    expect(owner.getState().albumState).toBe("offline");
    owner.getState().replayScene(); owner.getState().dispatch({ type: "START", now: 1 });
    owner.getState().collectDiscovery("cat");
    await flush(); // settle the failed offline request before the reconnect event
    online = true; for (const fn of listeners.online ?? []) fn(); await flush();
    expect(owner.getState().albumState).toBe("saved");
    expect(owner.getState().mission!.found).toEqual({});
    // Even a direct adoption action cannot fill this ephemeral mission.
    owner.getState().dispatch({ type: "ADOPT_FOUND", now: 2, found: Object.fromEntries(scene.targets.map(t => [t.id, { hintsUsed: 0, misses: 0, elapsedMs: 0 }])) });
    expect(owner.getState().mission!.found).toEqual({});
    finish(owner); await flush();
    expect(posted).toEqual([{ kind: "discovery-found", boardSlug: scene.slug, discoveryId: "cat" }]);
    expect(owner.getState().album!.discoveries).toEqual([{ boardSlug: scene.slug, discoveryId: "cat" }]);
    expect(sceneFoundIds(owner.getState().progress, scene)).toHaveLength(3);
    owner.getState().stopAlbumSync();
  });

  it("legacy sequential boards still replay on entry, without incrementing permanent plays or changing rewards", () => {
    const legacy = structuredClone(fixture.config); delete legacy.scenes[0]!.playMode;
    const store = createPlayStore(legacy, { copy }); store.getState().hydrate(); store.getState().openScene(scene.slug); finish(store);
    const progress = store.getState().progress, saved = storage.getItem(progressKey);
    store.getState().openScene(scene.slug);
    expect(store.getState().replay).not.toBeNull(); expect(store.getState().mission!.found).toEqual({});
    finish(store);
    expect(store.getState().progress).toBe(progress); expect(storage.getItem(progressKey)).toBe(saved);
  });

  it("a delayed account update can unlock real progress on another board without adopting it into the live replay", async () => {
    const dual = structuredClone(fixture);
    dual.config.scenes.push({ ...structuredClone(scene), slug: "second-board" });
    dual.catalog.boards.push({ ...structuredClone(dual.catalog.boards[0]!), boardSlug: "second-board" });
    const two = attachAdventureBook(dual.config, dual.catalog, [scene.slug, "second-board"]);
    const guest = createPlayStore(two, { copy }); guest.getState().hydrate(); guest.getState().openScene(scene.slug); finish(guest);
    let server = guest.getState().album!;
    server = recordAdventureEvent(server, two.gameId, two.adventure!, { kind: "target-found", boardSlug: "second-board", targetId: scene.targets[0]!.id, variant: "A" }).progress;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const posted: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") posted.push(init.body);
      await gate; return new Response(JSON.stringify({ ok: true, progress: server, revision: 4, changed: false }));
    }));
    const owner = createPlayStore(two, { copy, albumOwner: true }); owner.getState().hydrate();
    owner.getState().replayScene(scene.slug); owner.getState().dispatch({ type: "START", now: 1 });
    release(); await flush();
    expect(sceneFoundIds(owner.getState().progress, two.scenes[1]!)).toHaveLength(1);
    expect(owner.getState().mission!.phase).toBe("searching");
    expect(owner.getState().mission!.found).toEqual({});
    expect(owner.getState().replay?.discoveryIds).toEqual([]);
    expect(posted).toEqual([]); owner.getState().stopAlbumSync();
  });
});
