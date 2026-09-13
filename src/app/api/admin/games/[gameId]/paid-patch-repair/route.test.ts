import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ appEnv: "qa", denied: null as Response | null, admin: { id: "admin" } as { id: string } | null, stage: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: mocks.appEnv }) }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => mocks.admin }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => mocks.denied }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ synthetic: true }) }));
vi.mock("@/services/generation/local-patch-paid-repair", () => ({ stageLocalPatchPaidRepair: mocks.stage }));
import { POST } from "./route";

const url = "https://qa.example.invalid/api/admin/games/game-synthetic/paid-patch-repair";
const ctx = { params: Promise.resolve({ gameId: "game-synthetic" }) };
const repairs = [{ rawRequestKey: "a:render:2", alphaBase64: "AA==" }, { rawRequestKey: "b:render:3", alphaBase64: "AQ==" }];
const fields = { repairs: JSON.stringify(repairs), authorizationReason: "Explicit operator authorisation to review already-paid images", confirm: "review-existing-paid-images-only" };
function request(overrides: Record<string, string> = {}, body = new URLSearchParams(fields).toString()) {
  return new Request(url, { method: "POST", headers: { origin: new URL(url).origin, "content-type": "application/x-www-form-urlencoded", ...overrides }, body });
}
beforeEach(() => { mocks.appEnv = "qa"; mocks.admin = { id: "admin" }; mocks.denied = null; mocks.stage.mockReset().mockResolvedValue({ queued: true }); });

describe("administrator paid-patch repair boundary", () => {
  it("passes exact two manifests and operator identity to the guarded service, then redirects", async () => {
    const response = await POST(request(), ctx);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin/orders/game-synthetic?paidRepair=queued");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.stage).toHaveBeenCalledExactlyOnceWith({ synthetic: true }, { gameId: "game-synthetic", operatorId: "admin", authorizationReason: fields.authorizationReason, repairs });
  });
  it.each(["production", "no-admin", "qa-denied", "cross-origin", "missing-origin", "cross-site"])("refuses %s before mutation", async mode => {
    if (mode === "production") mocks.appEnv = "production";
    if (mode === "no-admin") mocks.admin = null;
    if (mode === "qa-denied") mocks.denied = new Response("gate", { status: 401 });
    const req = request(mode === "cross-origin" ? { origin: "https://attacker.invalid" } : mode === "cross-site" ? { "sec-fetch-site": "cross-site" } : {});
    if (mode === "missing-origin") req.headers.delete("origin");
    expect((await POST(req, ctx)).status).toBeGreaterThanOrEqual(400);
    expect(mocks.stage).not.toHaveBeenCalled();
  });
  it.each(["unconfirmed", "duplicate", "extra", "empty-reason", "bad-json", "object", "one", "three", "json-content", "large-declared", "large-actual", "false-small-declared"])("rejects %s before service", async mode => {
    let body = new URLSearchParams(fields).toString();
    const headers: Record<string, string> = {};
    if (mode === "unconfirmed") body = new URLSearchParams({ ...fields, confirm: "yes" }).toString();
    if (mode === "duplicate") body += "&confirm=" + fields.confirm;
    if (mode === "extra") body += "&gameId=other-game";
    if (mode === "empty-reason") body = new URLSearchParams({ ...fields, authorizationReason: "  " }).toString();
    if (["bad-json", "object", "one", "three"].includes(mode)) body = new URLSearchParams({ ...fields, repairs: mode === "bad-json" ? "[" : mode === "object" ? "{}" : JSON.stringify(Array.from({ length: mode === "one" ? 1 : 3 }, () => repairs[0])) }).toString();
    if (mode === "json-content") headers["content-type"] = "application/json";
    if (mode === "large-declared") headers["content-length"] = "250001";
    if (["large-actual", "false-small-declared"].includes(mode)) body = "x".repeat(250001);
    if (mode === "false-small-declared") headers["content-length"] = "10";
    expect((await POST(request(headers, body), ctx)).status).toBe(400);
    expect(mocks.stage).not.toHaveBeenCalled();
  });
  it("bounds a chunked body before reading its unbounded tail", async () => {
    let reads = 0;
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { reads++; controller.enqueue(new Uint8Array(125_001)); }, cancel });
    const req = request();
    Object.defineProperty(req, "body", { value: stream });
    expect((await POST(req, ctx)).status).toBe(400);
    expect(reads).toBeLessThanOrEqual(3);
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.stage).not.toHaveBeenCalled();
  });
  it("refuses malformed UTF-8 without touching the service", async () => {
    const req = request();
    Object.defineProperty(req, "body", { value: new ReadableStream({ start(c) { c.enqueue(new Uint8Array([0xff])); c.close(); } }) });
    expect((await POST(req, ctx)).status).toBe(400);
    expect(mocks.stage).not.toHaveBeenCalled();
  });
  it("does not claim queued or leak private details when staging fails", async () => {
    mocks.stage.mockRejectedValue(new Error("private source hash / child data"));
    const response = await POST(request(), ctx);
    expect(response.status).toBe(409);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).not.toContain("private source");
  });
});
