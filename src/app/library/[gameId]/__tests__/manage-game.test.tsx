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
    // The address is not printed until it is needed.
    expect(view.queryByDisplayValue("https://example.test/play/shr_1.sig")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: en.library.share.copy }));
    await waitFor(() => expect(view.getByText(en.library.share.copyFailed)).toBeTruthy());
    expect(view.getByDisplayValue("https://example.test/play/shr_1.sig")).toBeTruthy();
    expect(view.queryByText(en.library.share.copied)).toBeNull();
    fireEvent.click(view.getByRole("button", { name: en.library.share.copy }));
    await waitFor(() => expect(view.getByRole("button", { name: en.library.share.copied })).toBeTruthy());
    expect(view.queryByText(en.library.share.copyFailed)).toBeNull();
    expect(view.queryByDisplayValue("https://example.test/play/shr_1.sig")).toBeNull();
    expect(writeText).toHaveBeenCalledTimes(2);
  });
});

describe("manage game: the link to send", () => {
  const remount = (view: ReturnType<typeof mount>, playUrl: string) =>
    view.rerender(<I18nProvider locale="en" dict={en}><ManageGame gameId="game-1" playUrl={playUrl} gift={{}} childName="Noa" /></I18nProvider>);

  it("names the link instead of printing its address, and says so when a new link replaced it", () => {
    const view = mount();
    const ticket = view.container.querySelector(".share-ticket")!;
    expect(ticket.textContent).toContain("Noa's game link");
    expect(ticket.textContent).toContain("example.test");
    expect(ticket.textContent).not.toContain("shr_1");
    remount(view, "https://example.test/play/shr_2.sig");
    expect(view.container.querySelector(".share-ticket [role=status]")?.textContent).toBe(en.library.share.rotated);
  });

  it("shares the current link, also after it was replaced", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, clipboard: { writeText: vi.fn() } });
    const view = mount();
    remount(view, "https://example.test/play/shr_2.sig");
    fireEvent.click(view.getByRole("button", { name: en.library.share.send }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.test/play/shr_2.sig" })));
  });

  it("confirming a new link sends the replacement once, for this game", async () => {
    const view = mount();
    const rotate = [...view.container.querySelectorAll("form")].find((f) => f.textContent?.includes("Replace link"))!;
    rotate.requestSubmit = () => { fireEvent.submit(rotate); };
    fireEvent.submit(rotate);
    fireEvent.click(within(view.dialog).getByRole("button", { name: "Replace link" }));
    await waitFor(() => expect(actions.rotateLinkAction).toHaveBeenCalledTimes(1));
    expect((actions.rotateLinkAction.mock.calls[0]![0] as FormData).get("gameId")).toBe("game-1");
  });
});
