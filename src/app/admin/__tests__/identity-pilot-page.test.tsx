import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ admin: true, appEnv: "qa", gate: vi.fn(), game: vi.fn(), job: vi.fn(), rows: vi.fn(), stage: vi.fn(), resume: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: f.appEnv }) }));
vi.mock("@/lib/server/qa-access", () => ({ requireQaAccess: f.gate }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => f.admin ? { id: "admin" } : null }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { game: { findUnique: f.game }, generationJob: { findUnique: f.job }, targetVariantAsset: { findMany: f.rows } } }) }));
vi.mock("@/i18n/server", async () => ({ getI18n: async () => ({ t: (await import("@/i18n/dictionaries/en")).en }) }));
vi.mock("@/services/generation/local-patch-quality-pilot", () => ({ readLocalPatchQualityPilot: async () => ({ pilotId: "aud-pilot", hideId: "sydney-1", state: "candidate", candidateSha256: "b".repeat(64) }) }));
vi.mock("../orders/[gameId]/identity-pilot/actions", () => ({ stageIdentityPilotAction: f.stage, resumeIdentityPilotAction: f.resume }));
import Page from "../orders/[gameId]/identity-pilot/page";
const input = { params: Promise.resolve({ gameId: "game-v9" }), searchParams: Promise.resolve({}) };
const game = () => ({ id: "game-v9", deletedAt: null, styleVersion: "local-patch-world-v1", status: "GENERATION_FAILED", scenes: Array.from({ length: 9 }, () => ({ sceneVersion: 9 })) });
beforeEach(() => {
  f.admin = true; f.appEnv = "qa"; f.gate.mockReset().mockResolvedValue(undefined); f.game.mockReset().mockResolvedValue(game());
  f.job.mockReset().mockResolvedValue({ status: "DONE", currentStep: "local-patch:quality-failed", lastError: "quality unresolved" });
  f.rows.mockReset().mockResolvedValue([{ id: "row-1", assetId: "asset-1", attempts: 1, status: "FAILED", judgeJson: JSON.stringify({ hide: "sydney-1", judgedSha256: "a".repeat(64), rawPrivateField: "DO_NOT_PRINT" }) }]);
  f.stage.mockReset(); f.resume.mockReset();
});
describe("private identity pilot page", () => {
  it("renders bounded forms and retained candidate binding without triggering work or dumping judge replies", async () => {
    const html = renderToStaticMarkup(await Page(input));
    expect(html).toContain("one-bounded-image-then-stop"); expect(html).toContain("resume-candidates-for-automatic-review");
    expect(html).toContain("a".repeat(64)); expect(html).toContain("/api/assets/asset-1"); expect(html).not.toContain("DO_NOT_PRINT");
    expect(html).toContain("aud-pilot"); expect(html).toContain("b".repeat(64));
    expect(f.stage).not.toHaveBeenCalled(); expect(f.resume).not.toHaveBeenCalled();
  });
  it.each(["no-admin", "production", "gate-denied"])("refuses %s before game data reads", async mode => {
    if (mode === "no-admin") f.admin = false;
    if (mode === "production") f.appEnv = "production";
    if (mode === "gate-denied") f.gate.mockRejectedValue(new Error("qa-denied"));
    await expect(Page(input)).rejects.toThrow(); expect(f.game).not.toHaveBeenCalled(); expect(f.rows).not.toHaveBeenCalled();
  });
  it.each(["deleted", "legacy", "mixed", "wrong-engine", "missing"])("refuses %s games", async mode => {
    const value = game();
    if (mode === "deleted") Object.assign(value, { deletedAt: new Date() });
    if (mode === "legacy") value.scenes.forEach(s => { s.sceneVersion = 8; });
    if (mode === "mixed") value.scenes[0]!.sceneVersion = 8;
    if (mode === "wrong-engine") value.styleVersion = "other";
    f.game.mockResolvedValue(mode === "missing" ? null : value);
    await expect(Page(input)).rejects.toThrow("not-found"); expect(f.rows).not.toHaveBeenCalled();
  });
});
