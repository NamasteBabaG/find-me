// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { getDict } from "@/i18n";
import type { PassportView } from "@/domain/passport/passport";
import { PassportBook } from "../PassportBook";

const book: PassportView = { name: "Example", preparing: 0, worlds: [{ id: "world", title: "My world", pages: [1, 2, 3].map(n => ({
  id: `p${n}`, title: `Place ${n}`, state: n === 1 ? "stamped" : "locked", finds: n === 1 ? 3 : 0, stampIcon: "✦",
  ...(n === 1 ? { photoUrl: "/example.webp", photoChoices: [{ id: "t1", imageUrl: "/example.webp", selected: true }], playHref: "/play/example" } : {}),
  discoveries: Array.from({ length: 6 }, (_, i) => i === 0 && n === 1 ? { id: `item-${i}`, collected: true, rarity: "common", name: "Compass", description: "A little story.", imageUrl: "/item.webp" } : { id: `item-${i}`, collected: false, rarity: "rare" }),
})) }] };
let reduced = false;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.useFakeTimers(); sessionStorage.clear(); reduced = false;
  vi.stubGlobal("matchMedia", vi.fn((q: string) => ({ matches: q.includes("reduced-motion") ? reduced : true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 1; });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function mount(props: Partial<React.ComponentProps<typeof PassportBook>> = {}, locale: "en" | "he" = "en") {
  return render(<I18nProvider locale={locale} dict={getDict(locale)}><PassportBook book={book} {...props} /></I18nProvider>);
}
function open(locale: "en" | "he" = "en") { fireEvent.click(screen.getByRole("button", { name: getDict(locale).travelPassport.open })); }
function finish() { act(() => { vi.advanceTimersByTime(1000); }); }

describe("passport book interaction", () => {
  it("opens a hinged cover onto two semantic leaves and turns at the edges", () => {
    const view = mount(); open();
    expect(view.container.querySelector("[data-opening=true]")).not.toBeNull();
    expect(screen.getByRole("region", { name: "My memory" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "My discoveries" })).toBeTruthy();
    finish(); expect(view.container.querySelector(".travel-passport__opening-cover")).toBeNull();
    expect((screen.getByRole("button", { name: "Previous page" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("heading", { name: "Place 2" })).toBeTruthy();
    expect(view.container.querySelector('[data-turn="next"]')).not.toBeNull();
    finish(); fireEvent.click(screen.getByRole("button", { name: "Next page" })); finish();
    expect((screen.getByRole("button", { name: "Next page" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("keeps the same board across resize and data refresh without replaying the cover", () => {
    const view = mount({ cursorKey: "child" }); open(); finish();
    fireEvent.click(screen.getByRole("button", { name: "Next page" })); finish();
    fireEvent(window, new Event("resize"));
    view.rerender(<I18nProvider locale="en" dict={getDict("en")}><PassportBook book={{ ...book }} cursorKey="child" /></I18nProvider>);
    expect(screen.getByRole("heading", { name: "Place 2" })).toBeTruthy();
    expect(JSON.parse(sessionStorage.getItem("passport-cursor:child")!).page).toBe("p2");
    expect(view.container.querySelector(".travel-passport__opening-cover")).toBeNull();
  });
  it("restores the saved page under StrictMode instead of overwriting it with page one", () => {
    sessionStorage.setItem("passport-cursor:child", JSON.stringify({ world: "world", page: "p3" }));
    render(<React.StrictMode><I18nProvider locale="en" dict={getDict("en")}><PassportBook book={book} cursorKey="child" /></I18nProvider></React.StrictMode>);
    open(); finish();
    expect(screen.getByRole("heading", { name: "Place 3" })).toBeTruthy();
    expect(JSON.parse(sessionStorage.getItem("passport-cursor:child")!).page).toBe("p3");
  });
  it("honors physical Hebrew arrow direction and leaves the world tabs alone", () => {
    mount({}, "he"); open("he"); finish();
    fireEvent.keyDown(screen.getByRole("heading", { name: "Place 1" }), { key: "ArrowLeft" }); finish();
    expect(screen.getByRole("heading", { name: "Place 2" })).toBeTruthy();
    // Worlds are index tabs, not a form control: a plain button marked current,
    // so no tab/tablist arrow-roving can argue with the arrows that turn pages.
    const tab = screen.getByRole("button", { name: "My world" });
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(tab.getAttribute("aria-current")).toBe("true");
    fireEvent.keyDown(tab, { key: "ArrowLeft" }); finish();
    expect(screen.getByRole("heading", { name: "Place 2" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("heading", { name: "Place 2" }), { key: "ArrowRight" }); finish();
    expect(screen.getByRole("heading", { name: "Place 1" })).toBeTruthy();
  });
  it("turns immediately without decorative 3D layers for reduced motion", () => {
    reduced = true; const view = mount(); open();
    expect(view.container.querySelector(".travel-passport__opening-cover")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByRole("heading", { name: "Place 2" })).toBeTruthy();
    expect(view.container.querySelector(".travel-passport__turning-leaf")).toBeNull();
  });
  it("switches divider worlds during a turn without keeping the old leaf or cursor", () => {
    const second = { ...book.worlds[0]!, id: "second", title: "Another world", pages: book.worlds[0]!.pages.map(p => ({ ...p, id: `second-${p.id}`, title: `Second ${p.title}` })) };
    const view = mount({ book: { ...book, worlds: [...book.worlds, second] }, cursorKey: "child" });
    open(); finish();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    const back = view.container.querySelector(".travel-passport__turn-back")!;
    expect(back.textContent).not.toContain("Place");
    expect(back.textContent).not.toContain("My world");
    fireEvent.click(screen.getByRole("button", { name: "Another world" }));
    expect(view.container.querySelector(".travel-passport__turning-leaf")).toBeNull();
    expect(screen.getByRole("heading", { name: "Second Place 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Another world" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "My world" }).getAttribute("aria-current")).toBeNull();
    expect(JSON.parse(sessionStorage.getItem("passport-cursor:child")!)).toEqual({ world: "second", page: "second-p1" });
    finish();
    expect(screen.getByRole("heading", { name: "Second Place 1" })).toBeTruthy();
  });
  it.each(["shared", "demo"] as const)("keeps %s pages read-only even when an editing callback was supplied", mode => {
    mount({ mode, onPhotoSelect: vi.fn() }); open(); finish();
    expect(screen.queryByText("Choose my picture")).toBeNull();
    expect(screen.queryByRole("link", { name: "Back to this place" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "About Compass" }));
    expect(within(screen.getByRole("region", { name: "Compass" })).getByText("A little story.")).toBeTruthy();
  });
  it("keeps six slots but never reveals the names of uncollected discoveries", () => {
    const view = mount(); open(); finish();
    expect(view.container.querySelectorAll(".travel-passport__items > li")).toHaveLength(6);
    expect(view.container.querySelectorAll(".travel-passport__missing")).toHaveLength(5);
    expect(screen.getAllByRole("button", { name: /About / })).toHaveLength(1);
  });
  it("closes and reopens on the same board", () => {
    mount(); open(); finish(); fireEvent.click(screen.getByRole("button", { name: "Next page" })); finish();
    fireEvent.click(screen.getByRole("button", { name: "Back to the cover" }));
    expect(screen.queryByRole("heading", { name: "Place 2" })).toBeNull(); open(); finish();
    expect(screen.getByRole("heading", { name: "Place 2" })).toBeTruthy();
  });
  it("retries a failed picture twice without losing earned stamps or blocking navigation", () => {
    const view = mount(); open(); finish();
    fireEvent.error(screen.getByRole("img", { name: "Place 1" }));
    expect(screen.getByText(getDict("en").travelPassport.photoUnavailable)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1000); });
    fireEvent.error(screen.getByRole("img", { name: "Place 1" }));
    act(() => { vi.advanceTimersByTime(2000); });
    fireEvent.error(screen.getByRole("img", { name: "Place 1" }));
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.queryByRole("img", { name: "Place 1" })).toBeNull();
    expect(view.container.querySelector('[data-state="stamped"]')).not.toBeNull();
    expect(view.container.querySelectorAll(".travel-passport__items > li")).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "Next page" })); finish();
    expect(screen.getByRole("heading", { name: "Place 2" })).toBeTruthy();
  });
});
