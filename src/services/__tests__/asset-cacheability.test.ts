import { describe, expect, it } from "vitest";
import { readAsset, signedAssetUrl } from "../asset.service";
import type { Container } from "../container";

/**
 * A private photograph of a child must never be stored by a browser, whatever
 * the URL happened to carry.
 */

const SECRET = "test-only-session-secret-not-a-real-one";
const bytes = Buffer.from("pretend-png");

function container(asset: Record<string, unknown>): Container {
  return {
    secret: SECRET,
    appUrl: "https://example.test",
    db: { asset: { findUnique: async () => asset } },
    storage: { get: async () => bytes },
  } as unknown as Container;
}

const gameAsset = { id: "a_game", status: "READY", visibility: "GAME", ownerId: "u1", storagePath: "p", mimeType: "image/png" };
const privateAsset = { id: "a_priv", status: "READY", visibility: "PRIVATE", ownerId: "u1", storagePath: "p", mimeType: "image/jpeg" };

/** The signature the play config would carry, as the product makes it. */
function signatureFor(assetId: string) {
  const signed = new URL(signedAssetUrl(container(gameAsset), assetId), "https://example.test");
  return { signature: signed.searchParams.get("s"), expires: signed.searchParams.get("e") };
}

describe("whether an asset's bytes may be cached", () => {
  it("lets a GAME asset with a signature that verifies be cached", async () => {
    const { signature, expires } = signatureFor("a_game");
    const result = await readAsset(container(gameAsset), "a_game", { userId: null, isAdmin: false, signature, expires });
    expect("error" in result).toBe(false);
    expect((result as { cacheable: boolean }).cacheable).toBe(true);
  });

  it("never caches a PRIVATE asset, even for its owner and even with a query", async () => {
    // The route used to choose the header by whether `?s=` was present, so an
    // owner fetching their child's photograph with any such parameter got it
    // back immutable for a day - kept after signing out, and after deletion.
    for (const viewer of [
      { userId: "u1", isAdmin: false, signature: null, expires: null },
      { userId: "u1", isAdmin: false, signature: "not-a-real-signature", expires: "9999999999" },
      { userId: null, isAdmin: true, signature: "not-a-real-signature", expires: "9999999999" },
    ]) {
      const result = await readAsset(container(privateAsset), "a_priv", viewer);
      expect("error" in result).toBe(false);
      expect((result as { cacheable: boolean }).cacheable).toBe(false);
    }
  });

  it("does not cache a GAME asset reached by owning it rather than by a signature", async () => {
    // Access and cacheability are different questions: the owner may read it,
    // but nothing about that says a shared browser may keep the bytes.
    const result = await readAsset(container(gameAsset), "a_game", { userId: "u1", isAdmin: false, signature: null, expires: null });
    expect((result as { cacheable: boolean }).cacheable).toBe(false);
  });

  it("still refuses a deleted asset outright", async () => {
    const result = await readAsset(container({ ...privateAsset, status: "DELETED" }), "a_priv", { userId: "u1", isAdmin: true, signature: null, expires: null });
    expect(result).toEqual({ error: 404 });
  });
});
