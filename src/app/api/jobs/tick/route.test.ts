import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ tick: vi.fn(), notify: vi.fn(), health: vi.fn(), retention: vi.fn(), appEnv:'qa', storageId:'db' }));
vi.mock("@/services/container", () => ({ getContainer: () => ({storage:{id:f.storageId}}) }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: async () => null }));
vi.mock("@/lib/env", () => ({ env: () => ({ CRON_SECRET: "synthetic-cron", APP_ENV:f.appEnv }) }));
vi.mock("@/services/generation/identity-source-revision-queue", () => ({ nextIdentitySourceRevision: async () => repairSelection.id }));
vi.mock("@/services/generation/queue", () => ({ tickGeneration: f.tick }));
vi.mock("@/services/admin-alert.service", () => ({ retryFailedAdminAlerts: f.notify }));
vi.mock("@/services/generation-health.service", () => ({ alertStalledGeneration: f.health }));
vi.mock("@/services/retention.service", () => ({ runRetentionIfDue: f.retention }));
import { POST } from "./route";
const repairSelection = vi.hoisted(() => ({ id: null as string | null }));
const request = () => new Request("https://qa.example/api/jobs/tick", { method: "POST", headers: { authorization: "Bearer synthetic-cron" } });
beforeEach(() => { repairSelection.id = null;
  f.appEnv='qa';f.storageId='db';
  vi.useFakeTimers(); vi.clearAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
  f.tick.mockResolvedValue({ gameId: null, status: null, pending: false });
  f.notify.mockResolvedValue(null); f.health.mockResolvedValue({ attempted: 0 }); f.retention.mockResolvedValue(null);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe("tick diagnostics and remaining budget", () => {
  it('passes the narrower mode only for a named QA DB request and skips unrelated cron work',async()=>{
    const response=await POST(new Request('https://qa.example/api/jobs/tick?gameId=synthetic&mode=review-existing',{
      method:'POST',headers:{authorization:'Bearer synthetic-cron'},
    }));
    expect(response.status).toBe(200);
    expect(f.tick).toHaveBeenCalledWith(expect.anything(),'synthetic',30_000,270_000,{workMode:'review-existing/v1'});
    expect(f.notify).not.toHaveBeenCalled();expect(f.health).not.toHaveBeenCalled();expect(f.retention).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['no-game','production','wrong-storage','unknown-mode'])('refuses unsupported review control before dispatch: %s',async which=>{
    if(which==='production')f.appEnv='production';
    if(which==='wrong-storage')f.storageId='local';
    const query=which==='no-game'?'mode=review-existing':`gameId=synthetic&mode=${which==='unknown-mode'?'anything':'review-existing'}`;
    const response=await POST(new Request('https://qa.example/api/jobs/tick?'+query,{method:'POST',headers:{authorization:'Bearer synthetic-cron'}}));
    expect(response.status).toBe(400);expect(f.tick).not.toHaveBeenCalled();expect(f.notify).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
  });
  it("logs phase boundaries, clears its watchdog and leaks no bearer token", async () => {
    expect((await POST(request())).status).toBe(200);
    const logs = vi.mocked(console.info).mock.calls;
    expect(logs.map(row => row[1]?.phase)).toContain("generation");
    expect(logs.at(-1)?.[1]).toMatchObject({ event: "end" });
    expect(JSON.stringify(logs)).not.toContain("synthetic-cron"); expect(vi.getTimerCount()).toBe(0);
    expect(f.health).toHaveBeenCalledOnce();
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


it("gives an authorized source repair a full cron window before optional chores can consume it", async () => {
  repairSelection.id = "game-synthetic-repair"; f.notify.mockImplementation(async () => { vi.setSystemTime(Date.now() + 250_000); });
  const response = await POST(request()); expect(response.status).toBe(200);
  expect(f.notify).not.toHaveBeenCalled(); expect(f.health).not.toHaveBeenCalled(); expect(f.tick).toHaveBeenCalledOnce();
  expect(f.tick.mock.calls[0]?.slice(1)).toEqual(["game-synthetic-repair", 30_000, 270_000]); expect(vi.getTimerCount()).toBe(0);
});
