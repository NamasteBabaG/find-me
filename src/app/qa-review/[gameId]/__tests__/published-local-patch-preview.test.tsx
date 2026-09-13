import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameConfig } from "@/domain/game/config";
import { GameConfigSchema } from "@/domain/game/config";
import { composeGame, composeScene, composeWorld } from "@/domain/game/compose";
import { localPatchBoardsForVersion } from "@/domain/scene/local-patch-catalog";
import { cropOf, maskForHide } from "@/domain/scene/local-patch-hides";
import { sceneBySlug } from "@/services/scene-catalog.service";
import { worldForBoard } from "@/services/world-catalog.service";

type FixtureGame = {
  id: string; ownerId: string | null; styleVersion: string; status: string; deletedAt: Date | null; readyAt: Date | null;
  configJson: string | null; childProfile: { ownerId: string; deletedAt: Date | null } | null;
  jobs: { id: string; status: string; stepsJson: string | null }[];
  scenes: { sceneSlug: string; sceneVersion: number; generationStatus: string; configJson: string | null }[];
};
const f = vi.hoisted(() => ({ appEnv: "qa", user: null as { id: string; email: string } | null, game: null as FixtureGame | null,
  shell: vi.fn(), writes: vi.fn(), provider: vi.fn(), find: vi.fn(), legacyRecord: null as unknown, partialConfig: null as GameConfig | null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: f.appEnv }) }));
vi.mock("@/lib/server/session", () => ({ currentUser: async () => f.user, isAdminEmail: (email: string) => email === "admin@example.com" }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ secret: "synthetic-preview-secret",
  db: { game: { findUnique: f.find, update: f.writes }, $transaction: f.writes },
  avatars: { createCharacter: f.provider }, judge: { judge: f.provider }, jobs: { enqueue: f.provider } }) }));
vi.mock("@/services/generation/local-patch-world", () => ({ LOCAL_PATCH_STYLE: "local-patch-world-v1" }));
vi.mock("@/services/generation/board-conditioned-wizard", () => ({ BOARD_WIZARD_STYLE: "fixed-sprite-board-wizard-v1", readBoardWizard: () => f.legacyRecord }));
vi.mock("@/services/generation/board-wizard-partial-review", () => ({ composePartialBoardWizardReview: () => f.partialConfig }));
vi.mock("@/game/components/GameShell", () => ({ GameShell: (props: unknown) => { f.shell(props); return <div data-player="private-preview" />; } }));
import QaGameReview from "../page";

const GAME = "game-preview-qa";
function publishedFixture(version = 8): GameConfig {
  const child = { name: "Synthetic", avatarUrl: "/api/assets/ast-avatar?e=1&s=expired" };
  const boards = localPatchBoardsForVersion(version);
  const world = worldForBoard(boards[0]!.board)!;
  const scenes = boards.map(board => {
    const definition = sceneBySlug(board.board, version);
    const sprites = board.hides.map(hide => {
      const crop = cropOf(hide), mask = maskForHide(hide), { width, height } = definition.art;
      return { targetId: hide.targetId, sprite: { kind: "image" as const, url: `/api/assets/ast-${hide.id}?e=1&s=expired`, width: crop.width, height: crop.height,
        rect: { x: crop.left / width, y: crop.top / height, w: crop.width / width, h: crop.height / height },
        hitRect: { x: (crop.left + mask.left) / width, y: (crop.top + mask.top) / height, w: mask.width / width, h: mask.height / height },
        anchor: { x: (crop.left + mask.left + mask.width / 2) / width, y: (crop.top + mask.top) / height } } };
    });
    return { ...composeScene(definition, child, sprites, "he"), worldSlug: world.slug,
      playMode: "find-any" as const, appearancesPerBoard: 5 as const, findsRequiredToAdvance: 3 as const };
  });
  return GameConfigSchema.parse(composeGame({ gameId: GAME, child, locale: "he", packageTier: "ONE_WORLD", styleVersion: "local-patch-world-v1",
    scenes, worlds: [composeWorld(world, child, "he")], now: new Date("2026-09-13T00:00:00Z") }));
}
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network from private preview"); }));
  vi.clearAllMocks();
  f.appEnv = "qa"; f.user = { id: "owner", email: "owner@example.com" };
  const config = publishedFixture();
  f.game = { id: GAME, ownerId: "owner", styleVersion: config.styleVersion, status: "READY", deletedAt: null, readyAt: new Date(), configJson: JSON.stringify(config),
    childProfile: { ownerId: "owner", deletedAt: null }, jobs: [{ id: `job_${GAME}`, status: "DONE", stepsJson: null }],
    scenes: config.scenes.map(scene => ({ sceneSlug: scene.slug, sceneVersion: 8, generationStatus: "GENERATED", configJson: JSON.stringify(scene) })) };
  f.find.mockImplementation(async () => f.game);
  f.writes.mockImplementation(() => { throw new Error("No database writes from private preview"); });
  f.provider.mockImplementation(() => { throw new Error("No providers from private preview"); });
  f.legacyRecord = null; f.partialConfig = null;
});
afterEach(() => {
  expect(f.writes).not.toHaveBeenCalled(); expect(f.provider).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
const page = () => QaGameReview({ params: Promise.resolve({ gameId: GAME }) });

describe("published local-patch QA preview route", () => {
  it.each(["READY", "DELIVERED"])("shows the owner's %s game without saved play, telemetry or skipping its gift", async status => {
    f.game!.status = status;
    const before = JSON.stringify(f.game), html = renderToStaticMarkup(await page());
    expect(html).toContain("תצוגת QA פרטית"); expect(html).toContain("45 מחבואים"); expect(html).toContain("אינם נשמרים");
    expect(f.shell).toHaveBeenCalledOnce();
    const props = f.shell.mock.calls[0]![0] as { config: GameConfig; readOnlyPreview: boolean; skipGift?: boolean };
    expect(props.readOnlyPreview).toBe(true); expect(props.skipGift).toBeUndefined();
    expect(props.config.scenes).toHaveLength(9); expect(props.config.scenes.flatMap(scene => scene.targets)).toHaveLength(45);
    expect(props.config.child.avatarUrl).not.toContain("expired"); expect(props.config.child.avatarUrl).toMatch(/^\/api\/assets\/ast-avatar\?/);
    expect(JSON.stringify(f.game)).toBe(before);
  });
  it("allows an authenticated configured admin, not an unrelated owner", async () => {
    f.user = { id: "other", email: "other@example.com" };
    await expect(page()).rejects.toThrow("NEXT_NOT_FOUND"); expect(f.shell).not.toHaveBeenCalled();
    f.user = { id: "admin", email: "admin@example.com" };
    renderToStaticMarkup(await page()); expect(f.shell.mock.calls[0]![0].readOnlyPreview).toBe(true);
  });
  it.each(["READY", "DELIVERED"])("shows an exactly pinned age-aware v9 %s game without changing it or enabling saved play", async status => {
    const config = publishedFixture(9);
    f.game!.status = status;
    f.game!.configJson = JSON.stringify(config);
    f.game!.scenes = config.scenes.map(scene => ({ sceneSlug: scene.slug, sceneVersion: scene.version,
      generationStatus: "GENERATED", configJson: JSON.stringify(scene) }));
    const before = JSON.stringify(f.game);
    renderToStaticMarkup(await page());
    const props = f.shell.mock.calls[0]![0] as { config: GameConfig; readOnlyPreview: boolean; skipGift?: boolean };
    expect(props.readOnlyPreview).toBe(true); expect(props.skipGift).toBeUndefined();
    expect(props.config.scenes).toHaveLength(9);
    expect(props.config.scenes.every(scene => scene.version === 9)).toBe(true);
    expect(props.config.scenes.flatMap(scene => scene.targets)).toHaveLength(45);
    expect(JSON.stringify(f.game)).toBe(before);
  });
  it.each(["published-v9-stored-v8", "published-v8-stored-v9", "mixed-pinned-versions"])("refuses %s before exposing a player", async defect => {
    const config = publishedFixture(defect === "published-v9-stored-v8" ? 9 : 8);
    if (defect === "published-v8-stored-v9") for (const row of f.game!.scenes) row.sceneVersion = 9;
    if (defect === "mixed-pinned-versions") {
      config.scenes[0]!.version = 9;
      f.game!.scenes[0]!.sceneVersion = 9;
      f.game!.scenes[0]!.configJson = JSON.stringify(config.scenes[0]);
    }
    f.game!.configJson = JSON.stringify(config);
    await expect(page()).rejects.toThrow("NEXT_NOT_FOUND"); expect(f.shell).not.toHaveBeenCalled();
  });
  it.each(["non-qa", "logged-out", "deleted-game", "deleted-child", "wrong-child-owner", "missing-owner", "unfinished", "running-job", "wrong-job", "no-ready-date",
    "missing-config", "malformed-config", "other-game-config", "eight-boards", "duplicate-board", "legacy-version", "unfinished-board", "missing-scene-config", "four-targets",
    "missing-avatar", "external-sprite", "missing-hit-geometry"])("blocks %s before giving imagery to the player", async defect => {
    const game = f.game!, config = JSON.parse(game.configJson!);
    switch (defect) {
      case "non-qa": f.appEnv = "production"; break;
      case "logged-out": f.user = null; break;
      case "deleted-game": game.deletedAt = new Date(); break;
      case "deleted-child": game.childProfile!.deletedAt = new Date(); break;
      case "wrong-child-owner": game.childProfile!.ownerId = "other"; break;
      case "missing-owner": game.ownerId = null; break;
      case "unfinished": game.status = "TARGETS_GENERATING"; break;
      case "running-job": game.jobs[0]!.status = "RUNNING"; break;
      case "wrong-job": game.jobs[0]!.id = "another-job"; break;
      case "no-ready-date": game.readyAt = null; break;
      case "missing-config": game.configJson = null; break;
      case "malformed-config": game.configJson = "{"; break;
      case "other-game-config": config.gameId = "another-game"; game.configJson = JSON.stringify(config); break;
      case "eight-boards": game.scenes.pop(); break;
      case "duplicate-board": config.scenes[8] = config.scenes[0]; game.configJson = JSON.stringify(config); break;
      case "legacy-version": game.scenes[0]!.sceneVersion = 7; break;
      case "unfinished-board": game.scenes[0]!.generationStatus = "NEEDS_REGENERATION"; break;
      case "missing-scene-config": game.scenes[0]!.configJson = null; break;
      case "four-targets": config.scenes[0].targets.pop(); game.configJson = JSON.stringify(config); break;
      case "missing-avatar": config.child.avatarUrl = ""; game.configJson = JSON.stringify(config); break;
      case "external-sprite": config.scenes[0].targets[0].sprite.url = "https://example.invalid/private.png"; game.configJson = JSON.stringify(config); break;
      case "missing-hit-geometry": delete config.scenes[0].targets[0].sprite.hitRect; game.configJson = JSON.stringify(config); break;
    }
    await expect(page()).rejects.toThrow("NEXT_NOT_FOUND"); expect(f.shell).not.toHaveBeenCalled();
  });
  it("preserves the legacy partial wizard review branch", async () => {
    f.game!.styleVersion = "fixed-sprite-board-wizard-v1"; f.game!.status = "MANUAL_REVIEW"; f.game!.configJson = null;
    f.legacyRecord = { state: "review-required", gameId: GAME, ownerId: "owner", boards: [{ boardId: "sydney", state: "geometry-ok", visual: [] }] };
    f.partialConfig = { ...publishedFixture(), scenes: publishedFixture().scenes.slice(0, 1) };
    renderToStaticMarkup(await page());
    expect(f.shell.mock.calls[0]![0]).toMatchObject({ readOnlyPreview: true, skipGift: true });
  });
});
