import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import kingdom from "../../../../content/worlds/kingdom/world.json";
import { identityStyleCatalogSha256 } from "../local-patch-identity-catalog";
import { readBoardConditionedCatalog } from "../board-conditioned-catalog";

const kingdomDigest = "f28841a850c4dd67abb0c1a02f227a2b7c223311c3a8c5d169b3199e9e7f1a04";
const historicalDigest = "e3a7558b783174c3655d810be3f711cfba373d8b549bfedfe957a15e052bac70";

describe("trusted local-patch identity catalog", () => {
  it.each(kingdom.nodes.map(node => node.boardSlug))("pins %s/v12 to the same ordered nine-master/crop recipe", async boardSlug => {
    expect(await identityStyleCatalogSha256(boardSlug, 12)).toBe(kingdomDigest);
  });

  it.each([6, 7, 8, 9, 10, 11, 12])("preserves the known journey v%i identity receipt digest", async version => {
    expect((await readBoardConditionedCatalog()).sha256).toBe(historicalDigest);
    expect(await identityStyleCatalogSha256("newyork", version)).toBe(historicalDigest);
  });

  it.each([
    ["unknown-board", 12], ["../../castlegate", 12], ["", 12],
    ["castlegate", 11], ["castlegate", 10], ["newyork", 99],
    ["newyork", 0], ["newyork", undefined], ["castlegate", undefined],
  ] as const)("rejects an unavailable pinned scope %s/v%s without defaulting to another receipt", async (boardSlug, version) => {
    await expect(identityStyleCatalogSha256(boardSlug, version as number)).rejects.toThrow("unknown pinned board/version");
  });

  it("keeps the two current world scopes distinct even at the same engine version", async () => {
    const journey = await identityStyleCatalogSha256("newyork", 12);
    const magic = await identityStyleCatalogSha256("castlegate", 12);
    expect(journey).not.toBe(magic);
    // A receipt from one scope cannot supply the expected hash for the other.
    expect(magic).toBe(kingdomDigest);
    expect(journey).toBe(historicalDigest);
  });

  it("reads the legacy deployment root while taking kingdom's recipe only from trusted content", async () => {
    const absentRoot = path.join(tmpdir(), `findme-unavailable-catalog-${randomUUID()}`);
    expect(await identityStyleCatalogSha256("castlegate", 12, absentRoot)).toBe(kingdomDigest);
    await expect(identityStyleCatalogSha256("newyork", 11, absentRoot)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
