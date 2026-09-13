import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { localPatchBoardsForVersion } from "@/domain/scene/local-patch-catalog";
const mocks = vi.hoisted(() => ({ appEnv: "qa", admin: { id: "admin" } as { id: string } | null, find: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: mocks.appEnv }) }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => mocks.admin }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { game: { findUnique: mocks.find } } }) }));
import { LocalPatchPartialReleaseForm } from "./LocalPatchPartialReleaseForm";
const candidate = () => ({ id: "game-synthetic", status: "GENERATION_FAILED", styleVersion: "local-patch-world-v1",
  deletedAt: null as Date | null, configJson: null as string | null, readyAt: null as Date | null, deliveredAt: null as Date | null,
  jobs: [{ id: "job_game-synthetic", status: "DONE", currentStep: "local-patch:quality-failed" }],
  scenes: localPatchBoardsForVersion(9).map(board => ({ sceneSlug: board.board, sceneVersion: 9,
    targets: board.hides.map((hide, index) => ({ targetId: hide.targetId, variants: [{ variant: "A", provider: "local-patch",
      status: ["sydney", "greatwall"].includes(board.board) && index === 4 ? "FAILED" : "GENERATED",
      assetId: ["sydney", "greatwall"].includes(board.board) && index === 4 ? null : `asset-${hide.id}`,
      attempts: 3, rectJson: "{}", hitRectJson: "{}", headAnchorJson: "{}",
      judgeJson: JSON.stringify({ reviewState: board.board === "greatwall" ? "pending-board-review" : "board-review-complete" }),
    }] })),
  })),
});
beforeEach(() => { mocks.appEnv = "qa"; mocks.admin = { id: "admin" }; mocks.find.mockReset().mockResolvedValue(candidate()); });
describe("partial-release admin form", () => {
  it("shows exact 43/45 totals and requires each omission plus explicit human approval of unreviewed retained images", async () => {
    const html = renderToStaticMarkup(await LocalPatchPartialReleaseForm({ gameId: "game-synthetic" }));
    expect(html).toContain('/api/admin/games/game-synthetic/partial-release');
    expect(html).toContain("43 מתוך 45"); expect(html).toContain("sydney: 4"); expect(html).toContain("greatwall: 4");
    expect(html.match(/: 5 מחבואים וכוכבים/g)).toHaveLength(7);
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    for (const hideId of ["sydney-v7-5", "greatwall-v7-5"]) {
      const input = inputs.find(input => input.includes(`value="${hideId}"`));
      expect(input).toContain('name="omittedHideId"'); expect(input).toContain('required=""');
    }
    expect(html.match(/name="omittedHideId"/g)).toHaveLength(2); expect(html).not.toContain('checked=""');
    expect(html).toContain("4 מהתמונות שיופיעו במשחק עדיין ללא בדיקת לוח שהושלמה");
    expect(html).toContain("כולל תמונות שלא נבדקו והסתייגויות קיימות");
    const confirmation = inputs.find(input => input.includes('name="confirm"'));
    expect(confirmation).toContain('required=""'); expect(confirmation).toContain('value="publish-retained-subset-by-human-decision"');
    expect(html).toContain('name="reason" minLength="10" maxLength="1000" required=""');
    expect(html.match(/type="submit"/g)).toHaveLength(1);
    expect(html).toContain("ללא רינדור או חיוב נוסף");
  });
  it.each(["production", "no-admin"])("does not inspect the game for %s", async mode => {
    if (mode === "production") mocks.appEnv = "production"; else mocks.admin = null;
    expect(await LocalPatchPartialReleaseForm({ gameId: "game-synthetic" })).toBeNull(); expect(mocks.find).not.toHaveBeenCalled();
  });
  it("omits Sydney's failed fourth attempt even when an older asset and geometry remain as evidence", async () => {
    const game = candidate();
    const sydney = game.scenes.find(scene => scene.sceneSlug === "sydney")!.targets[4]!.variants[0]!;
    Object.assign(sydney, { attempts: 4, assetId: "asset-synthetic-older-sydney-attempt",
      rectJson: '{"x":0.2,"y":0.3,"w":0.1,"h":0.1}', hitRectJson: '{"x":0.22,"y":0.32,"w":0.04,"h":0.04}',
      headAnchorJson: '{"x":0.24,"y":0.34}' });
    const before = structuredClone(game);
    mocks.find.mockResolvedValue(game);
    const html = renderToStaticMarkup(await LocalPatchPartialReleaseForm({ gameId: "game-synthetic" }));
    const omissions = (html.match(/<input\b[^>]*>/g) ?? []).filter(input => input.includes('name="omittedHideId"'));
    expect(omissions).toHaveLength(2);
    expect(omissions.some(input => input.includes('value="sydney-v7-5"') && input.includes('required=""'))).toBe(true);
    expect(omissions.some(input => input.includes('value="greatwall-v7-5"') && input.includes('required=""'))).toBe(true);
    expect(html).toContain("43 מתוך 45"); expect(html).toContain("sydney: 4"); expect(html).toContain("greatwall: 4");
    expect(html.match(/: 5 מחבואים וכוכבים/g)).toHaveLength(7);
    expect(html).not.toContain(sydney.assetId!);
    expect(game).toEqual(before);
  });
  it.each(["missing", "deleted", "running", "ready", "config", "readyAt", "deliveredAt", "legacy", "mixed", "incomplete", "duplicate-board",
    "old-style", "worker-active", "other-worker-active", "worker-nonterminal", "missing-worker", "three-hides", "pending-hide", "generated-without-image",
    "unattempted-failure", "missing-geometry", "wrong-provider", "extra-variant", "missing-target", "no-failures"])("hides the action for %s", async mode => {
    const game = candidate(), scene = game.scenes.find(board => board.sceneSlug === "sydney")!, row = scene.targets[0]!.variants[0]!;
    if (mode === "deleted") game.deletedAt = new Date();
    if (mode === "running") game.status = "TARGETS_GENERATING";
    if (mode === "ready") game.status = "READY";
    if (mode === "config") game.configJson = "{}";
    if (mode === "readyAt") game.readyAt = new Date();
    if (mode === "deliveredAt") game.deliveredAt = new Date();
    if (mode === "legacy") game.scenes.forEach(scene => { scene.sceneVersion = 8; });
    if (mode === "mixed") scene.sceneVersion = 8;
    if (mode === "incomplete") game.scenes.pop();
    if (mode === "duplicate-board") game.scenes[0]!.sceneSlug = game.scenes[1]!.sceneSlug;
    if (mode === "old-style") game.styleVersion = "board-wizard-v1";
    if (mode === "worker-active") game.jobs[0]!.status = "RUNNING";
    if (mode === "other-worker-active") game.jobs.push({ id: "different-worker", status: "QUEUED", currentStep: "" });
    if (mode === "worker-nonterminal") game.jobs[0]!.currentStep = "other-step";
    if (mode === "missing-worker") game.jobs = [];
    if (mode === "three-hides") { row.status = "FAILED"; row.assetId = null; }
    if (mode === "pending-hide") row.status = "PENDING";
    if (mode === "generated-without-image") row.assetId = null;
    if (mode === "unattempted-failure") scene.targets[4]!.variants[0]!.attempts = 0;
    if (mode === "missing-geometry") row.rectJson = "";
    if (mode === "wrong-provider") row.provider = "different-engine";
    if (mode === "extra-variant") scene.targets[0]!.variants.push({ ...row, variant: "B" });
    if (mode === "missing-target") scene.targets[0]!.targetId = "unrelated";
    if (mode === "no-failures") for (const scene of game.scenes) for (const target of scene.targets) {
      target.variants[0]!.status = "GENERATED"; target.variants[0]!.assetId = `asset-${target.targetId}`;
    }
    mocks.find.mockResolvedValue(mode === "missing" ? null : game);
    expect(await LocalPatchPartialReleaseForm({ gameId: "game-synthetic" })).toBeNull();
  });
});
