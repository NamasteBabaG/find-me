// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { getDict } from "@/i18n";
import type { GuestOwnerReport, GuestParticipantSummary } from "@/services/guest-sharing.service";
import { FriendDiscoveries } from "../FriendDiscoveries";

const text = getDict("en").friends.owner;
const observation = new Map<Element, IntersectionObserverCallback>();
class Observer {
  private elements: Element[] = [];
  constructor(private callback: IntersectionObserverCallback) {}
  observe(element: Element) { this.elements.push(element); observation.set(element, this.callback); }
  disconnect() { for (const element of this.elements) observation.delete(element); }
}
function person(id: string, nicknameId: GuestParticipantSummary["nicknameId"], activityRevision: number): GuestParticipantSummary {
  return { id, nicknameId, shareId: "gsr_test", createdAt: "2026-01-01T00:00:00.000Z", lastActivityAt: "2026-01-02T00:00:00.000Z",
    revision: activityRevision, activityRevision, hasNew: true, completedBoards: 0, totalBoards: 9, finds: 0, totalFinds: 27, complete: false, reactionId: null,
    boards: Array.from({ length: 9 }, (_, index) => ({ sceneSlug: `place-${index}`, title: `Place ${index + 1}`, finds: 0, total: 3, hintsUsed: 0, state: index === 0 ? "visited" as const : "unvisited" as const })) };
}
function report(participants = [person("gpt_fox", "fox", 1), person("gpt_star", "star", 2)]): GuestOwnerReport {
  return { gameId: "game_test", worldSlug: "journey", hasNew: participants.some(p => p.hasNew), participants,
    shares: [{ id: "gsr_test", active: true, expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null, revision: 2, seenRevision: 0 }] };
}
function response(value: GuestOwnerReport) { return new Response(JSON.stringify({ report: value }), { status: 200 }); }
function mount(management = false) { return render(<I18nProvider locale="en" dict={getDict("en")}><FriendDiscoveries gameId="game_test" worldSlug="journey" management={management} /></I18nProvider>); }
function intersect(element: Element, isIntersecting: boolean) {
  const callback = observation.get(element)!;
  callback([{ target: element, isIntersecting, intersectionRatio: isIntersecting ? .75 : 0 } as IntersectionObserverEntry], {} as IntersectionObserver);
}
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IntersectionObserver", Observer); observation.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("who found me", () => {
  it("distinguishes a real visit with zero finds from a board never visited", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(report([person("gpt_fox", "fox", 1)]))));
    const page = mount(); await waitFor(() => expect(page.getByRole("button", { name: new RegExp(text.title) }).textContent).toContain(text.new));
    fireEvent.click(page.getByRole("button", { name: new RegExp(text.title) }));
    const dialog = page.getByRole("dialog", { name: text.title });
    expect(within(dialog).getAllByText(text.visited)).toHaveLength(1);
    expect(within(dialog).getAllByText(text.notVisited)).toHaveLength(8);
    expect(within(dialog).getByText("0 of 27 found")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: text.remove })).toBeNull();
  });
  it("tells each place by a shape and a count, and keeps the words for a screen reader", async () => {
    const fox = person("gpt_fox", "fox", 1);
    fox.boards = fox.boards.map((board, i) => i === 1 ? { ...board, state: "partial" as const, finds: 2 } : i === 2 ? { ...board, state: "complete" as const, finds: 3 } : board);
    vi.stubGlobal("fetch", vi.fn(async () => response(report([fox]))));
    const page = mount(); fireEvent.click(page.getByRole("button", { name: new RegExp(text.title) }));
    const card = (await page.findByRole("heading", { name: "Fox" })).closest("article")!;
    // · not visited, ○ 0 looked, ◐ 2/3 partly, ★ all: never colour alone.
    expect([...card.querySelectorAll(".friend-person__mark")].slice(0, 4).map(mark => mark.textContent)).toEqual(["○ 0", "◐ 2/3", "★", "·"]);
    expect(card.querySelector(".friend-person__mark")?.getAttribute("aria-hidden")).toBe("true");
    expect(within(card).getByText("2 of 3 found")).toBeTruthy();
    expect(within(card).getByText(`Last played ${new Date(fox.lastActivityAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`)).toBeTruthy();
  });
  it("lists the current invitation's players first and puts closed invitations under their own heading", async () => {
    const closed = { id: "gsr_old", active: false, expiresAt: "2026-01-01T00:00:00.000Z", revokedAt: "2025-12-01T00:00:00.000Z", revision: 1, seenRevision: 1 };
    const both = report([{ ...person("gpt_fox", "fox", 1), shareId: "gsr_old" }, person("gpt_star", "star", 2)]);
    both.shares.push(closed);
    vi.stubGlobal("fetch", vi.fn(async () => response(both)));
    const page = mount(); fireEvent.click(page.getByRole("button", { name: new RegExp(text.title) }));
    const dialog = page.getByRole("dialog", { name: text.title });
    await within(dialog).findByRole("heading", { name: text.currentGroup });
    const headings = within(dialog).getAllByRole("heading").map(heading => `${heading.tagName}:${heading.textContent}`);
    expect(headings).toEqual([`H2:${text.title}`, `H3:${text.currentGroup}`, "H4:Star", `H3:${text.earlierGroup}`, "H4:Fox"]);
    cleanup();
    // Only the current invitation: no headings to read through.
    vi.stubGlobal("fetch", vi.fn(async () => response(report())));
    const plain = mount(); fireEvent.click(plain.getByRole("button", { name: new RegExp(text.title) }));
    await plain.findByRole("heading", { name: "Fox" });
    expect(within(plain.getByRole("dialog", { name: text.title })).getAllByRole("heading").map(heading => `${heading.tagName}:${heading.textContent}`)).toEqual([`H2:${text.title}`, "H3:Fox", "H3:Star"]);
  });
  it("keeps New on the cards for the whole visit after they are marked seen, and drops it once the sheet closes", async () => {
    let seen = false;
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)), value = report();
      if (body.operation === "seen") seen = true;
      if (seen) { value.shares[0]!.seenRevision = 2; value.participants.forEach(p => { p.hasNew = false; }); value.hasNew = false; }
      return response(value);
    }));
    const page = mount(); const open = () => page.getByRole("button", { name: new RegExp(text.title) });
    await waitFor(() => expect(open().textContent).toContain(text.new));
    fireEvent.click(open()); await waitFor(() => expect(observation.size).toBe(2));
    const cards = () => [...page.getByRole("dialog", { name: text.title }).querySelectorAll("article")];
    vi.useFakeTimers();
    await act(async () => { for (const card of cards()) intersect(card, true); vi.advanceTimersByTime(500); });
    await act(async () => { vi.advanceTimersByTime(450); });
    vi.useRealTimers();
    // The report now says nothing is new (the button agrees), but the cards being read keep their badge.
    await waitFor(() => expect(open().textContent).not.toContain(text.new));
    expect(cards().map(card => card.querySelector(".friend-new")?.textContent)).toEqual([text.new, text.new]);
    fireEvent.click(page.getByRole("button", { name: getDict("en").friends.close }));
    fireEvent.click(open()); await waitFor(() => expect(observation.size).toBe(2));
    expect(cards().map(card => card.querySelector(".friend-new"))).toEqual([null, null]);
  });
  it("keeps the previous report on a network error and a refresh can recover", async () => {
    let fail = false;
    vi.stubGlobal("fetch", vi.fn(async () => { if (fail) throw new Error("offline"); return response(report()); }));
    const page = mount(); await waitFor(() => expect(page.getByRole("button", { name: new RegExp(text.title) }).textContent).toContain(text.new));
    fireEvent.click(page.getByRole("button", { name: new RegExp(text.title) }));
    await page.findByRole("heading", { name: "Fox" }); await waitFor(() => expect((page.getByRole("button", { name: text.refresh }) as HTMLButtonElement).disabled).toBe(false));
    fail = true; fireEvent.click(page.getByRole("button", { name: text.refresh }));
    await page.findByText(text.error);
    expect(page.getByRole("heading", { name: "Fox" })).toBeTruthy(); expect(page.getByRole("heading", { name: "Star" })).toBeTruthy();
    fail = false; fireEvent.click(page.getByRole("button", { name: text.refresh }));
    await waitFor(() => expect(page.queryByText(text.error)).toBeNull());
  });
  it("marks a revision seen only after every new card is actually displayed, never just on opening the sheet", async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push(body);
      const value = report();
      if (body.operation === "seen") { value.shares[0]!.seenRevision = 2; value.participants.forEach(p => { p.hasNew = false; }); value.hasNew = false; }
      return response(value);
    }));
    const page = mount(); await waitFor(() => expect(page.getByRole("button", { name: new RegExp(text.title) }).textContent).toContain(text.new));
    expect(calls.some(body => body.operation === "seen")).toBe(false);
    fireEvent.click(page.getByRole("button", { name: new RegExp(text.title) }));
    await waitFor(() => expect(observation.size).toBe(2));
    const fox = page.getByRole("heading", { name: "Fox" }).closest("article")!, star = page.getByRole("heading", { name: "Star" }).closest("article")!;
    vi.useFakeTimers();
    await act(async () => { intersect(fox, false); intersect(star, false); vi.advanceTimersByTime(1000); });
    expect(calls.some(body => body.operation === "seen")).toBe(false);
    await act(async () => { intersect(fox, true); vi.advanceTimersByTime(500); });
    await act(async () => { vi.advanceTimersByTime(450); });
    expect(calls.some(body => body.operation === "seen")).toBe(false);
    await act(async () => { intersect(star, true); vi.advanceTimersByTime(500); });
    await act(async () => { vi.advanceTimersByTime(450); });
    expect(calls.filter(body => body.operation === "seen")).toEqual([expect.objectContaining({ markSeen: [{ shareId: "gsr_test", revision: 2 }] })]);
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(calls.filter(body => body.operation === "seen")).toHaveLength(1);
  });
  it("does not mark a fleeting or hidden card seen and cancels its visibility timer on close", async () => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => { calls.push(JSON.parse(String(init.body))); return response(report([person("gpt_fox", "fox", 1)])); }));
    const page = mount(); await waitFor(() => expect(page.getByRole("button", { name: new RegExp(text.title) }).textContent).toContain(text.new));
    fireEvent.click(page.getByRole("button", { name: new RegExp(text.title) })); await waitFor(() => expect(observation.size).toBe(1));
    const card = page.getByRole("heading", { name: "Fox" }).closest("article")!;
    vi.useFakeTimers();
    act(() => { intersect(card, true); vi.advanceTimersByTime(200); intersect(card, false); vi.advanceTimersByTime(800); });
    expect(calls.some(body => body.operation === "seen")).toBe(false);
    act(() => { intersect(card, true); vi.advanceTimersByTime(200); });
    fireEvent.click(page.getByRole("button", { name: getDict("en").friends.close }));
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(calls.some(body => body.operation === "seen")).toBe(false);
  });
  it("ignores an older read that finishes after a newer read, preserving the latest report", async () => {
    let resolveOld!: (value: Response) => void; const older = new Promise<Response>(resolve => { resolveOld = resolve; }); let count = 0;
    vi.stubGlobal("fetch", vi.fn(async () => ++count === 1 ? older : response(report([person("gpt_star", "star", 2)]))));
    const page = mount(); fireEvent.click(page.getByRole("button", { name: new RegExp(text.title) }));
    await page.findByRole("heading", { name: "Star" });
    await act(async () => { resolveOld(response(report([person("gpt_fox", "fox", 1)]))); });
    expect(page.queryByRole("heading", { name: "Fox" })).toBeNull();
    expect(page.getByRole("heading", { name: "Star" })).toBeTruthy();
  });
  it("shows pending feedback when an owner removes a result and never sends a duplicate remove", async () => {
    let resolveRemove!: (value: Response) => void; const pending = new Promise<Response>(resolve => { resolveRemove = resolve; }); const calls: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => { const body = JSON.parse(String(init.body)); calls.push(body); return body.operation === "remove" ? pending : response(report([person("gpt_fox", "fox", 1)])); }));
    const page = mount(true); fireEvent.click(page.getByRole("button", { name: new RegExp(text.title) }));
    const heading = await page.findByRole("heading", { name: "Fox" });
    fireEvent.click(within(heading.closest("article")!).getByRole("button", { name: text.remove }));
    const confirm = page.getByRole("dialog", { name: text.removeConfirm });
    const submit = within(confirm).getByRole("button", { name: text.remove }); fireEvent.click(submit); fireEvent.click(submit);
    expect((submit as HTMLButtonElement).disabled).toBe(true); expect(submit.getAttribute("aria-busy")).toBe("true");
    expect(calls.filter(body => body.operation === "remove")).toHaveLength(1);
    await act(async () => { resolveRemove(response(report([]))); });
    expect(page.queryByRole("heading", { name: "Fox" })).toBeNull();
    expect(page.queryByRole("dialog", { name: text.removeConfirm })).toBeNull();
  });
  it("retains results when removing needs fresh parent authentication, closes confirmation and bounds reauthentication", async () => {
    let release!: (response: Response) => void; const pending = new Promise<Response>(resolve => { release = resolve; });
    const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push({ path, body });
      if (body.operation === "remove") return new Response(JSON.stringify({ needsAdult: true }), { status: 200 });
      if (body.operation === "reauth") return pending;
      return response(report([person("gpt_fox", "fox", 1)]));
    }));
    const page = mount(true); fireEvent.click(page.getByRole("button", { name: new RegExp(text.title) }));
    const heading = await page.findByRole("heading", { name: "Fox" });
    fireEvent.click(within(heading.closest("article")!).getByRole("button", { name: text.remove }));
    fireEvent.click(within(page.getByRole("dialog", { name: text.removeConfirm })).getByRole("button", { name: text.remove }));
    await page.findByText(text.adult);
    expect(page.getByRole("heading", { name: "Fox" })).toBeTruthy();
    // The prompt is rendered before ConfirmDialog's passive effect closes the
    // native modal. Wait for the actual exit before starting reauthentication.
    await waitFor(() => expect(page.queryByRole("dialog", { name: text.removeConfirm })).toBeNull());
    const reauth = page.getByRole("button", { name: text.reauth }); fireEvent.click(reauth); fireEvent.click(reauth);
    expect((reauth as HTMLButtonElement).disabled).toBe(true); expect(reauth.getAttribute("aria-busy")).toBe("true");
    expect(calls.filter(call => call.body.operation === "reauth")).toEqual([{ path: "/api/friends/share", body: { gameId: "game_test", worldSlug: "journey", operation: "reauth", locale: "en" } }]);
    await act(async () => { release(new Response(JSON.stringify({ ok: true }), { status: 200 })); });
    await page.findByText(text.emailed);
    expect((page.getByRole("button", { name: text.reauth }) as HTMLButtonElement).disabled).toBe(true);
    expect(page.getByRole("heading", { name: "Fox" })).toBeTruthy();
    expect(calls.filter(call => call.body.operation === "remove")).toHaveLength(1);
  });
  it.each(["read", "remove"] as const)("a successful current-scope %s clears the stale parent email prompt and permits a new reauthentication attempt", async operation => {
    let needAdult = true, reauths = 0;
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.operation === "remove" && needAdult) return new Response(JSON.stringify({ needsAdult: true }), { status: 200 });
      if (body.operation === "reauth") { reauths++; return new Response(JSON.stringify({ ok: true }), { status: 200 }); }
      return response(report([person("gpt_fox", "fox", 1)]));
    }));
    const page = mount(true); fireEvent.click(page.getByRole("button", { name: new RegExp(text.title) }));
    const heading = await page.findByRole("heading", { name: "Fox" });
    const removeResult = () => {
      fireEvent.click(within(heading.closest("article")!).getByRole("button", { name: text.remove }));
      fireEvent.click(within(page.getByRole("dialog", { name: text.removeConfirm })).getByRole("button", { name: text.remove }));
    };
    removeResult(); await page.findByText(text.adult);
    fireEvent.click(page.getByRole("button", { name: text.reauth })); await page.findByText(text.emailed);
    needAdult = false;
    if (operation === "read") act(() => { window.dispatchEvent(new Event("focus")); });
    else removeResult();
    await waitFor(() => expect(page.queryByText(text.emailed)).toBeNull());
    expect(page.queryByText(text.adult)).toBeNull(); expect(page.getByRole("heading", { name: "Fox" })).toBeTruthy();
    needAdult = true; removeResult(); await page.findByText(text.adult);
    expect((page.getByRole("button", { name: text.reauth }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(page.getByRole("button", { name: text.reauth })); await page.findByText(text.emailed);
    expect(reauths).toBe(2);
  });
  it("a successful report from an older scope cannot clear the current world's parent prompt", async () => {
    let release!: (response: Response) => void; const oldRead = new Promise<Response>(resolve => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.worldSlug === "journey") return oldRead;
      if (body.operation === "remove") return new Response(JSON.stringify({ needsAdult: true }), { status: 200 });
      return response({ ...report([person("gpt_fox", "fox", 1)]), worldSlug: "kingdom" });
    }));
    const page = mount(true); fireEvent.click(page.getByRole("button", { name: new RegExp(text.title) }));
    page.rerender(<I18nProvider locale="en" dict={getDict("en")}><FriendDiscoveries gameId="game_test" worldSlug="kingdom" management /></I18nProvider>);
    fireEvent.click(page.getByRole("button", { name: new RegExp(text.title) }));
    const heading = await page.findByRole("heading", { name: "Fox" });
    fireEvent.click(within(heading.closest("article")!).getByRole("button", { name: text.remove }));
    fireEvent.click(within(page.getByRole("dialog", { name: text.removeConfirm })).getByRole("button", { name: text.remove }));
    await page.findByText(text.adult);
    await act(async () => { release(response(report([person("gpt_star", "star", 2)]))); });
    expect(page.getByText(text.adult)).toBeTruthy(); expect(page.getByRole("heading", { name: "Fox" })).toBeTruthy();
    expect(page.queryByRole("heading", { name: "Star" })).toBeNull();
  });
});
