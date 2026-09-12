import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ appEnv: "qa", admin: { id: "real-session-admin" } as { id: string } | null,
  requestHeaders: new Headers(), qaAccess: vi.fn(), resume: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("next/headers", () => ({ headers: async () => f.requestHeaders }));
vi.mock("next/cache", () => ({ revalidatePath: f.revalidate }));
vi.mock("@/lib/server/qa-access", () => ({ requireQaAccess: f.qaAccess }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => f.admin }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: f.appEnv }) }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ synthetic: true }) }));
vi.mock("@/services/admin.service", () => ({}));
vi.mock("@/services/order.service", () => ({}));
vi.mock("@/services/game.service", () => ({}));
vi.mock("@/services/share-link.service", () => ({}));
vi.mock("@/services/scene-catalog.service", () => ({}));
vi.mock("@/services/generation/local-patch-repair-resume", () => ({
  LOCAL_PATCH_REPAIR_RESUME_CONFIRMATION: "authorize-one-post-normal-repair-per-failed-hide", resumeLocalPatchRepairs: f.resume,
}));
import { resumeLocalPatchRepairsAction } from "../actions";
const destination = "/admin/orders/game-synthetic";
function form() {
  const data = new FormData(); data.set("gameId", "game-synthetic"); data.set("confirm", "authorize-one-post-normal-repair-per-failed-hide"); return data;
}
beforeEach(() => {
  f.appEnv = "qa"; f.admin = { id: "real-session-admin" };
  f.requestHeaders = new Headers({ origin: "https://qa.example.invalid", host: "qa.example.invalid", "sec-fetch-site": "same-origin" });
  f.qaAccess.mockReset().mockResolvedValue(undefined); f.resume.mockReset().mockResolvedValue({ gameId: "game-synthetic" }); f.revalidate.mockReset();
});
describe("existing admin action explicitly authorizes local-patch repair", () => {
  it("uses authenticated operator identity, queues one explicit game, and redirects without a tick", async () => {
    const data = form(); data.set("operatorId", "forged-operator");
    await expect(resumeLocalPatchRepairsAction(data)).rejects.toThrow(`redirect:${destination}?repair=queued`);
    expect(f.qaAccess).toHaveBeenCalledOnce();
    expect(f.resume).toHaveBeenCalledExactlyOnceWith({ synthetic: true }, { gameId: "game-synthetic", operatorId: "real-session-admin",
      authorizationReason: expect.stringContaining("one additional repair per failed hide") });
    expect(f.revalidate).toHaveBeenCalledWith(destination);
  });
  it.each(["production", "no-admin", "qa-denied", "cross-origin", "missing-origin", "cross-site", "unconfirmed", "duplicate-id", "duplicate-confirm", "invalid-id"])("rejects %s before any service mutation", async mode => {
    const data = form();
    if (mode === "production") f.appEnv = "production";
    if (mode === "no-admin") f.admin = null;
    if (mode === "qa-denied") f.qaAccess.mockRejectedValue(new Error("qa-denied"));
    if (mode === "cross-origin") f.requestHeaders.set("origin", "https://attacker.invalid");
    if (mode === "missing-origin") f.requestHeaders.delete("origin");
    if (mode === "cross-site") f.requestHeaders.set("sec-fetch-site", "cross-site");
    if (mode === "unconfirmed") data.delete("confirm");
    if (mode === "duplicate-id") data.append("gameId", "another-game");
    if (mode === "duplicate-confirm") data.append("confirm", "authorize-one-post-normal-repair-per-failed-hide");
    if (mode === "invalid-id") data.set("gameId", "../../another-game");
    await expect(resumeLocalPatchRepairsAction(data)).rejects.toThrow();
    expect(f.resume).not.toHaveBeenCalled();
    expect(f.revalidate).not.toHaveBeenCalled();
  });
  it("supports the trusted forwarded host used by the platform", async () => {
    f.requestHeaders.set("host", "internal.example.invalid"); f.requestHeaders.set("x-forwarded-host", "qa.example.invalid");
    await expect(resumeLocalPatchRepairsAction(form())).rejects.toThrow("repair=queued");
    expect(f.resume).toHaveBeenCalledOnce();
  });
  it("a stale or ineligible game returns a safe blocked notice without exposing private errors", async () => {
    f.resume.mockRejectedValue(new Error("private database or identity details"));
    await expect(resumeLocalPatchRepairsAction(form())).rejects.toThrow(`redirect:${destination}?repair=blocked`);
    expect(f.resume).toHaveBeenCalledOnce();
  });
});
