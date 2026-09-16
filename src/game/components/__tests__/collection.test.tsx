// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guidedFixture } from "../../../domain/adventure/__tests__/guided-fixture";
import { GameI18nProvider } from "../../i18n";
import { Collection, PEEK_MS, STICKER_FLIGHT_MS } from "../Collection";

/**
 * The sticker collection on the board: ONE shape on every screen — a button in
 * the corner and a tray above it. Every sticker is in colour whether or not it
 * has been found; the tick is what says "found". Choosing one is guidance only:
 * nothing here collects, and the child mission is untouched.
 */
const { config } = guidedFixture();
const board = config.adventure!.boards[0]!;
const scene = config.scenes[0]!;
const base = { board, scene, selectedId: null, hintLevel: 0 as const, disabled: false, muted: false };

/** The only media query the tray reads now is the motion one. */
function motion(still: boolean) {
  window.matchMedia = ((query: string) => ({ matches: query.includes("reduce") ? still : false, media: query, addEventListener() {}, removeEventListener() {} })) as never;
}
const provide = (ui: React.ReactElement, locale: "en" | "he" = "en") => <GameI18nProvider locale={locale}>{ui}</GameI18nProvider>;

beforeEach(() => { vi.stubGlobal("React", React); motion(false); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("the discovery tray", () => {
  it("is one button and one tray — no second, wider arrangement and nothing to fold", () => {
    const view = render(provide(<Collection {...base} collectedIds={["item-1"]} onSelect={vi.fn()} onHint={vi.fn()} />));
    expect(view.container.querySelector(".collect__strip")).toBeNull();
    expect(view.container.querySelector(".collect__fold")).toBeNull();
    expect(view.container.querySelector(".collect__slots")).toBeNull();
    expect(view.container.querySelectorAll(".collect__fab")).toHaveLength(1);
  });

  it("holds itself open for two seconds without taking focus or announcing a dialog, then folds back into the button", () => {
    vi.useFakeTimers();
    const view = render(provide(<Collection {...base} collectedIds={[]} onSelect={vi.fn()} onHint={vi.fn()} />));
    // Showing, but decoration: inert, hidden from the tree, and it took no focus.
    const peek = view.container.querySelector(".collect__sheet")!;
    expect(peek.classList.contains("collect__sheet--peek")).toBe(true);
    expect(peek.getAttribute("aria-hidden")).toBe("true");
    expect(peek.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(document.body);
    act(() => { vi.advanceTimersByTime(PEEK_MS); });
    expect(view.container.querySelector(".collect__sheet--closing")).not.toBeNull();
    act(() => { vi.advanceTimersByTime(400); });
    expect(view.container.querySelector(".collect__sheet")).toBeNull();
  });

  it("peeks once only, never behind a busy board, and never when less motion was asked for", () => {
    vi.useFakeTimers();
    // Busy at first: no peek while the curtain is shut.
    const view = render(provide(<Collection {...base} collectedIds={[]} disabled onSelect={vi.fn()} onHint={vi.fn()} />));
    expect(view.container.querySelector(".collect__sheet")).toBeNull();
    view.rerender(provide(<Collection {...base} collectedIds={[]} onSelect={vi.fn()} onHint={vi.fn()} />));
    expect(view.container.querySelector(".collect__sheet--peek")).not.toBeNull();
    // It folds away and does not come back on the next busy/idle swing.
    act(() => { vi.advanceTimersByTime(PEEK_MS + 400); });
    view.rerender(provide(<Collection {...base} collectedIds={[]} disabled onSelect={vi.fn()} onHint={vi.fn()} />));
    view.rerender(provide(<Collection {...base} collectedIds={[]} onSelect={vi.fn()} onHint={vi.fn()} />));
    expect(view.container.querySelector(".collect__sheet")).toBeNull();
    cleanup();

    motion(true);
    const still = render(provide(<Collection {...base} collectedIds={[]} onSelect={vi.fn()} onHint={vi.fn()} />));
    expect(still.container.querySelector(".collect__sheet")).toBeNull();
  });

  it("hands the tray over to a tap made during the peek instead of closing it", () => {
    vi.useFakeTimers();
    const view = render(provide(<Collection {...base} collectedIds={[]} onSelect={vi.fn()} onHint={vi.fn()} />));
    expect(view.container.querySelector(".collect__sheet--peek")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Discoveries: 0 of 6 collected" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    // The peek's own timer must not close what the child just opened.
    act(() => { vi.advanceTimersByTime(PEEK_MS + 400); });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("shows every sticker in colour and marks only the found ones with a tick", () => {
    vi.useFakeTimers();
    const view = render(provide(<Collection {...base} collectedIds={["item-0", "item-5"]} onSelect={vi.fn()} onHint={vi.fn()} />));
    act(() => { vi.advanceTimersByTime(PEEK_MS + 400); });
    fireEvent.click(screen.getByRole("button", { name: "Discoveries: 2 of 6 collected" }));
    const stickers = view.container.querySelectorAll<HTMLElement>(".collect__grid .sticker");
    expect(stickers).toHaveLength(6);
    // Nothing is ghosted out: every one of the six carries its own picture.
    expect(view.container.querySelectorAll(".collect__grid .sticker__picture")).toHaveLength(6);
    expect(view.container.querySelector(".collect__grid .sticker__blank")).toBeNull();
    expect(stickers[0]!.classList.contains("sticker--got")).toBe(true);
    expect(stickers[0]!.querySelector(".sticker__check")).not.toBeNull();
    expect(stickers[1]!.classList.contains("sticker--got")).toBe(false);
    expect(stickers[1]!.querySelector(".sticker__check")).toBeNull();
    expect(view.container.querySelectorAll(".collect__grid .sticker__check")).toHaveLength(2);
    // Nothing celebrates on mount: the two already there are simply there.
    expect(view.container.querySelector(".sticker--fresh")).toBeNull();
  });

  it("names the six, keeps their rarity words and starts looking for the one picked, closing the tray", () => {
    vi.useFakeTimers();
    const onSelect = vi.fn(), onHint = vi.fn();
    const view = render(provide(<Collection {...base} collectedIds={["item-1"]} onSelect={onSelect} onHint={onHint} />));
    act(() => { vi.advanceTimersByTime(PEEK_MS + 400); });
    fireEvent.click(screen.getByRole("button", { name: "Discoveries: 1 of 6 collected" }));
    expect(screen.getByRole("dialog", { name: "Discoveries in Synthetic market" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Item 1 — collected" }).hasAttribute("disabled")).toBe(true);
    expect(view.container.querySelectorAll(".collect__grid .sticker")).toHaveLength(6);
    expect(screen.getAllByText("Common")).toHaveLength(3);
    expect(screen.getAllByText("Special")).toHaveLength(2);
    expect(screen.getAllByText("Extraordinary")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Item 4 — still hiding" }));
    expect(onSelect).toHaveBeenCalledWith("item-4");
    act(() => { vi.advanceTimersByTime(400); });
    expect(screen.queryByRole("dialog")).toBeNull();

    vi.useRealTimers();
    // Looking for it: the card names it and hands out hints, then leaves once it is collected.
    view.rerender(provide(<Collection {...base} collectedIds={["item-1"]} selectedId="item-4" onSelect={onSelect} onHint={onHint} />));
    expect(screen.getByText("Looking for")).toBeTruthy();
    expect(screen.getByText("Item 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "A hint, please?" }));
    expect(onHint).toHaveBeenCalledOnce();
    view.rerender(provide(<Collection {...base} collectedIds={["item-1"]} selectedId="item-4" hintLevel={1} onSelect={onSelect} onHint={onHint} />));
    fireEvent.click(screen.getByRole("button", { name: "Where should I look?" }));
    expect(onHint).toHaveBeenCalledTimes(2);
    view.rerender(provide(<Collection {...base} collectedIds={["item-1"]} selectedId="item-4" hintLevel={2} onSelect={onSelect} onHint={onHint} />));
    expect(screen.getByText("Look inside the marked area")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show me" }));
    expect(onHint).toHaveBeenCalledTimes(3);
    view.rerender(provide(<Collection {...base} collectedIds={["item-1"]} selectedId="item-4" hintLevel={3} onSelect={onSelect} onHint={onHint} />));
    expect(screen.getByRole("button", { name: "Show me" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Back to the search" }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    view.rerender(provide(<Collection {...base} collectedIds={["item-1", "item-4"]} selectedId="item-4" onSelect={onSelect} onHint={onHint} />));
    expect(screen.queryByText("Looking for")).toBeNull();
  });

  it("moves focused low-edge discovery guidance away from the bottom item", () => {
    const edgeBoard = { ...board, discoveries: board.discoveries.map((d, i) => i === 0 ? { ...d, hitRect: { ...d.hitRect, y: 0.87, h: 0.08 } } : d) };
    const props = { ...base, board: edgeBoard, collectedIds: [], selectedId: edgeBoard.discoveries[0]!.id, onSelect: vi.fn(), onHint: vi.fn() };
    const view = render(provide(<Collection {...props} hintLevel={1} />));
    expect(view.container.querySelector(".collect--seek-above")).toBeNull();
    view.rerender(provide(<Collection {...props} hintLevel={3} />));
    expect(view.container.querySelector(".collect--seek-above")).not.toBeNull();
    const highBoard = { ...edgeBoard, discoveries: edgeBoard.discoveries.map(d => ({ ...d, hitRect: { ...d.hitRect, y: 0.05 } })) };
    view.rerender(provide(<Collection {...props} board={highBoard} hintLevel={3} />));
    expect(view.container.querySelector(".collect--seek-above")).toBeNull();
  });

  it("closes on Escape with focus back on the button, and folds away while the board is busy", () => {
    vi.useFakeTimers();
    const view = render(provide(<Collection {...base} collectedIds={[]} onSelect={vi.fn()} onHint={vi.fn()} />, "he"));
    act(() => { vi.advanceTimersByTime(PEEK_MS + 400); });
    const fab = screen.getByRole("button", { name: "תגליות: נאספו 0 מתוך 6" });
    fireEvent.click(fab);
    expect(screen.getByRole("dialog", { name: "התגליות של Synthetic market" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(fab);
    act(() => { vi.advanceTimersByTime(400); });
    fireEvent.click(fab);
    expect(screen.getByRole("dialog")).toBeTruthy();
    view.rerender(provide(<Collection {...base} collectedIds={[]} disabled onSelect={vi.fn()} onHint={vi.fn()} />, "he"));
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => { vi.advanceTimersByTime(400); });
    expect(view.container.querySelector(".collect__sheet")).toBeNull();
    expect(fab.hasAttribute("disabled")).toBe(true);
  });

  it("flies a collected sticker into its slot and ticks it only when it lands", () => {
    vi.useFakeTimers();
    const view = render(provide(<Collection {...base} collectedIds={[]} onSelect={vi.fn()} onHint={vi.fn()} />));
    fireEvent.click(screen.getByRole("button", { name: "Discoveries: 0 of 6 collected" }));
    const slot = () => view.container.querySelector('[data-discovery="item-2"]')!;
    vi.spyOn(slot(), "getBoundingClientRect").mockReturnValue({ x: 100, y: 500, left: 100, top: 500, right: 148, bottom: 548, width: 48, height: 48, toJSON() {} });
    view.rerender(provide(<Collection {...base} collectedIds={["item-2"]} arrival={{ id: "item-2", from: { x: 400, y: 200 }, key: 1 }} onSelect={vi.fn()} onHint={vi.fn()} />));
    expect(view.container.querySelector(".collect__fly")).not.toBeNull();
    expect(slot().classList.contains("sticker--arriving")).toBe(true);
    expect(slot().classList.contains("sticker--got")).toBe(false);
    expect(slot().querySelector(".sticker__check")).toBeNull();
    act(() => { vi.advanceTimersByTime(STICKER_FLIGHT_MS); });
    expect(view.container.querySelector(".collect__fly")).toBeNull();
    expect(slot().classList.contains("sticker--got")).toBe(true);
    expect(slot().classList.contains("sticker--fresh")).toBe(true);
    expect(slot().querySelector(".sticker__check")).not.toBeNull();
    expect(view.container.querySelector(".collect__tally")?.textContent).toBe("1/6");
  });
});
