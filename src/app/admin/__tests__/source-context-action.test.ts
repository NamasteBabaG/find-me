import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ appEnv: "qa", admin: { id: "real-session-admin" } as { id: string } | null,
  requestHeaders: new Headers(), qaAccess: vi.fn(), apply: vi.fn(), revalidate: vi.fn() }));
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
vi.mock("@/services/generation/local-patch-repair-resume", () => ({ LOCAL_PATCH_REPAIR_RESUME_CONFIRMATION: "authorize-one-post-normal-repair-per-failed-hide" }));
vi.mock("@/services/generation/local-patch-human-approval", () => ({ LOCAL_PATCH_HUMAN_CONFIRMATION: "synthetic-as-is" }));
vi.mock("@/services/generation/whole-source-context-repair",()=>({stageWholeSourceContextRepair:f.apply}));
import { stageWholeSourceContextAction } from "../actions";
const destination = "/admin/orders/game-synthetic", digest = "a".repeat(64);
function form() {
  const data = new FormData(); data.set("gameId", "game-synthetic"); data.set("planSha256", digest);
  return data;
}
beforeEach(() => {
  f.appEnv = "qa"; f.admin = { id: "real-session-admin" };
  f.requestHeaders = new Headers({ origin: "https://qa.example.invalid", host: "qa.example.invalid", "sec-fetch-site": "same-origin" });
  f.qaAccess.mockReset().mockResolvedValue(undefined); f.apply.mockReset().mockResolvedValue({ applied: true }); f.revalidate.mockReset();
});
describe("an owner administrator's finite source-context repair within the original budget", () => {
  it("binds the authenticated administrator and the exact plan digest, then returns to the order page", async () => {
    const data = form(); data.set("operatorId", "forged-operator");
    await expect(stageWholeSourceContextAction(data)).rejects.toThrow(`redirect:${destination}?sourceContext=staged`);
    expect(f.qaAccess).toHaveBeenCalledOnce();
    expect(f.apply).toHaveBeenCalledExactlyOnceWith({ synthetic: true }, { gameId: "game-synthetic", operatorId: "real-session-admin", expectedPlanSha256: digest });
    expect(f.revalidate).toHaveBeenCalledWith(destination);
  });
  it("reports an idempotent repeat of the same plan as released", async () => {
    f.apply.mockResolvedValue({ applied: false });
    await expect(stageWholeSourceContextAction(form())).rejects.toThrow(`redirect:${destination}?sourceContext=staged`);
  });
  it.each(["production", "no-admin", "qa-denied", "cross-origin", "missing-origin", "cross-site", "duplicate-id",
    "duplicate-plan", "malformed-plan", "missing-plan", "invalid-id"])("rejects %s before the release is attempted", async mode => {
    const data = form();
    if (mode === "production") f.appEnv = "production";
    if (mode === "no-admin") f.admin = null;
    if (mode === "qa-denied") f.qaAccess.mockRejectedValue(new Error("qa-denied"));
    if (mode === "cross-origin") f.requestHeaders.set("origin", "https://attacker.invalid");
    if (mode === "missing-origin") f.requestHeaders.delete("origin");
    if (mode === "cross-site") f.requestHeaders.set("sec-fetch-site", "cross-site");
    if (mode === "unconfirmed") data.delete("confirm");
    if (mode === "wrong-confirmation") data.set("confirm", "authorize-one-post-normal-repair-per-failed-hide");
    if (mode === "duplicate-id") data.append("gameId", "another-game");
    if (mode === "duplicate-plan") data.append("planSha256", "b".repeat(64));
    if (mode === "duplicate-confirm") data.append("confirm", "release-this-world-under-local-patch-lean-review-recovery-v1");
    if (mode === "malformed-plan") data.set("planSha256", "not-a-digest");
    if (mode === "missing-plan") data.delete("planSha256");
    if (mode === "invalid-id") data.set("gameId", "../../another-game");
    await expect(stageWholeSourceContextAction(data)).rejects.toThrow();
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.revalidate).not.toHaveBeenCalled();
  });
  it("a changed world or a refused plan returns a safe blocked notice without exposing private errors", async () => {
    f.apply.mockRejectedValue(new Error("private ledger or identity details"));
    await expect(stageWholeSourceContextAction(form())).rejects.toThrow(`redirect:${destination}?sourceContext=blocked`);
    expect(f.apply).toHaveBeenCalledOnce();
  });
});
