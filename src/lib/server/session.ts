import { cookies, headers } from "next/headers";
import { adminEmails } from "@/lib/env";
import { getContainer } from "@/services/container";
import { userFromSession } from "@/services/auth.service";

/** Next.js glue for cookies. Everything else lives in services. */
export const SESSION_COOKIE = "findme_session";
export const DRAFT_COOKIE = "findme_draft";

export async function currentUser() {
  const jar = await cookies();
  return userFromSession(getContainer(), jar.get(SESSION_COOKIE)?.value);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email) && adminEmails().includes((email as string).toLowerCase());
}

export async function currentAdmin() {
  const user = await currentUser();
  return user && isAdminEmail(user.email) ? user : null;
}

export async function draftTokenFromCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(DRAFT_COOKIE)?.value ?? null;
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function setDraftCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(DRAFT_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
}

export async function clearDraftCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(DRAFT_COOKIE);
}

export async function requestHeaders(): Promise<Record<string, string | undefined>> {
  const h = await headers();
  const out: Record<string, string | undefined> = {};
  h.forEach((v, k) => (out[k] = v));
  return out;
}
