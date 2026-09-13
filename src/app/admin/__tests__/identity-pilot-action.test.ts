import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ appEnv: "qa", admin: { id: "session-admin" } as { id: string } | null,
  headers: new Headers(), gate: vi.fn(), stage: vi.fn(), resume: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => f.headers }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: f.revalidate }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: f.appEnv }) }));
vi.mock("@/lib/server/qa-access", () => ({ requireQaAccess: f.gate }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => f.admin }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ sentinel: "container" }) }));
vi.mock("@/services/generation/local-patch-quality-pilot", () => ({ stageLocalPatchQualityPilot: f.stage, resumeLocalPatchAfterQualityPilot: f.resume }));
import { stageIdentityPilotAction, resumeIdentityPilotAction } from "../orders/[gameId]/identity-pilot/actions";
function form(resume = false) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ gameId: "game-v9", reason: "Codex inspected the exact canonical portrait and candidate.",
    operatorId: "forged", ...(resume ? { pilotId: "aud-pilot", expectedCandidateSha256: "b".repeat(64), confirm: "resume-candidates-for-automatic-review" }
      : { hideId: "sydney-1", expectedAssetId: "ast-candidate", expectedSha256: "a".repeat(64), confirm: "one-bounded-image-then-stop" }) })) data.set(key, value);
  return data;
}
beforeEach(() => {
  f.appEnv = "qa"; f.admin = { id: "session-admin" };
  f.headers = new Headers({ origin: "https://qa.example.invalid", host: "qa.example.invalid", "sec-fetch-site": "same-origin" });
  f.gate.mockReset().mockResolvedValue(undefined); f.stage.mockReset().mockResolvedValue({}); f.resume.mockReset().mockResolvedValue({}); f.revalidate.mockReset();
});
describe("bounded identity pilot administrator actions", () => {
  it.each([false, true])("uses session operator and exact hash; resume=%s", async resume => {
    await expect((resume ? resumeIdentityPilotAction : stageIdentityPilotAction)(form(resume))).rejects.toThrow(resume ? "outcome=resumed" : "outcome=staged");
    expect(resume ? f.resume : f.stage).toHaveBeenCalledExactlyOnceWith({ sentinel: "container" }, expect.objectContaining({ gameId: "game-v9", operatorId: "session-admin",
      ...(resume ? { expectedCandidateSha256: "b".repeat(64) } : { expectedSha256: "a".repeat(64) }) }));
    expect(resume ? f.stage : f.resume).not.toHaveBeenCalled();
  });
  it.each(["production", "no-admin", "gate-denied", "cross-origin", "missing-origin", "cross-site", "duplicate-game", "duplicate-confirm", "missing-confirm", "invalid-sha", "invalid-hide", "missing-reason"])("refuses %s before staging", async mode => {
    const data = form();
    if (mode === "production") f.appEnv = "production";
    if (mode === "no-admin") f.admin = null;
    if (mode === "gate-denied") f.gate.mockRejectedValue(new Error("blocked"));
    if (mode === "cross-origin") f.headers.set("origin", "https://attacker.invalid");
    if (mode === "missing-origin") f.headers.delete("origin");
    if (mode === "cross-site") f.headers.set("sec-fetch-site", "cross-site");
    if (mode === "duplicate-game") data.append("gameId", "another");
    if (mode === "duplicate-confirm") data.append("confirm", "one-bounded-image-then-stop");
    if (mode === "missing-confirm") data.delete("confirm");
    if (mode === "invalid-sha") data.set("expectedSha256", "invented");
    if (mode === "invalid-hide") data.set("hideId", "../foreign");
    if (mode === "missing-reason") data.delete("reason");
    await expect(stageIdentityPilotAction(data)).rejects.toThrow();
    expect(f.stage).not.toHaveBeenCalled(); expect(f.resume).not.toHaveBeenCalled();
  });
  it.each([false, true])("a rejected or stale service result exposes no private error, resume=%s", async resume => {
    (resume ? f.resume : f.stage).mockRejectedValue(new Error("private bill or identity mismatch"));
    await expect((resume ? resumeIdentityPilotAction : stageIdentityPilotAction)(form(resume))).rejects.toThrow("outcome=blocked");
  });
});
