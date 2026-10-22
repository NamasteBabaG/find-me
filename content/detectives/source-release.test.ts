import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DETECTIVE_SOURCE_BOARDS, DETECTIVE_RUNTIME_BLOCKERS, detectiveSourceBoard } from "./source-release";
import { readDetectiveSourceArt } from "../../src/services/generation/detective-source";

describe("approved Detectives source connection", () => {
  it("binds all nine staged masters and all 27 immutable source placements", () => {
    expect(DETECTIVE_SOURCE_BOARDS.map(b => b.board)).toEqual(["newyork", "amazon", "paris", "marrakech", "giza", "tokyo", "greatwall", "sydney", "antarctica"]);
    expect(DETECTIVE_SOURCE_BOARDS.flatMap(b => b.definition.hides)).toHaveLength(27);
    expect(DETECTIVE_RUNTIME_BLOCKERS).toContain("generation-and-publication-policy");
    expect(detectiveSourceBoard("antarctica").definition.hides.every(hide => hide.returnRect !== undefined)).toBe(true);
  });
  it.each(DETECTIVE_SOURCE_BOARDS)("reads exactly the reviewed $board master at its native dimensions", async row => {
    const bytes = await readDetectiveSourceArt(row.board);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(row.sha256);
    expect(bytes.equals(await readFile(row.path))).toBe(true);
  });
  it("rejects changed art before it could become a painter input", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "find-me-detective-source-"));
    try {
      const row = DETECTIVE_SOURCE_BOARDS[0]!;
      const file = path.join(root, row.path);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, Buffer.from("not the approved board"));
      await expect(readDetectiveSourceArt(row.board, root)).rejects.toThrow("approved pixels changed");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("never substitutes Explorers or an arbitrary path for an unknown Detectives board", async () => {
    await expect(readDetectiveSourceArt("../../private/child")).rejects.toThrow("unknown board");
  });
});
