// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameShell } from "../../components/GameShell";
import { createPlayStore } from "../../store/play-store";
import { sounds } from "../sounds";
import { buildDemoConfig } from "../../../services/demo";
import { getDict } from "../../../i18n";
import { MUTE_PREFERENCE_KEY } from "../mute-preference";

beforeEach(() => {
  localStorage.clear(); sounds().setMuted(false);
  vi.stubGlobal("React", React);
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
});
afterEach(() => { cleanup(); sounds().setMuted(false); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("game audio is reached from real UI handlers", () => {
  it("binds mobile capture on the actual game shell and removes it on unmount", () => {
    const unlock = vi.spyOn(sounds(), "unlock");
    const config = buildDemoConfig("en", "sydney", "Test");
    const view = render(<GameShell config={config} readOnlyPreview />);
    const button = view.getByRole("button", { name: getDict("en").game.gift.open });
    fireEvent.touchEnd(button); expect(unlock).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(button, { key: "Enter" }); expect(unlock).toHaveBeenCalledTimes(2);
    const element = view.container.querySelector(".game")!;
    view.unmount(); fireEvent.touchEnd(element); expect(unlock).toHaveBeenCalledTimes(2);
  });

  it("unmuting from the store retries unlock AFTER clearing the chosen mute", () => {
    const manager = sounds(), observed: boolean[] = [];
    const unlock = vi.spyOn(manager, "unlock").mockImplementation(() => { observed.push(manager.muted); });
    const store = createPlayStore(buildDemoConfig("en", "sydney", "Test"), { readOnlyPreview: true, copy: getDict("en").game.copy });
    store.getState().toggleMute(); expect(store.getState().muted).toBe(true); expect(unlock).not.toHaveBeenCalled();
    store.getState().toggleMute(); expect(store.getState().muted).toBe(false); expect(observed).toEqual([false]);
  });

  it.each(["ordinary", "demo", "preview"] as const)("a newly hydrated %s aligns its speaker with the shared saved mute, without turning sound on", kind => {
    const manager = sounds(); manager.setMuted(true);
    const unlock = vi.spyOn(manager, "unlock"), config = { ...buildDemoConfig("en", "sydney", "Test"), gameId: `audio-switch-${kind}` };
    const store = createPlayStore(config, { demo: kind === "demo", readOnlyPreview: kind === "preview", copy: getDict("en").game.copy });
    // Construction remains server-render safe; preferences arrive after mount.
    expect(store.getState().muted).toBe(false);
    store.getState().hydrate(); expect(store.getState().muted).toBe(true); expect(manager.muted).toBe(true);
    expect(unlock).not.toHaveBeenCalled();
    const play = vi.spyOn(manager, "play"); store.getState().toggleMute();
    expect(manager.muted).toBe(false); expect(store.getState().muted).toBe(false);
    expect(unlock).toHaveBeenCalledOnce(); expect(play).toHaveBeenCalledWith("tap");
    expect(JSON.parse(localStorage.getItem(MUTE_PREFERENCE_KEY)!)).toEqual({ version: 1, muted: false });
    store.getState().stopAlbumSync();
  });

  it("two hydrated game stores track one mute choice, while a disposed store stops subscribing", () => {
    const config = buildDemoConfig("en", "sydney", "Test"), options = { readOnlyPreview: true, copy: getDict("en").game.copy };
    const first = createPlayStore(config, options), second = createPlayStore({ ...config, gameId: "audio-second-game" }, options);
    first.getState().hydrate(); second.getState().hydrate(); first.getState().toggleMute();
    expect(first.getState().muted).toBe(true); expect(second.getState().muted).toBe(true); expect(sounds().muted).toBe(true);
    second.getState().toggleMute(); expect(first.getState().muted).toBe(false); expect(second.getState().muted).toBe(false);
    first.getState().stopAlbumSync(); second.getState().toggleMute();
    expect(first.getState().muted).toBe(false); expect(second.getState().muted).toBe(true);
    second.getState().stopAlbumSync();
  });

  it("demo and explicit preview boot do not request unlock while the store is being rendered", () => {
    const manager = sounds(), unlock = vi.spyOn(manager, "unlock"), ambient = vi.spyOn(manager, "startAmbient"), config = buildDemoConfig("en", "sydney", "Test");
    const demo = createPlayStore(config, { demo: true, copy: getDict("en").game.copy });
    const preview = createPlayStore(config, { readOnlyPreview: true, autoStartScene: config.scenes[0]!.slug, copy: getDict("en").game.copy });
    expect(demo.getState().screen).toBe("scene"); expect(preview.getState().screen).toBe("scene"); expect(unlock).not.toHaveBeenCalled(); expect(ambient).not.toHaveBeenCalled();
    preview.getState().hydrate(); expect(unlock).not.toHaveBeenCalled();
    expect(ambient).toHaveBeenCalledOnce(); expect(ambient).toHaveBeenCalledWith(config.scenes[0]!.sounds.ambient);
    preview.getState().stopAlbumSync();
  });
});
