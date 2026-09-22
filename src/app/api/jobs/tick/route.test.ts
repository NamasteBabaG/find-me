import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ tick: vi.fn(), notify: vi.fn(), retention: vi.fn() }));
vi.mock("@/services/container", () => ({ getContainer: () => ({}) }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => null }));
vi.mock("@/lib/env", () => ({ env: () => ({ CRON_SECRET: "synthetic-cron" }) }));
vi.mock("@/services/generation/queue", () => ({ tickGeneration: f.tick }));
vi.mock("@/services/admin-alert.service", () => ({ retryFailedAdminAlerts: f.notify }));
vi.mock("@/services/retention.service", () => ({ runRetentionIfDue: f.retention }));
import { POST } from "./route";
const request = () => new Request("https://qa.example/api/jobs/tick", { method: "POST", headers: { authorization: "Bearer synthetic-cron" } });
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
  f.tick.mockResolvedValue({ gameId: null, status: null, pending: false });
  f.notify.mockResolvedValue(null); f.retention.mockResolvedValue(null);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe("tick diagnostics and remaining budget", () => {
  it("logs phase boundaries, clears its watchdog and leaks no bearer token", async () => {
    expect((await POST(request())).status).toBe(200);
    const logs = vi.mocked(console.info).mock.calls;
    expect(logs.map(row => row[1]?.phase)).toContain("generation");
    expect(logs.at(-1)?.[1]).toMatchObject({ event: "end" });
    expect(JSON.stringify(logs)).not.toContain("synthetic-cron"); expect(vi.getTimerCount()).toBe(0);
  });
  it("defers instead of starting a painter after the available window is exhausted", async () => {
    f.notify.mockImplementation(async () => { vi.setSystemTime(Date.now() + 250_000); });
    const response = await POST(request());
    expect(response.status).toBe(202); expect(response.headers.get("retry-after")).toBe("30");
    expect(f.tick).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("reports a hung phase without returning a false success or detaching work", async () => {
    let finish!: () => void;
    f.tick.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    let returned = false;
    const work = POST(request()).then(result => { returned = true; return result; });
    await vi.advanceTimersByTimeAsync(270_000);
    expect(returned).toBe(false);
    expect(console.error).toHaveBeenCalledWith("[jobs/tick]", expect.objectContaining({ event: "deadline-exceeded", phase: "generation" }));
    finish(); await work; expect(vi.getTimerCount()).toBe(0);
  });
  it("records a safe failure marker while retaining the error for the caller", async () => {
    f.tick.mockRejectedValue(Error("sensitive-provider-detail"));
    await expect(POST(request())).rejects.toThrow("sensitive-provider-detail");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("sensitive-provider-detail");
    expect(vi.getTimerCount()).toBe(0);
  });
});
