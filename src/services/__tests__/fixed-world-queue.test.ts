import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Container } from "../container";

const run = vi.hoisted(() => vi.fn());
const wizard = vi.hoisted(() => ({ enabled: false, run: vi.fn() }));
vi.mock("../generation/pipeline", () => ({ runGenerationPipeline: run, LEASE_MS: 6 * 60_000, RESUMABLE_STATUSES: ["PAID", "TARGETS_GENERATING", "SCENES_COMPOSING", "GENERATION_FAILED"] }));
vi.mock("../generation/board-conditioned-wizard", () => ({ BOARD_WIZARD_STYLE: "fixed-sprite-board-wizard-v1", boardWizardEnabled: () => wizard.enabled, runBoardConditionedWizardSlice: wizard.run }));
import { nextPendingGame, tickGeneration } from "../generation/queue";
import { FIXED_WORLD_STYLE_PREFIX, FIXED_WORLD_STYLE_VERSION } from "../generation/fixed-world-stage-record";
import { LOCAL_PATCH_NEEDS_RELEASE, LOCAL_PATCH_STYLE } from "@/services/generation/local-patch-world";

function setup(styleVersion = FIXED_WORLD_STYLE_VERSION, status = "PAID") {
  const db = { game: { findFirst: vi.fn().mockResolvedValue(null), findUnique: vi.fn().mockResolvedValue({ styleVersion, status }) } };
  return { db, c: { db } as unknown as Container };
}
beforeEach(() => { run.mockReset().mockResolvedValue(undefined); wizard.enabled = false; wizard.run.mockReset().mockResolvedValue({ pending: true }); });

describe("fixed worlds never occupy the legacy painter queue", () => {
  it("routes a new local-patch game's identity through the bounded pipeline before hiding", async () => {
    const s = setup("local-patch-world-v1", "PAID");
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    try {
      expect(await tickGeneration(s.c, "local", 30_000, 270_000)).toMatchObject({ gameId: "local", status: "PAID", pending: true });
      expect(run).toHaveBeenCalledExactlyOnceWith(s.c, "local", { deadlineAt: 1_030_000, hardDeadlineAt: 1_270_000 });
      expect(wizard.run).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); }
  });
  it("forwards the hard deadline from tick entry to the enabled QA wizard without invoking the painter", async () => {
    const s = setup("fixed-sprite-board-wizard-v1", "TARGETS_GENERATING"); wizard.enabled = true;
    let now = 1_000_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    s.db.game.findUnique.mockImplementation(async () => { now += 5_000; return { styleVersion: "fixed-sprite-board-wizard-v1", status: "TARGETS_GENERATING" }; });
    try {
      expect(await tickGeneration(s.c, "wizard", 30_000, 270_000)).toEqual({ gameId: "wizard", status: "TARGETS_GENERATING", pending: true });
      expect(wizard.run).toHaveBeenCalledExactlyOnceWith(s.c, "wizard", { hardDeadlineAt: 1_270_000 });
      expect(run).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); }
  });
  it("preserves a wizard deadline deferral as pending without falling back to the painter", async () => {
    const s = setup("fixed-sprite-board-wizard-v1", "TARGETS_GENERATING"); wizard.enabled = true;
    wizard.run.mockResolvedValue({ pending: true });
    expect(await tickGeneration(s.c, "wizard", 1_000, 2_000)).toEqual({ gameId: "wizard", status: "TARGETS_GENERATING", pending: true });
    expect(wizard.run).toHaveBeenCalledOnce(); expect(run).not.toHaveBeenCalled();
  });
  it("does not advance the QA wizard when its feature flag is disabled", async () => {
    const s = setup("fixed-sprite-board-wizard-v1", "TARGETS_GENERATING");
    expect(await tickGeneration(s.c, "wizard", 30_000)).toEqual({ gameId: "wizard", status: "TARGETS_GENERATING", pending: false });
    expect(wizard.run).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
  });
  it("excludes every reserved fixed marker from oldest pending selection", async () => {
    const s = setup();
    s.db.game.findFirst.mockResolvedValue({ id: "legacy" });
    await expect(nextPendingGame(s.c)).resolves.toBe("legacy");
    expect(s.db.game.findFirst).toHaveBeenCalledWith({
      where: { status: { in: ["PAID", "TARGETS_GENERATING", "SCENES_COMPOSING", "GENERATION_FAILED"] }, deletedAt: null,
        // A world parked for a person is not a candidate either: parking lives on
        // the job while the game keeps its status, so without this the oldest
        // parked game is chosen forever and everything behind it waits.
        jobs: { none: { currentStep: LOCAL_PATCH_NEEDS_RELEASE } },
        AND: [
          { NOT: { styleVersion: LOCAL_PATCH_STYLE, status: "TARGETS_GENERATING", jobs: { some: {
            status: "RUNNING", updatedAt: { gte: expect.any(Date) },
          } } } },
          { NOT: { styleVersion: LOCAL_PATCH_STYLE, status: { in: ["PAID", "AVATAR_GENERATING", "GENERATION_FAILED"] }, jobs: { some: {
            status: "RUNNING", updatedAt: { gte: expect.any(Date) },
          } } } },
        ],
        NOT: { styleVersion: { startsWith: FIXED_WORLD_STYLE_PREFIX } } },
      orderBy: { paidAt: "asc" }, select: { id: true } });
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
