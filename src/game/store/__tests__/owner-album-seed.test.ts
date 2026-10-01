import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlayStore } from "../play-store";
import { adventureFixture } from "../../../domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "../../../domain/adventure/compose";
import { sceneFoundIds, sceneIsComplete } from "../../../domain/game/progress";

// Guy, 2026-10-01: on a device with nothing saved, the owner's map opened with the child at the first place and no
// stars, then walked them across the map when the account answered. The page now brings the account's album along.
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
const account = { finds: scene.targets.map(t => ({ boardSlug: scene.slug, targetId: t.id, variant: "A" as const })), discoveries: [{ boardSlug: scene.slug, discoveryId: "cat" }] };

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: new MemoryStorage(), matchMedia: () => ({ matches: true }), addEventListener() {}, removeEventListener() {} });
  // The account never answers in these tests: whatever the map shows came with the page.
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("the owner's album that comes with the page", () => {
  it("draws the first map from the account, the same on the server and in the browser", () => {
    const first = createPlayStore(config, { copy, albumOwner: true, skipGift: true, initialAlbum: account });
    const again = createPlayStore(config, { copy, albumOwner: true, skipGift: true, initialAlbum: account });
    expect(sceneIsComplete(first.getState().progress, scene)).toBe(true);
    expect(first.getState().album!.discoveries).toEqual(account.discoveries);
    expect(JSON.stringify(again.getState().progress)).toBe(JSON.stringify(first.getState().progress));
  });

  it("keeps the child where the account says after hydrating on a device with nothing saved, before the account answers", () => {
    const store = createPlayStore(config, { copy, albumOwner: true, skipGift: true, initialAlbum: account });
    store.getState().hydrate();
    expect(store.getState().screen).toBe("map");
    expect(sceneFoundIds(store.getState().progress, scene)).toHaveLength(3);
    expect(store.getState().album!.finds).toHaveLength(3);
    store.getState().stopAlbumSync();
  });

  it("is never taken by a guest, and ignores content from another book", () => {
    const guest = createPlayStore(config, { copy, skipGift: true, initialAlbum: account });
    expect(sceneFoundIds(guest.getState().progress, scene)).toHaveLength(0);
    expect(guest.getState().album).toBeNull();
    const foreign = createPlayStore(config, { copy, albumOwner: true, skipGift: true, initialAlbum: { finds: [{ boardSlug: "elsewhere", targetId: "x", variant: "A" }], discoveries: [] } });
    expect(sceneFoundIds(foreign.getState().progress, scene)).toHaveLength(0);
    expect(foreign.getState().album).toBeNull();
  });
});
