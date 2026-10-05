// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDict } from "@/i18n";
import type { FamilyWorldCard, FamilyWorlds } from "@/domain/family-worlds";
import { GameI18nProvider } from "../../i18n";
import { OwnerWorldSelector } from "../OwnerWorldSelector";
import { GameShell } from "../GameShell";
import { composeWorld } from "@/domain/game/compose";
import { buildDemoConfig } from "@/services/demo";
import { findWorld } from "../../../../content/worlds";
import { boardSlugs } from "@/domain/world";
import { newRound } from "@/domain/game/round";
import { emptyProgress } from "@/domain/game/progress";
import { loadRound, saveRound } from "../../engine/round-storage";
import { saveProgress } from "../../engine/progress-storage";
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("../../audio/sounds", () => ({ sounds: () => ({ muted: false, restoreMutePreference() { return false; }, subscribeMuted() { return () => {}; }, unlock() {}, play() {}, setScene() {}, startAmbient() {}, stopAmbient() {} }), bindGameAudio: () => () => {} }));

const card = (worldSlug: string, extra: Partial<FamilyWorldCard> = {}): FamilyWorldCard => ({
  worldSlug, name: worldSlug === "journey" ? "Around the World" : "The Enchanted Kingdom", tagline: "An adventure", icon: worldSlug === "journey" ? "🌍" : "👑",
  gameId: null, status: "available", current: false, completedPlaces: null, totalPlaces: 9, foundTargets: null, totalTargets: 27,
  playHref: null, purchaseHref: `/family/fam_test/worlds/${worldSlug}/purchase?returnGame=game_source`, ...extra,
});
const owned = card("journey", { gameId: "game_source", status: "ready", current: true, completedPlaces: 2, foundTargets: 7, playHref: "/family/fam_test/play/game_source?world=journey", purchaseHref: null });
const ready = card("kingdom", { gameId: "game_second", status: "ready", foundTargets: 0, completedPlaces: 0, playHref: "/family/fam_test/play/game_second?world=kingdom", purchaseHref: null });
const data = (worlds: FamilyWorldCard[]): FamilyWorlds & { ok: true } => ({ ok: true, childId: "fam_test", currentGameId: "game_source", worlds });
function mount(worlds: FamilyWorldCard[], locale: "en" | "he" = "en") {
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => data(worlds) }));
  vi.stubGlobal("fetch", fetcher);
  const onCurrentWorld = vi.fn();
  const view = render(<GameI18nProvider locale={locale}><OwnerWorldSelector gameId="game_source" worldSlug="journey" onCurrentWorld={onCurrentWorld} /></GameI18nProvider>);
  return { ...view, fetcher, onCurrentWorld, copy: getDict(locale).worldSelector };
}
beforeEach(() => {
  vi.stubGlobal("React", React); router.replace.mockReset(); window.history.replaceState({}, ""); window.localStorage.clear();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(async () => {
  cleanup();
  // Native history traversal is asynchronous; finish a sheet's cleanup before
  // the next test installs its map state and popstate listener.
  await new Promise(resolve => setTimeout(resolve, 20));
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("a child's owner worlds sheet", () => {
  it.each(["en", "he"] as const)("is visible with one owned world, opens a localized dialog and gives previews no board images in %s", async locale => {
    const view = mount([owned, card("kingdom")], locale);
    expect(view.fetcher).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: new RegExp(view.copy.trigger) }));
    const dialog = view.getByRole("dialog", { name: view.copy.title });
    expect(dialog.getAttribute("dir")).toBe(locale === "he" ? "rtl" : "ltr");
    expect(view.getByRole("button", { name: view.copy.close })).toBeTruthy();
    await waitFor(() => expect(view.getByRole("button", { name: /Around the World/ })).toBeTruthy());
    expect(view.fetcher).toHaveBeenCalledWith("/api/family/worlds?gameId=game_source&world=journey", expect.objectContaining({ cache: "no-store", credentials: "same-origin" }));
    expect(dialog.querySelector("img")).toBeNull();
    expect(view.getByRole("button", { name: /Around the World/ }).getAttribute("aria-current")).toBe("true");
  });
  it("switches a ready separate game without writing or resetting progress", async () => {
    window.localStorage.setItem("findme:progress:v1:game_source", "saved-progress");
    const view = mount([owned, ready]);
    fireEvent.click(view.getByRole("button", { name: /My worlds/ }));
    fireEvent.click(await view.findByRole("button", { name: /The Enchanted Kingdom/ }));
    expect(router.replace).toHaveBeenCalledExactlyOnceWith(ready.playHref);
    expect(view.onCurrentWorld).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("findme:progress:v1:game_source")).toBe("saved-progress");
    expect(view.getByRole("button", { name: /The Enchanted Kingdom/ }).getAttribute("aria-disabled")).toBe("true");
  });
  it("switches a second map in the current historical game internally", async () => {
    const view = mount([owned, { ...ready, gameId: "game_source" }]);
    fireEvent.click(view.getByRole("button", { name: /My worlds/ }));
    fireEvent.click(await view.findByRole("button", { name: /The Enchanted Kingdom/ }));
    expect(view.onCurrentWorld).toHaveBeenCalledExactlyOnceWith("kingdom");
    expect(router.replace).not.toHaveBeenCalled();
    expect(view.queryByRole("dialog")).toBeNull();
  });
  it.each(["ready", "parent"] as const)("a cancelled %s navigation leaves a dismissible sheet entry, without a duplicate map entry", async destination => {
    window.history.replaceState({ sourceMap: "original" }, "");
    const back = vi.spyOn(window.history, "back");
    const view = mount([owned, destination === "ready" ? ready : card("kingdom")]);
    fireEvent.click(view.getByRole("button", { name: /My worlds/ }));
    fireEvent.click(await view.findByRole("button", { name: /The Enchanted Kingdom/ }));
    if (destination === "parent") {
      fireEvent.click(view.getByRole("button", { name: view.copy.parentAction }));
      const link = view.getByRole("link", { name: view.copy.parentContinue });
      // Simulate a router/unsaved-work guard cancelling before Link navigates.
      link.addEventListener("click", event => event.preventDefault(), { capture: true, once: true });
      fireEvent.click(link);
    } else expect(router.replace).toHaveBeenCalledExactlyOnceWith(ready.playHref);
    expect(window.history.state.findMeWorldSelector).toBe("game_source");
    fireEvent.click(view.getByRole("button", { name: view.copy.close }));
    await waitFor(() => expect(window.history.state).toEqual({ sourceMap: "original" }));
    expect(back).toHaveBeenCalledOnce();
    expect(view.queryByRole("dialog")).toBeNull();
  });
  it("does not traverse Back on unmount after the chosen route replaces the sheet entry", async () => {
    window.history.replaceState({ sourceMap: "original" }, "");
    const back = vi.spyOn(window.history, "back");
    router.replace.mockImplementationOnce((href: string) => window.history.replaceState({ __NA: true }, "", href));
    const view = mount([owned, ready]);
    fireEvent.click(view.getByRole("button", { name: /My worlds/ }));
    fireEvent.click(await view.findByRole("button", { name: /The Enchanted Kingdom/ }));
    expect(window.location.pathname).toBe("/family/fam_test/play/game_second");
    expect(window.history.state).toEqual({ __NA: true });
    view.unmount();
    expect(back).not.toHaveBeenCalled();
    // The destination occupies the sheet's entry; its first Back returns to
    // the original map, rather than passing through another identical map.
    window.history.back(); await waitFor(() => expect(window.history.state).toEqual({ sourceMap: "original" }));
  });
  it.each(["available", "preparing", "payment_pending", "attention"] as const)("keeps %s outside play and checkout until explicit parent handoff", async status => {
    const world = card("kingdom", { status, gameId: status === "available" ? null : "game_waiting" });
    const view = mount([owned, world]);
    fireEvent.click(view.getByRole("button", { name: /My worlds/ }));
    fireEvent.click(await view.findByRole("button", { name: /The Enchanted Kingdom/ }));
    expect(view.queryByRole("link")).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
    fireEvent.click(view.getByRole("button", { name: status === "available" ? view.copy.parentAction : view.copy.preparationAction }));
    expect(view.getByRole("link", { name: view.copy.parentContinue }).getAttribute("href")).toBe(world.purchaseHref);
    expect(view.fetcher).toHaveBeenCalledOnce(); // GET only; no purchase/session mutation
  });
  it("does not offer a parent purchase for an unavailable world", async () => {
    const view = mount([owned, card("kingdom", { status: "unavailable", purchaseHref: null })]);
    fireEvent.click(view.getByRole("button", { name: /My worlds/ }));
    fireEvent.click(await view.findByRole("button", { name: /The Enchanted Kingdom/ }));
    expect(view.queryByRole("link")).toBeNull();
    expect(view.queryByRole("button", { name: view.copy.parentAction })).toBeNull();
  });
  it("Escape and browser Back dismiss the sheet, and a failed read can recover", async () => {
    const view = mount([owned]);
    view.fetcher.mockRejectedValueOnce(new Error("offline"));
    const trigger = view.getByRole("button", { name: /My worlds/ });
    fireEvent.click(trigger);
    await view.findByText(view.copy.loadError);
    fireEvent.click(view.getByRole("button", { name: view.copy.reload }));
    await view.findByRole("button", { name: /Around the World/ });
    const dialog = view.getByRole("dialog");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(view.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    // Let native history settle before opening a new sheet.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    fireEvent.click(trigger);
    window.history.replaceState({}, "");
    fireEvent(window, new PopStateEvent("popstate"));
    expect(view.queryByRole("dialog")).toBeNull();
  });
  it("entering another map preserves and pauses a replay that does not contain that world's boards", () => {
    const definitions = [findWorld("journey")!, findWorld("kingdom")!];
    const base = buildDemoConfig("en", boardSlugs(definitions[0]!)[0]!, "Test");
    const worlds = definitions.map(world => composeWorld(world, base.child, "en"));
    const config = { ...base, adventure: undefined, gameId: "selector-round", worlds, world: worlds[0],
      scenes: definitions.flatMap(world => boardSlugs(world).map(slug => buildDemoConfig("en", slug, "Test").scenes[0]!)) };
    const saved = newRound(config, boardSlugs(definitions[1]!)[0])!;
    expect(saved.route.some(slug => boardSlugs(definitions[0]!).includes(slug))).toBe(false);
    saveRound(saved); saveProgress({ ...emptyProgress(config.gameId), revealed: true, lastWorld: "kingdom" });
    const view = render(<GameShell config={config} skipGift initialWorld="journey" />);
    expect(view.getByRole("heading", { name: worlds[0]!.name })).toBeTruthy();
    expect(view.container.querySelectorAll(".wmap__place")).toHaveLength(9);
    expect(loadRound(config)).toEqual({ ...saved, active: false });
  });
});
