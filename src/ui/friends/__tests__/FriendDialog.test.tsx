// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { getDict } from "@/i18n";
import { FriendDialog } from "../FriendDialog";

const native = { show: vi.fn(), close: vi.fn() };
beforeEach(() => {
  vi.stubGlobal("React", React); native.show.mockReset(); native.close.mockReset();
  // jsdom has no top layer. Model the native dialog focus contract explicitly.
  const before = new WeakMap<HTMLDialogElement, HTMLElement>();
  HTMLDialogElement.prototype.showModal = function () {
    native.show(); before.set(this, document.activeElement as HTMLElement); this.setAttribute("open", ""); this.querySelector<HTMLButtonElement>("button")?.focus();
  };
  HTMLDialogElement.prototype.close = function () { native.close(); this.removeAttribute("open"); before.get(this)?.focus(); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function Fixture() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Open sheet</button><FriendDialog open={open} title="Discoveries" onClose={() => setOpen(false)}><button>Inside</button></FriendDialog></>;
}
function mount() { return render(<I18nProvider locale="en" dict={getDict("en")}><Fixture /></I18nProvider>); }

describe("the friends native dialog", () => {
  it.each(["Escape", "close", "backdrop"] as const)("uses native modal semantics and dismisses through %s, restoring trigger focus", mode => {
    const page = mount(), trigger = page.getByRole("button", { name: "Open sheet" }); trigger.focus(); fireEvent.click(trigger);
    const dialog = page.getByRole("dialog", { name: "Discoveries" });
    expect(native.show).toHaveBeenCalledOnce(); expect(document.activeElement).toBe(page.getByRole("button", { name: getDict("en").friends.close }));
    if (mode === "Escape") { const event = new Event("cancel", { cancelable: true }); fireEvent(dialog, event); expect(event.defaultPrevented).toBe(true); }
    else if (mode === "close") fireEvent.click(page.getByRole("button", { name: getDict("en").friends.close }));
    else fireEvent.click(dialog);
    expect(page.queryByRole("dialog")).toBeNull(); expect(native.close).toHaveBeenCalledOnce(); expect(document.activeElement).toBe(trigger);
  });
  it("does not dismiss when tapping dialog contents", () => {
    const page = mount(); fireEvent.click(page.getByRole("button", { name: "Open sheet" })); fireEvent.click(page.getByRole("button", { name: "Inside" }));
    expect(page.getByRole("dialog", { name: "Discoveries" })).toBeTruthy(); expect(native.close).not.toHaveBeenCalled();
  });
});
