// @vitest-environment jsdom
import React, { useState } from "react";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemoConfig } from "@/services/demo";
import { getDict } from "@/i18n";
import { GameI18nProvider } from "../../i18n";
import { createPlayStore } from "../../store/play-store";
import { SceneCompleteCard, SceneLoadError } from "../ScenePlayer";

vi.mock("../../audio/sounds", () => ({ sounds: () => ({ play() {} }) }));
beforeEach(() => { vi.stubGlobal("React", React); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function modal(kind: "complete" | "error", locale: "en" | "he", { demo = false, stay = true, parentFocused = false, qaRequired = false } = {}) {
  const config = buildDemoConfig(locale), scene = config.scenes[0]!;
  const base = createPlayStore(config, { readOnlyPreview: true, skipGift: true, demo, copy: getDict(locale).game.copy }).getState();
  const actions = { map: vi.fn(), stay: vi.fn(), retry: vi.fn(), replay: vi.fn() };
  function Harness() {
    const [open, setOpen] = useState(false);
    const store = { ...base, nextScene: () => null, gameDone: () => true,
      goToMap: (slug?: string | null) => { actions.map(slug); setOpen(false); },
      replayScene: () => { actions.replay(); setOpen(false); } };
    return <GameI18nProvider locale={locale}>
      <button type="button" data-testid="outside">Outside the game</button>
      <div className={demo ? "game game--demo" : "game"}><div className="scene">
        <button type="button" data-testid="opener" onClick={() => setOpen(true)}>Open card</button>
        <div className="scene__stage"><div className="viewport" tabIndex={0}>Synthetic board</div></div>
        {open ? kind === "complete"
          ? <SceneCompleteCard scene={scene} bonusFound={false} hintsUsed={1} store={store} remaining={stay ? 1 : 0}
            onStay={stay ? () => { actions.stay(); setOpen(false); } : undefined} />
          : <SceneLoadError demo={demo} qaRequired={qaRequired} onRetry={() => { actions.retry(); setOpen(false); }}
            onBack={demo ? undefined : () => { actions.map(scene.slug); setOpen(false); }} /> : null}
      </div></div>
    </GameI18nProvider>;
  }
  const view = render(<Harness />);
  const opener = view.getByTestId("opener");
  (parentFocused ? view.getByTestId("outside") : opener).focus();
  // Opening without a pointer focus change models an asynchronous asset error.
  fireEvent.click(opener);
  const dialog = view.getByRole("dialog");
  return { view, dialog, opener, actions, scene };
}

function expectTabCycle(dialog: HTMLElement) {
  const buttons = Array.from(dialog.querySelectorAll<HTMLElement>("button, a[href]"));
  const first = buttons[0]!, last = buttons.at(-1)!;
  expect(document.activeElement).toBe(first);
  first.focus();
  fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last, { key: "Tab" });
  expect(document.activeElement).toBe(first);
}

describe("bounded scene dialogs", () => {
  it.each(["en", "he"] as const)("contains completion focus, makes the surrounding page inert, and Escape stays with restored focus in %s", locale => {
    const { view, dialog, opener, actions } = modal("complete", locale);
    expect(dialog.tagName).toBe("DIV");
    expect(dialog.classList.contains("complete")).toBe(true);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(opener.closest("[inert]")).toBe(opener);
    expect(view.getByTestId("outside").closest("[inert]")).not.toBeNull();
    expect(view.container.querySelector(".scene__stage")!.hasAttribute("inert")).toBe(true);
    expectTabCycle(dialog);
    view.getByTestId("outside").focus();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(actions.stay).toHaveBeenCalledOnce();
    expect(actions.map).not.toHaveBeenCalled();
    expect(actions.replay).not.toHaveBeenCalled();
    expect(view.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(view.getByTestId("outside").closest("[inert]")).toBeNull();
    expect(view.container.querySelector(".scene__stage")!.hasAttribute("inert")).toBe(false);
  });

  it("uses the existing map action for Escape when completion has no Stay", () => {
    const { view, dialog, opener, actions, scene } = modal("complete", "en", { stay: false });
    expectTabCycle(dialog);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(actions.map).toHaveBeenCalledExactlyOnceWith(scene.slug);
    expect(actions.stay).not.toHaveBeenCalled();
    expect(actions.replay).not.toHaveBeenCalled();
    expect(view.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it.each(["en", "he"] as const)("contains the error card and Escape returns through its existing map action in %s", locale => {
    const { view, dialog, opener, actions, scene } = modal("error", locale);
    expect(dialog.classList.contains("scene__retry")).toBe(true);
    expectTabCycle(dialog);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(actions.map).toHaveBeenCalledExactlyOnceWith(scene.slug);
    expect(actions.retry).not.toHaveBeenCalled();
    expect(view.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it.each(["complete", "error"] as const)("keeps demo %s nonmodal and leaves parent controls reachable without taking or restoring their focus", kind => {
    const { view, dialog, actions } = modal(kind, "en", { demo: true, stay: false, parentFocused: true });
    const outside = view.getByTestId("outside");
    expect(dialog.getAttribute("aria-modal")).toBeNull();
    expect(outside.closest("[inert]")).toBeNull();
    expect(view.container.querySelector(".scene__stage")!.hasAttribute("inert")).toBe(false);
    // Async appearance must leave focus on the parent control being used.
    expect(document.activeElement).toBe(outside);
    const button = within(dialog).getByRole("button", { name: kind === "complete" ? getDict("en").game.complete.again : getDict("en").game.scene.loadRetry });
    button.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    button.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    outside.focus();
    expect(document.activeElement).toBe(outside);
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    outside.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
    expect(view.getByRole("dialog")).toBe(dialog);
    expect(actions.map).not.toHaveBeenCalled();
    expect(actions.stay).not.toHaveBeenCalled();
    expect(actions.replay).not.toHaveBeenCalled();
    expect(actions.retry).not.toHaveBeenCalled();
    // The existing action still works. Closing while parent focus is outside
    // must not run the real game's focus-restoration lifecycle.
    fireEvent.click(button);
    expect(kind === "complete" ? actions.replay : actions.retry).toHaveBeenCalledOnce();
    expect(view.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(outside);
  });

  it("leaves the parent page available when an expired QA session changes the demo error action to sign-in", () => {
    const { view, dialog } = modal("error", "he", { demo: true, stay: false, parentFocused: true, qaRequired: true });
    const outside = view.getByTestId("outside");
    expect(dialog.getAttribute("aria-modal")).toBeNull();
    expect(within(dialog).getByRole("link")).toBeTruthy();
    expect(document.activeElement).toBe(outside);
    expect(outside.closest("[inert]")).toBeNull();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    outside.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
  });

  it("moves focus to the map action when Escape removes the old scene", async () => {
    const config = buildDemoConfig("en"), scene = config.scenes[0]!;
    const base = createPlayStore(config, { readOnlyPreview: true, skipGift: true, copy: getDict(config.locale).game.copy }).getState();
    function Navigation() {
      const [screen, setScreen] = useState<"board" | "finish" | "map">("board");
      const store = { ...base, nextScene: () => null, gameDone: () => true, goToMap: () => setScreen("map") };
      return <GameI18nProvider locale="en"><div className="game">
        {screen === "map" ? <button type="button" className="wmap__go">Go to the next place</button> : <div className="scene">
          <div className="viewport" tabIndex={0}>Synthetic board</div>
          <button type="button" onClick={() => setScreen("finish")}>Open completion</button>
          {screen === "finish" ? <SceneCompleteCard scene={scene} bonusFound={false} hintsUsed={1} store={store} remaining={0} /> : null}
        </div>}
      </div></GameI18nProvider>;
    }
    const view = render(<Navigation />);
    const opener = view.getByRole("button", { name: "Open completion" });
    opener.focus(); fireEvent.click(opener);
    fireEvent.keyDown(view.getByRole("dialog"), { key: "Escape" });
    await act(async () => {});
    expect(view.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(view.getByRole("button", { name: "Go to the next place" }));
  });

  it("restores pre-existing inert attributes exactly after a card closes", () => {
    const existing = document.createElement("aside");
    existing.setAttribute("inert", "already-inert");
    document.body.append(existing);
    try {
      const { view, dialog } = modal("error", "en");
      expect(existing.getAttribute("inert")).toBe("already-inert");
      fireEvent.click(within(dialog).getByRole("button", { name: getDict("en").game.scene.loadRetry }));
      expect(view.queryByRole("dialog")).toBeNull();
      expect(existing.getAttribute("inert")).toBe("already-inert");
    } finally { existing.remove(); }
  });
});
