// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicBeachDemo } from "../../../../content/demo/beach-v1";
import { emptyAdventureProgress, recordAdventureEvent } from "@/domain/adventure/progress";
import { createPlayStore } from "../../store/play-store";
import { GameI18nProvider } from "../../i18n";
import { PassportCompletion } from "../PassportCompletion";
import { readPassportPreferences } from "../../engine/passport-storage";
import { getDict } from "@/i18n";

const audio = vi.hoisted(() => ({ play: vi.fn(), unlock: vi.fn(), startAmbient: vi.fn() }));
vi.mock("../../audio/sounds", () => ({ sounds: () => audio }));
vi.mock("../CelebrationOverlay", () => ({ CelebrationOverlay: () => <div data-testid="celebration" /> }));
vi.mock("../PassportMemory", () => ({ PassportMemory: ({ targetId }: { targetId: string }) => <span data-testid="memory">{targetId}</span> }));
const copy = { wrongTarget: "no", wrongTargetNoItem: "no", bonus: "bonus", fallbackSuccess: "found" };

beforeEach(() => {
  vi.stubGlobal("React", React); vi.useFakeTimers(); localStorage.clear();
  window.matchMedia = (() => ({ matches: false })) as never;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  audio.play.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function fixture(owner = false) {
  const config = publicBeachDemo("en"), scene = config.scenes[0]!, board = config.adventure!.boards[0]!;
  let album = emptyAdventureProgress(config.gameId, config.adventure!);
  for (const targetId of board.targetIds) album = recordAdventureEvent(album, config.gameId, config.adventure!, { kind: "target-found", boardSlug: board.boardSlug, targetId, variant: "A" }).progress;
  album = recordAdventureEvent(album, config.gameId, config.adventure!, { kind: "discovery-found", boardSlug: board.boardSlug, discoveryId: board.discoveries[0]!.id }).progress;
  const store = { ...createPlayStore(config, { copy }).getState(), album, albumMode: owner ? "owner" as const : "guest" as const, albumState: "saved" as const, nextScene: vi.fn(() => "next-place"), openScene: vi.fn(), openPassport: vi.fn() };
  const onStay = vi.fn();
  const ui = () => <GameI18nProvider locale="en"><PassportCompletion store={store} scene={scene} onStay={onStay} /></GameI18nProvider>;
  return { store, scene, board, onStay, ui };
}

describe("passport completion choreography", () => {
  it("lands the same accessible mark-only die as the book, retaining the animation trigger", () => {
    const f = fixture(); render(f.ui());
    const stamp = screen.getByRole("img", { name: getDict("en").travelPassport.stamped });
    expect(stamp.classList.contains("passport-stamp")).toBe(true);
    expect(stamp.classList.contains("passport-finale__stamp")).toBe(true);
    expect(stamp.getAttribute("data-new")).toBe("true");
    expect(stamp.textContent).toBe("");
    expect(stamp.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
  it("skip settles without navigating, keeps six slots and never auto-closes", () => {
    const f = fixture(), view = render(f.ui());
    expect(view.container.querySelector("dialog")?.dataset.phase).toBe("playing");
    expect(view.container.querySelectorAll(".passport-finale__items li")).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "Show my page" }));
    expect(view.container.querySelector("dialog")?.dataset.phase).toBe("settled");
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(view.container.querySelector("dialog")?.hasAttribute("open")).toBe(true);
    expect(f.onStay).not.toHaveBeenCalled(); expect(f.store.openScene).not.toHaveBeenCalled();
    expect(readPassportPreferences(f.store.config.gameId)[f.scene.slug]?.stampSeen).toBe(true);
  });
  it("a replay does not stamp again; a newly collected item still has its own arrival", () => {
    const f = fixture();
    render(f.ui()); fireEvent.click(screen.getByRole("button", { name: "Show my page" })); cleanup();
    const second = render(f.ui());
    expect(second.container.querySelector("dialog")?.dataset.phase).toBe("settled");
    expect(second.container.querySelector(".passport-finale__stamp")?.getAttribute("data-new")).toBe("false");
    cleanup();
    f.store.album = recordAdventureEvent(f.store.album, f.store.config.gameId, f.store.config.adventure!, { kind: "discovery-found", boardSlug: f.scene.slug, discoveryId: f.board.discoveries[1]!.id }).progress;
    const third = render(f.ui());
    expect(third.container.querySelectorAll('.passport-finale__items [data-new="true"]')).toHaveLength(1);
    expect(third.container.querySelector(".passport-finale__stamp")?.getAttribute("data-new")).toBe("false");
  });
  it("reduced motion settles immediately; mute suppresses cues", () => {
    const f = fixture(); window.matchMedia = (() => ({ matches: true })) as never;
    const view = render(f.ui());
    expect(view.container.querySelector("dialog")?.dataset.phase).toBe("settled");
    expect(screen.queryByTestId("celebration")).toBeNull();
    act(() => { vi.advanceTimersByTime(3000); }); expect(audio.play).not.toHaveBeenCalled();
    cleanup(); localStorage.clear(); window.matchMedia = (() => ({ matches: false })) as never;
    f.store.muted = true; render(f.ui());
    act(() => { vi.advanceTimersByTime(3000); }); expect(audio.play).not.toHaveBeenCalled();
  });
  it("uses the owner's chosen photo and acknowledges only after the account confirms progress", async () => {
    const f = fixture(true), chosen = f.board.targetIds[0]!;
    const request = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === "POST" ? { ok: true } : { pending: { stamp: true, discoveryIds: [f.board.discoveries[0]!.id] }, childId: "family-test", photoTargetId: chosen }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    const view = render(f.ui());
    await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
    expect(screen.getByTestId("memory").textContent).toBe(chosen);
    fireEvent.click(screen.getByRole("button", { name: "Show my page" }));
    expect(request.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(1);
    expect(view.container.querySelector("dialog")?.hasAttribute("open")).toBe(true);
  });
});
