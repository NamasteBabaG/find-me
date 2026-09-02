import { hashToken, newId, newSecretToken } from "@/lib/ids";
import type { Container } from "./container";
import { magicLinkEmail } from "./email/templates";
import { audit } from "./audit.service";
import type { Locale } from "@/i18n/config";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Soft account: the purchase email creates the user silently. */
export async function ensureUser(c: Container, rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) throw new Error("invalid email");
  return c.db.user.upsert({ where: { email }, create: { id: newId("usr"), email }, update: {} });
}

export async function createMagicLink(c: Container, userId: string, next = "/library"): Promise<string> {
  const token = newSecretToken();
  await c.db.magicLinkToken.create({
    data: { id: newId("mlt"), userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS) },
  });
  const url = new URL("/auth/magic-link", c.appUrl);
  url.searchParams.set("token", token);
  url.searchParams.set("next", next);
  return url.toString();
}

export async function requestMagicLink(c: Container, rawEmail: string, next = "/library", locale: Locale = "en"): Promise<{ ok: true } | { ok: false; reason: string }> {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) return { ok: false, reason: locale === "he" ? "כתובת המייל לא נראית תקינה." : "That email address doesn't look right." };
  const user = await ensureUser(c, email);
  await c.db.user.update({ where: { id: user.id }, data: { locale } });
  const link = await createMagicLink(c, user.id, next);
  await c.email.send(magicLinkEmail({ to: email, link, locale }));
  return { ok: true };
}

export async function consumeMagicLink(c: Container, token: string): Promise<{ sessionToken: string; userId: string; expiresAt: Date } | null> {
  const record = await c.db.magicLinkToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) return null;
  await c.db.magicLinkToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  const session = await createSession(c, record.userId);
  await c.db.user.update({ where: { id: record.userId }, data: { lastLoginAt: new Date() } });
  await audit(c, { type: "USER", id: record.userId }, "login:magic-link", "User", record.userId);
  return { ...session, userId: record.userId };
}

export async function createSession(c: Container, userId: string): Promise<{ sessionToken: string; expiresAt: Date }> {
  const sessionToken = newSecretToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await c.db.session.create({ data: { id: newId("ses"), userId, tokenHash: hashToken(sessionToken), expiresAt } });
  return { sessionToken, expiresAt };
}

export async function userFromSession(c: Container, sessionToken: string | undefined | null) {
  if (!sessionToken) return null;
  const session = await c.db.session.findUnique({ where: { tokenHash: hashToken(sessionToken) }, include: { user: true } });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  return session.user;
}

export async function destroySession(c: Container, sessionToken: string | undefined | null): Promise<void> {
  if (!sessionToken) return;
  await c.db.session.deleteMany({ where: { tokenHash: hashToken(sessionToken) } });
}
