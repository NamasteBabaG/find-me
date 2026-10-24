// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../client";
import { getDict } from "../index";
import type { Locale } from "../config";
import { LanguageSwitcher } from "../LanguageSwitcher";

const calls = vi.hoisted(() => ({ change: vi.fn<(locale: "en" | "he") => Promise<void>>(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: calls.refresh }) }));
vi.mock("../actions", () => ({ setLocaleAction: calls.change }));

beforeEach(() => {
  vi.stubGlobal("React", React);
  calls.change.mockReset().mockResolvedValue(undefined); calls.refresh.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mount(locale: Locale = "en") {
  const t = getDict(locale);
  const page = render(<I18nProvider locale={locale} dict={t}><div dir={locale === "he" ? "rtl" : "ltr"}>
    <LanguageSwitcher /><button>Following control</button>
  </div></I18nProvider>);
  return { page, trigger: page.getByRole("button", { name: t.common.language }), label: t.common.language };
}

describe("language menu keyboard contract", () => {
  it.each(["en", "he"] as const)("opens the named menu on the selected %s option with one tab stop", (locale) => {
    const { page, trigger, label } = mount(locale);
    trigger.focus(); fireEvent.click(trigger);
    const menu = page.getByRole("menu", { name: label });
    const options = page.getAllByRole("menuitemradio");
    const selected = options[locale === "en" ? 0 : 1]!;
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(selected);
    expect(selected.getAttribute("aria-checked")).toBe("true");
    expect(options.map(option => option.tabIndex)).toEqual(locale === "en" ? [0, -1] : [-1, 0]);
    const ids = Array.from(page.container.querySelectorAll("[id]"), element => element.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each([["ArrowDown", 0], ["ArrowUp", 1]] as const)("opens from %s at the correct menu edge", (key, index) => {
    const { page, trigger } = mount();
    trigger.focus(); fireEvent.keyDown(trigger, { key });
    expect(document.activeElement).toBe(page.getAllByRole("menuitemradio")[index]);
  });

  it("wraps vertical navigation and supports Home and End without changing the selected locale", () => {
    const { page, trigger } = mount();
    fireEvent.click(trigger);
    const [english, hebrew] = page.getAllByRole("menuitemradio");
    fireEvent.keyDown(english!, { key: "ArrowDown" }); expect(document.activeElement).toBe(hebrew);
    fireEvent.keyDown(hebrew!, { key: "ArrowDown" }); expect(document.activeElement).toBe(english);
    fireEvent.keyDown(english!, { key: "ArrowUp" }); expect(document.activeElement).toBe(hebrew);
    fireEvent.keyDown(hebrew!, { key: "Home" }); expect(document.activeElement).toBe(english);
    fireEvent.keyDown(english!, { key: "End" }); expect(document.activeElement).toBe(hebrew);
    expect(english?.getAttribute("aria-checked")).toBe("true");
    expect(hebrew?.getAttribute("aria-checked")).toBe("false");
    expect(calls.change).not.toHaveBeenCalled();
  });

  it("closes on Escape and restores focus to the trigger", () => {
    const { page, trigger } = mount();
    fireEvent.click(trigger);
    fireEvent.keyDown(page.getAllByRole("menuitemradio")[0]!, { key: "Escape" });
    expect(page.queryByRole("menu")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Shift+Tab back to the trigger", () => {
    const { page, trigger } = mount();
    fireEvent.click(trigger);
    fireEvent.keyDown(page.getAllByRole("menuitemradio")[0]!, { key: "Tab", shiftKey: true });
    expect(page.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when focus leaves or a pointer presses outside", () => {
    const { page, trigger } = mount();
    fireEvent.click(trigger);
    act(() => { page.getByRole("button", { name: "Following control" }).focus(); });
    expect(page.queryByRole("menu")).toBeNull();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(page.queryByRole("menu")).toBeNull();
  });

  it("returns to the trigger without a request when choosing the current language", () => {
    const { page, trigger } = mount();
    fireEvent.click(trigger);
    fireEvent.click(page.getAllByRole("menuitemradio")[0]!);
    expect(page.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(calls.change).not.toHaveBeenCalled();
  });

  it("keeps focus while a language change is pending and ignores repeat activation", async () => {
    let complete!: () => void;
    calls.change.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
    const { page, trigger } = mount();
    fireEvent.click(trigger);
    fireEvent.click(page.getAllByRole("menuitemradio")[1]!);
    expect(calls.change).toHaveBeenCalledExactlyOnceWith("he");
    expect(trigger.getAttribute("aria-busy")).toBe("true");
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger); fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(page.queryByRole("menu")).toBeNull();
    expect(calls.change).toHaveBeenCalledTimes(1);
    await act(async () => { complete(); });
    expect(calls.refresh).toHaveBeenCalledOnce();
    expect(trigger.getAttribute("aria-busy")).toBeNull();
  });
});
