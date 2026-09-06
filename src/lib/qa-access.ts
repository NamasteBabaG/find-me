/** QA's outer gate. Web Crypto keeps the same checks usable at the edge and in routes. */
import { safeLocalPath } from "./safe-redirect";

export interface QaAccessConfig {
  enabled: boolean;
  password: string;
  sessionSecret: string;
  secure: boolean;
  cronSecret: string;
}

export const QA_SESSION_SECONDS = 24 * 60 * 60;
const encoder = new TextEncoder();
let reportedProblem: string | null = null;

export function qaAccessConfig(): QaAccessConfig {
  const config = {
    enabled: process.env.APP_ENV === "qa",
    password: process.env.QA_ACCESS_PASSWORD ?? "",
    sessionSecret: process.env.SESSION_SECRET ?? "",
    secure: process.env.NODE_ENV === "production",
    cronSecret: process.env.CRON_SECRET ?? "",
  };
  const problem = config.enabled ? qaAccessProblem(config) : null;
  if (problem && problem !== reportedProblem) {
    // Codes only: no value, length, hash, prefix, or supplied password in logs.
    console.warn(`[qa-access] configuration unavailable: ${problem}`);
  }
  reportedProblem = problem;
  return config;
}

export function qaAccessConfigured(c: QaAccessConfig): boolean {
  return qaAccessProblem(c) === null;
}

export function qaAccessProblem(c: QaAccessConfig): string | null {
  if (!c.password) return "QA_PASSWORD_MISSING";
  if (c.password.length < 16) return "QA_PASSWORD_TOO_SHORT";
  if (c.password.length > 256) return "QA_PASSWORD_TOO_LONG";
  if (c.sessionSecret.length < 16 || c.sessionSecret === "dev-only-session-secret-change-me") return "QA_SIGNING_KEY_INVALID";
  return null;
}

export function qaCookieName(c: QaAccessConfig): string {
  // Host-only: a sibling subdomain cannot inject or read this cookie.
  return c.secure ? "__Host-findme_qa" : "findme_qa";
}

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function sameSecret(expected: string, supplied: string, signingSecret: string): Promise<boolean> {
  const k = await key(signingSecret);
  const expectedMac = await crypto.subtle.sign("HMAC", k, encoder.encode(expected));
  // Constant-time comparison inside Web Crypto, not string equality on passwords.
  return crypto.subtle.verify("HMAC", k, expectedMac, encoder.encode(supplied));
}

export async function qaPasswordMatches(value: string, c: QaAccessConfig): Promise<boolean> {
  if (!qaAccessConfigured(c) || value.length > 256) return false;
  return sameSecret(c.password, value, `qa-password-v1:${c.sessionSecret}`);
}

async function sessionKey(c: QaAccessConfig): Promise<CryptoKey> {
  // Changing either secret invalidates sessions after redeployment; the password
  // and its hash never appear in the cookie or client bundle.
  return key(`findme-qa-session-v1:${c.sessionSecret}\0${c.password}`);
}

export async function createQaSession(c: QaAccessConfig, now = Date.now()): Promise<string> {
  if (!qaAccessConfigured(c)) throw new Error("QA access is not configured");
  const expires = Math.floor(now / 1000) + QA_SESSION_SECONDS;
  const nonce = encode(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `v1.${expires}.${nonce}`;
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(c), encoder.encode(payload));
  return `${payload}.${encode(new Uint8Array(signature))}`;
}

export async function validQaSession(token: string | undefined, c: QaAccessConfig, now = Date.now()): Promise<boolean> {
  if (!qaAccessConfigured(c) || !token || token.length > 200) return false;
  const match = /^(v1\.(\d{10})\.[A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[2]);
  const seconds = Math.floor(now / 1000);
  if (expires <= seconds || expires > seconds + QA_SESSION_SECONDS) return false;
  try {
    return await crypto.subtle.verify("HMAC", await sessionKey(c), decode(match[3]!), encoder.encode(match[1]!));
  } catch {
    return false;
  }
}

export function qaTokenFromRequest(req: Request, c: QaAccessConfig): string | undefined {
  return req.headers.get("cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${qaCookieName(c)}=`))?.slice(qaCookieName(c).length + 1);
}

/** A cron credential is NOT a universal bypass: only the scheduled tick, without a gameId. */
export async function qaCronAllowed(req: Request, c: QaAccessConfig): Promise<boolean> {
  const url = new URL(req.url);
  if (url.pathname !== "/api/jobs/tick" || url.search || !["GET", "POST"].includes(req.method) || !c.cronSecret) return false;
  const supplied = req.headers.get("authorization") ?? "";
  if (supplied.length > 512) return false;
  return sameSecret(`Bearer ${c.cronSecret}`, supplied, c.cronSecret);
}

/** No cross-origin redirects, backslashes, controls, or a login-loop destination. */
export function safeQaNext(value: string | null | undefined): string {
  const next = safeLocalPath(value);
  return new URL(next, "https://qa.invalid").pathname.startsWith("/qa-access") ? "/" : next;
}

export function qaDeniedResponse(c: QaAccessConfig): Response {
  return Response.json({ ok: false, code: qaAccessConfigured(c) ? "QA_ACCESS_REQUIRED" : "QA_ACCESS_UNAVAILABLE" }, {
    status: qaAccessConfigured(c) ? 401 : 503,
    headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" },
  });
}
