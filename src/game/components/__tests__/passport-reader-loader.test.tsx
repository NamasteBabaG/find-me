// @vitest-environment jsdom
import React, { type ComponentType } from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDemoConfig } from "@/services/demo";
import { getDict, type Locale } from "@/i18n";
import { GameI18nProvider } from "../../i18n";
import { createPlayStore, type PlayStore } from "../../store/play-store";
import { PassportReaderLoader } from "../PassportReaderLoader";

type Reader = ComponentType<{ store: PlayStore }>;
function deferred() {
  let resolve!: (reader: Reader) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Reader>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const Reader = ({ store }: { store: PlayStore }) => <div data-testid="loaded-reader">{store.config.child.name}</div>;
const game = (locale: Locale = "en") => createPlayStore(buildDemoConfig(locale, "sydney", "Example"), {
  readOnlyPreview: true, copy: getDict(locale).game.copy,
}).getState();
const wrap = (store: PlayStore, loadReader: (kind: "legacy" | "adventure") => Promise<Reader>, kind: "legacy" | "adventure" = "legacy") =>
  <GameI18nProvider locale={store.config.locale}><PassportReaderLoader kind={kind} store={store} loadReader={loadReader} /></GameI18nProvider>;

beforeEach(() => { vi.stubGlobal("React", React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("recoverable lazy passport reader", () => {
  it.each(["en", "he"] as const)("keeps the map available during a delayed %s reader import", async locale => {
    const waiting = deferred(), load = vi.fn(() => waiting.promise), store = game(locale);
    const onMap = vi.spyOn(store, "goToMap");
    const view = render(wrap(store, load));
    expect(view.getByRole("status").textContent).toBe(getDict(locale).travelPassport.opening);
    expect(view.queryByRole("button", { name: getDict(locale).travelPassport.retry })).toBeNull();
    fireEvent.click(view.getByRole("button", { name: getDict(locale).game.passport.map }));
    expect(onMap).toHaveBeenCalledOnce();
    await waitFor(() => expect(load).toHaveBeenCalledWith("legacy"));
    await act(async () => { waiting.resolve(Reader); });
    expect(await view.findByTestId("loaded-reader")).toHaveProperty("textContent", "Example");
    expect(view.queryByRole("status")).toBeNull();
  });

  it("contains rejection and retries with a fresh loader call while keeping a map exit", async () => {
    const first = deferred(), next = deferred(), store = game("he");
    const load = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => next.promise);
    const onMap = vi.spyOn(store, "goToMap"), view = render(wrap(store, load, "adventure"));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await act(async () => { first.reject(new Error("synthetic import failure")); });
    expect(view.getByRole("status").textContent).toBe(getDict("he").travelPassport.unavailable);
    expect(view.container.textContent).not.toContain("synthetic import failure");
    fireEvent.click(view.getByRole("button", { name: getDict("he").game.passport.map }));
    expect(onMap).toHaveBeenCalledOnce();
    fireEvent.click(view.getByRole("button", { name: getDict("he").travelPassport.retry }));
    expect(view.getByRole("status").textContent).toBe(getDict("he").travelPassport.opening);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load).toHaveBeenNthCalledWith(2, "adventure");
    await act(async () => { next.resolve(Reader); });
    expect(await view.findByTestId("loaded-reader")).toBeTruthy();
  });

  it("handles a synchronous loader failure and then recovers", async () => {
    const load = vi.fn().mockImplementationOnce(() => { throw new Error("synthetic unavailable loader"); }).mockResolvedValueOnce(Reader);
    const view = render(wrap(game(), load));
    await waitFor(() => expect(view.getByRole("status").textContent).toBe(getDict("en").travelPassport.unavailable));
    fireEvent.click(view.getByRole("button", { name: getDict("en").travelPassport.retry }));
    expect(await view.findByTestId("loaded-reader")).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it.each(["resolve", "reject"] as const)("ignores a late %s after leaving the reader", async outcome => {
    const waiting = deferred(), load = vi.fn(() => waiting.promise), error = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = render(wrap(game(), load));
    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => {
      if (outcome === "resolve") waiting.resolve(Reader);
      else waiting.reject(new Error("synthetic late rejection"));
    });
    expect(view.container).toHaveProperty("textContent", "");
    expect(error).not.toHaveBeenCalled();
  });

  it("uses current store props after successful loading without importing again", async () => {
    const load = vi.fn().mockResolvedValue(Reader), store = game();
    const view = render(wrap(store, load));
    expect(await view.findByTestId("loaded-reader")).toHaveProperty("textContent", "Example");
    const newer = { ...store, config: { ...store.config, child: { ...store.config.child, name: "Updated" } } };
    view.rerender(wrap(newer, load));
    expect(view.getByTestId("loaded-reader")).toHaveProperty("textContent", "Updated");
    expect(load).toHaveBeenCalledOnce();
  });
});
