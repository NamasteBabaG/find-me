import { describe, expect, it } from "vitest";
import { ADVENTURE_PILOT } from "../../../../content/adventures";
import { GameConfigSchema } from "../../game/config";
import { AdventureCatalogSchema, AdventureRect } from "../content";
import { AdventureBookSchema } from "../book-schema";
import { attachAdventureBook } from "../compose";
import { adventureAlbum, emptyAdventureProgress, readAdventureProgress, recordAdventureEvent, type AdventureEvent } from "../progress";
import { cropPixels, discoveryAt } from "../geometry";
import { adventureFixture } from "./fixture";

function setup(count: 4 | 5 = 5) {
  const { config, catalog } = adventureFixture(count);
  const attached = attachAdventureBook(config, catalog, ["pilot-test"]);
  const book = attached.adventure!;
  return { config: attached, book, progress: emptyAdventureProgress(config.gameId, book) };
}

describe("search-board adventure authoring and explicit opt-in", () => {
  it("keeps all three future art studies planned, without fabricated coordinates/assets", () => {
    expect(ADVENTURE_PILOT.boards).toHaveLength(3);
    expect(ADVENTURE_PILOT.boards.every(b => b.status === "planned" && !("art" in b) && !("discoveries" in b))).toBe(true);
    const { config } = adventureFixture();
    config.scenes[0]!.slug = ADVENTURE_PILOT.boards[0]!.boardSlug;
    expect(() => attachAdventureBook(config, ADVENTURE_PILOT, [config.scenes[0]!.slug])).toThrow("not-ready");
  });
  it("leaves old configs opt-out and compiles a separate localised snapshot", () => {
    const { config, catalog } = adventureFixture();
    config.locale = "he";
    const before = JSON.stringify(config);
    const next = attachAdventureBook(config, catalog, ["pilot-test"]);
    expect(next.adventure!.boards[0]!.discoveries[0]!.name).toBe("החתול של הסל");
    expect(JSON.stringify(config)).toBe(before);
    expect(GameConfigSchema.parse(config).adventure).toBeUndefined();
    expect(next.scenes).toEqual(config.scenes);
    expect(() => attachAdventureBook(next, catalog, ["pilot-test"])).toThrow("existing-book-is-immutable");
  });
  it("never adds an unowned board or duplicates a selected board", () => {
    const { config, catalog } = adventureFixture();
    expect(() => attachAdventureBook(config, catalog, ["not-purchased"])).toThrow("not-owned");
    expect(() => attachAdventureBook(config, catalog, ["pilot-test", "pilot-test"])).toThrow("board-selection");
    expect(() => attachAdventureBook(config, catalog, [])).toThrow("board-selection");
  });
  it("rejects stale art versions, wrong dimensions and a different world", () => {
    for (const change of ["version", "dimensions", "world", "base", "draft"] as const) {
      const { config, catalog } = adventureFixture();
      const scene = config.scenes[0]!;
      if (change === "version") scene.version++;
      if (change === "dimensions") scene.art.height++;
      if (change === "world") scene.worldSlug = "other";
      if (change === "base") scene.art.base = "/scenes/other/base.png";
      if (change === "draft") scene.artStatus = "draft";
      expect(() => attachAdventureBook(config, catalog, [scene.slug])).toThrow("content-mismatch");
    }
  });
  it("does not permit new content to disagree with the delivered target count", () => {
    const { config } = setup();
    config.adventure!.boards[0]!.targetIds.pop();
    expect(GameConfigSchema.safeParse(config).success).toBe(false);
  });
  it("binds the actual patch and avatar, while permitting signature renewal", () => {
    const { config } = setup();
    const target = config.scenes[0]!.targets[0]!;
    if (target.sprite.kind !== "image") throw new Error("fixture");
    target.sprite.url += "?e=123&s=renewed-signature";
    config.child.avatarUrl += "?e=123&s=renewed-signature";
    expect(GameConfigSchema.safeParse(config).success).toBe(true);
    const copied = structuredClone(config);
    target.sprite.url = "/api/assets/replaced-picture";
    expect(GameConfigSchema.safeParse(config).success).toBe(false);
    copied.child.avatarUrl = "/api/assets/other-child";
    expect(GameConfigSchema.safeParse(copied).success).toBe(false);
  });
  it("does not silently rebind earned postcards after the crop geometry changes", () => {
    const { config } = setup();
    const sprite = config.scenes[0]!.targets[0]!.sprite;
    if (sprite.kind !== "image" || !sprite.hitRect) throw new Error("fixture");
    sprite.hitRect.x += .01;
    expect(GameConfigSchema.safeParse(config).success).toBe(false);
  });
  it("rejects art, flip and adjustment drift after enrollment", () => {
    for (const drift of ["art", "size", "flip", "adjust"] as const) {
      const { config } = setup();
      const scene = config.scenes[0]!;
      if (drift === "art") scene.art.base = "/scenes/pilot-test/new.png";
      if (drift === "size") scene.art.height++;
      if (drift === "flip") scene.targets[0]!.slots[0].flip = true;
      if (drift === "adjust") scene.targets[0]!.adjust = { dx: .01, dy: 0, scale: 1 };
      expect(GameConfigSchema.safeParse(config).success).toBe(false);
    }
  });
  it("requires bilingual copy and rejects out-of-art rectangles", () => {
    const { catalog } = adventureFixture();
    const raw = JSON.parse(JSON.stringify(catalog));
    delete raw.boards[0].discoveries[0].name.he;
    expect(AdventureCatalogSchema.safeParse(raw).success).toBe(false);
    expect(AdventureRect.safeParse({ x: .95, y: .1, w: .1, h: .1 }).success).toBe(false);
    expect(AdventureRect.safeParse({ x: .1, y: .9, w: .1, h: .2 }).success).toBe(false);
    expect(AdventureRect.safeParse({ x: 1, y: .1, w: 1e-12, h: .1 }).success).toBe(false);
  });
  it("also refuses malformed direct book inputs, not just compiler inputs", () => {
    const { book } = setup();
    const item = book.boards[0]!.discoveries[0]!;
    item.descriptionKind = "fact";
    expect(AdventureBookSchema.safeParse(book).success).toBe(false);
    item.sourceUrl = "https://example.org/verified-fact";
    expect(AdventureBookSchema.safeParse(book).success).toBe(true);
    book.boards[0]!.discoveries.push({ ...item, id: "overlap" });
    expect(AdventureBookSchema.safeParse(book).success).toBe(false);
  });
  it("rejects guessed geometry on a planned board", () => {
    const raw = structuredClone(ADVENTURE_PILOT);
    Object.assign(raw.boards[0]!, { discoveries: [] });
    expect(AdventureCatalogSchema.safeParse(raw).success).toBe(false);
  });
  it("protects the entire discovery card, not merely its clickable centre", () => {
    const { catalog } = adventureFixture();
    const board = catalog.boards[0]!;
    if (board.status !== "ready") throw new Error("fixture");
    board.personalZones.push({ x: .7, y: .1, w: .02, h: .02 });
    expect(AdventureCatalogSchema.safeParse(catalog).success).toBe(false);
  });
  it("rejects overlapping discoveries and cards that cut their object", () => {
    const { catalog } = adventureFixture();
    const board = catalog.boards[0]!;
    if (board.status !== "ready") throw new Error("fixture");
    board.discoveries.push({ ...structuredClone(board.discoveries[0]!), id: "second-cat" });
    expect(AdventureCatalogSchema.safeParse(catalog).success).toBe(false);
    board.discoveries.pop();
    board.discoveries[0]!.cardCrop = { x: .75, y: .15, w: .01, h: .01 };
    expect(AdventureCatalogSchema.safeParse(catalog).success).toBe(false);
  });
  it("checks actual B patches too, not only the authored zones or A patch", () => {
    const { config, catalog } = adventureFixture();
    const target = config.scenes[0]!.targets[0]!;
    if (target.sprite.kind !== "image") throw new Error("fixture");
    target.spriteByVariant = { B: { ...target.sprite, rect: { x: .7, y: .1, w: .15, h: .2 } } };
    expect(() => attachAdventureBook(config, catalog, ["pilot-test"])).toThrow("unsafe-layout");
  });
  it("rejects unsafe adjustments, foreground, ambient overlaps and a cut-off postcard", () => {
    for (const change of ["adjust", "flip", "foreground", "ambient", "postcard"] as const) {
      const { config, catalog } = adventureFixture();
      const scene = config.scenes[0]!, board = catalog.boards[0]!;
      if (board.status !== "ready") throw new Error("fixture");
      if (change === "adjust") scene.targets[0]!.adjust = { dx: .1, dy: 0, scale: 1 };
      if (change === "flip") scene.targets[0]!.slots[0].flip = true;
      if (change === "foreground") scene.art.foreground = "/scenes/pilot-test/foreground.png";
      if (change === "ambient") scene.ambient = [{ id: "cover", x: .7, y: .1, w: .1, h: .1, label: "cover", animation: "hop", cooldownMs: 1500 }];
      if (change === "postcard") board.postcard.crop = { x: .12, y: .6, w: .1, h: .1 };
      expect(() => attachAdventureBook(config, catalog, ["pilot-test"])).toThrow("unsafe-layout");
    }
  });
});

describe("collection rules", () => {
  it.each([4, 5] as const)("advances at three but awards a postcard only at all %i actual finds", count => {
    const s = setup(count);
    let state = s.progress;
    for (let n = 1; n <= count; n++) {
      state = recordAdventureEvent(state, s.config.gameId, s.book, { kind: "target-found", boardSlug: "pilot-test", targetId: `hide-${n}`, variant: "B" }).progress;
      const board = adventureAlbum(state).boards[0]!;
      expect(board.canAdvance).toBe(n >= 3);
      expect(board.complete).toBe(n === count);
      expect(Boolean(board.postcard)).toBe(n === count);
      expect(board.stars).toEqual({ found: n, total: count });
    }
    expect(adventureAlbum(state).boards[0]!.postcard).toMatchObject({ targetId: "hide-1", variant: "B" });
    expect(adventureAlbum(state).complete).toBe(true);
    expect(adventureAlbum(state).allDiscoveries).toBe(false); // bonus cannot block board completion
  });
  it("permits a discovery before any child find, once, without awarding a star", () => {
    const s = setup();
    const event: AdventureEvent = { kind: "discovery-found", boardSlug: "pilot-test", discoveryId: "cat" };
    const first = recordAdventureEvent(s.progress, s.config.gameId, s.book, event);
    const replay = recordAdventureEvent(first.progress, s.config.gameId, s.book, event);
    expect(first.changed).toBe(true);
    expect(replay.changed).toBe(false);
    expect(adventureAlbum(replay.progress)).toMatchObject({ stars: { found: 0, total: 5 }, discoveries: { collected: 1, total: 1 }, postcards: { collected: 0 } });
  });
  it("a repeated find/replay cannot change the variant of the earned memory", () => {
    const s = setup();
    const first = recordAdventureEvent(s.progress, s.config.gameId, s.book, { kind: "target-found", boardSlug: "pilot-test", targetId: "hide-1", variant: "A" });
    const next = recordAdventureEvent(first.progress, s.config.gameId, s.book, { kind: "target-found", boardSlug: "pilot-test", targetId: "hide-1", variant: "B" });
    expect(next.changed).toBe(false);
    expect(next.progress.finds).toEqual(first.progress.finds);
  });
  it("rejects nonexistent rewards and unowned boards", () => {
    const s = setup();
    expect(() => recordAdventureEvent(s.progress, s.config.gameId, s.book, { kind: "target-found", boardSlug: "pilot-test", targetId: "invented", variant: "A" })).toThrow("invalid-event");
    expect(() => recordAdventureEvent(s.progress, s.config.gameId, s.book, { kind: "discovery-found", boardSlug: "pilot-test", discoveryId: "invented" })).toThrow("invalid-event");
    expect(() => recordAdventureEvent(s.progress, s.config.gameId, s.book, { kind: "discovery-found", boardSlug: "unowned", discoveryId: "cat" })).toThrow("not-owned");
  });
  it("never interprets corruption, another game, or a changed release as empty progress", () => {
    const s = setup();
    expect(() => readAdventureProgress({}, s.config.gameId, s.book)).toThrow("corrupt-progress");
    expect(() => readAdventureProgress(s.progress, "another-game", s.book)).toThrow("wrong-book");
    expect(() => readAdventureProgress(s.progress, s.config.gameId, { ...s.book, releaseId: "v2" })).toThrow("wrong-book");
    const changed = structuredClone(s.book);
    changed.boards[0]!.discoveries[0]!.hitRect.x -= .01;
    expect(() => readAdventureProgress(s.progress, s.config.gameId, changed)).toThrow("wrong-book");
  });
  it("rejects fabricated or duplicated saved find IDs", () => {
    const s = setup();
    expect(() => readAdventureProgress({ ...s.progress, finds: [{ boardSlug: "pilot-test", targetId: "fake", variant: "A" }] }, s.config.gameId, s.book)).toThrow("corrupt-progress");
    const find = { boardSlug: "pilot-test", targetId: "hide-1", variant: "A" };
    expect(() => readAdventureProgress({ ...s.progress, finds: [find, find] }, s.config.gameId, s.book)).toThrow("corrupt-progress");
  });
  it("retains progress over a JSON round trip and independent of object key order", () => {
    const s = setup();
    const saved = recordAdventureEvent(s.progress, s.config.gameId, s.book, { kind: "discovery-found", boardSlug: "pilot-test", discoveryId: "cat" }).progress;
    const reversed = Object.fromEntries(Object.entries(s.book).reverse());
    expect(readAdventureProgress({ ...JSON.parse(JSON.stringify(saved)), book: reversed }, s.config.gameId, s.book)).toEqual(saved);
  });
  it("scopes shared discovery IDs by board and counts only enrolled boards", () => {
    const s = setup();
    s.book.boards.push({ ...structuredClone(s.book.boards[0]!), boardSlug: "second-board" });
    const start = emptyAdventureProgress(s.config.gameId, s.book);
    const saved = recordAdventureEvent(start, s.config.gameId, s.book, { kind: "discovery-found", boardSlug: "pilot-test", discoveryId: "cat" }).progress;
    expect(adventureAlbum(saved).discoveries).toEqual({ collected: 1, total: 2 });
    expect(adventureAlbum(saved).boards[1]!.discoveries[0]!.collected).toBe(false);
  });
  it("hits the same normalised object on 16:9 art; ambiguity never selects the first", () => {
    const s = setup(), board = s.book.boards[0]!;
    expect(discoveryAt(board, .76, .17)).toBe("cat");
    expect(discoveryAt(board, .5, .5)).toBeNull();
    expect(discoveryAt(board, NaN, .17)).toBeNull();
    const twin = { ...structuredClone(board.discoveries[0]!), id: "twin" };
    expect(discoveryAt({ ...board, discoveries: [...board.discoveries, twin] }, .76, .17)).toBeNull();
    expect(cropPixels({ x: .1, y: .2, w: .2, h: .3 }, 600, 900)).toEqual({ left: 60, top: 180, width: 120, height: 270 });
  });
});
