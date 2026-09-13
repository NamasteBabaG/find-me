import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ appEnv: "qa", denied: null as Response | null, admin: { id: "admin" } as { id: string } | null, stage: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: mocks.appEnv }) }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => mocks.admin }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => mocks.denied }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ synthetic: true }) }));
vi.mock("@/services/generation/local-patch-extra-attempt", () => ({ stageLocalPatchExtraAttempts: mocks.stage }));
import { POST } from "./route";
const url = "https://qa.example.invalid/api/admin/games/game-synthetic/extra-patch-attempt";
const ctx = { params: Promise.resolve({ gameId: "game-synthetic" }) };
const fields = [["hideId", "sydney-v7-5"], ["hideId", "greatwall-v7-5"], ["reviewOnlyHideId", "amazon-v7-5"],
  ["reason", "Two diagnosed seam repairs; existing Amazon reviewed for visible-head scale only"], ["confirm", "one-scoped-extra-attempt"]];
const request = (headers: Record<string, string> = {}, body = new URLSearchParams(fields).toString()) => new Request(url, {
  method: "POST", headers: { origin: new URL(url).origin, "content-type": "application/x-www-form-urlencoded", ...headers }, body,
});
beforeEach(() => { mocks.appEnv = "qa"; mocks.admin = { id: "admin" }; mocks.denied = null; mocks.stage.mockReset().mockResolvedValue({}); });
describe("scoped additional attempt administrator boundary", () => {
  it("keeps review-only authority separate from two image authorizations", async () => {
    const result = await POST(request(), ctx);
    expect(result.status).toBe(303);
    expect(result.headers.get("location")).toBe("/admin/orders/game-synthetic?extraAttempt=queued");
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(mocks.stage).toHaveBeenCalledExactlyOnceWith({ synthetic: true }, {
      gameId: "game-synthetic", operatorId: "admin", reason: fields[3]![1],
      hideIds: ["sydney-v7-5", "greatwall-v7-5"], reviewOnlyHideIds: ["amazon-v7-5"],
    });
  });
  it.each(["production", "no-admin", "qa-denied", "cross-origin", "missing-origin", "cross-site"])("blocks %s before service", async mode => {
    if (mode === "production") mocks.appEnv = "production";
    if (mode === "no-admin") mocks.admin = null;
    if (mode === "qa-denied") mocks.denied = new Response("gate", { status: 401 });
    const req = request(mode === "cross-origin" ? { origin: "https://attacker.invalid" } : mode === "cross-site" ? { "sec-fetch-site": "cross-site" } : {});
    if (mode === "missing-origin") req.headers.delete("origin");
    expect((await POST(req, ctx)).status).toBeGreaterThanOrEqual(400);
    expect(mocks.stage).not.toHaveBeenCalled();
  });
  it.each(["unconfirmed", "extra-field", "duplicate-confirm", "duplicate-image", "overlap", "empty-reason", "oversized", "false-length", "wrong-type"])("rejects %s", async mode => {
    const body = new URLSearchParams(fields), headers: Record<string, string> = {};
    if (mode === "unconfirmed") body.set("confirm", "yes");
    if (mode === "extra-field") body.set("gameId", "someone-else");
    if (mode === "duplicate-confirm") body.append("confirm", "one-scoped-extra-attempt");
    if (mode === "duplicate-image") body.append("hideId", "sydney-v7-5");
    if (mode === "overlap") body.set("reviewOnlyHideId", "sydney-v7-5");
    if (mode === "empty-reason") body.set("reason", " ");
    if (mode === "oversized" || mode === "false-length") body.set("reason", "x".repeat(12001));
    if (mode === "false-length") headers["content-length"] = "3";
    if (mode === "wrong-type") headers["content-type"] = "application/json";
    expect((await POST(request(headers, body.toString()), ctx)).status).toBe(400);
    expect(mocks.stage).not.toHaveBeenCalled();
  });
  it("caps a chunked body without reading an unlimited tail", async () => {
    let reads = 0; const cancel = vi.fn(), req = request();
    Object.defineProperty(req, "body", { value: new ReadableStream<Uint8Array>({ pull(c) { reads++; c.enqueue(new Uint8Array(6001)); }, cancel }) });
    expect((await POST(req, ctx)).status).toBe(400);
    expect(reads).toBeLessThanOrEqual(3); expect(cancel).toHaveBeenCalledOnce(); expect(mocks.stage).not.toHaveBeenCalled();
  });
  it("does not claim queued or disclose private evidence when validation refuses", async () => {
    mocks.stage.mockRejectedValue(new Error("private child assessment"));
    const result = await POST(request(), ctx);
    expect(result.status).toBe(409); expect(await result.text()).not.toContain("private child");
  });
});
