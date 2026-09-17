import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlayStore } from "../play-store";
import { adventureFixture } from "../../../domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "../../../domain/adventure/compose";
import { emptyAdventureProgress, recordAdventureEvent, type AdventureEvent, type AdventureProgress } from "../../../domain/adventure/progress";
import { sceneFoundIds, sceneIsComplete, type GameProgress } from "../../../domain/game/progress";

/**
 * The album inside the play store: a find and a discovery are each recorded
 * once, kept in this browser, and sent to the family account only for the
 * owner's session. A game without a book has no album at all.
 */
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const copy = { wrongTarget: "no", wrongTargetNoItem: "no", bonus: "b", fallbackSuccess: "found" };
const fixture = adventureFixture(5);
const withBook = attachAdventureBook(fixture.config, fixture.catalog, ["pilot-test"]);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

let storage: MemoryStorage;
let listeners: Record<string, Array<() => void>>;
/** The browser says it is back online. */
const backOnline = () => { for (const fn of listeners.online ?? []) fn(); };
beforeEach(() => {
  storage = new MemoryStorage();
  listeners = {};
  (globalThis as { window?: unknown }).window = {
    localStorage: storage, matchMedia: () => ({ matches: true }),
    addEventListener(type: string, fn: () => void) { (listeners[type] ??= []).push(fn); },
    removeEventListener(type: string, fn: () => void) { listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn); },
  } as never;
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("a guest never talks to the account"); }));
});
afterEach(() => { vi.unstubAllGlobals(); });

function openAndFind(store: ReturnType<typeof createPlayStore>) {
  store.getState().openScene("pilot-test");
  const mission = store.getState().mission!;
  const first = mission.plan.order[0]!;
  store.getState().dispatch({ type: "START", now: 1 });
  store.getState().dispatch({ type: "TAP_TARGET", targetId: first, now: 2 });
  return { first, variant: mission.plan.variants[first] ?? "A" };
}

describe("album in the play store", () => {
  it.each([false, true])("passport link waits for account unlock, without overriding navigation (cancel=%s)", async cancel => {
    const config = structuredClone(withBook);
    const second = { ...structuredClone(config.scenes[0]!), slug: "second-place" };
    config.scenes.push(second);
    // A config without a world map still has the same sequential board gate.
    delete config.world; delete config.worlds;
    config.adventure!.boards.push({ ...structuredClone(config.adventure!.boards[0]!), boardSlug: second.slug });
    let server = emptyAdventureProgress(config.gameId, config.adventure!);
    for (const target of config.scenes[0]!.targets) server = recordAdventureEvent(server, config.gameId, config.adventure!, { kind: "target-found", boardSlug: "pilot-test", targetId: target.id, variant: "A" }).progress;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => { await gate; return new Response(JSON.stringify({ ok: true, progress: server, revision: 1 }), { status: 200 }); }));
    const store = createPlayStore(config, { copy, skipGift: true, albumOwner: true, autoStartScene: second.slug });
    store.getState().hydrate();
    expect(store.getState().screen).toBe("map");
    if (cancel) store.getState().openScene("pilot-test");
    release(); await flush(); await flush();
    expect(store.getState().sceneSlug).toBe(cancel ? "pilot-test" : "second-place");
    store.getState().stopAlbumSync();
  });

  it("records a find once, with the variant on the board, and keeps it in this browser", () => {
    const store = createPlayStore(withBook, { copy });
    store.getState().hydrate();
    expect(store.getState().albumMode).toBe("guest");
    expect(store.getState().album?.finds).toEqual([]);
    const { first, variant } = openAndFind(store);
    expect(store.getState().album?.finds).toEqual([{ boardSlug: "pilot-test", targetId: first, variant }]);
    // A second tap on the same child changes nothing in the album.
    store.getState().dispatch({ type: "TAP_TARGET", targetId: first, now: 3 });
    expect(store.getState().album?.finds).toHaveLength(1);
    const saved = JSON.parse(storage.getItem(`findme:album:v1:${withBook.gameId}`)!) as AdventureProgress;
    expect(saved.finds).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("collects a discovery once, never as a star, and says 'again' after that", () => {
    const store = createPlayStore(withBook, { copy });
    store.getState().hydrate();
    store.getState().openScene("pilot-test");
    expect(store.getState().collectDiscovery("cat")).toBe("collected");
    expect(store.getState().collectDiscovery("cat")).toBe("again");
    expect(store.getState().collectDiscovery("unicorn")).toBe("none");
    expect(store.getState().album?.discoveries).toEqual([{ boardSlug: "pilot-test", discoveryId: "cat" }]);
    expect(store.getState().album?.finds).toEqual([]);
    expect(store.getState().progress.scenes["pilot-test"]?.foundTargetIds ?? []).toEqual([]);
  });

  it("has no album for a game without a book, and none for a private preview", () => {
    const plain = createPlayStore(fixture.config, { copy });
    plain.getState().hydrate();
    expect(plain.getState().albumMode).toBe("none");
    expect(plain.getState().album).toBeNull();
    expect(plain.getState().collectDiscovery("cat")).toBe("none");
    const preview = createPlayStore(withBook, { copy, readOnlyPreview: true });
    preview.getState().hydrate();
    expect(preview.getState().albumMode).toBe("none");
    expect(preview.getState().album).toBeNull();
  });

  it("reports an unreadable saved album instead of quietly starting a fresh one", () => {
    storage.setItem(`findme:album:v1:${withBook.gameId}`, JSON.stringify({ version: 1, gameId: "another-game", book: withBook.adventure, finds: [], discoveries: [] }));
    const store = createPlayStore(withBook, { copy });
    store.getState().hydrate();
    expect(store.getState().album).toBeNull();
    expect(store.getState().albumState).toBe("unreadable");
    expect(store.getState().collectDiscovery("cat")).toBe("none");
  });

  it("owner: sends each find to the account, once, and shows the account's copy", async () => {
    let server = emptyAdventureProgress(withBook.gameId, withBook.adventure!);
    const posted: AdventureEvent[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const { event } = JSON.parse(String(init.body)) as { event: AdventureEvent };
        posted.push(event);
        server = recordAdventureEvent(server, withBook.gameId, withBook.adventure!, event).progress;
      }
      return new Response(JSON.stringify({ ok: true, progress: server, revision: server.finds.length, changed: true }), { status: 200 });
    }));
    const store = createPlayStore(withBook, { copy, albumOwner: true });
    store.getState().hydrate();
    await flush();
    expect(store.getState().albumMode).toBe("owner");
    expect(store.getState().albumState).toBe("saved");
    const { first, variant } = openAndFind(store);
    expect(store.getState().albumState).toBe("saving");
    await flush();
    expect(posted).toEqual([{ kind: "target-found", boardSlug: "pilot-test", targetId: first, variant }]);
    expect(store.getState().albumState).toBe("saved");
    expect(store.getState().album?.finds).toHaveLength(1);
    // A refresh replays nothing: the account already has the find.
    const again = createPlayStore(withBook, { copy, albumOwner: true });
    again.getState().hydrate();
    await flush();
    expect(posted).toHaveLength(1);
    expect(again.getState().album?.finds).toHaveLength(1);
  });

  it("owner: what this browser found before signing in is sent to the account, not dropped", async () => {
    const local = recordAdventureEvent(emptyAdventureProgress(withBook.gameId, withBook.adventure!), withBook.gameId, withBook.adventure!, { kind: "discovery-found", boardSlug: "pilot-test", discoveryId: "cat" }).progress;
    storage.setItem(`findme:album:v1:${withBook.gameId}`, JSON.stringify(local));
    let server = emptyAdventureProgress(withBook.gameId, withBook.adventure!);
    const posted: AdventureEvent[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const { event } = JSON.parse(String(init.body)) as { event: AdventureEvent };
        posted.push(event);
        server = recordAdventureEvent(server, withBook.gameId, withBook.adventure!, event).progress;
      }
      return new Response(JSON.stringify({ ok: true, progress: server, revision: 1, changed: true }), { status: 200 });
    }));
    const store = createPlayStore(withBook, { copy, albumOwner: true });
    store.getState().hydrate();
    await flush();
    await flush();
    expect(posted).toEqual([{ kind: "discovery-found", boardSlug: "pilot-test", discoveryId: "cat" }]);
    expect(store.getState().album?.discoveries).toHaveLength(1);
    expect(server.discoveries).toHaveLength(1);
    expect(store.getState().albumState).toBe("saved");
  });

  it("owner: a refresh while offline keeps what this browser found, and the account gets it once the connection is back", async () => {
    // Found offline, then the page was refreshed while still offline: nothing is queued in memory any more.
    const local = recordAdventureEvent(emptyAdventureProgress(withBook.gameId, withBook.adventure!), withBook.gameId, withBook.adventure!, { kind: "discovery-found", boardSlug: "pilot-test", discoveryId: "cat" }).progress;
    storage.setItem(`findme:album:v1:${withBook.gameId}`, JSON.stringify(local));
    let server = emptyAdventureProgress(withBook.gameId, withBook.adventure!);
    let online = false;
    const posted: AdventureEvent[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (!online) throw new TypeError("network");
      if (init?.method === "POST") {
        const { event } = JSON.parse(String(init.body)) as { event: AdventureEvent };
        posted.push(event);
        server = recordAdventureEvent(server, withBook.gameId, withBook.adventure!, event).progress;
      }
      return new Response(JSON.stringify({ ok: true, progress: server, revision: 1, changed: true }), { status: 200 });
    }));
    const store = createPlayStore(withBook, { copy, albumOwner: true });
    store.getState().hydrate();
    await flush();
    expect(store.getState().albumState).toBe("offline");
    expect(store.getState().album?.discoveries).toHaveLength(1);
    expect(posted).toEqual([]);
    online = true;
    backOnline();
    await flush();
    await flush();
    expect(posted).toEqual([{ kind: "discovery-found", boardSlug: "pilot-test", discoveryId: "cat" }]);
    expect(server.discoveries).toHaveLength(1);
    expect(store.getState().albumState).toBe("saved");
    store.getState().stopAlbumSync();
  });

  it("owner: a fresh browser takes the account's finds into the game itself, and gives nothing of its own up", async () => {
    const book = withBook.adventure!;
    const scene = withBook.scenes[0]!;
    const ids = scene.targets.map((t) => t.id);
    // The account knows four finds from another device; this browser found the fifth on its own.
    let server = emptyAdventureProgress(withBook.gameId, book);
    for (const id of ids.slice(1)) server = recordAdventureEvent(server, withBook.gameId, book, { kind: "target-found", boardSlug: "pilot-test", targetId: id, variant: "B" }).progress;
    const local = recordAdventureEvent(emptyAdventureProgress(withBook.gameId, book), withBook.gameId, book, { kind: "target-found", boardSlug: "pilot-test", targetId: ids[0]!, variant: "A" }).progress;
    storage.setItem(`findme:album:v1:${withBook.gameId}`, JSON.stringify(local));
    const progress: GameProgress = { v: 1, gameId: withBook.gameId, revealed: true, scenes: { "pilot-test": { plays: 0, completed: false, lastVariants: {}, lastOrder: [], noHintClear: false, collectible: false, bonusFound: false, sceneVersion: scene.version, foundTargetIds: [ids[0]!] } } };
    storage.setItem(`findme:progress:v1:${withBook.gameId}`, JSON.stringify(progress));
    const posted: AdventureEvent[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const { event } = JSON.parse(String(init.body)) as { event: AdventureEvent };
        posted.push(event);
        server = recordAdventureEvent(server, withBook.gameId, book, event).progress;
      }
      return new Response(JSON.stringify({ ok: true, progress: server, revision: 1, changed: true }), { status: 200 });
    }));
    const store = createPlayStore(withBook, { copy, albumOwner: true });
    store.getState().hydrate();
    expect(sceneFoundIds(store.getState().progress, scene)).toEqual([ids[0]]);
    await flush();
    await flush();
    // The game agrees with the album: five found, the board complete, the account's variants kept.
    const after = store.getState().progress;
    expect(sceneFoundIds(after, scene)).toEqual(ids);
    expect(sceneIsComplete(after, scene)).toBe(true);
    expect(after.scenes["pilot-test"]?.lastVariants[ids[1]!]).toBe("B");
    expect(after.scenes["pilot-test"]?.lastVariants[ids[0]!]).toBe("A");
    expect(posted).toEqual([{ kind: "target-found", boardSlug: "pilot-test", targetId: ids[0], variant: "A" }]);
    expect(server.finds).toHaveLength(5);
    // The board opens on those finds, not on an empty one; and a refresh keeps them.
    store.getState().openScene("pilot-test");
    expect(Object.keys(store.getState().mission!.found).sort()).toEqual([...ids].sort());
    expect(JSON.parse(storage.getItem(`findme:progress:v1:${withBook.gameId}`)!).scenes["pilot-test"].foundTargetIds).toHaveLength(5);
    store.getState().stopAlbumSync();
  });

  it("owner: a late answer from the account joins the board as it stands; the next child can still be found", async () => {
    const book = withBook.adventure!;
    const scene = withBook.scenes[0]!;
    // The account answers only when released, with a find from another device.
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let server = emptyAdventureProgress(withBook.gameId, book);
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        server = recordAdventureEvent(server, withBook.gameId, book, (JSON.parse(String(init.body)) as { event: AdventureEvent }).event).progress;
        return new Response(JSON.stringify({ ok: true, progress: server, revision: 1, changed: true }), { status: 200 });
      }
      await gate;
      return new Response(JSON.stringify({ ok: true, progress: server, revision: 1, changed: true }), { status: 200 });
    }));
    const store = createPlayStore(withBook, { copy, albumOwner: true });
    store.getState().hydrate();
    store.getState().openScene("pilot-test");
    store.getState().dispatch({ type: "START", now: 1 });
    const order = store.getState().mission!.plan.order;
    const elsewhere = order[0]!;
    server = recordAdventureEvent(server, withBook.gameId, book, { kind: "target-found", boardSlug: "pilot-test", targetId: elsewhere, variant: "B" }).progress;
    release();
    await flush();
    await flush();
    const mission = store.getState().mission!;
    // Still searching (no intro, no restart), the child found elsewhere counted and stepped past.
    expect(mission.phase).toBe("searching");
    expect(Object.keys(mission.found)).toEqual([elsewhere]);
    expect(mission.plan.order[mission.currentIndex]).toBe(order[1]);
    expect(sceneFoundIds(store.getState().progress, scene)).toEqual([elsewhere]);
    // The next child is found by a tap, as ever.
    store.getState().dispatch({ type: "TAP_TARGET", targetId: order[1]!, now: 2 });
    expect(store.getState().mission!.phase).toBe("found");
    expect(Object.keys(store.getState().mission!.found).sort()).toEqual([elsewhere, order[1]!].sort());
    expect(store.getState().album?.finds.map((f) => f.targetId).sort()).toEqual([elsewhere, order[1]!].sort());
    store.getState().stopAlbumSync();
  });

  it("owner: a late answer that completes the board finishes it in one controlled step", async () => {
    const book = withBook.adventure!;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let server = emptyAdventureProgress(withBook.gameId, book);
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== "POST") await gate;
      return new Response(JSON.stringify({ ok: true, progress: server, revision: 1, changed: true }), { status: 200 });
    }));
    const store = createPlayStore(withBook, { copy, albumOwner: true });
    store.getState().hydrate();
    store.getState().openScene("pilot-test");
    store.getState().dispatch({ type: "START", now: 1 });
    for (const id of store.getState().mission!.plan.order) server = recordAdventureEvent(server, withBook.gameId, book, { kind: "target-found", boardSlug: "pilot-test", targetId: id, variant: "A" }).progress;
    release();
    await flush();
    await flush();
    expect(store.getState().mission!.phase).toBe("complete");
    expect(Object.keys(store.getState().mission!.found)).toHaveLength(5);
    store.getState().stopAlbumSync();
  });

  it("says when this browser could not keep the album, instead of claiming it was saved", async () => {
    storage.setItem = () => { throw new Error("QuotaExceededError"); };
    const guest = createPlayStore(withBook, { copy });
    guest.getState().hydrate();
    expect(guest.getState().albumState).toBe("idle");
    guest.getState().openScene("pilot-test");
    expect(guest.getState().collectDiscovery("cat")).toBe("collected");
    expect(guest.getState().album?.discoveries).toHaveLength(1);
    expect(guest.getState().albumState).toBe("unsaved");
    // The owner's browser too, while the account has not confirmed; once it has, the account is the keeper.
    let server = emptyAdventureProgress(withBook.gameId, withBook.adventure!);
    let online = false;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (!online) throw new TypeError("network");
      if (init?.method === "POST") server = recordAdventureEvent(server, withBook.gameId, withBook.adventure!, (JSON.parse(String(init.body)) as { event: AdventureEvent }).event).progress;
      return new Response(JSON.stringify({ ok: true, progress: server, revision: 1, changed: true }), { status: 200 });
    }));
    const owner = createPlayStore(withBook, { copy, albumOwner: true });
    owner.getState().hydrate();
    await flush();
    owner.getState().openScene("pilot-test");
    expect(owner.getState().collectDiscovery("cat")).toBe("collected");
    await flush();
    expect(owner.getState().albumState).toBe("unsaved");
    online = true;
    backOnline();
    for (let i = 0; i < 4; i++) await flush();
    expect(server.discoveries).toHaveLength(1);
    expect(owner.getState().albumState).toBe("saved");
    owner.getState().stopAlbumSync();
  });

  it("owner: a lost connection is not a save", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network"); }));
    const store = createPlayStore(withBook, { copy, albumOwner: true });
    store.getState().hydrate();
    await flush();
    expect(store.getState().albumState).toBe("offline");
    openAndFind(store);
    await flush();
    expect(store.getState().album?.finds).toHaveLength(1);
    expect(store.getState().albumState).toBe("offline");
    store.getState().stopAlbumSync();
  });
});
