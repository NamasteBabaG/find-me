// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { en } from "@/i18n/dictionaries/en";
import { he } from "@/i18n/dictionaries/he";
import { CreatingStatus } from "@/app/creating/[gameId]/CreatingStatus";
import { creationProgress } from "@/domain/creation-progress";
import { creationStep, type GameStatus } from "@/domain/order-state";

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("React", React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function status(value: GameStatus, playUrl: string | null = "/play/test") {
  return new Response(JSON.stringify({ status: value, ...creationStep(value), ...creationProgress({ status: value, characterReady: true, spotsDone: 27, spotsTotal: 27 }), pending: value === "TARGETS_GENERATING", playUrl, delivered: value === "DELIVERED", avatarUrl: null, place: null }));
}
function mount() {
  return render(<I18nProvider locale="en" dict={en}><CreatingStatus gameId="test-game" childName="Test" isAdmin={false} /></I18nProvider>);
}

describe("the mounted creating screen", () => {
  it("labels the new route as automatic publication rather than human approval", async () => {
    const payload = { status: "TARGETS_GENERATING", automaticPublication: true,
      ...creationProgress({ status: "TARGETS_GENERATING", characterReady: true, spotsDone: 10, spotsTotal: 45 }),
      pending: false, playUrl: null, avatarUrl: "/synthetic-full-portrait", spotsDone: 10, spotsTotal: 45, place: null };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
    const view = mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(view.getByText(en.create.creating.automaticCheck)).toBeTruthy();
    expect(view.queryByText(en.create.creating.milestones.check)).toBeNull();
    expect(view.getByText("10 of 45 hiding spots")).toBeTruthy();
  });
  it.each(["READY", "DELIVERED"] as const)("invites opening a %s game on the real playable link only", async (value) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status(value)));
    const view = mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const open = view.getByRole("link", { name: en.create.creating.open });
    expect(open.getAttribute("href")).toBe("/play/test");
    expect(open.classList.contains("cp__open")).toBe(true);
    expect(view.container.querySelectorAll(".cp__open")).toHaveLength(1);
    expect(view.getByRole("link", { name: en.create.creating.manage }).classList.contains("cp__open")).toBe(false);
  });
  it.each([["QA_PENDING", "/play/test"], ["READY", null]] as const)("does not invite before a playable game and URL both exist (%s / %s)", async (value, playUrl) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(status(value, playUrl)));
    const view = mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(view.container.querySelector(".cp__open")).toBeNull();
    expect(view.queryByRole("link", { name: en.create.creating.open })).toBeNull();
  });
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
  it.each(["en", "he"] as const)("shows a held partial wizard truthfully in %s without completion ticks or a generation nudge", async locale => {
    const dict = locale === "he" ? he : en;
    const payload = { status: "MANUAL_REVIEW", ...creationProgress({ status: "MANUAL_REVIEW", characterReady: true, spotsDone: 0, spotsTotal: 27,
      fixedAssemblyReady: false, boardWizardState: "held" }), pending: true, playUrl: null, avatarUrl: "/synthetic-avatar", spotsDone: 0, spotsTotal: 27,
      place: { slug: "paris", name: "Paris" } };
    // Deliberately stale pending/place cannot make a held UI restart work.
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(payload))); vi.stubGlobal("fetch", fetch);
    const view = render(<I18nProvider locale={locale} dict={dict}><CreatingStatus gameId="test-game" childName="Test" isAdmin={false} /></I18nProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(5500); });
    expect(view.getByRole("heading", { name: dict.create.creating.heldTitle })).toBeTruthy();
    expect(view.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("20");
    expect(view.getByRole("progressbar").getAttribute("aria-valuetext")).toContain("20");
    expect(view.container.querySelectorAll(".cp__step--done")).toHaveLength(2);
    expect(view.container.querySelectorAll(".cp__step--active, .fm-spinner")).toHaveLength(0);
    expect(view.getByText(dict.create.creating.heldAction)).toBeTruthy();
    expect(view.queryByText(/Paris/)).toBeNull();
    expect(fetch.mock.calls.every(([url]) => String(url).includes("/status"))).toBe(true);
    expect(view.queryByRole("link", { name: dict.create.creating.open })).toBeNull();
  });
});
