import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("node:fs/promises", () => ({ readFile: vi.fn().mockRejectedValue(new Error("absent from function")) }));
import { clearSceneArtCache, loadSceneArt } from "../scene-art";
import { qaAccessConfig, qaTokenFromRequest, validQaSession } from "@/lib/qa-access";

const origin = "https://qa.example.test", asset = "/scenes/paris/refresh-20260907/base.webp", bytes = Buffer.from("synthetic raster bytes");
const hash = createHash("sha256").update(bytes).digest("hex");
const fetchMock = vi.fn();
beforeEach(() => {
  clearSceneArtCache(); fetchMock.mockReset();
  vi.stubEnv("APP_ENV", "qa"); vi.stubEnv("APP_URL", origin); vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("QA_ACCESS_PASSWORD", "test-only-qa-password-long"); vi.stubEnv("SESSION_SECRET", "test-only-signing-key-long");
  vi.stubGlobal("fetch", fetchMock.mockImplementation(async () => new Response(bytes, { headers: { "content-type": "image/webp" } })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); clearSceneArtCache(); });

describe("same-origin static CDN artwork in serverless QA", () => {
  it("uses a valid gate-only session for exactly the configured raster URL, without redirects", async () => {
    expect(await loadSceneArt(origin, asset, hash)).toEqual(bytes);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${origin}${asset}`); expect(init.redirect).toBe("error"); expect(init.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(init.headers);
    expect([...headers.keys()]).toEqual(["cookie"]);
    expect(await validQaSession(qaTokenFromRequest(new Request(url, init), qaAccessConfig()), qaAccessConfig())).toBe(true);
    expect(headers.get("cookie")).not.toContain("test-only");
    expect(await loadSceneArt(origin, asset, hash)).toEqual(bytes); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("does not send a QA cookie in production", async () => {
    vi.stubEnv("APP_ENV", "production");
    await loadSceneArt(origin, asset, hash);
    expect(new Headers(fetchMock.mock.calls[0]![1].headers).has("cookie")).toBe(false);
  });
  it("shares simultaneous reads of the same frozen board", async () => {
    const results = await Promise.all(Array.from({ length: 7 }, () => loadSceneArt(origin, asset, hash)));
    expect(results.every(result => result.equals(bytes))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("retries after a shared read fails instead of retaining the failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("synthetic temporary failure"));
    const results = await Promise.allSettled([loadSceneArt(origin, asset, hash), loadSceneArt(origin, asset, hash)]);
    expect(results.every(result => result.status === "rejected")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await loadSceneArt(origin, asset, hash)).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("keeps a 32MiB working set and evicts the least recently used board", async () => {
    // Transport-only synthetic bytes, about the encoded size of one current
    // 4K lossless board. No image decoding or customer fixture is involved.
    const large = Buffer.alloc(12 * 1024 * 1024, 42);
    fetchMock.mockImplementation(async () => new Response(large, { headers: { "content-type": "image/webp" } }));
    const a = "/scenes/synthetic-a/base.webp", b = "/scenes/synthetic-b/base.webp", c = "/scenes/synthetic-c/base.webp";
    await loadSceneArt(origin, a); await loadSceneArt(origin, b);
    await loadSceneArt(origin, a); // A is now the board to keep.
    await loadSceneArt(origin, c); // Three boards exceed the memory budget.
    await loadSceneArt(origin, a);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await loadSceneArt(origin, b);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it("does not let an old pending read repopulate a cleared cache", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    const pending = loadSceneArt(origin, asset, hash);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    clearSceneArtCache();
    finish(new Response(bytes, { headers: { "content-type": "image/webp" } }));
    expect(await pending).toEqual(bytes);
    expect(await loadSceneArt(origin, asset, hash)).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(["https://evil.example/a.png", "//evil.example/a.png", "/api/assets/private.png", "/scenes/../private.png",
    "/scenes/%2e%2e/private.png", "/scenes/x/base.webp?next=https://evil.example", "/scenes/x/base.webp#fragment", "/scenes/x/../../.env", "/scenes/x/base.svg", "/scenes\\x\\base.png"])("refuses unsafe asset path %s before any fetch", async value => {
    await expect(loadSceneArt(origin, value)).rejects.toThrow(/Invalid static/); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["https://evil.example", "http://qa.example.test", "https://user:password@qa.example.test", "https://qa.example.test/path"])("never sends the gate token to an untrusted origin %s", async value => {
    await expect(loadSceneArt(value, asset)).rejects.toThrow(/origin/); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("fails closed when QA signing configuration is unavailable", async () => {
    vi.stubEnv("SESSION_SECRET", "bad");
    await expect(loadSceneArt(origin, asset)).rejects.toThrow(/QA access is not configured/); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("refuses a redirect instead of forwarding credentials", async () => {
    fetchMock.mockImplementation(async (_url: string, options: RequestInit) => {
      expect(options.redirect).toBe("error"); throw new TypeError("fetch failed: redirect");
    });
    await expect(loadSceneArt(origin, asset)).rejects.toThrow(/redirect/); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("refuses unexpected redirected or non-image responses and keeps hash validation", async () => {
    const redirected = new Response(bytes, { headers: { "content-type": "image/webp" } });
    Object.defineProperty(redirected, "redirected", { value: true }); fetchMock.mockResolvedValueOnce(redirected);
    await expect(loadSceneArt(origin, asset)).rejects.toThrow(/redirect refused/);
    fetchMock.mockResolvedValueOnce(new Response("login", { headers: { "content-type": "text/html" } }));
    await expect(loadSceneArt(origin, asset)).rejects.toThrow(/not a raster/);
    await expect(loadSceneArt(origin, asset, "0".repeat(64))).rejects.toThrow(/hash mismatch/);
  });
});
