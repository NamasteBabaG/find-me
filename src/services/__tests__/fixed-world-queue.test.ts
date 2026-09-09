import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Container } from "../container";

const run = vi.hoisted(() => vi.fn());
vi.mock("../generation/pipeline", () => ({ runGenerationPipeline: run, RESUMABLE_STATUSES: ["PAID", "TARGETS_GENERATING", "SCENES_COMPOSING", "GENERATION_FAILED"] }));
import { nextPendingGame, tickGeneration } from "../generation/queue";
import { FIXED_WORLD_STYLE_PREFIX, FIXED_WORLD_STYLE_VERSION } from "../generation/fixed-world-stage-record";

function setup(styleVersion = FIXED_WORLD_STYLE_VERSION, status = "PAID") {
  const db = { game: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue({ styleVersion, status }) } };
  return { db, c: { db } as unknown as Container };
}
beforeEach(() => { run.mockReset().mockResolvedValue(undefined); });

describe("fixed worlds never occupy the legacy painter queue", () => {
  it("excludes every reserved fixed marker from oldest pending selection", async () => {
    const s = setup();
    s.db.game.findFirst.mockResolvedValue({ id: "legacy" });
    await expect(nextPendingGame(s.c)).resolves.toBe("legacy");
    expect(s.db.game.findFirst).toHaveBeenCalledWith({ where: { status: { in: ["PAID", "TARGETS_GENERATING", "SCENES_COMPOSING", "GENERATION_FAILED"] }, deletedAt: null, NOT: { styleVersion: { startsWith: FIXED_WORLD_STYLE_PREFIX } } }, orderBy: { paidAt: "asc" }, select: { id: true } });
  });

  it.each([FIXED_WORLD_STYLE_VERSION, "fixed-sprite-v999"])("keeps %s PAID without suggesting another generation tick", async style => {
    const s = setup(style);
    await expect(tickGeneration(s.c, "fixed", 1000)).resolves.toEqual({ gameId: "fixed", status: "PAID", pending: false });
    expect(run).not.toHaveBeenCalled();
    expect(s.db.game.findFirst).not.toHaveBeenCalled();
  });

  it("preserves the real manual-review hold", async () => {
    const s = setup(FIXED_WORLD_STYLE_VERSION, "MANUAL_REVIEW");
    await expect(tickGeneration(s.c, "fixed", 1000)).resolves.toEqual({ gameId: "fixed", status: "MANUAL_REVIEW", pending: false });
    expect(run).not.toHaveBeenCalled();
  });

  it("still invokes the legacy pipeline with bounded deadlines", async () => {
    const s = setup("collage-v1", "PAID");
    await expect(tickGeneration(s.c, "legacy", 1000, 2000)).resolves.toEqual({ gameId: "legacy", status: "PAID", pending: true });
    expect(run).toHaveBeenCalledExactlyOnceWith(s.c, "legacy", { deadlineAt: expect.any(Number), hardDeadlineAt: expect.any(Number) });
    const options = run.mock.calls[0]![2] as { deadlineAt: number; hardDeadlineAt: number };
    expect(options.hardDeadlineAt - options.deadlineAt).toBe(1000);
  });

  it("rechecks a defensive post-run marker before suggesting another tick", async () => {
    const s = setup("collage-v1", "PAID");
    s.db.game.findUnique.mockResolvedValueOnce({ styleVersion: "collage-v1", status: "PAID" }).mockResolvedValueOnce({ styleVersion: FIXED_WORLD_STYLE_VERSION, status: "MANUAL_REVIEW" });
    await expect(tickGeneration(s.c, "legacy", 1000)).resolves.toEqual({ gameId: "legacy", status: "MANUAL_REVIEW", pending: false });
  });

  it("returns empty when there is no eligible legacy work", async () => {
    const s = setup();
    await expect(tickGeneration(s.c, null, 1000)).resolves.toEqual({ gameId: null, status: null, pending: false });
    expect(run).not.toHaveBeenCalled();
    expect(s.db.game.findUnique).not.toHaveBeenCalled();
  });

  it("does not dispatch a missing explicit game", async () => {
    const s = setup();
    s.db.game.findUnique.mockResolvedValue(null);
    await expect(tickGeneration(s.c, "missing", 1000)).resolves.toEqual({ gameId: "missing", status: null, pending: false });
    expect(run).not.toHaveBeenCalled();
  });
});
