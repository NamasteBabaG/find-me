// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/client";
import { getDict } from "@/i18n";
import { emptyGuestSnapshot, mergeGuestSnapshot, type GuestSnapshot } from "@/domain/guest-sharing";
import type { GuestParticipantView, GuestSessionView } from "@/services/guest-sharing.service";
import { publicBeachDemo } from "../../../../content/demo/beach-v1";
import { FriendPlay } from "../FriendPlay";

const game = vi.hoisted(() => ({ props: null as unknown as React.ComponentProps<typeof import("@/game/components/GameShell").GameShell>, renders: 0 }));
vi.mock("@/game/components/GameShell", () => ({ GameShell: (props: typeof game.props) => {
  game.props = props; game.renders++;
  return <div data-testid="guest-game"><span>{props.friend?.participantId}</span></div>;
} }));
const text = getDict("en").friends;
const config = publicBeachDemo("en"), shareId = `gsr_${"1".repeat(20)}`, token = `${shareId}.${"x".repeat(43)}`;
function participant(id = "gpt_old", nicknameId: GuestParticipantView["nicknameId"] = "fox"): GuestParticipantView {
  const snapshot = emptyGuestSnapshot();
  snapshot.visited.push(config.scenes[0]!.slug);
  snapshot.finds.push({ sceneSlug: config.scenes[0]!.slug, targetId: config.scenes[0]!.targets[0]!.id, variant: "A" });
  return { id, nicknameId, revision: 1, snapshot };
}
function view(person: GuestParticipantView | null): GuestSessionView {
  return { shareId, worldSlug: "journey", worldName: "Around the World", childName: "Test", expiresAt: "2099-01-01T00:00:00.000Z", participant: person };
}
function reply(body: object, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
function active(person: GuestParticipantView) { return { config, participant: person, shareId, expiresAt: "2099-01-01T00:00:00.000Z" }; }
const outboxKey = (person: GuestParticipantView) => `findme:friends:outbox:v1:${shareId}:${person.id}`;
function laterFind(person: GuestParticipantView): GuestSnapshot {
  return mergeGuestSnapshot(config, person.snapshot, { ...emptyGuestSnapshot(),
    finds: [{ sceneSlug: config.scenes[0]!.slug, targetId: config.scenes[0]!.targets[1]!.id, variant: "B" }],
  }).snapshot;
}
function mount() { return render(<I18nProvider locale="en" dict={getDict("en")}><FriendPlay /></I18nProvider>); }
beforeEach(() => {
  vi.stubGlobal("React", React); window.localStorage.clear(); window.history.replaceState({}, "", `/#${token}`); game.renders = 0;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("the friends lobby and current guest", () => {
  it("resumes the server's current participant with their existing finds, without creating another player", async () => {
    const old = participant(), calls: Array<{ path: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push({ path, body });
      if (path.endsWith("/play")) return reply(active(old));
      return reply({ view: view(old) });
    }));
    const page = mount();
    fireEvent.click(await page.findByRole("button", { name: "Continue as Fox" }));
    expect((await page.findByTestId("guest-game")).textContent).toContain(old.id);
    expect(calls.filter(call => call.path.endsWith("/session")).map(call => call.body.operation)).toEqual(["inspect", "resume"]);
    expect(calls.find(call => call.body.operation === "resume")!.body).toMatchObject({ participantId: old.id });
    expect(game.props.initialAlbum!.finds).toEqual([{ boardSlug: old.snapshot.finds[0]!.sceneSlug, targetId: old.snapshot.finds[0]!.targetId, variant: "A" }]);
    expect(game.props.albumOwner).toBeUndefined();
    expect(game.props.parentZoneHref).toBeUndefined();
    expect(game.props.friend).toMatchObject({ shareId, participantId: old.id });
  });
  it("allows another nickname without clearing the previous player's saved work or changing the owner namespace", async () => {
    const old = participant(), next = { ...participant("gpt_new", "star"), snapshot: emptyGuestSnapshot() };
    const oldKey = `findme:progress:v1:friend:${shareId}:${old.id}`;
    window.localStorage.setItem(oldKey, "old-guest-progress"); window.localStorage.setItem(`findme:progress:v1:${config.gameId}`, "owner-progress");
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push(body);
      if (path.endsWith("/play")) return reply(active(body.participantId === old.id ? old : next));
      return reply({ view: view(body.operation === "another" ? next : old) });
    }));
    const page = mount();
    fireEvent.click(await page.findByRole("button", { name: text.another }));
    fireEvent.click(await page.findByRole("button", { name: "Star" }));
    fireEvent.click(page.getByRole("button", { name: text.start }));
    await page.findByTestId("guest-game");
    expect(calls.find(body => body.operation === "another")).toMatchObject({ nicknameId: "star", joinKey: expect.any(String) });
    expect(game.props.friend!.participantId).toBe(next.id);
    expect(game.props.initialAlbum!.finds).toEqual([]);
    expect(window.localStorage.getItem(oldKey)).toBe("old-guest-progress");
    expect(window.localStorage.getItem(`findme:progress:v1:${config.gameId}`)).toBe("owner-progress");
  });
  it("drains the current participant's restored outbox before offering a new nickname or changing the session", async () => {
    const old = participant(), pendingSnapshot = laterFind(old), next = { ...participant("gpt_new", "star"), snapshot: emptyGuestSnapshot() };
    window.localStorage.setItem(outboxKey(old), JSON.stringify(pendingSnapshot));
    let release!: (response: Response) => void; const pending = new Promise<Response>(resolve => { release = resolve; });
    const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push({ path, body });
      if (path.endsWith("/progress")) return pending;
      if (path.endsWith("/play")) return reply(active(body.participantId === old.id ? old : next));
      return reply({ view: view(body.operation === "another" ? next : old) });
    }));
    const page = mount(); const another = await page.findByRole("button", { name: text.another });
    fireEvent.click(another); fireEvent.click(another);
    await waitFor(() => expect(calls.some(call => call.path.endsWith("/progress"))).toBe(true));
    expect((another as HTMLButtonElement).disabled).toBe(true);
    expect((page.getByRole("button", { name: "Continue as Fox" }) as HTMLButtonElement).disabled).toBe(true);
    expect(page.queryByRole("group", { name: text.chooseName })).toBeNull();
    expect(calls.filter(call => call.body.operation === "another")).toEqual([]);
    expect(calls.filter(call => call.path.endsWith("/progress"))).toEqual([{ path: "/api/friends/progress", body: { shareToken: token, participantId: old.id, snapshot: pendingSnapshot } }]);
    expect(JSON.parse(window.localStorage.getItem(outboxKey(old))!)).toEqual(pendingSnapshot);
    await act(async () => { release(reply({ snapshot: pendingSnapshot })); });
    await page.findByRole("group", { name: text.chooseName });
    expect(window.localStorage.getItem(outboxKey(old))).toBeNull();
    expect(calls.filter(call => call.body.operation === "another")).toEqual([]);
    fireEvent.click(page.getByRole("button", { name: "Star" })); fireEvent.click(page.getByRole("button", { name: text.start }));
    await page.findByTestId("guest-game");
    expect(game.props.friend!.participantId).toBe(next.id);
    expect(calls.filter(call => call.body.operation === "another")).toHaveLength(1);
  });
  it.each(["read", "save"] as const)("a %s failure retains the current identity and durable outbox until a successful switch retry", async failure => {
    const old = participant(), pendingSnapshot = laterFind(old); let fail = true;
    window.localStorage.setItem(outboxKey(old), JSON.stringify(pendingSnapshot));
    const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push({ path, body });
      if (path.endsWith("/play")) { if (fail && failure === "read") throw new TypeError("offline"); return reply(active(old)); }
      if (path.endsWith("/progress")) { if (fail) throw new TypeError("offline"); return reply({ snapshot: body.snapshot }); }
      return reply({ view: view(old) });
    }));
    const page = mount(); fireEvent.click(await page.findByRole("button", { name: text.another }));
    await page.findByText(text.network);
    expect(page.getByRole("button", { name: "Continue as Fox" })).toBeTruthy();
    expect(page.queryByRole("group", { name: text.chooseName })).toBeNull();
    expect(page.queryByTestId("guest-game")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(outboxKey(old))!)).toEqual(pendingSnapshot);
    expect(calls.filter(call => call.body.operation === "another")).toEqual([]);
    await waitFor(() => expect((page.getByRole("button", { name: text.another }) as HTMLButtonElement).disabled).toBe(false));
    fail = false; fireEvent.click(page.getByRole("button", { name: text.another }));
    await page.findByRole("group", { name: text.chooseName });
    expect(page.queryByText(text.network)).toBeNull(); expect(window.localStorage.getItem(outboxKey(old))).toBeNull();
    expect(calls.filter(call => call.path.endsWith("/play") || call.path.endsWith("/progress")).every(call => call.body.participantId === old.id)).toBe(true);
    expect(calls.filter(call => call.body.operation === "another")).toEqual([]);
  });
  it("a successful HTTP response acknowledging only earlier finds cannot switch away from unsaved finds", async () => {
    const old = participant(), pendingSnapshot = laterFind(old);
    window.localStorage.setItem(outboxKey(old), JSON.stringify(pendingSnapshot));
    const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push({ path, body });
      if (path.endsWith("/progress")) return reply({ snapshot: old.snapshot });
      if (path.endsWith("/play")) return reply(active(old));
      return reply({ view: view(old) });
    }));
    const page = mount(); fireEvent.click(await page.findByRole("button", { name: text.another }));
    await page.findByText(text.network);
    expect(page.queryByRole("group", { name: text.chooseName })).toBeNull();
    expect(page.getByRole("button", { name: "Continue as Fox" })).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(outboxKey(old))!)).toEqual(pendingSnapshot);
    // The temporary drain sync must stop its queued retry when returning to
    // the lobby; the participant can resume or explicitly try switching again.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 220)); });
    expect(calls.filter(call => call.path.endsWith("/progress"))).toHaveLength(1);
    expect(calls.filter(call => call.body.operation === "another")).toEqual([]);
  });
  it("an active player's switch waits for a save on its way, never leaves unsaved finds behind, and switches once they are acknowledged", async () => {
    const old = participant(), pendingSnapshot = laterFind(old); let online = false;
    let release!: (response: Response) => void; const pending = new Promise<Response>(resolve => { release = resolve; });
    const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push({ path, body });
      if (path.endsWith("/progress")) return online ? reply({ snapshot: body.snapshot }) : pending;
      if (path.endsWith("/play")) return reply(active(old));
      return reply({ view: view(old) });
    }));
    const page = mount(); fireEvent.click(await page.findByRole("button", { name: "Continue as Fox" })); await page.findByTestId("guest-game");
    await act(async () => { game.props.friend!.onProgress(pendingSnapshot); });
    const another = page.getByRole("button", { name: text.another });
    expect(page.getByText(text.saving)).toBeTruthy();
    expect(document.getElementById(another.getAttribute("aria-describedby")!)?.textContent).toBe(text.saving);
    // A tap while the save is on its way waits for it, busy, and says whose finds are being kept.
    fireEvent.click(another);
    await waitFor(() => expect(another.getAttribute("aria-busy")).toBe("true"));
    expect(document.getElementById(another.getAttribute("aria-describedby")!)?.textContent).toBe("Saving Fox's finds…");
    await act(async () => { release(reply({}, 503)); });
    // The save could not be made: a sheet says so, the game stays and nothing switched.
    await page.findByRole("dialog", { name: "Fox's finds aren't saved yet" });
    expect(page.getByTestId("guest-game").textContent).toContain(old.id);
    expect(calls.filter(call => call.body.operation === "inspect")).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem(outboxKey(old))!)).toEqual(pendingSnapshot);
    fireEvent.click(page.getByRole("button", { name: text.keepPlaying }));
    expect(page.queryByRole("dialog", { name: "Fox's finds aren't saved yet" })).toBeNull();
    online = true; act(() => { window.dispatchEvent(new Event("online")); }); await page.findByText(text.saved);
    expect((page.getByRole("button", { name: text.another }) as HTMLButtonElement).disabled).toBe(false);
    expect(window.localStorage.getItem(outboxKey(old))).toBeNull();
    fireEvent.click(page.getByRole("button", { name: text.another }));
    await page.findByRole("group", { name: text.chooseName });
    expect(page.queryByRole("button", { name: "Continue as Fox" })).toBeNull();
    expect(calls.filter(call => call.body.operation === "inspect")).toHaveLength(2);
    expect(calls.filter(call => call.body.operation === "another")).toEqual([]);
    fireEvent.click(page.getByRole("button", { name: text.back }));
    expect(page.getByRole("button", { name: "Continue as Fox" })).toBeTruthy();
  });
  it("a restored unsaved outbox makes Another wait for its save on the way, then switches", async () => {
    const old = participant(), pendingSnapshot = laterFind(old);
    window.localStorage.setItem(outboxKey(old), JSON.stringify(pendingSnapshot));
    let release!: (response: Response) => void; const pending = new Promise<Response>(resolve => { release = resolve; });
    const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push({ path, body });
      if (path.endsWith("/progress")) return pending;
      if (path.endsWith("/play")) return reply(active(old));
      return reply({ view: view(old) });
    }));
    const page = mount(); fireEvent.click(await page.findByRole("button", { name: "Continue as Fox" })); await page.findByTestId("guest-game");
    await waitFor(() => expect(calls.some(call => call.path.endsWith("/progress"))).toBe(true));
    expect(page.getByText(text.saving)).toBeTruthy();
    const another = page.getByRole("button", { name: text.another });
    fireEvent.click(another); fireEvent.click(another);
    await waitFor(() => expect(another.getAttribute("aria-busy")).toBe("true"));
    expect(page.queryByRole("group", { name: text.chooseName })).toBeNull();
    expect(calls.filter(call => call.body.operation === "inspect")).toHaveLength(1);
    await act(async () => { release(reply({ snapshot: pendingSnapshot })); });
    await page.findByRole("group", { name: text.chooseName });
    expect(window.localStorage.getItem(outboxKey(old))).toBeNull();
    expect(calls.filter(call => call.body.operation === "inspect")).toHaveLength(2);
  });
  it("opens the nickname chooser directly after a fresh inspect and keeps active play mounted while that inspect is pending", async () => {
    const old = participant(); let inspections = 0;
    let release!: (response: Response) => void; const pending = new Promise<Response>(resolve => { release = resolve; });
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push(body);
      if (path.endsWith("/play")) return reply(active(old));
      if (body.operation === "inspect" && ++inspections === 2) return pending;
      return reply({ view: view(old) });
    }));
    const page = mount(); fireEvent.click(await page.findByRole("button", { name: "Continue as Fox" })); await page.findByTestId("guest-game");
    const another = page.getByRole("button", { name: text.another });
    fireEvent.click(another); fireEvent.click(another);
    await waitFor(() => expect(inspections).toBe(2));
    expect(page.getByTestId("guest-game").textContent).toContain(old.id);
    expect((another as HTMLButtonElement).disabled).toBe(true);
    expect(another.getAttribute("aria-busy")).toBe("true");
    expect(page.queryByRole("group", { name: text.chooseName })).toBeNull();
    expect(calls.filter(body => body.operation === "another")).toEqual([]);
    await act(async () => { release(reply({ view: view(old) })); });
    await page.findByRole("group", { name: text.chooseName });
    expect(page.queryByTestId("guest-game")).toBeNull();
    expect(page.queryByRole("button", { name: "Continue as Fox" })).toBeNull();
    expect(calls.filter(body => body.operation === "another")).toEqual([]);
  });
  it("retains active identity and progress after a failed fresh inspect and opens the chooser on retry", async () => {
    const old = participant(); let inspections = 0;
    const oldKey = `findme:progress:v1:friend:${shareId}:${old.id}`;
    window.localStorage.setItem(oldKey, "old-progress");
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (path.endsWith("/play")) return reply(active(old));
      if (body.operation === "inspect" && ++inspections === 2) throw new TypeError("offline");
      return reply({ view: view(old) });
    }));
    const page = mount(); fireEvent.click(await page.findByRole("button", { name: "Continue as Fox" })); await page.findByTestId("guest-game");
    fireEvent.click(page.getByRole("button", { name: text.another }));
    await page.findByText(text.network);
    expect(page.getByTestId("guest-game").textContent).toContain(old.id);
    expect(game.props.initialAlbum!.finds).toHaveLength(1);
    expect(window.localStorage.getItem(oldKey)).toBe("old-progress");
    expect(page.queryByRole("group", { name: text.chooseName })).toBeNull();
    await waitFor(() => expect((page.getByRole("button", { name: text.another }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(page.getByRole("button", { name: text.another }));
    await page.findByRole("group", { name: text.chooseName });
    expect(page.queryByText(text.network)).toBeNull(); expect(inspections).toBe(3);
  });
  it("does not leave active play when newer finds arrive during fresh inspect and their save fails", async () => {
    const old = participant(), pendingSnapshot = laterFind(old); let inspections = 0, online = false;
    let releaseInspect!: (response: Response) => void;
    const inspecting = new Promise<Response>(resolve => { releaseInspect = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (path.endsWith("/play")) return reply(active(old));
      if (path.endsWith("/progress")) return online ? reply({ snapshot: body.snapshot }) : reply({}, 503);
      if (body.operation === "inspect" && ++inspections === 2) return inspecting;
      return reply({ view: view(old) });
    }));
    const page = mount(); fireEvent.click(await page.findByRole("button", { name: "Continue as Fox" })); await page.findByTestId("guest-game");
    fireEvent.click(page.getByRole("button", { name: text.another }));
    await waitFor(() => expect(inspections).toBe(2));
    await act(async () => { game.props.friend!.onProgress(pendingSnapshot); releaseInspect(reply({ view: view(old) })); });
    await page.findByText(text.offline);
    expect(page.getByTestId("guest-game").textContent).toContain(old.id);
    expect(page.queryByRole("group", { name: text.chooseName })).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(outboxKey(old))!)).toEqual(pendingSnapshot);
    // Another cannot leave these finds behind: it says they are not saved yet and keeps the game.
    fireEvent.click(page.getByRole("button", { name: text.another }));
    await page.findByRole("dialog", { name: "Fox's finds aren't saved yet" });
    expect(page.queryByRole("group", { name: text.chooseName })).toBeNull();
    fireEvent.click(page.getByRole("button", { name: text.keepPlaying }));
    online = true; act(() => { window.dispatchEvent(new Event("online")); }); await page.findByText(text.saved);
    fireEvent.click(page.getByRole("button", { name: text.another }));
    await page.findByRole("group", { name: text.chooseName });
    expect(inspections).toBe(3); expect(window.localStorage.getItem(outboxKey(old))).toBeNull();
  });
  it("terminal Back returns to the normal continuation lobby and preserves the failed save", async () => {
    const old = participant(), pendingSnapshot = laterFind(old); let inspections = 0;
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (path.endsWith("/play")) return reply(active(old));
      if (path.endsWith("/progress")) return reply({}, 403);
      if (body.operation === "inspect") inspections++;
      return reply({ view: view(old) });
    }));
    const page = mount(); fireEvent.click(await page.findByRole("button", { name: "Continue as Fox" })); await page.findByTestId("guest-game");
    await act(async () => { game.props.friend!.onProgress(pendingSnapshot); });
    await page.findByRole("button", { name: text.back });
    expect(page.getByText(text.unavailable)).toBeTruthy(); expect(page.queryByTestId("guest-game")).toBeNull();
    fireEvent.click(page.getByRole("button", { name: text.back }));
    await page.findByRole("button", { name: "Continue as Fox" });
    expect(page.queryByRole("group", { name: text.chooseName })).toBeNull();
    expect(inspections).toBe(2);
    expect(JSON.parse(window.localStorage.getItem(outboxKey(old))!)).toEqual(pendingSnapshot);
  });
  it("an older switch inspect cannot reopen the chooser after terminal Back has returned to the normal lobby", async () => {
    const old = participant(), pendingSnapshot = laterFind(old); let inspections = 0;
    let release!: (response: Response) => void; const inspecting = new Promise<Response>(resolve => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (path.endsWith("/play")) return reply(active(old));
      if (path.endsWith("/progress")) return reply({}, 403);
      if (body.operation === "inspect" && ++inspections === 2) return inspecting;
      return reply({ view: view(old) });
    }));
    const page = mount(); fireEvent.click(await page.findByRole("button", { name: "Continue as Fox" })); await page.findByTestId("guest-game");
    fireEvent.click(page.getByRole("button", { name: text.another }));
    await waitFor(() => expect(inspections).toBe(2));
    await act(async () => { game.props.friend!.onProgress(pendingSnapshot); });
    fireEvent.click(await page.findByRole("button", { name: text.back }));
    await page.findByRole("button", { name: "Continue as Fox" });
    await act(async () => { release(reply({ view: view(old) })); });
    expect(page.getByRole("button", { name: "Continue as Fox" })).toBeTruthy();
    expect(page.queryByRole("group", { name: text.chooseName })).toBeNull();
    expect(inspections).toBe(3);
    expect(JSON.parse(window.localStorage.getItem(outboxKey(old))!)).toEqual(pendingSnapshot);
  });
  it("retries an ambiguous join using exactly the same idempotency key", async () => {
    const next = { ...participant("gpt_joined", "owl"), snapshot: emptyGuestSnapshot() }, joins: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (path.endsWith("/play")) return reply(active(next));
      if (body.operation === "inspect") return reply({ view: view(null) });
      joins.push(body);
      if (joins.length === 1) throw new Error("network-lost-after-commit");
      return reply({ view: view(next) });
    }));
    const page = mount(); await page.findByRole("button", { name: text.start });
    fireEvent.click(page.getByRole("button", { name: "Owl" }));
    fireEvent.click(page.getByRole("button", { name: text.start }));
    await page.findByText(text.network);
    expect((page.getByRole("group", { name: text.chooseName }) as HTMLFieldSetElement).disabled).toBe(true);
    fireEvent.click(page.getByRole("button", { name: "Star" }));
    expect(page.getByRole("button", { name: "Owl" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(page.getByRole("button", { name: "Continue as Owl" }));
    await page.findByTestId("guest-game");
    expect(joins).toHaveLength(2); expect(joins[0]!.joinKey).toBe(joins[1]!.joinKey);
    expect(joins.map(body => body.nicknameId)).toEqual(["owl", "owl"]);
  });
  it("retries a failed play load after a successful join without joining a second participant", async () => {
    const next = { ...participant("gpt_joined"), snapshot: emptyGuestSnapshot() }, joins: Array<Record<string, unknown>> = []; let plays = 0;
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (path.endsWith("/play")) return ++plays === 1 ? reply({}, 503) : reply(active(next));
      if (body.operation === "inspect") return reply({ view: view(null) });
      joins.push(body); return reply({ view: view(next) });
    }));
    const page = mount(); fireEvent.click(await page.findByRole("button", { name: text.start }));
    await page.findByText(text.network);
    fireEvent.click(page.getByRole("button", { name: "Continue as Guest" })); await page.findByTestId("guest-game");
    expect(joins[0]!.joinKey).toBe(joins[1]!.joinKey);
  });
  it("preserves an unresolved nickname and join key through Back and Another after a lost join acknowledgment", async () => {
    const old = participant(), next = { ...participant("gpt_joined", "owl"), snapshot: emptyGuestSnapshot() };
    const joins: Array<Record<string, unknown>> = []; let inspections = 0;
    vi.stubGlobal("fetch", vi.fn(async (path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (path.endsWith("/play")) return reply(active(body.participantId === next.id ? next : old));
      if (body.operation === "inspect") { inspections++; return reply({ view: view(old) }); }
      if (body.operation === "another") {
        joins.push(body);
        if (joins.length === 1) throw new TypeError("lost-after-commit");
        return reply({ view: view(next) });
      }
      return reply({ view: view(old) });
    }));
    const page = mount(); fireEvent.click(await page.findByRole("button", { name: text.another }));
    fireEvent.click(await page.findByRole("button", { name: "Owl" })); fireEvent.click(page.getByRole("button", { name: text.start }));
    await page.findByText(text.network);
    const back = page.getByRole("button", { name: text.back }); expect((back as HTMLButtonElement).disabled).toBe(false); fireEvent.click(back);
    await page.findByRole("button", { name: "Continue as Fox" });
    await waitFor(() => expect((page.getByRole("button", { name: text.another }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(page.getByRole("button", { name: text.another }));
    await page.findByRole("group", { name: text.chooseName });
    expect((page.getByRole("group", { name: text.chooseName }) as HTMLFieldSetElement).disabled).toBe(true);
    fireEvent.click(page.getByRole("button", { name: "Star" }));
    expect(page.getByRole("button", { name: "Owl" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(page.getByRole("button", { name: "Continue as Owl" })); await page.findByTestId("guest-game");
    expect(inspections).toBe(2); expect(joins).toHaveLength(2);
    expect(joins[0]!.joinKey).toBe(joins[1]!.joinKey); expect(joins.map(join => join.nicknameId)).toEqual(["owl", "owl"]);
    expect(game.props.friend!.participantId).toBe(next.id);
    // A successful play clears the attempt so the next sibling can choose a
    // different nickname without inheriting the earlier idempotency key.
    fireEvent.click(page.getByRole("button", { name: text.another }));
    await page.findByRole("group", { name: text.chooseName });
    expect((page.getByRole("group", { name: text.chooseName }) as HTMLFieldSetElement).disabled).toBe(false);
  });
  it("disables join choices while the request is pending and keeps repeated taps to one join", async () => {
    let resolve!: (response: Response) => void; const pending = new Promise<Response>(done => { resolve = done; });
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_path: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)); calls.push(body);
      return body.operation === "inspect" ? reply({ view: view(null) }) : pending;
    }));
    const page = mount(); const start = await page.findByRole("button", { name: text.start });
    fireEvent.click(start); fireEvent.click(start);
    expect((start as HTMLButtonElement).disabled).toBe(true); expect(start.getAttribute("aria-busy")).toBe("true");
    expect((page.getByRole("group", { name: text.chooseName }) as HTMLFieldSetElement).disabled).toBe(true);
    expect(calls.filter(call => call.operation === "start")).toHaveLength(1);
    await act(async () => { resolve(reply({}, 404)); });
    await page.findByText(text.unavailable);
  });
  it("an active game's snapshot updates settle instead of creating an uncontrolled render loop", async () => {
    const old = participant();
    vi.stubGlobal("fetch", vi.fn(async (path: string) => path.endsWith("/play") ? reply(active(old)) : reply({ view: view(old) })));
    const page = mount(); fireEvent.click(await page.findByRole("button", { name: "Continue as Fox" })); await page.findByTestId("guest-game");
    const initialRenders = game.renders;
    await act(async () => { game.props.friend!.onProgress(emptyGuestSnapshot()); game.props.friend!.onProgress(emptyGuestSnapshot()); });
    await waitFor(() => expect(page.getByTestId("guest-game")).toBeTruthy());
    expect(game.renders - initialRenders).toBeLessThan(4);
  });
});
