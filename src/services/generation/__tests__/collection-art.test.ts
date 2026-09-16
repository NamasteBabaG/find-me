import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import manifest from "../../../../content/adventures/wizard-art.json";
import { readCollectionArt, COLLECTION_ART_ORIGIN } from "../collection-art";

const art = manifest[0]!;
describe("hash-bound child-free collection CDN", () => {
  it("loads the same deployed bytes with the QA gate, without redirects or a caller-selected host", async () => {
    const bytes = await readFile(art.path);
    const get = vi.fn(async () => new Response(new Uint8Array(bytes), { headers: { "content-type": "image/webp" } }));
    const result = await readCollectionArt(art.path, art.sha256, "/unused", { fetch: get, cookie: "synthetic-qa" });
    expect(result?.equals(bytes)).toBe(true);
    expect(get).toHaveBeenCalledWith(`${COLLECTION_ART_ORIGIN}/${art.path.slice(7)}`, expect.objectContaining({
      redirect: "error", cache: "no-store", headers: { cookie: "synthetic-qa", accept: "image/webp" },
    }));
    expect(await readCollectionArt("public/scenes/../../private/file.webp", art.sha256, "/unused", { fetch: get, cookie: "synthetic" })).toBeNull();
    await expect(readCollectionArt(art.path, "0".repeat(64), "/unused", { fetch: get, cookie: "synthetic" })).rejects.toThrow("unexpected pinned");
    expect(get).toHaveBeenCalledTimes(1);
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
