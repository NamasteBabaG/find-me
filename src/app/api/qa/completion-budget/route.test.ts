import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ appEnv: "qa", denied: null as Response | null,
  admin: { id: "owner-admin" } as { id: string } | null, ownerId: "owner-admin", preview: vi.fn(), status: vi.fn(), authorize: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: mocks.appEnv }) }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => mocks.admin }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => mocks.denied }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: { game: { findUnique: async () => ({ ownerId: mocks.ownerId }) } } }) }));
vi.mock("@/services/generation/qa-five-dollar-completion", () => ({ previewQaFiveCompletion: mocks.preview,
  qaFiveCompletionStatus: mocks.status, authorizeQaFiveCompletion: mocks.authorize }));
import { QA_FIVE_COMPLETION_CONFIRMATION } from "@/domain/generation/qa-five-dollar-completion";
import { GET, POST } from "./route";
const url = "https://qa.example.invalid/api/qa/completion-budget", gameId = "synthetic-game";
const input = { gameId, confirmation: QA_FIVE_COMPLETION_CONFIRMATION, planSha256: "a".repeat(64), ownerAuthorizationSha256: "b".repeat(64) };
const req = (form = false, fields: Record<string, string> = input) => new Request(url, { method: "POST",
  headers: { origin: new URL(url).origin, host: new URL(url).host, "content-type": form ? "application/x-www-form-urlencoded" : "application/json" },
  body: form ? new URLSearchParams(fields).toString() : JSON.stringify(fields) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.appEnv = "qa"; mocks.denied = null; mocks.admin = { id: "owner-admin" }; mocks.ownerId = "owner-admin";
  mocks.status.mockReset().mockResolvedValue(null);
  mocks.preview.mockReset().mockResolvedValue({ ownerId: "owner-admin", gameId, planSha256: input.planSha256,
    baseCapMicroUsd: 4_000_000, capMicroUsd: 5_000_000, committedMicroUsd: 3_699_963, reservedMicroUsd: 411_231, unknownCount: 2,
    nextOperation: { kind: "journey-source-head-sunburst/v1", hideId: "paris-detectives-hide-1", requiredMicroUsd: 400_000, remainingUnderBaseMicroUsd: 300_037 } });
  mocks.authorize.mockReset().mockResolvedValue({ plan: { baseCapMicroUsd: 4_000_000, capMicroUsd: 5_000_000 }, authorizationSha256: "c".repeat(64) });
});
describe("finite five-dollar owner action", () => {
  it("previews money without authorizing or exposing private owner data", async () => {
    const response = await GET(new Request(url + "?gameId=" + gameId));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const value = await response.json(); expect(value).toMatchObject({ ok: true, recorded: false, capMicroUsd: 5_000_000 });
    expect(value).not.toHaveProperty("ownerId"); expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it("renders an escaped POST form with no scripts, financial GET or private evidence", async () => {
    mocks.preview.mockResolvedValue({ ...(await mocks.preview()), nextOperation: { kind: "<script>hostile</script>", hideId: "<svg onload=bad>", requiredMicroUsd: 400000, remainingUnderBaseMicroUsd: 300037 } });
    const response = await GET(new Request(url + "?gameId=" + gameId + "&view=form")), html = await response.text();
    expect(response.status).toBe(200); expect(response.headers.get("content-security-policy")).toContain("form-action 'self'");
    expect(response.headers.get("x-frame-options")).toBe("DENY"); expect(html).toContain('method="post"');
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>"); expect(html).not.toContain("owner-admin");
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it.each([false, true])("records the same frozen authority through form=%s without buying anything", async form => {
    const response = await POST(req(form)); expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(expect.anything(), { gameId, operatorId: "owner-admin",
      expectedPlanSha256: input.planSha256, ownerAuthorizationSha256: input.ownerAuthorizationSha256 });
    const text = await response.text(); expect(text).not.toContain("owner-admin");
    if (!form) expect(JSON.parse(text)).toMatchObject({ ok: true, capMicroUsd: 5_000_000, providerCalls: 0, automaticExtension: false });
  });
  it.each(["production", "gate-denied", "no-admin", "other-owner", "cross-origin", "no-origin", "cross-site"])("refuses %s before authorizing", async mode => {
    if (mode === "production") mocks.appEnv = "production";
    if (mode === "gate-denied") mocks.denied = new Response("gate", { status: 401 });
    if (mode === "no-admin") mocks.admin = null;
    if (mode === "other-owner") mocks.ownerId = "someone-else";
    const request = req();
    if (mode === "cross-origin") request.headers.set("origin", "https://attacker.invalid");
    if (mode === "no-origin") request.headers.delete("origin");
    if (mode === "cross-site") request.headers.set("sec-fetch-site", "cross-site");
    expect((await POST(request)).status).toBeGreaterThanOrEqual(400); expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it.each(["bad-hash", "bad-confirmation", "extra-field", "duplicate-field", "oversized", "false-length"])("rejects %s without changing authority", async mode => {
    const body = new URLSearchParams(input);
    if (mode === "bad-hash") body.set("planSha256", "invalid");
    if (mode === "bad-confirmation") body.set("confirmation", "yes");
    if (mode === "extra-field") body.set("capMicroUsd", "6000000");
    if (mode === "duplicate-field") body.append("gameId", "another-game");
    if (mode === "oversized" || mode === "false-length") body.set("ownerAuthorizationSha256", "a".repeat(5000));
    const request = req(true); Object.defineProperty(request, "body", { value: new Request(url, { method: "POST", body: body.toString() }).body });
    if (mode === "false-length") request.headers.set("content-length", "3");
    expect((await POST(request)).status).toBe(400); expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it("retains a stale-plan refusal without returning private diagnostics", async () => {
    mocks.authorize.mockRejectedValue(Error("Stale plan: private identity and database details"));
    const response = await POST(req()); expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ ok: false, code: "PLAN_CHANGED" });
  });
});
