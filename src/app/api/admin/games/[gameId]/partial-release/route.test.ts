import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ appEnv: "qa", denied: null as Response | null, admin: { id: "admin" } as { id: string } | null,
  release: vi.fn(), publish: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_ENV: mocks.appEnv }) }));
vi.mock("@/lib/server/session", () => ({ currentAdmin: async () => mocks.admin }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => mocks.denied }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ synthetic: true }) }));
vi.mock("@/services/generation/local-patch-partial-release", () => ({ publishLocalPatchPartialGame: mocks.release }));
vi.mock("@/services/publish.service", () => ({ publishGame: mocks.publish }));
import { POST } from "./route";
const url = "https://qa.example.invalid/api/admin/games/game-synthetic/partial-release";
const ctx = { params: Promise.resolve({ gameId: "game-synthetic" }) };
const fields = [["omittedHideId", "sydney-v7-5"], ["omittedHideId", "greatwall-v7-5"],
  ["reason", "User approved all 43 retained appearances, including unreviewed images, and these two omissions"],
  ["confirm", "publish-retained-subset-by-human-decision"]];
const request = (headers: Record<string, string> = {}, body: BodyInit = new URLSearchParams(fields).toString()) => new Request(url, {
  method: "POST", headers: { origin: new URL(url).origin, "content-type": "application/x-www-form-urlencoded", ...headers }, body,
});
beforeEach(() => {
  mocks.appEnv = "qa"; mocks.admin = { id: "admin" }; mocks.denied = null;
  mocks.release.mockReset().mockResolvedValue({ targets: 43, omittedHideIds: ["sydney-v7-5", "greatwall-v7-5"] });
  mocks.publish.mockReset().mockResolvedValue({ playUrl: "https://qa.example.invalid/play/synthetic" });
});
describe("explicit partial-release administrator boundary", () => {
  it("publishes the explicit human-approved subset before delivering its link", async () => {
    const result = await POST(request(), ctx);
    expect(result.status).toBe(303);
    expect(result.headers.get("location")).toBe("/admin/orders/game-synthetic?partialRelease=published");
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(mocks.release).toHaveBeenCalledExactlyOnceWith({ synthetic: true }, {
      gameId: "game-synthetic", operatorId: "admin", reason: fields[2]![1], omittedHideIds: ["sydney-v7-5", "greatwall-v7-5"],
    });
    expect(mocks.publish).toHaveBeenCalledExactlyOnceWith({ synthetic: true }, "game-synthetic", { type: "ADMIN", id: "admin" });
    expect(mocks.release.mock.invocationCallOrder[0]).toBeLessThan(mocks.publish.mock.invocationCallOrder[0]!);
  });
  it.each(["production", "no-admin", "qa-denied", "cross-origin", "missing-origin", "cross-site"])("blocks %s before release or delivery", async mode => {
    if (mode === "production") mocks.appEnv = "production";
    if (mode === "no-admin") mocks.admin = null;
    if (mode === "qa-denied") mocks.denied = new Response("gate", { status: 401 });
    const req = request(mode === "cross-origin" ? { origin: "https://attacker.invalid" } : mode === "cross-site" ? { "sec-fetch-site": "cross-site" } : {});
    if (mode === "missing-origin") req.headers.delete("origin");
    expect((await POST(req, ctx)).status).toBeGreaterThanOrEqual(400);
    expect(mocks.release).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled();
  });
  it.each(["unconfirmed", "missing-confirm", "extra-field", "duplicate-confirm", "duplicate-reason", "duplicate-omission", "no-omissions",
    "too-many-omissions", "invalid-omission", "empty-omission", "long-omission", "invalid-game", "empty-reason", "long-reason", "oversized", "false-length",
    "invalid-length", "oversized-length", "wrong-type"])("rejects %s", async mode => {
    const body = new URLSearchParams(fields), headers: Record<string, string> = {};
    if (mode === "unconfirmed") body.set("confirm", "yes");
    if (mode === "missing-confirm") body.delete("confirm");
    if (mode === "extra-field") body.set("operatorId", "someone-else");
    if (mode === "duplicate-confirm") body.append("confirm", "publish-retained-subset-by-human-decision");
    if (mode === "duplicate-reason") body.append("reason", "Another purported authorization");
    if (mode === "duplicate-omission") body.append("omittedHideId", "sydney-v7-5");
    if (mode === "no-omissions") body.delete("omittedHideId");
    if (mode === "too-many-omissions") for (let i = 0; i < 8; i++) body.append("omittedHideId", `other-${i}`);
    if (mode === "invalid-omission") body.set("omittedHideId", "../different-hide");
    if (mode === "empty-omission") body.set("omittedHideId", "");
    if (mode === "long-omission") body.set("omittedHideId", "x".repeat(161));
    if (mode === "empty-reason") body.set("reason", " ");
    if (mode === "long-reason") body.set("reason", "x".repeat(1001));
    if (mode === "oversized" || mode === "false-length") body.set("reason", "x".repeat(12001));
    if (mode === "false-length") headers["content-length"] = "3";
    if (mode === "invalid-length") headers["content-length"] = "-1";
    if (mode === "oversized-length") headers["content-length"] = "12001";
    if (mode === "wrong-type") headers["content-type"] = "application/json";
    const params = mode === "invalid-game" ? { params: Promise.resolve({ gameId: "../someone-else" }) } : ctx;
    expect((await POST(request(headers, body.toString()), params)).status).toBe(400);
    expect(mocks.release).not.toHaveBeenCalled(); expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("caps a chunked body without reading an unlimited tail", async () => {
    let reads = 0; const cancel = vi.fn(), req = request();
    Object.defineProperty(req, "body", { value: new ReadableStream<Uint8Array>({ pull(c) { reads++; c.enqueue(new Uint8Array(6001)); }, cancel }) });
    expect((await POST(req, ctx)).status).toBe(400);
    expect(reads).toBeLessThanOrEqual(3); expect(cancel).toHaveBeenCalledOnce(); expect(mocks.release).not.toHaveBeenCalled();
  });
  it("rejects malformed UTF-8", async () => {
    expect((await POST(request({}, new Uint8Array([0xff])), ctx)).status).toBe(400);
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it("logs an exact static service refusal while keeping the response generic", async () => {
    const message = "LOCAL_PATCH_PARTIAL_RELEASE: Each released board must retain four or five appearances";
    mocks.release.mockRejectedValue(new Error(message));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await POST(request(), ctx);
      expect(result.status).toBe(409); expect(await result.json()).toEqual({ ok: false, code: "PARTIAL_RELEASE_NOT_CONFIRMED" });
      expect(log).toHaveBeenCalledExactlyOnceWith("[partial-release] publication could not be confirmed", message);
      expect(mocks.publish).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
  it.each(["private child assessment", "LOCAL_PATCH_PARTIAL_RELEASE: private child assessment",
    "LOCAL_PATCH_PARTIAL_RELEASE: Retained assets missing; private child assessment"])("does not disclose unrecognized publication error: %s", async message => {
    mocks.release.mockRejectedValue(new Error(message));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await POST(request(), ctx);
      expect(result.status).toBe(409); expect(await result.text()).not.toContain("private child");
      expect(result.headers.get("cache-control")).toBe("no-store");
      expect(mocks.publish).not.toHaveBeenCalled(); expect(JSON.stringify(log.mock.calls)).not.toContain("private child");
      expect(log).toHaveBeenCalledExactlyOnceWith("[partial-release] publication could not be confirmed", "internal preparation or storage failure");
    } finally { log.mockRestore(); }
  });
  it("keeps a confirmed publication successful if delivery follow-up fails", async () => {
    mocks.publish.mockRejectedValue(new Error("private delivery details"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await POST(request(), ctx);
      expect(result.status).toBe(303);
      expect(result.headers.get("location")).toBe("/admin/orders/game-synthetic?partialRelease=published&delivery=pending");
      expect(mocks.release).toHaveBeenCalledOnce(); expect(JSON.stringify(log.mock.calls)).not.toContain("private delivery");
    } finally { log.mockRestore(); }
  });
});
