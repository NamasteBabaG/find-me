// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adventureFixture } from "../../../domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "../../../domain/adventure/compose";
import { adventureAlbum, emptyAdventureProgress, recordAdventureEvent } from "../../../domain/adventure/progress";
import { GameI18nProvider } from "../../i18n";
import { AlbumCrop, AlbumSection, Postcard } from "../Album";

const fixture = adventureFixture(5), config = attachAdventureBook(fixture.config, fixture.catalog, ["pilot-test"]);
const scene = config.scenes[0]!, book = config.adventure!;
let progress = emptyAdventureProgress(config.gameId, book);
for (const targetId of book.boards[0]!.targetIds) progress = recordAdventureEvent(progress, config.gameId, book,
  { kind: "target-found", boardSlug: scene.slug, targetId, variant: "A" }).progress;
progress = recordAdventureEvent(progress, config.gameId, book,
  { kind: "discovery-found", boardSlug: scene.slug, discoveryId: "cat" }).progress;
const postcard = adventureAlbum(progress).boards[0]!.postcard!;
const observers: NearbyObserver[] = [];
class NearbyObserver {
  element: Element | null = null;
  observe = vi.fn((element: Element) => { this.element = element; });
  disconnect = vi.fn();
  constructor(private callback: IntersectionObserverCallback, readonly options?: IntersectionObserverInit) { observers.push(this); }
  enter(visible: boolean) {
    this.callback([{ target: this.element!, isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}
const crop = { x: 0.2, y: 0.3, w: 0.4, h: 0.25 };
const pictureGeometry = (element: HTMLElement) => ({ aspect: element.style.aspectRatio, size: element.style.backgroundSize, position: element.style.backgroundPosition });

beforeEach(() => { observers.length = 0; vi.stubGlobal("React", React); vi.stubGlobal("IntersectionObserver", NearbyObserver); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("only nearby legacy album pictures hold board pixels", () => {
  it("holds a labelled crop's geometry without image children until nearby, then releases it again", () => {
    const view = render(<AlbumCrop art={scene.art} crop={crop} label="Synthetic crop" lazy><img src="/synthetic-patch.png" alt="" /></AlbumCrop>);
    const picture = view.getByRole("img", { name: "Synthetic crop" });
    const geometry = pictureGeometry(picture);
    expect(geometry.aspect).toBe(`${crop.w * scene.art.width} / ${crop.h * scene.art.height}`);
    expect(picture.style.backgroundImage).toBe("");
    expect(picture.querySelector("img")).toBeNull();
    expect(observers).toHaveLength(1);
    expect(observers[0]!.options).toEqual({ rootMargin: "300px" });
    expect(observers[0]!.observe).toHaveBeenCalledWith(picture);
    act(() => observers[0]!.enter(true));
    expect(picture.style.backgroundImage).toContain(scene.art.base);
    expect(picture.querySelector("img")?.getAttribute("src")).toBe("/synthetic-patch.png");
    expect(pictureGeometry(picture)).toEqual(geometry);
    act(() => observers[0]!.enter(false));
    expect(picture.style.backgroundImage).toBe("");
    expect(picture.querySelector("img")).toBeNull();
    expect(pictureGeometry(picture)).toEqual(geometry);
    expect(picture.getAttribute("aria-label")).toBe("Synthetic crop");
    act(() => observers[0]!.enter(true));
    expect(picture.querySelector("img")).toBeTruthy();
    view.unmount();
    expect(observers[0]!.disconnect).toHaveBeenCalledOnce();
  });

  it("shows the exact eager postcard patch geometry when nearby, keeping its caption and box while offscreen", () => {
    const eager = render(<GameI18nProvider locale="en"><Postcard scene={scene} postcard={postcard} /></GameI18nProvider>);
    const expectedPatch = eager.container.querySelector<HTMLImageElement>(".postcard__patch")!;
    const geometry = expectedPatch.style.cssText, src = expectedPatch.getAttribute("src");
    expect(expectedPatch.getAttribute("loading")).toBeNull();
    expect(expectedPatch.getAttribute("decoding")).toBeNull();
    expect(observers).toHaveLength(0);
    eager.unmount();
    const view = render(<GameI18nProvider locale="en"><Postcard scene={scene} postcard={postcard} lazy /></GameI18nProvider>);
    const picture = view.container.querySelector<HTMLElement>(".postcard__picture")!;
    const box = pictureGeometry(picture), label = picture.getAttribute("aria-label");
    expect(picture.style.backgroundImage).toBe("");
    expect(view.container.querySelector(".postcard__patch")).toBeNull();
    expect(view.container.querySelector("figcaption")?.textContent).toBe(postcard.title);
    act(() => observers[0]!.enter(true));
    const patch = view.container.querySelector<HTMLImageElement>(".postcard__patch")!;
    expect(picture.style.backgroundImage).toContain(scene.art.base);
    expect(patch.style.cssText).toBe(geometry);
    expect(patch.getAttribute("src")).toBe(src);
    expect(patch.getAttribute("loading")).toBe("lazy"); expect(patch.getAttribute("decoding")).toBe("async");
    act(() => observers[0]!.enter(false));
    expect(picture.style.backgroundImage).toBe("");
    expect(view.container.querySelector(".postcard__patch")).toBeNull();
    expect(pictureGeometry(picture)).toEqual(box);
    expect(picture.getAttribute("aria-label")).toBe(label);
    expect(view.container.querySelector("figcaption")?.textContent).toBe(postcard.title);
  });

  it("makes legacy album postcards and collected discovery crops lazy independently", () => {
    const before = structuredClone(progress);
    const view = render(<GameI18nProvider locale="en"><AlbumSection config={config} album={progress} mode="guest" state="idle" /></GameI18nProvider>);
    const pictures = [...view.container.querySelectorAll<HTMLElement>(".album__crop")];
    expect(pictures).toHaveLength(2);
    expect(observers).toHaveLength(pictures.length);
    expect(pictures.every(picture => !picture.style.backgroundImage)).toBe(true);
    expect(view.container.querySelector(".postcard__patch")).toBeNull();
    const discovery = view.container.querySelector<HTMLElement>(".sticker__picture")!;
    const observer = observers.find(value => value.element === discovery)!;
    act(() => observer.enter(true));
    expect(discovery.style.backgroundImage).toContain(scene.art.base);
    expect(view.container.querySelector<HTMLElement>(".postcard__picture")!.style.backgroundImage).toBe("");
    expect(progress).toEqual(before);
    view.unmount();
    expect(observers.every(value => value.disconnect.mock.calls.length === 1)).toBe(true);
  });

  it("keeps ordinary collection crops eager without observing them", () => {
    const view = render(<AlbumCrop art={scene.art} crop={crop}><img src="/synthetic-live-patch.png" alt="" /></AlbumCrop>);
    const picture = view.container.querySelector<HTMLElement>(".album__crop")!;
    expect(picture.style.backgroundImage).toContain(scene.art.base);
    expect(picture.querySelector("img")).toBeTruthy();
    expect(picture.getAttribute("aria-hidden")).toBe("true");
    expect(observers).toHaveLength(0);
  });

  it("falls back to eager rendering when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const view = render(<GameI18nProvider locale="en"><Postcard scene={scene} postcard={postcard} lazy /></GameI18nProvider>);
    expect(view.container.querySelector<HTMLElement>(".postcard__picture")!.style.backgroundImage).toContain(scene.art.base);
    expect(view.container.querySelector(".postcard__patch")).toBeTruthy();
    expect(observers).toHaveLength(0);
  });
});
