import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ receive: vi.fn(), limited: vi.fn(), denied: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: () => ({ APP_URL: "https://example.com" }) }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: f.denied }));
vi.mock("@/lib/server/rate-limit", () => ({ callerKey: () => "fixture", rateLimit: f.limited }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ db: {} }) }));
vi.mock("@/services/support.service", async original => ({ ...await original<object>(), receiveSupportRequest: f.receive }));
import { POST } from "./route";
const body = { requestKey: "4e22144e-36ce-450b-8924-56f6af43fe4b", locale: "he", topic: "cancellation", email: "fixture@example.com" };
const request = (content: unknown = body, origin = "https://example.com") => new Request("https://example.com/api/support", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(content) });
beforeEach(() => { vi.clearAllMocks(); f.denied.mockResolvedValue(null); f.limited.mockReturnValue({ ok: true }); f.receive.mockResolvedValue({ reference: "support_" + "a".repeat(40), receivedAt: "2026-10-01T08:00:00.000Z" }); });
describe("public support boundary", () => {
  it("acknowledges only a durably recorded request and never caches the receipt", async () => {
    const response = await POST(request()); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ok: true }); expect(f.receive).toHaveBeenCalledOnce();
  });
  it("rejects cross-origin submissions", async () => { expect((await POST(request(body, "https://evil.example"))).status).toBe(403); expect(f.receive).not.toHaveBeenCalled(); });
  it("accepts the configured public origin even if Next uses an internal localhost URL", async () => {
    const proxied = new Request("http://localhost:3107/api/support", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://example.com" }, body: JSON.stringify(body) });
    expect((await POST(proxied)).status).toBe(200);
  });
  it.each([{ ...body, email: "invalid" }, { ...body, website: "spam" }, { ...body, message: "x".repeat(2501) }])("validates submissions before storage", async invalid => { expect((await POST(request(invalid))).status).toBe(400); expect(f.receive).not.toHaveBeenCalled(); });
  it("rejects an oversized body even without a declared length", async () => { expect((await POST(request({ ...body, message: "x".repeat(17_000) }))).status).toBe(413); expect(f.receive).not.toHaveBeenCalled(); });
  it("does not falsely acknowledge an unavailable database or leak input in the response", async () => {
    const logs = vi.spyOn(console, "error").mockImplementation(() => {}); f.receive.mockRejectedValue(Error("sensitive internals"));
    const response = await POST(request()); expect(response.status).toBe(503); expect(await response.text()).not.toContain("sensitive"); expect(logs).toHaveBeenCalledWith("[support] request could not be recorded"); logs.mockRestore();
  });
  it("rate limits submissions", async () => { f.limited.mockReturnValue({ ok: false, retryAfter: 20 }); const response = await POST(request()); expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("20"); expect(f.receive).not.toHaveBeenCalled(); });
});
