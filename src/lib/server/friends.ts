import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hashToken } from "@/lib/ids";
import { currentUser, SESSION_COOKIE } from "./session";
import { GuestSharingError } from "@/domain/guest-sharing";
import { guestCookieName, guestShareId } from "@/services/guest-sharing.service";
import type { Container } from "@/services/container";

export const FRIEND_HEADERS = { "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow, noarchive" };
export const friendJson = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: FRIEND_HEADERS });
export function friendFailure(error: unknown) {
  return friendJson({ ok: false, code: error instanceof GuestSharingError ? error.code : "unavailable" },
    error instanceof GuestSharingError ? error.code === "invalid-event" ? 400 : error.code === "conflict" ? 409 : error.code === "parent-required" ? 403 : 404 : 503);
}
export function friendOrigin(req: Request): boolean { return req.headers.get("origin") === new URL(req.url).origin; }
export async function friendCredential(shareToken: string) { return (await cookies()).get(guestCookieName(guestShareId(shareToken)))?.value ?? null; }
export async function friendParent(c: Pick<Container, "db">) {
  const user = await currentUser(); if (!user) return null;
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = cookie ? await c.db.session.findUnique({ where: { tokenHash: hashToken(cookie) } }) : null;
  const fresh = Boolean(session && session.userId === user.id && session.expiresAt.getTime() > Date.now()
    && session.createdAt.getTime() <= Date.now() && Date.now() - session.createdAt.getTime() <= 10 * 60_000);
  return { user, fresh };
}
