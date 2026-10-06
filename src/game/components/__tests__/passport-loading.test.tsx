// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { publicBeachDemo } from "../../../../content/demo/beach-v1";
import { buildDemoConfig } from "@/services/demo";
import { getDict } from "@/i18n";
import type { PlayStore } from "../../store/play-store";
import { GameShell } from "../GameShell";

const modules = vi.hoisted(() => {
  let allowLegacy!: () => void;
  return { legacy: vi.fn(), adventure: vi.fn(),
    legacyGate: new Promise<void>(resolve => { allowLegacy = resolve; }),
    allowLegacy: () => allowLegacy() };
});

vi.mock("../Passport", async () => {
  modules.legacy(); await modules.legacyGate;
  return { Passport: ({ onMap }: { onMap: () => void }) => <div data-testid="legacy-passport"><button onClick={onMap}>Back</button></div> };
});
vi.mock("../AdventurePassport", () => {
  modules.adventure();
  return { AdventurePassport: ({ store }: { store: PlayStore }) => <div data-testid="adventure-passport"><button onClick={() => store.goToMap()}>Back</button></div> };
});

beforeEach(() => {
  vi.stubGlobal("React", React); localStorage.clear();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
  window.history.replaceState({}, "");
  vi.spyOn(window.history, "back").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("loads only the selected passport screen and gives localized immediate feedback while its code arrives", async () => {
  window.history.replaceState({ sourceMap: "legacy" }, "");
  const push = vi.spyOn(window.history, "pushState");
  const legacy = render(<GameShell config={buildDemoConfig("en", "sydney", "Test")} skipGift readOnlyPreview />);
  expect(modules.legacy).not.toHaveBeenCalled(); expect(modules.adventure).not.toHaveBeenCalled();
  fireEvent.click(legacy.getByRole("button", { name: new RegExp(getDict("en").game.map.bag) }));
  expect(legacy.getByRole("status").textContent).toBe(getDict("en").travelPassport.opening);
  await waitFor(() => expect(modules.legacy).toHaveBeenCalledOnce());
  expect(modules.adventure).not.toHaveBeenCalled();
  expect(push).toHaveBeenCalledOnce();
  expect(window.history.state).toEqual({ sourceMap: "legacy", findMeGameStep: "passport" });
  // Leaving while code is pending returns to the same map/history entry.
  fireEvent.click(legacy.getByRole("button", { name: getDict("en").game.passport.map }));
  expect(window.history.back).toHaveBeenCalledOnce();
  expect(legacy.queryByRole("status")).toBeNull();
  window.history.replaceState({ sourceMap: "legacy" }, "");
  fireEvent(window, new PopStateEvent("popstate"));
  await act(async () => { modules.allowLegacy(); });
  expect(legacy.queryByTestId("legacy-passport")).toBeNull();
  // Successful component code is reused on the next entry, never stale props.
  fireEvent.click(legacy.getByRole("button", { name: new RegExp(getDict("en").game.map.bag) }));
  expect(await legacy.findByTestId("legacy-passport")).toBeTruthy();
  expect(modules.legacy).toHaveBeenCalledOnce();
  expect(push).toHaveBeenCalledTimes(2);
  expect(window.history.state).toEqual({ sourceMap: "legacy", findMeGameStep: "passport" });
  fireEvent.click(legacy.getByRole("button", { name: "Back" }));
  expect(legacy.queryByTestId("legacy-passport")).toBeNull();
  expect(window.history.back).toHaveBeenCalledTimes(2); legacy.unmount();
  window.history.replaceState({}, "");

  const modernConfig = { ...publicBeachDemo("he"), gameId: "lazy-passport-modern" };
  // Historical grid maps expose the passport once a board has been played.
  localStorage.setItem(`findme:progress:v1:${modernConfig.gameId}`, JSON.stringify({ v: 1, gameId: modernConfig.gameId,
    revealed: true, scenes: { [modernConfig.scenes[0]!.slug]: { completed: true } } }));
  const modern = render(<GameShell config={modernConfig} skipGift />);
  expect(modules.adventure).not.toHaveBeenCalled();
  fireEvent.click(modern.getByRole("button", { name: new RegExp(getDict("he").game.map.bag) }));
  expect(modern.getByRole("status").textContent).toBe(getDict("he").travelPassport.opening);
  expect(await modern.findByTestId("adventure-passport")).toBeTruthy();
  expect(modules.adventure).toHaveBeenCalledOnce(); expect(modules.legacy).toHaveBeenCalledOnce();
});
