import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import manifest from "../../../../content/adventures/wizard-art.json";
import refreshedManifest from "../../../../content/adventures/wizard-refresh-art.json";
import kingdomManifest from "../../../../content/adventures/wizard-kingdom-art.json";
import { TWO_WORLD_RELEASE_CATALOG, TWO_WORLD_RELEASE_ROUTES } from "../../../../content/adventures/two-worlds-release";
import { readCollectionArt, collectionArtOrigin } from "../collection-art";
import { sha256Bytes } from "../fixed-sprite";
const settings = vi.hoisted(() => ({ APP_URL: "https://art-test.example" }));
vi.mock("../../../lib/env", () => ({ env: () => settings }));

const art = manifest[0]!;
describe("hash-bound child-free collection CDN", () => {
  it("pins all nine latest approved kingdom masters and their full-resolution pixels", async () => {
    const routes = TWO_WORLD_RELEASE_ROUTES.filter(route => route.world === "kingdom");
    const expected = routes.map(route => {
      const plan = TWO_WORLD_RELEASE_CATALOG.boards.find(board => board.boardSlug === route.slug);
      if (!plan || plan.status !== "ready") throw Error("Missing approved kingdom master");
      return { path: `public${plan.art.base}`, sha256: plan.art.sha256 };
    });
    expect(routes).toHaveLength(9);
    expect(kingdomManifest).toEqual(expected);
    for (const entry of kingdomManifest) {
      const bytes = await readFile(entry.path);
      expect(sha256Bytes(bytes)).toBe(entry.sha256);
      expect(await sharp(bytes).metadata()).toMatchObject({ width: 3840, height: 2160 });
      expect((await readCollectionArt(entry.path, entry.sha256))?.equals(bytes)).toBe(true);
    }
  });
  it.each([
    { release: "historical journey", entry: manifest[0]! },
    { release: "refreshed journey", entry: refreshedManifest.find(row => row.path.startsWith("public/scenes/journey-"))! },
    { release: "kingdom", entry: kingdomManifest[0]! },
  ])("fetches pinned $release art from the trusted deployment CDN when disk assets are absent", async ({ entry }) => {
    const bytes = await readFile(entry.path);
    const get = vi.fn(async () => new Response(new Uint8Array(bytes), { headers: { "content-type": "image/webp" } }));
    expect((await readCollectionArt(entry.path, entry.sha256, "/unused", { fetch: get, cookie: "synthetic-qa" }))?.equals(bytes)).toBe(true);
    expect(get).toHaveBeenCalledWith(`${settings.APP_URL}/${entry.path.slice(7)}`, expect.objectContaining({
      redirect: "error", cache: "no-store", headers: { cookie: "synthetic-qa", accept: "image/webp" },
    }));
  });
  it("does not fetch unregistered magic paths or a kingdom master with the wrong hash", async () => {
    const get = vi.fn();
    const remote = { fetch: get as unknown as typeof fetch, cookie: "synthetic-qa" };
    expect(await readCollectionArt("public/scenes/magic-unregistered/base.webp", art.sha256, "/unused", remote)).toBeNull();
    expect(await readCollectionArt("public/scenes/fairyforest/base.webp", art.sha256, "/unused", remote)).toBeNull();
    await expect(readCollectionArt(kingdomManifest[0]!.path, "0".repeat(64), "/unused", remote)).rejects.toThrow("unexpected pinned");
    expect(get).not.toHaveBeenCalled();
  });
  it("loads the same deployed bytes with the QA gate, without redirects or a caller-selected host", async () => {
    const bytes = await readFile(art.path);
    const get = vi.fn(async () => new Response(new Uint8Array(bytes), { headers: { "content-type": "image/webp" } }));
    const result = await readCollectionArt(art.path, art.sha256, "/unused", { fetch: get, cookie: "synthetic-qa" });
    expect(result?.equals(bytes)).toBe(true);
    expect(get).toHaveBeenCalledWith(`${settings.APP_URL}/${art.path.slice(7)}`, expect.objectContaining({
      redirect: "error", cache: "no-store", headers: { cookie: "synthetic-qa", accept: "image/webp" },
    }));
    expect(await readCollectionArt("public/scenes/../../private/file.webp", art.sha256, "/unused", { fetch: get, cookie: "synthetic" })).toBeNull();
    await expect(readCollectionArt(art.path, "0".repeat(64), "/unused", { fetch: get, cookie: "synthetic" })).rejects.toThrow("unexpected pinned");
    expect(get).toHaveBeenCalledTimes(1);
  });
  it.each(["http://example.com", "https://user:password@example.com", "https://example.com/path", "https://example.com/?secret=value"])("rejects unsafe configured origins: %s", value => {
    const previous = settings.APP_URL;
    try { settings.APP_URL = value; expect(() => collectionArtOrigin()).toThrow("trusted HTTPS"); }
    finally { settings.APP_URL = previous; }
  });
  it.each(["html", "oversize-header", "oversize-stream", "altered", "redirect", "unavailable"])("fails before any render on %s", async defect => {
    const get = vi.fn(async () => {
      if (defect === "redirect") throw Error("redirect disallowed");
      return new Response(new Uint8Array(defect === "oversize-stream" ? 20 * 1024 * 1024 + 1 : 1), {
        status: defect === "unavailable" ? 503 : 200,
        headers: { "content-type": defect === "html" ? "text/html" : "image/webp",
          ...(defect === "oversize-header" ? { "content-length": "99999999" } : {}) },
      });
    });
    await expect(readCollectionArt(art.path, art.sha256, "/unused", { fetch: get, cookie: "synthetic" })).rejects.toThrow();
    expect(get).toHaveBeenCalledTimes(1);
  });
});
