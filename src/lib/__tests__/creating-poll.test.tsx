// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { en } from "@/i18n/dictionaries/en";
import { CreatingStatus } from "@/app/creating/[gameId]/CreatingStatus";
import { creationProgress } from "@/domain/creation-progress";
import { creationStep, type GameStatus } from "@/domain/order-state";

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("React", React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function status(value: GameStatus) {
  return new Response(JSON.stringify({ status: value, ...creationStep(value), ...creationProgress({ status: value, characterReady: true, spotsDone: 27, spotsTotal: 27 }), pending: value === "TARGETS_GENERATING", playUrl: "/play/test", delivered: value === "DELIVERED", avatarUrl: null, place: null }));
}
function mount() {
  return render(<I18nProvider locale="en" dict={en}><CreatingStatus gameId="test-game" childName="Test" isAdmin={false} /></I18nProvider>);
}

describe("the mounted creating screen", () => {
  it("makes one read for a delivered game and stops", async () => {
    const fetch = vi.fn().mockResolvedValue(status("DELIVERED")); vi.stubGlobal("fetch", fetch);
    mount(); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe("/api/games/test-game/status");
  });
  it("keeps reading status while one generation nudge is outstanding", async () => {
    let finishNudge!: (response: Response) => void; let reads = 0;
    const fetch = vi.fn((url: string) => {
      if (url.includes("/jobs/tick")) return new Promise<Response>((resolve) => { finishNudge = resolve; });
      reads++;
      return Promise.resolve(status(reads < 3 ? "TARGETS_GENERATING" : "DELIVERED"));
    });
    vi.stubGlobal("fetch", fetch); mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(5500); });
    expect(reads).toBe(3);
    expect(fetch.mock.calls.filter(([url]) => url.includes("/jobs/tick"))).toHaveLength(1);
    await act(async () => { finishNudge(new Response("{}")); await vi.advanceTimersByTimeAsync(30_000); });
    expect(reads).toBe(3);
  });
});
