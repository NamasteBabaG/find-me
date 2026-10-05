// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adventureFixture } from "@/domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "@/domain/adventure/compose";
import { emptyGuestSnapshot, mergeGuestSnapshot, guestBoardStates, guestWorldConfig, type GuestSnapshot } from "@/domain/guest-sharing";
import { guestConfig } from "@/services/__tests__/guest-sharing-fixture";
import { FriendProgressSync, rebaseFriendSnapshot, friendParticipantKey, type FriendSyncState } from "../friend-progress";

const fixture = adventureFixture(5);
const config = attachAdventureBook(fixture.config, fixture.catalog, ["pilot-test"]);
const key = (shareId = "gsr_test", participantId = "gpt_fox") => `findme:friends:outbox:v1:${shareId}:${participantId}`;
function finds(...ids: string[]): GuestSnapshot {
  return mergeGuestSnapshot(config, emptyGuestSnapshot(), {
    ...emptyGuestSnapshot(), finds: ids.map(targetId => ({ sceneSlug: "pilot-test", targetId, variant: "B" })),
  }).snapshot;
}
const reply = (snapshot: GuestSnapshot) => new Response(JSON.stringify({ snapshot }), { status: 200 });
const posted = (init?: RequestInit) => JSON.parse(String(init?.body)) as { shareToken: string; participantId: string; snapshot: GuestSnapshot };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const active: FriendProgressSync[] = [];
function create(initial = emptyGuestSnapshot(), shareId = "gsr_test", participantId = "gpt_fox") {
  const states: FriendSyncState[] = [];
  const sync = new FriendProgressSync({ config, shareToken: "secret-invitation-token", shareId, participantId, initial, onState: state => states.push(state) });
  active.push(sync);
  return { sync, states };
}
beforeEach(() => { vi.useFakeTimers(); window.localStorage.clear(); });
afterEach(() => { for (const sync of active.splice(0)) sync.stop(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("independent friend's durable progress", () => {
  it("saves a nine-board route with the real server merge while refusing locked-board local events", async () => {
    const route = guestWorldConfig(guestConfig("route-sync", 1), "world-1"), [first, second, third] = route.scenes;
    let server = emptyGuestSnapshot();
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      server = mergeGuestSnapshot(route, server, posted(init).snapshot).snapshot;
      return reply(server);
    }); vi.stubGlobal("fetch", fetcher);
    const states: FriendSyncState[] = [];
    const sync = new FriendProgressSync({ config: route, shareToken: "synthetic-token", shareId: "gsr_route", participantId: "gpt_route", initial: server, onState: state => states.push(state) });
    active.push(sync); sync.start();
    sync.visit(third!.slug);
    sync.push({ ...emptyGuestSnapshot(), finds: [{ sceneSlug: second!.slug, targetId: second!.targets[0]!.id, variant: "A" }] });
    await vi.advanceTimersByTimeAsync(1); expect(fetcher).not.toHaveBeenCalled();
    sync.push({ ...emptyGuestSnapshot(), finds: first!.targets.map(target => ({ sceneSlug: first!.slug, targetId: target.id, variant: "A" as const })) });
    sync.visit(second!.slug);
    await vi.advanceTimersByTimeAsync(200);
    sync.push({ ...emptyGuestSnapshot(), finds: [{ sceneSlug: second!.slug, targetId: second!.targets[0]!.id, variant: "B" }] });
    await vi.advanceTimersByTimeAsync(200);
    expect(sync.isSaved()).toBe(true); expect(states.at(-1)).toBe("saved");
    expect(guestBoardStates(route, server).slice(0, 3).map(row => row.state)).toEqual(["complete", "partial", "unvisited"]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rebases a permanent rejection onto server truth and saves the remaining valid find", async () => {
    let requests = 0;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/friends/play") return new Response(JSON.stringify({ participant: { snapshot: finds("hide-1") } }));
      return ++requests === 1 ? new Response(null, { status: 400 }) : reply(posted(init).snapshot);
    }); vi.stubGlobal("fetch", fetcher);
    const { sync, states } = create(); sync.start(); sync.push(finds("hide-2"));
    await vi.advanceTimersByTimeAsync(200); await vi.advanceTimersByTimeAsync(1000);
    expect(sync.current()).toEqual(finds("hide-1", "hide-2"));
    expect(sync.isSaved()).toBe(true); expect(states.at(-1)).toBe("saved");
    expect(window.localStorage.getItem(key())).toBeNull();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/friends/progress", "/api/friends/play", "/api/friends/progress"]);
    await vi.advanceTimersByTimeAsync(10_000); expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("keeps the canonical postcard reaction while preserving discoveries from another tab", async () => {
    const completed = finds(...config.scenes[0]!.targets.map(target => target.id));
    const server = mergeGuestSnapshot(config, completed, { ...emptyGuestSnapshot(), reactionId: "wow" }).snapshot;
    const local = mergeGuestSnapshot(config, completed, { ...emptyGuestSnapshot(), reactionId: "again", discoveries: [{ sceneSlug: "pilot-test", discoveryId: "cat" }] }).snapshot;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => reply({ ...posted(init).snapshot, reactionId: "wow" })));
    const { sync, states } = create(server); sync.start(); sync.push(local);
    await vi.advanceTimersByTimeAsync(200);
    expect(sync.current().reactionId).toBe("wow");
    expect(sync.current().discoveries).toEqual(local.discoveries);
    expect(sync.isSaved()).toBe(true); expect(states.at(-1)).toBe("saved");
  });

  it("drops unsupported local events while keeping valid progress during a rebase", () => {
    const dirty: GuestSnapshot = { ...finds("hide-2"), visited: ["foreign-board"], finds: [...finds("hide-2").finds, { sceneSlug: "pilot-test", targetId: "missing-child", variant: "A" }] };
    expect(rebaseFriendSnapshot(config, finds("hide-1"), dirty)).toEqual(finds("hide-1", "hide-2"));
    const { sync } = create(finds("hide-1"));
    expect(() => sync.push(dirty)).not.toThrow();
    expect(sync.current()).toEqual(finds("hide-1", "hide-2"));
  });

  it("restores valid offline finds even if another outbox entry is unsupported", () => {
    window.localStorage.setItem(key(), JSON.stringify({ ...finds("hide-2"), discoveries: [{ sceneSlug: "pilot-test", discoveryId: "missing" }] }));
    expect(create(finds("hide-1")).sync.current()).toEqual(finds("hide-1", "hide-2"));
  });

  it("recovers valid offline events when neighboring cache rows are structurally malformed", async () => {
    window.localStorage.setItem(key(), JSON.stringify({ ...finds("hide-2"),
      finds: [null, ...finds("hide-2").finds, { sceneSlug: "pilot-test", targetId: "hide-3", variant: "invalid" }],
      visited: [false, "pilot-test"], hints: [{ sceneSlug: "pilot-test", targetId: "hide-2" }, "bad"],
      discoveries: [{ sceneSlug: "pilot-test", discoveryId: "cat" }, { discoveryId: null }], reactionId: "not-a-reaction",
    }));
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => reply(mergeGuestSnapshot(config, finds("hide-1"), posted(init).snapshot).snapshot));
    vi.stubGlobal("fetch", fetcher);
    const { sync } = create(finds("hide-1"));
    expect(sync.current().finds).toEqual(finds("hide-1", "hide-2").finds);
    expect(sync.current().discoveries).toEqual([{ sceneSlug: "pilot-test", discoveryId: "cat" }]);
    expect(sync.current().hints).toEqual([{ sceneSlug: "pilot-test", targetId: "hide-2" }]);
    sync.start(); await vi.advanceTimersByTimeAsync(1);
    expect(sync.isSaved()).toBe(true); expect(window.localStorage.getItem(key())).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("bounds repeated permanent rejections and retains the outbox for an explicit reopen", async () => {
    const fetcher = vi.fn(async (url: string) => url === "/api/friends/play"
      ? new Response(JSON.stringify({ participant: { snapshot: emptyGuestSnapshot() } })) : new Response(null, { status: 400 }));
    vi.stubGlobal("fetch", fetcher);
    const { sync, states } = create(); sync.start(); sync.push(finds("hide-1"));
    await vi.advanceTimersByTimeAsync(3200);
    expect(states.at(-1)).toBe("sync-error"); expect(sync.isSaved()).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(JSON.parse(window.localStorage.getItem(key())!)).toEqual(finds("hide-1"));
    window.dispatchEvent(new Event("online")); window.dispatchEvent(new Event("focus")); sync.start();
    await vi.advanceTimersByTimeAsync(30_000); expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it("immediately stops accepting finds when another tab changes this invitation's player", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => reply(posted(init).snapshot)); vi.stubGlobal("fetch", fetcher);
    const { sync, states } = create(); sync.start(); sync.push(finds("hide-1"));
    window.dispatchEvent(new StorageEvent("storage", { key: friendParticipantKey("other-share"), newValue: "gpt_star" }));
    expect(states.at(-1)).toBe("saving");
    window.localStorage.setItem(friendParticipantKey("gsr_test"), "gpt_star");
    window.dispatchEvent(new StorageEvent("storage", { key: friendParticipantKey("gsr_test"), newValue: "gpt_star" }));
    expect(states.at(-1)).toBe("switched");
    sync.push(finds("hide-2")); await vi.advanceTimersByTimeAsync(10_000); await sync.flush();
    expect(fetcher).not.toHaveBeenCalled(); expect(sync.current()).toEqual(finds("hide-1"));
    expect(JSON.parse(window.localStorage.getItem(key())!)).toEqual(finds("hide-1"));
  });

  it("does not post an acknowledged snapshot or invent a visit on start", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const { sync, states } = create(); sync.start();
    await vi.advanceTimersByTimeAsync(1);
    expect(sync.current()).toEqual(emptyGuestSnapshot());
    expect(states).toEqual(["saved"]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(key())).toBeNull();
  });

  it("keeps a newer local find until its own acknowledgement, with one request in flight", async () => {
    let release!: (response: Response) => void;
    const firstResponse = new Promise<Response>(resolve => { release = resolve; });
    const sent: GuestSnapshot[] = [];
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      sent.push(posted(init).snapshot);
      return sent.length === 1 ? firstResponse : reply(sent.at(-1)!);
    }); vi.stubGlobal("fetch", fetcher);
    const { sync, states } = create();
    sync.start(); sync.push(finds("hide-1")); await vi.advanceTimersByTimeAsync(200);
    expect(sent).toEqual([finds("hide-1")]);
    expect(states).not.toContain("saved");
    sync.push(finds("hide-2"));
    window.dispatchEvent(new Event("online")); await vi.advanceTimersByTimeAsync(200); await sync.flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    release(reply(finds("hide-1"))); await settle();
    expect(states.at(-1)).toBe("saving");
    expect(sync.current()).toEqual(finds("hide-1", "hide-2"));
    expect(JSON.parse(window.localStorage.getItem(key())!)).toEqual(finds("hide-1", "hide-2"));
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([finds("hide-1"), finds("hide-1", "hide-2")]);
    expect(states.at(-1)).toBe("saved");
    expect(window.localStorage.getItem(key())).toBeNull();
    sync.push(finds("hide-2")); await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("restores offline finds, hints and discoveries after reload, then retries the full snapshot once online", async () => {
    const pending = mergeGuestSnapshot(config, finds("hide-1"), {
      ...emptyGuestSnapshot(), hints: [{ sceneSlug: "pilot-test", targetId: "hide-2" }],
      discoveries: [{ sceneSlug: "pilot-test", discoveryId: "cat" }],
    }).snapshot;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    const beforeReload = create(); beforeReload.sync.start(); beforeReload.sync.push(pending);
    await vi.advanceTimersByTimeAsync(200);
    expect(beforeReload.states.at(-1)).toBe("offline");
    expect(JSON.parse(window.localStorage.getItem(key())!)).toEqual(pending);
    expect(window.localStorage.getItem(key())).not.toContain("secret-invitation-token");
    beforeReload.sync.stop();

    const sent: GuestSnapshot[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const body = posted(init); expect(body.participantId).toBe("gpt_fox");
      sent.push(body.snapshot); return reply(body.snapshot);
    }));
    const restored = create();
    expect(restored.sync.current()).toEqual(pending);
    restored.sync.start(); window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([pending]); expect(restored.states.at(-1)).toBe("saved");
    expect(window.localStorage.getItem(key())).toBeNull();
    await vi.advanceTimersByTimeAsync(5000); expect(sent).toHaveLength(1);
  });

  it("never adopts another participant's or another invitation's outbox", async () => {
    const otherParticipant = JSON.stringify(finds("hide-1")), otherShare = JSON.stringify(finds("hide-2"));
    window.localStorage.setItem(key("gsr_test", "gpt_star"), otherParticipant);
    window.localStorage.setItem(key("gsr_other", "gpt_fox"), otherShare);
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => reply(posted(init).snapshot)); vi.stubGlobal("fetch", fetcher);
    const { sync } = create(); expect(sync.current()).toEqual(emptyGuestSnapshot());
    sync.start(); sync.visit("pilot-test"); await vi.advanceTimersByTimeAsync(200);
    expect(posted(fetcher.mock.calls[0]?.[1]).snapshot).toEqual({ ...emptyGuestSnapshot(), visited: ["pilot-test"] });
    expect(window.localStorage.getItem(key("gsr_test", "gpt_star"))).toBe(otherParticipant);
    expect(window.localStorage.getItem(key("gsr_other", "gpt_fox"))).toBe(otherShare);
    sync.visit("pilot-test"); await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["invalid JSON", "{broken"],
    ["unsupported version", JSON.stringify({ ...emptyGuestSnapshot(), version: 2 })],
    ["foreign board", JSON.stringify({ ...emptyGuestSnapshot(), visited: ["another-world"] })],
    ["foreign target", JSON.stringify({ ...emptyGuestSnapshot(), finds: [{ sceneSlug: "pilot-test", targetId: "missing-child", variant: "A" }] })],
  ])("a corrupt outbox (%s) cannot replace acknowledged finds", async (_label, raw) => {
    window.localStorage.setItem(key(), raw);
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const initial = finds("hide-1"), { sync, states } = create(initial);
    expect(sync.current()).toEqual(initial); sync.start(); await vi.advanceTimersByTimeAsync(1);
    expect(states.at(-1)).toBe("saved"); expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([403, 404, 409])("a terminal refusal (%s) stops retries, wakeups and new local writes", async status => {
    const fetcher = vi.fn(async () => new Response(null, { status })); vi.stubGlobal("fetch", fetcher);
    const { sync, states } = create(); sync.start(); sync.push(finds("hide-1")); await vi.advanceTimersByTimeAsync(200);
    expect(states.at(-1)).toBe(status === 409 ? "switched" : "unavailable");
    const saved = window.localStorage.getItem(key());
    sync.push(finds("hide-2")); sync.visit("pilot-test"); sync.start();
    window.dispatchEvent(new Event("online")); window.dispatchEvent(new Event("focus"));
    await sync.flush(); await vi.advanceTimersByTimeAsync(30_000);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(window.localStorage.getItem(key())).toBe(saved);
    expect(sync.current()).toEqual(finds("hide-1"));
  });

  it("aborts a hung connection and retries without dropping its durable outbox", async () => {
    let firstSignal: AbortSignal | undefined;
    const fetcher = vi.fn((_url: string, init?: RequestInit): Promise<Response> => {
      if (firstSignal) return Promise.resolve(reply(posted(init).snapshot));
      firstSignal = init!.signal!;
      return new Promise((_resolve, reject) => firstSignal!.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError"))));
    }); vi.stubGlobal("fetch", fetcher);
    const { sync, states } = create(); sync.start(); sync.push(finds("hide-1")); await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(14_999); expect(firstSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1); expect(firstSignal?.aborted).toBe(true); expect(states.at(-1)).toBe("offline");
    expect(JSON.parse(window.localStorage.getItem(key())!)).toEqual(finds("hide-1"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetcher).toHaveBeenCalledTimes(2); expect(states.at(-1)).toBe("saved"); expect(window.localStorage.getItem(key())).toBeNull();
  });

  it("stopping cancels queued retry and browser wakeups while leaving unsent progress recoverable", async () => {
    const fetcher = vi.fn(async () => { throw new TypeError("offline"); }); vi.stubGlobal("fetch", fetcher);
    const { sync } = create(); sync.start(); sync.push(finds("hide-1")); await vi.advanceTimersByTimeAsync(200);
    sync.stop(); window.dispatchEvent(new Event("online")); window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(30_000); await sync.flush();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(key())!)).toEqual(finds("hide-1"));
  });

  it("does not acknowledge a response containing a foreign board and can recover on retry", async () => {
    let requests = 0;
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => ++requests === 1
      ? reply({ ...emptyGuestSnapshot(), visited: ["foreign-board"] }) : reply(posted(init).snapshot)); vi.stubGlobal("fetch", fetcher);
    const { sync, states } = create(); sync.start(); sync.push(finds("hide-1")); await vi.advanceTimersByTimeAsync(200);
    expect(states.at(-1)).toBe("offline"); expect(sync.current()).toEqual(finds("hide-1"));
    expect(window.localStorage.getItem(key())).not.toBeNull(); await vi.advanceTimersByTimeAsync(5000);
    expect(states.at(-1)).toBe("saved"); expect(window.localStorage.getItem(key())).toBeNull();
  });
});
