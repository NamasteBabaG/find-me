import { readFile } from "node:fs/promises";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import files from "../../../../content/adventures/wizard-kingdom-art.json";
import type { Container } from "../../container";
import { boardsOfWorlds } from "../../world-catalog.service";
import { LOCAL_PATCH_STYLE } from "../local-patch-world";
import { preflightLocalPatchIdentity, requireLocalPatchIdentityTime, type LocalPatchIdentityPreflightProof } from "../local-patch-identity";
import { buildBoardWizardIdentityStyle } from "../board-wizard-identity-style";
import { MAX_IDENTITY_ART_CACHE_BYTES, readCollectionArt, type IdentityArtCache } from "../collection-art";
import { sha256Bytes } from "../fixed-sprite";

const settings = vi.hoisted(() => ({ enabled: "on" }));
vi.mock("../../../lib/env", () => ({
  env: () => ({ APP_ENV: "qa", GENERATION_ENABLED: settings.enabled, GENERATION_PROVIDER: "openai",
    GENERATION_MODEL: "gpt-image-2", GENERATION_QUALITY: "medium", GENERATION_DAILY_CENTS: 0 }),
  spendGuard: () => ({ appEnv: "qa", realGeneration: true, testers: ["synthetic@example.invalid"] }),
}));
// Model only static CDN latency. Both preflight and atlas still execute actual
// schema/hash/geometry checks against the nine approved CHILD-FREE masters.
vi.mock("../collection-art", async original => ({
  ...await original<typeof import("../collection-art")>(), readCollectionArt: vi.fn(),
}));
const sources = new Map<string, Buffer>();
beforeAll(async () => { for (const entry of files) sources.set(entry.path, await readFile(entry.path)); });
afterEach(() => { vi.useRealTimers(); vi.mocked(readCollectionArt).mockReset(); settings.enabled = "on"; });

function fixture() {
  const generate = vi.fn(async () => { throw Error("No paid provider may run in preparation"); });
  const game = { styleVersion: LOCAL_PATCH_STYLE, ownerId: "synthetic-owner", deletedAt: null as Date | null, packageTier: "ONE_WORLD",
    scenes: boardsOfWorlds(["kingdom"]).map(sceneSlug => ({ sceneSlug, sceneVersion: 12 })) };
  const c = { storage: { id: "db" }, avatars: { id: "openai", createCharacter: generate },
    db: { game: { findUniqueOrThrow: async () => game }, user: { findUnique: async () => ({ email: "synthetic@example.invalid" }) } } } as unknown as Container;
  return { c, game, generate };
}

describe("bounded static-art preparation before identity purchase", () => {
  it("reads each of nine sources once in three 20-second batches and retains the portrait deadline", async () => {
    const f = fixture(), artCache: IdentityArtCache = new Map(), start = Date.now();
    const batches = Array.from({ length: 3 }, () => {
      let ready!: () => void;
      return { ready: new Promise<void>(resolve => { ready = resolve; }), signal: () => ready(), complete: [] as (() => void)[] };
    });
    let active = 0, maxActive = 0, calls = 0;
    vi.mocked(readCollectionArt).mockImplementation(async (art, expectedHash) => {
      const bytes = sources.get(art);
      if (!bytes || sha256Bytes(bytes) !== expectedHash) throw Error("Unexpected or unverified public source");
      if (calls >= 9) throw Error("Atlas made a redundant CDN read");
      const batch = batches[Math.floor(calls++ / 3)]!;
      active++; maxActive = Math.max(maxActive, active);
      return new Promise<Buffer>(resolve => {
        batch.complete.push(() => { active--; resolve(bytes); });
        if (batch.complete.length === 3) batch.signal();
      });
    });
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(start);
    const preparation = (async () => {
      const proof = await preflightLocalPatchIdentity(f.c, "synthetic", undefined, artCache);
      expect(artCache.size).toBe(9);
      expect([...artCache.values()].reduce((sum, bytes) => sum + bytes.length, 0)).toBeLessThanOrEqual(MAX_IDENTITY_ART_CACHE_BYTES);
      const atlas = await buildBoardWizardIdentityStyle(undefined, "board-matched-identity/v4", "kingdom", artCache);
      artCache.clear();
      await preflightLocalPatchIdentity(f.c, "synthetic", undefined, undefined, proof);
      await preflightLocalPatchIdentity(f.c, "synthetic", undefined, undefined, proof);
      requireLocalPatchIdentityTime(start + 270_000, 175_000);
      return atlas;
    })();
    for (const [index, batch] of batches.entries()) {
      await Promise.race([batch.ready, preparation.then(() => { throw Error("Expected next bounded CDN batch"); })]);
      vi.setSystemTime(start + (index + 1) * 20_000);
      for (const complete of batch.complete) complete();
    }
    const atlas = await preparation;
    expect(atlas.examples).toHaveLength(9);
    expect(atlas.atlasSha256).toBe(sha256Bytes(atlas.png));
    expect(Date.now() - start).toBe(60_000);
    expect(readCollectionArt).toHaveBeenCalledTimes(9);
    expect(maxActive).toBe(3);
    expect(artCache.size).toBe(0);
    expect(f.generate).not.toHaveBeenCalled();
  }, 30_000);
  it("keeps fresh guards and invalidates opaque proof when the selected public source recipe changes", async () => {
    const f = fixture();
    vi.mocked(readCollectionArt).mockImplementation(async (art, hash) => {
      const bytes = sources.get(art);
      if (!bytes || sha256Bytes(bytes) !== hash) throw Error("Unexpected public art");
      return bytes;
    });
    const artCache: IdentityArtCache = new Map();
    const proof = await preflightLocalPatchIdentity(f.c, "synthetic", undefined, artCache);
    artCache.clear(); vi.mocked(readCollectionArt).mockClear();
    settings.enabled = "off";
    await expect(preflightLocalPatchIdentity(f.c, "synthetic", undefined, undefined, proof)).rejects.toThrow("kill-switch");
    settings.enabled = "on"; f.game.deletedAt = new Date();
    await expect(preflightLocalPatchIdentity(f.c, "synthetic", undefined, undefined, proof)).rejects.toThrow("live owned");
    f.game.deletedAt = null;
    expect(readCollectionArt).not.toHaveBeenCalled();
    vi.mocked(readCollectionArt).mockImplementation(async () => { throw Error("Changed selection must revalidate static pixels"); });
    f.game.scenes = boardsOfWorlds(["journey"]).map(sceneSlug => ({ sceneSlug, sceneVersion: 12 }));
    await expect(preflightLocalPatchIdentity(f.c, "synthetic", undefined, new Map(), proof)).rejects.toThrow("revalidate static pixels");
    expect(readCollectionArt).toHaveBeenCalledTimes(3);
    expect(f.generate).not.toHaveBeenCalled();
  });
  it("refuses a copied or forged proof even when its visible recipe hash is correct", async () => {
    const f = fixture();
    vi.mocked(readCollectionArt).mockImplementation(async (art) => sources.get(art)!);
    const proof = await preflightLocalPatchIdentity(f.c, "synthetic", undefined, new Map());
    const copy = { ...proof } as LocalPatchIdentityPreflightProof;
    vi.mocked(readCollectionArt).mockClear();
    vi.mocked(readCollectionArt).mockImplementation(async () => { throw Error("Proof was not created by this preflight"); });
    await expect(preflightLocalPatchIdentity(f.c, "synthetic", undefined, new Map(), copy)).rejects.toThrow("not created");
    expect(readCollectionArt).toHaveBeenCalledTimes(3);
  });
  it("rejects mutated cached public pixels before using them as an identity style reference", async () => {
    const artCache: IdentityArtCache = new Map([[files[0]!.sha256, Buffer.from("changed public source")]]);
    await expect(buildBoardWizardIdentityStyle(undefined, "board-matched-identity/v4", "kingdom", artCache)).rejects.toThrow("cached art changed");
    expect(readCollectionArt).not.toHaveBeenCalled();
  });
});
