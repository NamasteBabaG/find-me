import { hashToken, hmacSign, hmacVerify, newSecretToken, safeEqual } from "@/lib/ids";

export const MAGIC_CONFIRM_COOKIE = "findme_magic_confirmation";
export const MAGIC_CONFIRM_TTL_SECONDS = 10 * 60;
export const MAGIC_CONFIRM_COOKIE_PATH = "/auth/magic-link";

/** A new challenge is issued on the browser opening the email, so cross-device
 * sign-in works. It is signed, short lived, and bound to that exact magic link. */
export function createMagicConfirmation(secret: string, token: string, now = Date.now()): string {
  const payload = `v1.${hashToken(token)}.${Math.floor(now / 1000) + MAGIC_CONFIRM_TTL_SECONDS}.${newSecretToken()}`;
  return `${payload}.${hmacSign(`magic-confirm:${payload}`, secret)}`;
}

export function magicConfirmationNonce(secret: string, token: string, cookie: string | undefined, now = Date.now()): string | null {
  if (!cookie || cookie.length > 300 || !token || token.length > 256) return null;
  const parts = cookie.split(".");
  if (parts.length !== 5) return null;
  const [version, tokenHash, expiry, nonce, signature] = parts as [string, string, string, string, string];
  if (version !== "v1" || !/^[a-f0-9]{64}$/.test(tokenHash) || !/^\d{10}$/.test(expiry) || !/^[A-Za-z0-9_-]{43}$/.test(nonce)) return null;
  const expires = Number(expiry), seconds = Math.floor(now / 1000);
  if (expires <= seconds || expires > seconds + MAGIC_CONFIRM_TTL_SECONDS || !safeEqual(hashToken(token), tokenHash)) return null;
  return hmacVerify(`magic-confirm:${parts.slice(0, 4).join(".")}`, signature, secret) ? nonce : null;
}

export function validMagicConfirmation(secret: string, token: string, cookie: string | undefined, submittedNonce: string, now = Date.now()): boolean {
  const expected = magicConfirmationNonce(secret, token, cookie, now);
  return expected !== null && safeEqual(expected, submittedNonce);
}
