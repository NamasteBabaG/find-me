import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlayStore } from "../play-store";
import { adventureFixture } from "../../../domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "../../../domain/adventure/compose";
import { emptyAdventureProgress, recordAdventureEvent, type AdventureEvent, type AdventureProgress } from "../../../domain/adventure/progress";

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
beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as { window?: unknown }).window = { localStorage: storage, matchMedia: () => ({ matches: true }), addEventListener() {}, removeEventListener() {} } as never;
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
