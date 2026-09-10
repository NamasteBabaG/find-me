import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ appEnv: "qa", denied: null as Response | null, admin: { id: "admin" } as { id: string } | null, resume: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: mocks.appEnv }) }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => mocks.admin }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => mocks.denied }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ synthetic: true }) }));
vi.mock("@/services/generation/board-wizard-recovery", async original => ({
  ...await original<typeof import("@/services/generation/board-wizard-recovery")>(), authorizeBoardWizardTransportRecovery: mocks.resume,
}));
import { POST } from "./route";
import { BOARD_WIZARD_RECOVERY_AUTHORITY, BoardWizardRecoveryError } from "@/services/generation/board-wizard-recovery";
const url = "https://qa.example.invalid/api/admin/games/game-synthetic/board-wizard-recovery";
const ctx = { params: Promise.resolve({ gameId: "game-synthetic" }) };
const fields = { expectedStepsSha256: "a".repeat(64), expectedLedgerSha256: "b".repeat(64), confirm: BOARD_WIZARD_RECOVERY_AUTHORITY };
function request(overrides: Record<string, string> = {}, body = new URLSearchParams(fields).toString()) {
  return new Request(url, { method: "POST", headers: { origin: new URL(url).origin, "content-type": "application/x-www-form-urlencoded", ...overrides }, body });
}
beforeEach(() => { mocks.appEnv = "qa"; mocks.admin = { id: "admin" }; mocks.denied = null; mocks.resume.mockReset().mockResolvedValue({ automaticRelease: false }); });
describe("explicit administrator wizard transport recovery POST", () => {
  it("submits exact frozen authority then redirects without model dispatch", async () => {
    const response = await POST(request(), ctx);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/orders/game-synthetic?recovery=authorized");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.resume).toHaveBeenCalledExactlyOnceWith({ synthetic: true }, { type: "ADMIN", id: "admin" }, { gameId: "game-synthetic", ...fields });
  });
  it.each(["production", "no-admin", "qa-denied", "cross-origin", "missing-origin", "cross-site"])("rejects %s before any mutation", async mode => {
    if (mode === "production") mocks.appEnv = "production";
    if (mode === "no-admin") mocks.admin = null;
    if (mode === "qa-denied") mocks.denied = new Response("blocked", { status: 401 });
    const req = request(mode === "cross-origin" ? { origin: "https://attacker.invalid" } : mode === "cross-site" ? { "sec-fetch-site": "cross-site" } : {});
    if (mode === "missing-origin") req.headers.delete("origin");
    expect((await POST(req, ctx)).status).toBeGreaterThanOrEqual(400);
    expect(mocks.resume).not.toHaveBeenCalled();
  });
  it.each(["unconfirmed", "duplicate", "too-large", "json"])("rejects %s authority", async mode => {
    let body = new URLSearchParams(fields).toString();
    if (mode === "unconfirmed") body = new URLSearchParams({ ...fields, confirm: "yes" }).toString();
    if (mode === "duplicate") body += "&expectedStepsSha256=" + "a".repeat(64);
    if (mode === "too-large") body += "x".repeat(5000);
    expect((await POST(request(mode === "json" ? { "content-type": "application/json" } : {}, body), ctx)).status).toBe(400);
    expect(mocks.resume).not.toHaveBeenCalled();
  });
  it("reports a stale frozen game without exposing internal error details", async () => {
    mocks.resume.mockRejectedValue(new BoardWizardRecoveryError("conflict", "private internal details"));
    const response = await POST(request(), ctx);
    expect(response.status).toBe(409); expect(await response.text()).not.toContain("private internal");
  });
});
