// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicBeachDemo } from "../../../../content/demo/beach-v1";
import { getDict } from "@/i18n";
import { createPlayStore } from "../../store/play-store";
import { AdventurePassport } from "../AdventurePassport";

const copy = { wrongTarget: "no", wrongTargetNoItem: "no", bonus: "bonus", fallbackSuccess: "found" };

beforeEach(() => { vi.stubGlobal("React", React); localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** The owner's book is fetched; until it arrives (or if it cannot), its own space is already on screen. */
function owner(gameId: string) {
  const config = { ...publicBeachDemo("en"), gameId };
  return { ...createPlayStore(config, { copy }).getState(), albumMode: "owner" as const, worldSlug: "", goToMap: vi.fn() };
}

describe("the in-game passport while its book opens", () => {
  it("holds the book's frame with the opening words, and no retry while it is only waiting", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    const view = render(<AdventurePassport store={owner("passport-wait")} />);
    const frame = view.container.querySelector(".adventure-passport__frame");
    expect(frame).not.toBeNull();
    expect(frame!.closest(".travel-passport")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toBe(getDict("en").travelPassport.opening);
    expect(screen.queryByRole("button", { name: getDict("en").travelPassport.retry })).toBeNull();
  });

  it("says progress is safe inside the same frame and offers the way back there", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    const view = render(<AdventurePassport store={owner("passport-fail")} />);
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    const copyText = getDict("en").travelPassport;
    expect(screen.getByRole("status").textContent).toBe(copyText.unavailable);
    const retry = screen.getByRole("button", { name: copyText.retry });
    expect(retry.closest(".adventure-passport__frame")).not.toBeNull();
    fireEvent.click(retry);
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    // The child's way back to the map is its own 64px control.
    expect(view.container.querySelector(".adventure-passport__map")?.textContent).toBe(getDict("en").game.complete.map);
  });
});
