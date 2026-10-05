import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMagicConfirmation, MAGIC_CONFIRM_COOKIE, magicConfirmationNonce, validMagicConfirmation } from "../challenge";

const mocks = vi.hoisted(() => ({ inspect: vi.fn(), consume: vi.fn(), setSession: vi.fn(), denied: vi.fn(), cookie: undefined as string | undefined }));
vi.mock("@/lib/server/qa-access", () => ({ qaAccessDenied: mocks.denied }));
vi.mock("@/services/container", () => ({ getContainer: () => ({ secret: "synthetic-confirmation-secret", appUrl: "https://example.invalid" }) }));
vi.mock("@/services/auth.service", () => ({ inspectMagicLink: mocks.inspect, consumeMagicLink: mocks.consume }));
vi.mock("@/lib/server/session", () => ({ setSessionCookie: mocks.setSession }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === MAGIC_CONFIRM_COOKIE && mocks.cookie ? { value: mocks.cookie } : undefined }) }));
import { GET, POST } from "../route";

const secret = "synthetic-confirmation-secret", token = "synthetic-mail-token", origin = "https://example.invalid";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  mocks.cookie = undefined;
  mocks.denied.mockResolvedValue(null);
  mocks.inspect.mockResolvedValue({ email: "account@example.invalid" });
  mocks.consume.mockResolvedValue({ sessionToken: "synthetic-session", expiresAt: new Date(Date.now() + 60_000) });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function confirmationCookie(now?: number, forToken = token) {
  mocks.cookie = createMagicConfirmation(secret, forToken, now);
  return magicConfirmationNonce(secret, forToken, mocks.cookie, now)!;
}
function post(nonce: string, options: { origin?: string | null; token?: string; next?: string } = {}) {
  return new Request(`${origin}/auth/magic-link`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...(options.origin === null ? {} : { origin: options.origin ?? origin }) },
    body: new URLSearchParams({ token: options.token ?? token, confirmation: nonce, next: options.next ?? "/family" }),
  });
}
function issuedChallenge(response: Response): string | undefined {
  return response.headers.get("set-cookie")?.match(new RegExp(`${MAGIC_CONFIRM_COOKIE}=([^;]*)`))?.[1];
}

describe("browser-bound sign-in confirmation", () => {
  it("email scanners and repeated GETs never consume a token or replace a session", async () => {
    for (let scan = 0; scan < 3; scan++) {
      const response = await GET(new Request(`${origin}/auth/magic-link?token=${token}&next=%2Ffamily`));
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/auth/magic-link/confirm");
      expect(location.searchParams.get("token")).toBe(token);
      expect(issuedChallenge(response)).toBeTruthy();
      expect(response.headers.get("set-cookie")).toContain("HttpOnly");
      expect(response.headers.get("set-cookie")).toContain("Secure");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    }
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
  it("cross-device links work with a fresh challenge from the device opening the email", async () => {
    const response = await GET(new Request(`${origin}/auth/magic-link?token=${token}`));
    mocks.cookie = issuedChallenge(response);
    const nonce = magicConfirmationNonce(secret, token, mocks.cookie)!;
    const signedIn = await POST(post(nonce));
    expect(signedIn.status).toBe(303);
    expect(signedIn.headers.get("location")).toBe(`${origin}/family`);
    expect(mocks.consume).toHaveBeenCalledOnce();
    expect(mocks.setSession).toHaveBeenCalledOnce();
    expect(issuedChallenge(signedIn)).toBe("");
  });
  it.each(["https://attacker.invalid", "null", null])("rejects an absent or cross-site Origin (%s) before consuming", async requestOrigin => {
    const nonce = confirmationCookie();
    expect((await POST(post(nonce, { origin: requestOrigin }))).status).toBe(403);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
  it.each(["absent", "tampered", "different-token", "wrong-nonce", "expired"])("rejects %s browser proof without consuming", async problem => {
    let nonce = confirmationCookie();
    if (problem === "absent") mocks.cookie = undefined;
    if (problem === "tampered") mocks.cookie = mocks.cookie!.slice(0, -1) + (mocks.cookie!.endsWith("x") ? "y" : "x");
    if (problem === "different-token") nonce = confirmationCookie(undefined, "other-account-token");
    if (problem === "wrong-nonce") nonce = "forged";
    if (problem === "expired") nonce = confirmationCookie(Date.now() - 601_000);
    expect((await POST(post(nonce))).headers.get("location")).toBe(`${origin}/family?error=expired&next=%2Ffamily`);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
  it("retains safe return destinations after explicit confirmation and rejects external ones", async () => {
    for (const next of ["https://attacker.invalid", "//attacker.invalid", "/\\attacker.invalid", "/family?tab=games#saved"]) {
      const response = await POST(post(confirmationCookie(), { next }));
      expect(response.headers.get("location")).toBe(`${origin}${next.startsWith("/family") ? next : "/library"}`);
    }
  });
  it("a used or expired token cannot open a session even with valid browser proof", async () => {
    mocks.consume.mockResolvedValue(null);
    expect((await POST(post(confirmationCookie()))).headers.get("location")).toBe(`${origin}/family?error=expired&next=%2Ffamily`);
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
  it("an invalid GET cannot issue a challenge", async () => {
    mocks.inspect.mockResolvedValue(null);
    const response = await GET(new Request(`${origin}/auth/magic-link?token=${token}`));
    expect(response.headers.get("location")).toBe(`${origin}/family?error=expired&next=%2Flibrary`);
    expect(issuedChallenge(response)).toBeUndefined();
    expect(mocks.consume).not.toHaveBeenCalled();
  });
  it("a poisoned request host cannot select an auth redirect or accept a matching forged Origin", async () => {
    const get = await GET(new Request(`https://other-host.invalid/auth/magic-link?token=${token}`));
    expect(get.status).toBe(400);
    expect(get.headers.get("location")).toBeNull();
    expect(mocks.inspect).not.toHaveBeenCalled();
    const nonce = confirmationCookie();
    const request = new Request("https://other-host.invalid/auth/magic-link", {
      method: "POST", headers: { origin: "https://other-host.invalid", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, confirmation: nonce, next: "/family" }),
    });
    expect((await POST(request)).status).toBe(403);
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
  it.each(["invalid-open", "invalid-proof", "expired-confirm"] as const)("%s preserves a safe selected adventure for a new sign-in without authenticating", async failure => {
    const targets = [
      "/family/fam_test/worlds/kingdom/purchase?ageYears=8&returnGame=game_source",
      "/family/fam_test/play/game_source?board=tokyo&world=journey",
      "/family/fam_test/passport",
      "https://outside.invalid/checkout", "//outside.invalid/checkout", "/\\outside.invalid/checkout",
    ];
    for (const next of targets) {
      let response: Response;
      if (failure === "invalid-open") {
        mocks.inspect.mockResolvedValue(null);
        const url = new URL(`${origin}/auth/magic-link`); url.searchParams.set("token", token); url.searchParams.set("next", next);
        response = await GET(new Request(url));
      } else {
        if (failure === "expired-confirm") mocks.consume.mockResolvedValue(null);
        response = await POST(post(failure === "invalid-proof" ? "forged" : confirmationCookie(), { next }));
      }
      const location = new URL(response.headers.get("location")!);
      expect(location.origin).toBe(origin); expect(location.pathname).toBe("/family");
      expect(location.searchParams.get("error")).toBe("expired");
      expect(location.searchParams.get("next")).toBe(next.startsWith("/family/") ? next : "/library");
      expect(location.searchParams.has("token")).toBe(false); expect(location.searchParams.has("confirmation")).toBe(false);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(mocks.setSession).not.toHaveBeenCalled();
    if (failure !== "expired-confirm") expect(mocks.consume).not.toHaveBeenCalled();
  });
  it("challenge signatures reject wrong secrets, token substitutions, expired and malformed values", () => {
    const now = Date.now(), cookie = createMagicConfirmation(secret, token, now), nonce = magicConfirmationNonce(secret, token, cookie, now)!;
    expect(validMagicConfirmation(secret, token, cookie, nonce, now)).toBe(true);
    expect(magicConfirmationNonce("wrong-secret", token, cookie, now)).toBeNull();
    expect(magicConfirmationNonce(secret, "other", cookie, now)).toBeNull();
    expect(magicConfirmationNonce(secret, token, cookie, now + 600_000)).toBeNull();
    expect(magicConfirmationNonce(secret, token, "malformed", now)).toBeNull();
  });
  it.each(["qa-denied", "wrong-host", "invalid-link", "wrong-origin", "malformed-form", "invalid-proof", "expired-token", "read-error", "consume-error"])("protects %s responses from caching and referrer leakage", async problem => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    let response: Response;
    if (problem === "qa-denied") {
      mocks.denied.mockResolvedValue(new Response("locked", { status: 401 }));
      response = await POST(post("unused"));
    } else if (problem === "wrong-host") {
      response = await GET(new Request(`https://other.invalid/auth/magic-link?token=${token}`));
    } else if (problem === "invalid-link" || problem === "read-error") {
      if (problem === "invalid-link") mocks.inspect.mockResolvedValue(null);
      else mocks.inspect.mockRejectedValue(new Error("synthetic private debug details"));
      response = await GET(new Request(`${origin}/auth/magic-link?token=${token}`));
    } else if (problem === "wrong-origin") {
      response = await POST(post("unused", { origin: "https://other.invalid" }));
    } else if (problem === "malformed-form") {
      response = await POST(new Request(`${origin}/auth/magic-link`, { method: "POST", headers: { origin }, body: "not form data" }));
    } else {
      const nonce = confirmationCookie();
      if (problem === "expired-token") mocks.consume.mockResolvedValue(null);
      if (problem === "consume-error") mocks.consume.mockRejectedValue(new Error("synthetic private debug details"));
      response = await POST(post(problem === "invalid-proof" ? "forged" : nonce));
    }
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    if (problem.endsWith("error")) {
      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain("private debug");
      expect(log).toHaveBeenCalledWith("[auth] Sign-in request could not be completed");
      expect(mocks.setSession).not.toHaveBeenCalled();
    }
  });
});
