// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemoConfig } from "@/services/demo";
import type { GameConfig } from "@/domain/game/config";
import { GameShell } from "../components/GameShell";

vi.mock("../audio/sounds", () => ({ sounds: () => ({ restoreMutePreference: () => false,
  subscribeMuted: () => () => {}, play() {}, stopAmbient() {}, unlock() {}, setScene() {}, startAmbient() {} }), bindGameAudio: () => () => {} }));
vi.mock("../components/GiftReveal", () => ({ GiftReveal: ({ onOpen }: { onOpen: () => void }) => <button onClick={onOpen}>Open gift</button> }));
vi.mock("../components/WorldMap", () => ({ WorldMap: ({ onPassport }: { onPassport: () => void }) => <button onClick={onPassport}>Open passport</button> }));
vi.mock("../components/RoundControls", () => ({ RoundControls: () => null }));
vi.mock("../components/OwnerWorldSelector", () => ({ OwnerWorldSelector: () => null }));
vi.mock("../components/ScenePlayer", () => ({ ScenePlayer: () => <p>Scene entered</p> }));
vi.mock("../components/PassportReaderLoader", () => ({ PassportReaderLoader: () => <p>Passport intent reached</p> }));

class WarmImage {
  static instances: WarmImage[] = [];
  src = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  fetchPriority = "";
  removeAttribute(name: string) { if (name === "src") this.src = ""; }
  constructor() { WarmImage.instances.push(this); }
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("React", React);
  vi.stubGlobal("Image", WarmImage);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(Error("No network in this fixture"))));
  window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never;
  window.localStorage.clear();
  window.history.replaceState({}, "");
  WarmImage.instances = [];
});
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function fixture(): GameConfig {
  const base = structuredClone(buildDemoConfig("en"));
  const scene = base.scenes[0]!;
  return { ...base, child: { ...base.child, avatarUrl: "" }, worlds: undefined, world: undefined, adventure: undefined,
    scenes: [scene, { ...scene, slug: "other-board", art: { ...scene.art, base: "/not-this-board.webp" } }] };
}

describe("shell critical-board warmup", () => {
  it("keeps one bounded low-priority warmup through gift to map, then cancels on passport intent", () => {
    const config = fixture(), view = render(<GameShell config={config} playToken="synthetic-player-capability" />);
    expect(WarmImage.instances).toHaveLength(2);
    expect(WarmImage.instances[0]!.src).toBe(config.scenes[0]!.art.base);
    expect(WarmImage.instances.every(image => image.fetchPriority === "low")).toBe(true);
    expect(WarmImage.instances.some(image => image.src === "/not-this-board.webp")).toBe(false);
    const firstSources = WarmImage.instances.map(image => image.src);
    fireEvent.click(screen.getByRole("button", { name: "Open gift" }));
    expect(WarmImage.instances).toHaveLength(2);
    expect(WarmImage.instances.map(image => image.src)).toEqual(firstSources);
    expect(fetch).not.toHaveBeenCalled(); // No owner passport metadata/photo warmup on the map.
    fireEvent.click(screen.getByRole("button", { name: "Open passport" }));
    expect(screen.getByText("Passport intent reached")).toBeTruthy();
    expect(WarmImage.instances.every(image => image.src === "" && image.onload === null && image.onerror === null)).toBe(true);
    view.unmount();
  });

  it.each([
    {},
    { playToken: "synthetic-player-capability", demo: true },
    { playToken: "synthetic-player-capability", readOnlyPreview: true },
    { playToken: "synthetic-player-capability", friend: { shareId: "synthetic-share", participantId: "synthetic-participant", onProgress: () => {}, onBoardReady: () => {} } },
  ])("does not warm outside the scoped ordinary player/owner flow (%j)", extra => {
    render(<GameShell config={fixture()} skipGift {...extra} />);
    expect(WarmImage.instances).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("also prepares the owner's map without eagerly fetching its passport", () => {
    render(<GameShell config={fixture()} albumOwner skipGift />);
    expect(WarmImage.instances).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
  });
});
