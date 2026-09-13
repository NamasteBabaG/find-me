import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ appEnv: "qa", admin: { id: "admin" } as { id: string } | null }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: mocks.appEnv }) }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => mocks.admin }));
vi.mock("@/services/generation/local-patch-world", () => ({ LOCAL_PATCH_STYLE: "local-patch-world-v1" }));
import { LocalPatchPaidRepairForm } from "./LocalPatchPaidRepairForm";
const candidate = () => ({ id: "game-synthetic", status: "GENERATION_FAILED", styleVersion: "local-patch-world-v1", configJson: null as string | null, readyAt: null as Date | null, deliveredAt: null as Date | null, scenes: Array.from({ length: 9 }, () => ({ sceneVersion: 8 })) });
beforeEach(() => { mocks.appEnv = "qa"; mocks.admin = { id: "admin" }; });
describe("paid-patch review-only admin form", () => {
  it("offers the explicit no-render form only for unpublished failed strict worlds", async () => {
    const html = renderToStaticMarkup(await LocalPatchPaidRepairForm({ game: candidate() }));
    expect(html).toContain('/api/admin/games/game-synthetic/paid-patch-repair');
    expect(html).toContain('name="repairs"');
    expect(html).toContain('name="authorizationReason"');
    expect(html).toContain('value="review-existing-paid-images-only"');
    expect(html).toContain("ללא רינדור נוסף");
    expect(html).toContain("אינה מאשרת תמונה או מפרסמת משחק");
  });
  it.each(["production", "no-admin", "running", "ready", "config", "readyAt", "deliveredAt", "legacy", "mixed", "incomplete", "old-style"])("does not offer repair for %s", async mode => {
    const game = candidate();
    if (mode === "production") mocks.appEnv = "production";
    if (mode === "no-admin") mocks.admin = null;
    if (mode === "running") game.status = "TARGETS_GENERATING";
    if (mode === "ready") game.status = "READY";
    if (mode === "config") game.configJson = "{}";
    if (mode === "readyAt") game.readyAt = new Date();
    if (mode === "deliveredAt") game.deliveredAt = new Date();
    if (mode === "legacy") game.scenes.forEach(s => { s.sceneVersion = 7; });
    if (mode === "mixed") game.scenes[0]!.sceneVersion = 7;
    if (mode === "incomplete") game.scenes.pop();
    if (mode === "old-style") game.styleVersion = "board-wizard-v1";
    expect(await LocalPatchPaidRepairForm({ game })).toBeNull();
  });
});
