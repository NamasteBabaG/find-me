import { describe, expect, it, vi } from "vitest";
import type { Container } from "../../container";
import { sunburstRequiredPaintCapacity } from "../sunburst-review-capacity";

describe("full coverage for already paid Sunburst pictures", () => {
  it("refuses a third picture at700k when two other paid pictures still owe ordinary review", async () => {
    const rows = ["first", "second", "current"].map(id => ({ id, status: "GENERATED", judgeJson: JSON.stringify({ reviewState: "pending-board-review" }) }));
    const findMany = vi.fn(async () => rows), c = { db: { targetVariantAsset: { findMany } } } as unknown as Pick<Container, "db">;
    const required = await sunburstRequiredPaintCapacity(c, "synthetic-game", "current");
    expect(required).toBe(900_000); expect(700_000 < required).toBe(true);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ variant: "A", status: "GENERATED",
      targetInstance: { gameScene: { gameId: "synthetic-game" } } }) }));
  });
  it("clears debt only after the ordinary review matches the current picture and includes subject evidence", async () => {
    const receipt = { reviewState: "board-review-complete", qualityDisposition: { state: "acceptable" }, judgedSha256: "current-image",
      boardReview: { dual: { imageSha256: "current-image", subject: { reader: "synthetic" } } } };
    const row = { id: "other", status: "GENERATED", judgeJson: JSON.stringify(receipt) };
    const c = { db: { targetVariantAsset: { findMany: async () => [row] } } } as unknown as Pick<Container, "db">;
    expect(await sunburstRequiredPaintCapacity(c, "synthetic-game", "current")).toBe(400_000);
    row.judgeJson = JSON.stringify({ ...receipt, judgedSha256: "new-unreviewed-image" });
    expect(await sunburstRequiredPaintCapacity(c, "synthetic-game", "current")).toBe(650_000);
    row.judgeJson = "invalid-json";
    expect(await sunburstRequiredPaintCapacity(c, "synthetic-game", "current")).toBe(650_000);
  });
});
