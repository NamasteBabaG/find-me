// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { en } from "@/i18n/dictionaries/en";
import { ManageGame } from "../ManageGame";

/**
 * The two things a parent cannot undo (a new link, deleting the game) ask
 * first in the product's own dialog, and nothing is submitted until the
 * parent says so there.
 */
const actions = vi.hoisted(() => ({ deleteGameAction: vi.fn(), rotateLinkAction: vi.fn(), updateGiftAction: vi.fn() }));
vi.mock("../../actions", () => actions);

beforeEach(() => { vi.stubGlobal("React", React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function mount() {
  const view = render(
    <I18nProvider locale="en" dict={en}>
      <ManageGame gameId="game-1" playUrl="https://example.test/play/shr_1.sig" gift={{}} childName="Noa" />
    </I18nProvider>,
  );
  const dialog = view.container.querySelector<HTMLDialogElement>("dialog.fm-dialog")!;
  const deleteForm = view.container.querySelector<HTMLFormElement>("form:has(.fm-btn--danger)")!;
  // jsdom has no requestSubmit: a real submit event stands in for it.
  deleteForm.requestSubmit = () => { fireEvent.submit(deleteForm); };
  return { ...view, dialog, deleteForm };
}

describe("manage game: the questions before the irreversible", () => {
  it("asks in a dialog before deleting, and cancel submits nothing", () => {
    const { dialog, deleteForm } = mount();
    expect(dialog.hasAttribute("open")).toBe(false);
    fireEvent.submit(deleteForm);
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.textContent).toContain("Delete Noa's game?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep the game" }));
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(actions.deleteGameAction).not.toHaveBeenCalled();
  });

  it("confirming lets the submit through, once; the next one asks again", async () => {
    const { dialog, deleteForm } = mount();
    fireEvent.submit(deleteForm);
    expect(actions.deleteGameAction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, delete the game" }));
    await waitFor(() => expect(actions.deleteGameAction).toHaveBeenCalledTimes(1));
    expect(dialog.hasAttribute("open")).toBe(false);
    fireEvent.submit(deleteForm);
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(actions.deleteGameAction).toHaveBeenCalledTimes(1);
  });

  it("asks the same way before replacing the link", () => {
    const view = mount();
    const rotate = [...view.container.querySelectorAll("form")].find((f) => f.textContent?.includes("Replace link"))!;
    fireEvent.submit(rotate);
    expect(view.dialog.hasAttribute("open")).toBe(true);
    expect(view.dialog.textContent).toContain("The previous link will stop working.");
    expect(actions.rotateLinkAction).not.toHaveBeenCalled();
    fireEvent.click(within(view.dialog).getByRole("button", { name: "Keep the link" }));
    expect(view.dialog.hasAttribute("open")).toBe(false);
    expect(actions.rotateLinkAction).not.toHaveBeenCalled();
  });

  it("offers manual copying when clipboard access fails, and reports success only after it succeeds", async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("blocked")).mockResolvedValueOnce(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const view = mount();
    fireEvent.click(view.getByRole("button", { name: en.library.share.copy }));
    await waitFor(() => expect(view.getByRole("status").textContent).toBe(en.library.share.copyFailed));
    expect(view.getByDisplayValue("https://example.test/play/shr_1.sig")).toBeTruthy();
    expect(view.queryByText(en.library.share.copied)).toBeNull();
    fireEvent.click(view.getByRole("button", { name: en.library.share.copy }));
    await waitFor(() => expect(view.getByRole("button", { name: en.library.share.copied })).toBeTruthy());
    expect(view.queryByRole("status")).toBeNull();
    expect(writeText).toHaveBeenCalledTimes(2);
  });
});
