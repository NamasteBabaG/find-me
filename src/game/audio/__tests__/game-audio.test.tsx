// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameShell } from "../../components/GameShell";
import { createPlayStore } from "../../store/play-store";
import { sounds } from "../sounds";
import { buildDemoConfig } from "../../../services/demo";
import { getDict } from "../../../i18n";

beforeEach(() => {
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
});
