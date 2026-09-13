import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADVENTURE_PILOT } from "../../../content/adventures";
import { adventureFixture } from "../../domain/adventure/__tests__/fixture";
import { prepareAdventureConfig, validateAdventureAssets } from "../adventure-content.service";

let scratch: string, digest: string;
beforeAll(async () => {
  scratch = await mkdtemp(path.join(tmpdir(), "findme-adventure-art-"));
  await mkdir(path.join(scratch, "scenes", "portrait-test"), { recursive: true });
  // Synthetic uniform raster verifies transport/geometry, NOT visual quality.
  const pixels = await sharp({ create: { width: 600, height: 900, channels: 3, background: "#dddddd" } }).png().toBuffer();
  digest = createHash("sha256").update(pixels).digest("hex");
  await writeFile(path.join(scratch, "scenes", "portrait-test", "base.png"), pixels);
});
afterAll(async () => {
  if (scratch && path.dirname(scratch) === tmpdir() && path.basename(scratch).startsWith("findme-adventure-art-")) await rm(scratch, { recursive: true, force: true });
});

describe("read-only adventure authoring gate", () => {
  it("validates all planned studies without needing art or inventing a ready scene", async () => {
    expect(await validateAdventureAssets(ADVENTURE_PILOT, "nonexistent-public-root")).toEqual({ planned: 3, ready: 0 });
  });
  it("checks actual art bytes and dimensions before returning an opted-in config", async () => {
    const { config, catalog } = adventureFixture();
    const board = catalog.boards[0]!;
    if (board.status !== "ready") throw new Error("fixture");
    board.art.sha256 = digest;
    const result = await prepareAdventureConfig(config, catalog, ["portrait-test"], scratch);
    expect(result.adventure!.boards[0]!.artSha256).toBe(digest);
    expect(result.scenes).toEqual(config.scenes);
  });
  it("rejects stale hashes, dimensions and missing assets", async () => {
    const { catalog } = adventureFixture();
    const board = catalog.boards[0]!;
    if (board.status !== "ready") throw new Error("fixture");
    await expect(validateAdventureAssets(catalog, scratch)).rejects.toThrow("art-hash");
    board.art.sha256 = digest;
    board.art.height++;
    await expect(validateAdventureAssets(catalog, scratch)).rejects.toThrow("art-dimensions");
    board.art.height--;
    board.art.base = "/scenes/portrait-test/missing.png";
    await expect(validateAdventureAssets(catalog, scratch)).rejects.toThrow();
  });
});
