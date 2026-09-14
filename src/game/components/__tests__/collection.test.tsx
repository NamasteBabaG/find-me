// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guidedFixture } from "../../../domain/adventure/__tests__/guided-fixture";
import { GameI18nProvider } from "../../i18n";
import { Collection, STICKER_FLIGHT_MS } from "../Collection";

/**
 * The sticker collection on the board. A phone gets one round button and a
 * short sheet; a wide screen keeps the six stickers in view. Choosing one is
 * guidance only: nothing here collects, and the child mission is untouched.
 */
const { config } = guidedFixture();
const board = config.adventure!.boards[0]!;
const scene = config.scenes[0]!;
const base = { board, scene, selectedId: null, hintLevel: 0 as const, disabled: false, muted: false };

function wide(matches: boolean) {
  window.matchMedia = ((query: string) => ({ matches: query.includes("min-width") ? matches : false, media: query, addEventListener() {}, removeEventListener() {} })) as never;
}
beforeEach(() => { vi.stubGlobal("React", React); wide(false); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("the collection on a phone", () => {
  it("is one round button that opens a sheet of six; picking a sticker starts looking for it and closes the sheet", () => {
    const onSelect = vi.fn(), onHint = vi.fn();
    const view = render(<GameI18nProvider locale="en"><Collection {...base} collectedIds={["item-1"]} onSelect={onSelect} onHint={onHint} /></GameI18nProvider>);
    const fab = screen.getByRole("button", { name: "Discoveries: 1 of 6 collected" });
    expect(view.container.querySelector(".collect__strip")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(fab);
    expect(screen.getByRole("dialog", { name: "Discoveries in Synthetic market" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Item 1 — collected" }).hasAttribute("disabled")).toBe(true);
    expect(view.container.querySelectorAll(".collect__grid .sticker")).toHaveLength(6);
    expect(screen.getAllByText("Common")).toHaveLength(3);
    expect(screen.getAllByText("Rare")).toHaveLength(2);
    expect(screen.getAllByText("Epic")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Item 4" }));
    expect(onSelect).toHaveBeenCalledWith("item-4");
    expect(screen.queryByRole("dialog")).toBeNull();
    // Looking for it: the card names it and hands out hints, then leaves once it is collected.
    view.rerender(<GameI18nProvider locale="en"><Collection {...base} collectedIds={["item-1"]} selectedId="item-4" onSelect={onSelect} onHint={onHint} /></GameI18nProvider>);
    expect(screen.getByText("Looking for")).toBeTruthy();
    expect(screen.getByText("Item 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hint" }));
    expect(onHint).toHaveBeenCalledOnce();
    view.rerender(<GameI18nProvider locale="en"><Collection {...base} collectedIds={["item-1"]} selectedId="item-4" hintLevel={2} onSelect={onSelect} onHint={onHint} /></GameI18nProvider>);
    expect(screen.getByText("Look inside the marked area")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop looking for this one" }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    view.rerender(<GameI18nProvider locale="en"><Collection {...base} collectedIds={["item-1", "item-4"]} selectedId="item-4" onSelect={onSelect} onHint={onHint} /></GameI18nProvider>);
    expect(screen.queryByText("Looking for")).toBeNull();
  });

  it("closes on Escape with focus back on the button, and folds away while the board is busy", () => {
    const view = render(<GameI18nProvider locale="he"><Collection {...base} collectedIds={[]} onSelect={vi.fn()} onHint={vi.fn()} /></GameI18nProvider>);
    const fab = screen.getByRole("button", { name: "תגליות: נאספו 0 מתוך 6" });
    fireEvent.click(fab);
    expect(screen.getByRole("dialog", { name: "התגליות של Synthetic market" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(fab);
    fireEvent.click(fab);
    view.rerender(<GameI18nProvider locale="he"><Collection {...base} collectedIds={[]} disabled onSelect={vi.fn()} onHint={vi.fn()} /></GameI18nProvider>);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fab.hasAttribute("disabled")).toBe(true);
  });
});

describe("the collection on a wide screen", () => {
  it("keeps the six stickers in view, ghosted until found, and a tap on one starts looking for it", () => {
    wide(true);
    const onSelect = vi.fn();
    const view = render(<GameI18nProvider locale="en"><Collection {...base} collectedIds={["item-0", "item-5"]} onSelect={onSelect} onHint={vi.fn()} /></GameI18nProvider>);
    expect(screen.queryByRole("button", { name: /Discoveries: 2 of 6/ })).toBeNull();
    expect(screen.getByRole("group", { name: "Discoveries: 2 of 6 collected" })).toBeTruthy();
    const stickers = view.container.querySelectorAll(".collect__strip .sticker");
    expect(stickers).toHaveLength(6);
    expect(stickers[0]!.classList.contains("sticker--got")).toBe(true);
    expect(stickers[0]!.hasAttribute("disabled")).toBe(true);
    expect(stickers[1]!.classList.contains("sticker--got")).toBe(false);
    // Nothing celebrates on mount: the two already there are simply there.
    expect(view.container.querySelector(".sticker--fresh")).toBeNull();
    expect(screen.getByText(/6 discoveries are hiding here/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Item 3" }));
    expect(onSelect).toHaveBeenCalledWith("item-3");
    expect(screen.queryByText(/6 discoveries are hiding here/)).toBeNull();
  });

  it("flies a collected sticker into its slot and lights it only when it lands", () => {
    wide(true);
    vi.useFakeTimers();
    const view = render(<GameI18nProvider locale="en"><Collection {...base} collectedIds={[]} onSelect={vi.fn()} onHint={vi.fn()} /></GameI18nProvider>);
    const slot = () => view.container.querySelector('[data-discovery="item-2"]')!;
    vi.spyOn(slot(), "getBoundingClientRect").mockReturnValue({ x: 100, y: 500, left: 100, top: 500, right: 148, bottom: 548, width: 48, height: 48, toJSON() {} });
    view.rerender(<GameI18nProvider locale="en"><Collection {...base} collectedIds={["item-2"]} arrival={{ id: "item-2", from: { x: 400, y: 200 }, key: 1 }} onSelect={vi.fn()} onHint={vi.fn()} /></GameI18nProvider>);
    expect(view.container.querySelector(".collect__fly")).not.toBeNull();
    expect(slot().classList.contains("sticker--arriving")).toBe(true);
    expect(slot().classList.contains("sticker--got")).toBe(false);
    act(() => { vi.advanceTimersByTime(STICKER_FLIGHT_MS); });
    expect(view.container.querySelector(".collect__fly")).toBeNull();
    expect(slot().classList.contains("sticker--got")).toBe(true);
    expect(slot().classList.contains("sticker--fresh")).toBe(true);
    expect(view.container.querySelector(".collect__tally")?.textContent).toBe("1/6");
  });
});
