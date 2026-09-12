import { mkdtemp, mkdir, readFile, writeFile, rm, realpath, access } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import release from "../../../../content/local-patch-world/art.json";
import { readPinnedLocalPatchArt } from "../local-patch-art";

describe("pixel-identical packaged art without a public directory", () => {
  it("reads the frozen PNG only, binds the public hash, and refuses altered source bytes", async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), "findme-local-patch-art-")));
    try {
      const board = release.boards.find(row => row.board === "sydney")!;
      const source = release.renderSources.find(row => row.board === board.board)!;
      const bytes = await readFile(source.path);
      await mkdir(path.dirname(path.join(root, source.path)), { recursive: true });
      await writeFile(path.join(root, source.path), bytes);
      await expect(access(path.join(root, "public"))).rejects.toThrow();
      expect((await readPinnedLocalPatchArt(`public${board.base}`, board.sha256, root))?.equals(bytes)).toBe(true);
      await expect(readPinnedLocalPatchArt(`public${board.base}`, "0".repeat(64), root)).rejects.toThrow(/not the art/);
      await writeFile(path.join(root, source.path), Buffer.from("altered"));
      await expect(readPinnedLocalPatchArt(`public${board.base}`, board.sha256, root)).rejects.toThrow(/source changed/);
    } finally {
      const relative = path.relative(await realpath(tmpdir()), root);
      if (relative.startsWith("..") || path.isAbsolute(relative) || !relative.startsWith("findme-local-patch-art-")) throw new Error("Unsafe test cleanup");
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
