// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PassportView } from "@/domain/passport/passport";
import { warmPassportBook } from "@/ui/passport/image-preload";
import { cachedOwnerPassport, prefetchOwnerPassport } from "../owner-passport-preload";

vi.mock("@/ui/passport/image-preload", () => ({ warmPassportBook: vi.fn() }));

const book = (name: string): PassportView => ({ name, preparing: 0, worlds: [] });
const response = (name: string, childId: string) => new Response(JSON.stringify({ book: book(name), childId }));

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("owner passport prefetch without the reader bundle", () => {
  it("deduplicates one pending request per game and keeps owner books separate", async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(done => { finish = done; }))
      .mockResolvedValueOnce(response("Second", "child-second"));
    vi.stubGlobal("fetch", fetcher);
    const first = prefetchOwnerPassport("cache-first&world");
    expect(prefetchOwnerPassport("cache-first&world")).toBe(first);
    expect(cachedOwnerPassport("cache-first&world")).toBeNull();
    const second = await prefetchOwnerPassport("cache-second");
    finish(response("First", "child-first")); const value = await first;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith("/api/passport?gameId=cache-first%26world", { cache: "no-store" });
    expect(cachedOwnerPassport("cache-first&world")).toBe(value);
    expect(cachedOwnerPassport("cache-second")).toBe(second);
    expect(warmPassportBook).toHaveBeenCalledWith(value.book, "child-first");
  });

  it("returns the already warmed book immediately without storing private book data", async () => {
    const fetcher = vi.fn().mockResolvedValue(response("Cached", "saved-cursor"));
    vi.stubGlobal("fetch", fetcher);
    const persist = vi.spyOn(Storage.prototype, "setItem");
    const value = await prefetchOwnerPassport("cache-warm");
    vi.advanceTimersByTime(29_999);
    expect(await prefetchOwnerPassport("cache-warm")).toBe(value);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(warmPassportBook).toHaveBeenCalledTimes(2);
    expect(warmPassportBook).toHaveBeenLastCalledWith(value.book, "saved-cursor");
    expect(persist).not.toHaveBeenCalled();
  });

  it("honors the reader's shorter refresh age, retaining the cached book through a rejected refresh", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response("Earlier", "child-refresh"))
      .mockResolvedValueOnce(new Response("{}", { status: 403 }))
      .mockResolvedValueOnce(response("Updated", "child-refresh"));
    vi.stubGlobal("fetch", fetcher);
    const earlier = await prefetchOwnerPassport("cache-refresh");
    vi.advanceTimersByTime(5_001);
    await expect(prefetchOwnerPassport("cache-refresh", 5_000)).rejects.toThrow("passport-unavailable");
    expect(cachedOwnerPassport("cache-refresh")).toBe(earlier);
    const updated = await prefetchOwnerPassport("cache-refresh", 5_000);
    expect(updated.book.name).toBe("Updated");
    expect(cachedOwnerPassport("cache-refresh")).toBe(updated);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("clears a failed first request so the next attempt can recover", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("Offline"))
      .mockResolvedValueOnce(response("Recovered", "child-retry"));
    vi.stubGlobal("fetch", fetcher);
    await expect(prefetchOwnerPassport("cache-retry")).rejects.toThrow("Offline");
    expect(cachedOwnerPassport("cache-retry")).toBeNull();
    expect((await prefetchOwnerPassport("cache-retry")).book.name).toBe("Recovered");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
