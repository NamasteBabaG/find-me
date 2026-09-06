import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { createQaSession, QA_SESSION_SECONDS, qaAccessConfig, qaAccessConfigured, qaAccessProblem, qaCookieName, qaCronAllowed, qaPasswordMatches, safeQaNext, validQaSession, type QaAccessConfig } from "../qa-access";

const fixture: QaAccessConfig = {
  enabled: true, secure: true, password: "synthetic-qa-password-for-tests", sessionSecret: "synthetic-session-key-for-tests", cronSecret: "synthetic-cron-key-for-tests",
};
const now = Date.UTC(2026, 8, 6);

function setQaEnv() {
  vi.stubEnv("APP_ENV", "qa");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("QA_ACCESS_PASSWORD", fixture.password);
  vi.stubEnv("SESSION_SECRET", fixture.sessionSecret);
  vi.stubEnv("CRON_SECRET", fixture.cronSecret);
}
afterEach(() => vi.unstubAllEnvs());

describe("QA password and session contract", () => {
  it("reports configuration codes without exposing values or hashes", () => {
    expect(qaAccessProblem({ ...fixture, password: "" })).toBe("QA_PASSWORD_MISSING");
    expect(qaAccessProblem({ ...fixture, password: "short" })).toBe("QA_PASSWORD_TOO_SHORT");
    expect(qaAccessProblem({ ...fixture, password: "x".repeat(257) })).toBe("QA_PASSWORD_TOO_LONG");
    expect(qaAccessProblem({ ...fixture, sessionSecret: "short" })).toBe("QA_SIGNING_KEY_INVALID");
    expect(qaAccessProblem(fixture)).toBeNull();
  });
  it("fails closed for missing, short, oversized and default credentials", async () => {
    for (const password of ["", "short", "a".repeat(257)]) {
      const c = { ...fixture, password };
      expect(qaAccessConfigured(c)).toBe(false);
      expect(await qaPasswordMatches(password, c)).toBe(false);
      expect(await validQaSession("anything", c)).toBe(false);
      await expect(createQaSession(c)).rejects.toThrow("not configured");
    }
    expect(qaAccessConfigured({ ...fixture, sessionSecret: "dev-only-session-secret-change-me" })).toBe(false);
  });
  it("compares the password exactly, supporting Unicode without trimming", async () => {
    expect(await qaPasswordMatches(fixture.password, fixture)).toBe(true);
    expect(await qaPasswordMatches(`${fixture.password} `, fixture)).toBe(false);
    expect(await qaPasswordMatches("wrong-password", fixture)).toBe(false);
    const unicode = { ...fixture, password: "סיסמה-בדיקה-סינתטית-בלבד" };
    expect(await qaPasswordMatches(unicode.password, unicode)).toBe(true);
  });
  it("issues unique signed sessions without the password and expires exactly at 24h", async () => {
    const token = await createQaSession(fixture, now);
    expect(token).not.toContain(fixture.password);
    expect(await createQaSession(fixture, now)).not.toBe(token);
    expect(await validQaSession(token, fixture, now)).toBe(true);
    expect(await validQaSession(token, fixture, now + QA_SESSION_SECONDS * 1000 - 1)).toBe(true);
    expect(await validQaSession(token, fixture, now + QA_SESSION_SECONDS * 1000)).toBe(false);
  });
  it("rejects forged, changed, malformed and future tokens", async () => {
    const token = await createQaSession(fixture, now);
    const parts = token.split(".");
    for (const value of [undefined, "true", "authorized", "x".repeat(201), token.replace("v1.", "v2."), `${parts.slice(0, 3).join(".")}.${"a".repeat(43)}`]) {
      expect(await validQaSession(value, fixture, now)).toBe(false);
    }
    expect(await validQaSession(await createQaSession(fixture, now + 1000), fixture, now)).toBe(false);
  });
  it("revokes entry when either password or signing secret changes", async () => {
    const token = await createQaSession(fixture, now);
    expect(await validQaSession(token, { ...fixture, password: `${fixture.password}-new` }, now)).toBe(false);
    expect(await validQaSession(token, { ...fixture, sessionSecret: `${fixture.sessionSecret}-new` }, now)).toBe(false);
  });
  it("uses a host-bound production cookie and only enables on explicit QA", () => {
    expect(qaCookieName(fixture)).toBe("__Host-findme_qa");
    expect(qaCookieName({ ...fixture, secure: false })).toBe("findme_qa");
    for (const appEnv of ["development", "production", ""]) {
      vi.stubEnv("APP_ENV", appEnv);
      expect(qaAccessConfig().enabled).toBe(false);
    }
  });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/\nevil.test", "/qa-access?next=/", "x", " "])("rejects unsafe next: %j", (value) => {
    expect(safeQaNext(value)).toBe("/");
  });
  it("preserves an internal play or mail link through login", () => {
    expect(safeQaNext("/auth/magic-link?token=synthetic&next=%2Flibrary")).toBe("/auth/magic-link?token=synthetic&next=%2Flibrary");
    expect(safeQaNext("/#demo")).toBe("/#demo");
  });
});

describe("QA middleware and cron boundary", () => {
  it.each(["/", "/create", "/checkout", "/play/synthetic", "/admin", "/demo/noa-portrait.png"])("gates anonymous page or asset %s", async (path) => {
    setQaEnv();
    const res = await middleware(new NextRequest(`https://qa.findmeworlds.com${path}`));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/qa-access");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
  it.each(["/api/dev/mock-pay", "/api/drafts/photo", "/api/webhooks/payment", "/api/jobs/tick", "/create", "/qa-access", "/_next/static/fake.js"])("blocks direct unauthenticated POST %s", async (path) => {
    setQaEnv();
    const res = await middleware(new NextRequest(`https://qa.findmeworlds.com${path}`, { method: "POST", headers: { "x-middleware-subrequest": "middleware:middleware:middleware:middleware:middleware", "x-vercel-protection-bypass": "fake", "cookie": "__Host-findme_qa=true" } }));
    expect(res.status).toBe(401);
  });
  it("permits an authenticated request without forwarding a password", async () => {
    setQaEnv();
    const token = await createQaSession(fixture);
    const res = await middleware(new NextRequest("https://qa.findmeworlds.com/create", { headers: { cookie: `__Host-findme_qa=${token}` } }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });
  it("keeps login and its static UI available, but missing config closes everything else", async () => {
    setQaEnv();
    vi.stubEnv("QA_ACCESS_PASSWORD", "");
    for (const path of ["/qa-access", "/_next/static/css/test.css"]) {
      expect((await middleware(new NextRequest(`https://qa.findmeworlds.com${path}`))).headers.get("x-middleware-next")).toBe("1");
    }
    expect((await middleware(new NextRequest("https://qa.findmeworlds.com/create"))).status).toBe(503);
  });
  it("only allows the exact cron path with a valid bearer, not arbitrary APIs or a gameId", async () => {
    setQaEnv();
    for (const method of ["GET", "POST"]) {
      const req = new NextRequest("https://qa.findmeworlds.com/api/jobs/tick", { method, headers: { authorization: `Bearer ${fixture.cronSecret}` } });
      expect(await qaCronAllowed(req, fixture)).toBe(true);
      expect((await middleware(req)).headers.get("x-middleware-next")).toBe("1");
    }
    for (const path of ["/api/jobs/tick?gameId=synthetic", "/api/jobs/tick/", "/api/dev/mock-pay", "/create"]) {
      expect(await qaCronAllowed(new Request(`https://qa.findmeworlds.com${path}`, { headers: { authorization: `Bearer ${fixture.cronSecret}` } }), fixture)).toBe(false);
    }
    expect(await qaCronAllowed(new Request("https://qa.findmeworlds.com/api/jobs/tick", { headers: { authorization: "Bearer wrong" } }), fixture)).toBe(false);
  });
  it("leaves development and production routing unchanged", async () => {
    for (const appEnv of ["development", "production"]) {
      vi.stubEnv("APP_ENV", appEnv);
      expect((await middleware(new NextRequest("https://example.test/create"))).headers.get("x-middleware-next")).toBe("1");
    }
  });
});
