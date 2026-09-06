import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQaSession, qaAccessConfig } from "../qa-access";
import { POST as login } from "@/app/qa-access/login/route";
import { qaAccessDenied, requireQaAccess } from "../server/qa-access";

const mocks = vi.hoisted(() => ({ cookie: undefined as string | undefined, container: vi.fn(() => { throw new Error("A locked request reached the container"); }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => mocks.cookie ? { value: mocks.cookie } : undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("@/services/container", () => ({ getContainer: mocks.container }));

const origin = "https://qa.findmeworlds.com";
const password = "synthetic-qa-password-for-tests";
beforeEach(() => {
  vi.stubEnv("APP_ENV", "qa");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("QA_ACCESS_PASSWORD", password);
  vi.stubEnv("SESSION_SECRET", "synthetic-session-key-for-tests");
  vi.stubEnv("CRON_SECRET", "synthetic-cron-key-for-tests");
  mocks.cookie = undefined;
  mocks.container.mockClear();
});
afterEach(() => vi.unstubAllEnvs());
let ip = 0;
function form(value: string, next = "/create", caller = String(++ip)) {
  return new Request(`${origin}/qa-access/login`, { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": caller }, body: new URLSearchParams({ password: value, next }) });
}

describe("the QA login route", () => {
  it("sets a signed HttpOnly Secure host cookie, returns locally, and never echoes the password", async () => {
    const res = await login(form(password));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${origin}/create`);
    const cookie = res.headers.get("set-cookie")!;
    for (const attr of ["__Host-findme_qa=", "HttpOnly", "Secure", "SameSite=lax", "Path=/", "Max-Age=86400"]) expect(cookie).toContain(attr);
    expect(cookie).not.toContain("Domain=");
    expect(cookie).not.toContain(password);
    expect(await qaAccessDenied(new Request(`${origin}/api/dev/mock-pay`, { headers: { cookie: cookie.split(";")[0]! } }))).toBeNull();
    expect(mocks.container).not.toHaveBeenCalled();
  });
  it("does not issue a cookie for a wrong password", async () => {
    const res = await login(form("wrong"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("error=invalid");
    expect(res.headers.has("set-cookie")).toBe(false);
    expect(await res.text()).not.toContain(password);
  });
  it("rejects cross-site login and absent Origin", async () => {
    for (const outside of ["https://outside.test", ""]) {
      const req = form(password);
      if (outside) req.headers.set("origin", outside); else req.headers.delete("origin");
      expect((await login(req)).status).toBe(403);
    }
  });
  it("has no external redirect, handles invalid content, and rate-limits attempts", async () => {
    expect((await login(form(password, "//outside.test"))).headers.get("location")).toBe(`${origin}/`);
    const json = form(password);
    json.headers.set("content-type", "application/json");
    expect((await login(json)).status).toBe(415);
    const huge = form(password);
    huge.headers.set("content-length", "9000");
    expect((await login(huge)).status).toBe(413);
    for (let i = 0; i < 10; i++) expect((await login(form("wrong", "/", "limited-fixture"))).status).toBe(303);
    expect((await login(form(password, "/", "limited-fixture"))).status).toBe(429);
  });
  it("fails closed without a valid secret and is absent outside QA", async () => {
    vi.stubEnv("QA_ACCESS_PASSWORD", "");
    expect((await login(form(password))).status).toBe(503);
    vi.stubEnv("APP_ENV", "production");
    expect((await login(form(password))).status).toBe(404);
  });
});

describe("defense in depth without running middleware", () => {
  it("Server Action guard rejects before application work, then accepts a signed cookie", async () => {
    await expect(requireQaAccess()).rejects.toThrow("REDIRECT:/qa-access");
    mocks.cookie = await createQaSession(qaAccessConfig());
    await expect(requireQaAccess()).resolves.toBeUndefined();
  });
  it("creation Server Actions independently refuse even when called directly", async () => {
    const actions = await import("@/app/create/actions");
    const fd = new FormData();
    for (const action of [actions.saveNameAction, actions.choosePackageAction, actions.chooseScenesAction, actions.checkoutAction]) {
      await expect(action(null, fd)).rejects.toThrow("REDIRECT:/qa-access");
    }
    expect(mocks.container).not.toHaveBeenCalled();
  });
  it("all existing API handlers reject before the container, even with forged bypass headers", async () => {
    const handlers = [
      (await import("@/app/api/dev/mock-pay/route")).POST,
      (await import("@/app/api/drafts/photo/route")).POST,
      (await import("@/app/api/drafts/photo/route")).GET,
      (await import("@/app/api/webhooks/payment/route")).POST,
      (await import("@/app/api/jobs/tick/route")).POST,
      (await import("@/app/api/jobs/tick/route")).GET,
      (await import("@/app/api/play/progress/route")).POST,
      (await import("@/app/api/health/route")).GET,
      (await import("@/app/auth/magic-link/route")).GET,
    ];
    for (const handler of handlers) {
      const res = await handler(new Request(`${origin}/api/jobs/tick`, { headers: { "x-middleware-subrequest": "middleware", "x-vercel-protection-bypass": "forged", authorization: "Bearer forged" } }));
      expect(res.status).toBe(401);
    }
    const ctx = { params: Promise.resolve({ gameId: "synthetic", assetId: "synthetic" }) };
    for (const handler of [
      (await import("@/app/api/games/[gameId]/photo/route")).POST,
      (await import("@/app/api/games/[gameId]/resend/route")).POST,
      (await import("@/app/api/games/[gameId]/status/route")).GET,
      (await import("@/app/api/assets/[assetId]/route")).GET,
    ]) expect((await handler(new Request(`${origin}/api/games/synthetic`), ctx)).status).toBe(401);
    expect(mocks.container).not.toHaveBeenCalled();
  });
  it("the cron exception must be explicitly requested and cannot authorize another endpoint", async () => {
    const headers = { authorization: `Bearer ${qaAccessConfig().cronSecret}` };
    const tick = new Request(`${origin}/api/jobs/tick`, { headers });
    expect((await qaAccessDenied(tick))?.status).toBe(401);
    expect(await qaAccessDenied(tick, true)).toBeNull();
    expect((await qaAccessDenied(new Request(`${origin}/api/dev/mock-pay`, { headers }), true))?.status).toBe(401);
  });
});
