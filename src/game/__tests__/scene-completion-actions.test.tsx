// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "zustand";
import { adventureFixture } from "@/domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "@/domain/adventure/compose";
import { adventureAlbum } from "@/domain/adventure/progress";
import { currentTargetId } from "@/domain/game/mission";
import { getDict } from "@/i18n";
import { GameI18nProvider } from "../i18n";
import { ScenePlayer } from "../components/ScenePlayer";
import { createPlayStore } from "../store/play-store";

// The real player, completion transitions and earned album are exercised.
// Browser image loading and camera layout are supplied locally, with no I/O.
const camera = vi.hoisted(() => ({ transform: { tx: 0, ty: 0, scale: 1 }, live() { return this.transform; }, viewport: { width: 1280, height: 800 }, fit: 1,
  isDragging: false, bind: {}, reset: vi.fn(), focusOn: vi.fn(), zoomBy: vi.fn() }));
vi.mock("../engine/useViewport", () => ({ useViewport: () => camera }));
vi.mock("next/image", () => ({ default: ({ unoptimized: _u, fill: _f, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean; fill?: boolean }) => <img {...props} /> }));
const audio = vi.hoisted(() => ({ muted: true, restoreMutePreference: () => true, subscribeMuted: () => () => {},
  unlock: vi.fn(), play: vi.fn(), setScene: vi.fn(), startAmbient: vi.fn(), stopAmbient: vi.fn() }));
vi.mock("../audio/sounds", () => ({ sounds: () => audio }));

class LoadedImage {
  static instances: LoadedImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  resolveDecode!: () => void;
  decode = () => new Promise<void>(resolve => { this.resolveDecode = resolve; });
  constructor() { LoadedImage.instances.push(this); }
}

beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("Image", LoadedImage); LoadedImage.instances = [];
  vi.useFakeTimers(); localStorage.clear();
  window.matchMedia = (() => ({ matches: true, addEventListener() {}, removeEventListener() {} })) as never;
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

async function completedPopup(locale: "en" | "he") {
  const { config: original, catalog } = adventureFixture(5);
  const authored = catalog.boards[0]!;
  if (authored.status !== "ready") throw Error("Synthetic ready board required");
  authored.boardSlug = "greatwall"; authored.collectionUi = "guided-v1";
  catalog.boards.push({ ...structuredClone(authored), boardSlug: "paris", postcard: { ...authored.postcard, id: "paris-postcard" } });
  const scene = { ...original.scenes[0]!, slug: "greatwall", name: locale === "en" ? "The Great Wall" : "החומה הסינית" };
  const config = attachAdventureBook({ ...original, gameId: `synthetic-completion-actions-${locale}`, locale,
    scenes: [scene, { ...structuredClone(scene), slug: "paris", name: locale === "en" ? "Paris" : "פריז" }] }, catalog, ["greatwall", "paris"]);
  const copy = { wrongTarget: "no", wrongTargetNoItem: "no", bonus: "bonus", fallbackSuccess: "found" };
  const store = createPlayStore(config, { copy, skipGift: true });
  store.getState().hydrate(); store.getState().openScene(scene.slug);
  function Player() {
    const state = useStore(store), active = state.scene();
    return <GameI18nProvider locale={locale}>{state.screen === "scene" && active && state.mission
      ? <ScenePlayer key={`${active.slug}:${state.visitId}`} scene={active} mission={state.mission} store={state} onBack={state.goToMap} onSceneComplete={state.completeScene} /> : null}</GameI18nProvider>;
  }
  const view = render(<Player />);
  await act(async () => { for (const image of LoadedImage.instances) { image.onload?.(); image.resolveDecode?.(); } });
  act(() => vi.advanceTimersByTime(1000));
  expect(store.getState().mission!.phase).toBe("searching");
  for (let count = 0; count < scene.targets.length; count++) {
    act(() => store.getState().dispatch({ type: "TAP_TARGET", targetId: currentTargetId(store.getState().mission!)!, now: Date.now() }));
    act(() => vi.advanceTimersByTime(2200));
    act(() => vi.advanceTimersByTime(560));
    act(() => vi.advanceTimersByTime(160));
    act(() => vi.advanceTimersByTime(901));
  }
  const dialog = view.getByRole("dialog");
  expect(store.getState().progress.scenes[scene.slug]!.completed).toBe(true);
  const album = store.getState().album!;
  expect(adventureAlbum(album).postcards.collected).toBe(1);
  expect(album.finds).toHaveLength(5);
  return { view, store, scene, dialog, album };
}

describe("completion popup keeps its place and earned progress", () => {
  it("records the earned completion before a failed fanfare and still opens the completion card", async () => {
    let keptAtFanfare = false;
    audio.play.mockImplementation(cue => {
      if (cue !== "fanfare") return;
      const progress = JSON.parse(localStorage.getItem("findme:progress:v1:synthetic-completion-actions-en") ?? "null");
      keptAtFanfare = progress?.scenes.greatwall.completed === true;
      throw new Error("Synthetic unavailable audio device");
    });
    try {
      const { dialog, store, scene } = await completedPopup("en");
      expect(keptAtFanfare).toBe(true);
      expect(dialog).toBeTruthy();
      expect(store.getState().progress.scenes[scene.slug]!.completed).toBe(true);
    } finally { audio.play.mockReset(); }
  });

  it.each(["en", "he"] as const)("shows the place emblem/name, then opens the next board directly in %s", async locale => {
    const { view, store, scene, dialog, album } = await completedPopup(locale);
    const place = dialog.querySelector(".complete__place")!;
    expect(place.querySelectorAll("svg.place-emblem")).toHaveLength(1);
    expect(place.querySelector(".complete__place-emblem")?.getAttribute("aria-hidden")).toBe("true");
    expect(place.querySelector(".complete__place-name")?.textContent).toBe(scene.name);
    expect(dialog.querySelector(".postcard")).toBeNull();
    expect(dialog.textContent).not.toContain(getDict(locale).game.album.postcardEarned);
    expect(dialog.textContent).not.toContain(album.book.boards[0]!.postcard.title);
    const earnedScene = structuredClone(store.getState().progress.scenes[scene.slug]);

    fireEvent.click(within(dialog).getByRole("button", { name: getDict(locale).game.complete.next }));

    expect(store.getState().screen).toBe("scene");
    expect(store.getState().sceneSlug).toBe("paris");
    expect(view.queryByRole("dialog")).toBeNull();
    expect(store.getState().progress.scenes[scene.slug]).toEqual(earnedScene);
    expect(store.getState().album).toBe(album);
    expect(adventureAlbum(store.getState().album!).postcards.collected).toBe(1);
  });

  it.each(["en", "he"] as const)("Stay returns to the finished board and lets its missing discovery join the same album in %s", async locale => {
    const { view, store, scene, dialog, album } = await completedPopup(locale);
    const progress = store.getState().progress;

    fireEvent.click(within(dialog).getByRole("button", { name: getDict(locale).game.collection.keepMoreOne }));

    expect(view.queryByRole("dialog")).toBeNull();
    expect(store.getState().screen).toBe("scene");
    expect(store.getState().sceneSlug).toBe(scene.slug);
    expect(store.getState().mission!.phase).toBe("complete");
    expect(store.getState().replay).toBeNull();
    expect(store.getState().progress).toBe(progress);
    expect(store.getState().album).toBe(album);
    act(() => { expect(store.getState().collectDiscovery("cat")).toBe("collected"); });
    expect(store.getState().album!.discoveries).toEqual([{ boardSlug: scene.slug, discoveryId: "cat" }]);
    expect(store.getState().album!.finds).toEqual(album.finds);
    expect(adventureAlbum(store.getState().album!).postcards.collected).toBe(1);
  });

  it.each(["en", "he"] as const)("Replay starts an empty search without changing saved finds or their postcard in %s", async locale => {
    const { view, store, scene, dialog, album } = await completedPopup(locale);
    const progress = store.getState().progress;
    const savedProgress = localStorage.getItem(`findme:progress:v1:${store.getState().config.gameId}`);
    const savedAlbum = localStorage.getItem(`findme:album:v1:${store.getState().config.gameId}`);
    const plan = store.getState().mission!.plan;
    const label = getDict(locale).game.replay.boardAria.replace("{place}", scene.name);

    fireEvent.click(within(dialog).getByRole("button", { name: label }));

    expect(view.queryByRole("dialog")).toBeNull();
    expect(store.getState().sceneSlug).toBe(scene.slug);
    expect(store.getState().round?.active).toBe(true);
    expect(store.getState().replay?.discoveryIds).toEqual([]);
    expect(store.getState().mission!.found).toEqual({});
    expect(store.getState().mission!.plan.order).toEqual(plan.order);
    expect(store.getState().mission!.plan.variants).toEqual(plan.variants);
    expect(store.getState().progress).toBe(progress);
    expect(store.getState().album).toBe(album);
    expect(localStorage.getItem(`findme:progress:v1:${store.getState().config.gameId}`)).toBe(savedProgress);
    expect(localStorage.getItem(`findme:album:v1:${store.getState().config.gameId}`)).toBe(savedAlbum);
    expect(adventureAlbum(store.getState().album!).postcards.collected).toBe(1);
  });
});
