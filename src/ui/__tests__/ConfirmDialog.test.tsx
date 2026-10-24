// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../ConfirmDialog";

const native = { show: vi.fn(), close: vi.fn() };
const confirm = vi.fn();

beforeEach(() => {
  vi.stubGlobal("React", React);
  native.show.mockReset(); native.close.mockReset(); confirm.mockReset();
  // jsdom has no modal top layer. Model open/close and native restoration;
  // the component itself must choose its initial focus after opening.
  const previous = new WeakMap<HTMLDialogElement, HTMLElement>();
  HTMLDialogElement.prototype.showModal = function () {
    native.show();
    previous.set(this, document.activeElement as HTMLElement);
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    native.close();
    this.removeAttribute("open");
    previous.get(this)?.focus();
  };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Fixture({ pending = false }: { pending?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)}>Open confirmation</button>
    <ConfirmDialog open={open} title="Remove example game" confirmLabel="Remove game" cancelLabel="Keep game" danger pending={pending} onConfirm={confirm} onCancel={() => setOpen(false)}>
      This example action cannot be undone.
    </ConfirmDialog>
  </>;
}
function mount(pending = false) {
  const page = render(<Fixture pending={pending} />);
  const trigger = page.getByRole("button", { name: "Open confirmation" });
  trigger.focus(); fireEvent.click(trigger);
  return { page, trigger };
}

describe("shared confirmation dialog", () => {
  it("describes the question and explicitly focuses the safe action each time it opens", () => {
    const { page, trigger } = mount();
    const dialog = page.getByRole("dialog", { name: "Remove example game", description: "This example action cannot be undone." });
    expect(native.show).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(page.getByRole("button", { name: "Keep game" }));
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.click(page.getByRole("button", { name: "Keep game" }));
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    expect(native.show).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(page.getByRole("button", { name: "Keep game" }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each(["Escape", "cancel action", "backdrop"] as const)("dismisses through %s and returns to its trigger", (mode) => {
    const { page, trigger } = mount();
    const dialog = page.getByRole("dialog");
    if (mode === "Escape") {
      const event = new Event("cancel", { cancelable: true });
      fireEvent(dialog, event); expect(event.defaultPrevented).toBe(true);
    } else if (mode === "cancel action") fireEvent.click(page.getByRole("button", { name: "Keep game" }));
    else fireEvent.click(dialog, { clientX: 20, clientY: 20 });
    expect(page.queryByRole("dialog")).toBeNull();
    expect(native.close).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("keeps the question open for clicks on content or the dialog's own chrome", () => {
    const { page } = mount();
    const dialog = page.getByRole("dialog");
    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({ left: 100, top: 100, right: 420, bottom: 300, x: 100, y: 100, width: 320, height: 200, toJSON: () => ({}) });
    fireEvent.click(page.getByRole("heading", { name: "Remove example game" }));
    fireEvent.click(dialog, { clientX: 110, clientY: 110 });
    expect(page.getByRole("dialog")).toBe(dialog);
    expect(native.close).not.toHaveBeenCalled();
    fireEvent.click(dialog, { clientX: 40, clientY: 40 });
    expect(page.queryByRole("dialog")).toBeNull();
  });

  it("keeps the action name while a pending confirmation prevents repeat submission", () => {
    const { page } = mount(true);
    const action = page.getByRole("button", { name: "Remove game" }) as HTMLButtonElement;
    expect(action.disabled).toBe(true);
    expect(action.getAttribute("aria-busy")).toBe("true");
    expect((page.getByRole("button", { name: "Keep game" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(action);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("omits an absent description instead of referring to a missing element", () => {
    const page = render(<ConfirmDialog open title="Question" confirmLabel="Continue" cancelLabel="Back" onConfirm={confirm} onCancel={() => {}} />);
    expect(page.getByRole("dialog", { name: "Question" }).getAttribute("aria-describedby")).toBeNull();
  });
});
