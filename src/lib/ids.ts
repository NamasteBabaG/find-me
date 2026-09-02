import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Prefixed, URL-safe identifiers: `game_8fk2…`. The prefix makes ids
 * self-describing in logs and admin screens.
 */
export type IdPrefix =
  | "usr"
  | "chl"
  | "game"
  | "gsc"
  | "tgt"
  | "ast"
  | "ord"
  | "pev"
  | "shr"
  | "job"
  | "ply"
  | "prg"
  | "aud"
  | "mlt"
  | "ses";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomString(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length];
  }
  return out;
}

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${randomString(20)}`;
}

/** Long, unguessable token (256 bits) for share links, magic links, sessions. */
export function newSecretToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Short draft token — only guards an unpaid draft, so 128 bits is plenty. */
export function newDraftToken(): string {
  return randomBytes(16).toString("base64url");
}

/** Tokens are never stored in clear text; we store their SHA-256. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hmacSign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function hmacVerify(payload: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(hmacSign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
