import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adventureFixture } from "../../../domain/adventure/__tests__/fixture";
import { attachAdventureBook } from "../../../domain/adventure/compose";
import { emptyAdventureProgress, recordAdventureEvent, type AdventureEvent, type AdventureProgress } from "../../../domain/adventure/progress";
import { AlbumSync, type AlbumSyncState } from "../album-sync";

/**
 * The browser's side of the family album. What matters: nothing is called
 * "saved" before the server says so, a lost connection keeps the event and
 * retries the SAME one, a conflict re-reads before retrying, and a refusal
 * stops rather than pretends.
 */
const fixture = adventureFixture(5);
const config = attachAdventureBook(fixture.config, fixture.catalog, ["pilot-test"]);
const book = config.adventure!;
const gameId = config.gameId;
const find = (targetId: string): AdventureEvent => ({ kind: "target-found", boardSlug: "pilot-test", targetId, variant: "A" });

type Handler = (method: string, body: AdventureEvent | undefined) => Promise<Response> | Response;
function fetcher(handle: Handler): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as { event?: AdventureEvent }).event : undefined;
    void input;
    return handle(method, body);
  }) as typeof fetch;
}
const reply = (progress: AdventureProgress, status = 200) => new Response(JSON.stringify({ ok: true, progress, revision: progress.finds.length, changed: true }), { status, headers: { "content-type": "application/json" } });
const flush = async () => { await vi.advanceTimersByTimeAsync(1); for (let i = 0; i < 12; i++) await Promise.resolve(); };

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("album sync", () => {
  it("does not claim a save before the server answers, then does", async () => {
    let server = emptyAdventureProgress(gameId, book);
    const states: AlbumSyncState[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const sync = new AlbumSync({ gameId, onState: (s) => states.push(s), onProgress: () => {}, fetcher: fetcher(async (method, event) => {
      if (method === "GET") return reply(server);
      await gate;
      server = recordAdventureEvent(server, gameId, book, event!).progress;
      return reply(server);
    }) });
    sync.push(find("hide-1"));
    await flush();
    expect(states).toEqual(["saving"]);
    expect(sync.pending).toBe(1);
    release();
    await flush();
    expect(states.at(-1)).toBe("saved");
    expect(sync.pending).toBe(0);
    expect(server.finds).toHaveLength(1);
  });

  it("keeps the event through a lost connection, says so, and retries the same one later", async () => {
    let server = emptyAdventureProgress(gameId, book);
    let online = false;
    const sent: AdventureEvent[] = [];
    const states: AlbumSyncState[] = [];
    const sync = new AlbumSync({ gameId, backoffMs: [1000], onState: (s) => states.push(s), onProgress: () => {}, fetcher: fetcher((method, event) => {
      if (!online) throw new TypeError("network");
      if (method === "POST") { sent.push(event!); server = recordAdventureEvent(server, gameId, book, event!).progress; }
      return reply(server);
    }) });
    sync.push(find("hide-2"));
    await flush();
    expect(states.at(-1)).toBe("offline");
    expect(sync.pending).toBe(1);
    online = true;
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(sent).toEqual([find("hide-2")]);
    expect(states.at(-1)).toBe("saved");
    expect(server.finds.map((f) => f.targetId)).toEqual(["hide-2"]);
  });

  it("re-reads the account after a conflict and then sends the same event once", async () => {
    let server = recordAdventureEvent(emptyAdventureProgress(gameId, book), gameId, book, find("hide-1")).progress;
    let conflicts = 1;
    const log: string[] = [];
    const seen: AdventureProgress[] = [];
    const sync = new AlbumSync({ gameId, onState: () => {}, onProgress: (p) => seen.push(p), fetcher: fetcher((method, event) => {
      log.push(method);
      if (method === "GET") return reply(server);
      if (conflicts-- > 0) return new Response(JSON.stringify({ ok: false, code: "content-mismatch" }), { status: 409 });
      server = recordAdventureEvent(server, gameId, book, event!).progress;
      return reply(server);
    }) });
    sync.push(find("hide-3"));
    await flush();
    await flush();
    expect(log).toEqual(["POST", "GET", "POST"]);
    expect(seen[0]!.finds.map((f) => f.targetId)).toEqual(["hide-1"]);
    expect(server.finds.map((f) => f.targetId)).toEqual(["hide-1", "hide-3"]);
  });

  it("stops on a refusal instead of pretending, keeping nothing queued", async () => {
    const states: AlbumSyncState[] = [];
    const sync = new AlbumSync({ gameId, onState: (s) => states.push(s), onProgress: () => {}, fetcher: fetcher(() => new Response(JSON.stringify({ ok: false, code: "not-owned" }), { status: 403 })) });
    sync.push(find("hide-1"));
    sync.push(find("hide-2"));
    await flush();
    expect(states.at(-1)).toBe("refused");
    expect(sync.pending).toBe(0);
    expect(await sync.load()).toBe("refused");
  });

  it("reports the account's copy on load and stays offline when it cannot be read", async () => {
    const server = recordAdventureEvent(emptyAdventureProgress(gameId, book), gameId, book, { kind: "discovery-found", boardSlug: "pilot-test", discoveryId: "cat" }).progress;
    const seen: AdventureProgress[] = [];
    const ok = new AlbumSync({ gameId, onState: () => {}, onProgress: (p) => seen.push(p), fetcher: fetcher(() => reply(server)) });
    expect(await ok.load()).toBe("loaded");
    expect(seen[0]!.discoveries).toHaveLength(1);
    const states: AlbumSyncState[] = [];
    const down = new AlbumSync({ gameId, onState: (s) => states.push(s), onProgress: () => { throw new Error("must not be called"); }, fetcher: fetcher(() => { throw new TypeError("network"); }) });
    expect(await down.load()).toBe("offline");
    expect(states.at(-1)).toBe("offline");
  });
});
